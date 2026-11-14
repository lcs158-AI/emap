import { THREE } from './three.js';
import { CFG } from './config.js';
import { deg2rad, rand, steerVector, segmentSphereDist2 } from './utils.js';

const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const TRAIL_N = 8;

export class Weapons {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.cb = callbacks;
    this.bullets = [];
    this.missiles = [];
    this.shells = [];
    this.enemyMissiles = [];
    this.flares = [];
    this.fx = [];
    this.diff = null;   // 难度参数（shellSpeedMult 等），由 game 注入

    this.bulletGeo = new THREE.BoxGeometry(0.16, 0.16, 1.7);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });
    this.shellGeo = new THREE.SphereGeometry(0.42, 8, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xffa947 });
    this.pMissileGeo = new THREE.ConeGeometry(0.36, 1.8, 6);
    this.pMissileGeo.rotateX(-Math.PI / 2);
    this.pMissileMat = new THREE.MeshStandardMaterial({
      color: 0xd8f2ff, emissive: 0x4cc8ff, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.35
    });
    this.eMissileGeo = new THREE.ConeGeometry(0.38, 1.9, 6);
    this.eMissileGeo.rotateX(-Math.PI / 2);
    this.eMissileMat = new THREE.MeshStandardMaterial({
      color: 0xffd7cf, emissive: 0xff4a24, emissiveIntensity: 1.5, metalness: 0.35, roughness: 0.4
    });
    this.explGeo = new THREE.SphereGeometry(1, 10, 8);
    this.smokeGeo = new THREE.SphereGeometry(1, 6, 5);
  }

  makeTrail(color, opacity = 0.6) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(TRAIL_N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    line.frustumCulled = false;
    this.scene.add(line);
    return { line, geo, arr, points: [] };
  }

  updateTrail(tr, pos) {
    tr.points.push(pos.clone());
    if (tr.points.length > TRAIL_N) tr.points.shift();
    const first = tr.points[0];
    for (let i = 0; i < TRAIL_N; i++) {
      const p = tr.points[Math.min(i, tr.points.length - 1)] || first;
      tr.arr[i * 3] = p.x;
      tr.arr[i * 3 + 1] = p.y;
      tr.arr[i * 3 + 2] = p.z;
    }
    tr.geo.attributes.position.needsUpdate = true;
    tr.line.material.opacity = 0.25 + Math.min(0.5, tr.points.length / TRAIL_N * 0.5);
  }

  removeTrail(tr) {
    this.scene.remove(tr.line);
    tr.geo.dispose();
    tr.line.material.dispose();
  }

  /* ---------------- 玩家机炮 ---------------- */
  /** forward 为机头前向（含俯仰/方位角）；不传时保持旧行为（世界正前方） */
  fireCannon(origin, forward = FWD) {
    const dir = forward.clone();
    if (dir.lengthSq() < 1e-8) dir.copy(FWD);
    const spread = deg2rad(CFG.cannon.spreadDeg);
    dir.x += rand(-spread, spread);
    dir.y += rand(-spread, spread);
    dir.normalize();

    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(FWD, dir);
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      pos: origin.clone(),
      prev: origin.clone(),
      vel: dir.multiplyScalar(CFG.cannon.speed),
      travelled: 0,
      alive: true,
      hit: false
    });
  }

  /* ---------------- 玩家导弹 ---------------- */
  findLock(origin, forward, enemies) {
    const cosLimit = Math.cos(deg2rad(CFG.missile.lockDeg));
    let best = null;
    let bestDist = Infinity;
    for (const u of enemies.units) {
      if (!u.alive) continue;
      const dx = u.center.x - origin.x;
      const dy = u.center.y - origin.y;
      const dz = u.center.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 8 || dist > 340) continue;
      const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / dist;
      if (dot < cosLimit) continue;
      if (dist < bestDist) { bestDist = dist; best = u; }
    }
    return best;
  }

  /**
   * 发射玩家导弹。
   * @param {THREE.Vector3} origin 基准发射点（机腹导弹口）
   * @param {THREE.Vector3} forward 机头前向（含俯仰/方位角）
   * @param {EnemyManager} enemies 敌军
   * @param {object} [opts] 可选：{ spread: 绕世界Y轴偏转角(度), lateral: 左右偏移方向向量, offset: 偏移量 }
   */
  fireMissile(origin, forward, enemies, opts = {}) {
    const dir = forward.clone().normalize();
    if (opts.spread) dir.applyAxisAngle(UP, deg2rad(opts.spread));
    const pos = origin.clone();
    if (opts.lateral && opts.offset) pos.addScaledVector(opts.lateral, opts.offset);
    const best = this.findLock(pos, dir, enemies);
    const mesh = new THREE.Mesh(this.pMissileGeo, this.pMissileMat);
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(FWD, dir);
    this.scene.add(mesh);
    const trail = this.makeTrail(0x7fd6ff, 0.6);

    this.missiles.push({
      mesh,
      trail,
      pos: pos.clone(),
      prev: pos.clone(),
      dir,
      vel: dir.clone().multiplyScalar(CFG.missile.speed),
      target: best,
      life: CFG.missile.life,
      alive: true,
      hit: false
    });
    return best;
  }

  setDiff(diff) {
    this.diff = diff || null;
  }

  /* ---------------- 干扰弹 ---------------- */
  /** 在战机后方释放一团明亮诱饵，存活期间吸引半径内敌方导弹 */
  deployFlare(origin) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe2a0, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Mesh(this.explGeo, mat);
    mesh.position.copy(origin);
    mesh.scale.setScalar(1.6);
    this.scene.add(mesh);

    // 火花粒子：向四周缓慢飘散
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const pm = new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xffb050 : 0xfff4d0, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const p = new THREE.Mesh(this.smokeGeo, pm);
      p.position.copy(origin);
      p.scale.setScalar(rand(0.22, 0.45));
      this.scene.add(p);
      parts.push({
        mesh: p,
        vel: new THREE.Vector3(rand(-9, 9), rand(-5, 7), rand(-4, 10))
      });
    }

    this.flares.push({
      mesh,
      parts,
      pos: origin.clone(),
      life: CFG.flare.life,
      life0: CFG.flare.life,
      alive: true
    });
  }

  updateFlares(dt) {
    for (const f of this.flares) {
      if (!f.alive) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.life0);
      f.mesh.material.opacity = k;
      f.mesh.scale.setScalar(1.2 + (1 - k) * 1.1);
      for (const p of f.parts) {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y += 3.5 * dt;   // 火花轻微下沉
        p.mesh.material.opacity = 0.95 * k;
      }
      if (f.life <= 0) f.alive = false;
    }

    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      if (f.alive) continue;
      this.scene.remove(f.mesh);
      f.mesh.material.dispose();
      for (const p of f.parts) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
      }
      this.flares.splice(i, 1);
    }
  }

  /* ---------------- 敌方炮弹 ---------------- */
  enemyShell(origin, player) {
    if (this.cb.onEnemyFire) this.cb.onEnemyFire('shell', origin);
    const target = player.group.position.clone();
    target.x += rand(-2.6, 2.6);
    target.y += rand(0, 1.4);
    target.z += rand(-2.6, 2.6);

    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const horiz = Math.hypot(dx, dz);
    const speed = CFG.enemy.shellSpeed * (this.diff ? this.diff.shellSpeedMult : 1);
    const tFlight = Math.max(0.6, (horiz + Math.abs(dy) * 0.35) / speed);

    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.shells.push({
      mesh,
      pos: origin.clone(),
      prev: origin.clone(),
      vel: new THREE.Vector3(dx / tFlight, (dy + 0.5 * CFG.enemy.shellGravity * tFlight * tFlight) / tFlight, dz / tFlight),
      life: 6,
      alive: true
    });
  }

  /* ---------------- 敌方导弹 ---------------- */
  enemyMissile(origin, player) {
    if (this.cb.onEnemyFire) this.cb.onEnemyFire('missile', origin);
    const target = player.group.position;
    const dir = new THREE.Vector3(target.x - origin.x, target.y + 0.7 - origin.y, target.z - origin.z).normalize();
    const mesh = new THREE.Mesh(this.eMissileGeo, this.eMissileMat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(FWD, dir);
    this.scene.add(mesh);
    const trail = this.makeTrail(0xff8a5a, 0.55);

    this.enemyMissiles.push({
      mesh,
      trail,
      pos: origin.clone(),
      prev: origin.clone(),
      dir,
      vel: dir.clone().multiplyScalar(CFG.enemy.missileSpeed),
      life: CFG.enemy.missileLife,
      alive: true
    });
  }

  /* ---------------- 特效 ---------------- */
  explode(pos, size = 1, color = 0xffa646, life = 0.55) {
    if (this.cb.onExplode) this.cb.onExplode(pos, size);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.explGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.4 * size);
    this.scene.add(mesh);
    this.fx.push({ kind: 'explosion', mesh, t: 0, life, size });
    if (size >= 1.2) this.smoke(pos, size * 1.15);
  }

  flash(pos, size = 0.5, color = 0xffd27a) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.explGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.25 * size);
    this.scene.add(mesh);
    this.fx.push({ kind: 'explosion', mesh, t: 0, life: 0.18, size });
  }

  smoke(pos, size = 1) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x33383a, transparent: true, opacity: 0.55, roughness: 1, metalness: 0
    });
    const mesh = new THREE.Mesh(this.smokeGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.5 * size);
    this.scene.add(mesh);
    this.fx.push({ kind: 'smoke', mesh, t: 0, life: 1.6, size });
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (f.kind === 'explosion') {
        f.mesh.scale.setScalar((0.3 + k * 3.4) * f.size);
        f.mesh.material.opacity = Math.max(0, 1 - k);
      } else {
        f.mesh.scale.setScalar((0.5 + k * 2.0) * f.size);
        f.mesh.material.opacity = Math.max(0, 0.55 * (1 - k));
        f.mesh.position.y += dt * 1.6;
      }
      if (k >= 1) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        this.fx.splice(i, 1);
      }
    }
  }

  /* ---------------- 主更新 ---------------- */
  update(dt, ctx) {
    this.updateBullets(dt, ctx);
    if (ctx.active) {
      this.updateMissiles(dt, ctx);
      this.updateShells(dt, ctx);
      this.updateEnemyMissiles(dt, ctx);
    }
    this.updateFlares(dt);
    this.updateFx(dt);
  }

  updateBullets(dt, ctx) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.travelled += CFG.cannon.speed * dt;
      b.mesh.position.copy(b.pos);

      // 机炮拦截敌方导弹
      for (const em of this.enemyMissiles) {
        if (!em.alive) continue;
        const d2 = segmentSphereDist2(
          b.prev.x, b.prev.y, b.prev.z,
          b.pos.x, b.pos.y, b.pos.z,
          em.pos.x, em.pos.y, em.pos.z
        );
        if (d2 < 2.1 * 2.1) {
          em.alive = false;
          this.explode(em.pos, 1.0, 0xffc45a);
          this.cb.onScore(CFG.score.intercept, '拦截导弹');
          b.alive = false;
          b.hit = true;
          break;
        }
      }
      if (!b.alive) continue;

      const u = ctx.enemies.sweepHit(b.prev, b.pos, CFG.cannon.bulletRadius);
      if (u) {
        b.alive = false;
        b.hit = true;
        this.flash(b.pos, 0.5, 0xffd27a);
        this.cb.onEnemyDamage(u, 'cannon');
        continue;
      }

      if (b.pos.y <= ctx.surfaceAt(b.pos.x, b.pos.z) + 0.2) {
        b.alive = false;
        this.explode(b.pos, 0.55, 0xffb45a, 0.3);
      } else if (b.travelled >= CFG.cannon.range || Math.abs(b.pos.x) > 320 || b.pos.z < -420 || b.pos.z > 90) {
        b.alive = false;
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.alive) continue;
      this.scene.remove(b.mesh);
      if (!b.hit) this.cb.onScore(-CFG.score.cannonMiss, '');
      this.bullets.splice(i, 1);
    }
  }

  updateMissiles(dt, ctx) {
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.prev.copy(m.pos);

      if (m.target && m.target.alive) {
        const desired = new THREE.Vector3(
          m.target.center.x - m.pos.x,
          m.target.center.y - m.pos.y,
          m.target.center.z - m.pos.z
        ).normalize();
        m.dir = steerVector(m.dir, desired, deg2rad(CFG.missile.turnDeg), dt);
        m.vel.copy(m.dir).multiplyScalar(CFG.missile.speed);
      }

      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(FWD, m.dir);
      this.updateTrail(m.trail, m.pos);
      m.life -= dt;

      const u = ctx.enemies.sphereHit(m.pos, CFG.missile.hitRadius);
      if (u) {
        m.alive = false;
        m.hit = true;
        this.explode(m.pos, 2.0, 0xffcf6a);
        this.cb.onEnemyDamage(u, 'missile');
        continue;
      }
      if (m.pos.y <= ctx.surfaceAt(m.pos.x, m.pos.z) + 0.4) {
        m.alive = false;
        this.explode(m.pos, 1.2, 0xffa646);
      } else if (m.life <= 0 || m.pos.z < -430 || m.pos.z > 120 || Math.abs(m.pos.x) > 340) {
        m.alive = false;
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (m.alive) continue;
      this.scene.remove(m.mesh);
      this.removeTrail(m.trail);
      if (!m.hit) this.cb.onScore(-CFG.score.missileMiss, '导弹落空');
      this.missiles.splice(i, 1);
    }
  }

  updateShells(dt, ctx) {
    for (const s of this.shells) {
      if (!s.alive) continue;
      s.prev.copy(s.pos);
      s.vel.y -= CFG.enemy.shellGravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      s.life -= dt;

      const pc = ctx.player.group.position;
      const d2 = segmentSphereDist2(
        s.prev.x, s.prev.y, s.prev.z,
        s.pos.x, s.pos.y, s.pos.z,
        pc.x, pc.y + 0.6, pc.z
      );
      if (ctx.player.alive && d2 < 5.2 * 5.2) {
        s.alive = false;
        this.explode(s.pos, 1.3, 0xffb35a);
        this.cb.onPlayerHit('shell');
        continue;
      }
      if (s.pos.y <= ctx.surfaceAt(s.pos.x, s.pos.z) + 0.2 || s.life <= 0) {
        s.alive = false;
        this.explode(s.pos, 0.9, 0xffab50, 0.4);
      }
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      if (this.shells[i].alive) continue;
      this.scene.remove(this.shells[i].mesh);
      this.shells.splice(i, 1);
    }
  }

  updateEnemyMissiles(dt, ctx) {
    for (const m of this.enemyMissiles) {
      if (!m.alive) continue;
      m.prev.copy(m.pos);
      const pc = ctx.player.group.position;

      // 干扰弹诱饵：半径内的导弹改道飞向最近的存活诱饵
      let lure = null;
      let lureD2 = CFG.flare.radius * CFG.flare.radius;
      for (const f of this.flares) {
        if (!f.alive) continue;
        const d2 = m.pos.distanceToSquared(f.pos);
        if (d2 < lureD2) { lureD2 = d2; lure = f; }
      }

      const tp = lure ? lure.pos : pc;
      const ty = lure ? lure.pos.y : pc.y + 0.6;
      const desired = new THREE.Vector3(tp.x - m.pos.x, ty - m.pos.y, tp.z - m.pos.z).normalize();
      m.dir = steerVector(m.dir, desired, deg2rad(CFG.enemy.missileTurnDeg), dt);
      m.vel.copy(m.dir).multiplyScalar(CFG.enemy.missileSpeed);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(FWD, m.dir);
      this.updateTrail(m.trail, m.pos);
      m.life -= dt;

      // 接触诱饵即引爆
      if (lure && m.pos.distanceToSquared(lure.pos) < 3.2 * 3.2) {
        m.alive = false;
        this.explode(m.pos, 1.6, 0xffd080);
        continue;
      }

      if (ctx.player.alive && m.pos.distanceToSquared(pc) < 5.4 * 5.4) {
        m.alive = false;
        this.explode(m.pos, 1.9, 0xff6a3a);
        this.cb.onPlayerHit('missile');
        continue;
      }
      if (m.pos.y <= ctx.surfaceAt(m.pos.x, m.pos.z) + 0.3 || m.life <= 0) {
        m.alive = false;
        this.explode(m.pos, 1.4, 0xff9a45);
      }
    }

    for (let i = this.enemyMissiles.length - 1; i >= 0; i--) {
      const m = this.enemyMissiles[i];
      if (m.alive) continue;
      this.scene.remove(m.mesh);
      this.removeTrail(m.trail);
      this.enemyMissiles.splice(i, 1);
    }
  }

  /** 最近来袭弹药（供 HUD 预警） */
  nearestThreat(playerPos) {
    let best = null;
    let bestEta = Infinity;
    for (const m of this.enemyMissiles) {
      if (!m.alive) continue;
      const eta = Math.hypot(m.pos.x - playerPos.x, m.pos.z - playerPos.z) / CFG.enemy.missileSpeed;
      if (eta < bestEta) { bestEta = eta; best = { dx: m.pos.x - playerPos.x, dz: m.pos.z - playerPos.z, eta, kind: 'missile' }; }
    }
    for (const s of this.shells) {
      if (!s.alive) continue;
      const eta = Math.hypot(s.pos.x - playerPos.x, s.pos.z - playerPos.z) / CFG.enemy.shellSpeed;
      if (eta < bestEta) { bestEta = eta; best = { dx: s.pos.x - playerPos.x, dz: s.pos.z - playerPos.z, eta, kind: 'shell' }; }
    }
    return best;
  }

  reset() {
    for (const b of this.bullets) this.scene.remove(b.mesh);
    for (const m of this.missiles) { this.scene.remove(m.mesh); this.removeTrail(m.trail); }
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const m of this.enemyMissiles) { this.scene.remove(m.mesh); this.removeTrail(m.trail); }
    for (const f of this.flares) {
      this.scene.remove(f.mesh);
      f.mesh.material.dispose();
      for (const p of f.parts) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    }
    for (const f of this.fx) { this.scene.remove(f.mesh); f.mesh.material.dispose(); }
    this.bullets = [];
    this.missiles = [];
    this.shells = [];
    this.enemyMissiles = [];
    this.flares = [];
    this.fx = [];
  }

  dispose() {
    this.reset();
    this.bulletGeo.dispose();
    this.bulletMat.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
    this.pMissileGeo.dispose();
    this.pMissileMat.dispose();
    this.eMissileGeo.dispose();
    this.eMissileMat.dispose();
    this.explGeo.dispose();
    this.smokeGeo.dispose();
  }
}
