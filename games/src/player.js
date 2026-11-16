/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
import { THREE } from './three.js';
import { buildPlayerJet } from './models.js';
import { CFG } from './config.js';
import { clamp } from './utils.js';

export class Player {
  constructor(scene) {
    const built = buildPlayerJet();
    this.group = built.group;
    this.gunL = built.gunL;
    this.gunR = built.gunR;
    this.mport = built.mport;
    this.glows = built.glows;
    this.scene = scene;
    scene.add(this.group);

    this.altitude = 24;
    this.x = 0;
    this.yOff = 0;     // 垂直目标偏移（相对巡航高度）
    this.yCur = 0;     // 垂直平滑后的当前偏移
    this.armor = CFG.player.armor;
    this.alive = true;
    this.invuln = 0;
    this.pulse = 0;
    this.gunSide = 0;
    // 偏航-俯仰-滚转顺序，使 forward() 与 group 朝向一致
    this.group.rotation.order = 'YXZ';
    // 飞行姿态（V2.3.0）：pitch 正=抬头，yaw 正=机头向左
    this.pitch = 0;
    this.yaw = 0;
    this.group.position.set(0, 24, 0);
  }

  reset(mode, armor) {
    this.altitude = mode.altitude;
    this.x = 0;
    this.yOff = 0;
    this.yCur = 0;
    this.armor = armor !== undefined ? armor : CFG.player.armor;
    this.alive = true;
    this.invuln = 0;
    this.gunSide = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.group.visible = true;
    this.group.position.set(0, this.altitude, 0);
    this.group.rotation.set(0, 0, 0);
    for (const g of this.glows) g.visible = true;
  }

  update(dt, input, t) {
    if (!this.alive) return;
    const {
      dirX = 0, pitchIn = 0, yawIn = 0,
      pitchAbs = null, yawAbs = null,
      speed = CFG.player.moveSpeed
    } = input;
    const range = CFG.player.xRange;
    let target = this.x;

    if (dirX !== 0) {
      target = clamp(this.x + dirX * speed * dt, -range, range);
    }
    this.x = target;

    // 俯仰：绝对目标（摄像头双手高度）优先；否则由键盘/手机模拟量驱动，松开回 0
    let pitchTarget;
    if (pitchAbs !== null) {
      pitchTarget = clamp(pitchAbs, -CFG.player.pitchMaxDown, CFG.player.pitchMaxUp);
    } else {
      const pIn = clamp(pitchIn, -1, 1);
      pitchTarget = pIn * (pIn >= 0 ? CFG.player.pitchMaxUp : CFG.player.pitchMaxDown);
    }
    this.pitch += (pitchTarget - this.pitch) * (1 - Math.exp(-CFG.player.pitchGain * dt));

    // 方位角：摄像头重心左右给绝对目标（压坡度转弯）；键盘/手机则持续转动、不自动回中
    if (yawAbs !== null) {
      this.yaw += (clamp(yawAbs, -CFG.player.yawMax, CFG.player.yawMax) - this.yaw)
        * (1 - Math.exp(-CFG.player.poseYawGain * dt));
    } else {
      const yIn = clamp(yawIn, -1, 1);
      this.yaw = clamp(
        this.yaw + yIn * CFG.player.yawSpeed * dt,
        -CFG.player.yawMax,
        CFG.player.yawMax
      );
    }

    // 高度：俯仰积分，抬起爬升、俯冲下降；上下限沿用旧规则
    const yMin = Math.max(-CFG.player.yRange, 6 - this.altitude); // 不低于地形上方安全高度
    this.yOff = clamp(
      this.yOff + Math.sin(this.pitch) * CFG.player.climbSpeed * dt,
      yMin,
      CFG.player.yRange
    );
    this.yCur += (this.yOff - this.yCur) * (1 - Math.exp(-10 * dt));

    const p = this.group.position;
    p.x += (target - p.x) * (1 - Math.exp(-12 * dt));
    p.y = this.altitude + this.yCur + Math.sin(t * 1.6) * CFG.player.bob;
    p.z = 0;
    // 压坡度转弯（V2.6.0）：重心左右输入直接驱动机身滚转，并叠加机头转向的轻微侧倾
    const bank = -clamp(dirX, -1, 1) * 0.36;
    const yawLean = yawAbs !== null
      ? -(yawAbs / CFG.player.yawMax) * 0.12
      : -clamp(yawIn, -1, 1) * 0.12;
    this.group.rotation.z = clamp(bank + yawLean, -0.5, 0.5);
    // 俯仰姿态 + 轻微浮动 bob
    this.group.rotation.x = this.pitch + Math.sin(t * 1.6) * 0.02;
    this.group.rotation.y = this.yaw;

    this.pulse += dt;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    const k = 0.85 + (Math.sin(this.pulse * 7) * 0.5 + 0.5) * 0.45;
    for (const g of this.glows) g.scale.setScalar(k);
  }

  nextGun() {
    this.gunSide = 1 - this.gunSide;
    return this.gunSide === 0 ? 'left' : 'right';
  }

  gunWorld(side) {
    this.group.updateMatrixWorld(true);
    return (side === 'left' ? this.gunL : this.gunR).getWorldPosition(new THREE.Vector3());
  }

  missileWorld() {
    this.group.updateMatrixWorld(true);
    return this.mport.getWorldPosition(new THREE.Vector3());
  }

  /** 机头前向单位向量（与 group.rotation.order='YXZ' 一致） */
  forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    );
  }

  /** 机体水平右向单位向量（用于双发左右偏移） */
  rightDir() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  damage(kind) {
    if (!this.alive || this.invuln > 0) return { destroyed: false, ignored: true };
    if (kind === 'missile') {
      this.armor = 0;
      this.alive = false;
      return { destroyed: true };
    }
    this.armor = Math.max(0, this.armor - 1);
    this.invuln = 0.55;
    if (this.armor <= 0) {
      this.alive = false;
      return { destroyed: true };
    }
    return { destroyed: false };
  }

  destroy() {
    this.alive = false;
    this.group.visible = false;
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
