# 小刘游戏 · 静态版（GitHub Pages + Render 中继）

由 `D:\AIapp\游戏`（本地 Node 版）改造而来的纯静态前端，原目录保持不动；原中间副本 `D:\AIAPP\games` 已归档为 `games_old`（2026-11-15），本目录为唯一维护版本。
手机扫码联动通过 **Render 上的 FastAPI Socket.IO 中继** 实现，手机与电脑**无需同一 WiFi**。

## 架构

```
电脑游戏页 index.html ──┐
                        ├─ Socket.IO (wss) ─→ lzy-fastapi.onrender.com（FastAPI + python-socketio）
手机控制器 controller.html ┘        └─ /api/game/info 生成控制器地址与二维码
```

- 前端：本目录（`emap/games/`）即唯一源码目录，同时作为跬步地图仓库的 `games/` 子目录随 GitHub Pages 发布，地址 `https://lzywhy.com/games/`
- 后端：`d:\AIapp\lzywhycom\fastapi`（跬步地图同一服务，新增 `app/api/game.py`，不影响地图功能）
- three.js / MediaPipe Pose / socket.io 客户端全部自托管于 `lib/`，无 CDN 依赖

## 本地运行

```bash
# 1. 启动后端中继（fastapi 目录）
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# 2. 启动静态服务器（本目录；ES Module 不能用 file:// 直接双击打开）
python -m http.server 8090

# 3. 浏览器打开（server 参数覆盖默认后端地址，指向本地）
http://127.0.0.1:8090/?server=http://127.0.0.1:8000
```

手机控制器本地测试：`http://<电脑局域网IP>:8090/controller.html?server=http://<电脑局域网IP>:8000`
（手机与电脑需同一 WiFi，仅本地测试如此；线上部署后任意网络均可）

## 部署

### 1. 后端（Render）

`fastapi` 项目已新增 `python-socketio`、`qrcode` 依赖，推送到仓库后 Render 自动重新部署。
启动命令无需改变（仍为 `uvicorn main:app ...`，`main:app` 已被 ASGIApp 包装）。

可选环境变量：
- `GAME_SITE_URL`：控制器页面地址前缀，默认 `https://lzywhy.com/games`。
  若前端部署路径变化，在 Render 后台设置为实际值（不带末尾斜杠）。

### 2. 前端（随跬步地图 GitHub Pages 发布）

1. 直接在本目录（`emap/games/`）修改，无需再复制粘贴；`D:\AIAPP\games` 已归档为 `games_old`，不再维护
2. 提交并推送地图仓库，GitHub Pages 自动发布
3. 访问 `https://lzywhy.com/games/`

前端资源均为相对路径，子路径部署无需调整。

默认后端地址写在 `index.html` 与 `controller.html` 的 `window.GAME_SERVER`
（当前 `https://lzy-fastapi.onrender.com`），更换后端域名时改这两处即可；
也可用 URL 参数 `?server=...` 临时覆盖。

## 注意事项

- **Render 免费实例休眠**：首次打开可能需 30~60 秒唤醒，二维码每 20 秒自动重试刷新，稍等即可。
- **摄像头权限**：GitHub Pages 自带 HTTPS，满足浏览器要求；首次使用需允许摄像头。
  姿态识别在本地浏览器运行，视频不上传服务器。
- 手机控制器：横屏双手握持，左机炮（按住连发）/ 右导弹 / 中条干扰弹，支持手机端选模式与重玩。
- 键盘模式无需摄像头与手机：左手 A/D 平移 · W/S 俯仰 · Z/X 机头；右手 J/空格 机炮（按住连发）· K 双发导弹 · I 单发导弹 · L 干扰弹（V2.7.0 起，旧键 Q/E/F 已停用）。

## 文件结构

```
index.html            电脑游戏主页面
controller.html       手机控制器页面
css/                  样式
src/                  游戏逻辑（game/net/pose/three 等 14 个模块）
lib/                  自托管依赖（three.js、socket.io、MediaPipe Pose 模型）
assets/voice/         语音素材目录（当前音效为程序化合成）
```

原开发文档见 `3D体感游戏开发文档.md`、`3D体感游戏升级文档.md`。
