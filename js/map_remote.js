/**
 * 跬步地图 · 手机遥控（电脑端宿主）
 *
 * 依赖：
 * - OpenLayers 全局 map / view（js/map.js）
 * - socket.io 客户端（games/lib/socket.io.min.js）
 *
 * 中继：FastAPI /map 命名空间
 * 事件：map-join / map-cmd / map-state / map-presence
 */
(function () {
    'use strict';

    const DEFAULT_SERVER = 'https://lzy-fastapi.onrender.com';
    const PAN_SPEED = 480;      // 像素/秒
    const ZOOM_SPEED = 0.9;     // 级/秒
    const MIN_ZOOM = 2;
    const MAX_ZOOM = 19;
    const CMD_TIMEOUT = 1500;   // 超过此时长未收到指令则停止平移/缩放
    // 本地操作优先：本地拖拽/滚轮后的一小段时间内忽略手机视图类指令
    const LOCAL_HOLD_DRAG = 1800;
    const LOCAL_HOLD_WHEEL = 1200;
    const LOCAL_PRIORITY_ACTIONS = {
        pan: 1, zoom: 1, view: 1, locate: 1, 'poi-sync': 1,
        base: 1, 'base-set': 1, 'measure-sync': 1, 'measure-clear': 1, popup: 1
    };
    // ?mirror=1：本页在手机上作为地图镜像控制器，不担任电脑端宿主
    const IS_MIRROR = new URLSearchParams(window.location.search).get('mirror') === '1';

    let socket = null;
    let panelEl = null;
    let statusEl = null;
    let qrEl = null;
    let qrEmptyEl = null;
    let urlEl = null;
    let tipEl = null;
    let remoteData = null;      // /api/map/info 快照
    let activeMode = 'ctl';     // ctl=简易遥控，mirror=地图镜像
    let infoFailed = false;
    let hostOnline = false;
    let controllerCount = 0;
    let socketReady = false;
    let pairCodeEl = null;
    let pairTimerEl = null;
    let pairRefreshBtn = null;
    let pairTimerId = null;
    let lastPairCode = null;
    let localHoldUntil = 0;
    let localHintAt = 0;
    let kickBtn = null;

    const pan = { vx: 0, vy: 0 };
    const zoom = { dir: 0, active: false };
    let rafId = null;
    let lastFrame = 0;
    let lastCmdAt = 0;
    let stateTimer = null;
    let remoteMarkerLayer = null;
    const layerUidMap = new WeakMap();
    let layerUidSeed = 1;

    // 弹窗同步：seq 变化时手机才重新应用，避免重复覆盖
    let popupBroadcast = { seq: 0, open: false };
    // 激光笔
    let laserLayer = null;
    let laserPoints = [];
    let laserDotEl = null;
    let laserDotCoord = null;
    let laserClearTimer = null;

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    function normalizeServer(raw) {
        if (!raw) return DEFAULT_SERVER;
        let value = String(raw).trim();
        if (!/^https?:\/\//i.test(value)) return DEFAULT_SERVER;
        return value.replace(/\/+$/, '');
    }

    function getServer() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('server');
        if (fromUrl) {
            const normalized = normalizeServer(fromUrl);
            try { localStorage.setItem('map_remote_server', normalized); } catch (e) { /* ignore */ }
            return normalized;
        }
        try {
            const stored = localStorage.getItem('map_remote_server');
            if (stored) return normalizeServer(stored);
        } catch (e) { /* ignore */ }
        return normalizeServer(window.MAP_SERVER);
    }

    const SERVER = getServer();
    window.MAP_SERVER = SERVER;

    function setStatus(text, tone) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'map-remote-status' + (tone ? ' is-' + tone : '');
    }

    function refreshStatus() {
        updateKickButton();
        if (!socketReady) {
            setStatus('未连接中继', 'offline');
            return;
        }
        if (!hostOnline) {
            setStatus('正在加入遥控会话…', 'waiting');
            return;
        }
        setStatus(
            '电脑端已就绪，手机 ' + controllerCount + ' 台',
            controllerCount > 0 ? 'online' : 'waiting'
        );
    }

    function updateKickButton() {
        if (!kickBtn) return;
        kickBtn.textContent = '断开手机（' + controllerCount + '）';
        kickBtn.disabled = controllerCount === 0;
    }

    // ---------------- 本地操作优先 ----------------
    function localBusy() {
        return performance.now() < localHoldUntil;
    }

    function markLocalActivity(holdMs) {
        if (!socketReady) return;
        localHoldUntil = performance.now() + holdMs;
        stopLoop();
        const now = performance.now();
        if (now - localHintAt < 1500) return;
        localHintAt = now;
        setStatus('本地操作优先，已忽略手机指令', 'waiting');
        window.setTimeout(refreshStatus, 1600);
    }

    function clearPairDisplay() {
        if (pairTimerId) {
            window.clearInterval(pairTimerId);
            pairTimerId = null;
        }
        lastPairCode = null;
        if (pairCodeEl) {
            pairCodeEl.textContent = '------';
            pairCodeEl.classList.remove('is-expired');
        }
        if (pairTimerEl) pairTimerEl.textContent = '';
    }

    function renderPairCode(code, expiresAt) {
        if (!pairCodeEl) return;
        lastPairCode = code || null;
        if (!code) {
            clearPairDisplay();
            return;
        }
        if (pairTimerId) {
            window.clearInterval(pairTimerId);
            pairTimerId = null;
        }
        pairCodeEl.textContent = code;
        pairCodeEl.classList.remove('is-expired');
        const tick = function () {
            const remain = Math.max(0, Math.round(((Number(expiresAt) || 0) - Date.now()) / 1000));
            if (!pairTimerEl) return;
            if (remain <= 0) {
                pairTimerEl.textContent = '已过期';
                if (pairCodeEl) pairCodeEl.classList.add('is-expired');
                if (pairTimerId) {
                    window.clearInterval(pairTimerId);
                    pairTimerId = null;
                }
                return;
            }
            const mm = String(Math.floor(remain / 60)).padStart(2, '0');
            const ss = String(remain % 60).padStart(2, '0');
            pairTimerEl.textContent = mm + ':' + ss;
        };
        tick();
        pairTimerId = window.setInterval(tick, 1000);
    }

    function ensureSocket() {
        if (socket) return socket;
        if (typeof window.io !== 'function') {
            setStatus('socket.io 未加载，无法连接', 'error');
            return null;
        }
        socket = window.io(SERVER + '/map', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 12000
        });

        socket.on('connect', function () {
            socketReady = true;
            hostOnline = true;   // 加入成功即视为在线，避免漏收 presence 时状态卡住
            socket.emit('map-join', { role: 'host' });
            setStatus('已连接中继，等待手机…', 'waiting');
            sendState(true);
        });

        socket.on('disconnect', function () {
            socketReady = false;
            hostOnline = false;
            controllerCount = 0;
            stopLoop();
            clearPairDisplay();
            refreshStatus();
        });

        socket.on('connect_error', function () {
            socketReady = false;
            refreshStatus();
            setStatus('中继连接失败，正在重试…', 'error');
        });

        socket.on('map-presence', function (payload) {
            if (!payload || typeof payload !== 'object') return;
            hostOnline = !!payload.host;
            controllerCount = Number(payload.controllers) || 0;
            if (controllerCount === 0) {
                stopLoop();
                clearLaser();
            }
            refreshStatus();
        });

        socket.on('map-host-replaced', function () {
            hostOnline = false;
            stopLoop();
            clearPairDisplay();
            setStatus('另一台电脑已接管遥控，本页已退出', 'error');
        });

        socket.on('map-pair', function (payload) {
            if (!payload || typeof payload !== 'object') return;
            const changed = !!payload.code && payload.code !== lastPairCode;
            renderPairCode(payload.code, payload.expiresAt);
            if (payload.code) {
                setStatus('配对码已生成，等待手机扫码或输入', 'online');
                window.setTimeout(refreshStatus, 2000);
            }
            // 配对码变化（如手动刷新）时重新拉取二维码，使内嵌 pair 与面板一致
            if (changed) loadQr();
        });

        socket.on('map-kick-result', function (payload) {
            if (!payload || payload.ok !== true) return;
            const count = Number(payload.kicked) || 0;
            setStatus('已断开 ' + count + ' 台手机，配对码已更新', 'waiting');
            window.setTimeout(refreshStatus, 2200);
        });

        socket.on('map-cmd', handleCommand);

        return socket;
    }

    function sendState(immediate) {
        if (!socket || !socket.connected || !window.map) return;
        if (!immediate) {
            if (stateTimer) return;
            stateTimer = window.setTimeout(function () {
                stateTimer = null;
                sendState(true);
            }, 200);
            return;
        }

        const view = window.map.getView();
        const center = window.ol ? window.ol.proj.toLonLat(view.getCenter()) : [0, 0];
        const baseBtn = document.getElementById('switchBaseMapBtn');
        const lengthBtn = document.getElementById('measureLengthBtn');
        const areaBtn = document.getElementById('measureAreaBtn');
        let measure = 'none';
        if (lengthBtn && lengthBtn.classList.contains('active')) measure = 'length';
        else if (areaBtn && areaBtn.classList.contains('active')) measure = 'area';

        socket.emit('map-state', {
            center: [
                Number(center[0].toFixed(6)),
                Number(center[1].toFixed(6))
            ],
            zoom: Number(view.getZoom().toFixed(2)),
            rotation: Number(view.getRotation().toFixed(3)),
            base: baseBtn && baseBtn.classList.contains('active') ? 'imagery' : 'vector',
            measure: measure,
            layers: collectLayerState(),
            popup: popupBroadcast,
            ts: Date.now()
        });
    }

    function handleCommand(msg) {
        if (!msg || typeof msg !== 'object') return;
        // 本地操作优先：本地交互窗口内丢弃手机的视图类指令
        if (LOCAL_PRIORITY_ACTIONS[msg.action] && localBusy()) return;
        // 电脑端正在测量时，本地测量始终优先于手机同步
        if ((msg.action === 'measure-sync' || msg.action === 'measure-clear') &&
            typeof measureActive !== 'undefined' && measureActive) return;
        switch (msg.action) {
            case 'pan':
                lastCmdAt = performance.now();
                pan.vx = clamp(Number(msg.vx) || 0, -1, 1);
                pan.vy = clamp(Number(msg.vy) || 0, -1, 1);
                startLoop();
                break;
            case 'zoom':
                lastCmdAt = performance.now();
                zoom.dir = Number(msg.dir) > 0 ? 1 : -1;
                zoom.active = !!msg.active;
                startLoop();
                break;
            case 'locate':
                locateFromPhone(msg);
                break;
            case 'base':
                clickEl('switchBaseMapBtn');
                break;
            case 'view':
                stopLoop();
                applyRemoteView(msg);
                break;
            case 'base-set':
                applyBaseSet(msg);
                break;
            case 'measure-sync':
                applyMeasureSync(msg);
                break;
            case 'measure-clear':
                applyMeasureClear();
                break;
            case 'poi-sync':
                applyPoiSync(msg);
                break;
            case 'layers':
                handleLayersCommand(msg);
                break;
            case 'laser':
                applyLaserCommand(msg);
                return;   // 激光高频指令不触发整状态广播
            case 'popup':
                applyPopupSync(msg);
                return;
            default:
                break;
        }
        sendState();
    }

    function clickEl(id) {
        const el = document.getElementById(id);
        if (el) el.click();
    }

    // ---------- 地图镜像：电脑端图层清单与操作 ----------
    function layerGroups() {
        return [
            { kind: 'dynamic', items: Array.isArray(window.dynamicLayers) ? window.dynamicLayers : [] },
            { kind: 'local', items: typeof localGeoJsonLayers !== 'undefined' && Array.isArray(localGeoJsonLayers) ? localGeoJsonLayers : [] }
        ];
    }

    function getLayerUid(layer) {
        if (!layerUidMap.has(layer)) {
            layerUidMap.set(layer, String(layerUidSeed++));
        }
        return layerUidMap.get(layer);
    }

    function collectLayerState() {
        const result = [];
        layerGroups().forEach(function (group) {
            group.items.forEach(function (item) {
                if (!item || !item.layer) return;
                result.push({
                    id: group.kind + ':' + getLayerUid(item.layer),
                    name: String(item.name || '未命名图层'),
                    kind: group.kind,
                    visible: item.layer.getVisible() !== false
                });
            });
        });
        return result;
    }

    function findLayerItem(id) {
        if (typeof id !== 'string') return null;
        const sep = id.indexOf(':');
        if (sep < 1) return null;
        const kind = id.slice(0, sep);
        const uid = id.slice(sep + 1);
        const group = layerGroups().find(function (entry) { return entry.kind === kind; });
        if (!group) return null;
        for (let i = 0; i < group.items.length; i++) {
            const item = group.items[i];
            if (item && item.layer && layerUidMap.get(item.layer) === uid) {
                return { item: item, index: i, kind: kind, items: group.items };
            }
        }
        return null;
    }

    function handleLayersCommand(msg) {
        if (msg.op === 'list') {
            sendState(true);
            return;
        }
        const found = findLayerItem(msg.id);
        if (!found) {
            sendState(true);
            return;
        }
        const item = found.item;
        if (msg.op === 'visibility') {
            item.visible = !!msg.visible;
            item.layer.setVisible(item.visible);
        } else if (msg.op === 'zoom') {
            const source = item.layer.getSource && item.layer.getSource();
            const extent = source && source.getExtent ? source.getExtent() : null;
            if (extent && extent.every(Number.isFinite) &&
                !window.ol.extent.isEmpty(extent)) {
                window.map.getView().fit(extent, {
                    padding: [60, 60, 60, 60],
                    duration: 500,
                    maxZoom: 18
                });
            }
        } else if (msg.op === 'remove') {
            window.map.removeLayer(item.layer);
            found.items.splice(found.index, 1);
            if (typeof createLayerControl === 'function') createLayerControl();
        }
        sendState(true);
    }

    // ---------- 地图镜像：手机 -> 电脑 的同步指令 ----------
    function applyRemoteView(msg) {
        if (!window.map || !window.ol) return;
        const center = msg.center;
        if (!Array.isArray(center) || center.length < 2) return;
        const lon = Number(center[0]);
        const lat = Number(center[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        const view = window.map.getView();
        const zoomLevel = Number(msg.zoom);
        const rotation = Number(msg.rotation);
        view.cancelAnimations();
        if (Number.isFinite(rotation)) view.setRotation(rotation);
        if (Number.isFinite(zoomLevel)) view.setZoom(clamp(zoomLevel, MIN_ZOOM, MAX_ZOOM));
        view.setCenter(window.ol.proj.fromLonLat([lon, lat]));
    }

    function applyBaseSet(msg) {
        const btn = document.getElementById('switchBaseMapBtn');
        if (!btn) return;
        const wantImagery = msg.base === 'imagery';
        if (btn.classList.contains('active') !== wantImagery) btn.click();
    }

    function applyMeasureSync(msg) {
        if (!window.ol || typeof measureLayer === 'undefined') return;
        const coords = msg.coords;
        if (!Array.isArray(coords)) return;
        const isArea = msg.type === 'area';
        // 线：[[x,y],...]；面：[[[x,y],...]]（按环组织）
        const valid = isArea
            ? (Array.isArray(coords[0]) && coords[0].length >= 4)
            : (coords.length >= 2);
        if (!valid) return;
        // 电脑端只做展示：先停掉本机绘制交互，避免与手机重复
        if (typeof measureActive !== 'undefined' && measureActive &&
            typeof window.deactivateMeasurement === 'function') {
            window.deactivateMeasurement();
        }
        const source = measureLayer.getSource();
        let geometry = null;
        try {
            geometry = msg.type === 'area'
                ? new window.ol.geom.Polygon(coords)
                : new window.ol.geom.LineString(coords);
        } catch (err) {
            console.warn('[地图遥控] 测量几何解析失败', err);
            return;
        }
        source.clear();
        source.addFeature(new window.ol.Feature({ geometry: geometry }));

        const el = document.getElementById('measureResult');
        if (!el) return;
        el.style.display = 'block';
        try {
            if (msg.type === 'area') {
                el.innerHTML = '面积: ' + formatArea(
                    window.ol.sphere.getArea(geometry, { projection: 'EPSG:3857' })
                );
            } else {
                el.innerHTML = '长度: ' + formatLength(
                    window.ol.sphere.getLength(geometry, { projection: 'EPSG:3857' })
                );
            }
        } catch (err) {
            el.innerHTML = '测量结果已同步';
        }
    }

    function applyMeasureClear() {
        if (typeof measureActive !== 'undefined' && measureActive &&
            typeof window.deactivateMeasurement === 'function') {
            window.deactivateMeasurement();
            return;
        }
        if (typeof measureLayer !== 'undefined') {
            measureLayer.getSource().clear();
        }
        const el = document.getElementById('measureResult');
        if (el) {
            el.style.display = 'none';
            el.innerHTML = '0 米';
        }
    }

    function ensureMarkerLayer() {
        if (remoteMarkerLayer || !window.ol || !window.map) return remoteMarkerLayer;
        remoteMarkerLayer = new window.ol.layer.Vector({
            source: new window.ol.source.Vector(),
            style: function (feature) {
                const color = feature.get('markerColor') || '#1677ff';
                return new window.ol.style.Style({
                    image: new window.ol.style.Circle({
                        radius: 7,
                        fill: new window.ol.style.Fill({ color: color }),
                        stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 2 })
                    }),
                    text: new window.ol.style.Text({
                        text: feature.get('label') || '',
                        offsetY: -20,
                        font: '12px sans-serif',
                        fill: new window.ol.style.Fill({ color: color }),
                        stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 3 })
                    })
                });
            },
            zIndex: 999
        });
        window.map.addLayer(remoteMarkerLayer);
        return remoteMarkerLayer;
    }

    function showRemoteMarker(lon, lat, label, color) {
        const layer = ensureMarkerLayer();
        if (!layer) return;
        const source = layer.getSource();
        source.clear();
        source.addFeature(new window.ol.Feature({
            geometry: new window.ol.geom.Point(window.ol.proj.fromLonLat([lon, lat])),
            label: label,
            markerColor: color
        }));
    }

    function locateFromPhone(msg) {
        const lat = Number(msg.lat);
        const lon = Number(msg.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) &&
            Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            showRemoteMarker(lon, lat, '手机位置', '#1677ff');
            const view = window.map.getView();
            view.animate({
                center: window.ol.proj.fromLonLat([lon, lat]),
                zoom: Math.max(view.getZoom(), 14),
                duration: 500
            });
            sendState(true);
            return;
        }
        // 简易遥控未提供坐标时，退回电脑端定位按钮
        clickEl('locateBtn');
    }

    function applyPoiSync(msg) {
        if (!window.map || !window.ol || !Array.isArray(msg.center)) return;
        const lon = Number(msg.center[0]);
        const lat = Number(msg.center[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
            Math.abs(lon) > 180 || Math.abs(lat) > 90) return;
        showRemoteMarker(lon, lat, String(msg.name || '搜索结果').slice(0, 80), '#e74c3c');
        const view = window.map.getView();
        view.animate({
            center: window.ol.proj.fromLonLat([lon, lat]),
            zoom: Math.max(view.getZoom(), 15),
            duration: 500
        });
    }

    // ---------- 弹窗同步：手机 <-> 电脑 ----------
    function recordPopup(open, lon, lat) {
        popupBroadcast = {
            seq: popupBroadcast.seq + 1,
            open: !!open,
            lon: open ? Number(lon) : undefined,
            lat: open ? Number(lat) : undefined
        };
    }

    function currentPopupInfo() {
        if (typeof popup === 'undefined' || !window.ol) return { open: false };
        const pos = popup.getPosition();
        if (!pos) return { open: false };
        const ll = window.ol.proj.toLonLat(pos);
        return {
            open: true,
            lon: Number(ll[0].toFixed(6)),
            lat: Number(ll[1].toFixed(6))
        };
    }

    function applyPopupSync(msg) {
        if (!window.map || !window.ol) return;
        if (msg.open === false) {
            if (typeof closePopup === 'function') closePopup();
            return;
        }
        const lon = Number(msg.lon);
        const lat = Number(msg.lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
            Math.abs(lon) > 180 || Math.abs(lat) > 90) return;
        const coordinate = window.ol.proj.fromLonLat([lon, lat]);
        const pixel = window.map.getPixelFromCoordinate(coordinate);
        if (!pixel) return;
        const feature = window.map.forEachFeatureAtPixel(pixel, function (f) { return f; }, {
            layerFilter: function (layer) {
                if (typeof footprintGenLayer !== 'undefined' && layer === footprintGenLayer) return false;
                return layer !== remoteMarkerLayer && layer !== laserLayer;
            }
        });
        if (feature && typeof showFeaturePopup === 'function') {
            showFeaturePopup(feature, coordinate);
        } else if (typeof closePopup === 'function') {
            closePopup();
        }
    }

    // ---------- 激光笔：手机 -> 电脑 ----------
    function laserStyles() {
        if (laserStyles.cache) return laserStyles.cache;
        laserStyles.cache = [
            new window.ol.style.Style({
                stroke: new window.ol.style.Stroke({
                    color: 'rgba(255, 45, 85, 0.32)', width: 11,
                    lineCap: 'round', lineJoin: 'round'
                })
            }),
            new window.ol.style.Style({
                stroke: new window.ol.style.Stroke({
                    color: '#ff2d55', width: 4, lineDash: [10, 6],
                    lineCap: 'round', lineJoin: 'round'
                })
            }),
            new window.ol.style.Style({
                image: new window.ol.style.Circle({
                    radius: 6,
                    fill: new window.ol.style.Fill({ color: '#ff2d55' }),
                    stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 2 })
                })
            })
        ];
        return laserStyles.cache;
    }

    function ensureLaserLayer() {
        if (laserLayer || !window.ol || !window.map) return laserLayer;
        laserLayer = new window.ol.layer.Vector({
            source: new window.ol.source.Vector(),
            style: laserStyles(),
            zIndex: 1200
        });
        window.map.addLayer(laserLayer);
        return laserLayer;
    }

    function ensureLaserDot() {
        if (laserDotEl || !window.map) return laserDotEl;
        laserDotEl = document.createElement('div');
        laserDotEl.className = 'map-laser-dot';
        laserDotEl.style.display = 'none';
        document.body.appendChild(laserDotEl);
        window.map.on('postrender', positionLaserDot);
        return laserDotEl;
    }

    function positionLaserDot() {
        if (!laserDotEl || !laserDotCoord || !window.map) return;
        const pixel = window.map.getPixelFromCoordinate(laserDotCoord);
        if (!pixel) {
            laserDotEl.style.display = 'none';
            return;
        }
        const rect = window.map.getViewport().getBoundingClientRect();
        laserDotEl.style.left = (rect.left + pixel[0]) + 'px';
        laserDotEl.style.top = (rect.top + pixel[1]) + 'px';
    }

    function showLaserDot(lon, lat) {
        if (!window.ol || !window.map) return;
        if (!ensureLaserDot()) return;
        laserDotCoord = window.ol.proj.fromLonLat([lon, lat]);
        laserDotEl.style.display = 'block';
        positionLaserDot();
        scheduleLaserClear(4200);
    }

    function toMapCoordinates(coords, limit) {
        const result = [];
        if (!Array.isArray(coords)) return result;
        const max = Math.min(coords.length, limit);
        for (let i = 0; i < max; i++) {
            const pair = coords[i];
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const lon = Number(pair[0]);
            const lat = Number(pair[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
                Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
            result.push(window.ol.proj.fromLonLat([lon, lat]));
        }
        return result;
    }

    function drawLaserTrail(coords, close) {
        if (!laserLayer) return;
        const source = laserLayer.getSource();
        source.clear();
        if (!coords || coords.length < 2) return;
        const points = close ? coords.concat([coords[0]]) : coords;
        source.addFeature(new window.ol.Feature({
            geometry: new window.ol.geom.LineString(points)
        }));
    }

    function scheduleLaserClear(delay) {
        if (laserClearTimer) window.clearTimeout(laserClearTimer);
        laserClearTimer = window.setTimeout(clearLaser, delay);
    }

    function clearLaser() {
        if (laserClearTimer) {
            window.clearTimeout(laserClearTimer);
            laserClearTimer = null;
        }
        laserPoints = [];
        laserDotCoord = null;
        if (laserLayer) laserLayer.getSource().clear();
        if (laserDotEl) laserDotEl.style.display = 'none';
    }

    function applyLaserCommand(msg) {
        if (!msg || !window.ol || !window.map) return;
        if (msg.phase === 'clear') {
            clearLaser();
            return;
        }
        if (msg.mode === 'point') {
            const point = Array.isArray(msg.coords) && msg.coords[0];
            if (point && point.length >= 2) {
                const lon = Number(point[0]);
                const lat = Number(point[1]);
                if (Number.isFinite(lon) && Number.isFinite(lat)) showLaserDot(lon, lat);
            }
            return;
        }
        ensureLaserLayer();
        if (!laserLayer) return;

        if (msg.mode === 'circle') {
            const ring = toMapCoordinates(msg.coords, 96);
            if (ring.length >= 3) {
                laserPoints = ring;
                drawLaserTrail(ring, true);
                scheduleLaserClear(2600);
            }
            return;
        }

        // 划线：增量追加
        if (msg.phase === 'start') {
            laserPoints = [];
            laserLayer.getSource().clear();
        }
        const points = toMapCoordinates(msg.coords, 400);
        if (points.length) laserPoints = laserPoints.concat(points);
        if (laserPoints.length > 4000) laserPoints = laserPoints.slice(-4000);
        if (laserPoints.length >= 2) drawLaserTrail(laserPoints, false);
        scheduleLaserClear(2600);
    }

    function startLoop() {
        if (rafId !== null) return;
        lastFrame = performance.now();
        rafId = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        pan.vx = 0;
        pan.vy = 0;
        zoom.active = false;
    }

    function tick(now) {
        rafId = null;
        if (!window.map) return;
        if (now - lastCmdAt > CMD_TIMEOUT) {
            stopLoop();
            return;
        }
        const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
        lastFrame = now;
        const view = window.map.getView();
        let active = false;

        if (pan.vx !== 0 || pan.vy !== 0) {
            const res = view.getResolution();
            const center = view.getCenter().slice();
            center[0] += pan.vx * PAN_SPEED * dt * res;
            center[1] += pan.vy * PAN_SPEED * dt * res;
            view.setCenter(center);
            active = true;
        }

        if (zoom.active) {
            view.setZoom(clamp(view.getZoom() + zoom.dir * ZOOM_SPEED * dt, MIN_ZOOM, MAX_ZOOM));
            active = true;
        }

        if (active) {
            sendState();
            rafId = requestAnimationFrame(tick);
        }
    }

    function pageBase() {
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            return window.location.origin;
        }
        return 'https://lzywhy.com';
    }

    function fallbackControllerUrl() {
        return pageBase() + '/mapctl/index.html?server=' + encodeURIComponent(SERVER);
    }

    function fallbackMirrorUrl() {
        return pageBase() + '/AIsea.html?mirror=1&server=' + encodeURIComponent(SERVER);
    }

    function currentUrl() {
        if (activeMode === 'mirror') {
            return (remoteData && remoteData.mirrorUrl) || fallbackMirrorUrl();
        }
        return (remoteData && remoteData.url) || fallbackControllerUrl();
    }

    function renderQr() {
        if (!qrEl) return;
        if (urlEl) urlEl.textContent = currentUrl();
        if (tipEl) {
            tipEl.textContent = activeMode === 'mirror'
                ? '电脑已登录：手机打开同一地图，可同步视图、测量、搜索、定位和图层操作。'
                : '电脑未登录：提供移动、缩放、定位和底图切换；登录后可使用地图镜像。';
        }

        const src = activeMode === 'mirror'
            ? (remoteData && remoteData.mirrorQr)
            : (remoteData && remoteData.qr);

        if (src) {
            qrEl.onload = function () {
                qrEl.style.display = 'block';
                if (qrEmptyEl) qrEmptyEl.style.display = 'none';
            };
            qrEl.onerror = function () {
                qrEl.style.display = 'none';
                if (qrEmptyEl) {
                    qrEmptyEl.style.display = 'flex';
                    qrEmptyEl.textContent = '二维码加载失败，请复制链接';
                }
            };
            qrEl.src = src;
            return;
        }

        qrEl.removeAttribute('src');
        qrEl.style.display = 'none';
        if (qrEmptyEl) {
            qrEmptyEl.style.display = 'flex';
            qrEmptyEl.textContent = infoFailed
                ? '中继未响应，请复制链接或重试'
                : '未获取到二维码，请复制链接';
        }
    }

    function loadQr() {
        if (qrEmptyEl) {
            qrEmptyEl.style.display = 'flex';
            qrEmptyEl.textContent = '正在获取二维码…';
        }
        if (qrEl) qrEl.style.display = 'none';
        infoFailed = false;

        fetch(SERVER + '/api/map/info?server=' + encodeURIComponent(SERVER), { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                remoteData = data || null;
                // socket 已连接时以实时 presence 为准，避免请求快照覆盖新状态
                if (!socketReady && data) {
                    hostOnline = !!data.host;
                    controllerCount = Number(data.controllers) || 0;
                }
                // 兜底：socket 的 map-pair 事件未到时，用 /info 返回的配对码先渲染
                if (data && data.pairCode) {
                    renderPairCode(data.pairCode, data.pairExpiresAt);
                }
                renderQr();
                refreshStatus();
            })
            .catch(function () {
                remoteData = null;
                infoFailed = true;
                renderQr();
                setStatus('二维码获取失败', 'error');
            });
    }

    function desktopLoggedIn() {
        try {
            return !!(localStorage.getItem('access_token') && localStorage.getItem('username'));
        } catch (e) {
            return false;
        }
    }

    function copyUrl() {
        const text = currentUrl();
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () {
                setStatus('链接已复制', 'online');
                window.setTimeout(refreshStatus, 1600);
            }).catch(function () {
                setStatus('复制失败，请手动选择链接', 'error');
            });
        } else {
            window.prompt('复制手机端地址：', text);
        }
    }

    function openPanel() {
        if (!panelEl) return;
        panelEl.style.display = 'block';
        activeMode = desktopLoggedIn() ? 'mirror' : 'ctl';
        ensureSocket();
        loadQr();
    }

    function closePanel() {
        if (panelEl) panelEl.style.display = 'none';
    }

    function init() {
        if (IS_MIRROR) return;   // 手机镜像模式由 map_mirror.js 接管
        if (window.XIAOLIU_EMBED || document.body.classList.contains('xiaoliu-embed')) {
            return;
        }

        panelEl = document.getElementById('mapRemotePanel');
        statusEl = document.getElementById('mapRemoteStatus');
        qrEl = document.getElementById('mapRemoteQr');
        qrEmptyEl = document.getElementById('mapRemoteQrEmpty');
        urlEl = document.getElementById('mapRemoteUrl');
        tipEl = document.getElementById('mapRemoteTip');
        pairCodeEl = document.getElementById('mapRemotePairCode');
        pairTimerEl = document.getElementById('mapRemotePairTimer');
        pairRefreshBtn = document.getElementById('mapRemotePairRefresh');
        kickBtn = document.getElementById('mapRemoteKick');

        if (!panelEl) return;

        const remoteMainBtn = document.getElementById('remoteMainBtn');
        const remoteDropdown = document.getElementById('remoteDropdown');
        const remoteQrBtn = document.getElementById('remoteQrBtn');
        const closeBtn = document.getElementById('mapRemoteClose');
        const retryBtn = document.getElementById('mapRemoteRetry');
        const copyBtn = document.getElementById('mapRemoteCopy');

        if (remoteMainBtn && remoteDropdown) {
            remoteMainBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                remoteDropdown.style.display =
                    remoteDropdown.style.display === 'block' ? 'none' : 'block';
            });
        }
        if (remoteQrBtn) {
            remoteQrBtn.addEventListener('click', function () {
                if (remoteDropdown) remoteDropdown.style.display = 'none';
                openPanel();
            });
        }
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        if (retryBtn) {
            retryBtn.addEventListener('click', function () {
                if (socket && !socket.connected) socket.connect();
                loadQr();
            });
        }
        if (copyBtn) copyBtn.addEventListener('click', copyUrl);
        if (pairRefreshBtn) {
            pairRefreshBtn.addEventListener('click', function () {
                if (socket && socket.connected) {
                    socket.emit('map-pair-refresh');
                    setStatus('正在刷新配对码…', 'waiting');
                } else {
                    setStatus('未连接中继，无法刷新', 'error');
                    window.setTimeout(refreshStatus, 1600);
                }
            });
        }
        if (kickBtn) {
            kickBtn.addEventListener('click', function () {
                if (!controllerCount) return;
                if (!window.confirm('断开所有已连接的手机遥控？断开后需要用新的配对码重新连接。')) return;
                if (socket && socket.connected) {
                    socket.emit('map-kick');
                    setStatus('正在断开手机…', 'waiting');
                } else {
                    setStatus('未连接中继，无法断开', 'error');
                    window.setTimeout(refreshStatus, 1600);
                }
            });
        }
        updateKickButton();

        if (window.map) {
            window.map.on('moveend', function () { sendState(); });
            const view = window.map.getView();
            view.on('change:resolution', function () { sendState(); });
            view.on('change:rotation', function () { sendState(); });

            // 本地交互优先：拖拽/滚轮期间暂停手机指令接管视图
            const viewport = window.map.getViewport();
            viewport.addEventListener('pointerdown', function () {
                markLocalActivity(LOCAL_HOLD_DRAG);
            }, { passive: true });
            viewport.addEventListener('wheel', function () {
                markLocalActivity(LOCAL_HOLD_WHEEL);
            }, { passive: true });

            // 电脑点击要素后，把弹窗同步到手机（与 js/map.js 的点击处理顺序：本监听后执行）
            window.map.on('click', function () {
                if (typeof measureActive !== 'undefined' && measureActive) return;
                window.setTimeout(function () {
                    const info = currentPopupInfo();
                    recordPopup(info.open, info.lon, info.lat);
                    sendState(true);
                }, 0);
            });
        }

        window.addEventListener('beforeunload', function () {
            stopLoop();
            clearPairDisplay();
            clearLaser();
            if (laserDotEl && laserDotEl.parentNode) laserDotEl.parentNode.removeChild(laserDotEl);
            laserDotEl = null;
            if (socket) socket.disconnect();
        });
    }

    // 激光渲染与宿主会话无关，暴露给镜像页复用，保证手机端本地显示与电脑端一致
    window.MapLaser = {
        apply: applyLaserCommand,
        clear: clearLaser
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
