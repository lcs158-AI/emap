/*
 * 小刘游戏 · 空中打击（XiaoLiu Games）
 * 开发人员：刘春杉、刘拙研、TRAE
 * Copyright © 2026 刘春杉、刘拙研  All rights reserved.
 */
// Three.js 本地优先 + 多 CDN 回退加载（模块顶层 await，导入方自动等待）
const CDNS = [
  '../lib/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://fastly.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
];

export let THREE = null;

for (const url of CDNS) {
  try {
    const mod = await import(url);
    if (mod && mod.Scene) { THREE = mod; break; }
  } catch (err) {
    console.warn('[three] 加载失败', url, err && err.message);
  }
}

export const THREE_OK = !!THREE;
