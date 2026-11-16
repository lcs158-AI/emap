/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
import { CFG } from './config.js';
import { withTimeout } from './utils.js';

const POSE_CDNS = [
  './lib/mediapipe/pose/',
  'https://fastly.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/',
  'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/',
  'https://unpkg.com/@mediapipe/pose@0.5.1675469404/'
];

// 模型约 15MB（wasm + 资源 + tflite），网络差时单节点可能长时间无响应，
// 超过该时间即放弃并切换下一节点，避免永久卡在“启动中”。
const POSE_INIT_TIMEOUT = 30000;

function addScript(src, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      el.remove();
      reject(new Error('timeout'));
    }, timeout);
    el.onload = () => { clearTimeout(timer); resolve(); };
    el.onerror = () => { clearTimeout(timer); el.remove(); reject(new Error('load error')); };
    document.head.appendChild(el);
  });
}

export class PoseTracker {
  constructor(video, { onStatus, onX } = {}) {
    this.video = video;
    this.onStatus = onStatus;
    this.onX = onX;
    this.pose = null;
    this.base = null;
    this.shoulderW = 0;     // 实时肩宽（仅用于取景框判定）
    this.scaleRef = 0;      // 归一化基准肩宽（慢速跟随，扭转时不受肩宽变小影响）
    this.baseTwist = null;  // 基准双肩深度差（正面朝前时的零点）
    this.twist = 0;         // 躯干扭转角（弧度，正=身体右转）
    this.tSamples = 0;
    this.baseRefX = null;  // 基准水平参考点 x（固定用双肩中点）
    this.baseRefY = null;  // 基准竖直参考点 y
    this.baseWristY = null; // 基准双腕高度（双手持手机平举胸前，作为俯仰零点）
    this.baseElbowY = null; // 基准双肘高度（手腕被遮挡时的兜底零点）
    this.lastWristAt = 0;   // 最近一次手腕可见时刻（滞回用）
    this.lastElbowAt = 0;   // 最近一次肘部可见时刻（滞回用）
    this.handSrc = 'shoulder'; // 当前双手高度信号源：wrist | elbow | shoulder
    this.wristSamples = 0;
    this.elbowSamples = 0;
    this.lastHandRel = 0;   // 信号源短暂丢失时沿用上一帧
    this.prevHandRel = 0;
    this.prevHandMs = 0;
    this.lastHandSrc = '';
    this.pressArmed = false; // 双手快速下压已触发
    this.press = 0;         // 双手快速下压（紧急规避信号，1=保持中）
    this.idleMs = 0;        // 左右停在死区内的累计时长（用于重估零点）
    this.lastMs = 0;
    this.fitted = false;   // 上半身是否已套进取景框（识别/校准前置）
    this.fitHint = '';     // 未对齐时的提示文案
    // 体感三通道：左右用肩/髋中点平移；上下用双腕高度（双手举/放手机）
    this.shift = 0;        // 重心左右偏移：正=用户右移
    this.torso = 0;        // 双手高度：正=手放低（俯冲），负=手举高（爬升）
    this.squat = 0;        // 下蹲深度：正=髋部下沉（肩宽归一化）
    this.hasPose = false;
    this.lastSeen = 0;
    this.sending = false;
    this.loopStarted = false;
    this.starting = false;
    this.initialized = false;
    this.enabled = true;   // 键盘模式下置 false，停止送帧省 CPU
  }

  /* 重新取基准（开局或校准后调用）：双手平举胸前静止约 1 秒完成采样 */
  resetBaseline() {
    this.baseRefX = null;
    this.baseRefY = null;
    this.baseWristY = null;
    this.baseTwist = null;
    this.scaleRef = 0;
    this.twist = 0;
    this.baseElbowY = null;
    this.lastWristAt = 0;
    this.lastElbowAt = 0;
    this.handSrc = 'shoulder';
    this.wristSamples = 0;
    this.elbowSamples = 0;
    this.lastHandRel = 0;
    this.prevHandRel = 0;
    this.prevHandMs = 0;
    this.lastHandSrc = '';
    this.pressArmed = false;
    this.press = 0;
    this.idleMs = 0;
    this.lastMs = 0;
    this.tSamples = 0;
    this.shift = 0;
    this.torso = 0;
    this.squat = 0;
  }

  get tracking() {
    return this.hasPose && performance.now() - this.lastSeen < CFG.player.poseLostMs;
  }

  async start() {
    if (this.initialized && this.pose) return true;
    if (this.starting) return false;
    this.starting = true;
    try {
      // 逐个节点尝试：加载脚本 → 创建识别器 → 初始化（带超时）
      // 任一环节失败就换下一个节点，绝不让界面无限等待
      for (let i = 0; i < POSE_CDNS.length; i++) {
        const base = POSE_CDNS[i];
        this.onStatus && this.onStatus('warn',
          i === 0 ? '加载识别模型…（约15MB，首次较慢）' : '切换备用节点…（' + (i + 1) + '/' + POSE_CDNS.length + '）');
        let pose = null;
        try {
          const ok = await this.loadLib(base);
          if (!ok) continue;
          this.base = base;
          pose = new window.Pose({ locateFile: (file) => base + file });
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.4
          });
          pose.onResults((results) => this.onResults(results));
          await withTimeout(pose.initialize(), POSE_INIT_TIMEOUT, 'pose-initialize');
          this.pose = pose;
          this.initialized = true;
          this.startLoop();
          this.onStatus && this.onStatus('warn', '识别中…');
          return true;
        } catch (err) {
          console.warn('[pose] 节点初始化失败', base, err && err.message);
          try { if (pose && pose.close) pose.close(); } catch (e) { /* ignore */ }
        }
      }
      this.onStatus && this.onStatus('err', '模型加载失败，请刷新重试');
      return false;
    } finally {
      this.starting = false;
    }
  }

  async loadLib(base) {
    try {
      await addScript(base + 'pose.js');
      return !!window.Pose;
    } catch (err) {
      console.warn('[pose] 加载失败', base, err && err.message);
      return false;
    }
  }

  onResults(results) {
    const lm = results.poseLandmarks;
    // 至少需要双肩；双髋稳定可见时用于下蹲/俯仰，不可见则退化为上半身模式
    // （普通摄像头/显示器置顶摄像头通常只拍到上半身，髋部达不到可见度门槛）
    if (!lm || !lm[11] || !lm[12]) { this.fitted = false; return; }
    const ls = lm[11];
    const rs = lm[12];

    const visShoulder = Math.min(ls.visibility ?? 1, rs.visibility ?? 1);
    if (visShoulder < 0.45) { this.fitted = false; return; }

    const shoulderW = Math.abs(rs.x - ls.x);
    if (shoulderW < 0.02) { this.fitted = false; return; }

    const lh = lm[23];
    const rh = lm[24];
    const hipsOk = !!(lh && rh &&
      Math.min(lh.visibility ?? 1, rh.visibility ?? 1) >= 0.45);

    // 左右参考点固定用双肩中点：肩宽归一化天然抵消远近差异，
    // 且不会因髋部出画而在参考源之间切换、清空零点（此前左右失灵的主因）
    const refX = (ls.x + rs.x) / 2;
    const refY = (ls.y + rs.y) / 2;

    this.shoulderW = shoulderW;
    // 归一化尺度：开局采样的基准肩宽 + 慢速跟随。扭身时肩宽会变小，
    // 若继续用实时肩宽归一化，左右/上下灵敏度会被一起放大（引起“飘”）
    if (!this.scaleRef) this.scaleRef = shoulderW;
    else this.scaleRef += (shoulderW - this.scaleRef) * 0.004;
    const scale = this.scaleRef;
    this.hasPose = true;
    const now = performance.now();
    const dtMs = this.lastMs ? Math.min(200, now - this.lastMs) : 0;
    this.lastMs = now;
    this.lastSeen = now;

    // 基准只在开局（resetBaseline 后）采样约 1 秒，之后固定；中途遮挡不再清零
    this.tSamples += 1;
    if (this.baseRefX === null) this.baseRefX = refX;
    else if (this.tSamples <= 15) this.baseRefX += (refX - this.baseRefX) / this.tSamples;
    if (this.baseRefY === null) this.baseRefY = refY;
    else if (this.tSamples <= 15) this.baseRefY += (refY - this.baseRefY) / this.tSamples;

    // 躯干扭转：双脚站定时双肩会产生深度差（一侧靠近镜头、一侧远离），
    // 用 atan2(深度差, 基准肩宽) 估扭转角，与距离无关；正=身体右转
    const dz = (rs.z ?? 0) - (ls.z ?? 0);
    if (this.baseTwist === null) this.baseTwist = dz;
    else if (this.tSamples <= 15) this.baseTwist += (dz - this.baseTwist) / this.tSamples;
    const twistRaw = Math.atan2(dz - this.baseTwist, scale);
    this.twist += (twistRaw - this.twist) * CFG.pose.twistSmooth;

    /* ---- 双手高度：手腕 → 肘部 → 肩，带 500ms 滞回，防止逐帧跳变 ---- */
    const lw = lm[15];
    const rw = lm[16];
    const le = lm[13];
    const re = lm[14];
    const pairVis = (a, b) => Math.min(a.visibility ?? 1, b.visibility ?? 1);
    const wristOk = !!(lw && rw && pairVis(lw, rw) >= 0.20);
    const elbowOk = !!(le && re && pairVis(le, re) >= 0.20);
    if (wristOk) this.lastWristAt = now;
    if (elbowOk) this.lastElbowAt = now;

    if (wristOk || now - this.lastWristAt < 500) this.handSrc = 'wrist';
    else if (elbowOk || now - this.lastElbowAt < 500) this.handSrc = 'elbow';
    else this.handSrc = 'shoulder';

    let torsoRel = this.lastHandRel;  // 信号源短暂丢失时沿用上一帧，避免跳变
    if (this.handSrc === 'wrist' && wristOk) {
      const y = (lw.y + rw.y) / 2;
      if (this.baseWristY === null) this.baseWristY = y;
      if (this.wristSamples < 15) {
        this.wristSamples += 1;
        this.baseWristY += (y - this.baseWristY) / this.wristSamples;
      }
      torsoRel = ((y - this.baseWristY) / scale) * CFG.pose.handGain;
    } else if (this.handSrc === 'elbow' && elbowOk) {
      const y = (le.y + re.y) / 2;
      if (this.baseElbowY === null) this.baseElbowY = y;
      if (this.elbowSamples < 15) {
        this.elbowSamples += 1;
        this.baseElbowY += (y - this.baseElbowY) / this.elbowSamples;
      }
      torsoRel = ((y - this.baseElbowY) / scale) * CFG.pose.handGain;
    } else if (this.handSrc === 'shoulder') {
      // 双臂都不可见时才用肩部竖直位移兜底
      torsoRel = ((refY - this.baseRefY) / scale) * 2.0;
    }
    this.lastHandRel = torsoRel;

    // 双手快速下压（正=向下）：作为紧急规避触发（半身取景看不到腿时的替代动作）
    let pressVy = 0;
    if (this.lastHandSrc !== this.handSrc) {
      // 信号源切换瞬间不做速度判定，避免误触发规避
      this.lastHandSrc = this.handSrc;
      this.prevHandMs = 0;
    }
    if (this.prevHandMs && this.handSrc !== 'shoulder') {
      const dts = (now - this.prevHandMs) / 1000;
      if (dts > 0.001) pressVy = (torsoRel - this.prevHandRel) / dts;
    }
    this.prevHandRel = torsoRel;
    this.prevHandMs = now;
    if (this.handSrc !== 'shoulder') {
      if (pressVy > CFG.pose.pressSpeed) this.pressArmed = true;
      if (torsoRel < CFG.pose.pressDepth * 0.5) this.pressArmed = false; // 双手回中即解除
      this.press = this.pressArmed && torsoRel >= CFG.pose.pressDepth ? 1 : 0;
    } else {
      this.pressArmed = false;
      this.press = 0;
    }

    // 实测（V2.6.1）：用户右移 → 画面 x 增大 → 直接为正
    const shiftRaw = (refX - this.baseRefX) / scale;
    // 在死区内站定超过 2.5 秒：缓慢重估左右零点，消除站姿漂移导致的“飘”
    if (Math.abs(shiftRaw) < CFG.pose.shiftDead) this.idleMs += dtMs;
    else this.idleMs = 0;
    if (this.idleMs > 2500) this.baseRefX += (refX - this.baseRefX) * 0.01;
    // 下蹲：仅髋可见时有效（全身入镜时仍可用）
    const squatRaw = hipsOk ? (refY - this.baseRefY) / scale : 0;

    // 指数平滑：系数由 CFG.pose.smooth 控制，越小越稳
    this.shift += (shiftRaw - this.shift) * CFG.pose.smooth;
    this.squat += (squatRaw - this.squat) * CFG.pose.smooth;
    this.torso += (torsoRel - this.torso) * CFG.pose.smooth;

    // 取景框对齐判定（半身框）：双肩居中 + 肩宽在距离范围内 + 纵向落在框内
    const midX = (ls.x + rs.x) / 2;
    const midY = (ls.y + rs.y) / 2;
    let fitTip = '';
    if (midX < 0.34 || midX > 0.66) fitTip = '向取景框中央靠拢';
    else if (shoulderW < 0.10) fitTip = '靠近一点，让双肩撑满取景框';
    else if (shoulderW > 0.60) fitTip = '后退一点，让双肩落进取景框';
    else if (midY < 0.22) fitTip = '站低一点，让双肩下移到框内';
    else if (midY > 0.72) fitTip = '站高一点，让双肩上移到框内';
    this.fitted = fitTip === '';
    this.fitHint = this.fitted ? '已对齐取景框' : fitTip;

    this.onX && this.onX((ls.x + rs.x) / 2);
    const srcName = this.handSrc === 'wrist' ? '双手' : this.handSrc === 'elbow' ? '双臂' : '肩部';
    this.onStatus && this.onStatus('ok',
      '已识别 · 重心/' + srcName + '高度' + (hipsOk ? '/下蹲' : ''));
  }

  startLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
    let lastSend = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.pose || this.sending || !this.enabled) return;
      const now = performance.now();
      if (now - lastSend < CFG.player.poseInterval) return;
      if (this.video.readyState < 2 || !this.video.videoWidth) return;
      lastSend = now;
      this.sending = true;
      this.pose.send({ image: this.video })
        .catch((err) => console.warn('[pose] send 失败', err && err.message))
        .finally(() => { this.sending = false; });
    };
    tick();
  }
}
