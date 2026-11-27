/**
 * 跬步地图 · 手机镜像模式（?mirror=1）
 *
 * 手机打开与电脑相同的 AIsea.html，本脚本把手机上的视图、测量、底图、
 * 地名搜索、定位与基础图层操作同步到电脑端宿主（js/map_remote.js）。
 *
 * 依赖：js/map.js 的全局 map / measureLayer / measureDraw / measureActive /
 * currentMeasureType / activateMeasurement / deactivateMeasurement。
 */
(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    if (params.get('mirror') !== '1') return;
    const URL_ACCESS = params.get('access');

    const DEFAULT_SERVER = 'https://lzy-fastapi.onrender.com';
    const MIN_ZOOM = 2;
    const MAX_ZOOM = 19;
    const VIEW_THROTTLE = 120;     // 视图同步节流（毫秒）
    const APPLY_LOCK = 350;        // 应用电脑端状态后的静默期，避免回环
    const JOIN_TIMEOUT_MS = 60_000;
    const CLIENT_TOKEN_KEY = 'xliu.remoteToken';

    const FILE_SEND_TIMEOUT = 20000; // 向电脑推送文件后，等待加载回执的时长
    const FILE_MAX_SIZE = 1.5 * 1024 * 1024; // 后端消息上限 2 MB，留出转义余量
    const FILE_EXTS = ['geojson', 'json', 'kml', 'gml'];
    const FILE_EXT_LABEL = '.geojson / .json / .kml / .gml';

    // 接入状态：idle → joining → connected / rejected / occupied / bad-access / kicked
    let joinState = 'idle';
    let joinTimerId = null;
    let joinOverlay = null;
    let socket = null;
    let ready = false;
    let hostOnline = false;
    let fileSendTimer = null;
    let pendingFileName = null;
    let pendingPush = null;   // 待电脑端确认的推送内容，确认成功后在手机本地也加载一份
    let applyingRemote = false;
    let userMoved = false;
    let viewTimer = null;
    let lastApplyAt = 0;
    let viewSyncHoldUntil = 0;
    // 本地加载推送图层触发的自动定位属于程序行为，窗口期内不回传视图、不拦截电脑端视图
    let programmaticFitUntil = 0;

    let statusEl = null;
    let accountEl = null;
    let lastMeasureFeature = null;
    let syncingMeasure = false;
    let layerPanelEl = null;
    let layerListEl = null;
    let remoteLayers = [];

    // 登录页
    let loginEl = null;
    let loginFormEl = null;
    let loginUserEl = null;
    let loginPassEl = null;
    let loginMsgEl = null;
    let loginHintEl = null;
    let loginSubmitEl = null;

    // 访客模式（不登录，仅遥控）
    let guestMode = false;

    // 接入角色：'full' 完整镜像；'laser' 仅激光（只读跟随电脑端视图）
    let myRole = null;
    let myColor = null;
    let readOnly = false;
    let pendingDataLoad = false;   // 登录后才需补载账号图层（页面加载时已登录由 user.js 处理）

    // 弹窗同步
    let lastPopupSeq = 0;
    let applyingPopup = false;

    // 激光笔
    let laserOn = false;
    let laserMode = 'point';
    let laserPointerId = null;
    let laserStartCoord = null;
    let laserStartClient = null;
    let laserMoved = false;
    let lastLaserSendAt = 0;

    document.body.classList.add('mirror-mode');

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    // 完整镜像功能（图层/弹窗/测量等）仅对 full 角色开放
    function canFull() {
        return myRole === 'full';
    }

    function serverBase() {
        const raw = window.MAP_SERVER || DEFAULT_SERVER;
        const value = String(raw).trim();
        if (!/^https?:\/\//i.test(value)) return DEFAULT_SERVER;
        return value.replace(/\/+$/, '');
    }

    function getOrGenClientToken() {
        try {
            let token = sessionStorage.getItem(CLIENT_TOKEN_KEY);
            if (token) return token;
            if (window.crypto && window.crypto.randomUUID) {
                token = 'u-' + window.crypto.randomUUID().replace(/-/g, '');
            } else {
                token = 'u-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
            }
            sessionStorage.setItem(CLIENT_TOKEN_KEY, token);
            return token;
        } catch (e) {
            return 'u-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
        }
    }

    function getDeviceInfo() {
        const ua = navigator.userAgent || '';
        let browser = '浏览器';
        if (/Edg/i.test(ua)) browser = 'Edge';
        else if (/Chrome/i.test(ua)) browser = 'Chrome';
        else if (/Safari/i.test(ua)) browser = 'Safari';
        else if (/Firefox/i.test(ua)) browser = 'Firefox';
        else if (/HarmonyOS/i.test(ua)) browser = '鸿蒙浏览器';
        let os = '系统';
        if (/Windows NT 10/i.test(ua)) os = 'Windows 10+';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/HarmonyOS/i.test(ua)) os = 'HarmonyOS';
        return {
            browser: browser, os: os,
            width: Math.floor(window.innerWidth || 0),
            height: Math.floor(window.innerHeight || 0),
            dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10
        };
    }

    function closeJoinOverlay() {
        if (joinOverlay) joinOverlay.style.display = 'none';
    }

    function showJoinOverlay(kind) {
        ensureJoinOverlay();
        joinOverlay.style.display = 'flex';
        const titleEl = joinOverlay.querySelector('[data-title]');
        const descEl = joinOverlay.querySelector('[data-desc]');
        const cancelBtn = joinOverlay.querySelector('[data-cancel]');
        const retryBtn = joinOverlay.querySelector('[data-retry]');
        cancelBtn.style.display = 'none';
        retryBtn.style.display = 'none';
        if (kind === 'waiting') {
            titleEl.textContent = '等待电脑端确认';
            descEl.textContent = '已发送接入请求，请在电脑端点击「允许」';
            cancelBtn.style.display = 'block';
        } else if (kind === 'rejected') {
            titleEl.textContent = '电脑端已拒绝';
            descEl.textContent = '电脑端未允许接入';
            retryBtn.style.display = 'block';
        } else if (kind === 'occupied') {
            titleEl.textContent = '电脑端已有手机接入';
            descEl.textContent = '同一时刻只允许一台手机接入，请稍后再试';
            retryBtn.style.display = 'block';
        } else if (kind === 'occupied-full') {
            titleEl.textContent = '完整镜像已被占用';
            descEl.textContent = '同账号只允许一台手机使用完整镜像，请先断开其他手机；也可改用其他账号或未登录，仅使用激光笔';
            retryBtn.style.display = 'block';
        } else if (kind === 'host-offline') {
            titleEl.textContent = '电脑端未连接';
            descEl.textContent = '请先在电脑端打开地图并保持页面在线，再重新扫码';
            retryBtn.style.display = 'block';
        } else if (kind === 'too-many') {
            titleEl.textContent = '接入数已达上限';
            descEl.textContent = '当前手机接入数量过多，请稍后再试';
            retryBtn.style.display = 'block';
        } else if (kind === 'bad-access') {
            titleEl.textContent = '链接已失效';
            descEl.textContent = '请在电脑端重新生成二维码后再次扫码';
            retryBtn.style.display = 'block';
        } else if (kind === 'kicked') {
            titleEl.textContent = '已被电脑端断开';
            descEl.textContent = '电脑端已重置接入状态';
            retryBtn.style.display = 'block';
        } else if (kind === 'timeout') {
            titleEl.textContent = '等待超时';
            descEl.textContent = '电脑端未在规定时间内响应，请重试';
            retryBtn.style.display = 'block';
        }
    }

    function ensureJoinOverlay() {
        if (joinOverlay) return joinOverlay;
        joinOverlay = document.createElement('div');
        joinOverlay.style.cssText = 'position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(11,31,51,0.88);backdrop-filter:blur(6px);box-sizing:border-box;';
        const card = document.createElement('div');
        card.style.cssText = 'width:100%;max-width:320px;padding:22px 20px;border-radius:14px;background:#fff;box-sizing:border-box;text-align:center;';
        card.innerHTML = [
            '<h3 data-title style="margin:0 0 6px;font-size:17px;color:#0b1f33;"></h3>',
            '<p data-desc style="margin:0 0 14px;font-size:12px;color:#6b7280;"></p>',
            '<button data-cancel type="button" style="width:100%;padding:11px 0;border:none;border-radius:8px;background:#e5e7eb;color:#374151;font-size:14px;cursor:pointer;margin-top:6px;">取消</button>',
            '<button data-retry type="button" style="width:100%;padding:11px 0;border:none;border-radius:8px;background:#1677ff;color:#fff;font-size:15px;cursor:pointer;margin-top:6px;">重试</button>'
        ].join('');
        joinOverlay.appendChild(card);
        document.body.appendChild(joinOverlay);
        card.querySelector('[data-cancel]').addEventListener('click', function () {
            closeJoinOverlay();
            if (socket && socket.connected) socket.emit('map-leave');
            if (socket) socket.disconnect();
            joinState = 'idle';
        });
        card.querySelector('[data-retry]').addEventListener('click', function () {
            closeJoinOverlay();
            retryJoin();
        });
        return joinOverlay;
    }

    function retryJoin() {
        if (!URL_ACCESS) { window.location.reload(); return; }
        joinState = 'idle';
        if (socket) { try { socket.disconnect(); } catch (e) {} socket = null; }
        connectMirror();
    }

    function setStatus(text, tone) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'mirror-status' + (tone ? ' is-' + tone : '');
    }

    function refreshStatus() {
        if (!ready) {
            setStatus('未连接中继', 'offline');
            return;
        }
        if (joinState !== 'connected') {
            if (joinState === 'joining') setStatus('等待电脑端确认…', 'waiting');
            return;
        }
        if (!hostOnline) {
            setStatus('电脑端未连接', 'waiting');
            return;
        }
        if (myRole === 'laser') {
            setStatus('仅激光 · 只读跟随电脑端', 'online');
            return;
        }
        setStatus('已同步到电脑', 'online');
    }

    function notify(text, tone) {
        setStatus(text, tone);
        window.setTimeout(refreshStatus, 2400);
    }

    function send(payload) {
        if (joinState !== 'connected') return;
        // 仅激光角色只允许激光指令，其余功能不发送
        if (!canFull() && payload && payload.action !== 'laser') return;
        if (socket && socket.connected) socket.emit('map-cmd', payload);
    }

    // ---------------- 手机推送图层文件到电脑 ----------------
    function decodeFileText(buffer) {
        // 国内 GIS 导出的 KML 常见 GBK，UTF-8 严格解码失败时回退
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch (e) {
            try {
                return new TextDecoder('gb18030').decode(buffer);
            } catch (e2) {
                return new TextDecoder('utf-8').decode(buffer);
            }
        }
    }

    function handlePickedFile(file) {
        if (!file) return;
        if (!socket || !socket.connected || joinState !== 'connected') {
            notify('尚未接入电脑端', 'error');
            return;
        }
        if (!canFull()) {
            notify('仅激光模式不支持发送文件', 'error');
            return;
        }
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (FILE_EXTS.indexOf(ext) < 0) {
            notify('仅支持 ' + FILE_EXT_LABEL, 'error');
            return;
        }
        if (file.size > FILE_MAX_SIZE) {
            notify('文件 ' + (file.size / 1024 / 1024).toFixed(1) +
                ' MB 超过 1.5 MB 上限，请改用电脑端导入', 'error');
            return;
        }
        if (pendingFileName) {
            notify('正在发送 ' + pendingFileName + '，请稍候', 'waiting');
            return;
        }

        setStatus('正在读取 ' + file.name + '…', 'waiting');
        const reader = new FileReader();
        reader.onerror = function () {
            notify('读取文件失败', 'error');
        };
        reader.onload = function () {
            const text = decodeFileText(reader.result);
            pendingFileName = file.name;
            pendingPush = { name: file.name, ext: ext, text: text };
            setStatus('正在发送 ' + file.name + '（' +
                Math.max(1, Math.round(file.size / 1024)) + ' KB）…', 'waiting');
            send({ action: 'push-file', name: file.name, size: file.size, text: text });
            if (fileSendTimer) window.clearTimeout(fileSendTimer);
            fileSendTimer = window.setTimeout(function () {
                fileSendTimer = null;
                if (!pendingFileName) return;
                pendingFileName = null;
                pendingPush = null;
                notify('发送超时，请确认电脑端在线后重试', 'error');
            }, FILE_SEND_TIMEOUT);
        };
        reader.readAsArrayBuffer(file);
    }

    function localLayerArray() {
        if (typeof localGeoJsonLayers !== 'undefined' && Array.isArray(localGeoJsonLayers)) {
            return localGeoJsonLayers;
        }
        return Array.isArray(window.localGeoJsonLayers) ? window.localGeoJsonLayers : null;
    }

    // 电脑端确认加载成功后，手机本地也加载同一份，避免"电脑端有、手机端没有"
    function loadFileOnPhone(text, name, ext) {
        try {
            programmaticFitUntil = performance.now() + 1200;
            if (ext === 'geojson' || ext === 'json') {
                if (typeof loadLocalGeoJSON !== 'function') return;
                loadLocalGeoJSON(JSON.parse(text), name, { fileName: name, format: 'geojson', autoFit: true });
            } else if (ext === 'kml') {
                if (typeof loadLocalKML !== 'function') return;
                loadLocalKML(text, name, { fileName: name, format: 'kml' });
            } else if (ext === 'gml') {
                if (typeof loadLocalGML !== 'function') return;
                loadLocalGML(text, name);
            } else {
                return;
            }
            const items = localLayerArray();
            const item = items && items.length ? items[items.length - 1] : null;
            if (item) item.mirrorPushed = true;
        } catch (e) {
            console.warn('[地图镜像] 手机本地加载推送图层失败', e);
        }
    }

    // 手机端为「发文件」保留的副本：电脑端移除后一并清理，避免手机残留
    function syncPushedLocalLayers(layers) {
        const items = localLayerArray();
        if (!items || !Array.isArray(layers)) return;
        const hostNames = {};
        layers.forEach(function (l) {
            if (l && l.kind === 'local' && typeof l.name === 'string') hostNames[l.name] = true;
        });
        let changed = false;
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (!item || !item.mirrorPushed) continue;
            if (hostNames[String(item.name)]) continue;
            if (item.layer && window.map) window.map.removeLayer(item.layer);
            items.splice(i, 1);
            changed = true;
        }
        if (changed && typeof createLayerControl === 'function') createLayerControl();
    }

    // ---------------- 视图同步 ----------------
    function scheduleView() {
        if (!canFull()) return;
        if (applyingRemote) return;
        if (performance.now() < programmaticFitUntil) return;
        userMoved = true;
        if (performance.now() < viewSyncHoldUntil) return;
        if (viewTimer) return;
        const gap = APPLY_LOCK - (performance.now() - lastApplyAt);
        viewTimer = window.setTimeout(function () {
            viewTimer = null;
            sendView();
        }, gap > 0 ? gap + 20 : VIEW_THROTTLE);
    }

    function sendView() {
        if (!window.map || !window.ol || performance.now() < viewSyncHoldUntil) return;
        if (!canFull()) return;
        const view = window.map.getView();
        const center = window.ol.proj.toLonLat(view.getCenter());
        send({
            action: 'view',
            center: [
                Number(center[0].toFixed(6)),
                Number(center[1].toFixed(6))
            ],
            zoom: Number(view.getZoom().toFixed(2)),
            rotation: Number(view.getRotation().toFixed(3))
        });
    }

    function applyRemoteState(state) {
        if (!window.map || !window.ol || !state) return;
        applyingRemote = true;
        try {
            const center = state.center;
            if (Array.isArray(center) && center.length >= 2) {
                const lon = Number(center[0]);
                const lat = Number(center[1]);
                if (Number.isFinite(lon) && Number.isFinite(lat)) {
                    const view = window.map.getView();
                    const zoom = Number(state.zoom);
                    const rotation = Number(state.rotation);
                    view.cancelAnimations();
                    if (Number.isFinite(rotation)) view.setRotation(rotation);
                    if (Number.isFinite(zoom)) view.setZoom(clamp(zoom, MIN_ZOOM, MAX_ZOOM));
                    view.setCenter(window.ol.proj.fromLonLat([lon, lat]));
                }
            }
            if (state.base === 'imagery' || state.base === 'vector') {
                const btn = document.getElementById('switchBaseMapBtn');
                if (btn && btn.classList.contains('active') !== (state.base === 'imagery')) {
                    btn.click();
                }
            }
        } finally {
            applyingRemote = false;
            lastApplyAt = performance.now();
        }
    }

    // ---------------- 测量同步 ----------------
    function emitMeasure(feature) {
        const geom = feature && feature.getGeometry();
        if (!geom) return;
        const type = geom.getType() === 'Polygon' ? 'area' : 'length';
        send({
            action: 'measure-sync',
            type: type,
            coords: geom.getCoordinates()
        });
    }

    function hookMeasure() {
        if (typeof measureLayer === 'undefined') {
            window.setTimeout(hookMeasure, 400);
            return;
        }
        const source = measureLayer.getSource();

        // 完成一次测量：自动移除上一次，只保留最新结果
        source.on('addfeature', function (evt) {
            if (syncingMeasure) return;
            const feature = evt.feature;
            if (lastMeasureFeature && lastMeasureFeature !== feature) {
                syncingMeasure = true;
                source.removeFeature(lastMeasureFeature);
                syncingMeasure = false;
            }
            lastMeasureFeature = feature;
            emitMeasure(feature);
        });

        // 停测 / 清除：同步清空电脑端
        source.on('clear', function () {
            if (syncingMeasure) return;
            lastMeasureFeature = null;
            send({ action: 'measure-clear' });
        });
    }

    // ---------------- 地名搜索与手机定位 ----------------
    function hookSearch() {
        if (!window.TiandituSearch || typeof window.TiandituSearch.selectPoi !== 'function') return;
        const originalSelect = window.TiandituSearch.selectPoi;
        window.TiandituSearch.selectPoi = function (poi) {
            userMoved = true;
            viewSyncHoldUntil = performance.now() + 900;
            if (viewTimer) {
                window.clearTimeout(viewTimer);
                viewTimer = null;
            }
            originalSelect(poi);
            window.setTimeout(function () {
                if (window.map && !window.map.getView().getAnimating()) sendView();
            }, 920);
            const lonlat = poi && (poi.lonlat || poi.hotPointLonLat);
            if (!lonlat) return;
            const parts = String(lonlat).trim().split(/[\s,]+/);
            const lon = Number(parts[0]);
            const lat = Number(parts[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
            send({
                action: 'poi-sync',
                name: poi.name || '搜索结果',
                center: [lon, lat]
            });
        };
    }

    function locatePhone() {
        if (!navigator.geolocation) {
            notify('当前浏览器不支持手机定位', 'error');
            return;
        }
        setStatus('正在获取手机位置…', 'waiting');
        navigator.geolocation.getCurrentPosition(function (pos) {
            const lon = pos.coords.longitude;
            const lat = pos.coords.latitude;
            const coordinate = window.ol.proj.fromLonLat([lon, lat]);
            if (typeof positionLayer !== 'undefined') {
                const source = positionLayer.getSource();
                source.clear();
                source.addFeature(new window.ol.Feature({
                    geometry: new window.ol.geom.Point(coordinate)
                }));
            }
            const view = window.map.getView();
            view.cancelAnimations();
            view.setCenter(coordinate);
            view.setZoom(Math.max(view.getZoom(), 15));
            send({ action: 'locate', lon: lon, lat: lat });
            notify('手机位置已同步到电脑', 'online');
        }, function (error) {
            notify('定位失败：' + (error.message || '请检查定位权限'), 'error');
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    }

    // ---------------- 电脑端基础图层管理 ----------------
    function requestLayers() {
        if (!canFull()) return;
        send({ action: 'layers', op: 'list' });
    }

    function closeLayerPanel() {
        if (layerPanelEl) layerPanelEl.style.display = 'none';
        const btn = document.getElementById('mirrorLayersBtn');
        if (btn) btn.classList.remove('active');
    }

    function openLayerPanel() {
        if (!layerPanelEl || !canFull()) return;
        if (window.TiandituSearch && typeof window.TiandituSearch.close === 'function') {
            window.TiandituSearch.close();
        }
        layerPanelEl.style.display = 'block';
        const btn = document.getElementById('mirrorLayersBtn');
        if (btn) btn.classList.add('active');
        renderLayerList();
        requestLayers();
    }

    function renderLayerList() {
        if (!layerListEl || !layerPanelEl || layerPanelEl.style.display === 'none') return;
        layerListEl.innerHTML = '';
        if (!remoteLayers.length) {
            const empty = document.createElement('div');
            empty.className = 'mirror-layer-empty';
            empty.textContent = '电脑端暂无配置或本地图层';
            layerListEl.appendChild(empty);
            return;
        }

        [
            { kind: 'dynamic', title: '配置图层' },
            { kind: 'local', title: '本地图层' }
        ].forEach(function (group) {
            const items = remoteLayers.filter(function (layer) { return layer.kind === group.kind; });
            if (!items.length) return;
            const title = document.createElement('div');
            title.className = 'mirror-layer-group';
            title.textContent = group.title;
            layerListEl.appendChild(title);

            items.forEach(function (layer) {
                const row = document.createElement('div');
                row.className = 'mirror-layer-row';

                const label = document.createElement('label');
                label.className = 'mirror-layer-name';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = !!layer.visible;
                checkbox.addEventListener('change', function () {
                    send({
                        action: 'layers',
                        op: 'visibility',
                        id: layer.id,
                        visible: checkbox.checked
                    });
                });
                const name = document.createElement('span');
                name.textContent = layer.name;
                name.title = layer.name;
                label.appendChild(checkbox);
                label.appendChild(name);

                const zoomBtn = document.createElement('button');
                zoomBtn.type = 'button';
                zoomBtn.textContent = '缩放';
                zoomBtn.addEventListener('click', function () {
                    send({ action: 'layers', op: 'zoom', id: layer.id });
                    notify('已请求电脑缩放至图层', 'online');
                });

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'is-danger';
                removeBtn.textContent = '移除';
                removeBtn.addEventListener('click', function () {
                    if (!window.confirm('仅从电脑当前地图移除“' + layer.name + '”？')) return;
                    send({ action: 'layers', op: 'remove', id: layer.id });
                    notify('已请求移除图层', 'online');
                });

                row.appendChild(label);
                row.appendChild(zoomBtn);
                row.appendChild(removeBtn);
                layerListEl.appendChild(row);
            });
        });
    }

    // ---------------- 界面 ----------------
    function syncToolbar() {
        const active = typeof measureActive !== 'undefined' ? measureActive : false;
        const type = typeof currentMeasureType !== 'undefined' ? currentMeasureType : null;
        const lenBtn = document.getElementById('mirrorLengthBtn');
        const areaBtn = document.getElementById('mirrorAreaBtn');
        if (lenBtn) lenBtn.classList.toggle('active', active && type === 'length');
        if (areaBtn) areaBtn.classList.toggle('active', active && type === 'area');
        document.body.classList.toggle('mirror-measuring', !!active);
    }

    function watchMeasureButtons() {
        if (!window.MutationObserver) return;
        const opts = { attributes: true, attributeFilter: ['class'] };
        ['measureMainBtn', 'measureLengthBtn', 'measureAreaBtn'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) new MutationObserver(syncToolbar).observe(el, opts);
        });
    }

    function activateMeasure(type) {
        if (typeof window.activateMeasurement !== 'function') return;
        if (laserOn) setLaser(false);
        if (typeof measureActive !== 'undefined' && measureActive &&
            typeof currentMeasureType !== 'undefined' && currentMeasureType === type) {
            return;
        }
        window.activateMeasurement(type);
        syncToolbar();
    }

    function bindButtons() {
        const layersBtn = document.getElementById('mirrorLayersBtn');
        if (layersBtn) {
            layersBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                if (layerPanelEl && layerPanelEl.style.display !== 'none') closeLayerPanel();
                else openLayerPanel();
            });
        }
        const layerClose = document.getElementById('mirrorLayerClose');
        if (layerClose) layerClose.addEventListener('click', closeLayerPanel);
        const layerRefresh = document.getElementById('mirrorLayerRefresh');
        if (layerRefresh) {
            layerRefresh.addEventListener('click', function () {
                requestLayers();
                notify('正在刷新电脑图层…', 'waiting');
            });
        }

        const searchBtn = document.getElementById('mirrorSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                closeLayerPanel();
                if (window.TiandituSearch && typeof window.TiandituSearch.open === 'function') {
                    window.TiandituSearch.open();
                } else {
                    notify('地名搜索模块未加载', 'error');
                }
            });
        }

        const locateBtn = document.getElementById('mirrorLocateBtn');
        if (locateBtn) locateBtn.addEventListener('click', locatePhone);

        const baseBtn = document.getElementById('mirrorBaseBtn');
        if (baseBtn) {
            baseBtn.addEventListener('click', function () {
                const switchBtn = document.getElementById('switchBaseMapBtn');
                if (switchBtn) switchBtn.click();
                send({
                    action: 'base-set',
                    base: switchBtn && switchBtn.classList.contains('active') ? 'imagery' : 'vector'
                });
            });
        }

        const openFileBtn = document.getElementById('mirrorOpenFileBtn');
        if (openFileBtn) {
            openFileBtn.addEventListener('click', function () {
                if (!socket || !socket.connected || joinState !== 'connected') {
                    notify('尚未接入电脑端', 'error');
                    return;
                }
                // 手机端真实点击，触发手机自己的文件选择器
                const input = document.getElementById('mirrorFileInput');
                if (input) input.click();
            });
        }

        const fileInput = document.getElementById('mirrorFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = '';   // 允许重复选同一个文件
                handlePickedFile(file);
            });
        }

        const lenBtn = document.getElementById('mirrorLengthBtn');
        if (lenBtn) lenBtn.addEventListener('click', function () { activateMeasure('length'); });

        const areaBtn = document.getElementById('mirrorAreaBtn');
        if (areaBtn) areaBtn.addEventListener('click', function () { activateMeasure('area'); });

        const undoBtn = document.getElementById('mirrorUndoBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', function () {
                if (typeof measureDraw !== 'undefined' && measureDraw) {
                    measureDraw.removeLastPoint();
                }
            });
        }

        const finishBtn = document.getElementById('mirrorFinishBtn');
        if (finishBtn) {
            finishBtn.addEventListener('click', function () {
                if (typeof measureDraw !== 'undefined' && measureDraw) {
                    measureDraw.finishDrawing();
                }
            });
        }

        const stopBtn = document.getElementById('mirrorStopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', function () {
                if (typeof window.deactivateMeasurement === 'function') {
                    window.deactivateMeasurement();
                }
                syncToolbar();
            });
        }
    }

    // ---------------- 登录（镜像页与电脑端各自登录） ----------------
    function hasToken() {
        try {
            return !!localStorage.getItem('access_token');
        } catch (e) {
            return false;
        }
    }

    function getAuthToken() {
        try {
            return localStorage.getItem('access_token') || '';
        } catch (e) {
            return '';
        }
    }

    function updateAccountLabel() {
        if (!accountEl) return;
        if (guestMode) {
            accountEl.textContent = '未登录 · 仅遥控';
            return;
        }
        let name = '';
        try {
            name = localStorage.getItem('username') || '';
        } catch (e) {
            name = '';
        }
        let text = hasToken() ? ('账号：' + (name || '已登录')) : '未登录';
        if (myRole === 'full') text += ' · 完整镜像';
        else if (myRole === 'laser') text += ' · 仅激光';
        accountEl.textContent = text;
    }

    // 角色确定后切换界面：laser 隐藏工具栏、只读跟随、显示激光按钮
    function applyRoleUI() {
        const laserOnly = myRole === 'laser';
        readOnly = laserOnly;
        document.body.classList.toggle('mirror-laser-only', laserOnly);
        const onlyBtn = document.getElementById('mirrorLaserOnlyToggle');
        if (onlyBtn) onlyBtn.style.display = laserOnly ? 'inline-flex' : 'none';
        if (myColor) document.body.style.setProperty('--my-laser-color', myColor);
        if (laserOnly) {
            closeLayerPanel();
            setLayersButtonHidden(true);
        }
        setNavigationEnabled(!readOnly && !laserOn);
        updateAccountLabel();
    }

    function setLoginMsg(text) {
        if (loginMsgEl) loginMsgEl.textContent = text || '';
    }

    function showLogin(show) {
        if (!loginEl) return;
        loginEl.style.display = show ? 'flex' : 'none';
        if (show) {
            setLoginMsg('');
            window.setTimeout(function () {
                if (loginUserEl && !loginUserEl.value) loginUserEl.focus();
            }, 120);
        }
    }

    function enterGuest() {
        guestMode = true;
        document.body.classList.add('mirror-guest');
        showLogin(false);
        updateAccountLabel();
        setLayersButtonHidden(true);
        connectMirror();
        notify('仅遥控模式：两端数据不同步', 'waiting');
    }

    function setLayersButtonHidden(hidden) {
        const btn = document.getElementById('mirrorLayersBtn');
        if (btn) btn.style.display = hidden ? 'none' : '';
        if (hidden) closeLayerPanel();
    }

    function bindLogin() {
        loginEl = document.getElementById('mirrorLogin');
        loginFormEl = document.getElementById('mirrorLoginForm');
        loginUserEl = document.getElementById('mirrorLoginUser');
        loginPassEl = document.getElementById('mirrorLoginPass');
        loginMsgEl = document.getElementById('mirrorLoginMsg');
        loginHintEl = document.getElementById('mirrorLoginHint');
        loginSubmitEl = loginFormEl && loginFormEl.querySelector('.mirror-login-submit');
        updateAccountLabel();
        showLogin(!hasToken());
        const guestBtn = document.getElementById('mirrorGuestBtn');
        if (guestBtn) guestBtn.addEventListener('click', enterGuest);
        if (!loginFormEl) return;

        loginFormEl.addEventListener('submit', function (event) {
            event.preventDefault();
            const username = loginUserEl ? loginUserEl.value.trim() : '';
            const password = loginPassEl ? loginPassEl.value : '';
            if (!username || !password) {
                setLoginMsg('请输入用户名和密码');
                return;
            }
            setLoginMsg('登录中…');
            if (loginSubmitEl) loginSubmitEl.disabled = true;
            const base = window.API_BASE_URL || '';
            window.fetch(base + '/api/login/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            }).then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    if (!res.ok) {
                        const detail = data && (data.detail || data.message);
                        throw new Error(detail || '登录失败（' + res.status + '）');
                    }
                    return data;
                });
            }).then(function (data) {
                if (!data || !data.access_token) throw new Error('登录响应缺少令牌');
                try {
                    localStorage.setItem('access_token', data.access_token);
                    localStorage.setItem('username', username);
                } catch (e) { /* 忽略存储失败 */ }
                pendingDataLoad = true;   // 角色确认为 full 后再补载账号图层
                setLoginMsg('登录成功，正在接入…');
                updateAccountLabel();
                connectMirror();
                window.setTimeout(function () {
                    showLogin(false);
                    notify('正在接入电脑端', 'waiting');
                }, 300);
            }).catch(function (error) {
                setLoginMsg((error && error.message) || '网络错误，请重试');
            }).then(function () {
                if (loginSubmitEl) loginSubmitEl.disabled = false;
            });
        });

        // Token 失效时（user.js 会清除登录状态）断开中继并重新显示登录页
        window.setInterval(function () {
            if (guestMode) return;
            if (hasToken()) return;
            if (socket) {
                socket.disconnect();
                socket = null;
                ready = false;
                hostOnline = false;
            }
            if (loginEl && loginEl.style.display === 'none') {
                updateAccountLabel();
                showLogin(true);
            }
        }, 1500);
    }

    // ---------------- 弹窗同步（电脑 <-> 手机） ----------------
    function hookPopup() {
        if (!window.map) return;
        if (typeof popup === 'undefined' || !popup || typeof popup.on !== 'function') return;
        // 点「×」关闭弹窗不会产生地图 click，统一监听 overlay 位置变化
        popup.on('change:position', function () {
            if (!canFull()) return;
            if (applyingPopup) return;
            if (laserOn) return;
            if (typeof measureActive !== 'undefined' && measureActive) return;
            const pos = popup.getPosition();
            if (!pos) {
                send({ action: 'popup', open: false });
                return;
            }
            const ll = window.ol.proj.toLonLat(pos);
            send({
                action: 'popup',
                open: true,
                lon: Number(ll[0].toFixed(6)),
                lat: Number(ll[1].toFixed(6))
            });
        });
    }

    function applyRemotePopup(info) {
        if (!canFull()) return;
        if (!info || typeof info !== 'object') return;
        const seq = Number(info.seq);
        if (!Number.isFinite(seq) || seq === lastPopupSeq) return;
        lastPopupSeq = seq;
        applyingPopup = true;
        try {
            if (info.open !== true) {
                if (typeof closePopup === 'function') closePopup();
                return;
            }
            const lon = Number(info.lon);
            const lat = Number(info.lat);
            if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
                Math.abs(lon) > 180 || Math.abs(lat) > 90) return;
            const coordinate = window.ol.proj.fromLonLat([lon, lat]);
            const pixel = window.map.getPixelFromCoordinate(coordinate);
            if (!pixel) return;
            const feature = window.map.forEachFeatureAtPixel(pixel, function (f) { return f; }, {
                layerFilter: function (layer) {
                    if (typeof footprintGenLayer !== 'undefined' && layer === footprintGenLayer) return false;
                    if (typeof positionLayer !== 'undefined' && layer === positionLayer) return false;
                    return true;
                }
            });
            if (feature && typeof showFeaturePopup === 'function') {
                showFeaturePopup(feature, coordinate);
            } else if (typeof closePopup === 'function') {
                closePopup();
            }
        } finally {
            applyingPopup = false;
        }
    }

    // 电脑端图层显隐同步到手机本地同名图层
    function applyRemoteLayerVisibility(layers) {
        if (!canFull()) return;
        if (!Array.isArray(layers)) return;
        const groups = [
            { kind: 'dynamic', items: Array.isArray(window.dynamicLayers) ? window.dynamicLayers : [] },
            {
                kind: 'local',
                items: typeof localGeoJsonLayers !== 'undefined' && Array.isArray(localGeoJsonLayers)
                    ? localGeoJsonLayers
                    : (Array.isArray(window.localGeoJsonLayers) ? window.localGeoJsonLayers : [])
            }
        ];
        layers.forEach(function (remote) {
            if (!remote || typeof remote.name !== 'string') return;
            const group = groups.find(function (g) { return g.kind === remote.kind; });
            if (!group) return;
            const item = group.items.find(function (it) {
                return it && String(it.name) === remote.name;
            });
            if (item && item.layer && typeof item.layer.setVisible === 'function') {
                const next = !!remote.visible;
                if ((item.layer.getVisible() !== false) !== next) {
                    item.layer.setVisible(next);
                }
            }
        });
    }

    // ---------------- 激光笔（手机 -> 电脑） ----------------
    function viewportPixel(evt) {
        const rect = window.map.getViewport().getBoundingClientRect();
        return [evt.clientX - rect.left, evt.clientY - rect.top];
    }

    function eventLonLat(evt) {
        const coordinate = window.map.getCoordinateFromPixel(viewportPixel(evt));
        const ll = window.ol.proj.toLonLat(coordinate);
        return {
            coord: coordinate,
            lon: Number(ll[0].toFixed(6)),
            lat: Number(ll[1].toFixed(6))
        };
    }

    // 激光指令：发往电脑端的同时在本地渲染，保证手机屏幕同步显示
    function emitLaser(payload) {
        if (!payload) return;
        if (myColor && payload.action === 'laser') {
            payload = Object.assign({}, payload, { color: myColor });
        }
        send(payload);
        if (window.MapLaser && typeof window.MapLaser.apply === 'function') {
            window.MapLaser.apply(payload);
        }
    }

    function sendCircle(centerCoord) {
        if (!laserStartCoord || !centerCoord || !window.ol.sphere) return;
        const c0 = window.ol.proj.toLonLat(laserStartCoord);
        const c1 = window.ol.proj.toLonLat(centerCoord);
        const radius = window.ol.sphere.getDistance(c0, c1);
        if (!Number.isFinite(radius) || radius < 1) return;
        const latRad = c0[1] * Math.PI / 180;
        const cosLat = Math.cos(latRad);
        const ring = [];
        for (let i = 0; i < 48; i++) {
            const angle = i / 48 * Math.PI * 2;
            const dLat = (radius * Math.cos(angle)) / 111320;
            const dLon = (radius * Math.sin(angle)) / (111320 * (Math.abs(cosLat) < 0.01 ? 0.01 : cosLat));
            ring.push([Number((c0[0] + dLon).toFixed(6)), Number((c0[1] + dLat).toFixed(6))]);
        }
        emitLaser({ action: 'laser', mode: 'circle', phase: 'path', coords: ring });
    }

    // 只读/绘制模式下禁用地图平移缩放交互
    function setNavigationEnabled(enabled) {
        if (!window.map || !window.ol) return;
        window.map.getInteractions().forEach(function (interaction) {
            const isNav =
                interaction instanceof window.ol.interaction.DragPan ||
                interaction instanceof window.ol.interaction.MouseWheelZoom ||
                interaction instanceof window.ol.interaction.PinchZoom ||
                interaction instanceof window.ol.interaction.DoubleClickZoom ||
                interaction instanceof window.ol.interaction.KeyboardPan ||
                interaction instanceof window.ol.interaction.KeyboardZoom;
            if (isNav) interaction.setActive(!!enabled);
        });
    }

    function setLaser(on) {
        laserOn = !!on;
        document.body.classList.toggle('laser-on', laserOn);
        const btn = document.getElementById('mirrorLaserBtn');
        if (btn) btn.classList.toggle('active', laserOn);
        const onlyBtn = document.getElementById('mirrorLaserOnlyToggle');
        if (onlyBtn) onlyBtn.classList.toggle('active', laserOn);
        if (!window.map) return;
        if (laserOn) {
            if (typeof measureActive !== 'undefined' && measureActive &&
                typeof window.deactivateMeasurement === 'function') {
                window.deactivateMeasurement();
                syncToolbar();
            }
            setNavigationEnabled(false);
            notify('激光已开启：点=光点，拖=划线；再次点击「激光」退出', 'waiting');
        } else {
            setNavigationEnabled(!readOnly);
            laserPointerId = null;
            laserStartCoord = null;
            emitLaser({ action: 'laser', phase: 'clear' });
        }
    }

    function laserDown(evt) {
        if (!laserOn || !window.map) return;
        evt.stopImmediatePropagation();
        evt.preventDefault();
        laserPointerId = evt.pointerId;
        laserStartClient = [evt.clientX, evt.clientY];
        laserMoved = false;
        lastLaserSendAt = 0;
        const point = eventLonLat(evt);
        laserStartCoord = point.coord;
        if (laserMode === 'line') {
            emitLaser({ action: 'laser', mode: 'line', phase: 'start', coords: [[point.lon, point.lat]] });
        }
        if (laserMode === 'point' && window.MapLaser) {
            // 点模式：按下即在本地显示高亮光点，抬起时再同步给电脑端
            window.MapLaser.apply({
                action: 'laser', mode: 'point',
                coords: [[point.lon, point.lat]],
                color: myColor || undefined
            });
        }
        try {
            window.map.getViewport().setPointerCapture(evt.pointerId);
        } catch (e) { /* 忽略 */ }
    }

    function laserMove(evt) {
        if (!laserOn || evt.pointerId !== laserPointerId || !window.map) return;
        evt.stopImmediatePropagation();
        evt.preventDefault();
        const dx = evt.clientX - (laserStartClient ? laserStartClient[0] : evt.clientX);
        const dy = evt.clientY - (laserStartClient ? laserStartClient[1] : evt.clientY);
        if (Math.sqrt(dx * dx + dy * dy) > 6) laserMoved = true;
        if (laserMode === 'point') return;
        const now = performance.now();
        if (now - lastLaserSendAt < 80) return;
        lastLaserSendAt = now;
        const point = eventLonLat(evt);
        if (laserMode === 'line') {
            emitLaser({ action: 'laser', mode: 'line', phase: 'move', coords: [[point.lon, point.lat]] });
        } else {
            sendCircle(point.coord);
        }
    }

    function laserUp(evt) {
        if (!laserOn || evt.pointerId !== laserPointerId || !window.map) return;
        evt.stopImmediatePropagation();
        evt.preventDefault();
        const point = eventLonLat(evt);
        if (laserMode === 'point') {
            if (!laserMoved) {
                emitLaser({ action: 'laser', mode: 'point', coords: [[point.lon, point.lat]] });
                if (navigator.vibrate) navigator.vibrate(10);
            }
        } else if (laserMode === 'circle') {
            sendCircle(point.coord);
        } else {
            emitLaser({ action: 'laser', mode: 'line', phase: 'end', coords: [[point.lon, point.lat]] });
        }
        laserPointerId = null;
        laserStartCoord = null;
        laserStartClient = null;
        try {
            window.map.getViewport().releasePointerCapture(evt.pointerId);
        } catch (e) { /* 忽略 */ }
    }

    function bindLaser() {
        const btn = document.getElementById('mirrorLaserBtn');
        if (btn) {
            btn.addEventListener('click', function () { setLaser(!laserOn); });
        }
        const onlyBtn = document.getElementById('mirrorLaserOnlyToggle');
        if (onlyBtn) {
            onlyBtn.addEventListener('click', function () { setLaser(!laserOn); });
        }
        const modes = document.querySelectorAll('.mirror-laser-mode');
        modes.forEach(function (modeBtn) {
            modeBtn.addEventListener('click', function () {
                laserMode = modeBtn.getAttribute('data-laser-mode') || 'point';
                modes.forEach(function (other) {
                    other.classList.toggle('active', other === modeBtn);
                });
                emitLaser({ action: 'laser', phase: 'clear' });
            });
        });
        const clearBtn = document.getElementById('mirrorLaserClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                emitLaser({ action: 'laser', phase: 'clear' });
                notify('已清除电脑端激光', 'online');
            });
        }
        if (!window.map) return;
        const viewport = window.map.getViewport();
        viewport.addEventListener('pointerdown', laserDown, true);
        viewport.addEventListener('pointermove', laserMove, true);
        viewport.addEventListener('pointerup', laserUp, true);
        viewport.addEventListener('pointercancel', laserUp, true);
        // 激光模式下不触发地图点击（避免手机端误弹要素框）
        viewport.addEventListener('click', function (evt) {
            if (!laserOn) return;
            evt.stopImmediatePropagation();
            evt.preventDefault();
        }, true);
    }

    // ---------------- 连接 ----------------
    function connectMirror() {
        if (socket) return;
        if (typeof window.io !== 'function') {
            setStatus('socket.io 未加载', 'error');
            return;
        }
        ensureJoinOverlay();

        socket = window.io(serverBase() + '/map', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 12000
        });

        socket.on('connect', function () {
            ready = true;
            // 终止态（被拒/被踢/链接失效）不再自动重试，保留提示，避免反复弹审批
            if (joinState === 'occupied' || joinState === 'bad-access' ||
                joinState === 'rejected' || joinState === 'kicked') {
                socket.disconnect();
                return;
            }
            if (!URL_ACCESS) {
                joinState = 'bad-access';
                setStatus('链接无效', 'error');
                showJoinOverlay('bad-access');
                return;
            }
            joinState = 'joining';
            setStatus('等待电脑端确认…', 'waiting');
            showJoinOverlay('waiting');
            if (joinTimerId) window.clearTimeout(joinTimerId);
            joinTimerId = window.setTimeout(function () {
                if (joinState === 'joining') {
                    joinState = 'timeout';
                    showJoinOverlay('timeout');
                    setStatus('等待超时', 'error');
                }
            }, JOIN_TIMEOUT_MS);

            socket.emit('map-join', {
                role: 'controller',
                access: URL_ACCESS,
                clientToken: getOrGenClientToken(),
                authToken: getAuthToken(),
                device: getDeviceInfo()
            });
        });

        socket.on('disconnect', function () {
            ready = false;
            hostOnline = false;
            if (joinState === 'connected' || joinState === 'joining' || joinState === 'idle') {
                closeJoinOverlay();
                joinState = 'idle';
            }
            if (joinTimerId) { window.clearTimeout(joinTimerId); joinTimerId = null; }
            if (fileSendTimer) { window.clearTimeout(fileSendTimer); fileSendTimer = null; }
            pendingFileName = null;
            pendingPush = null;
            refreshStatus();
        });

        socket.on('connect_error', function () {
            ready = false;
            setStatus('中继连接失败，正在重试…', 'error');
        });

        socket.on('map-presence', function (payload) {
            if (!payload || typeof payload !== 'object') return;
            const wasOnline = hostOnline;
            hostOnline = !!payload.host;
            if (hostOnline && !wasOnline && joinState === 'connected') requestLayers();
            refreshStatus();
        });

        socket.on('map-state', function (state) {
            if (!state) return;
            // 仅激光：只读跟随电脑端视图；正在绘制的瞬间暂停跟随，避免地图在手指下移动
            if (myRole === 'laser') {
                if (!(laserOn && laserPointerId)) applyRemoteState(state);
                return;
            }
            // 完整镜像：本地加载图层后的自动定位窗口期内，忽略电脑端可能滞后的视图状态
            if (!userMoved && performance.now() >= programmaticFitUntil) applyRemoteState(state);
            if (canFull() && Array.isArray(state.layers)) {
                remoteLayers = state.layers;
                renderLayerList();
                applyRemoteLayerVisibility(state.layers);
                syncPushedLocalLayers(state.layers);
            }
            if (canFull() && state.popup) applyRemotePopup(state.popup);
        });

        socket.on('map-cmd-result', function (res) {
            if (!res || typeof res !== 'object') return;
            if (res.ok === false && res.reason === 'host-offline') {
                setStatus('电脑端未连接，操作未送达', 'error');
            } else if (res.ok === false && res.reason === 'not-authorized') {
                setStatus('尚未接入电脑端', 'error');
            } else if (res.ok === false && res.reason === 'forbidden') {
                setStatus('仅激光模式不支持该操作', 'error');
            }
        });

        // 电脑端加载手机推送文件的结果
        socket.on('map-file-result', function (res) {
            if (!res || typeof res !== 'object') return;
            if (fileSendTimer) { window.clearTimeout(fileSendTimer); fileSendTimer = null; }
            pendingFileName = null;
            const pushed = pendingPush;
            pendingPush = null;
            if (res.ok) {
                // 电脑端已加载成功，手机本地也加载同一份，两端都能看到
                if (pushed) loadFileOnPhone(pushed.text, res.name || pushed.name, pushed.ext);
                notify('电脑已加载 ' + (res.name || '图层') + '（' + (res.count || 0) + ' 个要素）', 'online');
            } else {
                notify('电脑加载失败：' + (res.error || '未知错误'), 'error');
            }
        });

        // 接入结果（含角色与激光颜色）
        socket.on('map-join-result', function (res) {
            if (!res || typeof res !== 'object') return;
            if (joinTimerId) { window.clearTimeout(joinTimerId); joinTimerId = null; }
            if (res.ok) {
                joinState = 'connected';
                myRole = res.role === 'full' ? 'full' : 'laser';
                myColor = res.color || null;
                closeJoinOverlay();
                applyRoleUI();
                if (myRole === 'full') {
                    if (pendingDataLoad && typeof window.loadUserUploadedData === 'function') {
                        pendingDataLoad = false;
                        window.loadUserUploadedData();
                    }
                    requestLayers();
                    sendView();
                    setStatus(res.restored ? '已恢复完整镜像' : '完整镜像已接入，正在同步…', 'online');
                } else {
                    setStatus('已接入：仅激光（只读跟随电脑端）', 'online');
                }
                refreshStatus();
            } else {
                const reason = res.reason || 'unknown';
                if (reason === 'occupied' || reason === 'occupied-full') {
                    joinState = 'occupied';
                    showJoinOverlay('occupied-full');
                } else if (reason === 'bad-access-token') {
                    joinState = 'bad-access';
                    showJoinOverlay('bad-access');
                } else if (reason === 'rate-limited') {
                    joinState = 'rejected';
                    showJoinOverlay('timeout');
                } else if (reason === 'host-offline') {
                    joinState = 'rejected';
                    showJoinOverlay('host-offline');
                } else if (reason === 'too-many') {
                    joinState = 'rejected';
                    showJoinOverlay('too-many');
                } else if (reason === 'kicked' || reason === 'superseded') {
                    joinState = 'kicked';
                    showJoinOverlay('kicked');
                } else {
                    joinState = 'rejected';
                    showJoinOverlay('rejected');
                }
                setStatus('接入失败', 'error');
            }
        });

        socket.on('map-kicked', function (payload) {
            joinState = 'kicked';
            closeJoinOverlay();
            showJoinOverlay('kicked');
            if (payload && payload.reason === 'host-logout') {
                setStatus('电脑端已退出登录，完整镜像已断开', 'error');
            } else if (payload && payload.reason === 'host-user-changed') {
                setStatus('电脑端切换了账号，完整镜像已断开', 'error');
            } else {
                setStatus('已被电脑端断开', 'error');
            }
        });
    }

    function init() {
        statusEl = document.getElementById('mirrorStatus');
        accountEl = document.getElementById('mirrorAccount');
        layerPanelEl = document.getElementById('mirrorLayerPanel');
        layerListEl = document.getElementById('mirrorLayerList');
        bindButtons();
        bindLogin();
        bindLaser();
        watchMeasureButtons();
        hookMeasure();
        hookSearch();
        hookPopup();
        syncToolbar();
        if (hasToken()) {
            connectMirror();
        } else {
            setStatus('请登录，或选择仅遥控', 'waiting');
        }

        if (window.map) {
            const view = window.map.getView();
            window.map.on('moveend', scheduleView);
            view.on('change:resolution', scheduleView);
            view.on('change:rotation', scheduleView);
        }

        window.addEventListener('beforeunload', function () {
            if (socket) socket.disconnect();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
