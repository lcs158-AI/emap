/* 小刘听写 · 拍照识别与朗读控制 · v20261121d */
(function () {
    'use strict';

    const MAX_IMAGE_SIDE = 1800;
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const REPEAT_GAP_MS = 550;
    const speech = window.speechSynthesis || null;
    let voices = [];

    const els = {
        cameraInput: document.getElementById('cameraInput'),
        uploadInput: document.getElementById('uploadInput'),
        pasteBtn: document.getElementById('pasteBtn'),
        fileActions: document.getElementById('fileActions'),
        photoPreview: document.getElementById('photoPreview'),
        photoEmpty: document.getElementById('photoEmpty'),
        scanningBadge: document.getElementById('scanningBadge'),
        ocrProgress: document.getElementById('ocrProgress'),
        ocrStatus: document.getElementById('ocrStatus'),
        ocrPercent: document.getElementById('ocrPercent'),
        ocrProgressBar: document.getElementById('ocrProgressBar'),
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
        stopBtn: document.getElementById('stopBtn')
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
        ocrBusy: false,
        ocrId: 0,
        retried: false
    };

    function setStatus(text, tone) {
        els.pageStatus.textContent = text;
        els.pageStatus.className = 'page-status' + (tone ? ' is-' + tone : '');
    }

    function parseWords(text) {
        return String(text || '')
            .split(/[\s,，、;；]+/)
            .map(function (word) { return word.trim(); })
            .filter(Boolean);
    }

    function cleanOcrText(text) {
        // 保留 OCR 原有的换行、空白和标点作为词语分隔，每项只保留汉字。
        return String(text || '')
            .replace(/\r/g, '')
            .split(/[\s,，、;；]+/)
            .map(function (item) {
                return (item.match(/[\u3400-\u9fff]/g) || []).join('');
            })
            .filter(Boolean)
            .join(' ');
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
        if (state.ocrBusy) return;
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

    function setOcrBusy(busy) {
        state.ocrBusy = busy;
        els.fileActions.classList.toggle('is-busy', busy);
        els.cameraInput.disabled = busy;
        els.uploadInput.disabled = busy;
        els.pasteBtn.disabled = busy;
        els.startBtn.disabled = busy;
        els.scanningBadge.hidden = !busy;
        els.ocrProgress.hidden = !busy;
        if (!busy) {
            els.ocrProgressBar.style.width = '0%';
            els.ocrPercent.textContent = '0%';
        }
    }

    function updateOcrProgress(message) {
        if (!message) return;
        const labels = {
            'loading tesseract core': '正在加载识别组件',
            'initializing tesseract': '正在初始化识别组件',
            'loading language traineddata': '正在加载中文识别数据',
            'initializing api': '正在准备中文识别',
            'recognizing text': '正在识别照片中的文字'
        };
        if (labels[message.status]) els.ocrStatus.textContent = labels[message.status];
        if (typeof message.progress === 'number') {
            const percent = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
            els.ocrProgressBar.style.width = percent + '%';
            els.ocrPercent.textContent = percent + '%';
        }
    }

    function preparePhoto(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = function () {
                try {
                    const width = image.naturalWidth;
                    const height = image.naturalHeight;
                    if (!width || !height) throw new Error('照片尺寸无效');
                    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(width * scale));
                    canvas.height = Math.max(1, Math.round(height * scale));
                    const context = canvas.getContext('2d', { alpha: false });
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    resolve({ canvas: canvas, preview: canvas.toDataURL('image/jpeg', 0.9) });
                } catch (error) {
                    URL.revokeObjectURL(url);
                    reject(error);
                }
            };
            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('无法读取照片'));
            };
            image.src = url;
        });
    }

    async function handlePhoto(file) {
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            setStatus('请选择 JPG、PNG 等图片文件。', 'error');
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setStatus('照片超过 20MB，请压缩后再试。', 'error');
            return;
        }

        if (state.playing) stopPlayback(false);
        const ocrId = ++state.ocrId;
        setOcrBusy(true);
        setStatus('正在准备照片，请稍候…');
        els.ocrStatus.textContent = '正在准备照片';

        try {
            const prepared = await preparePhoto(file);
            if (ocrId !== state.ocrId) return;
            els.photoPreview.src = prepared.preview;
            els.photoPreview.hidden = false;
            els.photoEmpty.hidden = true;

            if (!window.Tesseract || typeof window.Tesseract.recognize !== 'function') {
                throw new Error('OCR_UNAVAILABLE');
            }

            const result = await window.Tesseract.recognize(prepared.canvas, 'chi_sim', {
                logger: function (message) {
                    if (ocrId === state.ocrId) updateOcrProgress(message);
                }
            });
            if (ocrId !== state.ocrId) return;

            const text = cleanOcrText(result && result.data && result.data.text);
            if (!text) {
                setStatus('没有识别到清晰文字，请调整光线和角度后重试。', 'error');
                return;
            }
            els.wordsInput.value = text;
            refreshWords();
            resetPlaybackDisplay();
            setStatus('识别完成，请校对词语后开始听写。', 'success');
        } catch (error) {
            console.error('词语识别失败：', error);
            if (error && error.message === 'OCR_UNAVAILABLE') {
                setStatus('识别组件加载失败，请检查网络并刷新页面；也可以手动输入词语。', 'error');
            } else {
                setStatus('识别失败，请检查网络，或换一张更清晰的照片重试。', 'error');
            }
        } finally {
            if (ocrId === state.ocrId) setOcrBusy(false);
        }
    }

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
        els.startBtn.disabled = state.ocrBusy;
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

        utterance.onend = function () {
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
        };

        utterance.onerror = function (event) {
            if (runId !== state.runId || !state.playing) return;
            const reason = event && event.error ? String(event.error) : 'unknown';
            console.error('语音朗读失败：', reason);

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

        try {
            speech.speak(utterance);
        } catch (error) {
            utterance.onerror({ error: error.message });
        }
    }

    function startPlayback() {
        normalizeSettings();
        const words = parseWords(els.wordsInput.value);
        if (state.ocrBusy) {
            setStatus('照片仍在识别，请等待识别完成。', 'error');
            return;
        }
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            setStatus('当前浏览器不支持语音朗读，请使用推荐的手机浏览器。', 'error');
            return;
        }
        if (!words.length) {
            setStatus('请先拍照识别或输入至少一个听写词语。', 'error');
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
            }
        } else {
            state.paused = false;
            if (state.phase === 'speaking') {
                try { speech.resume(); } catch (error) { /* 忽略设备差异 */ }
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
        if (!window.Tesseract) {
            warnings.push('中文识别组件未加载，拍照识别暂不可用，请检查网络后刷新；手动输入和朗读仍可使用。');
        }
        if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
            warnings.push('当前浏览器不支持语音朗读，请改用 Android Chrome / Edge 或 iPhone / iPad Safari。');
        }
        if (window.location.protocol === 'file:') {
            warnings.push('请通过 HTTPS 或本地 HTTP 服务打开页面，避免拍照和识别组件受到限制。');
        }
        els.compatWarning.textContent = warnings.join(' ');
        els.compatWarning.hidden = !warnings.length;
    }

    function bindFileInput(input) {
        input.addEventListener('change', function (event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            handlePhoto(file);
        });
    }

    bindFileInput(els.cameraInput);
    bindFileInput(els.uploadInput);
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
        setStatus('内容已清空，可以重新拍照或手动输入。');
        els.wordsInput.focus();
    });
    els.repeatCount.addEventListener('change', normalizeSettings);
    els.pauseSeconds.addEventListener('change', normalizeSettings);
    els.startBtn.addEventListener('click', startPlayback);
    els.pauseBtn.addEventListener('click', pauseOrResumePlayback);
    els.stopBtn.addEventListener('click', function () { stopPlayback(true); });

    document.addEventListener('visibilitychange', function () {
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
        if (typeof speech.addEventListener === 'function') {
            speech.addEventListener('voiceschanged', loadVoices);
        } else {
            speech.onvoiceschanged = loadVoices;
        }
    }

    refreshWords();
    normalizeSettings();
    updatePlaybackControls();
    checkCapabilities();
})();
