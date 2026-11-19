/**
 * 跬步地图 · 手机镜像模式（?mirror=1）
 *
 * 手机打开与电脑相同的 AIsea.html，本脚本把手机上的视图、测量、底图操作
 * 同步到电脑端宿主（js/map_remote.js）。电脑端只做展示，不反向驱动手机。
 *
 * 依赖：js/map.js 的全局 map / measureLayer / measureDraw / measureActive /
 * currentMeasureType / activateMeasurement / deactivateMeasurement。
 */
(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    if (params.get('mirror') !== '1') return;

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

    let statusEl = null;
    let lastMeasureFeature = null;
    let syncingMeasure = false;

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

    function send(payload) {
        if (socket && socket.connected) socket.emit('map-cmd', payload);
    }

    // ---------------- 视图同步 ----------------
    function scheduleView() {
        if (applyingRemote) return;
        userMoved = true;
        if (viewTimer) return;
        const gap = APPLY_LOCK - (performance.now() - lastApplyAt);
        viewTimer = window.setTimeout(function () {
            viewTimer = null;
            sendView();
        }, gap > 0 ? gap + 20 : VIEW_THROTTLE);
    }

    function sendView() {
        if (!window.map || !window.ol) return;
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
        if (typeof measureActive !== 'undefined' && measureActive &&
            typeof currentMeasureType !== 'undefined' && currentMeasureType === type) {
            return;
        }
        window.activateMeasurement(type);
        syncToolbar();
    }

    function bindButtons() {
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

    // ---------------- 连接 ----------------
    function connect() {
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
            refreshStatus();
        });

        socket.on('connect_error', function () {
            ready = false;
            setStatus('中继连接失败，正在重试…', 'error');
        });

        socket.on('map-presence', function (payload) {
            if (!payload || typeof payload !== 'object') return;
            hostOnline = !!payload.host;
            refreshStatus();
        });

        socket.on('map-state', function (state) {
            if (!userMoved) applyRemoteState(state);
        });

        socket.on('map-cmd-result', function (res) {
            if (res && res.ok === false && res.reason === 'host-offline') {
                setStatus('电脑端未连接，操作未送达', 'error');
            }
        });
    }

    function init() {
        statusEl = document.getElementById('mirrorStatus');
        bindButtons();
        watchMeasureButtons();
        hookMeasure();
        syncToolbar();
        connect();

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
