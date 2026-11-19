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
    const ROTATE_SPEED = 0.9;   // 弧度/秒
    const MIN_ZOOM = 2;
    const MAX_ZOOM = 19;
    const CMD_TIMEOUT = 1500;   // 超过此时长未收到指令则停止平移/缩放/旋转

    let socket = null;
    let panelEl = null;
    let statusEl = null;
    let qrEl = null;
    let qrEmptyEl = null;
    let urlEl = null;
    let controllerUrl = '';
    let hostOnline = false;
    let controllerCount = 0;
    let socketReady = false;

    const pan = { vx: 0, vy: 0 };
    const zoom = { dir: 0, active: false };
    const rotate = { dir: 0, active: false };
    let rafId = null;
    let lastFrame = 0;
    let lastCmdAt = 0;
    let stateTimer = null;
    let remoteLocateLayer = null;

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
            case 'rotate':
                lastCmdAt = performance.now();
                rotate.dir = Number(msg.dir) > 0 ? 1 : -1;
                rotate.active = !!msg.active;
                startLoop();
                break;
            case 'reset':
                resetView();
                break;
            case 'locate':
                locateFromPhone(msg);
                break;
            case 'base':
                clickEl('switchBaseMapBtn');
                break;
            case 'measure':
                setMeasure(msg.mode);
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

    function setMeasure(mode) {
        if (mode === 'off') {
            if (typeof window.deactivateMeasurement === 'function') {
                window.deactivateMeasurement();
            }
        } else if (mode === 'length' || mode === 'area') {
            if (typeof window.activateMeasurement === 'function') {
                window.activateMeasurement(mode);
            }
        }
        sendState(true);
    }

    function resetView() {
        const view = window.map.getView();
        const center = (typeof initCenter !== 'undefined') ? initCenter : [111.2, 21.48];
        const zoomLevel = (typeof initZoom !== 'undefined') ? initZoom : 5;
        view.setRotation(0);
        view.setZoom(zoomLevel);
        view.setCenter(window.ol.proj.fromLonLat(center));
        if (typeof window.deactivateMeasurement === 'function') {
            window.deactivateMeasurement();
        }
        sendState(true);
    }

    function ensureLocateLayer() {
        if (remoteLocateLayer || !window.ol || !window.map) return remoteLocateLayer;
        const style = new window.ol.style.Style({
            image: new window.ol.style.Circle({
                radius: 7,
                fill: new window.ol.style.Fill({ color: '#1677ff' }),
                stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 2 })
            }),
            text: new window.ol.style.Text({
                text: '手机位置',
                offsetY: -20,
                font: '12px sans-serif',
                fill: new window.ol.style.Fill({ color: '#1677ff' }),
                stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 3 })
            })
        });
        remoteLocateLayer = new window.ol.layer.Vector({
            source: new window.ol.source.Vector(),
            style: style,
            zIndex: 999
        });
        window.map.addLayer(remoteLocateLayer);
        return remoteLocateLayer;
    }

    function locateFromPhone(msg) {
        const lat = Number(msg.lat);
        const lon = Number(msg.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) &&
            Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            const layer = ensureLocateLayer();
            if (!layer) return;
            const source = layer.getSource();
            source.clear();
            source.addFeature(new window.ol.Feature({
                geometry: new window.ol.geom.Point(
                    window.ol.proj.fromLonLat([lon, lat])
                )
            }));
            const view = window.map.getView();
            view.animate({
                center: window.ol.proj.fromLonLat([lon, lat]),
                zoom: Math.max(view.getZoom(), 14),
                duration: 500
            });
            sendState(true);
            return;
        }
        // 手机未提供坐标时，退回电脑端定位按钮
        clickEl('locateBtn');
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
        rotate.active = false;
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

        if (rotate.active) {
            view.setRotation(view.getRotation() + rotate.dir * ROTATE_SPEED * dt);
            active = true;
        }

        if (active) {
            sendState();
            rafId = requestAnimationFrame(tick);
        }
    }

    function fallbackControllerUrl() {
        let base;
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            base = window.location.origin + '/mapctl/index.html';
        } else {
            base = 'https://lzywhy.com/mapctl/index.html';
        }
        return base + '?server=' + encodeURIComponent(SERVER);
    }

    function loadQr() {
        if (!qrEl) return;
        if (qrEmptyEl) {
            qrEmptyEl.style.display = 'flex';
            qrEmptyEl.textContent = '正在获取二维码…';
        }
        qrEl.style.display = 'none';

        fetch(SERVER + '/api/map/info?server=' + encodeURIComponent(SERVER), { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                controllerUrl = data.url || fallbackControllerUrl();
                if (urlEl) urlEl.textContent = controllerUrl;
                if (data.qr) {
                    qrEl.onload = function () {
                        qrEl.style.display = 'block';
                        if (qrEmptyEl) qrEmptyEl.style.display = 'none';
                    };
                    qrEl.onerror = function () {
                        if (qrEmptyEl) {
                            qrEmptyEl.style.display = 'flex';
                            qrEmptyEl.textContent = '二维码加载失败，请复制链接';
                        }
                    };
                    qrEl.src = data.qr;
                } else if (qrEmptyEl) {
                    qrEmptyEl.style.display = 'flex';
                    qrEmptyEl.textContent = '未获取到二维码，请复制链接';
                }
                // socket 已连接时以实时 presence 为准，避免请求快照覆盖新状态
                if (!socketReady) {
                    hostOnline = !!data.host;
                    controllerCount = Number(data.controllers) || 0;
                }
                refreshStatus();
            })
            .catch(function () {
                controllerUrl = fallbackControllerUrl();
                if (urlEl) urlEl.textContent = controllerUrl;
                if (qrEmptyEl) {
                    qrEmptyEl.style.display = 'flex';
                    qrEmptyEl.textContent = '中继未响应，请复制链接或重试';
                }
                setStatus('二维码获取失败', 'error');
            });
    }

    function copyUrl() {
        const text = controllerUrl || fallbackControllerUrl();
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () {
                setStatus('链接已复制', 'online');
                window.setTimeout(refreshStatus, 1600);
            }).catch(function () {
                setStatus('复制失败，请手动选择链接', 'error');
            });
        } else {
            window.prompt('复制手机控制地址：', text);
        }
    }

    function openPanel() {
        if (!panelEl) return;
        panelEl.style.display = 'block';
        ensureSocket();
        loadQr();
    }

    function closePanel() {
        if (panelEl) panelEl.style.display = 'none';
    }

    function init() {
        if (window.XIAOLIU_EMBED || document.body.classList.contains('xiaoliu-embed')) {
            return;
        }

        panelEl = document.getElementById('mapRemotePanel');
        statusEl = document.getElementById('mapRemoteStatus');
        qrEl = document.getElementById('mapRemoteQr');
        qrEmptyEl = document.getElementById('mapRemoteQrEmpty');
        urlEl = document.getElementById('mapRemoteUrl');

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
