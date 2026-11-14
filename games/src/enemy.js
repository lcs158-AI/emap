import { THREE } from './three.js';
import { CFG, ENEMY_TYPES } from './config.js';
import { buildEnemyModel, disposeGroup } from './models.js';
import { rand, clamp } from './utils.js';

const angleDiff = (a) => {
  const m = (a + Math.PI) % (Math.PI * 2);
  return (m < 0 ? m + Math.PI * 2 : m) - Math.PI;
};

export class EnemyManager {
  constructor(scene, mode, terrain, weapons, player, diff) {
    this.scene = scene;
    this.mode = mode;
    this.terrain = terrain;
    this.weapons = weapons;
    this.player = player;
    this.diff = diff || { enemyFireMult: 1 };   // 难度：敌方开火间隔乘数
    this.units = [];
    this.total = 0;
    this.time = 0;
  }

  get remaining() {
    let n = 0;
    for (const u of this.units) if (u.alive) n++;
    return n;
  }

  addUnit(type, x, z, opts = {}) {
    const info = ENEMY_TYPES[type];
    const built = buildEnemyModel(type);
    const y = opts.y !== undefined ? opts.y : this.terrain.heightAt(x, z);
    built.group.position.set(x, y, z);
    if (opts.rotY) built.group.rotation.y = opts.rotY;
    if (opts.scale) built.group.scale.setScalar(opts.scale);
    this.scene.add(built.group);

    const unit = {
      type,
      info,
      group: built.group,
      turret: built.turret,
      muzzle: built.muzzle,
      spin: built.spin,
      hp: info.hp,
      maxHp: info.hp,
      size: info.size,
      radius: info.radius,
      centerY: info.centerY,
      center: new THREE.Vector3(x, y + info.centerY, z),
      home: new THREE.Vector3(x, y, z),
      homeZ: z,
      baseY: y,
      lateral: opts.lateral || 0,
      phase: opts.phase !== undefined ? opts.phase : rand(0, Math.PI * 2),
      orbitR: opts.orbitR || rand(16, 32),
      orbitSpeed: opts.orbitSpeed || rand(0.14, 0.3),
      behavior: opts.behavior || 'static',
      alive: true,
      shellCd: rand(0.8, 3.2),
      missileCd: rand(4, 9)
    };
    this.units.push(unit);
    return unit;
  }

  spawn() {
    this.units = [];
    const counts = {};
    for (const e of this.mode.enemies) counts[e.type] = e.count;
    if (this.mode.id === 'road') this.spawnRoad(counts);
    else if (this.mode.id === 'field') this.spawnField(counts);
    else if (this.mode.id === 'sea') this.spawnSea(counts);
    else if (this.mode.id === 'train') this.spawnTrain(counts);
    else this.spawnAir(counts);
    this.total = this.units.length;
    return this.total;
  }

  spawnRoad(counts) {
    const roadX = this.terrain.roadX;
    const types = [];
    const maxN = Math.max(counts.apc || 0, counts.tank || 0);
    for (let i = 0; i < maxN; i++) {
      if (i < counts.apc) types.push('apc');
      if (i < counts.tank) types.push('tank');
    }
    types.forEach((type, i) => {
      const z = -62 - i * 10;
      const lateral = (i % 2 === 0 ? 1 : -1) * 1.6;
      this.addUnit(type, roadX(z) + lateral, z, {
        behavior: 'convoy',
        lateral,
        phase: i * 0.32,
        rotY: Math.PI
      });
    });

    for (let i = 0; i < (counts.turret || 0); i++) {
      const z = -76 - i * 36;
      const side = i % 2 === 0 ? -1 : 1;
      const x = roadX(z) + side * 15;
      this.addUnit('turret', x, z, { behavior: 'static', rotY: 0 });
    }

    for (let i = 0; i < (counts.bunker || 0); i++) {
      const z = -166;
      this.addUnit('bunker', roadX(z), z, { behavior: 'static' });
    }
  }

  spawnField(counts) {
    const placed = [];
    const tryPos = (minDist) => {
      for (let k = 0; k < 60; k++) {
        const x = rand(-88, 88);
        const z = rand(-62, -158);
        let ok = true;
        for (const p of placed) {
          if (Math.hypot(p.x - x, p.z - z) < minDist) { ok = false; break; }
        }
        if (!ok) continue;
        const h = this.terrain.heightAt(x, z);
        if (h < 2) continue;
        placed.push({ x, z });
        return { x, z };
      }
      const x = rand(-70, 70);
      const z = rand(-70, -150);
      placed.push({ x, z });
      return { x, z };
    };

    const list = [];
    for (let i = 0; i < (counts.tank || 0); i++) list.push('tank');
    for (let i = 0; i < (counts.apc || 0); i++) list.push('apc');
    for (let i = 0; i < (counts.turret || 0); i++) list.push('turret');
    for (let i = 0; i < (counts.bunker || 0); i++) list.push('bunker');

    for (const type of list) {
      const p = tryPos(type === 'bunker' ? 20 : 12);
      const info = ENEMY_TYPES[type];
      this.addUnit(type, p.x, p.z, {
        behavior: info.shell && (type === 'tank' || type === 'apc') ? 'patrol' : 'static'
      });
    }
  }

  /* 训练场：沿 z=-40..-160 直线均匀分布固定地面靶标（V2.6.0 无机头前后移动，压缩到射程内） */
  spawnTrain(counts) {
    const types = [];
    for (let i = 0; i < (counts.turret || 0); i++) types.push('turret');
    for (let i = 0; i < (counts.bunker || 0); i++) types.push('bunker');
    const n = types.length;
    types.forEach((type, i) => {
      const z = n > 1 ? -40 - (i / (n - 1)) * 120 : -100;
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (type === 'bunker' ? 26 : 16) + rand(-3, 3);
      const y = this.terrain.heightAt(x, z);
      this.addUnit(type, x, z, { behavior: 'static', y });
    });
  }

  spawnSea(counts) {
    const spots = [
      { type: 'destroyer', x: -52, z: -98 },
      { type: 'destroyer', x: 42, z: -152 },
      { type: 'frigate', x: -86, z: -72 },
      { type: 'frigate', x: -8, z: -122 },
      { type: 'frigate', x: 78, z: -146 }
    ];
    let d = 0, f = 0;
    for (const s of spots) {
      if (s.type === 'destroyer' && d++ < (counts.destroyer || 0)) {
        this.addUnit('destroyer', s.x, s.z, { y: 0.18, behavior: 'ship' });
      } else if (s.type === 'frigate' && f++ < (counts.frigate || 0)) {
        this.addUnit('frigate', s.x, s.z, { y: 0.18, behavior: 'ship' });
      }
    }
    for (let i = 0; i < (counts.boat || 0); i++) {
      const x = rand(-80, 80);
      const z = rand(-70, -160);
      this.addUnit('boat', x, z, { y: 0.18, behavior: 'boat' });
    }
    const turretSpots = [
      { x: -62, z: -122 },
      { x: 70, z: -115 }
    ];
    for (let i = 0; i < Math.min(counts.islandTurret || 0, turretSpots.length); i++) {
      const s = turretSpots[i];
      this.addUnit('islandTurret', s.x, s.z, { behavior: 'static' });
    }
  }

  spawnAir(counts) {
    const centers = [
      { x: -62, z: -98, y: 30, r: 22 },
      { x: 58, z: -92, y: 38, r: 20 },
      { x: -30, z: -148, y: 34, r: 26 },
      { x: 72, z: -150, y: 28, r: 18 },
      { x: 0, z: -124, y: 42, r: 30 }
    ];
    for (let i = 0; i < (counts.enemyJet || 0); i++) {
      const c = centers[i % centers.length];
      this.addUnit('enemyJet', c.x, c.z, {
        y: c.y,
        behavior: 'jet',
        orbitR: c.r,
        orbitSpeed: rand(0.16, 0.28),
        phase: rand(0, Math.PI * 2)
      });
    }
    for (let i = 0; i < (counts.drone || 0); i++) {
      const x = rand(-70, 70);
      const z = rand(-65, -150);
      this.addUnit('drone', x, z, {
        y: rand(18, 32),
        behavior: 'drone',
        orbitR: rand(5, 10),
        orbitSpeed: rand(0.5, 0.9)
      });
    }
    for (let i = 0; i < (counts.awacs || 0); i++) {
      this.addUnit('awacs', 10, -168, {
        y: 60,
        behavior: 'awacs',
        orbitR: 40,
        orbitSpeed: 0.08
      });
    }
    const radarSpots = [
      { x: -66, z: -118 },
      { x: 62, z: -148 }
    ];
    for (let i = 0; i < Math.min(counts.radar || 0, radarSpots.length); i++) {
      const s = radarSpots[i];
      this.addUnit('radar', s.x, s.z, { behavior: 'static' });
    }
  }

  muzzleWorld(u) {
    if (!u.muzzle) return null;
    u.group.updateMatrixWorld(true);
    return u.muzzle.getWorldPosition(new THREE.Vector3());
  }

  update(dt, ctx) {
    this.time += dt;
    const t = this.time;
    const p = this.player.group.position;

    for (const u of this.units) {
      if (!u.alive) continue;
      this.moveUnit(u, dt, t);

      // 炮塔 / 雷达旋转
      if (u.type === 'radar') {
        if (u.turret) u.turret.rotation.y += dt * 1.4;
      } else if (u.turret) {
        const want = Math.atan2(-(p.x - u.group.position.x), -(p.z - u.group.position.z));
        const local = want - u.group.rotation.y;
        u.turret.rotation.y += angleDiff(local - u.turret.rotation.y) * (1 - Math.exp(-5 * dt));
      }

      for (const s of u.spin) {
        if (u.type === 'drone') s.rotation.y += dt * 26;
        else if (s.material && s.userData && s.userData.pulse) s.scale.setScalar(0.9 + Math.sin(t * 9) * 0.22);
      }

      u.center.set(u.group.position.x, u.group.position.y + u.centerY, u.group.position.z);

      u.shellCd -= dt;
      u.missileCd -= dt;
      if (!ctx.active || !this.player.alive) continue;
      // 训练场靶标完全不向玩家开火（V2.3.0）
      if (this.mode.training) continue;

      const px = p.x - u.center.x;
      const py = p.y + 0.5 - u.center.y;
      const pz = p.z - u.center.z;
      const dist = Math.sqrt(px * px + py * py + pz * pz);

      const fireMult = this.diff.enemyFireMult;
      if (u.info.shell && u.shellCd <= 0 && dist < CFG.enemy.shellRange) {
        const origin = this.muzzleWorld(u);
        if (origin) {
          this.weapons.enemyShell(origin, this.player);
          u.shellCd = rand(CFG.enemy.shellInterval[0], CFG.enemy.shellInterval[1]) * fireMult;
        }
      }
      if (u.info.missile && u.missileCd <= 0 && dist < CFG.enemy.missileRange) {
        const origin = this.muzzleWorld(u);
        if (origin) {
          this.weapons.enemyMissile(origin, this.player);
          u.missileCd = rand(CFG.enemy.missileInterval[0], CFG.enemy.missileInterval[1]) * fireMult;
        }
      }
    }
  }

  moveUnit(u, dt, t) {
    const pos = u.group.position;
    const ph = u.phase;
    switch (u.behavior) {
      case 'convoy': {
        const amp = 26;
        const w = 0.16;
        const z = u.homeZ + Math.sin(t * w + ph) * amp;
        const x = this.terrain.roadX(z) + u.lateral;
        const dzdt = Math.cos(t * w + ph) * amp * w;
        const slope = this.terrain.roadX(z + 0.6) - this.terrain.roadX(z - 0.6);
        pos.set(x, this.terrain.heightAt(x, z), z);
        if (Math.abs(dzdt) > 0.08) {
          u.group.rotation.y = Math.atan2(-slope * dzdt, -dzdt);
        }
        break;
      }
      case 'patrol': {
        const x = u.home.x + Math.sin(t * 0.24 + ph) * 7;
        const z = u.home.z + Math.cos(t * 0.2 + ph) * 6;
        const dxdt = Math.cos(t * 0.24 + ph) * 7 * 0.24;
        const dzdt = -Math.sin(t * 0.2 + ph) * 6 * 0.2;
        pos.set(x, this.terrain.heightAt(x, z), z);
        if (Math.hypot(dxdt, dzdt) > 0.2) u.group.rotation.y = Math.atan2(-dxdt, -dzdt);
        break;
      }
      case 'ship': {
        const x = u.home.x + Math.sin(t * 0.2 + ph) * 22;
        const z = u.home.z + Math.cos(t * 0.15 + ph) * 8;
        pos.set(x, 0.18 + Math.sin(t * 1.2 + ph) * 0.28, z);
        u.group.rotation.y = Math.sin(t * 0.15 + ph) * 0.18;
        u.group.rotation.z = Math.sin(t * 0.9 + ph) * 0.02;
        break;
      }
      case 'boat': {
        const x = u.home.x + Math.sin(t * 0.55 + ph) * 20;
        const z = u.home.z + Math.cos(t * 0.42 + ph) * 11;
        const dxdt = Math.cos(t * 0.55 + ph) * 20 * 0.55;
        const dzdt = -Math.sin(t * 0.42 + ph) * 11 * 0.42;
        pos.set(x, 0.2 + Math.sin(t * 1.5 + ph) * 0.3, z);
        u.group.rotation.y = Math.atan2(-dxdt, -dzdt);
        break;
      }
      case 'jet':
      case 'awacs': {
        const a = t * u.orbitSpeed + ph;
        const r = u.orbitR;
        const x = u.home.x + Math.cos(a) * r;
        const z = u.home.z + Math.sin(a) * r;
        const y = u.baseY + Math.sin(t * 0.7 + ph) * 3;
        const dxdt = -Math.sin(a) * r * u.orbitSpeed;
        const dzdt = Math.cos(a) * r * u.orbitSpeed;
        pos.set(x, y, z);
        u.group.rotation.y = Math.atan2(-dxdt, -dzdt);
        u.group.rotation.z = Math.sin(t * 0.5 + ph) * 0.14;
        break;
      }
      case 'drone': {
        const x = u.home.x + Math.sin(t * 0.8 + ph) * 8;
        const z = u.home.z + Math.cos(t * 0.65 + ph) * 7;
        pos.set(x, u.baseY + Math.sin(t * 1.6 + ph) * 1.6, z);
        u.group.rotation.y = Math.sin(t * 0.5 + ph) * 0.6;
        break;
      }
      default:
        break;
    }
  }

  sweepHit(a, b, r) {
    let best = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (!u.alive) continue;
      const rr = u.radius + r;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = 0;
      if (len2 > 0) {
        t = ((u.center.x - a.x) * dx + (u.center.y - a.y) * dy + (u.center.z - a.z) * dz) / len2;
        t = clamp(t, 0, 1);
      }
      const cx = a.x + dx * t - u.center.x;
      const cy = a.y + dy * t - u.center.y;
      const cz = a.z + dz * t - u.center.z;
      const d2 = cx * cx + cy * cy + cz * cz;
      if (d2 <= rr * rr && d2 < bestD) {
        bestD = d2;
        best = u;
      }
    }
    return best;
  }

  sphereHit(pos, r) {
    for (const u of this.units) {
      if (!u.alive) continue;
      const rr = u.radius + r;
      if (pos.distanceToSquared(u.center) <= rr * rr) return u;
    }
    return null;
  }

  damage(unit, amount) {
    if (!unit.alive) return { destroyed: false };
    unit.hp -= amount;
    if (unit.hp <= 0) {
      this.kill(unit);
      return { destroyed: true };
    }
    return { destroyed: false };
  }

  kill(unit) {
    if (!unit.alive) return;
    unit.alive = false;
    this.scene.remove(unit.group);
    disposeGroup(unit.group);
  }

  clear() {
    for (const u of this.units) {
      this.scene.remove(u.group);
      disposeGroup(u.group);
    }
    this.units = [];
    this.total = 0;
  }
}
