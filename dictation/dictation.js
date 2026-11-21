/* 小刘听写 · 词语粘贴与朗读控制 · v20261122b */
(function () {
    'use strict';

    const REPEAT_GAP_MS = 550;
    const DEFAULT_TTS_SERVER = 'https://lzy-fastapi.onrender.com';
    const TTS_VOLUME = 50;
    const TTS_ZH_VOICE = 'zh-CN-XiaoxiaoNeural';
    const TTS_EN_VOICE = 'en-US-AriaNeural';
    const AUDIO_CACHE_LIMIT = 80;
    const speech = window.speechSynthesis || null;
    let voices = [];

    const els = {
        pasteBtn: document.getElementById('pasteBtn'),
        pasteEnBtn: document.getElementById('pasteEnBtn'),
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
        voiceMode: document.getElementById('voiceMode'),
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
        diagCopyBtn: document.getElementById('diagCopyBtn')
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
        retried: false,
        engine: 'web',
        audio: null
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
        lines.push('发声方式：' + (state.engine === 'server' ? '后端语音（' + ttsServer() + '）' : '前端语音'));
        lines.push(voiceDetail());
        if (extra) lines.push('最近一次：' + extra);
        els.diagInfo.textContent = lines.join('\n');
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

    function cleanChineseText(text) {
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

    // 英文模式只保留字母单词，中文、编号、标点都会丢弃。
    function cleanEnglishText(text) {
        const words = [];
        String(text || '').replace(/\r/g, '').split('\n').forEach(function (line) {
            const body = line.replace(PASTE_LABEL, '').trim();
            if (PASTE_HEADER.test(body)) return;
            (body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).forEach(function (word) {
                words.push(word);
            });
        });
        return words.join(' ');
    }

    function cleanPastedText(text, mode) {
        return mode === 'en' ? cleanEnglishText(text) : cleanChineseText(text);
    }

    function applyPastedText(text, mode) {
        const isEnglish = mode === 'en';
        const words = cleanPastedText(text, mode);
        if (!words) {
            setStatus(isEnglish ? '没有找到英文单词，请确认复制的内容是否正确。'
                : '没有找到汉字词语，请确认复制的内容是否正确。', 'error');
            return false;
        }
        if (state.playing) stopPlayback(false);
        els.wordsInput.value = words;
        refreshWords();
        resetPlaybackDisplay();
        setStatus('已粘贴 ' + parseWords(words).length + ' 个' +
            (isEnglish ? '英文单词' : '中文词语') + '，请校对后开始听写。', 'success');
        return true;
    }

    function focusManualPaste() {
        setStatus('无法读取剪贴板，请长按下方输入框并选择“粘贴”。');
        const length = els.wordsInput.value.length;
        els.wordsInput.focus();
        els.wordsInput.setSelectionRange(length, length);
    }

    function pasteFromClipboard(mode) {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
            focusManualPaste();
            return;
        }
        navigator.clipboard.readText().then(function (text) {
            applyPastedText(text, mode);
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

    // ---------------- 后端语音（Edge TTS） ----------------
    function ttsServer() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('server');
        if (fromUrl && /^https?:\/\//i.test(fromUrl)) {
            const value = fromUrl.replace(/\/+$/, '');
            try { localStorage.setItem('dictation_tts_server', value); } catch (error) { /* 忽略 */ }
            return value;
        }
        try {
            const stored = localStorage.getItem('dictation_tts_server');
            if (stored && /^https?:\/\//i.test(stored)) return stored.replace(/\/+$/, '');
        } catch (error) { /* 忽略 */ }
        return DEFAULT_TTS_SERVER;
    }

    const audioCache = new Map();
    const pendingAudio = new Map();

    function isEnglishWord(word) {
        return /^[A-Za-z'’-]+$/.test(word);
    }

    function serverVoice(word) {
        return isEnglishWord(word) ? TTS_EN_VOICE : TTS_ZH_VOICE;
    }

    function trimAudioCache() {
        while (audioCache.size > AUDIO_CACHE_LIMIT) {
            const oldest = audioCache.keys().next().value;
            try { URL.revokeObjectURL(audioCache.get(oldest)); } catch (error) { /* 忽略 */ }
            audioCache.delete(oldest);
        }
    }

    function fetchServerAudio(word) {
        const voice = serverVoice(word);
        const key = voice + '|' + word;
        if (audioCache.has(key)) {
            diagLog('音频缓存命中：' + word);
            return Promise.resolve(audioCache.get(key));
        }
        if (pendingAudio.has(key)) return pendingAudio.get(key);

        const url = ttsServer() + '/api/tts/speak?text=' + encodeURIComponent(word) +
            '&voice=' + encodeURIComponent(voice) + '&volume=' + TTS_VOLUME;
        const started = performance.now();
        diagLog('请求后端语音：' + word);
        const task = fetch(url).then(function (response) {
            if (!response.ok) {
                return response.text().then(function (body) {
                    throw new Error('HTTP ' + response.status + (body ? ' · ' + body.slice(0, 120) : ''));
                });
            }
            return response.blob();
        }).then(function (blob) {
            const elapsed = Math.round(performance.now() - started);
            diagLog('后端合成完成：' + word + '，' + elapsed + 'ms，' +
                Math.max(1, Math.round(blob.size / 1024)) + 'KB');
            const objectUrl = URL.createObjectURL(blob);
            audioCache.set(key, objectUrl);
            trimAudioCache();
            return objectUrl;
        });
        pendingAudio.set(key, task);
        task.then(function () { pendingAudio.delete(key); }, function () { pendingAudio.delete(key); });
        return task;
    }

    function ensureAudio() {
        if (state.audio) return state.audio;
        state.audio = new window.Audio();
        state.audio.preload = 'auto';
        return state.audio;
    }

    function prefetchNextWord() {
        if (state.engine !== 'server') return;
        let index = state.wordIndex;
        if (state.repeatIndex >= state.repeatCount) index += 1;
        const word = state.words[index];
        if (!word || word === state.words[state.wordIndex]) return;
        fetchServerAudio(word).catch(function () { /* 预取失败不影响主流程 */ });
    }

    function playServerCurrent(runId) {
        const word = state.words[state.wordIndex];
        const audio = ensureAudio();
        diagLog('后端朗读：' + word + '（第 ' + state.repeatIndex + ' 遍）');
        fetchServerAudio(word).then(function (objectUrl) {
            if (runId !== state.runId || !state.playing) return;
            audio.onended = function () {
                if (runId !== state.runId || !state.playing) return;
                diagLog('音频结束：' + word + '（第 ' + state.repeatIndex + ' 遍）');
                onReadingFinished(runId);
            };
            audio.onerror = function () {
                if (runId !== state.runId || !state.playing) return;
                handleBackendFailure(runId, '音频无法播放');
            };
            audio.src = objectUrl;
            state.phase = 'speaking';
            const promise = audio.play();
            if (promise && typeof promise.catch === 'function') {
                promise.catch(function (error) {
                    if (runId !== state.runId || !state.playing) return;
                    diagLog('音频播放被拦截：' + (error && error.name ? error.name : 'unknown'));
                    setStatus('浏览器阻止了音频播放，请再点一次“开始听写”。', 'error');
                });
            }
            prefetchNextWord();
        }).catch(function (error) {
            if (runId !== state.runId || !state.playing) return;
            handleBackendFailure(runId, error && error.message ? error.message : '请求失败');
        });
    }

    function handleBackendFailure(runId, message) {
        if (runId !== state.runId) return;
        diagLog('后端语音失败：' + message);
        stopPlayback(false);
        els.playbackKicker.textContent = '语音加载失败';
        els.currentWord.textContent = '请检查网络';
        setStatus('后端语音加载失败（' + message + '），请检查网络后重试。', 'error');
        if (els.diagPanel) els.diagPanel.open = true;
        renderDiagInfo('后端语音失败：' + message);
    }

    function canUseWebSpeech() {
        return !!speech && typeof window.SpeechSynthesisUtterance === 'function' && voices.length > 0;
    }

    // 语音列表可能异步加载，开始时最多等待一段时间。
    function waitForWebSpeech(timeoutMs) {
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            return Promise.resolve(false);
        }
        loadVoices();
        if (voices.length) return Promise.resolve(true);
        return new Promise(function (resolve) {
            let settled = false;
            const onChange = function () {
                loadVoices();
                if (voices.length) finish(true);
            };
            const timer = window.setTimeout(function () {
                loadVoices();
                finish(voices.length > 0);
            }, timeoutMs);
            function finish(ready) {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                if (typeof speech.removeEventListener === 'function') {
                    speech.removeEventListener('voiceschanged', onChange);
                }
                resolve(ready);
            }
            if (typeof speech.addEventListener === 'function') {
                speech.addEventListener('voiceschanged', onChange);
            }
        });
    }

    function updateVoiceMode() {
        if (!els.voiceMode) return;
        els.voiceMode.hidden = !state.playing;
        els.voiceMode.textContent = state.engine === 'server' ? '后端语音' : '前端语音';
        els.voiceMode.className = 'voice-mode' + (state.engine === 'server' ? ' is-server' : '');
    }

    function switchToServer(runId, reason) {
        if (state.engine === 'server') return false;
        state.engine = 'server';
        updateVoiceMode();
        diagLog('改用后端语音，原因：' + reason);
        try { speech.cancel(); } catch (error) { /* 忽略设备差异 */ }
        state.phase = 'idle';
        // 当前遍尚未完成，回退序号后从同一遍继续。
        state.repeatIndex = Math.max(0, state.repeatIndex - 1);
        scheduleDelay(220, runId, function () { speakCurrent(runId); }, '正在切换后端语音');
        return true;
    }

    // 一遍朗读结束后的统一推进逻辑（前端语音与后端音频共用）。
    function onReadingFinished(runId) {
        if (runId !== state.runId || !state.playing) return;
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
        if (els.voiceMode) els.voiceMode.hidden = true;
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
        if (state.audio) {
            try { state.audio.pause(); } catch (error) { /* 忽略 */ }
        }
        if (speech) {
            try { speech.cancel(); } catch (error) { /* 浏览器不支持取消时忽略 */ }
        }
        diagLog('停止或重置朗读：cancel()');
        updatePlaybackControls();
        updateVoiceMode();
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
        updateVoiceMode();
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

        if (state.engine === 'server') {
            playServerCurrent(runId);
            return;
        }
        speakWebCurrent(runId);
    }

    function speakWebCurrent(runId) {
        const word = state.words[state.wordIndex];
        const utterance = new window.SpeechSynthesisUtterance(word);
        const isEnglishWord = /^[A-Za-z'’-]+$/.test(word);
        const voice = isEnglishWord ?
            (voices.find(function (item) { return /^en[-_]/i.test(item.lang); }) || selectChineseVoice()) :
            selectChineseVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice ? voice.lang : (isEnglishWord ? 'en-US' : 'zh-CN');
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
            onReadingFinished(runId);
        };

        utterance.onerror = function (event) {
            if (runId !== state.runId || !state.playing) return;
            const reason = event && event.error ? String(event.error) : 'unknown';
            console.error('语音朗读失败：', reason);
            diagLog('onerror：错误码=' + reason);
            renderDiagInfo('朗读错误码：' + reason);
            if (els.diagPanel) els.diagPanel.open = true;

            // 系统抢占或取消造成的轻微错误：同一次朗读自动重试一次，不打断整场听写。
            if ((reason === 'canceled' || reason === 'interrupted') && !state.retried) {
                state.retried = true;
                state.repeatIndex = Math.max(0, state.repeatIndex - 1);
                state.phase = 'idle';
                scheduleDelay(260, runId, function () { speakCurrent(runId); }, '正在重新朗读');
                return;
            }

            // 本机语音不可用时自动改用后端语音，从当前词当前遍继续。
            if (switchToServer(runId, reason)) {
                setStatus('本机语音不可用（' + reason + '），已自动改用后端语音。');
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
        if (!words.length) {
            setStatus('请先粘贴或输入至少一个听写词语。', 'error');
            els.wordsInput.focus();
            return;
        }

        loadVoices();
        if (canUseWebSpeech()) {
            beginPlayback(words, 'web');
            return;
        }
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            beginPlayback(words, 'server');
            return;
        }

        // 语音列表可能尚未就绪，短暂等待后再决定使用本机还是后端语音。
        setStatus('正在检测本机语音…');
        waitForWebSpeech(900).then(function (ready) {
            const latest = parseWords(els.wordsInput.value);
            if (!latest.length || state.playing) return;
            beginPlayback(latest, ready ? 'web' : 'server');
        });
    }

    function beginPlayback(words, engine) {
        const wasSpeaking = cancelPlayback();
        state.engine = engine;
        state.words = words;
        state.wordIndex = 0;
        state.repeatIndex = 0;
        state.totalReadings = words.length * state.repeatCount;
        state.completedReadings = 0;
        state.playing = true;
        state.paused = false;
        state.phase = 'idle';
        const runId = state.runId;

        updateVoiceMode();
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
        diagLog('开始听写：' + words.length + ' 个词语，每词 ' + state.repeatCount + ' 遍，停顿 ' +
            state.pauseSeconds + ' 秒，发声方式=' + (engine === 'server' ? '后端语音' : '前端语音'));
        renderDiagInfo();
        if (engine === 'server') {
            // 提前取第一段音频，减少开始时的等待。
            fetchServerAudio(state.words[0]).catch(function () { /* 失败在主流程提示 */ });
        }
        if (wasSpeaking && engine === 'web') {
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
                if (state.engine === 'server' && state.audio) {
                    state.audio.pause();
                    diagLog('暂停后端音频');
                } else {
                    try { speech.pause(); } catch (error) { /* 忽略设备差异 */ }
                    diagLog('暂停朗读：pause()');
                }
            }
        } else {
            state.paused = false;
            if (state.phase === 'speaking') {
                if (state.engine === 'server' && state.audio) {
                    state.audio.play().catch(function () { /* 用户可再次点击继续 */ });
                    diagLog('继续后端音频');
                } else {
                    try { speech.resume(); } catch (error) { /* 忽略设备差异 */ }
                    diagLog('继续朗读：resume()');
                }
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
            warnings.push('当前浏览器不支持本机语音，听写将使用后端语音，需要保持联网。');
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
        if (state.playing || !text) return;
        const mode = /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en';
        const words = cleanPastedText(text, mode);
        if (!words) return;
        event.preventDefault();
        const start = els.wordsInput.selectionStart;
        const end = els.wordsInput.selectionEnd;
        const before = els.wordsInput.value.slice(0, start);
        const prefix = before && !/\s$/.test(before) ? ' ' : '';
        els.wordsInput.setRangeText(prefix + words, start, end, 'end');
        els.wordsInput.dispatchEvent(new Event('input', { bubbles: true }));
        setStatus('已粘贴' + (mode === 'en' ? '英文单词' : '中文词语') + '，请校对后开始听写。', 'success');
    });
    els.pasteBtn.addEventListener('click', function () { pasteFromClipboard('zh'); });
    els.pasteEnBtn.addEventListener('click', function () { pasteFromClipboard('en'); });
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

    document.addEventListener('visibilitychange', function () {
        diagLog('页面可见性：' + (document.hidden ? '后台' : '前台'));
        if (document.hidden && state.playing) {
            stopPlayback(false);
            setStatus('页面进入后台，听写已停止。');
        }
    });
    window.addEventListener('pagehide', function () {
        if (state.audio) {
            try { state.audio.pause(); } catch (error) { /* 忽略 */ }
        }
        if (speech) {
            try { speech.cancel(); } catch (error) { /* 忽略 */ }
        }
        audioCache.forEach(function (objectUrl) {
            try { URL.revokeObjectURL(objectUrl); } catch (error) { /* 忽略 */ }
        });
        audioCache.clear();
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
