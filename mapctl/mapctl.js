/**
 * 跬步地图 · 手机遥控（控制器）
 *
 * 中继：FastAPI /map 命名空间
 * -> map-join {role:'controller'}
 * -> map-cmd  {action:'pan'|'zoom'|'rotate'|'reset'|'locate'|'base'|'measure', ...}
 * <- map-state / map-presence / map-cmd-result
 */
(function () {
    'use strict';

    const DEFAULT_SERVER = 'https://lzy-fastapi.onrender.com';
    const JOY_DEAD_ZONE = 0.12;

    let socket = null;
    let connected = false;
    let hostOnline = false;

    const els = {};
    const joy = {
        active: false,
        pointerId: null,
        vx: 0,
        vy: 0,
        timer: null
    };

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    function normalizeServer(raw) {
        if (!raw) return DEFAULT_SERVER;
        const value = String(raw).trim();
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
        return DEFAULT_SERVER;
    }

    const SERVER = getServer();

    function setStatus(text, tone) {
        if (!els.statusText || !els.statusDot) return;
        els.statusText.textContent = text;
        els.statusDot.className = 'dot' + (tone ? ' ' + tone : '');
    }

    function setHostBar(text, online) {
        if (!els.hostBar) return;
        els.hostBar.textContent = text;
        els.hostBar.classList.toggle('online', !!online);
    }

    let toastTimer = null;
    function toast(text) {
        if (!els.toast) return;
        els.toast.textContent = text;
        els.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
            els.toast.classList.remove('show');
        }, 1800);
    }

    function vibrate(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
        }
    }

    function emitCmd(payload) {
        if (!socket || !socket.connected) {
            toast('未连接中继');
            return false;
        }
        socket.emit('map-cmd', payload);
        return true;
    }

    function connect() {
        if (typeof window.io !== 'function') {
            setStatus('socket.io 未加载', 'error');
            return;
        }
        socket = window.io(SERVER + '/map', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 12000
        });

        socket.on('connect', function () {
            connected = true;
            setStatus('已连接', 'online');
            socket.emit('map-join', { role: 'controller' });
        });

        socket.on('disconnect', function () {
            connected = false;
            hostOnline = false;
            setStatus('连接断开', 'error');
            setHostBar('电脑端未连接');
            stopAllControls();
        });

        socket.on('connect_error', function () {
            connected = false;
            setStatus('连接失败', 'error');
        });

        socket.on('map-presence', function (payload) {
            if (!payload || typeof payload !== 'object') return;
            hostOnline = !!payload.host;
            if (hostOnline) {
                setHostBar('电脑端在线', true);
                setStatus('已连接', 'online');
            } else {
                setHostBar('电脑端未连接，请先打开跬步地图');
                if (connected) setStatus('等待电脑端', '');
            }
        });

        socket.on('map-state', applyState);

        socket.on('map-cmd-result', function (payload) {
            if (payload && payload.ok === false) {
                if (payload.reason === 'host-offline') {
                    toast('电脑端未连接');
                } else {
                    toast('操作未生效');
                }
            }
        });
    }

    function applyState(state) {
        if (!state || typeof state !== 'object') return;
        const center = Array.isArray(state.center) ? state.center : null;
        if (center && center.length === 2 && els.viewInfo) {
            els.viewInfo.textContent =
                '中心 ' + Number(center[0]).toFixed(4) + ', ' +
                Number(center[1]).toFixed(4) +
                ' · 缩放 ' + Number(state.zoom || 0).toFixed(1);
        }
        if (els.baseBtn) {
            const imagery = state.base === 'imagery';
            els.baseBtn.classList.toggle('active', imagery);
            els.baseBtn.textContent = imagery ? '影像' : '矢量';
        }
        if (els.measureLengthBtn) {
            els.measureLengthBtn.classList.toggle('active', state.measure === 'length');
        }
        if (els.measureAreaBtn) {
            els.measureAreaBtn.classList.toggle('active', state.measure === 'area');
        }
    }

    function sendPan() {
        if (!connected) return;
        socket.emit('map-cmd', {
            action: 'pan',
            vx: Number(joy.vx.toFixed(3)),
            vy: Number(joy.vy.toFixed(3))
        });
    }

    function joyCenter() {
        const rect = els.joystick.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            max: Math.max(20, rect.width / 2 - 34)
        };
    }

    function updateJoystick(clientX, clientY) {
        const c = joyCenter();
        let dx = clientX - c.x;
        let dy = clientY - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > c.max) {
            dx = dx / dist * c.max;
            dy = dy / dist * c.max;
        }
        if (els.joystickKnob) {
            els.joystickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        }
        let vx = dx / c.max;
        let vy = -dy / c.max;
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag < JOY_DEAD_ZONE) {
            vx = 0;
            vy = 0;
        }
        joy.vx = clamp(vx, -1, 1);
        joy.vy = clamp(vy, -1, 1);
        sendPan();
    }

    function resetJoystick() {
        joy.vx = 0;
        joy.vy = 0;
        if (els.joystickKnob) {
            els.joystickKnob.style.transform = 'translate(0,0)';
        }
        if (connected) sendPan();
    }

    function startJoystick(event) {
        if (joy.active) return;
        joy.active = true;
        joy.pointerId = event.pointerId;
        els.joystick.setPointerCapture(event.pointerId);
        updateJoystick(event.clientX, event.clientY);
        clearInterval(joy.timer);
        joy.timer = window.setInterval(sendPan, 60);
        event.preventDefault();
    }

    function moveJoystick(event) {
        if (!joy.active || event.pointerId !== joy.pointerId) return;
        updateJoystick(event.clientX, event.clientY);
        event.preventDefault();
    }

    function endJoystick(event) {
        if (!joy.active) return;
        if (event && event.pointerId !== joy.pointerId) return;
        joy.active = false;
        joy.pointerId = null;
        clearInterval(joy.timer);
        joy.timer = null;
        resetJoystick();
    }

    function bindHold(el, name, dir) {
        let active = false;
        let pointerId = null;
        let timer = null;

        function start(event) {
            if (active) return;
            active = true;
            pointerId = event.pointerId;
            el.setPointerCapture(event.pointerId);
            vibrate(10);
            socket && socket.emit('map-cmd', { action: name, dir: dir, active: true });
            clearInterval(timer);
            timer = window.setInterval(function () {
                socket && socket.emit('map-cmd', { action: name, dir: dir, active: true });
            }, 350);
            event.preventDefault();
        }

        function stop(event) {
            if (!active) return;
            if (event && event.pointerId !== pointerId) return;
            active = false;
            pointerId = null;
            clearInterval(timer);
            timer = null;
            socket && socket.emit('map-cmd', { action: name, dir: dir, active: false });
        }

        el.addEventListener('pointerdown', start);
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointercancel', stop);
        el.addEventListener('lostpointercapture', stop);
        window.addEventListener('blur', function () { stop(); });
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    function stopAllControls() {
        if (joy.active || joy.timer) {
            joy.active = false;
            joy.pointerId = null;
            clearInterval(joy.timer);
            joy.timer = null;
            resetJoystick();
        }
        if (socket && socket.connected) {
            socket.emit('map-cmd', { action: 'zoom', dir: 1, active: false });
            socket.emit('map-cmd', { action: 'rotate', dir: 1, active: false });
        }
    }

    function doLocate() {
        if (!navigator.geolocation) {
            emitCmd({ action: 'locate' });
            toast('已请求电脑端定位');
            return;
        }
        toast('正在获取手机位置…');
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                emitCmd({
                    action: 'locate',
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude
                });
                toast('已发送手机位置');
            },
            function () {
                emitCmd({ action: 'locate' });
                toast('手机定位不可用，已改用电脑定位');
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
    }

    function changeServer() {
        const value = window.prompt('中继地址（例如 https://lzy-fastapi.onrender.com）', SERVER);
        if (!value) return;
        const normalized = normalizeServer(value);
        try { localStorage.setItem('map_remote_server', normalized); } catch (e) { /* ignore */ }
        window.location.reload();
    }

    function initServerButton() {
        if (!els.serverBtn) return;
        let timer = null;
        let longPressed = false;

        els.serverBtn.addEventListener('pointerdown', function () {
            longPressed = false;
            timer = window.setTimeout(function () {
                longPressed = true;
                changeServer();
            }, 800);
        });

        function clear() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }

        els.serverBtn.addEventListener('pointerup', function () {
            clear();
            if (!longPressed) toast('中继：' + SERVER);
        });
        els.serverBtn.addEventListener('pointercancel', clear);
        els.serverBtn.addEventListener('pointerleave', clear);
        els.serverBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    function bindButtons() {
        els.resetBtn && els.resetBtn.addEventListener('click', function () {
            vibrate(12);
            emitCmd({ action: 'reset' });
            toast('已复位');
        });

        els.locateBtn && els.locateBtn.addEventListener('click', function () {
            vibrate(12);
            doLocate();
        });

        els.baseBtn && els.baseBtn.addEventListener('click', function () {
            vibrate(12);
            emitCmd({ action: 'base' });
            toast('已切换底图');
        });

        els.measureLengthBtn && els.measureLengthBtn.addEventListener('click', function () {
            vibrate(12);
            emitCmd({ action: 'measure', mode: 'length' });
            toast('测长：请在电脑地图上单击加点');
        });

        els.measureAreaBtn && els.measureAreaBtn.addEventListener('click', function () {
            vibrate(12);
            emitCmd({ action: 'measure', mode: 'area' });
            toast('测面：请在电脑地图上单击加点');
        });

        els.measureOffBtn && els.measureOffBtn.addEventListener('click', function () {
            vibrate(12);
            emitCmd({ action: 'measure', mode: 'off' });
            toast('已关闭测量');
        });
    }

    function init() {
        els.statusText = document.getElementById('statusText');
        els.statusDot = document.getElementById('statusDot');
        els.hostBar = document.getElementById('hostBar');
        els.joystick = document.getElementById('joystick');
        els.joystickKnob = document.getElementById('joystickKnob');
        els.zoomIn = document.getElementById('zoomIn');
        els.zoomOut = document.getElementById('zoomOut');
        els.rotateLeft = document.getElementById('rotateLeft');
        els.rotateRight = document.getElementById('rotateRight');
        els.resetBtn = document.getElementById('resetBtn');
        els.locateBtn = document.getElementById('locateBtn');
        els.baseBtn = document.getElementById('baseBtn');
        els.measureLengthBtn = document.getElementById('measureLengthBtn');
        els.measureAreaBtn = document.getElementById('measureAreaBtn');
        els.measureOffBtn = document.getElementById('measureOffBtn');
        els.serverBtn = document.getElementById('serverBtn');
        els.viewInfo = document.getElementById('viewInfo');
        els.toast = document.getElementById('toast');

        if (els.joystick) {
            els.joystick.addEventListener('pointerdown', startJoystick);
            els.joystick.addEventListener('pointermove', moveJoystick);
            els.joystick.addEventListener('pointerup', endJoystick);
            els.joystick.addEventListener('pointercancel', endJoystick);
            els.joystick.addEventListener('lostpointercapture', endJoystick);
            els.joystick.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        }

        bindHold(els.zoomIn, 'zoom', 1);
        bindHold(els.zoomOut, 'zoom', -1);
        bindHold(els.rotateLeft, 'rotate', -1);
        bindHold(els.rotateRight, 'rotate', 1);
        bindButtons();
        initServerButton();

        document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
        document.addEventListener('dblclick', function (e) { e.preventDefault(); });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stopAllControls();
        });
        window.addEventListener('blur', stopAllControls);
        window.addEventListener('pagehide', function () {
            if (socket) socket.disconnect();
        });

        setHostBar('电脑端未连接');
        setStatus('连接中…');
        connect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
