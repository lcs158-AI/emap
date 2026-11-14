// 全局参数与四模式配置。调整平衡性只需修改本文件。

export const CFG = {
  player: {
    xRange: 100,       // 战机左右活动边界
    poseSpan: 30,      // 姿态横向映射幅度
    poseGain: 4.5,     // 姿态平滑系数
    poseInterval: 40,  // 姿态识别间隔（约 25fps，越低越跟手、CPU 越高）
    poseLostMs: 900,   // 多久未识别视为丢失
    poseMoveSpeed: 24, // 体感侧移速度（比键盘更快，便于躲避攻击）
    moveSpeed: 18,     // 键盘平移速度
    vySpeed: 40,       // 键盘垂直升降速度
    yRange: 14,        // 相对巡航高度的升降幅度
    bob: 0.25,         // 巡航高度浮动
    armor: 3,          // 护甲格数
    // 飞行姿态（V2.3.0）
    pitchMaxUp: 0.42,    // 机头最大上仰（约 +24°）
    pitchMaxDown: 0.55,  // 机头最大下俯（约 -31°）
    pitchGain: 5.0,      // 俯仰平滑逼近系数（时间常数约 0.2s，避免上下窜）
    yawMax: 0.70,        // 机头最大方位角（约 ±40°）
    yawSpeed: 1.0,       // 方位角转动速度（rad/s）
    climbSpeed: 20,      // 俯仰引起的高度变化速度（降低后上下更稳）
    cameraYawFollow: 70, // 摄像机画面中心随机头方位偏移
    phonePitchDead: 6,   // 手机俯仰死区（度）
    phonePitchFull: 25,  // 手机俯仰饱和角（度）
    phoneRollDead: 8,    // 手机翻滚死区（度）
    phoneRollFull: 28,   // 手机翻滚饱和角（度）
    poseYawGain: 4.5     // 机头方位平滑逼近系数（降低后左右不飘）
  },
  // 体感三通道：左右=身体平移（肩宽归一化），上下=双手高度（手腕→肘部兜底），下压=紧急规避
  pose: {
    shiftDead: 0.10,     // 重心左右死区（加大后站定不飘）
    shiftFull: 0.30,     // 重心左右饱和量（侧移更多才满舵）
    torsoDead: 0.10,     // 双手高度死区（滤掉手持手机的抖动）
    torsoFull: 0.45,     // 双手高度饱和量（举到肩以上才满舵）
    handGain: 1.0,       // 双手高度增益
    smooth: 0.30,        // 采样平滑系数（越小越稳、越迟）
    pressSpeed: 2.6,     // 双手快速下压速度阈值（肩宽/秒，正=向下）
    pressDepth: 0.20,    // 双手下压深度阈值（触发紧急规避需低于此值）
    twistDead: 0.06,     // 躯干扭转死区（弧度，约 3.4°）
    twistFull: 0.35,     // 躯干扭转饱和量（弧度，约 20° 即满舵）
    twistSmooth: 0.50,   // 扭转平滑系数（比平移略快，扫射更跟手）
    squatStart: 0.18,    // 下蹲触发深度（髋部下沉 / 肩宽，全身入镜时有效）
    squatHoldMs: 200,    // 规避动作需保持时长
    evadeMs: 600,        // 紧急急俯冲规避持续
    evadeCdMs: 2000      // 规避冷却
  },
  train: {
    passShift: 0.18,     // 左右重心通过幅度
    passTorso: 0.18,     // 躯干俯仰通过幅度
    passSquat: 0.20,     // 下蹲通过幅度
    passYaw: 0.12,       // 躯干扭转通过角度（弧度，约 7°）
    holdMs: 700,         // 达标需保持时长
    reps: 3              // 每个动作练习次数
  },
  voice: {
    enabled: true,       // 语音提示总开关（TTS / 录音）
    volume: 1.0,
    rate: 1.0
  },
  cannon: {
    rate: 16,          // 发/秒（V2.3.0 翻倍）
    speed: 150,
    spreadDeg: 1.0,
    range: 180,
    bulletRadius: 0.45
  },
  missile: {
    count: 10,
    cooldown: 1.5,
    speed: 90,
    turnDeg: 60,
    lockDeg: 25,
    life: 3.6,
    hitRadius: 1.6
  },
  enemy: {
    shellSpeed: 80,
    shellGravity: 9,
    shellInterval: [3.0, 5.0],
    shellRange: 135,
    missileSpeed: 55,
    missileTurnDeg: 75,
    missileInterval: [8, 12],
    missileRange: 172,
    missileLife: 8,
    warnRadius: 5.0
  },
  flare: {
    count: Infinity,   // 每局干扰弹数量（无限，仅受冷却限制）
    cooldown: 2.5,     // 释放冷却（秒）
    radius: 130,       // 吸引敌方导弹的半径
    life: 1.0,         // 诱饵存活时间（秒）
    auto: true,        // 敌导弹逼近时自动释放（V2.4.2）
    autoEta: 2.8       // 自动释放的预计命中时间阈值（秒）
  },
  score: {
    small: 100,
    medium: 200,
    large: 300,
    cannonHit: 10,
    cannonMiss: 3,
    missileMiss: 60,
    intercept: 30,
    floor: 0
  },
  hudInterval: 0.08,
  netInterval: 0.5
};

export const MODES = [
  {
    id: 'road',
    name: '公路',
    tag: '平原 · 车队歼灭',
    time: 120,
    altitude: 24,
    sky: 0xa8cfe6,
    fog: [140, 520],
    sun: { color: 0xfff0d0, intensity: 1.9, pos: [-120, 140, 80] },
    hemi: { sky: 0xd6ecff, ground: 0x4a4a30, intensity: 0.8 },
    desc: '车队沿 S 形公路推进，路边炮塔与终点地堡构成防线。',
    enemies: [
      { type: 'apc', count: 6 },
      { type: 'tank', count: 3 },
      { type: 'turret', count: 3 },
      { type: 'bunker', count: 1 }
    ]
  },
  {
    id: 'field',
    name: '野战',
    tag: '丘陵 · 山脊突击',
    time: 150,
    altitude: 38,
    sky: 0x93a8b8,
    fog: [120, 460],
    sun: { color: 0xdfe9f0, intensity: 1.5, pos: [-80, 150, 40] },
    hemi: { sky: 0xb7cade, ground: 0x39442c, intensity: 0.95 },
    desc: '起伏丘陵与山脊交错，坦克群藏于山谷与反斜面。',
    enemies: [
      { type: 'tank', count: 5 },
      { type: 'apc', count: 5 },
      { type: 'turret', count: 4 },
      { type: 'bunker', count: 2 }
    ]
  },
  {
    id: 'sea',
    name: '海战',
    tag: '海面 · 舰艇编队',
    time: 150,
    altitude: 14,
    sky: 0x6fb6dc,
    fog: [130, 520],
    sun: { color: 0xfff4da, intensity: 2.0, pos: [-100, 150, 60] },
    hemi: { sky: 0xd0f0ff, ground: 0x0d2a3a, intensity: 0.9 },
    desc: '动态海面与岛屿，舰艇编队巡航，岛礁炮台封锁航道。',
    enemies: [
      { type: 'destroyer', count: 2 },
      { type: 'frigate', count: 3 },
      { type: 'boat', count: 4 },
      { type: 'islandTurret', count: 2 }
    ]
  },
  {
    id: 'air',
    name: '空战',
    tag: '高空 · 云海缠斗',
    time: 120,
    altitude: 46,
    sky: 0x4a8ec4,
    fog: [180, 620],
    sun: { color: 0xfff8e6, intensity: 2.1, pos: [-140, 180, 90] },
    hemi: { sky: 0xa8d8ff, ground: 0x2a3540, intensity: 0.85 },
    desc: '高空云海之上，敌机编队与预警机巡逻，地面雷达站提供引导。',
    enemies: [
      { type: 'enemyJet', count: 5 },
      { type: 'drone', count: 4 },
      { type: 'awacs', count: 1 },
      { type: 'radar', count: 2 }
    ]
  },
  {
    id: 'train',
    name: '训练场',
    tag: '无威胁 · 操控练习',
    time: 180,
    altitude: 24,
    sky: 0xa8cfe6,
    fog: [140, 520],
    sun: { color: 0xfff0d0, intensity: 1.9, pos: [-120, 140, 80] },
    hemi: { sky: 0xd6ecff, ground: 0x39442c, intensity: 0.85 },
    desc: '固定地面靶标沿纵深一字排开，敌目标不开火；用于练习平移、俯仰、机头方位与俯冲瞄准。',
    training: true,
    enemies: [
      { type: 'turret', count: 4 },
      { type: 'bunker', count: 2 }
    ]
  }
];

export const ENEMY_TYPES = {
  apc: { name: '装甲运兵车', size: 'medium', hp: 2, radius: 3.2, centerY: 1.6, shell: true },
  tank: { name: '主战坦克', size: 'large', hp: 3, radius: 4.2, centerY: 1.9, shell: true },
  turret: { name: '路边炮塔', size: 'small', hp: 1, radius: 2.4, centerY: 1.4, shell: true },
  bunker: { name: '指挥地堡', size: 'large', hp: 3, radius: 5.2, centerY: 2.6, missile: true },
  destroyer: { name: '驱逐舰', size: 'large', hp: 3, radius: 7.2, centerY: 2.8, shell: true, missile: true },
  frigate: { name: '护卫舰', size: 'medium', hp: 2, radius: 5.0, centerY: 2.4, shell: true },
  boat: { name: '快艇', size: 'small', hp: 1, radius: 2.6, centerY: 1.1 },
  islandTurret: { name: '岛礁炮台', size: 'medium', hp: 2, radius: 3.8, centerY: 1.8, shell: true },
  enemyJet: { name: '敌方战机', size: 'medium', hp: 2, radius: 4.0, centerY: 0, missile: true },
  drone: { name: '无人机', size: 'small', hp: 1, radius: 2.2, centerY: 0 },
  awacs: { name: '预警机', size: 'large', hp: 3, radius: 6.5, centerY: 0, missile: true },
  radar: { name: '雷达站', size: 'medium', hp: 2, radius: 3.2, centerY: 2.6, missile: true }
};

// 四档难度：渐进进阶；enemyFireMult 越大敌方开火越慢
export const DIFFS = [
  { id: 'easy',   name: '简单', short: '易', enemyFireMult: 2.2,  shellSpeedMult: 0.8,  armor: 4, missiles: 12, scoreMult: 0.8 },
  { id: 'normal', name: '普通', short: '普', enemyFireMult: 1.4,  shellSpeedMult: 1.0,  armor: 3, missiles: 10, scoreMult: 1 },
  { id: 'hard',   name: '困难', short: '难', enemyFireMult: 1.0,  shellSpeedMult: 1.2,  armor: 3, missiles: 10, scoreMult: 1.5 },
  { id: 'hell',   name: '地狱', short: '狱', enemyFireMult: 0.65, shellSpeedMult: 1.45, armor: 2, missiles: 8,  scoreMult: 2 }
];

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

export function getDiff(id) {
  return DIFFS.find((d) => d.id === id) || DIFFS[1];
}
