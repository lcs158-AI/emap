/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
import { THREE, THREE_OK } from './three.js';
import { CFG, MODES, getMode, getDiff } from './config.js';
import { createTerrain } from './terrain.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
import { Weapons } from './weapons.js';
import { Hud } from './hud.js';
import { PoseTracker } from './pose.js';
import { Net } from './net.js';
import { AudioEngine } from './audio.js';
import { Voice } from './voice.js';
import { clamp, deg2rad, withTimeout } from './utils.js';

const loading = document.getElementById('loading');

if (!THREE_OK) {
  loading.classList.add('error');
  loading.textContent = '3D 引擎加载失败，请检查网络连接后刷新页面（需要访问 CDN）';
  throw new Error('three.js load failed');
}

/* ---------------- 渲染器 / 场景 ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8cfe6);
scene.fog = new THREE.Fog(0xa8cfe6, 140, 520);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 950);
scene.add(camera);   // 相机入场景，便于挂载第一人称座舱模型

/* HUD 玻璃纹理：用 canvas 画四角框、侧向刻度与机号，替代原来的整片半透明色块 */
function makeHudTexture() {
  const W = 1024, H = 768;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(53,224,255,1)';
  g.fillStyle = 'rgba(53,224,255,1)';
  g.lineWidth = 5;
  g.shadowColor = 'rgba(4,18,26,0.75)';
  g.shadowBlur = 16;

  // 四角框
  const m = 64, len = 108;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach((c) => {
    g.beginPath();
    g.moveTo(c[0] + c[2] * len, c[1]);
    g.lineTo(c[0], c[1]);
    g.lineTo(c[0], c[1] + c[3] * len);
    g.stroke();
  });

  // 左右刻度（对称短刻线）
  const cx = W / 2, cy = H / 2;
  for (let i = -4; i <= 4; i++) {
    const y = cy + i * 46;
    const w = (i % 2 === 0) ? 28 : 15;
    g.beginPath();
    g.moveTo(cx - 296, y);
    g.lineTo(cx - 296 + w, y);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + 296, y);
    g.lineTo(cx + 296 - w, y);
    g.stroke();
  }

  // 顶部机号 / 底部状态
  g.textAlign = 'center';
  g.font = '600 30px "Segoe UI", Arial, sans-serif';
  g.fillText('XL-01  HUD', cx, m + 30);
  g.font = '500 24px "Segoe UI", Arial, sans-serif';
  g.fillText('AUTO / TRACK', cx, H - m - 12);

  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/* 第一人称座舱（V2.4.2）：机头、舱框、仪表板与 HUD 玻璃，挂在相机上 */
function buildCockpit() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x5b6772, metalness: 0.25, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3540, metalness: 0.1, roughness: 0.85 });

  // 机头：锥形前伸
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.30, 3.6, 12), metal);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.88, -3.1);
  g.add(nose);

  // 机头与仪表板之间的舱盖过渡
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), metal);
  cowl.scale.set(1.15, 0.6, 1.4);
  cowl.position.set(0, -0.82, -1.45);
  g.add(cowl);

  // 仪表板（遮光罩）
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.55), dark);
  dash.position.set(0, -0.66, -1.02);
  dash.rotation.x = 0.18;
  g.add(dash);

  // HUD 玻璃：canvas 纹理（角标 + 侧向刻度 + 机号），不再是一整片半透明色块
  const hudGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.54),
    new THREE.MeshBasicMaterial({ map: makeHudTexture(), transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false })
  );
  hudGlass.position.set(0, -0.26, -0.92);
  hudGlass.rotation.x = -0.12;
  g.add(hudGlass);

  // 两侧舱框（A 柱）
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 1.7), dark);
    rail.position.set(side * 0.66, -0.38, -1.45);
    rail.rotation.y = -side * 0.42;
    rail.rotation.x = 0.1;
    g.add(rail);
    // 侧操纵台
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.9), dark);
    console_.position.set(side * 0.86, -0.82, -0.75);
    g.add(console_);
  }
  g.visible = false;
  return g;
}
const cockpit = buildCockpit();
camera.add(cockpit);

// 座舱随相机转动，世界主光照射方向会随姿态变化，这里补一盏跟随相机的柔光灯稳定舱内亮度
const cockpitLight = new THREE.PointLight(0xd8efff, 18, 6.5, 2);
cockpitLight.position.set(0.2, 0.6, 0.45);
camera.add(cockpitLight);

const hemi = new THREE.HemisphereLight(0xd6ecff, 0x4a4a30, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 520;
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
sun.shadow.bias = -0.0007;
sun.target.position.set(0, 0, -90);
scene.add(sun, sun.target);

/* ---------------- 游戏对象 ---------------- */
const hud = new Hud();
hud.showMenu(true);
hud.showHud(false);

const audio = new AudioEngine();
const voice = new Voice();
voice.load();

const soundBtn = document.getElementById('soundToggle');

function syncSoundBtn() {
  soundBtn.textContent = audio.enabled ? '音效 开' : '音效 关';
  soundBtn.classList.toggle('off', !audio.enabled);
}
soundBtn.addEventListener('click', () => {
  audio.toggle();
  syncSoundBtn();
  audio.ui();
});
syncSoundBtn();
// 浏览器要求用户手势后才能播放音频
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });

const player = new Player(scene);
player.setVisible(false);

const pose = new PoseTracker(document.getElementById('cam'), {
  onStatus: (kind, text) => { if (game.control === 'camera') hud.setStatus('pose', kind, text); }
});

let savedControl = 'camera';
let savedFp = null;
try {
  savedControl = localStorage.getItem('mj.control') || 'camera';
  savedFp = localStorage.getItem('mj.fp');
} catch (err) { /* ignore */ }
// V2.8.0：新增 touch（手机触屏）；旧值 stick 归入 camera
if (!['camera', 'keys', 'touch'].includes(savedControl)) savedControl = 'camera';

let savedDiff = 'normal';
try { savedDiff = localStorage.getItem('mj.diff') || 'normal'; } catch (err) { /* ignore */ }

const game = {
  phase: 'menu',
  control: savedControl,
  mode: getMode('road'),
  diff: getDiff(savedDiff),
  terrain: null,
  enemies: null,
  weapons: null,
  time: 0,
  score: 0,
  total: 0,
  stats: { shots: 0, hits: 0, kills: 0, missiles: 0 },
  countdown: 0,
  cannonAcc: 0,
  missileCd: 0,
  flares: CFG.flare.count,
  flareCd: 0,
  keyCannon: false,
  netCannon: false,
  result: null,
  controllers: 0,
  elapsed: 0,
  pendingMode: null,
  preflightReady: false,
  cdShown: 0,
  threatPrev: false,
  lockPrev: false,
  squatHold: 0,      // 下蹲持续时间（秒）
  evadeT: 0,         // 紧急规避剩余时间（秒）
  evadeCd: 0,        // 规避冷却剩余时间（秒）
  evadeBtnPressed: false,  // 手机规避按钮按下一次，单次触发后自动复位
  phonePitch: 0,     // 手机体感俯仰（度，已相对校准）
  phoneRoll: 0,      // 手机体感翻滚（度）
  phoneSeenAt: 0,    // 最近一次体感数据时间（performance.now）
  phoneCount: 0,     // 收到的体感数据条数
  // V2.8.0 手机触屏摇杆输入（归一化 -1 ~ +1，直接当 pitchIn / yawIn / dirX）
  touchPitch: 0,
  touchYaw: 0,
  touchDirX: 0,
  touchSeenAt: 0,
  fpView: savedFp === null ? savedControl === 'camera' : savedFp === '1'  // 第一人称（体感模式默认开启）
};

const keys = Object.create(null);
let cameraReady = false;
let pfPoseTimer = 0;

/* ---------------- 输入 ---------------- */
function keyDir() {
  return ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
}

/* 俯仰模拟量：W/↑ 抬头，S/↓ 俯冲 */
function keyPitch() {
  return ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
}

/* 机头方位模拟量：Z 左转（yaw 正），X 右转（yaw 负） */
function keyYaw() {
  return ((keys.KeyZ) ? 1 : 0) - ((keys.KeyX) ? 1 : 0);
}

/* 模拟量死区映射：超过 dead 后线性到 full 饱和 */
function analog(v, dead, full) {
  const a = Math.abs(v);
  if (a <= dead) return 0;
  const s = Math.sign(v);
  return s * Math.min(1, (a - dead) / (full - dead));
}

/* 手机陀螺仪数据是否新鲜（<1.2s） */
function phoneFresh() {
  return game.phoneSeenAt > 0 && performance.now() - game.phoneSeenAt < 1200;
}
/* 手机触屏摇杆数据是否新鲜（<0.4s，摇杆高频） */
function touchFresh() {
  return game.touchSeenAt > 0 && performance.now() - game.touchSeenAt < 400;
}

/* 主机端手机体感状态（约 0.4s 刷新一次，用于确认手机姿态是否真的被识别） */
let phoneUiAt = 0;
function updatePhoneStatus(force = false) {
  const now = performance.now();
  if (!force && now - phoneUiAt < 400) return;
  phoneUiAt = now;
  if (game.controllers <= 0) {
    hud.setStatus('flight', '', '无手机连接');
  } else if (game.phoneSeenAt === 0) {
    hud.setStatus('flight', '', '未启用');
  } else if (phoneFresh()) {
    hud.setStatus('flight', 'ok', '体感 ' + Math.round(game.phonePitch) + '/' + Math.round(game.phoneRoll) + '°');
  } else {
    hud.setStatus('flight', '', '体感静止');
  }
}

/* 体感信号读数（节流 0.4s，显示在「姿态识别」状态行） */
let armUiAt = 0;
function updateBodyStatus() {
  if (game.control !== 'camera') return;
  const now = performance.now();
  if (now - armUiAt < 400) return;
  armUiAt = now;
  if (!pose.tracking) {
    hud.setStatus('pose', 'warn', '未识别到人体 · 请全身入镜');
    return;
  }
  hud.setStatus('pose', 'ok',
    '移' + Math.round(pose.shift * 100) +
    ' 转' + Math.round(pose.twist * 100) +
    ' 手' + Math.round(pose.torso * 100) +
    ' 压' + Math.round(pose.press * 100));
}

/* ---------------- 体感三通道（V2.6.0） ---------------- */
/* 躯干扭转 → 机头扫射：双脚站定转体，身体右转=机头右扫（yaw 负） */
function poseYawAbs() {
  const t = analog(pose.twist, CFG.pose.twistDead, CFG.pose.twistFull);
  return -t * CFG.player.yawMax;
}

/* 双手高度 → 俯仰角：双手放低=俯冲（负），举高=爬升（正） */
function posePitchAbs() {
  const s = analog(pose.torso, CFG.pose.torsoDead, CFG.pose.torsoFull);
  return s >= 0 ? -s * CFG.player.pitchMaxDown : -s * CFG.player.pitchMaxUp;
}

/* 重心左右偏移 → 横向平移与滚转模拟量（右移为正） */
function poseMoveX() {
  return analog(pose.shift, CFG.pose.shiftDead, CFG.pose.shiftFull);
}

window.addEventListener('keydown', (e) => {
  // 左手飞行：A/D/W/S/Z/X；右手射击：J 机炮、K 双发导弹、I 单发导弹、L 干扰弹；空格为机炮备用键
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyI', 'KeyL', 'Space', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyJ' || e.code === 'Space') game.keyCannon = true;
  if (e.code === 'KeyK') shootMissile(2);
  if (e.code === 'KeyI') shootMissile(1);
  if (e.code === 'KeyL') deployFlare(2);
  if (e.code === 'KeyV') {
    // 视角开局选定后全程锁定（V2.6.0），战斗中不允许切换
    if (game.phase === 'playing' || game.phase === 'countdown') {
      hud.toast('战斗开始后视角已锁定', 1000);
      return;
    }
    game.fpView = !game.fpView;
    try { localStorage.setItem('mj.fp', game.fpView ? '1' : '0'); } catch (err) { /* ignore */ }
    hud.setView(game.fpView);
    hud.toast(game.fpView ? '第一人称视角' : '第三人称视角', 900);
    audio.ui();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyJ' || e.code === 'Space') game.keyCannon = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  game.keyCannon = false;
  game.netCannon = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- 环境 ---------------- */
function applyEnvironment(mode) {
  scene.background = new THREE.Color(mode.sky);
  scene.fog = new THREE.Fog(mode.sky, mode.fog[0], mode.fog[1]);
  sun.color.setHex(mode.sun.color);
  sun.intensity = mode.sun.intensity;
  sun.position.set(mode.sun.pos[0], mode.sun.pos[1], mode.sun.pos[2]);
  sun.target.position.set(0, 0, -90);
  sun.target.updateMatrixWorld();
  hemi.color.setHex(mode.hemi.sky);
  hemi.groundColor.setHex(mode.hemi.ground);
  hemi.intensity = mode.hemi.intensity;
}

/* ---------------- 摄像机 ---------------- */
let lastCamAlt = null;   // 用于推算第一人称 HUD 的升降率
function updateCamera(dt) {
  const p = player.group.position;
  const inFlight = game.phase === 'playing' || game.phase === 'countdown';
  const fp = game.fpView && inFlight;

  // 第一人称：相机绑在座舱，沿机头方向看出去；隐藏本机模型，显示座舱
  if (inFlight) player.group.visible = !fp;
  cockpit.visible = fp;

  if (fp) {
    const fwd = player.forward();
    camera.position.set(p.x, p.y + 1.6, p.z).addScaledVector(fwd, 2.2);
    camera.lookAt(p.x + fwd.x * 80, p.y + 1.6 + fwd.y * 80, p.z + fwd.z * 80);
    // 第一人称飞行仪表（V2.4.4）：实时俯仰/翻滚/航向/高度/升降率
    const alt = player.altitude + player.yCur;
    const vs = lastCamAlt === null ? 0 : (alt - lastCamAlt) / dt;
    lastCamAlt = alt;
    hud.renderFlight(true, {
      pitch: player.pitch,
      roll: player.group.rotation.z,
      yaw: player.yaw,
      alt,
      vs
    });
    return;
  }

  lastCamAlt = null;
  hud.renderFlight(false, null);
  const k = 1 - Math.exp(-3.2 * dt);
  const yawShift = -Math.sin(player.yaw);   // 机头方位带来的画面中心偏移
  camera.position.x += (p.x * 0.72 + yawShift * 18 - camera.position.x) * k;
  camera.position.y = p.y + 8.4;
  camera.position.z = p.z + 16;
  camera.lookAt(p.x * 0.92 + yawShift * CFG.player.cameraYawFollow, p.y - 5.2, p.z - 72);
}

function menuCamera(dt) {
  const a = game.elapsed * 0.1;
  const k = 1 - Math.exp(-2.2 * dt);
  camera.position.x += (Math.cos(a) * 75 - camera.position.x) * k;
  camera.position.y += (48 - camera.position.y) * k;
  camera.position.z += (28 - camera.position.z) * k;
  camera.lookAt(0, 6, -120);
}

/* ---------------- 回合管理 ---------------- */
function disposeRound() {
  if (game.weapons) { game.weapons.dispose(); game.weapons = null; }
  if (game.enemies) { game.enemies.clear(); game.enemies = null; }
  if (game.terrain) { game.terrain.dispose(); game.terrain = null; }
}

function startRound(mode) {
  disposeRound();
  game.mode = mode;

  game.terrain = createTerrain(mode);
  scene.add(game.terrain.group);
  applyEnvironment(mode);

  player.reset(mode, game.diff.armor);
  player.setVisible(true);
  pose.resetBaseline();   // 每局重新取基准（重心 / 站立高度 / 躯干倾角零点）

  game.weapons = new Weapons(scene, {
    onScore: (delta, label) => addScore(delta, label),
    onEnemyDamage: (unit, weapon) => damageEnemy(unit, weapon),
    onPlayerHit: (kind) => playerHit(kind),
    onExplode: (pos, size) => audio.explodeAt(pos, size, player.group.position),
    onEnemyFire: (kind) => audio.enemyFire(kind)
  });
  game.weapons.setDiff(game.diff);

  game.enemies = new EnemyManager(scene, mode, game.terrain, game.weapons, player, game.diff);
  game.enemies.spawn();
  game.total = game.enemies.total;

  game.score = 0;
  game.stats = { shots: 0, hits: 0, kills: 0, missiles: 0 };
  game.countdown = 3.0;
  game.time = mode.time;
  game.cannonAcc = 0;
  game.missileCd = 0;
  game.flares = CFG.flare.count;
  game.flareCd = 0;
  game.keyCannon = false;
  game.netCannon = false;
  game.result = null;
  game.threatPrev = false;
  game.lockPrev = false;
  game.cdShown = 3;
  game.phase = 'countdown';

  hud.hidePreflight();
  hud.setMode(mode);
  hud.setTraining(!!mode.training);   // 训练场常驻操控提示（V2.3.0）
  hud.showMenu(false);
  hud.hideResult();
  hud.showHud(true);
  hud.setCountdown('3');
  hud.buildPips(game.diff.armor, game.diff.missiles);
  hud.update({
    time: mode.time,
    score: 0,
    remaining: game.enemies.remaining,
    armor: player.armor,
    ammo: game.diff.missiles,
    flares: Number.isFinite(game.flares) ? game.flares : null,
    threat: null,
    lockName: ''
  });
  audio.countdown(3);
  net.sendState(statePayload(), true);
}

/* ---------------- 出击前检查 ---------------- */
function beginMode(id) {
  if (game.phase === 'preflight') return;
  audio.ui();
  openPreflight(getMode(id));
}

function openPreflight(mode) {
  game.pendingMode = mode;
  game.phase = 'preflight';
  hud.showMenu(false);
  hud.showHud(false);
  hud.hideResult();
  hud.setCountdown('');
  hud.showPreflight(mode, game.diff.name);

  if (game.control === 'camera') {
    if (cameraReady) {
      hud.setStatus('cam', 'ok', '已开启');
      const tracking = pose.tracking;
      hud.setStatus('pose', tracking ? 'ok' : 'warn',
        tracking ? '已识别 · 重心/双手高度/下压规避' : '请站到镜头前，上半身入镜（能看到双肩）');
    } else {
      hud.setStatus('cam', 'warn', '启动中…');
      hud.setStatus('pose', '', '准备中…');
      startCamera();
    }
  } else if (game.control === 'touch') {
    hud.setStatus('cam', '', '未启用（触屏模式）');
    hud.setStatus('pose', '', '未启用（触屏模式）');
  } else {
    hud.setStatus('cam', '', '键盘模式');
    hud.setStatus('pose', '', '键盘模式');
  }

  if (game.controllers > 0) hud.setStatus('net', 'ok', '已连接 ' + game.controllers + ' 台');
  else hud.setStatus('net', 'warn', '等待手机扫码');

  refreshPreflight();
  net.sendState(statePayload(), true);
}

function refreshPreflight() {
  if (game.phase !== 'preflight') return;

  if (game.control === 'camera' && cameraReady && pose.pose) {
    if (pose.tracking && pose.fitted) hud.setStatus('pose', 'ok', '已对齐取景框');
    else if (pose.tracking) hud.setStatus('pose', 'warn', pose.fitHint || '请套进取景框');
    else hud.setStatus('pose', 'warn', '请站到镜头前，上半身入镜（能看到双肩）');
  }

  let can = true;
  let note = '';
  let tone = '';

  if (game.control === 'camera') {
    const fitted = pose.tracking && pose.fitted;
    hud.setCamFit(fitted);
    if (cameraReady) {
      if (fitted) {
        note = '已对齐取景框，可确认出击：躯干扭转=机头扫射 · 身体左右平移=飞机左右移动 · 双手举高=爬升 · 放低=俯冲 · 快速下压=紧急规避';
        tone = 'ok';
      } else if (pose.tracking) {
        can = false;
        note = '请把上半身套进取景框：' + (pose.fitHint || '调整位置，让双肩落进框内');
        tone = 'warn';
      } else {
        can = false;
        note = '请站到镜头前，让上半身落进取景框';
        tone = 'warn';
      }
    } else if (cameraStarting) {
      can = false;
      note = '正在启动摄像头与姿态识别，请稍候…';
    } else {
      hud.setCamFit(false);
      note = '摄像头不可用，本次将使用键盘 A/D 平移 · W/S 俯仰';
      tone = 'warn';
    }
  } else if (game.control === 'touch') {
    // 手机触屏模式：不依赖摄像头，但需要手机控制器已连接
    hud.setCamFit(false);
    if (game.controllers > 0) {
      note = '手机触屏模式：左拇指飞行摇杆 · 右手武器按钮。所有操作在手机上完成，不依赖摄像头与姿态识别';
      tone = 'ok';
    } else {
      can = false;
      note = '请先在手机浏览器打开控制器页面（扫码加入），再确认出击';
      tone = 'warn';
    }
  } else {
    hud.setCamFit(false);
    note = '键盘模式：左手 A/D 平移 · W/S 俯仰 · Z/X 机头；右手 J/空格 机炮 · K 双发导弹 · I 单发导弹 · L 干扰弹';
  }

  if (game.controllers > 0) {
    note += ' · 手机控制器已连接 ' + game.controllers + ' 台（只用于开火）';
    if (!tone) tone = 'ok';
  } else {
    note += ' · 未连接手机控制器（仍可开始）';
    tone = 'warn';
  }
  updatePhoneStatus(true);

  // 就绪状态变化时立即同步手机端，便于手机直接确认出击
  if (game.preflightReady !== can) {
    game.preflightReady = can;
    net.sendState(statePayload(), true);
  }

  hud.setPreflightReady(can, note, tone);
}

function launchFromPreflight() {
  if (game.phase !== 'preflight' || !game.pendingMode) return;
  if (game.control === 'camera' && cameraStarting) {
    hud.toast('摄像头正在启动，请稍候…', 1200);
    return;
  }
  const mode = game.pendingMode;
  game.pendingMode = null;
  audio.ui();
  startRound(mode);
}

function cancelPreflight() {
  if (game.phase !== 'preflight') return;
  game.pendingMode = null;
  hud.hidePreflight();
  toMenu();
}

function toMenu() {
  game.phase = 'menu';
  game.pendingMode = null;
  audio.ui();
  if (game.weapons) game.weapons.reset();
  if (game.enemies) { game.enemies.clear(); game.enemies = null; }
  player.setVisible(false);
  hud.hidePreflight();
  hud.showMenu(true);
  hud.showHud(false);
  hud.hideResult();
  hud.setCountdown('');
  hud.updateThreat(null);
  net.sendState(statePayload(), true);
}

/* ---------------- 动作训练（V2.6.0：体感三通道） ---------------- */
// ready：本题开始前的“起始姿态”，到齐后重新取基准，保证左右/俯仰/下蹲都有足够行程
const TRAIN_ITEMS = [
  { req: '身体左移 · 战机左移',   ready: '站回中心', voice: 'train.shiftLeft',  sig: () => pose.shift, sign: -1, pass: CFG.train.passShift, label: '左移' },
  { req: '身体右移 · 战机右移',   ready: '站回中心', voice: 'train.shiftRight', sig: () => pose.shift, sign: 1,  pass: CFG.train.passShift, label: '右移' },
  { req: '身体右转 · 机头右扫',   ready: '转回正前方', voice: 'train.twistRight', sig: () => pose.twist, sign: 1,  pass: CFG.train.passYaw, label: '右扫' },
  { req: '身体左转 · 机头左扫',   ready: '转回正前方', voice: 'train.twistLeft',  sig: () => pose.twist, sign: -1, pass: CFG.train.passYaw, label: '左扫' },
  { req: '双手放低 · 战机俯冲',   ready: '双手胸前平举', voice: 'train.dive',       sig: () => pose.torso, sign: 1,  pass: CFG.train.passTorso, label: '俯冲' },
  { req: '双手举高 · 战机爬升',   ready: '双手胸前平举', voice: 'train.climb',      sig: () => pose.torso, sign: -1, pass: CFG.train.passTorso, label: '爬升' },
  { req: '双手快速下压 · 紧急规避', ready: '双手胸前平举', voice: 'train.squat', sig: () => pose.press, sign: 1,  pass: CFG.train.passSquat, label: '规避' }
];

const train = {
  seq: [],
  idx: 0,
  done: 0,
  total: 0,
  running: false,
  holdMs: 0,
  reached: false,
  verdict: '',
  scores: {},
  voiceTimer: 0,
  readyMs: 0        // 本题起始姿态校准倒计时；>0 时不判定
};

function buildTrainSeq() {
  train.seq = [];
  train.scores = {};
  for (let r = 0; r < CFG.train.reps; r++) {
    for (const it of TRAIN_ITEMS) train.seq.push(it);
  }
  train.total = train.seq.length;
  train.idx = 0;
  train.done = 0;
  train.holdMs = 0;
  train.reached = false;
}

function openTrain() {
  if (game.phase === 'train') return;
  game.phase = 'train';
  game.pendingMode = null;
  audio.ui();
  pose.enabled = true;
  if (!cameraReady) startCamera();
  pose.resetBaseline();        // 校准：请保持自然站姿约 1 秒
  buildTrainSeq();
  train.running = false;
  train.verdict = '校准中，请保持自然站姿…';
  hud.hidePreflight();
  hud.showMenu(false);
  hud.showHud(false);
  hud.hideResult();
  hud.setCountdown('');
  hud.showTrain(true);
  hud.updateTrain(renderTrainState());
  voice.play('train.start');
}

function closeTrain() {
  voice.stop();
  train.running = false;
  hud.showTrain(false);
  toMenu();
}

function startTrainSession() {
  train.running = true;
  train.holdMs = 0;
  train.reached = false;
  train.idx = 0;
  train.done = 0;
  pose.resetBaseline();
  train.verdict = '按提示做动作…';
  advanceTrainItem();
}

function restartTrain() {
  buildTrainSeq();
  startTrainSession();
}

const TRAIN_READY_MS = 1800;   // 起始姿态校准时长（≥15帧基准采集 + 摆姿余量）

function advanceTrainItem() {
  train.holdMs = 0;
  train.reached = false;
  const it = train.seq[train.idx];
  // 以本题起始姿态重新取基准：这样“回中/站直”相对基准仍有足够行程
  pose.resetBaseline();
  train.readyMs = it ? TRAIN_READY_MS : 0;
  train.verdict = it ? ('准备：' + it.ready) : '按提示做动作…';
  hud.updateTrain(renderTrainState());
}

function currentItem() {
  return (train.running && train.seq[train.idx]) || null;
}

function renderTrainState() {
  const it = currentItem();
  return {
    req: it ? it.req : (train.done >= train.total ? '训练结束' : '准备中…'),
    arrow: it ? (it.sign > 0 ? '▲' : '▼') : '★',
    live: it ? (it.sig() * it.sign) : 0,
    pass: it ? it.pass : 0,
    verdict: train.verdict,
    done: train.done,
    total: train.total,
    scores: train.scores,
    finished: train.done >= train.total
  };
}

function trainUpdate(dt) {
  if (!train.running) {
    // 校准/未开始时，也把当前信号同步到界面上（信号条跳动可见）
    hud.updateTrain(renderTrainState());
    return;
  }
  const it = currentItem();
  if (!it) {
    if (train.done >= train.total && train.verdict !== '训练结束') {
      train.verdict = '训练结束 · 全部掌握';
      voice.play('train.done');
      hud.updateTrain(renderTrainState());
    }
    return;
  }
  // 起始姿态校准阶段：不判定，先让操作者摆好 ready 姿势
  if (train.readyMs > 0) {
    train.readyMs -= dt * 1000;
    if (train.readyMs > 0) {
      train.verdict = '准备：' + it.ready;
      hud.updateTrain(renderTrainState());
      return;
    }
    train.verdict = '按提示做动作…';
    voice.play(it.voice);
  }

  const val = it.sig() * it.sign;   // 正确方向为正
  const ok = val >= it.pass;

  if (ok) {
    train.holdMs += dt * 1000;
  } else {
    train.holdMs = 0;
    if (val <= -it.pass) {
      // 只有明确反向（超过阈值）才提示方向错，避免噪声误报
      train.verdict = '方向反了，请反向';
      voicePlayThrottled('train.retryDir');
    } else if (val < 0) {
      // 轻微负值＝还在中位/回中，属于正常噪声，不算方向反
      train.verdict = '请按提示做动作';
    } else {
      train.verdict = '幅度再大一点';
      voicePlayThrottled('train.retryAmp');
    }
  }

  if (ok && train.holdMs >= CFG.train.holdMs) {
    // 通过
    train.done += 1;
    train.scores[it.label] = (train.scores[it.label] || 0) + 1;
    train.verdict = '正确！';
    voice.play('train.good');
    hud.updateTrain(renderTrainState());
    train.idx += 1;
    train.holdMs = 0;
    train.reached = false;
    if (train.idx >= train.total) {
      train.verdict = '训练结束 · 全部掌握';
      voice.play('train.done');
      hud.updateTrain(renderTrainState());
    } else {
      advanceTrainItem();
    }
    return;
  }
  hud.updateTrain(renderTrainState());
}

/* 判定语音节流：同一条提示不反复播 */
function voicePlayThrottled(key) {
  const now = performance.now();
  if (now - train.voiceTimer > 1500) {
    train.voiceTimer = now;
    voice.play(key);
  }
}

/* ---------------- 摄像头 / 姿态 ---------------- */
let cameraStarting = false;

/** 强制释放本页面持有的摄像头（旧流残留、刷新未清理时尤其重要） */
function releaseCamera() {
  const video = document.getElementById('cam');
  const stream = video && video.srcObject;
  if (stream && stream.getTracks) {
    for (const t of stream.getTracks()) { try { t.stop(); } catch (e) { /* ignore */ } }
  }
  video.srcObject = null;
  cameraReady = false;
}

/* 页面隐藏/关闭时立即归还摄像头，避免下次启动被「自己」占用 */
window.addEventListener('pagehide', releaseCamera);
window.addEventListener('beforeunload', releaseCamera);

/** 切到后台（如拿手机扫码）时等待回到前台，避免 video.play() 被浏览器挂起 */
function waitVisible(maxMs = 60000) {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('visibilitychange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => { if (document.visibilityState === 'visible') finish(); };
    const timer = setTimeout(finish, maxMs);
    document.addEventListener('visibilitychange', onChange);
  });
}

// 回到前台时若摄像头尚未就绪（例如切去手机扫码导致被释放），自动重新启动
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (game.control === 'camera' && game.phase === 'preflight' && !cameraReady && !cameraStarting) {
    startCamera();
  }
});

async function startCamera() {
  if (cameraReady || cameraStarting) return cameraReady;
  cameraStarting = true;
  hud.setStatus('cam', 'warn', '启动中');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('浏览器不支持 getUserMedia');
    }
    const video = document.getElementById('cam');
    releaseCamera();  // 先强制释放本页残留旧流
    // 摄像头流无音轨，显式静音 + 行内播放，避免部分移动浏览器 play() 挂起
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');

    let stream = null;
    for (let attempt = 0; attempt < 3 && !stream; attempt++) {
      try {
        // 加超时：权限弹窗被忽略或系统占用时，getUserMedia 可能永久不返回
        stream = await withTimeout(navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
            facingMode: 'user'
          },
          audio: false
        }), 20000, 'getUserMedia');
      } catch (err) {
        if (err && err.name === 'NotReadableError' && attempt < 2) {
          hud.setStatus('cam', 'warn', '被占用，重试中…');
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        throw err;
      }
    }
    video.srcObject = stream;
    await waitVisible();  // 后台标签页中 play() 可能一直 pending
    // play() 在标签页隐藏/部分移动浏览器上也可能一直 pending
    await withTimeout(video.play(), 10000, 'video.play');
    hud.setStatus('cam', 'ok', '已开启');

    // 体感飞行：摄像头 + Pose 识别器
    pose.enabled = true;
    const ok = await pose.start();
    cameraReady = ok;
    if (!ok) {
      releaseCamera();  // 识别不可用时归还摄像头
      hud.setStatus('cam', 'warn', '已关闭');
      hud.setStatus('pose', 'err', '加载失败，可切换体感模式重试');
      game.control = 'keys';
      hud.setControl('keys');
      hud.toast('姿态识别不可用，已切换为键盘操作（A/D 移动）；可稍后切回体感重试', 3600);
    }
    refreshPreflight();
    return cameraReady;
  } catch (err) {
    console.warn('[camera]', err);
    let reason = '无法访问摄像头';
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      reason = '摄像头权限被拒绝';
    } else if (err && err.name === 'NotFoundError') {
      reason = '未检测到摄像头设备';
    } else if (err && err.name === 'NotReadableError') {
      reason = '摄像头被其他应用占用，请关闭后刷新重试';
    } else if (err && err.message === '浏览器不支持 getUserMedia') {
      reason = '当前浏览器不支持摄像头';
    } else if (err && String(err.message).startsWith('timeout')) {
      reason = '摄像头启动超时，可能被其他应用占用或权限弹窗未确认';
    }
    hud.setStatus('cam', 'err', '不可用');
    hud.setStatus('pose', 'warn', '键盘模式');
    game.control = 'keys';
    hud.setControl('keys');
    hud.toast(reason + '，已切换为键盘操作', 3200);
    cameraReady = false;
    return false;
  } finally {
    cameraStarting = false;
    refreshPreflight();  // 无论成功/失败/超时都刷新界面，避免停在“启动中…”
  }
}

/* ---------------- 武器与计分 ---------------- */
function shootCannon() {
  if (game.phase !== 'playing' || !player.alive) return;
  const side = player.nextGun();
  const origin = player.gunWorld(side);
  game.weapons.fireCannon(origin, player.forward());
  game.stats.shots += 1;
  game.weapons.flash(origin, 0.32, 0xffe3a0);
  audio.cannon();
}

/** n=2 为键盘双发，n=1 为手机单发；双发只消耗一次冷却 */
function shootMissile(n = 1) {
  if (game.phase !== 'playing' || !player.alive || !game.enemies) return false;
  if (game.missileCd > 0) {
    hud.toast('导弹冷却中 ' + game.missileCd.toFixed(1) + 's', 900);
    return false;
  }
  const left = game.diff.missiles - game.stats.missiles;
  if (left <= 0) {
    hud.toast('导弹已耗尽', 1200);
    return false;
  }
  const count = Math.min(n, left);
  const base = player.missileWorld();
  const forward = player.forward();
  const right = player.rightDir();
  const locks = [];
  if (count === 1) {
    const lock = game.weapons.fireMissile(base, forward, game.enemies);
    if (lock) locks.push(lock);
  } else {
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? -1 : 1;   // -1 左、+1 右
      const lock = game.weapons.fireMissile(base, forward, game.enemies, {
        lateral: right,
        offset: side * 2.2,            // 左右各偏移约 2.2 单位
        spread: -side * 2.5            // 方向绕世界 Y 轴各偏 ±2.5°
      });
      if (lock) locks.push(lock);
    }
  }
  game.stats.missiles += count;
  game.missileCd = CFG.missile.cooldown;
  audio.missile();
  if (n > 1 && count === 1) {
    hud.toast('导弹仅剩 1 发 · 已单发发射', 1200);
  } else {
    const lock = locks[0];
    const name = lock ? lock.info.name : '';
    hud.toast((count > 1 ? '双发导弹' : '导弹发射') + (name ? ' · 锁定 ' + name : ' · 未锁定目标'), 1000);
  }
  return true;
}

/* 干扰弹：键盘 L 双发、手机单发，吸引来袭导弹；余量无限时仅受冷却限制 */
function deployFlare(n = 1) {
  if (game.phase !== 'playing' || !player.alive) return false;
  if (game.flareCd > 0) {
    hud.toast('干扰弹冷却中 ' + game.flareCd.toFixed(1) + 's', 900);
    return false;
  }
  const available = Number.isFinite(game.flares) ? game.flares : Infinity;
  if (available <= 0) {
    hud.toast('干扰弹已耗尽', 1200);
    return false;
  }
  const count = Math.min(n, available);
  if (Number.isFinite(game.flares)) game.flares -= count;
  game.flareCd = CFG.flare.cooldown;
  const base = player.group.position.clone();
  const right = player.rightDir();
  for (let i = 0; i < count; i++) {
    const side = count > 1 ? (i === 0 ? -1 : 1) : 0;   // 双发左右各偏移约 2.5 单位
    const origin = base.clone().addScaledVector(right, side * 2.5);
    origin.z += 2.5;
    origin.y -= 0.6;
    game.weapons.deployFlare(origin);
  }
  audio.flare();
  const text = count > 1
    ? '双发干扰弹'
    : (Number.isFinite(game.flares) ? '干扰弹释放 · 剩余 ' + game.flares : '干扰弹释放');
  hud.toast(text, 900);
  net.sendState(statePayload(), true);
  return true;
}

function addScore(delta, label = '') {
  if (!delta) return;
  if (delta > 0) delta = Math.round(delta * game.diff.scoreMult);   // 难度得分倍率
  game.score = Math.max(CFG.score.floor, game.score + Math.round(delta));
  if (Math.abs(delta) >= 60) {
    hud.flash((delta > 0 ? '+' : '') + Math.round(delta) + (label ? ' ' + label : ''));
  }
}

function damageEnemy(unit, weapon) {
  if (game.phase !== 'playing' || !unit.alive) return;
  const name = unit.info.name;

  if (weapon === 'missile') {
    game.enemies.kill(unit);
    game.weapons.explode(unit.center, 2.1, 0xffcf6a);
    game.stats.kills += 1;
    addScore(CFG.score[unit.size], '击毁 ' + name);
  } else {
    const res = game.enemies.damage(unit, 1);
    game.stats.hits += 1;
    audio.hit();
    addScore(CFG.score.cannonHit);
    if (res.destroyed) {
      game.weapons.explode(unit.center, 1.7, 0xffc050);
      game.stats.kills += 1;
      addScore(CFG.score[unit.size], '击毁 ' + name);
    } else {
      game.weapons.flash(unit.center, 0.9, 0xffd27a);
      game.weapons.smoke(unit.center, 0.7);
    }
  }

  if (game.enemies.remaining === 0) finish(true, 'clear');
}

function playerHit(kind) {
  if (game.phase !== 'playing') return;
  const res = player.damage(kind);
  if (res.ignored) return;
  hud.damageFlash();
  audio.damage();

  if (res.destroyed) {
    game.weapons.explode(player.group.position.clone(), 2.6, 0xff8a3a);
    player.destroy();
    finish(false, kind === 'missile' ? 'missile' : 'armor');
  } else {
    hud.toast(kind === 'missile' ? '导弹命中！' : '炮弹命中 · 护甲 ' + player.armor, 1200);
  }
}

function finish(win, reason) {
  if (game.phase === 'result') return;
  game.phase = 'result';
  game.keyCannon = false;
  game.netCannon = false;
  game.result = { win, reason };
  audio.finishSound(win);

  const acc = game.stats.shots > 0 ? (game.stats.hits / game.stats.shots) * 100 : 0;
  hud.showResult({
    win,
    reason,
    score: game.score,
    kills: game.stats.kills,
    total: game.enemies ? game.enemies.total : game.total,
    accuracy: acc,
    ammo: Math.max(0, game.diff.missiles - game.stats.missiles),
    timeUsed: game.mode.time - Math.max(0, game.time)
  });
  net.sendState(statePayload(), true);
}

function statePayload() {
  const mode = game.phase === 'preflight' && game.pendingMode ? game.pendingMode : game.mode;
  const setup = game.phase === 'menu' || game.phase === 'preflight';
  return {
    phase: game.phase,
    mode: mode ? mode.name : '',
    diff: game.diff.short,
    time: setup ? 0 : Math.max(0, Math.ceil(game.time || 0)),
    score: setup ? 0 : game.score,
    ammo: setup ? game.diff.missiles : Math.max(0, game.diff.missiles - game.stats.missiles),
    armor: setup ? game.diff.armor : player.armor,
    flares: Number.isFinite(game.flares) ? game.flares : null,
    remaining: setup ? 0 : (game.enemies ? game.enemies.remaining : 0),
    total: setup ? 0 : (game.enemies ? game.enemies.total : game.total),
    result: game.phase === 'result' && game.result ? (game.result.win ? 'win' : 'lose') : '',
    pitch: setup ? 0 : Math.round((player.pitch * 180) / Math.PI),
    yaw: setup ? 0 : Math.round((player.yaw * 180) / Math.PI),
    // 手机端出击准备页状态（V2.7.1）
    ready: game.phase === 'preflight' ? !!game.preflightReady : false,
    controllers: game.controllers,
    // 当前控制模式（V2.8.1）：手机据此决定是否显示摇杆
    control: game.control,
    // 手机端选模式列表（V2.5.2）
    modes: MODES.map((m) => ({ id: m.id, name: m.name, tag: m.tag }))
  };
}

/* ---------------- 网络 ---------------- */
const net = new Net({
  onPresence: (p) => {
    const prev = game.controllers;
    game.controllers = (p && p.controllers) || 0;
    if (game.controllers > 0) {
      hud.setStatus('net', 'ok', '已连接 ' + game.controllers + ' 台');
    } else if (p && p.host) {
      hud.setStatus('net', 'warn', '等待手机扫码');
    } else {
      hud.setStatus('net', 'err', '主机未注册');
    }
    if (prev === 0 && game.controllers > 0) hud.toast('手机控制器已连接', 1400);
    if (prev > 0 && game.controllers === 0) hud.toast('手机控制器已断开', 2000);
    if (game.phase === 'preflight') refreshPreflight();
  },
  onWeapon: (msg) => {
    if (!msg) return;
    if (msg.type === 'cannon' && msg.action === 'fire') {
      deployFlare(1);  // 兼容旧服务端：未知 type 会被改写成 cannon
    } else if (msg.type === 'cannon') {
      game.netCannon = msg.action === 'down';
    } else if (msg.type === 'missile' || msg.type === 'missileDbl') {
      shootMissile(msg.type === 'missileDbl' ? 2 : 1);
    } else if (msg.type === 'flare') {
      deployFlare(1);
    } else if (msg.type === 'evade') {
      game.evadeBtnPressed = true;
    } else if (msg.type === 'cannonTap') {
      game.netCannon = true;
      setTimeout(() => { game.netCannon = false; }, 180);
    }
  },
  onFlight: (m) => {
    if (!m) return;
    const first = game.phoneSeenAt === 0 || performance.now() - game.phoneSeenAt > 3000;
    game.phoneSeenAt = performance.now();
    game.phoneCount += 1;

    if (m.source === 'touch') {
      // V2.8.0 手机摇杆：pitch/yaw 已归一化 -1 ~ +1，直接存
      if (Number.isFinite(m.pitch)) game.touchPitch = clamp(m.pitch, -1, 1);
      if (Number.isFinite(m.yaw))   game.touchYaw   = clamp(m.yaw,   -1, 1);
      if (Number.isFinite(m.dirX))  game.touchDirX  = clamp(m.dirX,  -1, 1);
      game.touchSeenAt = performance.now();
      if (first) hud.toast('手机摇杆已接收', 1500);
    } else if (Number.isFinite(m.pitch) && Number.isFinite(m.roll)) {
      // 旧手机陀螺仪：角度制，存进 phonePitch/phoneRoll
      game.phonePitch = clamp(m.pitch, -90, 90);
      game.phoneRoll = clamp(m.roll, -90, 90);
      if (first) hud.toast('手机体感已接收 · 抬起/压下控制俯仰，左右翻转控制机头', 2200);
    }
    updatePhoneStatus(true);
  },
  /* V2.5.2：手机端返回菜单 / 选模式 / 重玩 */
  onCommand: (m) => {
    if (!m) return;
    if (m.action === 'menu') {
      if (game.phase === 'menu') return;
      closeTrainIfOpen();
      toMenu();
      hud.toast('手机端已返回模式选择', 1600);
      return;
    }
    if (m.action === 'replay') {
      if (game.phase !== 'result' || !game.mode) return;
      const id = game.mode.id;
      closeTrainIfOpen();
      beginMode(id);
      launchFromPreflight();
      return;
    }
    // 手机端在出击准备页直接确认出击（V2.7.1）
    if (m.action === 'launch') {
      if (game.phase !== 'preflight') return;
      if (!game.preflightReady) {
        hud.toast('检查尚未完成，暂不能出击', 1600);
        return;
      }
      launchFromPreflight();
      return;
    }
    if (m.action === 'mode' && m.mode) {
      if (game.phase === 'playing' || game.phase === 'countdown') return;
      closeTrainIfOpen();
      if (game.phase === 'preflight') cancelPreflight();
      beginMode(m.mode);
      if (game.phase === 'preflight') {
        if (game.control === 'keys' || cameraReady) {
          launchFromPreflight();
        } else {
          hud.toast('摄像头启动中，请在电脑端确认出击', 2400);
        }
      }
    }
  },
  onConnect: (ok) => {
    hud.setStatus('net', ok ? 'warn' : 'err', ok ? '等待手机扫码' : '服务未连接');
  }
});

/* 手机端返回菜单时若正处于训练屏，先收起训练屏 */
function closeTrainIfOpen() {
  if (game.phase === 'train') {
    voice.stop();
    train.running = false;
    hud.showTrain(false);
  }
}

async function loadQr() {
  try {
    const res = await fetch((window.GAME_SERVER || '') + '/api/game/info', { cache: 'no-store' });
    if (!res.ok) throw new Error('info failed');
    hud.setQr(await res.json());
  } catch (err) {
    hud.setQr(null);
    // Render 免费实例休眠唤醒约需 30~60 秒，失败后自动重试
    setTimeout(loadQr, 20000);
  }
}

/* ---------------- 主循环 ---------------- */
let lastFrame = performance.now();

function updatePlaying(dt) {
  // 输入优先级：键盘 > 手机触屏摇杆 > 手机陀螺仪 > 摄像头（体感飞行）
  const kp = keyPitch();
  const ky = keyYaw();
  const kd = keyDir();
  const touchOk = touchFresh();
  const gyroOk = phoneFresh();

  // 体感三通道：仅 camera 模式下才启用 pose
  const poseActive = game.control === 'camera' && kp === 0 && ky === 0 && !gyroOk && !touchOk;
  const poseReady = poseActive && pose.tracking;
  let pitchAbs = poseReady ? posePitchAbs() : null;
  const yawAbs = poseReady ? poseYawAbs() : (poseActive ? 0 : null);

  // pitchIn: 键盘 > 手机摇杆 > 手机陀螺仪
  let pitchIn;
  if (kp !== 0) {
    pitchIn = kp;
  } else if (game.control === 'touch' || touchOk) {
    // 摇杆已经归一化 -1~+1，直接用
    pitchIn = game.touchPitch;
  } else if (gyroOk) {
    pitchIn = analog(game.phonePitch, CFG.player.phonePitchDead, CFG.player.phonePitchFull);
  } else {
    pitchIn = 0;
  }

  // 紧急规避（先保留摄像头双手下压 / 手机规避按钮两条触发链路，touch 模式下只有按钮）
  if (game.evadeCd > 0) game.evadeCd = Math.max(0, game.evadeCd - dt);
  const evadeSig = game.evadeBtnPressed || pose.press >= 1 || pose.squat >= CFG.pose.squatStart;
  if (evadeSig && game.evadeCd <= 0) {
    game.squatHold = (game.squatHold || 0) + dt;
    if (game.squatHold >= CFG.pose.squatHoldMs / 1000) {
      game.squatHold = 0;
      game.evadeT = CFG.pose.evadeMs / 1000;
      game.evadeCd = CFG.pose.evadeCdMs / 1000;
      audio.ui();
      voice.play('warn.evade');
      hud.toast('紧急规避！', 700);
    }
  } else {
    game.squatHold = 0;
    game.evadeBtnPressed = false;  // 单次触发
  }
  if (game.evadeT > 0) {
    game.evadeT = Math.max(0, game.evadeT - dt);
    const base = pitchAbs !== null
      ? pitchAbs
      : clamp(pitchIn, -1, 1) * (pitchIn >= 0 ? CFG.player.pitchMaxUp : CFG.player.pitchMaxDown);
    pitchAbs = clamp(base - CFG.player.pitchMaxDown * 0.9,
      -CFG.player.pitchMaxDown, CFG.player.pitchMaxUp);
  }

  // yawIn: 键盘 > 手机摇杆 > 手机陀螺仪
  let yawIn;
  if (ky !== 0) {
    yawIn = ky;
  } else if (game.control === 'touch' || touchOk) {
    yawIn = game.touchYaw;   // 左拉为 +yawIn（机头左扫）
  } else if (gyroOk) {
    yawIn = -analog(game.phoneRoll, CFG.player.phoneRollDead, CFG.player.phoneRollFull);
  } else {
    yawIn = 0;
  }

  // dirX（飞机左右平移躲避）：键盘 > 手机摇杆 > 摄像头身体平移
  const dirX = kd !== 0
    ? kd
    : ((game.control === 'touch' || touchOk) ? game.touchDirX :
      (poseReady ? poseMoveX() : 0));

  // speed: 体感模式下飞机移动速度放慢；其他模式用 moveSpeed
  player.update(dt, {
    dirX,
    speed: (game.control === 'camera' && poseReady) ? CFG.player.poseMoveSpeed : CFG.player.moveSpeed,
    pitchIn: clamp(pitchIn, -1, 1),
    yawIn: clamp(yawIn, -1, 1),
    pitchAbs,
    yawAbs
  }, game.elapsed);
  updatePhoneStatus();
  updateBodyStatus();

  if (game.keyCannon || game.netCannon) {
    const interval = 1 / CFG.cannon.rate;
    game.cannonAcc += dt;
    let guard = 0;
    while (game.cannonAcc >= interval && guard++ < 5) {
      game.cannonAcc -= interval;
      shootCannon();
    }
  } else {
    game.cannonAcc = Math.min(game.cannonAcc, 1 / CFG.cannon.rate);
  }

  if (game.missileCd > 0) game.missileCd = Math.max(0, game.missileCd - dt);
  if (game.flareCd > 0) game.flareCd = Math.max(0, game.flareCd - dt);
  game.time -= dt;

  game.enemies.update(dt, { active: true });
  game.weapons.update(dt, {
    active: true,
    enemies: game.enemies,
    player,
    surfaceAt: game.terrain.surfaceAt
  });

  if (game.phase !== 'playing') return;
  if (!game.enemies) return;

  const threat = game.weapons.nearestThreat(player.group.position);
  // 自动干扰弹（V2.4.2）：敌导弹逼近且冷却就绪时自动释放
  if (CFG.flare.auto && threat && threat.kind === 'missile' && threat.eta <= CFG.flare.autoEta && game.flareCd <= 0 && player.alive) {
    deployFlare(1);
  }
  let lock = null;
  if (player.alive) lock = game.weapons.findLock(player.missileWorld(), player.forward(), game.enemies);

  if (threat) {
    if (threat.kind === 'missile') { audio.warning('missile'); voice.play('warn.missile'); }
    else if (!game.threatPrev) { audio.warning('shell'); voice.play('warn.shell'); }
  }
  game.threatPrev = !!threat;
  if (lock && !game.lockPrev) { audio.lock(); voice.play('warn.lock'); }
  game.lockPrev = !!lock;

  hud.update({
    time: Math.max(0, game.time),
    score: game.score,
    remaining: game.enemies.remaining,
    armor: player.armor,
    ammo: Math.max(0, game.diff.missiles - game.stats.missiles),
    flares: Number.isFinite(game.flares) ? game.flares : null,
    threat,
    lockName: lock ? lock.info.name : ''
  });

  // 战场鸟瞰小地图（V2.5）
  if (game.enemies && game.enemies.units) {
    const pl = player.group.position;
    hud.drawMinimap({
      visible: true,
      px: pl.x, pz: pl.z, yaw: player.yaw,
      enemies: game.enemies.units.filter((u) => u.alive).map((u) => ({
        x: u.group.position.x, z: u.group.position.z, type: u.type
      })),
      threat: threat ? { dx: threat.dx, dz: threat.dz } : null
    });
  } else {
    hud.drawMinimap({ visible: false });
  }

  net.sendState(statePayload());

  if (game.time <= 0) { finish(false, 'time'); return; }
  if (game.enemies.remaining === 0) finish(true, 'clear');
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, Math.max(0.0001, (now - lastFrame) / 1000));
  lastFrame = now;
  game.elapsed += dt;

  if (game.phase === 'menu' || game.phase === 'preflight' || game.phase === 'train') {
    menuCamera(dt);
    if (game.phase === 'preflight') {
      pfPoseTimer += dt;
      if (pfPoseTimer >= 0.5) {
        pfPoseTimer = 0;
        refreshPreflight();
      }
    } else if (game.phase === 'train') {
      trainUpdate(dt);
    }
  } else {
    if (game.phase === 'countdown') {
      game.countdown -= dt;
      const n = Math.ceil(game.countdown);
      if (n !== game.cdShown) {
        game.cdShown = n;
        if (n > 0) audio.countdown(n);
      }
      hud.setCountdown(n > 0 ? String(n) : '');
      player.update(dt, { dirX: 0, pitchIn: 0, yawIn: 0 }, game.elapsed);
      if (game.countdown <= 0) {
        game.phase = 'playing';
        game.time = game.mode.time;
        audio.go();
      }
    } else if (game.phase === 'playing') {
      updatePlaying(dt);
    } else if (game.weapons && game.enemies) {
      game.weapons.update(dt * 0.35, {
        active: false,
        enemies: game.enemies,
        player,
        surfaceAt: game.terrain.surfaceAt
      });
    }
    updateCamera(dt);
  }

  if (game.terrain) game.terrain.update(game.elapsed, dt);
  renderer.render(scene, camera);
}

/* ---------------- 启动 ---------------- */
function buildBackdrop() {
  game.terrain = createTerrain(getMode('road'));
  scene.add(game.terrain.group);
  applyEnvironment(getMode('road'));
  camera.position.set(40, 48, 28);
  camera.lookAt(0, 6, -120);
}

hud.bindModeSelect((id) => beginMode(id));
hud.bindDiff((id) => {
  game.diff = getDiff(id);
  audio.ui();
});
hud.bindControl((mode) => {
  game.control = mode;
  try { localStorage.setItem('mj.control', mode); } catch (err) { /* ignore */ }
  audio.ui();
  // 体感飞行才启用 Pose 识别器（键盘 / 手机触屏 都不需要）
  pose.enabled = mode === 'camera';
  if (mode === 'camera') {
    pose.resetBaseline();  // 重新校准重心/躯干零点
    if (!cameraReady) startCamera();  // 之前失败/超时后可切回体感重试
  } else {
    // 切到非 camera 模式：释放摄像头，避免后台继续占用
    releaseCamera();
  }
  refreshPreflight();
  net.sendState(statePayload(), true);  // 立即把控制模式同步给手机
});
hud.bindView((fp) => {
  game.fpView = fp;
  try { localStorage.setItem('mj.fp', fp ? '1' : '0'); } catch (err) { /* ignore */ }
  hud.toast(fp ? '第一人称视角' : '第三人称视角', 900);
  audio.ui();
});
hud.bindResult({
  onReplay: () => beginMode(game.mode.id),
  onMenu: () => toMenu()
});
hud.bindPreflight({
  onLaunch: () => launchFromPreflight(),
  onBack: () => cancelPreflight()
});
document.getElementById('trainBtn').addEventListener('click', () => openTrain());
document.getElementById('trainStart').addEventListener('click', () => startTrainSession());
document.getElementById('trainRestart').addEventListener('click', () => restartTrain());
document.getElementById('trainExit').addEventListener('click', () => closeTrain());
const voiceBtn = document.getElementById('voiceToggle');
const syncVoiceBtn = () => {
  voiceBtn.textContent = voice.enabled ? '语音 开' : '语音 关';
  voiceBtn.classList.toggle('off', !voice.enabled);
};
voiceBtn.addEventListener('click', () => { voice.toggle(); syncVoiceBtn(); });
syncVoiceBtn();
hud.setControl(savedControl);
hud.setView(game.fpView);
pose.enabled = savedControl === 'camera';

buildBackdrop();
loading.classList.add('hidden');
net.init();
loadQr();
requestAnimationFrame(tick);

// 自动化冒烟测试用的只读调试句柄
window.__mj = { game, player, pose };
