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
    const URL_PAIR = params.get('pair');

    const DEFAULT_SERVER = 'https://lzy-fastapi.onrender.com';
    const MIN_ZOOM = 2;
    const MAX_ZOOM = 19;
    const VIEW_THROTTLE = 120;     // 视图同步节流（毫秒）
    const APPLY_LOCK = 350;        // 应用电脑端状态后的静默期，避免回环

    let socket = null;
    let ready = false;
    let hostOnline = false;
    let applyingRemote = false;
    let userMoved = false;
    let viewTimer = null;
    let lastApplyAt = 0;
    let viewSyncHoldUntil = 0;

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

    // 访客模式（不登录，仅遥控）：关闭依赖账号数据的图层与弹窗同步
    let guestMode = false;

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
    let laserDisabledInteractions = [];

    // 配对码：未配对前不发送任何 map-cmd（后端也会丢弃）
    let paired = false;
    let pairEl = null;
    let pairFormEl = null;
    let pairInputEl = null;
    let pairMsgEl = null;

    document.body.classList.add('mirror-mode');

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    function serverBase() {
        const raw = window.MAP_SERVER || DEFAULT_SERVER;
        const value = String(raw).trim();
        if (!/^https?:\/\//i.test(value)) return DEFAULT_SERVER;
        return value.replace(/\/+$/, '');
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
        if (!hostOnline) {
            setStatus('等待电脑端打开地图…', 'waiting');
            return;
        }
        setStatus('已同步到电脑', 'online');
    }

    function notify(text, tone) {
        setStatus(text, tone);
        window.setTimeout(refreshStatus, 2400);
    }

    function send(payload) {
        if (!paired) return;
        if (socket && socket.connected) socket.emit('map-cmd', payload);
    }

    // ---------------- 配对码 ----------------
    function setPairMsg(text) {
        if (pairMsgEl) pairMsgEl.textContent = text || '';
    }

    function showPairOverlay(show) {
        if (!pairEl) return;
        pairEl.style.display = show ? 'flex' : 'none';
        if (show) {
            setPairMsg('');
            window.setTimeout(function () {
                if (pairInputEl && !pairInputEl.value) pairInputEl.focus();
            }, 120);
        }
    }

    function attemptPair(code) {
        if (!socket || !socket.connected || paired) return;
        const clean = String(code || '').replace(/\D/g, '').slice(0, 6);
        if (!clean) {
            showPairOverlay(true);
            return;
        }
        if (pairInputEl) pairInputEl.value = clean;
        setPairMsg('正在配对…');
        socket.emit('map-pair', { code: clean });
    }

    // ---------------- 视图同步 ----------------
    function scheduleView() {
        if (applyingRemote) return;
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
        if (guestMode) return;
        send({ action: 'layers', op: 'list' });
    }

    function closeLayerPanel() {
        if (layerPanelEl) layerPanelEl.style.display = 'none';
        const btn = document.getElementById('mirrorLayersBtn');
        if (btn) btn.classList.remove('active');
    }

    function openLayerPanel() {
        if (!layerPanelEl || guestMode) return;
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
        accountEl.textContent = hasToken() ? ('账号：' + (name || '已登录')) : '未登录';
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
        connect();
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
                setLoginMsg('登录成功，正在加载数据…');
                updateAccountLabel();
                connect();
                if (typeof window.loadUserUploadedData === 'function') {
                    window.loadUserUploadedData();
                }
                window.setTimeout(function () {
                    showLogin(false);
                    requestLayers();
                    notify('已登录，正在同步地图数据', 'online');
                }, 500);
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
        window.map.on('click', function () {
            if (guestMode) return;
            if (applyingPopup) return;
            if (laserOn) return;
            if (typeof measureActive !== 'undefined' && measureActive) return;
            window.setTimeout(function () {
                if (!window.map) return;
                const pos = typeof popup !== 'undefined' ? popup.getPosition() : undefined;
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
            }, 0);
        });
    }

    function applyRemotePopup(info) {
        if (guestMode) return;
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
        if (guestMode) return;
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

    function showLaserHit(x, y) {
        const el = document.createElement('div');
        el.className = 'mirror-laser-hit';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        document.body.appendChild(el);
        window.setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 520);
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
        send({ action: 'laser', mode: 'circle', phase: 'path', coords: ring });
    }

    function setLaser(on) {
        laserOn = !!on;
        document.body.classList.toggle('laser-on', laserOn);
        const btn = document.getElementById('mirrorLaserBtn');
        if (btn) btn.classList.toggle('active', laserOn);
        if (!window.map) return;
        if (laserOn) {
            if (typeof measureActive !== 'undefined' && measureActive &&
                typeof window.deactivateMeasurement === 'function') {
                window.deactivateMeasurement();
                syncToolbar();
            }
            laserDisabledInteractions = [];
            window.map.getInteractions().forEach(function (interaction) {
                if (interaction instanceof window.ol.interaction.DragPan ||
                    interaction instanceof window.ol.interaction.DoubleClickZoom) {
                    if (interaction.getActive()) {
                        interaction.setActive(false);
                        laserDisabledInteractions.push(interaction);
                    }
                }
            });
            notify('激光已开启：点=光点，拖=划线；再次点击「激光」退出', 'waiting');
        } else {
            laserDisabledInteractions.forEach(function (interaction) {
                interaction.setActive(true);
            });
            laserDisabledInteractions = [];
            laserPointerId = null;
            laserStartCoord = null;
            send({ action: 'laser', phase: 'clear' });
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
            send({ action: 'laser', mode: 'line', phase: 'start', coords: [[point.lon, point.lat]] });
        }
        if (laserMode === 'point') showLaserHit(evt.clientX, evt.clientY);
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
            send({ action: 'laser', mode: 'line', phase: 'move', coords: [[point.lon, point.lat]] });
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
                send({ action: 'laser', mode: 'point', coords: [[point.lon, point.lat]] });
                showLaserHit(evt.clientX, evt.clientY);
                if (navigator.vibrate) navigator.vibrate(10);
            }
        } else if (laserMode === 'circle') {
            sendCircle(point.coord);
        } else {
            send({ action: 'laser', mode: 'line', phase: 'end', coords: [[point.lon, point.lat]] });
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
        const modes = document.querySelectorAll('.mirror-laser-mode');
        modes.forEach(function (modeBtn) {
            modeBtn.addEventListener('click', function () {
                laserMode = modeBtn.getAttribute('data-laser-mode') || 'point';
                modes.forEach(function (other) {
                    other.classList.toggle('active', other === modeBtn);
                });
                send({ action: 'laser', phase: 'clear' });
            });
        });
        const clearBtn = document.getElementById('mirrorLaserClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                send({ action: 'laser', phase: 'clear' });
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
    function connect() {
        if (socket) return;
        if (typeof window.io !== 'function') {
            setStatus('socket.io 未加载', 'error');
            return;
        }
        socket = window.io(serverBase() + '/map', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 12000
        });

        socket.on('connect', function () {
            ready = true;
            socket.emit('map-join', { role: 'controller' });
            setStatus('已连接，等待电脑端…', 'waiting');
        });

        socket.on('disconnect', function () {
            ready = false;
            hostOnline = false;
            paired = false;
            showPairOverlay(false);
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
            if (hostOnline && !wasOnline) requestLayers();
            refreshStatus();
        });

        socket.on('map-state', function (state) {
            if (!userMoved) applyRemoteState(state);
            if (!guestMode && state && Array.isArray(state.layers)) {
                remoteLayers = state.layers;
                renderLayerList();
                applyRemoteLayerVisibility(state.layers);
            }
            if (!guestMode && state && state.popup) applyRemotePopup(state.popup);
        });

        socket.on('map-cmd-result', function (res) {
            if (res && res.ok === false && res.reason === 'host-offline') {
                setStatus('电脑端未连接，操作未送达', 'error');
            }
        });

        socket.on('map-pair-required', function () {
            if (paired) return;
            if (URL_PAIR) {
                attemptPair(URL_PAIR);
            } else {
                showPairOverlay(true);
            }
        });

        socket.on('map-pair-result', function (res) {
            if (!res || typeof res !== 'object') return;
            if (res.ok) {
                paired = true;
                showPairOverlay(false);
                setPairMsg('');
                setStatus('配对成功，正在同步…', 'online');
                requestLayers();
                sendView();
                window.setTimeout(refreshStatus, 1800);
            } else {
                paired = false;
                showPairOverlay(true);
                setPairMsg(res.reason === 'invalid' ? '配对码错误，请重试' : '配对失败，请重试');
            }
        });
    }

    function bindPair() {
        pairEl = document.getElementById('mirrorPair');
        pairFormEl = document.getElementById('mirrorPairForm');
        pairInputEl = document.getElementById('mirrorPairInput');
        pairMsgEl = document.getElementById('mirrorPairMsg');
        if (!pairFormEl) return;
        pairFormEl.addEventListener('submit', function (event) {
            event.preventDefault();
            attemptPair(pairInputEl ? pairInputEl.value : '');
        });
    }

    function init() {
        statusEl = document.getElementById('mirrorStatus');
        accountEl = document.getElementById('mirrorAccount');
        layerPanelEl = document.getElementById('mirrorLayerPanel');
        layerListEl = document.getElementById('mirrorLayerList');
        bindButtons();
        bindLogin();
        bindPair();
        bindLaser();
        watchMeasureButtons();
        hookMeasure();
        hookSearch();
        hookPopup();
        syncToolbar();
        if (hasToken()) {
            connect();
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
