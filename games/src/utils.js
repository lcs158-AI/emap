export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const deg2rad = (d) => (d * Math.PI) / 180;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 给可能永久挂起的异步操作加超时，避免界面一直停在“加载中” */
export function withTimeout(promise, ms, label = '') {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout' + (label ? ':' + label : ''))), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 二维 Perlin 噪声，返回约 [-1,1] */
export function makeNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const base = [];
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };

  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 0.72;
  };
}

/** 分形噪声（可复用于地形） */
export function makeFbm(seed = 1) {
  const noise = makeNoise(seed);
  return function fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / (norm || 1);
  };
}

/** 线段 a→b 到点 c 的最近距离平方 */
export function segmentSphereDist2(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (acx * abx + acy * aby + acz * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const dx = ax + abx * t - cx;
  const dy = ay + aby * t - cy;
  const dz = az + abz * t - cz;
  return dx * dx + dy * dy + dz * dz;
}

/** 带角度限制的向量转向 */
export function steerVector(dir, targetDir, maxRad, dt) {
  const ang = dir.angleTo(targetDir);
  if (ang < 1e-5) return targetDir.clone();
  const t = Math.min(1, (maxRad * dt) / ang);
  if (t >= 1) return targetDir.clone();
  if (ang > Math.PI * 0.92) {
    // 近反向：绕任意垂直轴旋转一小步，避免 lerp 退化
    const axis = new dir.constructor(-dir.z, 0, dir.x).normalize();
    return dir.clone().applyAxisAngle(axis, maxRad * dt);
  }
  return dir.clone().lerp(targetDir, t).normalize();
}
