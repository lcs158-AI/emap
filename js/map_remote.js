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

    const pan = { vx: 0, vy: 0 };
    const zoom = { dir: 0, active: false };
    let rafId = null;
    let lastFrame = 0;
    let lastCmdAt = 0;
    let stateTimer = null;
    let remoteMarkerLayer = null;
    const layerUidMap = new WeakMap();
    let layerUidSeed = 1;

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
            if (controllerCount === 0) stopLoop();
            refreshStatus();
        });

        socket.on('map-host-replaced', function () {
            hostOnline = false;
            stopLoop();
            setStatus('另一台电脑已接管遥控，本页已退出', 'error');
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
            ts: Date.now()
        });
    }

    function handleCommand(msg) {
        if (!msg || typeof msg !== 'object') return;
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

        if (window.map) {
            window.map.on('moveend', function () { sendState(); });
            const view = window.map.getView();
            view.on('change:resolution', function () { sendState(); });
            view.on('change:rotation', function () { sendState(); });
        }

        window.addEventListener('beforeunload', function () {
            stopLoop();
            if (socket) socket.disconnect();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
