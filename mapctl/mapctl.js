/**
 * 跬步地图 · 手机遥控（简易控制器）· v20261124a
 *
 * 中继：FastAPI /map 命名空间
 * -> map-join {role:'controller', access, clientToken, device}
 * -> map-cmd  {action:'pan'|'zoom'|'locate'|'base', ...}
 * <- map-state / map-presence / map-cmd-result / map-join-result / map-join-restored / map-kicked
 */
(function () {
    'use strict';

    const DEFAULT_SERVER = 'https://lzy-fastapi.onrender.com';
    const CLIENT_TOKEN_KEY = 'xliu.remoteToken';
    const JOIN_TIMEOUT_MS = 60_000;
    const JOY_DEAD_ZONE = 0.12;

    let socket = null;
    let connected = false;
    let hostOnline = false;

    // 接入状态：joining（等待审批）| connected（已接入）| rejected | occupied | bad-access | kicked
    let joinState = 'idle';
    let joinTimerId = null;
    let joinOverlay = null;

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
    const URL_ACCESS = new URLSearchParams(window.location.search).get('access');

    function getOrGenClientToken() {
        try {
            let token = sessionStorage.getItem(CLIENT_TOKEN_KEY);
            if (token) return token;
            // 使用 crypto.randomUUID 作为 token，长度够、碰撞低
            if (window.crypto && window.crypto.randomUUID) {
                token = 'u-' + window.crypto.randomUUID().replace(/-/g, '');
            } else {
                // 兜底
                token = 'u-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
            }
            sessionStorage.setItem(CLIENT_TOKEN_KEY, token);
            return token;
        } catch (e) {
            // sessionStorage 不可用：每次刷新都当新设备（体验差但能工作）
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
        else if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Mac OS X/i.test(ua)) os = 'macOS';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/HarmonyOS/i.test(ua)) os = 'HarmonyOS';

        return {
            browser: browser,
            os: os,
            width: Math.floor(window.innerWidth || 0),
            height: Math.floor(window.innerHeight || 0),
            dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10
        };
    }

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

    // ---------------- 接入状态弹层 ----------------
    function closeJoinOverlay() {
        if (joinOverlay) joinOverlay.style.display = 'none';
    }

    function showJoinOverlay(kind, reason) {
        if (!joinOverlay) return;
        joinOverlay.style.display = 'flex';
        const titleEl = joinOverlay.querySelector('[data-title]');
        const descEl = joinOverlay.querySelector('[data-desc]');
        const cancelBtn = joinOverlay.querySelector('[data-cancel]');
        const retryBtn = joinOverlay.querySelector('[data-retry]');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (retryBtn) retryBtn.style.display = 'none';

        if (kind === 'waiting') {
            if (titleEl) titleEl.textContent = '等待电脑端确认';
            if (descEl) descEl.textContent = '已发送接入请求，请在电脑端点击「允许」';
            if (cancelBtn) cancelBtn.style.display = 'block';
        } else if (kind === 'rejected') {
            if (titleEl) titleEl.textContent = '电脑端已拒绝';
            if (descEl) descEl.textContent = '电脑端未允许接入';
            if (retryBtn) retryBtn.style.display = 'block';
        } else if (kind === 'occupied') {
            if (titleEl) titleEl.textContent = '电脑端已有手机接入';
            if (descEl) descEl.textContent = '同一时刻只允许一台手机接入，请稍后再试';
            if (retryBtn) retryBtn.style.display = 'block';
        } else if (kind === 'bad-access') {
            if (titleEl) titleEl.textContent = '链接已失效';
            if (descEl) descEl.textContent = '请在电脑端重新生成二维码后再次扫码';
            if (retryBtn) retryBtn.style.display = 'block';
        } else if (kind === 'kicked') {
            if (titleEl) titleEl.textContent = '已被电脑端断开';
            if (descEl) descEl.textContent = '电脑端已重置接入状态';
            if (retryBtn) retryBtn.style.display = 'block';
        } else if (kind === 'timeout') {
            if (titleEl) titleEl.textContent = '等待超时';
            if (descEl) descEl.textContent = '电脑端未在规定时间内响应，请重试';
            if (retryBtn) retryBtn.style.display = 'block';
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

    // ---------------- 发送指令 ----------------
    function emitCmd(payload) {
        if (joinState !== 'connected') {
            toast('尚未接入电脑端');
            return false;
        }
        if (!socket || !socket.connected) {
            toast('未连接中继');
            return false;
        }
        socket.emit('map-cmd', payload);
        return true;
    }

    function retryJoin() {
        if (!URL_ACCESS) {
            // 没有 access token（用户手开）：让刷新页面重新生成
            window.location.reload();
            return;
        }
        joinState = 'idle';
        if (socket) {
            try { socket.disconnect(); } catch (e) {}
            socket = null;
        }
        connect();
    }

    // ---------------- 连接中继 ----------------
    function connect() {
        if (typeof window.io !== 'function') {
            setStatus('socket.io 未加载', 'error');
            return;
        }
        ensureJoinOverlay();

        socket = window.io(SERVER + '/map', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 12000
        });

        socket.on('connect', function () {
            connected = true;
            if (!URL_ACCESS) {
                joinState = 'bad-access';
                setStatus('链接无效', 'error');
                showJoinOverlay('bad-access');
                return;
            }
            joinState = 'joining';
            setStatus('等待电脑端确认', '');
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
                device: getDeviceInfo()
            });
        });

        socket.on('disconnect', function () {
            connected = false;
            hostOnline = false;
            if (joinState !== 'connected') joinState = 'idle';
            setStatus('连接断开', 'error');
            setHostBar('电脑端未连接');
            stopAllControls();
            closeJoinOverlay();
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
            } else {
                setHostBar('电脑端未连接，请先打开跬步地图');
            }
        });

        socket.on('map-state', applyState);

        socket.on('map-cmd-result', function (payload) {
            if (payload && payload.ok === false) {
                if (payload.reason === 'host-offline') {
                    toast('电脑端未连接');
                } else if (payload.reason === 'not-authorized') {
                    toast('尚未接入电脑端');
                } else {
                    toast('操作未生效');
                }
            }
        });

        // 新安全模型回执
        socket.on('map-join-result', function (res) {
            if (!res || typeof res !== 'object') return;
            if (joinTimerId) { window.clearTimeout(joinTimerId); joinTimerId = null; }
            if (res.ok) {
                joinState = 'connected';
                closeJoinOverlay();
                setStatus('已接入', 'online');
                vibrate(20);
                toast(res.restored ? '已恢复连接' : '已接入，可开始遥控');
            } else {
                joinState = 'rejected';
                const reason = res.reason || 'unknown';
                if (reason === 'occupied') {
                    joinState = 'occupied';
                    showJoinOverlay('occupied');
                } else if (reason === 'bad-access-token') {
                    joinState = 'bad-access';
                    showJoinOverlay('bad-access');
                } else if (reason === 'rate-limited') {
                    showJoinOverlay('timeout');
                } else if (reason === 'superseded') {
                    joinState = 'kicked';
                    showJoinOverlay('kicked');
                } else {
                    joinState = 'rejected';
                    showJoinOverlay('rejected');
                }
                setStatus('接入失败', 'error');
            }
        });

        socket.on('map-join-restored', function () {
            joinState = 'connected';
            closeJoinOverlay();
            if (joinTimerId) { window.clearTimeout(joinTimerId); joinTimerId = null; }
            setStatus('已恢复', 'online');
        });

        socket.on('map-kicked', function () {
            joinState = 'kicked';
            closeJoinOverlay();
            showJoinOverlay('kicked');
            setStatus('已被断开', 'error');
            stopAllControls();
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
    }

    function sendPan() {
        if (!connected || joinState !== 'connected') return;
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
            if (joinState !== 'connected') { toast('尚未接入电脑端'); return; }
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
        if (joinState === 'connected' && socket && socket.connected) {
            socket.emit('map-cmd', { action: 'zoom', dir: 1, active: false });
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
        els.locateBtn && els.locateBtn.addEventListener('click', function () {
            vibrate(12);
            doLocate();
        });

        els.baseBtn && els.baseBtn.addEventListener('click', function () {
            vibrate(12);
            emitCmd({ action: 'base' });
            toast('已切换底图');
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
        els.locateBtn = document.getElementById('locateBtn');
        els.baseBtn = document.getElementById('baseBtn');
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
        ensureJoinOverlay();
        connect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
