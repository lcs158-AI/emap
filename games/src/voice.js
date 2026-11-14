// 语音提示（V2.5）：支持用户/小孩自行录制的音频文件，缺失时回退浏览器 TTS。
// 录音约定：把 <key>.mp3（或 .ogg/.wav）放入 assets/voice/ 目录，键名见 CATALOG。
import { CFG } from './config.js';

const BASE = 'assets/voice/';
const EXTS = ['mp3', 'ogg', 'wav'];

// 键名 → TTS 兜底文本（未录音时朗读）
const CATALOG = {
  'train.start': '开始训练',
  'train.shiftLeft': '身体左移，战机左移',
  'train.shiftRight': '身体右移，战机右移',
  'train.twistRight': '身体右转，机头右扫',
  'train.twistLeft': '身体左转，机头左扫',
  'train.dive': '双手放低，战机俯冲',
  'train.climb': '双手举高，战机爬升',
  'train.squat': '双手快速下压，紧急规避',
  'train.good': '正确',
  'train.retryDir': '方向反了',
  'train.retryAmp': '幅度再大些',
  'train.done': '训练结束',
  'warn.missile': '导弹来袭',
  'warn.shell': '炮弹来袭',
  'warn.lock': '已锁定',
  'warn.low': '高度过低',
  'warn.evade': '紧急规避'
};

export class Voice {
  constructor() {
    this.enabled = CFG.voice.enabled;
    this.volume = CFG.voice.volume;
    this.rate = CFG.voice.rate;
    this.available = {};   // key -> 存在的文件 URL
    this.current = null;   // 正在播放的 Audio，用于 stop
    this.fallbackText = CATALOG;
  }

  async load() {
    const keys = Object.keys(CATALOG);
    await Promise.all(keys.map((k) => this.probe(k)));
    this.onReady && this.onReady();
    return this.available;
  }

  /* 探测某个键名是否有录音文件（依次试各扩展名） */
  async probe(key) {
    for (const ext of EXTS) {
      try {
        const url = BASE + key + '.' + ext;
        const res = await fetch(url, { method: 'GET' });
        if (res.ok && res.headers.get('content-type') && res.headers.get('content-type').indexOf('audio') === 0) {
          this.available[key] = url;
          return;
        }
        if (res.ok) { this.available[key] = url; return; } // 兼容部分服务器不返回 content-type
      } catch (err) { /* 忽略，试下一种 */ }
    }
  }

  play(key, opts = {}) {
    if (!this.enabled) return;
    if (this.available[key]) {
      const url = this.available[key];
      if (this.current) { try { this.current.pause(); } catch (e) { /* ignore */ } }
      const a = new Audio(url);
      a.volume = opts.volume !== undefined ? opts.volume : this.volume;
      a.playbackRate = opts.rate !== undefined ? opts.rate : this.rate;
      a.play().catch(() => { /* autoplay 受限则忽略 */ });
      this.current = a;
      return;
    }
    // 兜底：TTS
    const text = opts.text || CATALOG[key];
    if (!text || typeof speechSynthesis !== 'object') return;
    try {
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = opts.rate !== undefined ? opts.rate : this.rate;
      u.volume = opts.volume !== undefined ? opts.volume : this.volume;
      const zh = speechSynthesis.getVoices().find((v) => /zh|cmn|cn/i.test(v.lang));
      if (zh) u.voice = zh;
      speechSynthesis.speak(u);
    } catch (err) { /* 忽略 */ }
  }

  stop() {
    if (this.current) { try { this.current.pause(); } catch (e) { /* ignore */ } }
    this.current = null;
    if (typeof speechSynthesis === 'object' && speechSynthesis.speaking) {
      try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  }
}
