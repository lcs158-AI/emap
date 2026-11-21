/* 小刘听写 · 词语粘贴与朗读控制 · v20261121k */
(function () {
    'use strict';

    const REPEAT_GAP_MS = 550;
    const speech = window.speechSynthesis || null;
    let voices = [];

    const els = {
        pasteBtn: document.getElementById('pasteBtn'),
        pageStatus: document.getElementById('pageStatus'),
        compatWarning: document.getElementById('compatWarning'),
        wordsInput: document.getElementById('wordsInput'),
        wordCount: document.getElementById('wordCount'),
        wordChips: document.getElementById('wordChips'),
        clearWordsBtn: document.getElementById('clearWordsBtn'),
        repeatCount: document.getElementById('repeatCount'),
        pauseSeconds: document.getElementById('pauseSeconds'),
        playbackDisplay: document.getElementById('playbackDisplay'),
        playbackKicker: document.getElementById('playbackKicker'),
        currentWord: document.getElementById('currentWord'),
        playbackDetail: document.getElementById('playbackDetail'),
        playbackProgress: document.getElementById('playbackProgress'),
        playbackProgressBar: document.getElementById('playbackProgressBar'),
        playbackPercent: document.getElementById('playbackPercent'),
        startBtn: document.getElementById('startBtn'),
        startButtonText: document.getElementById('startButtonText'),
        pauseBtn: document.getElementById('pauseBtn'),
        pauseButtonText: document.getElementById('pauseButtonText'),
        stopBtn: document.getElementById('stopBtn'),
        diagPanel: document.getElementById('diagPanel'),
        diagInfo: document.getElementById('diagInfo'),
        diagLog: document.getElementById('diagLog'),
        diagTip: document.getElementById('diagTip'),
        diagVoicesBtn: document.getElementById('diagVoicesBtn'),
        diagSpeakBtn: document.getElementById('diagSpeakBtn'),
        diagCopyBtn: document.getElementById('diagCopyBtn'),
        envHint: document.getElementById('envHint'),
        envHintTitle: document.getElementById('envHintTitle'),
        envHintText: document.getElementById('envHintText'),
        openHuaweiBtn: document.getElementById('openHuaweiBtn'),
        copyLinkBtn: document.getElementById('copyLinkBtn')
    };

    const state = {
        playing: false,
        paused: false,
        words: [],
        wordIndex: 0,
        repeatIndex: 0,
        repeatCount: 2,
        pauseSeconds: 3,
        totalReadings: 0,
        completedReadings: 0,
        phase: 'idle',
        runId: 0,
        timer: null,
        delayCallback: null,
        delayRemaining: 0,
        delayEndsAt: 0,
        delayLabel: '',
        retried: false
    };

    function setStatus(text, tone) {
        els.pageStatus.textContent = text;
        els.pageStatus.className = 'page-status' + (tone ? ' is-' + tone : '');
    }

    // ---------------- 语音诊断 ----------------
    const DIAG_MAX_LINES = 60;
    let diagLines = [];

    function diagStamp() {
        const now = new Date();
        function pad(value, size) { return String(value).padStart(size || 2, '0'); }
        return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + '.' + pad(now.getMilliseconds(), 3);
    }

    function diagLog(message) {
        diagLines.push(diagStamp() + ' ' + message);
        if (diagLines.length > DIAG_MAX_LINES) diagLines = diagLines.slice(-DIAG_MAX_LINES);
        if (!els.diagLog) return;
        els.diagLog.textContent = diagLines.join('\n');
        els.diagLog.scrollTop = els.diagLog.scrollHeight;
    }

    function voiceDetail() {
        loadVoices();
        const selected = selectChineseVoice();
        const lines = [];
        lines.push('语音合成：' + (speech ? '支持' : '不支持') + '　朗读对象：' +
            (typeof window.SpeechSynthesisUtterance === 'function' ? '支持' : '不支持'));
        if (speech) {
            lines.push('状态：speaking=' + speech.speaking + '　pending=' + speech.pending + '　paused=' + speech.paused);
            lines.push('语音总数：' + voices.length + '　中文语音：' +
                (selected ? selected.name + '（' + selected.lang + '）' : '未找到'));
            if (voices.length) {
                voices.forEach(function (voice) {
                    lines.push('· ' + voice.name + '｜' + voice.lang +
                        (voice.localService ? '｜本地' : '｜在线') + (voice.default ? '｜默认' : ''));
                });
            } else {
                lines.push('· 语音列表为空：系统未返回语音，或语音引擎尚未就绪');
            }
        }
        return lines.join('\n');
    }

    function renderDiagInfo(extra) {
        if (!els.diagInfo) return;
        const lines = [];
        lines.push('时间：' + new Date().toLocaleString('zh-CN'));
        lines.push('浏览器：' + (navigator.userAgent || '未知'));
        lines.push('协议：' + window.location.protocol + '　页面：' + (document.hidden ? '后台' : '前台'));
        lines.push(voiceDetail());
        if (extra) lines.push('最近一次：' + extra);
        if (isAndroidEdge()) {
            lines.push('建议：Edge 无中文语音时，改用华为自带浏览器，或在系统“文字转语音”中安装中文离线语音。');
        }
        els.diagInfo.textContent = lines.join('\n');
    }

    // ---------------- 浏览器环境提示 ----------------
    function isAndroidEdge() {
        return /android/i.test(navigator.userAgent) && /EdgA|Edg\//i.test(navigator.userAgent);
    }

    function copyText(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
            document.body.removeChild(area);
            if (ok) resolve(); else reject(new Error('copy-failed'));
        });
    }

    function showEnvHint(reason) {
        if (!els.envHint || !isAndroidEdge()) return;
        let title = '当前浏览器没有可用的中文语音';
        let text = '系统没有向 Edge 提供中文语音。请改用华为自带浏览器，或在系统“文字转语音”中安装中文离线语音。';
        if (reason === 'network') {
            title = '语音引擎联网失败（network）';
            text = 'Edge 尝试使用在线语音时被拦截。请改用华为自带浏览器，或在系统“文字转语音”中选择离线中文语音。';
        }
        els.envHintTitle.textContent = title;
        els.envHintText.textContent = text;
        els.envHint.hidden = false;
        diagLog('环境提示：' + title);
    }

    function copyPageLink(prefix) {
        const url = window.location.href;
        copyText(url).then(function () {
            setStatus((prefix || '链接已复制') + '，可在华为浏览器中粘贴打开。', 'success');
            diagLog('复制链接成功：' + url);
        }).catch(function () {
            els.envHintText.textContent = '复制失败，请手动复制这个地址：' + url;
            diagLog('复制链接失败，已显示地址');
        });
    }

    function openInHuaweiBrowser() {
        const url = window.location.href;
        const scheme = window.location.protocol === 'http:' ? 'http' : 'https';
        let leftPage = false;
        const onHidden = function () {
            if (document.hidden) leftPage = true;
        };
        document.addEventListener('visibilitychange', onHidden);
        diagLog('尝试唤起华为浏览器');
        try {
            window.location.href = 'intent://' + url.replace(/^https?:\/\//, '') +
                '#Intent;scheme=' + scheme +
                ';package=com.huawei.browser;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
        } catch (error) {
            diagLog('唤起华为浏览器异常：' + error.message);
        }
        window.setTimeout(function () {
            document.removeEventListener('visibilitychange', onHidden);
            if (!leftPage) copyPageLink('未能唤起华为浏览器，链接已复制');
        }, 2000);
    }

    function testSpeech() {
        if (els.diagPanel) els.diagPanel.open = true;
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            diagLog('测试朗读：当前浏览器不支持语音合成');
            renderDiagInfo('不支持语音合成');
            return;
        }
        loadVoices();
        const voice = selectChineseVoice();
        const utterance = new window.SpeechSynthesisUtterance('语音测试');
        if (voice) utterance.voice = voice;
        utterance.lang = voice ? voice.lang : 'zh-CN';
        diagLog('测试朗读：调用 speak，lang=' + utterance.lang +
            (voice ? '，voice=' + voice.name : '，voice=默认'));
        utterance.onstart = function () { diagLog('测试朗读：onstart，系统已开始发声'); };
        utterance.onend = function () {
            diagLog('测试朗读：onend，系统已读完');
            renderDiagInfo('测试朗读完成；若仍无声音，请检查媒体音量或系统语音输出');
        };
        utterance.onerror = function (event) {
            const reason = event && event.error ? String(event.error) : 'unknown';
            diagLog('测试朗读：onerror，错误码=' + reason);
            renderDiagInfo('测试朗读错误码：' + reason);
        };
        try {
            speech.speak(utterance);
        } catch (error) {
            diagLog('测试朗读：speak 抛出异常 ' + error.message);
            renderDiagInfo('speak 异常：' + error.message);
        }
    }

    function copyDiagnostics() {
        if (!els.diagInfo) return;
        const text = '小刘听写·语音诊断\n' + els.diagInfo.textContent +
            '\n\n事件记录：\n' + els.diagLog.textContent;
        function fallback() {
            const range = document.createRange();
            range.selectNodeContents(els.diagLog);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
            els.diagTip.textContent = '已选中文字，请长按选择“复制”。';
            diagLog('复制诊断：剪贴板不可用，已选中文本');
        }
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            fallback();
            return;
        }
        navigator.clipboard.writeText(text).then(function () {
            els.diagTip.textContent = '诊断信息已复制，可直接粘贴发送。';
            diagLog('复制诊断：成功，共 ' + text.length + ' 字');
        }).catch(function () {
            fallback();
        });
    }

    // ---------------- 词语解析与粘贴 ----------------
    function parseWords(text) {
        return String(text || '')
            .split(/[\s,，、;；]+/)
            .map(function (word) { return word.trim(); })
            .filter(Boolean);
    }

    // 行首“词语：”这类标签，以及“以下是图片中的词语”这类说明行，不属于听写词语。
    const PASTE_LABEL = /^[^：:]{0,20}[：:]\s*/;
    const PASTE_HEADER = /^(以下|下面|以上|上述|图中|图片|照片|识别|整理|列出|为你|我们|这些)/;

    function cleanPastedText(text) {
        const words = [];
        String(text || '').replace(/\r/g, '').split('\n').forEach(function (line) {
            const body = line.replace(PASTE_LABEL, '');
            body.split(/[\s,，、;；:：。.!！?？"'“”‘’()（）\[\]【】<>《》\/\\|]+/).forEach(function (item) {
                const word = (item.match(/[\u3400-\u9fff]/g) || []).join('');
                if (!word) return;
                if (word.length >= 4 && PASTE_HEADER.test(word)) return;
                words.push(word);
            });
        });
        return words.join(' ');
    }

    function applyPastedText(text) {
        const words = cleanPastedText(text);
        if (!words) {
            setStatus('没有找到汉字词语，请确认复制的内容是否正确。', 'error');
            return false;
        }
        if (state.playing) stopPlayback(false);
        els.wordsInput.value = words;
        refreshWords();
        resetPlaybackDisplay();
        setStatus('已粘贴 ' + parseWords(words).length + ' 个词语，请校对后开始听写。', 'success');
        return true;
    }

    function focusManualPaste() {
        setStatus('无法读取剪贴板，请长按下方输入框并选择“粘贴”。');
        const length = els.wordsInput.value.length;
        els.wordsInput.focus();
        els.wordsInput.setSelectionRange(length, length);
    }

    function pasteFromClipboard() {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
            focusManualPaste();
            return;
        }
        navigator.clipboard.readText().then(function (text) {
            applyPastedText(text);
        }).catch(function () {
            focusManualPaste();
        });
    }

    function renderWords(words, activeIndex) {
        const list = Array.isArray(words) ? words : [];
        const current = typeof activeIndex === 'number' ? activeIndex : -1;
        els.wordCount.textContent = list.length + ' 个词语';
        els.wordChips.innerHTML = '';

        if (!list.length) {
            const empty = document.createElement('span');
            empty.className = 'chips-empty';
            empty.textContent = '词语会按听写顺序显示在这里';
            els.wordChips.appendChild(empty);
            if (!state.playing) els.playbackDetail.textContent = '共 0 个词语';
            return;
        }

        list.forEach(function (word, index) {
            const chip = document.createElement('span');
            chip.className = 'word-chip';
            if (index === current) chip.classList.add('is-current');
            if (current >= 0 && index < current) chip.classList.add('is-done');
            chip.textContent = word;
            els.wordChips.appendChild(chip);
        });
        if (!state.playing && current < 0) els.playbackDetail.textContent = '共 ' + list.length + ' 个词语';
    }

    function refreshWords() {
        renderWords(parseWords(els.wordsInput.value));
    }

    function readInteger(input, min, max, fallback) {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, Math.round(value)));
    }

    function normalizeSettings() {
        state.repeatCount = readInteger(els.repeatCount, 1, 5, 2);
        state.pauseSeconds = readInteger(els.pauseSeconds, 0, 30, 3);
        els.repeatCount.value = state.repeatCount;
        els.pauseSeconds.value = state.pauseSeconds;
    }

    // ---------------- 朗读控制 ----------------
    function loadVoices() {
        if (!speech) return;
        voices = speech.getVoices();
    }

    function selectChineseVoice() {
        return voices.find(function (voice) { return /^zh[-_]CN/i.test(voice.lang); }) ||
            voices.find(function (voice) { return /^(zh|cmn)/i.test(voice.lang); }) || null;
    }

    function clearPlaybackTimer() {
        if (state.timer) window.clearTimeout(state.timer);
        state.timer = null;
    }

    function updatePlaybackProgress() {
        const percent = state.totalReadings ?
            Math.round(state.completedReadings / state.totalReadings * 100) : 0;
        els.playbackProgressBar.style.width = percent + '%';
        els.playbackPercent.textContent = percent + '%';
    }

    function updatePlaybackControls() {
        els.startButtonText.textContent = state.playing ? '重新开始' : '开始听写';
        els.pauseBtn.disabled = !state.playing;
        els.stopBtn.disabled = !state.playing;
        els.pauseButtonText.textContent = state.paused ? '继续' : '暂停';
        els.pauseBtn.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
        els.wordsInput.readOnly = state.playing;
        els.repeatCount.disabled = state.playing;
        els.pauseSeconds.disabled = state.playing;
        els.clearWordsBtn.disabled = state.playing;
    }

    function updateCurrentWordDisplay() {
        const word = state.words[state.wordIndex] || '';
        els.playbackKicker.textContent = '第 ' + (state.wordIndex + 1) + ' / ' + state.words.length + ' 个词语';
        els.currentWord.textContent = word;
        if (state.phase === 'waiting' && state.delayLabel) {
            els.playbackDetail.textContent = state.paused ? '已暂停，点击继续' : state.delayLabel;
        } else {
            els.playbackDetail.textContent = '本词第 ' + state.repeatIndex + ' / ' + state.repeatCount + ' 遍' +
                (state.paused ? ' · 已暂停' : '');
        }
        els.playbackDisplay.classList.add('is-active');
        els.playbackDisplay.classList.remove('is-complete');
        renderWords(state.words, state.wordIndex);
    }

    function resetPlaybackDisplay() {
        els.playbackDisplay.classList.remove('is-active', 'is-complete');
        els.playbackKicker.textContent = '准备就绪';
        els.currentWord.textContent = '等待开始';
        els.playbackDetail.textContent = '共 ' + parseWords(els.wordsInput.value).length + ' 个词语';
        els.playbackProgress.hidden = true;
        els.playbackProgressBar.style.width = '0%';
        els.playbackPercent.textContent = '0%';
    }

    function cancelPlayback() {
        state.runId += 1;
        clearPlaybackTimer();
        state.playing = false;
        state.paused = false;
        state.phase = 'idle';
        state.delayCallback = null;
        state.delayLabel = '';
        state.retried = false;
        const active = hasActiveSpeech();
        if (speech) {
            try { speech.cancel(); } catch (error) { /* 浏览器不支持取消时忽略 */ }
        }
        diagLog('停止或重置朗读：cancel()');
        updatePlaybackControls();
        return active;
    }

    function hasActiveSpeech() {
        if (!speech) return false;
        return !!(speech.speaking || speech.pending);
    }

    function stopPlayback(showMessage) {
        cancelPlayback();
        renderWords(parseWords(els.wordsInput.value));
        resetPlaybackDisplay();
        if (showMessage) {
            els.playbackKicker.textContent = '已停止';
            els.currentWord.textContent = '听写已结束';
            setStatus('已停止听写，点击“开始听写”可重新开始。');
        }
    }

    function finishPlayback(runId) {
        if (runId !== state.runId || !state.playing) return;
        state.runId += 1;
        clearPlaybackTimer();
        state.playing = false;
        state.paused = false;
        state.phase = 'idle';
        state.delayCallback = null;
        updatePlaybackControls();
        renderWords(state.words, state.words.length);
        els.playbackDisplay.classList.remove('is-active');
        els.playbackDisplay.classList.add('is-complete');
        els.playbackKicker.textContent = '全部完成';
        els.currentWord.textContent = '听写完成';
        els.playbackDetail.textContent = '共朗读 ' + state.completedReadings + ' 遍，记得检查书写';
        updatePlaybackProgress();
        setStatus('本次听写已完成。', 'success');
    }

    function scheduleDelay(milliseconds, runId, callback, label) {
        if (runId !== state.runId || !state.playing) return;
        clearPlaybackTimer();
        state.phase = 'waiting';
        state.delayCallback = callback;
        state.delayRemaining = Math.max(0, milliseconds);
        state.delayEndsAt = Date.now() + state.delayRemaining;
        state.delayLabel = label || '';
        updateCurrentWordDisplay();
        if (state.paused) return;

        state.timer = window.setTimeout(function () {
            const next = state.delayCallback;
            state.timer = null;
            state.delayCallback = null;
            state.phase = 'idle';
            if (runId !== state.runId || !state.playing || state.paused || !next) return;
            next();
        }, state.delayRemaining);
    }

    function speakCurrent(runId) {
        if (runId !== state.runId || !state.playing || state.paused) return;
        if (state.wordIndex >= state.words.length) {
            finishPlayback(runId);
            return;
        }

        state.phase = 'speaking';
        state.delayLabel = '';
        state.repeatIndex += 1;
        updateCurrentWordDisplay();

        const utterance = new window.SpeechSynthesisUtterance(state.words[state.wordIndex]);
        const chineseVoice = selectChineseVoice();
        if (chineseVoice) utterance.voice = chineseVoice;
        utterance.lang = chineseVoice ? chineseVoice.lang : 'zh-CN';
        utterance.rate = 0.82;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = function () {
            if (runId !== state.runId) return;
            diagLog('onstart：' + state.words[state.wordIndex] + '（第 ' + state.repeatIndex + ' 遍）');
        };

        utterance.onend = function () {
            if (runId !== state.runId || !state.playing) return;
            diagLog('onend：' + state.words[state.wordIndex] + '（第 ' + state.repeatIndex + ' 遍）');
            state.retried = false;
            state.completedReadings += 1;
            updatePlaybackProgress();

            if (state.repeatIndex < state.repeatCount) {
                scheduleDelay(REPEAT_GAP_MS, runId, function () { speakCurrent(runId); }, '');
            } else if (state.wordIndex < state.words.length - 1) {
                scheduleDelay(state.pauseSeconds * 1000, runId, function () {
                    state.wordIndex += 1;
                    state.repeatIndex = 0;
                    speakCurrent(runId);
                }, '词语停顿中，请继续书写');
            } else {
                scheduleDelay(0, runId, function () { finishPlayback(runId); }, '');
            }
        };

        utterance.onerror = function (event) {
            if (runId !== state.runId || !state.playing) return;
            const reason = event && event.error ? String(event.error) : 'unknown';
            console.error('语音朗读失败：', reason);
            diagLog('onerror：错误码=' + reason);
            renderDiagInfo('朗读错误码：' + reason);
            if (els.diagPanel) els.diagPanel.open = true;
            if (reason === 'network') {
                showEnvHint('network');
            } else if (!voices.length) {
                showEnvHint('no-voice');
            }

            // 系统抢占或取消造成的轻微错误：同一次朗读自动重试一次，不打断整场听写。
            if ((reason === 'canceled' || reason === 'interrupted') && !state.retried) {
                state.retried = true;
                state.repeatIndex = Math.max(0, state.repeatIndex - 1);
                state.phase = 'idle';
                scheduleDelay(260, runId, function () { speakCurrent(runId); }, '正在重新朗读');
                return;
            }

            stopPlayback(false);
            els.playbackKicker.textContent = '朗读中断';
            els.currentWord.textContent = '请重试';
            if (reason === 'not-allowed') {
                setStatus('浏览器阻止了语音播放，请确认手机未静音并允许媒体播放后重试。', 'error');
            } else if (reason === 'language-unavailable' || reason === 'voice-unavailable') {
                setStatus('当前设备缺少中文语音，请在系统设置中安装中文语音后重试。', 'error');
            } else {
                setStatus('语音朗读失败（' + reason + '），请检查设备语音设置后重试。', 'error');
            }
        };

        if (speech.paused) {
            try { speech.resume(); } catch (error) { /* 忽略设备差异 */ }
        }

        diagLog('调用 speak：' + state.words[state.wordIndex] + '（第 ' + state.repeatIndex + ' 遍），lang=' +
            utterance.lang + (utterance.voice ? '，voice=' + utterance.voice.name : '，voice=默认'));
        try {
            speech.speak(utterance);
        } catch (error) {
            diagLog('speak 抛出异常：' + error.message);
            utterance.onerror({ error: error.message });
        }
    }

    function startPlayback() {
        normalizeSettings();
        const words = parseWords(els.wordsInput.value);
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            setStatus('当前浏览器不支持语音朗读，请使用推荐的手机浏览器。', 'error');
            return;
        }
        if (!words.length) {
            setStatus('请先粘贴或输入至少一个听写词语。', 'error');
            els.wordsInput.focus();
            return;
        }

        const wasSpeaking = cancelPlayback();
        loadVoices();
        state.words = words;
        state.wordIndex = 0;
        state.repeatIndex = 0;
        state.totalReadings = words.length * state.repeatCount;
        state.completedReadings = 0;
        state.playing = true;
        state.paused = false;
        state.phase = 'idle';
        const runId = state.runId;

        els.playbackProgress.hidden = false;
        updatePlaybackProgress();
        updatePlaybackControls();
        els.playbackKicker.textContent = '即将开始';
        els.currentWord.textContent = '准备好纸笔';
        els.playbackDetail.textContent = words.length + ' 个词语 · 每词 ' + state.repeatCount + ' 遍 · 停顿 ' + state.pauseSeconds + ' 秒';
        els.playbackDisplay.classList.add('is-active');
        els.playbackDisplay.classList.remove('is-complete');
        renderWords(state.words, 0);
        setStatus('正在听写，可随时暂停或停止。', 'success');
        diagLog('开始听写：' + words.length + ' 个词语，每词 ' + state.repeatCount + ' 遍，停顿 ' + state.pauseSeconds + ' 秒');
        renderDiagInfo();
        if (isAndroidEdge() && !voices.length) showEnvHint('no-voice');
        if (wasSpeaking) {
            // 刚取消上一段语音时，部分 Android 浏览器需要短暂间隔才能接受新的朗读。
            scheduleDelay(180, runId, function () { speakCurrent(runId); }, '即将开始朗读');
        } else {
            // 直接朗读以保留点击手势，避免手机浏览器把语音当作自动播放拦截。
            speakCurrent(runId);
        }
    }

    function pauseOrResumePlayback() {
        if (!state.playing) return;
        if (!state.paused) {
            state.paused = true;
            if (state.phase === 'waiting') {
                if (state.timer) {
                    state.delayRemaining = Math.max(0, state.delayEndsAt - Date.now());
                    clearPlaybackTimer();
                }
            } else if (state.phase === 'speaking') {
                try { speech.pause(); } catch (error) { /* 忽略设备差异 */ }
                diagLog('暂停朗读：pause()');
            }
        } else {
            state.paused = false;
            if (state.phase === 'speaking') {
                try { speech.resume(); } catch (error) { /* 忽略设备差异 */ }
                diagLog('继续朗读：resume()');
            } else if (state.phase === 'waiting' && state.delayCallback) {
                const callback = state.delayCallback;
                scheduleDelay(state.delayRemaining, state.runId, callback, state.delayLabel);
            }
        }
        updatePlaybackControls();
        updateCurrentWordDisplay();
    }

    function checkCapabilities() {
        const warnings = [];
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            warnings.push('当前浏览器不支持语音朗读，请改用 Android Chrome / Edge 或 iPhone / iPad Safari。');
        }
        if (window.location.protocol === 'file:') {
            warnings.push('请通过 HTTPS 或本地 HTTP 服务打开页面，否则浏览器会限制读取剪贴板。');
        }
        els.compatWarning.textContent = warnings.join(' ');
        els.compatWarning.hidden = !warnings.length;
    }

    els.wordsInput.addEventListener('input', function () {
        refreshWords();
        if (!state.playing) resetPlaybackDisplay();
    });
    els.wordsInput.addEventListener('paste', function (event) {
        const clipboard = event.clipboardData;
        const text = clipboard && clipboard.getData('text');
        if (state.playing || !text || !/[\u3400-\u9fff]/.test(text)) return;
        const words = cleanPastedText(text);
        if (!words) return;
        event.preventDefault();
        const start = els.wordsInput.selectionStart;
        const end = els.wordsInput.selectionEnd;
        const before = els.wordsInput.value.slice(0, start);
        const prefix = before && !/\s$/.test(before) ? ' ' : '';
        els.wordsInput.setRangeText(prefix + words, start, end, 'end');
        els.wordsInput.dispatchEvent(new Event('input', { bubbles: true }));
        setStatus('已粘贴词语，请校对后开始听写。', 'success');
    });
    els.pasteBtn.addEventListener('click', pasteFromClipboard);
    els.clearWordsBtn.addEventListener('click', function () {
        if (state.playing) return;
        els.wordsInput.value = '';
        refreshWords();
        resetPlaybackDisplay();
        setStatus('内容已清空，可以重新粘贴词语。');
        els.wordsInput.focus();
    });
    els.repeatCount.addEventListener('change', normalizeSettings);
    els.pauseSeconds.addEventListener('change', normalizeSettings);
    els.startBtn.addEventListener('click', startPlayback);
    els.pauseBtn.addEventListener('click', pauseOrResumePlayback);
    els.stopBtn.addEventListener('click', function () { stopPlayback(true); });
    els.diagVoicesBtn.addEventListener('click', function () {
        renderDiagInfo();
        diagLog('检测语音：共 ' + voices.length + ' 条');
    });
    els.diagSpeakBtn.addEventListener('click', testSpeech);
    els.diagCopyBtn.addEventListener('click', copyDiagnostics);
    els.openHuaweiBtn.addEventListener('click', openInHuaweiBrowser);
    els.copyLinkBtn.addEventListener('click', function () { copyPageLink(); });

    document.addEventListener('visibilitychange', function () {
        diagLog('页面可见性：' + (document.hidden ? '后台' : '前台'));
        if (document.hidden && state.playing) {
            stopPlayback(false);
            setStatus('页面进入后台，听写已停止。');
        }
    });
    window.addEventListener('pagehide', function () {
        if (speech) {
            try { speech.cancel(); } catch (error) { /* 忽略 */ }
        }
    });

    if (speech) {
        loadVoices();
        const onVoicesChanged = function () {
            loadVoices();
            diagLog('语音列表更新：共 ' + voices.length + ' 条');
            renderDiagInfo();
        };
        if (typeof speech.addEventListener === 'function') {
            speech.addEventListener('voiceschanged', onVoicesChanged);
        } else {
            speech.onvoiceschanged = onVoicesChanged;
        }
    }

    refreshWords();
    normalizeSettings();
    updatePlaybackControls();
    checkCapabilities();
    renderDiagInfo();
})();
