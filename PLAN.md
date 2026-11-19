# 跬步地图升级实施方案：手机遥控 + 双版本三维用海

- 文档版本：1.1
- 日期：2026-11-19
- 状态：手机遥控（简易遥控 + 地图镜像）已实施并验证（2026-11-19）；双版本三维用海暂缓
- 适用仓库：`c:\个人\自编程序\readexif\emap`（前端）与 `c:\个人\自编程序\readexif\fastapi`（中继）

## 1. 目标与范围

本次升级包含两件事：

1. **手机扫码遥控电脑端跬步地图**：手机作为控制器，通过现有小刘游戏的中继服务，控制电脑端 `AIsea.html` 的地图平移、缩放、旋转复位、定位、底图切换、测量开关。
2. **双版本三维用海展示**：
   - **跬步地球（Cesium）版**：并入 `global/`，展示真实经纬度、棱体底高/顶高、管线逐节点高程，强调地理准确。
   - **Three.js 独立版**：新建 `sea3d/`，独立页面，风格化三维沙盘，与跬步地图松耦合，只共享数据解析与示例数据。

两版必须使用同一份 GeoJSON/KML 时得到一致的棱体数量、管线数量、节点数量、底/顶高程与配色。

## 2. 已确认决策

| 项目 | 决策 |
|------|------|
| 手机遥控范围 | 基础遥控：摇杆平移、缩放、旋转复位、定位、底图切换、测量长度/面积/关闭 |
| 通信中继 | 扩展现有 FastAPI 中继，新增独立命名空间，不改游戏逻辑 |
| 三维版本 | 同时做 Cesium 版与 Three.js 版 |
| Cesium 版位置 | 并入跬步地球 `global/` |
| Three.js 版位置 | 独立 `sea3d/`，从跬步地图以链接方式进入，松耦合 |
| 高程约定 | 仅按高程解析，负值表示水下；不做“水深为正”的自动换算 |
| 数据来源 | 先内置示例数据，同时支持本地导入 GeoJSON/KML |
| 部署形态 | 纯静态前端，无构建步骤；中继单独部署 Render |

## 3. 现状与代码依据

实施前先核对以下现状：

- `AIsea.html`：跬步地图入口，工具栏为固定按钮组。
- `js/map.js`：全局 `window.map`（EPSG:3857），已有定位、测量、底图切换、图层管理；本次不改该文件。
- `js/xiaoliu_bridge.js`：小刘 Agent 到地图图层的单向桥，与手机遥控无关。
- 小刘游戏遥控：
  - 客户端：`games/src/net.js`，`join('host')` / `join('controller')`，事件 `state / weapon / command / flight`。
  - 控制页：`games/controller.html`。
  - 中继：`fastapi/app/api/game.py`，`/api/game/info` 生成手机页与二维码；`main.py` 挂载 Socket.IO。
  - 限制：全局单主机 `_host_sid`，事件白名单固定。
- 跬步地球：
  - `global/index.html` 加载本地 `global/cesium/Cesium.js`。
  - `global/global.js` 创建 Cesium Viewer，使用天地图影像与 WorldTerrain；已有 KML 解析、飞行、潮汐、测量。
  - `global/cesium` 已包含 `KmlDataSource`、`GeoJsonDataSource`、`PolygonGraphics`、`PolylineGraphics`，但本方案不依赖其隐式高度规则。
- Three.js：
  - 仅游戏自带 `games/lib/three.module.js`（r160 内核），无 OrbitControls、无 GIS 能力。
  - 本方案在 `sea3d/lib/` 内自包含 three 与所需 addon。

## 4. 总体架构

```text
┌──────────────────────── 共享数据层 ────────────────────────┐
│ js/sea_use_data.js  (GeoJSON/KML -> 统一模型)              │
│ data/sea_use/demo.geojson, demo.kml                        │
└───────────────┬───────────────────────────┬────────────────┘
                │                           │
      ┌─────────▼─────────┐       ┌─────────▼──────────┐
      │ Cesium 版          │       │ Three.js 版         │
      │ global/sea_use.js  │       │ sea3d/js/sea3d.js   │
      │ 并入跬步地球        │       │ 独立页面            │
      └─────────┬─────────┘       └─────────┬──────────┘
                │                           │
      ┌─────────▼─────────┐       ┌─────────▼──────────┐
      │ 跬步地球入口        │       │ AIsea 链接入口      │
      │ global/index.html  │       │ AIsea.html 下拉     │
      └───────────────────┘       └────────────────────┘

手机遥控（独立子系统）：
games 中继 -> 扩展 /map 命名空间 -> js/map_remote.js（电脑端）
                                      -> mapctl/（手机端）
```

松耦合约定：

- Three.js 版不引用 OpenLayers、Cesium、`window.map`、AIsea 状态。
- 两版不共享相机、图层、选中状态；只共享解析脚本与示例数据。
- AIsea 只提供链接，不加载 Three.js 资源。

## 5. 数据规范

### 5.1 统一模型

`js/sea_use_data.js` 输出：

```json
{
  "prisms": [
    {
      "id": "prism-1",
      "name": "示例棱体A",
      "points": [[111.2501, 21.4501], [111.2512, 21.4501], [111.2512, 21.4510]],
      "bottom": -12.0,
      "top": 2.0,
      "color": "#2e7dd1"
    }
  ],
  "pipelines": [
    {
      "id": "pipe-1",
      "name": "示例管线1",
      "nodes": [
        { "lon": 111.2500, "lat": 21.4500, "z": -8.0 },
        { "lon": 111.2510, "lat": 21.4505, "z": -10.5 }
      ],
      "color": "#ffb02e",
      "width": 4
    }
  ],
  "extent": {
    "west": 111.2490,
    "south": 21.4490,
    "east": 111.2520,
    "north": 21.4520,
    "minHeight": -15.0,
    "maxHeight": 3.0
  },
  "warnings": []
}
```

约定：

- `bottom` / `top` / `z` 均为**高程（米）**，负值水下。
- `top < bottom` 时自动交换并写入 `warnings`。
- 棱体多边形空洞忽略，并写入 `warnings`。
- 管线节点少于 2 个时丢弃该管线并写入 `warnings`。
- 颜色支持 `#RRGGBB`、`rgb()`、CSS 颜色名；无效时使用默认调色板。
- 所有数值做有限性校验；无法解析的要素跳过并写入 `warnings`。

### 5.2 GeoJSON 映射

- `FeatureCollection` / `Feature` / `GeometryCollection` 均可。
- `Polygon` / `MultiPolygon` -> 棱体。
- `LineString` / `MultiLineString` -> 管线。
- 属性优先级：
  - 底高：`bottom`、`bottomHeight`、`底高`
  - 顶高：`top`、`topHeight`、`顶高`
  - 高程：`elevation`、`height`、`高程`
  - 名称：`name`、`名称`
  - 颜色：`color`、`fill`、`stroke`、`颜色`
  - 线宽：`width`、`线宽`
- 坐标第三维即高程；缺失时用属性高程；仍缺失则默认 `0` 并告警。

### 5.3 KML 映射

- 使用 `DOMParser`，按 `localName` 匹配，避免命名空间问题。
- `Placemark` -> `Polygon` 为棱体，`LineString` 为管线；`MultiGeometry` 展开。
- `ExtendedData` 的 `Data name/value` 读取上述中英文字段。
- `LineString` 的 `coordinates` 为 `lon,lat,z`，逐节点高程。
- `Polygon` 的底/顶优先取 `ExtendedData`；缺失时：
  - 有坐标高程：作为顶高，底高默认 `0`；
  - 无坐标高程：底高 `-10`、顶高 `0`，并告警。
- 不依赖 Cesium `KmlDataSource` 的高度推断，避免两版结果不一致。

### 5.4 示例数据

- `data/sea_use/demo.geojson`：3~5 个棱体 + 2 条管线。
- `data/sea_use/demo.kml`：同样内容，使用 `ExtendedData` 演示底/顶字段。
- 位置在博贺湾附近的小范围，名称标注“示例数据（非真实用海项目）”。

## 6. 详细实施

### 6.1 共享数据层

新增 `js/sea_use_data.js`（普通脚本，暴露 `window.SeaUseData`）：

- `parseText(text, fileName)`：根据扩展名或内容分派。
- `parseGeoJSON(obj)`。
- `parseKML(text)`。
- `normalize(model)`：字段校验、默认值、告警、范围计算。
- `loadFile(file)`：`FileReader` 读取，返回模型。
- `loadDemo()`：`fetch('../data/sea_use/demo.geojson')`，两版各自按相对路径调用。
- 返回 `{ model, warnings }`；错误抛出可读信息，由页面展示。

验收：同一份 GeoJSON/KML 在两版输出相同要素数与高程。

### 6.2 Cesium 版（并入跬步地球）

修改：

- `global/index.html`
  - 工具栏新增「用海」按钮，`id="seaUseBtn"`。
  - 新增全屏覆盖层 `#seaUseOverlay`：顶部标题/导入/示例/退出；左侧图层、夸张、视角、海面、影像开关；底部图例和数据摘要；隐藏文件输入。
  - 引入 `../js/sea_use_data.js`、`sea_use.css`、`sea_use.js`。
- 新增 `global/sea_use.css`。
- 新增 `global/sea_use.js`。
- **不修改** `global/global.js`；按钮绑定、`?sea3d=1` 自动打开、覆盖层逻辑全部在 `sea_use.js` 内。

`global/sea_use.js` 关键点：

1. 独立轻量 Viewer：
   - 容器在覆盖层内，显示后再创建，避免尺寸为 0。
   - `terrain: new Cesium.EllipsoidTerrainProvider()`，不加载地形瓦片。
   - 关闭 `skyBox`、`skyAtmosphere`、`animation`、`timeline`、`infoBox`、`selectionIndicator`、`baseLayerPicker`、`homeButton`、`fullscreenButton`。
   - `scene.globe.depthTestAgainstTerrain = false`；`globe.showGroundAtmosphere = false`；`scene.fog.enabled = false`。
   - `viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5)`；移动端建议 1.0~1.25。
   - 影像：复用天地图配置；默认开启，可关闭；加载失败时退回纯海色底图，不阻塞展示。
2. 数据层容器：
   - `Cesium.CustomDataSource` 分别管理：`prisms`、`pipelines`、`nodes`、`labels`、`seaSurface`、`grid`。
   - 图层开关直接控制 `dataSource.show`。
3. 实体构建：
   - 棱体：`polygon.hierarchy` 平面点串；`height = bottom * scale`；`extrudedHeight = top * scale`；半透明材质 + 描边。
   - 管线：`polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights(...)`；`width` 像素；`clampToGround: false`。
   - 节点：`point.pixelSize` 6~8；`disableDepthTestDistance = Number.POSITIVE_INFINITY`。
   - 标签：显示真实高程（不受夸张影响）；`distanceDisplayCondition` 控制距离；可整体开关。
   - 批量添加时用 `entities.suspendEvents()` / `resumeEvents()`。
4. 海面与水下：
   - 海面：数据范围外扩的矩形，`height: 0`，半透明蓝色；默认不使用昂贵水体材质。
   - 水下透视：提供「隐藏地球 / 半透明地球」开关，保证水下棱体和管线可见；默认开启半透明。
   - 海床网格：可选，位于最低高程下方。
5. 交互：
   - 点击拾取：`ScreenSpaceEventHandler` + `scene.pick`，弹出名称、类型、底高、顶高、节点高程。
   - 视角预设：俯视、斜视、侧视、水下；基于数据范围 `BoundingSphere` 计算。
   - 重置视角、关闭面板。
6. 高程夸张：
   - 1x / 2x / 5x / 10x；重建实体；标签始终显示真实值；海面保持 0 米。
7. 退出：
   - 移除事件处理器、销毁 Viewer、清空引用；主地球页保持原状。
8. 性能目标：
   - 200 个棱体 + 1000 个管线节点，桌面 50+ FPS，手机 30+ FPS。

### 6.3 Three.js 版（独立 `sea3d/`）

新增文件：

- `sea3d/index.html`
- `sea3d/css/sea3d.css`
- `sea3d/js/sea3d.js`（ES module）
- `sea3d/lib/three.module.js`（复制 `games/lib/three.module.js`，r160）
- `sea3d/lib/OrbitControls.js`（r160 examples 版本，import 指向本地 three）
- `sea3d/lib/BufferGeometryUtils.js`（如需合并几何）

实现要点：

1. 页面与依赖：
   - 使用 import map 或调整 import 路径，确保 `OrbitControls` 能找到本地 `three`。
   - 不加载 OpenLayers/Cesium，不访问 `window.map`。
2. 坐标：
   - 以数据范围中心为原点，等距投影到局部米制坐标：x 东、z 北、y 高程。
   - 小范围误差可忽略；在 README 中注明该近似。
3. 场景：
   - 透视相机 + OrbitControls（阻尼、缩放范围、目标点）。
   - 半球光 + 平行光；关闭阴影。
   - 天空用背景色/渐变；海面为半透明平面；海床平面 + 网格；北向标识。
   - `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`；`antialias: true`；`powerPreference: 'high-performance'`。
4. 几何：
   - 棱体：自写 BufferGeometry（顶面、底面、侧面、法线），加 `EdgesGeometry` 边线；避免透明排序问题时可改为实体色。
   - 管线：逐段 Tube/Cylinder，使用 `BufferGeometryUtils.mergeGeometries` 合并；节点用 `InstancedMesh` 球体。
   - 标签：DOM 覆盖层，按相机投影定位；只显示视口内、距离合适、上限 200 个；显示真实高程。
   - 高度夸张：根组 `scale.y`；标签按缩放后的位置投影，但文本显示真实值。
5. 交互：
   - 轨道旋转/平移/缩放；俯视/斜视/侧视/水下预设。
   - Raycaster 点击拾取棱体/管线/节点，高亮并弹出信息。
   - 图层开关、海面开关、标签开关、夸张切换。
   - 导入本地 GeoJSON/KML；加载示例数据；错误面板。
6. 性能：
   - 合并几何、InstancedMesh、限制标签数量、像素比上限、页面隐藏时暂停渲染。
   - 验收数据量同上。
7. 退出/销毁：
   - 释放几何、材质、纹理、renderer；移除事件监听。

### 6.4 手机遥控

#### 6.4.1 后端（`c:\个人\自编程序\readexif\fastapi`）

新增 `app/api/map.py`：

- 从 `.game` 导入同一个 `sio`。
- **所有地图事件必须带 `namespace='/map'`**，不得注册默认命名空间的 `connect/disconnect`，避免覆盖游戏处理器。
- 状态：`_map_host_sid`、`_map_controllers`。
- 事件：
  - `map_join`：`{role: 'host'|'controller'}`；host 顶替旧 host 时通知旧连接。
  - `map_cmd`：手机 -> 电脑；服务端仅转发给 host。
  - `map_state`：电脑 -> 手机；服务端转发给所有 controller。
  - 命名空间级 `connect/disconnect`：维护在线状态并广播 presence。
- 接口：
  - `GET /api/map/info`：返回 `{ url, qr, mirrorUrl, mirrorQr, version }`；`url` 指向简易遥控页（`MAP_SITE_URL`），`mirrorUrl` 指向地图镜像页（`MAP_APP_URL`），均可带 `?server=` 便于本地测试。
  - `GET /api/map/health`：返回 host 在线、controller 数量、版本。
- 环境变量：`MAP_SITE_URL`（默认 `https://lzywhy.com/mapctl`）、`MAP_APP_URL`（默认 `https://lzywhy.com/AIsea.html`）、`MAP_VERSION`。
- 二维码复用现有 `qrcode` 依赖。

修改 `main.py`：

- 引入 `map` 路由并挂载到 `/api/map`。
- 不改游戏路由与事件。

部署：

- 本地 `uvicorn` 验证后，提交 FastAPI 仓库并重新部署 Render。
- 前端通过 `?server=` 或默认 `https://lzy-fastapi.onrender.com` 连接。

#### 6.4.2 电脑端

新增 `js/map_remote.js`：

- 读取 `?server=` 或 `localStorage`，默认 `https://lzy-fastapi.onrender.com`。
- `io(server + '/map')`，加入 host。
- 指令：
  - `pan`：`{vx, vy}`，host 用 `requestAnimationFrame` 按当前分辨率平滑移动中心；松手归零。
  - `zoom`：`{dir: 1|-1, active}`，按住连续 `setZoom`，限幅 2~19。
  - `rotate`：`{dir, active}`，按住连续 `setRotation`。
  - `reset`：旋转归零、恢复初始中心与缩放。
  - `locate`：触发现有定位按钮。
  - `base`：触发现有底图切换。
  - `measure`：`length` / `area` / `off`，调用现有测量函数或按钮。
- 状态回传：`map-state`，节流约 200ms，包含中心、缩放、旋转、底图、测量状态。
- 断线、主机离线、指令异常均有状态提示。
- 嵌入模式 `XIAOLIU_EMBED` 下不启用。

修改 `AIsea.html`：

- 工具栏新增「手机遥控」入口；面板显示二维码、地址、连接状态、复制链接。
- 引入 `js/map_remote.js?v=20261119`。
- 不改 `js/map.js`。

#### 6.4.3 手机端

新增 `mapctl/`：

- `index.html`、`mapctl.css`、`mapctl.js`。
- 复制 `games/lib/socket.io.min.js` 到 `mapctl/lib/`，避免跨板块依赖。
- UI：
  - 左侧摇杆：平移；死区约 0.15；50ms 节流。
  - 右侧按住缩放 +/-、旋转左右。
  - 按钮：复位、定位、底图、测量长度、测量面积、关闭测量。
  - 顶部状态：连接、主机在线、中心/缩放。
  - 长按状态栏可修改中继地址；支持 `?server=`。
- 触摸：`touch-action: none`、禁止滚动/双击缩放、适配横竖屏与安全区。

#### 6.4.4 手机地图镜像（`?mirror=1`）

手机打开与电脑相同的 `AIsea.html`，省去“模拟鼠标点击”的不稳定性，直接复用地图自身的交互：

- 电脑端 `js/map_remote.js`：面板增加「简易遥控 / 地图镜像」两个 Tab，分别对应 `url/qr` 与 `mirrorUrl/mirrorQr`；`?mirror=1` 时跳过宿主初始化。
- 新增 `js/map_mirror.js`（仅 `?mirror=1` 启用）：以 controller 加入 `/map`，同步三类操作：
  - 视图：`moveend` / `change:resolution` / `change:rotation` 节流 120ms 发送 `view`（中心经纬度、缩放、旋转）。
  - 测量：监听 `measureLayer` 源 `addfeature` 发送 `measure-sync`（几何坐标 + 类型），新测量自动移除上一次；`clear` 发送 `measure-clear`。
  - 底图：点击镜像页底图按钮后发送 `base-set`。
- 电脑端处理对应指令：`view` 直接设置视图，`base-set` 对齐底图按钮状态，`measure-sync` 清空并在 `measureLayer` 重建要素、刷新结果文本，`measure-clear` 清空。
- 手机端 UI：顶部连接状态条；底部触摸操作条（底图 / 测长 / 测面 / 撤销点 / 完成 / 停测）；隐藏桌面端工具栏与遥控面板。
- 不做反向同步：电脑端不驱动手机，避免双源冲突。

### 6.5 入口、文档与版本

修改 `AIsea.html`：

- 新增「三维用海」下拉：
  - 「跬步地球版」-> `global/index.html?sea3d=1`
  - 「Three.js 版」-> `sea3d/index.html`（新标签页）
- 只放链接，不加载三维资源。

修改 `README.md`：

- 板块清单增加三维用海双版本与手机遥控。
- 目录结构补充 `sea3d/`、`js/sea_use_data.js`、`data/sea_use/`、`mapctl/`。
- 数据格式与字段说明。
- 使用说明：扫码、入口、本地测试方式。

版本：

- `AIsea.html` 标题 3.03 -> 3.04。
- `global/index.html` 标题 1.25 -> 1.26。
- `sea3d/index.html` 标题「三维用海 1.0」。
- 新增脚本统一带 `?v=20261119`；后端 `MAP_VERSION` 独立。

## 7. 执行顺序

1. 共享数据层：`js/sea_use_data.js` + `data/sea_use/demo.geojson` + `demo.kml`。
2. Cesium 版：`global/index.html`、`global/sea_use.css`、`global/sea_use.js`。
3. Three.js 版：`sea3d/` 全套。
4. 双版本对照验收：同一数据、同一数量、同一高程、同一配色。
5. 手机遥控后端：`fastapi/app/api/map.py` + `main.py`。
6. 手机遥控前端：`js/map_remote.js` + `AIsea.html` 面板 + `mapctl/`。
7. AIsea 三维入口、README、版本号。
8. 全量回归与部署。

依赖关系：

- 步骤 1 是 2、3 的前置。
- 2、3 可并行；4 必须在 2、3 后。
- 5 是 6 的前置；6 可与 2、3 并行。
- 7 在所有功能完成后。

## 8. 验证与验收

### 8.1 数据层

- 同一份 GeoJSON/KML 两版解析出的棱体数、管线数、节点数一致。
- 底高/顶高/节点高程一致；`top < bottom` 自动交换并告警。
- 中文/英文字段均可识别。
- 空洞、坏坐标、空几何有可读告警，不崩溃。

### 8.2 Cesium 版

- 示例数据与本地导入均能显示。
- 棱体底/顶正确，管线逐节点起伏正确。
- 海面、标签、节点、网格可独立开关。
- 高程夸张后标签仍显示真实值。
- 水下透视可见水下实体。
- 点击拾取信息正确。
- 退出后主地球飞行、潮汐、测量正常。
- 200 棱体 + 1000 节点：桌面 50+ FPS，手机 30+ FPS。

### 8.3 Three.js 版

- 独立 URL 可直接打开，无 AIsea/Cesium 依赖。
- 轨道交互、预设视角、拾取、标签、夸张、导入均正常。
- 与 Cesium 版展示结果一致。
- 移动端触控可用；页面隐藏时暂停渲染。
- 性能目标同上。

### 8.4 手机遥控

- `/api/map/info` 返回地址与二维码；`/api/map/health` 状态正确。
- 本地双端：摇杆、缩放、旋转、复位、定位、底图、测量均生效。
- 公网：Render 部署后手机移动网络扫码可用。
- 断线重连、主机离线提示正确。
- 游戏原有扫码遥控不受影响（独立命名空间）。

### 8.5 回归

- AIsea 测量、图层管理、数据上传、嵌入模式正常。
- 跳过 `js/map.js`、游戏前端与游戏事件的改动。
- 控制台无新增报错。

## 9. 回退方式

- 共享数据层：删除 `js/sea_use_data.js` 与 `data/sea_use/`。
- Cesium 版：删除 `global/sea_use.js`、`global/sea_use.css`，移除 `global/index.html` 的按钮、覆盖层与脚本引用。
- Three.js 版：删除 `sea3d/`。
- AIsea 入口：移除「三维用海」与「手机遥控」下拉项及脚本引用。
- 手机遥控：删除 `js/map_remote.js`、`js/map_mirror.js`、`mapctl/`；后端删除 `app/api/map.py` 与 `main.py` 的挂载。
- 版本号与 `?v=` 同步回退。

所有改动均为新增文件或加法式入口，不修改 `js/map.js`、游戏前端、游戏事件与现有地球逻辑。

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| Socket.IO 命名空间冲突 | 地图事件全部使用 `/map`；不注册默认命名空间事件 |
| Render 冷启动 | 前端显示“唤醒中”，失败可重试；本地 `?server=` 调试 |
| 手机操控延迟 | 电脑端 RAF 平滑；手机 50~80ms 节流；状态回传 200ms |
| Cesium 水下遮挡 | 提供隐藏/半透明地球开关；实测确认 |
| Cesium 地形/影像卡顿 | 椭球地形、限制像素比、影像可关、批量实体、标签按需 |
| Three.js 透明排序 | 优先实体色 + 边线；必要时调整 `depthWrite/renderOrder` |
| Three.js 标签过多 | DOM 标签上限、距离/视口裁剪、降频更新 |
| 双版本行为不一致 | 共用解析器与示例数据，建立对照验收 |
| KML 字段不规范 | 中英文字段兼容；缺失给默认值 + 告警；保留原始文件提示 |
| 高程基准差异 | 统一按数据值展示，不自行做基准面换算；文档注明 |

## 11. 本次不做

- 不做三维叠加到 OpenLayers 平面地图。
- 不做 CSV/Excel 导入。
- 不做两版之间的实时联动或共享相机。
- 不做多主机/多房间；沿用单主机模式。
- 暂不把 Three.js 版做成首页卡片。
- 不在手机端做图层显隐、属性查询、天气/专题入口。

## 12. 实施前需确认

1. 确认本方案文件内容与执行顺序。
2. 确认中继域名仍为 `https://lzy-fastapi.onrender.com`；如有变化，修改 `MAP_SERVER` 默认值。
3. 确认手机控制页部署路径为 `https://lzywhy.com/mapctl/`；如有变化，修改 `MAP_SITE_URL`。
4. 确认高程数据以“米、海平面以上为正”展示，不要求基准面换算。

确认后按第 7 节顺序实施；每完成一个阶段，更新 README 与版本号，并汇总改动、验证结果。
