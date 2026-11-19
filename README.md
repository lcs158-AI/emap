# 跬步 · 小刘智能空间矩阵

用于开展在线空间信息技术研发和展示的 Web 项目（纯前端静态站点，可部署到任意静态托管平台）。

线上站点：`lzywhy.com`。

## 项目定位

一个集成多种地图技术的在线空间数据平台，由若干相对独立的「板块」构成。板块间尽量自包含（自带依赖库与数据），仅共享基础工具脚本，便于独立开发、维护与部署。

## 目录结构

```
emap/
├── index.html            # 首页/导航入口（卡片式）
│
│   ── 板块（各自独立的目录）──
├── games/                # 小刘游戏：Three.js 3D 体感空战游戏（键盘/手机/姿态控制）
├── global/               # 跬步地球：Cesium 3D 地球（定位、测量、实时潮汐）
│   ├── index.html
│   ├── global.css
│   ├── global.js
│   ├── cesium/           # Cesium 引擎（自包含）
│   └── data/JILONG20260826.kml
├── jsoncanvas/           # CANVAS 地图：基于 CANVAS + GeoJSON 的 WebGIS 研发
└── covid19/              # COVID-19 传播分析：echarts 疫情扩散与输入性风险
    └── echarts/          # echarts 4.9.0 本地库（含 world.js 世界地图）
│
│   ── 根目录板块入口 ──
├── AIsea.html            # 跬步地图：OpenLayers 平面地图（主应用）
├── mapctl/               # 跬步地图 · 手机遥控控制器（移动端页面，扫码打开）
│
│   ── 共享资源（板块共用）──
├── css/                  # 公共样式（home / map / jsoncanvas 等）
├── js/                   # 公共脚本（config / utils / map 等）
├── geojson/              # 公共地理数据（全国/台湾/日本/世界）
├── data/                 # 公共 JSON 数据
├── pics/                 # 公共图片资源
└── libs/                 # 公共第三方库
```

## 板块清单

| 板块 | 入口 | 技术栈 | 说明 |
|------|------|--------|------|
| 跬步地图 | `AIsea.html` | OpenLayers 7.5.2 | 平面地图，支持定位、测量、实时潮汐、图层管理、本地图层编辑、手机扫码遥控，及本地/上传数据可视化 |
| 跬步地球 | `global/index.html` | Cesium | 3D 地球，支持定位、测量、实时潮汐 |
| CANVAS 地图 | `jsoncanvas/index.html` | 原生 Canvas + GeoJSON + jQuery UI | WebGIS 研发示例，支持放大/缩小/平移/全图 |
| COVID-19 | `covid19/index.html` | echarts 4.9.0 | 2020 年全球疫情扩散与输入性风险分析（研学作品） |
| 小刘游戏 | `games/index.html` | Three.js | 3D 体感空战游戏，支持键盘操作、手机扫码遥控、姿态体感、语音控制 |

> 说明：`covid19` 使用本地 echarts（jsdelivr CDN 在国内访问不稳定，已下载嵌入）。

## 主要功能

- **多源底图**：天地图、ESRI 影像（根据是否位于 `lzywhy.com` 域名自动切换）
- **地理数据加载**：支持 `.geojson` / `.json` / `.kml` / `.kmz` / `.gml` 上传
- **图层管理**：动态图层增删、显隐、编辑（`js/layer_editor.js` + `js/feature_form.js`）
- **测量与潮汐**：地图测量、实时潮汐曲线
- **手机遥控**：电脑端打开 `AIsea.html` → 工具栏 📱 → 「手机扫码遥控」面板，提供两种模式
  - **简易遥控**：手机扫码进入 `mapctl/`，摇杆平移、按住缩放/旋转，另有复位、定位、底图、测长/测面
  - **地图镜像**：手机扫码打开同一张地图（`AIsea.html?mirror=1`），手机上拖动/双指缩放、点选测长测面会实时同步到电脑；测量完成后自动替换上一次结果，点「停测」清空电脑端
- **游戏**：键盘 / 手机 / 体感 / 语音多种操控方式

## 本地运行

项目为纯静态站点，任选一种方式在仓库根目录启动 HTTP 服务：

```bash
# Python
python -m http.server 8080

# Node（如需）
npx serve
```

然后浏览器访问 `http://localhost:8080/index.html`。

> 注意：Cesium（跬步地球）、天地图等部分功能依赖外网服务；直接在浏览器用 `file://` 打开可能因跨域限制导致部分资源/数据加载失败，建议用本地 HTTP 服务访问。

## 部署

- 直接部署到静态托管平台（如 GitHub Pages / Render / 数据本地存储），`CNAME` 配置了 `lzywhy.com` 域名。
- 全站无构建步骤，上传仓库内容即可。
