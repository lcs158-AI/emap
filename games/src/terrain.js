/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
import { THREE } from './three.js';
import { makeFbm, mulberry32, clamp, lerp } from './utils.js';

const SIZE = 620;
const SEG = 120;
const Z_CENTER = -130;

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.58)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

export function createTerrain(mode) {
  const group = new THREE.Group();
  const seed = Math.floor(Math.random() * 90000) + 1000;
  const rnd = mulberry32(seed);
  const fbmA = makeFbm(seed + 7);
  const fbmB = makeFbm(seed + 31);
  const id = mode.id;

  let islands = [];
  let roadX = null;
  let heightAt;

  if (id === 'road') {
    roadX = (z) => 26 * Math.sin((z + 100) * 0.0105) + 10 * Math.sin((z + 40) * 0.026);
    const base = (x, z) =>
      1.4 + fbmA(x * 0.006, z * 0.006, 3) * 6.5 + fbmB(x * 0.02, z * 0.02, 2) * 1.4;
    heightAt = (x, z) => {
      const h = base(x, z);
      const d = Math.abs(x - roadX(z));
      if (d > 24) return h;
      const rh = base(roadX(z), z);
      const k = clamp((d - 7) / 17, 0, 1);
      return lerp(rh - 0.12, h, k * k);
    };
  } else if (id === 'field') {
    const ridge = (x, z) => Math.abs(fbmB(z * 0.0045, x * 0.0026, 2)) * 9;
    heightAt = (x, z) =>
      7 + fbmA(x * 0.0075, z * 0.0075, 4) * 20 + ridge(x, z) + fbmB(x * 0.03, z * 0.03, 2) * 2;
  } else if (id === 'train') {
    // 训练场：平缓起伏的靶场，保证纵深靶标可见且不会被山体遮挡
    heightAt = (x, z) =>
      1.6 + fbmA(x * 0.008, z * 0.008, 3) * 4.5 + fbmB(x * 0.03, z * 0.03, 2) * 1.2;
  } else if (id === 'sea') {
    islands = [
      { x: -100, z: -150, r: 72, h: 22 },
      { x: 95, z: -132, r: 60, h: 16 },
      { x: -10, z: -305, r: 58, h: 12 },
      { x: 175, z: -265, r: 78, h: 19 }
    ];
    heightAt = (x, z) => {
      let h = -8 + fbmA(x * 0.01, z * 0.01, 2) * 3;
      for (const isl of islands) {
        const d = Math.hypot(x - isl.x, z - isl.z) / isl.r;
        if (d < 1) {
          h = Math.max(h, isl.h * Math.pow(1 - d, 1.65) + fbmB(x * 0.04, z * 0.04, 2) * 2.6);
        }
      }
      return h;
    };
  } else {
    heightAt = (x, z) =>
      -45 + fbmA(x * 0.0035, z * 0.0035, 3) * 9 + fbmB(x * 0.012, z * 0.012, 2) * 2;
  }

  const surfaceAt = (x, z) => (id === 'sea' ? 0 : heightAt(x, z));

  /* ---------- 地形网格 ---------- */
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  const cGrass = new THREE.Color(0x5d7a3c);
  const cGrass2 = new THREE.Color(0x7f9647);
  const cSoil = new THREE.Color(0x7b6a49);
  const cRock = new THREE.Color(0x7e7d73);
  const cSand = new THREE.Color(0xcbb079);
  const cDark = new THREE.Color(0x35472f);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + Z_CENTER;
    const h = heightAt(x, z);

    const dhx = heightAt(x + 2.2, z) - h;
    const dhz = heightAt(x, z + 2.2) - h;
    const slope = Math.min(1, Math.hypot(dhx, dhz) / 3.2);
    const variation = fbmB(x * 0.09, z * 0.09, 2);

    if (id === 'sea') {
      if (h < 0.9) color.copy(cSand).lerp(cDark, 0.35);
      else if (slope > 0.55 || h > 13) color.copy(cRock);
      else color.copy(cSand).lerp(cGrass, clamp((h - 1) / 6, 0, 1));
    } else if (id === 'field' || id === 'train') {
      color.copy(cGrass).lerp(cSoil, clamp(slope * 1.1, 0, 1));
      if (slope > 0.72) color.copy(cRock);
      color.lerp(cGrass2, clamp(variation * 0.9 + 0.35, 0, 1) * 0.35);
    } else if (id === 'air') {
      color.copy(cGrass).lerp(cSoil, 0.45).lerp(cDark, 0.25);
      color.lerp(cGrass2, clamp(variation + 0.4, 0, 1) * 0.25);
    } else {
      color.copy(cGrass).lerp(cGrass2, clamp(variation + 0.5, 0, 1) * 0.55);
      color.lerp(cSoil, clamp(slope * 0.9, 0, 1) * 0.7);
    }

    const shade = 0.86 + clamp((h + 10) / 70, 0, 1) * 0.22;
    colors[i * 3] = color.r * shade;
    colors[i * 3 + 1] = color.g * shade;
    colors[i * 3 + 2] = color.b * shade;
    pos.setY(i, h);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.02
  });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  /* ---------- 公路 ---------- */
  if (id === 'road') {
    const zStart = 90;
    const zEnd = -400;
    const step = 6;
    const halfW = 7.2;
    const verts = [];
    const idx = [];
    let n = 0;
    for (let z = zStart; z >= zEnd; z -= step) {
      const cx = roadX(z);
      const tangent = new THREE.Vector3(roadX(z - 1) - roadX(z + 1), 0, -2).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const y = heightAt(cx, z) + 0.08;
      verts.push(cx - side.x * halfW, y, z - side.z * halfW);
      verts.push(cx + side.x * halfW, y, z + side.z * halfW);
      if (n > 0) {
        const b = (n - 1) * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      n++;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    const road = new THREE.Mesh(
      rg,
      new THREE.MeshStandardMaterial({ color: 0x35383b, roughness: 0.92, metalness: 0.06 })
    );
    road.receiveShadow = true;
    group.add(road);

    const dashGeo = new THREE.BoxGeometry(0.42, 0.05, 3.4);
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xd7d3b8, roughness: 0.8, emissive: 0x1a1a12 });
    const count = Math.floor((zStart - zEnd) / 15);
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const z = zStart - i * 15;
      const cx = roadX(z);
      const t = new THREE.Vector3(roadX(z - 1) - roadX(z + 1), 0, -2).normalize();
      dummy.position.set(cx, heightAt(cx, z) + 0.16, z);
      dummy.rotation.set(0, Math.atan2(t.x, t.z), 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    group.add(dashes);
  }

  /* ---------- 树木与岩石（实例化） ---------- */
  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 2.6, 5);
  trunkGeo.translate(0, 1.3, 0);
  const leafGeo = new THREE.ConeGeometry(1.9, 5.6, 7);
  leafGeo.translate(0, 2.8, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5230, roughness: 0.9 });

  const wantTrees = id === 'air' ? 0 : id === 'sea' ? 90 : id === 'train' ? 140 : id === 'field' ? 280 : 210;
  const treePositions = [];
  let attempts = 0;
  while (treePositions.length < wantTrees && attempts < wantTrees * 24) {
    attempts++;
    let x, z;
    if (id === 'sea') {
      const isl = islands[Math.floor(rnd() * islands.length)];
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * isl.r * 0.95;
      x = isl.x + Math.cos(a) * r;
      z = isl.z + Math.sin(a) * r;
    } else {
      x = (rnd() * 2 - 1) * 280;
      z = -400 + rnd() * 500;
    }
    const h = heightAt(x, z);
    if (h < 1.2) continue;
    if (id === 'sea' && h < 1.6) continue;
    if (id === 'road' && Math.abs(x - roadX(z)) < 13) continue;
    treePositions.push({ x, z, h, s: 0.7 + rnd() * 0.85, r: rnd() * Math.PI * 2 });
  }

  if (treePositions.length) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treePositions.length);
    const dummy = new THREE.Object3D();
    treePositions.forEach((t, i) => {
      dummy.position.set(t.x, t.h - 0.2, t.z);
      dummy.rotation.set(0, t.r, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    });
    group.add(trunks, leaves);
  }

  if (id !== 'air') {
    const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c7b72, roughness: 0.95, flatShading: true });
    const rockCount = id === 'sea' ? 30 : 55;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const dummy = new THREE.Object3D();
    let placed = 0;
    let guard = 0;
    while (placed < rockCount && guard++ < 800) {
      const x = (rnd() * 2 - 1) * 240;
      const z = -380 + rnd() * 440;
      const h = heightAt(x, z);
      if (h < 0.8) continue;
      if (id === 'road' && Math.abs(x - roadX(z)) < 12) continue;
      dummy.position.set(x, h + 0.2, z);
      dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      dummy.scale.setScalar(0.6 + rnd() * 1.4);
      dummy.updateMatrix();
      rocks.setMatrixAt(placed++, dummy.matrix);
    }
    rocks.count = placed;
    group.add(rocks);
  }

  /* ---------- 海面 ---------- */
  let water = null;
  if (id === 'sea') {
    const wGeo = new THREE.PlaneGeometry(SIZE + 80, SIZE + 80, 52, 52);
    wGeo.rotateX(-Math.PI / 2);
    const wMat = new THREE.MeshStandardMaterial({
      color: 0x1f6b8e,
      metalness: 0.35,
      roughness: 0.28,
      transparent: true,
      opacity: 0.9,
      emissive: 0x04243a,
      emissiveIntensity: 0.6,
      flatShading: false
    });
    water = new THREE.Mesh(wGeo, wMat);
    water.position.y = 0.12;
    water.receiveShadow = false;
    group.add(water);
    water.userData.base = new Float32Array(wGeo.attributes.position.array);
  }

  /* ---------- 云层 ---------- */
  const cloudTex = cloudTexture();
  const cloudSprites = [];
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.7
  });
  const cloudCount = id === 'air' ? 44 : id === 'field' ? 14 : 9;
  for (let i = 0; i < cloudCount; i++) {
    const sp = new THREE.Sprite(cloudMat);
    const s = 55 + rnd() * 110;
    sp.position.set(
      (rnd() * 2 - 1) * 260,
      (id === 'air' ? 55 : 62) + rnd() * 45,
      -60 - rnd() * 290
    );
    sp.scale.set(s, s * 0.42, 1);
    sp.userData.speed = 0.6 + rnd() * 1.2;
    group.add(sp);
    cloudSprites.push(sp);
  }

  /* ---------- 更新 / 清理 ---------- */
  let waterFrame = 0;
  function update(t, dt) {
    if (water) {
      const arr = water.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        const z = arr[i + 2];
        arr[i + 1] =
          Math.sin(x * 0.035 + t * 1.25) * 0.42 +
          Math.sin(z * 0.052 - t * 0.95) * 0.3 +
          Math.sin((x + z) * 0.024 + t * 0.6) * 0.22;
      }
      water.geometry.attributes.position.needsUpdate = true;
      waterFrame++;
      if (waterFrame % 3 === 0) water.geometry.computeVertexNormals();
    }
    for (const sp of cloudSprites) {
      sp.position.x += sp.userData.speed * dt;
      if (sp.position.x > 300) sp.position.x = -300;
    }
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    cloudTex.dispose();
    if (group.parent) group.parent.remove(group);
  }

  return { group, heightAt, surfaceAt, roadX, islands, isSea: id === 'sea', update, dispose };
}
