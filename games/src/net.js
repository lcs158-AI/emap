/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
export class Net {
  constructor({ onPresence, onWeapon, onFlight, onCommand, onConnect } = {}) {
    this.onPresence = onPresence;
    this.onWeapon = onWeapon;
    this.onFlight = onFlight;
    this.onCommand = onCommand;
    this.onConnect = onConnect;
    this.socket = null;
    this.lastState = 0;
  }

  init() {
    if (typeof window.io !== 'function') {
      this.onConnect && this.onConnect(false);
      return;
    }
    const socket = window.io(window.GAME_SERVER, { transports: ['websocket', 'polling'] });
    this.socket = socket;

    socket.on('connect', () => {
      socket.emit('join', 'host');
      this.onConnect && this.onConnect(true);
    });

    socket.on('presence', (p) => this.onPresence && this.onPresence(p));

    socket.on('weapon', (m) => this.onWeapon && this.onWeapon(m));
    // 手机端菜单指令（V2.5.2）：{ action:'menu' | 'mode' | 'replay', mode? }
    socket.on('command', (m) => this.onCommand && this.onCommand(m));
    // 手机体感飞行姿态（V2.3.0）：{ pitch, roll }
    socket.on('flight', (m) => this.onFlight && this.onFlight(m));
    // 兼容 V1 控制器的 fire 事件：视为一次机炮点射
    socket.on('fire', () => this.onWeapon && this.onWeapon({ type: 'cannonTap' }));

    socket.on('disconnect', () => this.onConnect && this.onConnect(false));
    socket.on('connect_error', () => this.onConnect && this.onConnect(false));
  }

  sendState(payload, force = false) {
    if (!this.socket || !this.socket.connected) return;
    const now = performance.now();
    if (!force && now - this.lastState < 400) return;
    this.lastState = now;
    this.socket.emit('state', payload);
  }
}
