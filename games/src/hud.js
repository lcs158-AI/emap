/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
import { CFG, MODES, DIFFS, ENEMY_TYPES } from './config.js';

const $ = (id) => document.getElementById(id);
const PF_TONE = { ok: 'good', warn: 'mid', err: 'bad' };

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      menu: $('menu'),
      result: $('result'),
      countdown: $('countdown'),
      mode: $('hudMode'),
      time: $('hudTime'),
      remain: $('hudRemain'),
      score: $('hudScore'),
      armor: $('armorPips'),
      ammo: $('ammoPips'),
      lockBox: $('lockBox'),
      lockName: $('lockName'),
      warn: $('warn'),
      warnArrow: $('warnArrow'),
      warnText: $('warnText'),
      hit: $('hitOverlay'),
      toast: $('toast'),
      flash: $('flash'),
      ledCam: $('ledCam'), stCam: $('stCam'),
      ledPose: $('ledPose'), stPose: $('stPose'),
      ledNet: $('ledNet'), stNet: $('stNet'),
      ledFlight: $('ledFlight'), stFlight: $('stFlight'),
      qrPanel: $('qrPanel'), qrImg: $('qrImg'), qrUrl: $('qrUrl'), qrToggle: $('qrToggle'),
      menuQrImg: $('menuQrImg'), menuQrUrl: $('menuQrUrl'),
      modeGrid: $('modeGrid'),
      diffSeg: $('diffSeg'),
      flares: $('flareCount'),
      ctrlCam: $('ctrlCam'), ctrlKeys: $('ctrlKeys'), ctrlTouch: $('ctrlTouch'),
      viewFp: $('viewFp'), viewTp: $('viewTp'),
      hintCamera: $('hintCamera'), hintKeys: $('hintKeys'), hintTouch: $('hintTouch'),
      resTitle: $('resTitle'), resReason: $('resReason'),
      resScore: $('resScore'), resKills: $('resKills'),
      resAcc: $('resAcc'), resAmmo: $('resAmmo'), resTime: $('resTime'),
      btnReplay: $('btnReplay'), btnMenu: $('btnMenu'),
      camVideo: $('cam'),
      preflight: $('preflight'), pfMode: $('pfMode'),
      pfCamSlot: $('pfCamSlot'), pfCamMask: $('pfCamMask'),
      pfCamGuide: $('pfCamGuide'),
      pfLedCam: $('pfLedCam'), pfTxtCam: $('pfTxtCam'),
      pfLedPose: $('pfLedPose'), pfTxtPose: $('pfTxtPose'),
      pfLedNet: $('pfLedNet'), pfTxtNet: $('pfTxtNet'),
      pfQrImg: $('pfQrImg'), pfQrUrl: $('pfQrUrl'),
      pfNote: $('pfNote'), pfGo: $('pfGo'), pfBack: $('pfBack'),
      trainHint: $('trainHint'),
      fpHud: $('fpHud'), hdgTape: $('hdgTape'), hdgRead: $('hdgRead'),
      horizonBg: $('horizonBg'), pitchLadder: $('pitchLadder'),
      iasRead: $('iasRead'), iasTape: $('iasTape'),
      altRead: $('altRead'), altTape: $('altTape'), vsRead: $('vsRead'),
      minimap: $('minimap'),
      train: $('train'), trainReq: $('trainReq'), trainArrow: $('trainArrow'),
      trainLive: $('trainLive'), trainBarFill: $('trainBarFill'), trainBarMark: $('trainBarMark'),
      trainVerdict: $('trainVerdict'), trainDone: $('trainDone'), trainTotal: $('trainTotal'),
      trainScores: $('trainScores')
    };
    this.mm = this.el.minimap ? this.el.minimap.getContext('2d') : null;

    this.statusCache = { cam: '', pose: '', net: '', flight: '' };
    this.toastTimer = 0;
    this.flashTimer = 0;
    this.lastUpdate = 0;
    this.onMode = null;
    this.onControl = null;
    this.onDiff = null;

    this.buildPips();
    this.buildModeCards();
    this.buildDiffSeg();
    this.buildFlightHud();

    this.el.qrToggle.addEventListener('click', () => {
      const collapsed = this.el.qrPanel.classList.toggle('collapsed');
      this.el.qrToggle.textContent = collapsed ? '展开' : '收起';
    });
  }

  buildPips(armor = CFG.player.armor, ammo = CFG.missile.count) {
    this.armorPips = [];
    this.ammoPips = [];
    this.el.armor.innerHTML = '';
    this.el.ammo.innerHTML = '';
    for (let i = 0; i < armor; i++) {
      const s = document.createElement('i');
      s.className = 'pip';
      this.el.armor.appendChild(s);
      this.armorPips.push(s);
    }
    for (let i = 0; i < ammo; i++) {
      const s = document.createElement('i');
      s.className = 'pip ammo-pip';
      this.el.ammo.appendChild(s);
      this.ammoPips.push(s);
    }
  }

  /* 难度分段选择器（选中态持久化到 localStorage） */
  buildDiffSeg() {
    if (!this.el.diffSeg) return;
    let saved = 'normal';
    try { saved = localStorage.getItem('mj.diff') || 'normal'; } catch (err) { /* ignore */ }
    this.el.diffSeg.innerHTML = '';
    for (const d of DIFFS) {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (d.id === saved ? ' active' : '');
      b.dataset.diff = d.id;
      b.textContent = d.name;
      b.addEventListener('click', () => {
        try { localStorage.setItem('mj.diff', d.id); } catch (err) { /* ignore */ }
        this.setDiff(d.id);
        this.onDiff && this.onDiff(d.id);
      });
      this.el.diffSeg.appendChild(b);
    }
  }

  setDiff(id) {
    if (!this.el.diffSeg) return;
    for (const b of this.el.diffSeg.children) {
      b.classList.toggle('active', b.dataset.diff === id);
    }
  }

  bindDiff(cb) { this.onDiff = cb; }

  /* 第一人称飞行仪表（V2.4.4）：生成航向带刻度与俯仰梯 */
  buildFlightHud() {
    if (!this.el.fpHud) return;
    const HDG_PX = 2.6, PITCH_PX = 5.0;
    // 航向带：0..719°，每 10° 一个刻度，每 30° 标注数值
    for (let deg = 0; deg < 720; deg += 10) {
      const major = deg % 30 === 0;
      const t = document.createElement('i');
      t.className = 'hdg-tick' + (major ? ' major' : '');
      t.style.left = (deg * HDG_PX) + 'px';
      if (major) {
        const l = document.createElement('span');
        l.textContent = (deg % 360).toString().padStart(3, '0');
        t.appendChild(l);
      }
      this.el.hdgTape.appendChild(t);
    }
    // 俯仰梯：-30°..+30°，每 5° 一根横线，每 10° 带数值
    for (let deg = -30; deg <= 30; deg += 5) {
      const row = document.createElement('div');
      row.className = 'ladder-row';
      row.style.transform = 'translateY(' + (deg * PITCH_PX) + 'px)';
      if (deg % 10 === 0) {
        const lab = document.createElement('span');
        lab.className = 'l-lab';
        lab.textContent = (deg > 0 ? '+' : deg < 0 ? '−' : '') + Math.abs(deg);
        row.appendChild(lab);
      }
      const line = document.createElement('i');
      line.className = 'l-line' + (deg % 10 !== 0 ? ' minor' : '');
      row.appendChild(line);
      this.el.pitchLadder.appendChild(row);
    }
  }

  /** 每帧渲染第一人称飞行仪表：show=false 时隐藏 */
  renderFlight(show, d) {
    const fp = this.el.fpHud;
    if (!fp) return;
    if (!show || !d || !isFinite(d.pitch)) { fp.classList.add('hidden'); return; }
    fp.classList.remove('hidden');

    const PITCH_PX = 5.0, HDG_PX = 2.6, IAS_PX = 0.9, ALT_PX = 1.2;
    const pitchDeg = d.pitch * 180 / Math.PI;
    const rollDeg = d.roll * 180 / Math.PI;
    const heading = (((-d.yaw * 180 / Math.PI) % 360) + 360) % 360;

    // 人工地平仪 + 俯仰梯：随俯仰上下平移、随翻滚旋转（负号令方向与机体侧滚一致）
    const base = 'rotate(' + (-rollDeg).toFixed(2) + 'deg) translateY(' + (pitchDeg * PITCH_PX).toFixed(1) + 'px)';
    this.el.horizonBg.style.transform = base;
    this.el.pitchLadder.style.transform = base;

    this.el.hdgTape.style.left = (window.innerWidth / 2 - heading * HDG_PX) + 'px';
    this.el.hdgRead.textContent = 'HDG ' + Math.round(heading).toString().padStart(3, '0');

    const ias = Math.max(140, Math.min(420, 240 + pitchDeg * 2.4 - d.alt * 0.35));
    this.el.iasRead.textContent = Math.round(ias);
    this.el.iasTape.style.backgroundPosition = '0 ' + (-(ias - 260) * IAS_PX).toFixed(1) + 'px';

    const alt = Math.max(0, Math.round(d.alt));
    this.el.altRead.textContent = alt.toString().padStart(3, '0');
    this.el.altTape.style.backgroundPosition = '0 ' + (-(alt - 28) * ALT_PX).toFixed(1) + 'px';

    const vs = Math.round(d.vs);
    this.el.vsRead.textContent = 'VS ' + (vs >= 0 ? '+' : '−') + Math.abs(vs);
  }

  /** 战场鸟瞰小地图（V2.5）：世界坐标 (x,z) 映射到俯视画布 */
  drawMinimap(d) {
    const cv = this.el.minimap;
    if (!cv || !this.mm) return;
    if (!d || !d.visible) { cv.classList.add('hidden'); return; }
    cv.classList.remove('hidden');
    const g = this.mm;
    const W = cv.width, H = cv.height;

    // 世界矩形：x∈[-110,110]，z∈[-230,30]（前飞为负，远处在上）
    const x0 = -110, x1 = 110, z0 = 30, z1 = -230;
    const X = (wx) => ((wx - x0) / (x1 - x0)) * W;
    const Y = (wz) => ((wz - z1) / (z0 - z1)) * H;

    g.clearRect(0, 0, W, H);

    // 战场边界
    g.strokeStyle = 'rgba(90,200,255,.35)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, W - 1, H - 1);

    // 敌机（存活）
    const AIR = { jet: 1, awacs: 1, drone: 1 };
    for (const e of (d.enemies || [])) {
      g.beginPath();
      g.arc(X(e.x), Y(e.z), 3, 0, Math.PI * 2);
      g.fillStyle = AIR[e.type] ? '#ff5d4d' : '#ffd35c';
      g.fill();
    }

    // 威胁（红三角，指向来袭方向，从玩家边缘伸出）
    if (d.threat) {
      const px = X(d.px), py = Y(d.pz);
      const ang = Math.atan2(d.threat.dx, -d.threat.dz);
      g.save();
      g.translate(px, py);
      g.rotate(ang);
      g.fillStyle = '#ff5d4d';
      g.beginPath();
      g.moveTo(16, 0); g.lineTo(8, -6); g.lineTo(8, 6);
      g.closePath(); g.fill();
      g.restore();
    }

    // 玩家（青色三角，按机头方位旋转）
    const px = X(d.px), py = Y(d.pz);
    g.save();
    g.translate(px, py);
    // 小地图画布轴：cx=世界x（右），cy=世界z（下）；机头投影角=atan2(fz,fx)
    // 修正为与实际机头方向一致（V2.6.1）
    g.rotate(Math.atan2(-Math.cos(d.yaw), -Math.sin(d.yaw)));
    g.fillStyle = '#35e0ff';
    g.beginPath();
    g.moveTo(10, 0); g.lineTo(-5, -6); g.lineTo(-5, 6);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(53,224,255,.9)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  buildModeCards() {
    this.el.modeGrid.innerHTML = '';
    for (const m of MODES) {
      const total = m.enemies.reduce((s, e) => s + e.count, 0);
      const names = m.enemies.map((e) => ENEMY_TYPES[e.type].name).join(' / ');
      const card = document.createElement('button');
      card.className = 'mode-card ' + m.id;
      card.dataset.mode = m.id;
      card.innerHTML =
        '<div class="mode-art"><i></i><span>' + m.name + '</span></div>' +
        '<div class="mode-body">' +
        '<div class="mode-title">' + m.name + '<em>' + m.time + 's</em></div>' +
        '<div class="mode-tag">' + m.tag + '</div>' +
        '<div class="mode-desc">' + m.desc + '</div>' +
        '<div class="mode-enemy">敌方 ' + total + ' · ' + names + '</div>' +
        '</div>';
      card.addEventListener('click', () => this.onMode && this.onMode(m.id));
      this.el.modeGrid.appendChild(card);
    }
  }

  bindModeSelect(cb) { this.onMode = cb; }

  bindControl(cb) {
    this.onControl = cb;
    this.el.ctrlCam.addEventListener('click', () => {
      this.setControl('camera');
      this.onControl && this.onControl('camera');
    });
    this.el.ctrlKeys.addEventListener('click', () => {
      this.setControl('keys');
      this.onControl && this.onControl('keys');
    });
    if (this.el.ctrlTouch) this.el.ctrlTouch.addEventListener('click', () => {
      this.setControl('touch');
      this.onControl && this.onControl('touch');
    });
  }

  bindView(cb) {
    this.onView = cb;
    this.el.viewFp.addEventListener('click', () => {
      this.setView(true);
      this.onView && this.onView(true);
    });
    this.el.viewTp.addEventListener('click', () => {
      this.setView(false);
      this.onView && this.onView(false);
    });
  }

  bindResult(cb) {
    this.el.btnReplay.addEventListener('click', () => cb.onReplay && cb.onReplay());
    this.el.btnMenu.addEventListener('click', () => cb.onMenu && cb.onMenu());
  }

  bindPreflight(cb) {
    this.el.pfGo.addEventListener('click', () => cb.onLaunch && cb.onLaunch());
    this.el.pfBack.addEventListener('click', () => cb.onBack && cb.onBack());
  }

  showPreflight(mode, diffName) {
    this.el.pfMode.textContent = mode.name + ' · ' + mode.tag + (diffName ? ' · ' + diffName : '');
    this.el.preflight.classList.remove('hidden');
    if (this.el.camVideo.parentNode !== this.el.pfCamSlot) {
      this.el.pfCamSlot.appendChild(this.el.camVideo);
    }
    this.el.pfCamSlot.classList.remove('ready');
    this.el.pfCamMask.textContent = '摄像头未启动';
    // 清空状态缓存，让当前摄像头/网络状态重新写入检查项
    this.statusCache = { cam: '', pose: '', net: '', flight: '' };
    this.el.pfLedCam.className = 'pf-led';
    this.el.pfLedPose.className = 'pf-led';
    this.el.pfLedNet.className = 'pf-led';
    this.el.pfTxtNet.textContent = '未连接';
    this.setPreflightReady(false, '正在准备检查项…');
  }

  hidePreflight() {
    this.el.preflight.classList.add('hidden');
    this.el.pfCamSlot.classList.remove('ready');
    if (this.el.camVideo.parentNode !== document.body) {
      document.body.appendChild(this.el.camVideo);
    }
  }

  setPreflightReady(canLaunch, note, tone = '') {
    this.el.pfGo.disabled = !canLaunch;
    this.el.pfNote.textContent = note;
    const cls = tone === 'ok' ? 'good' : tone === 'warn' ? 'mid' : '';
    this.el.pfNote.className = 'pf-note' + (cls ? ' ' + cls : '');
  }

  // 取景框对齐状态：套框成功时框线变绿
  setCamFit(fitted) {
    if (this.el.pfCamGuide) this.el.pfCamGuide.classList.toggle('fitted', !!fitted);
  }

  setControl(mode) {
    this.el.ctrlCam.classList.toggle('active', mode === 'camera');
    this.el.ctrlKeys.classList.toggle('active', mode === 'keys');
    if (this.el.ctrlTouch) this.el.ctrlTouch.classList.toggle('active', mode === 'touch');
    // 切换控制方式时同步说明文字
    if (this.el.hintCamera) this.el.hintCamera.classList.toggle('hidden', mode !== 'camera');
    if (this.el.hintKeys) this.el.hintKeys.classList.toggle('hidden', mode !== 'keys');
    if (this.el.hintTouch) this.el.hintTouch.classList.toggle('hidden', mode !== 'touch');
  }

  setView(fp) {
    this.el.viewFp.classList.toggle('active', !!fp);
    this.el.viewTp.classList.toggle('active', !fp);
  }

  showMenu(v) { this.el.menu.classList.toggle('hidden', !v); }
  showHud(v) { this.el.hud.classList.toggle('hidden', !v); }
  showTrain(v) { this.el.train.classList.toggle('hidden', !v); }

  /* 动作训练界面（V2.5） */
  updateTrain(d) {
    if (!this.el.train) return;
    if (d.req !== undefined) this.el.trainReq.textContent = d.req;
    if (d.arrow !== undefined) this.el.trainArrow.textContent = d.arrow;
    const live = Math.max(-1, Math.min(1, d.live || 0));
    if (this.el.trainLive) this.el.trainLive.textContent = '信号 ' + d.live.toFixed(2);
    // 实时信号线（i）与目标阈值线（b）按归一化值定位
    const barW = this.el.trainBarFill.parentElement.clientWidth;
    const cx = barW * 0.5;
    const lx = cx + live * barW * 0.5;
    this.el.trainBarFill.style.left = lx + 'px';
    const markPx = Math.max(4, Math.min(barW - 4, cx + d.pass * barW * 0.5));
    this.el.trainBarMark.style.left = markPx + 'px';
    this.el.trainVerdict.className = 'train-verdict' +
      (d.verdict.indexOf('正确') === 0 ? ' good' : d.verdict.indexOf('方向') === 0 || d.verdict.indexOf('幅度') === 0 || d.verdict.indexOf('反') === 0 ? ' bad' : '');
    this.el.trainVerdict.textContent = d.verdict;
    this.el.trainDone.textContent = d.done;
    this.el.trainTotal.textContent = d.total;
    if (this.el.trainScores) {
      this.el.trainScores.innerHTML = '';
      for (const [k, v] of Object.entries(d.scores || {})) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<span>' + k + '</span><b>' + v + '</b>';
        this.el.trainScores.appendChild(row);
      }
    }
  }
  hideResult() { this.el.result.classList.add('hidden'); }

  setMode(mode) {
    this.el.mode.textContent = mode.name;
  }

  /* 训练场常驻操控提示（V2.3.0） */
  setTraining(v) {
    if (!this.el.trainHint) return;
    this.el.trainHint.classList.toggle('hidden', !v);
  }

  setCountdown(text) {
    if (!text) {
      this.el.countdown.classList.add('hidden');
      return;
    }
    this.el.countdown.classList.remove('hidden');
    if (this.el.countdown.textContent !== text) {
      this.el.countdown.textContent = text;
      this.el.countdown.classList.remove('pop');
      void this.el.countdown.offsetWidth;
      this.el.countdown.classList.add('pop');
    }
  }

  update(state) {
    const now = performance.now();
    if (now - this.lastUpdate < 70) return;
    this.lastUpdate = now;

    const t = Math.max(0, Math.ceil(state.time));
    const mm = Math.floor(t / 60).toString().padStart(2, '0');
    const ss = (t % 60).toString().padStart(2, '0');
    this.el.time.textContent = mm + ':' + ss;
    this.el.time.classList.toggle('urgent', t <= 20);
    this.el.remain.textContent = state.remaining;
    this.el.score.textContent = state.score;

    this.armorPips.forEach((p, i) => p.classList.toggle('empty', i >= state.armor));
    this.ammoPips.forEach((p, i) => p.classList.toggle('empty', i >= state.ammo));
    if (this.el.flares) {
      const n = state.flares;
      if (typeof n === 'number' || n === null) {
        const unlimited = !Number.isFinite(n);
        this.el.flares.textContent = 'x' + (unlimited ? '∞' : n);
        this.el.flares.classList.toggle('empty', !unlimited && n <= 0);
      }
    }

    if (state.lockName) {
      this.el.lockBox.classList.remove('hidden');
      this.el.lockName.textContent = state.lockName;
    } else {
      this.el.lockBox.classList.add('hidden');
    }

    this.updateThreat(state.threat);
  }

  updateThreat(threat) {
    if (!threat) {
      this.el.warn.classList.add('hidden');
      return;
    }
    const ang = Math.atan2(threat.dx, -threat.dz);
    const x = 50 + Math.sin(ang) * 33;
    const y = 50 - Math.cos(ang) * 29;
    this.el.warn.classList.remove('hidden');
    this.el.warn.style.left = x + '%';
    this.el.warn.style.top = y + '%';
    this.el.warnArrow.style.transform = 'rotate(' + ang.toFixed(3) + 'rad)';
    const label = threat.kind === 'missile' ? '导弹来袭' : '炮弹来袭';
    this.el.warnText.textContent = label + ' ' + Math.max(0, threat.eta).toFixed(1) + 's';
  }

  showResult(r) {
    const reasonMap = {
      clear: '敌方目标全部清除',
      time: '限时结束，仍有残余目标',
      missile: '战机被敌方导弹击毁',
      armor: '战机被炮弹击落'
    };
    this.el.resTitle.textContent = r.win ? '任务成功' : '任务失败';
    this.el.resTitle.classList.toggle('win', r.win);
    this.el.resReason.textContent = reasonMap[r.reason] || '';
    this.el.resScore.textContent = r.score;
    this.el.resKills.textContent = r.kills + ' / ' + r.total;
    this.el.resAcc.textContent = r.accuracy.toFixed(0) + '%';
    this.el.resAmmo.textContent = r.ammo;
    this.el.resTime.textContent = Math.round(r.timeUsed) + 's';
    this.el.result.classList.remove('hidden');
    this.setCountdown('');
  }

  setStatus(which, kind, text) {
    const key = kind + '|' + text;
    if (this.statusCache[which] === key) return;
    this.statusCache[which] = key;
    const led = which === 'cam' ? this.el.ledCam
      : which === 'pose' ? this.el.ledPose
        : which === 'net' ? this.el.ledNet
          : this.el.ledFlight;
    const label = which === 'cam' ? this.el.stCam
      : which === 'pose' ? this.el.stPose
        : which === 'net' ? this.el.stNet
          : this.el.stFlight;
    led.className = 'led' + (kind ? ' ' + kind : '');
    label.textContent = text;

    const pfLed = which === 'cam' ? this.el.pfLedCam
      : which === 'pose' ? this.el.pfLedPose
        : which === 'net' ? this.el.pfLedNet
          : null;
    const pfTxt = which === 'cam' ? this.el.pfTxtCam
      : which === 'pose' ? this.el.pfTxtPose
        : which === 'net' ? this.el.pfTxtNet
          : null;
    if (pfLed && pfTxt) {
      pfLed.className = 'pf-led' + (kind && PF_TONE[kind] ? ' ' + PF_TONE[kind] : '');
      pfTxt.textContent = text;
    }
    if (which === 'cam') {
      const ready = kind === 'ok';
      this.el.pfCamSlot.classList.toggle('ready', ready);
      if (!ready) this.el.pfCamMask.textContent = text || '摄像头未启动';
    }
  }

  setQr(data) {
    const url = (data && data.url) || '控制器地址获取失败（请通过 server.js 启动）';
    this.el.qrUrl.textContent = url;
    this.el.menuQrUrl.textContent = url;
    this.el.pfQrUrl.textContent = url;
    const apply = (img) => {
      if (data && data.qr) {
        img.src = data.qr;
        img.style.display = 'block';
      } else {
        img.style.display = 'none';
      }
    };
    apply(this.el.qrImg);
    apply(this.el.menuQrImg);
    apply(this.el.pfQrImg);
  }

  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  flash(text) {
    this.el.flash.textContent = text;
    this.el.flash.classList.remove('show');
    void this.el.flash.offsetWidth;
    this.el.flash.classList.add('show');
  }

  damageFlash() {
    this.el.hit.classList.remove('show');
    void this.el.hit.offsetWidth;
    this.el.hit.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.el.hit.classList.remove('show'), 420);
  }
}
