/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
import { THREE } from './three.js';

const MAT = (color, metalness = 0.45, roughness = 0.55, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

function box(g, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

function cyl(g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

function cone(g, r, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

function sphere(g, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, 8), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  g.add(m);
  return m;
}

function anchor(g, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

function cast(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return root;
}

/* ============================ 玩家战机 ============================ */
export function buildPlayerJet() {
  const g = new THREE.Group();
  const hull = MAT(0xdbe7f1, 0.55, 0.33);
  const dark = MAT(0x2a3845, 0.5, 0.55);
  const accent = MAT(0x275f78, 0.45, 0.4, { emissive: 0x0b3040, emissiveIntensity: 0.8 });
  const glass = MAT(0x0b2c40, 0.9, 0.12, { emissive: 0x1b7296, emissiveIntensity: 0.65 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x7ae6ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  // 机身 + 机头
  cyl(g, 0.7, 0.96, 6.0, hull, 0, 0, -0.1, Math.PI / 2, 0, 0, 12);
  cone(g, 0.72, 2.1, hull, 0, 0, -4.05, -Math.PI / 2, 0, 0, 12);
  box(g, 1.35, 0.5, 1.4, accent, 0, 0.42, -1.1);

  // 座舱
  sphere(g, 0.68, glass, 0, 0.56, -1.25, 1, 0.62, 2.0);

  // 主翼（后掠）
  box(g, 3.3, 0.16, 2.0, hull, -1.9, -0.04, 0.45, 0, 0.24, 0);
  box(g, 3.3, 0.16, 2.0, hull, 1.9, -0.04, 0.45, 0, -0.24, 0);
  box(g, 0.9, 0.12, 1.4, accent, -3.45, -0.04, 0.9);
  box(g, 0.9, 0.12, 1.4, accent, 3.45, -0.04, 0.9);

  // 垂尾
  box(g, 0.14, 1.35, 1.85, hull, -0.66, 0.85, 2.3, 0.12, 0, -0.16);
  box(g, 0.14, 1.35, 1.85, hull, 0.66, 0.85, 2.3, 0.12, 0, 0.16);

  // 发动机与喷口
  for (const sx of [-0.52, 0.52]) {
    cyl(g, 0.44, 0.48, 2.0, dark, sx, -0.02, 2.3, Math.PI / 2, 0, 0, 10);
  }
  const glowL = sphere(g, 0.34, glowMat, -0.52, -0.02, 3.4);
  const glowR = sphere(g, 0.34, glowMat, 0.52, -0.02, 3.4);

  // 机腹与翼下挂弹（装饰）
  box(g, 0.45, 0.5, 3.0, dark, 0, -0.62, 0.9);
  for (const [x, z] of [[-1.75, 0.2], [1.75, 0.2], [-2.7, 0.55], [2.7, 0.55]]) {
    cone(g, 0.18, 0.95, accent, x, -0.38, z, -Math.PI / 2, 0, 0, 8);
  }

  // 机炮吊舱
  for (const sx of [-3.15, 3.15]) {
    cyl(g, 0.26, 0.3, 1.5, dark, sx, -0.08, -0.55, Math.PI / 2, 0, 0, 8);
    cyl(g, 0.1, 0.1, 0.7, accent, sx, -0.08, -1.4, Math.PI / 2, 0, 0, 6);
  }

  const gunL = anchor(g, -3.15, -0.08, -1.7);
  const gunR = anchor(g, 3.15, -0.08, -1.7);
  const mport = anchor(g, 0, -0.8, -1.6);

  cast(g);
  return { group: g, gunL, gunR, mport, glows: [glowL, glowR] };
}

/* ============================ 主战坦克 ============================ */
function buildTank() {
  const g = new THREE.Group();
  const bodyMat = MAT(0x59613d, 0.3, 0.75);
  const darkMat = MAT(0x2a2e24, 0.25, 0.85);
  const turretMat = MAT(0x646c44, 0.35, 0.7);

  box(g, 3.4, 1.15, 5.1, bodyMat, 0, 0.88, 0);
  box(g, 3.0, 0.62, 4.5, turretMat, 0, 1.78, 0.1);
  box(g, 3.7, 0.34, 4.6, darkMat, 0, 1.5, 0.1);

  for (const sx of [-1.78, 1.78]) {
    box(g, 0.96, 0.98, 5.35, darkMat, sx, 0.52, 0);
    for (const sz of [-1.7, -0.57, 0.57, 1.7]) {
      cyl(g, 0.5, 0.5, 1.0, darkMat, sx, 0.5, sz, 0, 0, Math.PI / 2, 12);
    }
  }

  const turret = new THREE.Group();
  turret.position.y = 2.1;
  g.add(turret);
  cyl(turret, 1.45, 1.75, 0.9, turretMat, 0, 0.42, 0, 0, 0, 0, 12);
  box(turret, 2.0, 0.7, 2.6, turretMat, 0, 0.95, 0.2);
  cyl(turret, 0.19, 0.26, 4.4, darkMat, 0, 0.52, -2.15, Math.PI / 2, 0, 0, 10);
  box(turret, 0.16, 0.55, 0.16, darkMat, -0.7, 1.4, 1.0);
  const muzzle = anchor(turret, 0, 0.52, -4.4);

  cast(g);
  return { group: g, turret, muzzle, spin: [] };
}

/* ============================ 装甲运兵车 ============================ */
function buildApc() {
  const g = new THREE.Group();
  const bodyMat = MAT(0x6b7052, 0.3, 0.72);
  const darkMat = MAT(0x282c22, 0.3, 0.8);
  const glass = MAT(0x18262e, 0.8, 0.2, { emissive: 0x0a1a22, emissiveIntensity: 0.4 });

  box(g, 2.7, 1.35, 4.5, bodyMat, 0, 1.25, 0);
  box(g, 2.45, 0.85, 1.3, bodyMat, 0, 0.95, -2.4, 0.28, 0, 0);
  box(g, 2.78, 0.32, 3.4, darkMat, 0, 1.85, 0.3);
  box(g, 1.9, 0.62, 0.1, glass, 0, 1.56, -2.28);

  for (const sx of [-1.42, 1.42]) {
    for (const sz of [-1.6, -0.55, 0.55, 1.6]) {
      cyl(g, 0.56, 0.56, 0.42, darkMat, sx, 0.55, sz, 0, 0, Math.PI / 2, 12);
    }
  }

  const turret = new THREE.Group();
  turret.position.set(0, 2.0, 0.4);
  g.add(turret);
  cyl(turret, 0.72, 0.9, 0.55, bodyMat, 0, 0.28, 0, 0, 0, 0, 10);
  cyl(turret, 0.1, 0.12, 2.0, darkMat, 0, 0.42, -1.1, Math.PI / 2, 0, 0, 8);
  const muzzle = anchor(turret, 0, 0.42, -2.15);

  cast(g);
  return { group: g, turret, muzzle, spin: [] };
}

/* ============================ 固定炮塔 ============================ */
function buildTurret() {
  const g = new THREE.Group();
  const concrete = MAT(0x8b8878, 0.15, 0.9);
  const darkMat = MAT(0x2d332a, 0.35, 0.7);
  const sandMat = MAT(0xa2946a, 0.05, 0.95);

  box(g, 3.4, 0.8, 3.4, concrete, 0, 0.4, 0);
  box(g, 3.8, 0.5, 3.8, sandMat, 0, 0.85, 0);
  const turret = new THREE.Group();
  turret.position.y = 1.0;
  g.add(turret);
  cyl(turret, 1.2, 1.45, 0.85, darkMat, 0, 0.42, 0, 0, 0, 0, 12);
  cyl(turret, 0.17, 0.2, 3.4, darkMat, 0, 0.52, -1.6, Math.PI / 2, 0, 0, 8);
  const muzzle = anchor(turret, 0, 0.52, -3.3);

  cast(g);
  return { group: g, turret, muzzle, spin: [] };
}

/* ============================ 指挥地堡 ============================ */
function buildBunker() {
  const g = new THREE.Group();
  const concrete = MAT(0x9a978b, 0.12, 0.92);
  const concrete2 = MAT(0x7d7a6f, 0.1, 0.95);
  const darkMat = MAT(0x20241f, 0.4, 0.7);
  const metal = MAT(0x59605c, 0.6, 0.5);

  box(g, 7.2, 3.3, 6.4, concrete, 0, 1.65, 0);
  box(g, 7.9, 0.45, 7.1, concrete2, 0, 3.4, 0);
  box(g, 5.2, 0.32, 0.14, darkMat, 0, 2.25, -3.22);
  for (const sx of [-2.6, 2.6]) {
    box(g, 0.9, 1.4, 0.5, concrete2, sx, 0.7, -3.4);
  }
  box(g, 0.1, 2.0, 0.1, metal, -2.4, 4.4, 1.2);

  const turret = new THREE.Group();
  turret.position.set(0.6, 3.7, -0.9);
  g.add(turret);
  box(turret, 2.0, 0.95, 1.4, metal, 0, 0, 0);
  for (const sx of [-0.65, 0.65]) {
    for (const sy of [0.35, -0.1]) {
      cyl(turret, 0.16, 0.16, 0.5, darkMat, sx, sy, -0.75, Math.PI / 2, 0, 0, 8);
    }
  }
  const muzzle = anchor(turret, 0, 0.35, -1.0);

  cast(g);
  return { group: g, turret, muzzle, spin: [] };
}

/* ============================ 舰船 ============================ */
function buildShip(kind) {
  const g = new THREE.Group();
  const isDestroyer = kind === 'destroyer';
  const L = isDestroyer ? 26 : 17;
  const W = isDestroyer ? 6.4 : 4.8;
  const hullMat = MAT(isDestroyer ? 0x8e99a3 : 0xa3adb4, 0.55, 0.45);
  const deckMat = MAT(0x5d6770, 0.45, 0.6);
  const whiteMat = MAT(0xd9e0e4, 0.35, 0.55);
  const darkMat = MAT(0x2a333a, 0.5, 0.55);
  const redMat = MAT(0x7d2f2f, 0.25, 0.7);

  const shape = new THREE.Shape();
  const hw = W / 2;
  const hl = L / 2;
  shape.moveTo(-hw, hl - 2);
  shape.lineTo(hw, hl - 2);
  shape.lineTo(hw, -hl + 3.4);
  shape.lineTo(0, -hl);
  shape.lineTo(-hw, -hl + 3.4);
  shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 2.0;
  g.add(hull);

  box(g, W + 0.05, 0.28, L * 0.82, redMat, 0, 0.62, 0.4);
  box(g, W * 0.88, 0.35, L * 0.82, deckMat, 0, 2.05, 0.4);

  const bridgeZ = isDestroyer ? 3.2 : 2.2;
  box(g, W * 0.62, 2.1, L * 0.2, whiteMat, 0, 3.2, bridgeZ);
  box(g, W * 0.52, 1.1, L * 0.16, darkMat, 0, 4.5, bridgeZ);
  cyl(g, 0.85, 1.0, 1.9, darkMat, 0, 4.4, bridgeZ + 4.2);
  cyl(g, 0.1, 0.1, 3.4, whiteMat, 0, 5.9, bridgeZ - 1.5, 0, 0, 0, 6);
  box(g, 0.7, 0.5, 2.0, whiteMat, 0, 6.6, bridgeZ - 1.5);

  // 主炮塔（舰首）
  const turret = new THREE.Group();
  turret.position.set(0, 2.5, isDestroyer ? -7.0 : -4.6);
  g.add(turret);
  cyl(turret, 1.1, 1.4, 0.8, darkMat, 0, 0.35, 0, 0, 0, 0, 12);
  cyl(turret, 0.17, 0.22, 3.2, whiteMat, 0, 0.5, -1.5, Math.PI / 2, 0, 0, 8);
  const muzzle = anchor(turret, 0, 0.5, -3.1);

  // 近防炮
  box(g, 0.9, 0.7, 0.9, whiteMat, 0, 2.6, isDestroyer ? 7.4 : 5.2);
  cyl(g, 0.08, 0.08, 1.4, darkMat, 0, 2.95, isDestroyer ? 7.0 : 4.9, Math.PI / 2, 0, 0, 6);

  if (isDestroyer) {
    for (const sx of [-1.9, 1.9]) box(g, 0.8, 0.45, 1.6, whiteMat, sx, 2.4, 3.4);
  }

  cast(g);
  return { group: g, turret, muzzle, spin: [] };
}

/* ============================ 快艇 ============================ */
function buildBoat() {
  const g = new THREE.Group();
  const hullMat = MAT(0x6f7d86, 0.5, 0.5);
  const whiteMat = MAT(0xcdd6db, 0.4, 0.5);
  const glass = MAT(0x14242c, 0.8, 0.2);
  const darkMat = MAT(0x242c31, 0.4, 0.6);

  box(g, 2.2, 0.9, 3.6, hullMat, 0, 0.55, 0.4);
  cone(g, 1.1, 1.8, hullMat, 0, 0.55, -2.1, -Math.PI / 2, 0, 0, 4);
  box(g, 1.7, 0.9, 1.6, whiteMat, 0, 1.25, 0.5);
  box(g, 1.4, 0.45, 0.08, glass, 0, 1.4, -0.32);
  box(g, 0.5, 0.7, 0.55, darkMat, 0, 0.9, 2.3);
  box(g, 0.8, 0.1, 1.0, darkMat, 0, 1.78, 0.9);

  cast(g);
  return { group: g, turret: null, muzzle: null, spin: [] };
}

/* ============================ 岛礁炮台 ============================ */
function buildIslandTurret() {
  const g = new THREE.Group();
  const concrete = MAT(0x8e8b7c, 0.12, 0.92);
  const darkMat = MAT(0x32372c, 0.35, 0.7);
  box(g, 4.8, 1.2, 4.8, concrete, 0, 0.6, 0);
  box(g, 3.2, 0.8, 3.2, concrete, 0, 1.4, 0);
  const turret = new THREE.Group();
  turret.position.y = 1.8;
  g.add(turret);
  cyl(turret, 1.35, 1.55, 0.9, darkMat, 0, 0.42, 0, 0, 0, 0, 12);
  cyl(turret, 0.17, 0.21, 3.6, darkMat, 0, 0.52, -1.7, Math.PI / 2, 0, 0, 8);
  const muzzle = anchor(turret, 0, 0.52, -3.5);
  cast(g);
  return { group: g, turret, muzzle, spin: [] };
}

/* ============================ 敌方战机 ============================ */
function buildEnemyJet() {
  const g = new THREE.Group();
  const hull = MAT(0x8a3a34, 0.5, 0.4);
  const dark = MAT(0x2a2424, 0.5, 0.55);
  const glass = MAT(0x32140f, 0.85, 0.18, { emissive: 0x6d1c10, emissiveIntensity: 0.5 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff9a4a,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  cyl(g, 0.62, 0.9, 5.2, hull, 0, 0, -0.2, Math.PI / 2, 0, 0, 10);
  cone(g, 0.64, 1.9, hull, 0, 0, -3.6, -Math.PI / 2, 0, 0, 10);
  sphere(g, 0.55, glass, 0, 0.5, -1.0, 1, 0.6, 1.8);
  box(g, 2.6, 0.14, 1.4, hull, -1.25, 0, 0.35, 0, 0.42, 0);
  box(g, 2.6, 0.14, 1.4, hull, 1.25, 0, 0.35, 0, -0.42, 0);
  box(g, 0.12, 1.1, 1.5, hull, -0.5, 0.65, 2.1, 0, 0, -0.2);
  box(g, 0.12, 1.1, 1.5, hull, 0.5, 0.65, 2.1, 0, 0, 0.2);
  cyl(g, 0.32, 0.36, 1.4, dark, 0, 0, 2.2, Math.PI / 2, 0, 0, 8);
  const glow = sphere(g, 0.3, glowMat, 0, 0, 2.9);
  glow.userData.pulse = true;

  const muzzle = anchor(g, 0, -0.5, -2.0);
  cast(g);
  return { group: g, turret: null, muzzle, spin: [glow] };
}

/* ============================ 无人机 ============================ */
function buildDrone() {
  const g = new THREE.Group();
  const dark = MAT(0x3a3f42, 0.5, 0.5);
  const accent = MAT(0x7a2f2a, 0.4, 0.5);
  const rotorMat = MAT(0x1c2022, 0.3, 0.5, { transparent: true, opacity: 0.7 });

  box(g, 0.95, 0.5, 1.4, dark, 0, 0, 0);
  box(g, 0.6, 0.3, 0.5, accent, 0, 0.3, -0.3);
  const spin = [];
  for (const [sx, sz] of [[-1.1, -1.0], [1.1, -1.0], [-1.1, 1.0], [1.1, 1.0]]) {
    box(g, 1.2, 0.07, 0.07, dark, sx * 0.55, 0, sz * 0.5, 0, Math.atan2(sz, sx), 0);
    const rotor = cyl(g, 0.72, 0.72, 0.05, rotorMat, sx, 0.18, sz, 0, 0, 0, 12);
    spin.push(rotor);
  }
  const beacon = sphere(g, 0.12, MAT(0xff5533, 0.1, 0.3, { emissive: 0xff3311, emissiveIntensity: 1.4 }), 0, 0.4, 0.7);
  spin.push(beacon);

  cast(g);
  return { group: g, turret: null, muzzle: null, spin };
}

/* ============================ 预警机 ============================ */
function buildAwacs() {
  const g = new THREE.Group();
  const hull = MAT(0xb9c4cb, 0.5, 0.45);
  const dark = MAT(0x3b454c, 0.5, 0.5);
  const glass = MAT(0x152a34, 0.85, 0.15);
  const domeMat = MAT(0xe3e9ec, 0.3, 0.5);

  cyl(g, 0.9, 1.1, 9, hull, 0, 0, 0, Math.PI / 2, 0, 0, 12);
  cone(g, 1.1, 2.2, hull, 0, 0, -5.6, -Math.PI / 2, 0, 0, 12);
  box(g, 13, 0.26, 3.0, hull, 0, 0.15, -0.4);
  sphere(g, 1.9, domeMat, 0, 1.6, 0.3, 1, 0.55, 1, 16);
  box(g, 0.12, 1.2, 1.4, hull, -0.6, 0.7, 4.2, 0, 0, -0.15);
  box(g, 0.12, 1.2, 1.4, hull, 0.6, 0.7, 4.2, 0, 0, 0.15);
  box(g, 3.0, 0.5, 0.5, glass, 0, 0.55, -5.0);
  for (const sx of [-3.6, -1.8]) {
    cyl(g, 0.38, 0.42, 1.3, dark, sx, -0.4, 0.8, Math.PI / 2, 0, 0, 8);
  }

  const muzzle = anchor(g, 0, -0.6, -2.0);
  cast(g);
  return { group: g, turret: null, muzzle, spin: [] };
}

/* ============================ 地面雷达站 ============================ */
function buildRadar() {
  const g = new THREE.Group();
  const concrete = MAT(0x8a8678, 0.12, 0.92);
  const metal = MAT(0x5d666c, 0.6, 0.5);
  const dark = MAT(0x2b3136, 0.5, 0.6);

  box(g, 3.6, 0.7, 3.6, concrete, 0, 0.35, 0);
  box(g, 2.4, 1.2, 2.4, concrete, 0, 1.3, 0);
  cyl(g, 0.26, 0.4, 4.4, metal, 0, 3.4, 0, 0, 0, 0, 8);

  const turret = new THREE.Group();
  turret.position.y = 5.7;
  g.add(turret);
  cyl(turret, 1.9, 0.35, 0.45, MAT(0xdfe5e8, 0.35, 0.5), 0, 0.2, 0, 1.4, 0, 0, 16);
  box(turret, 0.5, 0.5, 0.9, dark, 0, -0.25, 0.6);
  const muzzle = anchor(turret, 0, 0, -1.0);

  cast(g);
  return { group: g, turret, muzzle, spin: [turret] };
}

const BUILDERS = {
  tank: buildTank,
  apc: buildApc,
  turret: buildTurret,
  bunker: buildBunker,
  destroyer: () => buildShip('destroyer'),
  frigate: () => buildShip('frigate'),
  boat: buildBoat,
  islandTurret: buildIslandTurret,
  enemyJet: buildEnemyJet,
  drone: buildDrone,
  awacs: buildAwacs,
  radar: buildRadar
};

export function buildEnemyModel(type) {
  const fn = BUILDERS[type] || buildTurret;
  return fn();
}

export function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}
