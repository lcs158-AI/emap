/* 程序化音效引擎：全部用 Web Audio 合成，不依赖外部音频文件 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem('mj.sound') !== '0';
    } catch (err) { /* ignore */ }
    this.stamps = Object.create(null);
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 1.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem('mj.sound', on ? '1' : '0'); } catch (err) { /* ignore */ }
    if (!on) {
      if (this.ctx) this.ctx.suspend().catch(() => {});
    } else {
      this.ensure();
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  can(key, ms) {
    if (!this.enabled) return false;
    const now = performance.now();
    if (this.stamps[key] && now - this.stamps[key] < ms) return false;
    this.stamps[key] = now;
    return true;
  }

  noise(dur, { gain = 0.5, type = 'lowpass', freq = 1200, q = 0.8, attack = 0.005, delay = 0, rate = 1 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;

    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.35);
    src.stop(t + dur + 0.02);
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, to = 0, delay = 0, attack = 0.004 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ---------------- 武器 ---------------- */
  cannon() {
    if (!this.can('cannon', 42)) return;
    this.noise(0.07, { gain: 0.38, freq: 2400, type: 'bandpass', q: 1.2 });
    this.tone(190, 0.07, { to: 65, type: 'square', gain: 0.13, attack: 0.003 });
  }

  missile() {
    this.noise(0.6, { gain: 0.26, freq: 820, type: 'bandpass', q: 0.7, attack: 0.04, rate: 1.4 });
    this.tone(320, 0.55, { to: 1100, type: 'sawtooth', gain: 0.06, attack: 0.06 });
  }

  /* 干扰弹：短促喷发声 + 释放确认音 */
  flare() {
    if (!this.can('flare', 120)) return;
    this.noise(0.22, { gain: 0.3, freq: 1900, type: 'bandpass', q: 0.9, attack: 0.004, rate: 1.2 });
    this.tone(1180, 0.09, { to: 1560, type: 'sine', gain: 0.14, delay: 0.05 });
  }

  lock() {
    if (!this.can('lock', 420)) return;
    this.tone(1380, 0.07, { gain: 0.16 });
    this.tone(1780, 0.1, { gain: 0.13, delay: 0.08 });
  }

  hit() {
    if (!this.can('hit', 50)) return;
    this.noise(0.05, { gain: 0.34, freq: 4600, type: 'highpass' });
    this.tone(920, 0.05, { to: 500, type: 'square', gain: 0.1 });
  }

  /* ---------------- 爆炸 ---------------- */
  explodeAt(pos, size = 1, listener = null) {
    if (!this.enabled || !pos) return;
    let att = 1;
    if (listener) {
      const d = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
      att = clamp(1 - d / 340, 0.03, 1);
    }
    if (!this.can('explode', 70)) return;
    this.explosion(size, att);
  }

  explosion(size = 1, att = 1) {
    const big = clamp(size / 2.2, 0.3, 1.5);
    this.noise(0.34 + 0.3 * big, {
      gain: (0.34 + 0.26 * big) * att,
      freq: 420 - 120 * big,
      type: 'lowpass',
      q: 0.7,
      attack: 0.008,
      rate: 0.9
    });
    this.tone(105 * (0.75 + big * 0.35), 0.34 + 0.12 * big, {
      to: 40,
      gain: 0.22 * att,
      type: 'sine',
      attack: 0.006
    });
    if (size >= 1.5) {
      this.noise(0.75, { gain: 0.16 * att, freq: 150, type: 'lowpass', attack: 0.05 });
    }
  }

  /* ---------------- 受击 / 预警 ---------------- */
  damage() {
    this.tone(150, 0.3, { to: 55, gain: 0.24, type: 'triangle' });
    this.tone(520, 0.18, { type: 'square', gain: 0.12, delay: 0.05 });
    this.tone(430, 0.18, { type: 'square', gain: 0.11, delay: 0.22 });
  }

  warning(kind = 'shell') {
    if (!this.can('warn', 850)) return;
    const base = kind === 'missile' ? 880 : 700;
    this.tone(base, 0.09, { type: 'square', gain: 0.12 });
    this.tone(base, 0.09, { type: 'square', gain: 0.12, delay: 0.16 });
    this.tone(base + 260, 0.12, { type: 'square', gain: 0.13, delay: 0.32 });
  }

  enemyFire(kind) {
    if (!this.can('enemyfire', 220)) return;
    if (kind === 'missile') {
      this.tone(170, 0.3, { to: 95, type: 'sawtooth', gain: 0.1, attack: 0.02 });
    } else {
      this.tone(115, 0.22, { to: 65, type: 'triangle', gain: 0.09 });
      this.noise(0.12, { gain: 0.1, freq: 500, type: 'lowpass' });
    }
  }

  /* ---------------- 流程 / UI ---------------- */
  countdown(n) {
    const f = n === 1 ? 760 : n === 2 ? 640 : 540;
    this.tone(f, 0.16, { type: 'sine', gain: 0.17 });
  }

  go() {
    this.tone(880, 0.26, { to: 1200, type: 'sine', gain: 0.2 });
    this.tone(1320, 0.3, { gain: 0.13, delay: 0.1 });
  }

  ui() {
    if (!this.can('ui', 60)) return;
    this.tone(660, 0.05, { type: 'square', gain: 0.1 });
  }

  finishSound(win) {
    if (!this.can('finish', 800)) return;
    if (win) {
      [660, 880, 1100, 1320].forEach((f, i) => {
        this.tone(f, 0.3, { gain: 0.16, delay: 0.35 + i * 0.14, type: 'triangle' });
      });
    } else {
      [440, 330, 240, 170].forEach((f, i) => {
        this.tone(f, 0.42, { gain: 0.16, delay: 0.7 + i * 0.17, type: 'triangle' });
      });
    }
  }
}
