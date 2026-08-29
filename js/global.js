// ==================== 加载进度管理 ====================
function updateLoading(percent, text) {
    const progress = document.getElementById('loadingProgress');
    const textEl = document.getElementById('loadingText');
    const percentEl = document.getElementById('loadingPercentage');
    if (progress) progress.style.width = percent + '%';
    if (textEl && text) textEl.textContent = text;
    if (percentEl) percentEl.textContent = percent + '%';
}

function hideLoading() {
    const screen = document.getElementById('loadingScreen');
    if (screen) {
        screen.classList.add('hidden');
        // 动画结束后完全移除DOM
        setTimeout(() => {
            screen.remove();
            console.log('加载界面已移除');
        }, 600);
    }
}

function showLoadingError(message) {
    const textEl = document.getElementById('loadingText');
    const percentEl = document.getElementById('loadingPercentage');
    const spinner = document.querySelector('.loading-spinner');
    const progress = document.getElementById('loadingProgress');
    if (textEl) {
        textEl.textContent = '❌ ' + message;
        textEl.style.color = '#ff4d4f';
    }
    if (percentEl) percentEl.style.display = 'none';
    if (spinner) {
        spinner.style.borderTopColor = '#ff4d4f';
        spinner.style.animationPlayState = 'paused';
    }
    if (progress) {
        progress.style.background = '#ff4d4f';
        progress.style.width = '100%';
    }
}

// ==================== 初始化 Cesium ====================
updateLoading(10, '正在配置 Cesium...');

// 设置 Cesium Ion 默认 token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3NzVhMzE5My0zNWU2LTQ1ZDYtYTI2MC05N2EzOTBhNDgxYzgiLCJpZCI6NDA3MDg1LCJpYXQiOjE3NzQxMDMyNjV9.PLB9fgVKv_MZLTFwzwMOea4W2uaAT8MT1w0pYcFuRZU';

let viewer = null;
let annotationLayer = null;

// 飞行功能全局变量（提前声明，避免TDZ错误）
const flyRoutes = [];
let kmlLoading = false;
let flyState = {
    active: false,
    preFlight: false,
    paused: false,
    route: null,
    currentSegment: 0,
    segmentProgress: 0,
    startTime: 0,
    lastTime: 0,
    planeEntity: null,
    routeLineEntity: null,
    waypointEntities: [],
    rafId: null,
    totalDistance: 0,
    segmentDistances: [],
    speedMultiplier: 1,
    preFlightComplete: false,
    // —— v1.246 新增：相机平滑与视角模式 ——
    smoothHeading: 0,      // 平滑后的航向（最短路径插值，防 ±180° 猛甩）
    viewMode: 'follow',    // follow=跟随(后上方) | cockpit=驾驶舱(第一视角) | free=自由查看
    _lookAtLocked: false,  // 相机是否处于 lookAt 锁定状态
    // —— v1.247 新增：回看功能 ——
    retro: false,          // 回看开关：相机移到机头前方朝后看
    flownLineEntity: null, // 已飞轨迹高亮橙线
    _flownPrefix: [],      // 已飞轨迹前缀缓存（整点）
    _flownSegIdx: 0        // 前缀缓存对应的段索引
};

// KML路线相关变量
let kmlRoute = null;
let kmlLoadAttempted = false;
const FLIGHT_OFFSET = 200;

// ==================== 飞行平滑工具函数（v1.246） ====================
// 角度归一化到 [-π, π]
function normAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}
// 最短路径角度插值：从 a 向 b 平滑靠近（帧率无关的指数平滑系数 alpha）
function lerpAngle(a, b, alpha) {
    return a + normAngle(b - a) * alpha;
}
// Catmull-Rom 向心参数化（centripetal, α=0.5，v1.248）
// 均匀参数化在航点间距不均时会过冲→飞行摇摆；向心参数化数学上保证不过冲、无尖点
// knots 基于水平距离（度）的累积开方，同一组 knots 供 lon/lat/height 三分量共用
function crKnots(p0, p1, p2, p3) {
    const d = (a, b) => Math.sqrt((a.lon - b.lon) * (a.lon - b.lon) + (a.lat - b.lat) * (a.lat - b.lat));
    const k1 = Math.max(1e-6, Math.sqrt(d(p0, p1)));
    const k2 = k1 + Math.max(1e-6, Math.sqrt(d(p1, p2)));
    const k3 = k2 + Math.max(1e-6, Math.sqrt(d(p2, p3)));
    return [0, k1, k2, k3];
}
// 向心 Catmull-Rom 标量分量求值：u∈[0,1] 为 p1→p2 段内归一化进度
function crEval(knots, c0, c1, c2, c3, u) {
    const t0 = knots[0], t1 = knots[1], t2 = knots[2], t3 = knots[3];
    const t = t1 + (t2 - t1) * u;
    const L = (a, b, ta, tb) => {
        const d = Math.max(1e-10, tb - ta);
        return a * ((tb - t) / d) + b * ((t - ta) / d);
    };
    const A1 = L(c0, c1, t0, t1);
    const A2 = L(c1, c2, t1, t2);
    const A3 = L(c2, c3, t2, t3);
    const B1 = L(A1, A2, t0, t2);
    const B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
}

// 解除相机 lookAt 变换锁定（v1.248 兼容：旧版 Cesium 无 lookAtReset，统一走 lookAtTransform(IDENTITY)）
function resetCameraTransform() {
    if (typeof viewer.camera.lookAtReset === 'function') {
        viewer.camera.lookAtReset();
    } else {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
}

function initViewer() {
    try {
        updateLoading(20, '正在创建地图视图...');

        // 创建 Viewer，直接在构造参数中设置 terrain（Cesium 1.113 正确方式）
        viewer = new Cesium.Viewer('cesiumContainer', {
            baseLayerPicker: false,
            imageryProvider: false,
            animation: false,
            timeline: false,
            infoBox: false,
            selectionIndicator: false,
            navigationHelpButton: false,
            homeButton: false,
            fullscreenButton: false,
            skyBox: false,
            skyAtmosphere: false,
            terrain: Cesium.Terrain.fromWorldTerrain({ maximumLevel: 12 })
        });

        // 禁用默认的 Cesium Ion 欢迎提示
        viewer._cesiumWidget._creditContainer.style.display = 'none';

        updateLoading(40, '正在加载影像底图...');

        // 添加天地图影像
        let imageryOk = false;
        try {
            const tdtImg = new Cesium.UrlTemplateImageryProvider({
                url: `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
                subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
                maximumLevel: 18,
                tilingScheme: new Cesium.WebMercatorTilingScheme()
            });
            const layer = viewer.imageryLayers.addImageryProvider(tdtImg);
            layer.show = true;
            imageryOk = true;
            console.log('✅ 天地图影像已添加');
        } catch (e1) {
            console.warn('天地图影像失败:', e1);
        }

        // 备用: Esri
        if (!imageryOk) {
            try {
                const esri = new Cesium.UrlTemplateImageryProvider({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    maximumLevel: 19,
                    tilingScheme: new Cesium.WebMercatorTilingScheme()
                });
                const layer = viewer.imageryLayers.addImageryProvider(esri);
                layer.show = true;
                imageryOk = true;
                console.log('✅ Esri影像已添加');
            } catch (e2) {
                console.warn('Esri影像也失败:', e2);
            }
        }

        // 兜底: 网格
        if (!imageryOk) {
            console.warn('使用网格底图作为兜底');
            viewer.imageryLayers.addImageryProvider(
                new Cesium.GridImageryProvider({ cells: 16, color: Cesium.Color.fromCssColorString('#444'), backgroundColor: Cesium.Color.fromCssColorString('#0a1628') })
            );
        }

        updateLoading(60, '正在加载标注层...');

        // 添加天地图注记层
        try {
            const tdtCva = new Cesium.UrlTemplateImageryProvider({
                url: `https://t0.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
                subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
                maximumLevel: 18,
                tilingScheme: new Cesium.WebMercatorTilingScheme()
            });
            annotationLayer = viewer.imageryLayers.addImageryProvider(tdtCva);
            annotationLayer.show = false;
        } catch (e) {
            console.warn('注记层失败:', e);
        }

        updateLoading(80, '正在加载功能模块...');

        // 等待渲染
        setTimeout(() => {
            updateLoading(100, '加载完成！');
            setTimeout(() => {
                hideLoading();
                postInit();
            }, 200);
        }, 100);

    } catch (error) {
        console.error('Cesium 初始化失败:', error);
        showLoadingError('地图初始化失败：' + error.message);
    }
}

// 初始化完成后的功能加载
function postInit() {
    // 加载标记点等功能
    loadPhotoPoints();
    
    // 初始化交互功能
    initInteractions();
    
    // 定位到初始位置
    if (initCenter && initCenter.length >= 4) {
        const [lon, lat, height, pitch] = initCenter;
        flyToLocation(lon, lat, height, pitch);
    }
    
    // 加载KML路线（独立异步，不阻塞）
    initKMLRoute().catch(err => {
        console.error('KML路线加载失败:', err);
        // 失败时更新UI
        const routeList = document.getElementById('flyRouteList');
        if (routeList) {
            routeList.innerHTML = '<div class="fly-route-item" style="text-align:center;color:#ff4d4f;cursor:pointer;" id="retryLoadKML"><div class="route-name" style="font-size:12px;">❌ KML加载失败，点击重试</div></div>';
            const retryBtn = document.getElementById('retryLoadKML');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    kmlLoadAttempted = false;
                    kmlRoute = null;
                    initKMLRoute().catch(console.error);
                });
            }
        }
    });
}

// 立即开始初始化
initViewer();

// 通用飞行函数：飞到 (lon, lat) 南方偏移后的位置
// 偏移距离 = (高度 / tan(俯仰角)) * offsetK
function flyToLocation(lon, lat, height, pitchDeg) {
    const pitchRad = Cesium.Math.toRadians(pitchDeg);
    const distance = (pitchRad === 0) ? 0 : height / Math.tan(pitchRad);   // 相机到地面投影点水平距离（米）
    const offsetDistance = distance * offsetK;      // 实际偏移距离（米）
    const offsetLat = offsetDistance / 111000;      // 1纬度≈111000米
    const targetLat = lat - offsetLat;
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, targetLat, height),
        orientation: {
            heading: 0,
            pitch: -pitchRad,
            roll: 0
        },
        duration: 2
    });
}

// ==================== 加载照片点 ====================
let entities = [];
function loadPhotoPoints() {
    photoPoints.features.forEach(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        const props = feature.properties;
        const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            point: {
                pixelSize: 10,
                color: Cesium.Color.RED,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2
            },
            label: {
                text: props.DD,
                font: '14px sans-serif',
                fillColor: Cesium.Color.WHITE,
                backgroundColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.6)'),
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 1,
                outlineColor: Cesium.Color.BLACK,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                show: false,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM
            },
            properties: props
        });
        entities.push(entity);
    });
}

// ==================== 初始化交互功能 ====================
let userLocationVisible = false;
let measureActive = false;
let points = [];
let tempEntities = [];
let totalDistance = 0;
let lastHighlighted = null;

function initInteractions() {
    const measureResultDiv = document.getElementById('measureResult');

    // 标注切换
    document.getElementById('toggleAnnotationBtn').addEventListener('click', () => {
        annotationLayer.show = !annotationLayer.show;
        document.getElementById('toggleAnnotationBtn').classList.toggle('active');
    });

    // 悬浮提示
    viewer.screenSpaceEventHandler.setInputAction(function (movement) {
        const picked = viewer.scene.pick(movement.endPosition);
        if (Cesium.defined(picked) && picked.id && picked.id.label) {
            if (lastHighlighted !== picked.id) {
                if (lastHighlighted) {
                    lastHighlighted.label.show = false;
                    lastHighlighted.point.pixelSize = 10;
                }
                picked.id.label.show = true;
                picked.id.point.pixelSize = 12;
                lastHighlighted = picked.id;
            }
        } else {
            if (lastHighlighted) {
                lastHighlighted.label.show = false;
                lastHighlighted.point.pixelSize = 10;
                lastHighlighted = null;
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 左键单击：统一处理照片点击和测量加点（避免事件覆盖）
    viewer.screenSpaceEventHandler.setInputAction(function (click) {
        // 优先检查是否点击了实体（照片点）
        const picked = viewer.scene.pick(click.position);
        if (Cesium.defined(picked) && picked.id && picked.id.properties) {
            const props = picked.id.properties;
            const mcVal = props.MC.getValue ? props.MC.getValue() : props.MC;
            const ddVal = props.DD.getValue ? props.DD.getValue() : props.DD;
            // 如果正在测量，先结束当前测量线段
            if (measureActive) {
                tempEntities.forEach(e => viewer.entities.remove(e));
                tempEntities = [];
                points = [];
                totalDistance = 0;
                measureResultDiv.textContent = '单击添加点，双击结束当前线段';
            }
            alert(`${ddVal}\n图片路径: /pics/${mcVal}\n(请确保图片存在)`);
            return;
        }
        // 非照片点：如果正在测量，则添加测量点
        if (!measureActive) return;
        let cartesian = viewer.scene.pickPosition(click.position);
        if (!Cesium.defined(cartesian)) {
            cartesian = viewer.camera.pickEllipsoid(click.position);
        }
        if (!Cesium.defined(cartesian)) return;
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        addMeasurePoint(cartesian, lon, lat);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 定位按钮
    document.getElementById('locateBtn').addEventListener('click', () => {
        if (userLocationVisible) {
            const existing = viewer.entities.getById('userLocation');
            if (existing) viewer.entities.remove(existing);
            userLocationVisible = false;
            document.getElementById('locateBtn').classList.remove('active');
        } else {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(pos => {
                    const { longitude, latitude } = pos.coords;
                    flyToLocation(longitude, latitude, 5000, 45);
                    updateUserLocation(longitude, latitude);
                    userLocationVisible = true;
                    document.getElementById('locateBtn').classList.add('active');
                }, err => alert('获取位置失败: ' + err.message));
            } else {
                alert('浏览器不支持地理定位');
            }
        }
    });

    // 测量功能
    document.getElementById('measureBtn').addEventListener('click', () => {
        if (measureActive) {
            tempEntities.forEach(e => viewer.entities.remove(e));
            tempEntities = [];
            points = [];
            totalDistance = 0;
            measureResultDiv.style.display = 'none';
            document.getElementById('measureBtn').classList.remove('active');
            measureActive = false;
        } else {
            measureActive = true;
            measureResultDiv.style.display = 'block';
            measureResultDiv.textContent = '单击添加点，双击结束当前线段';
            document.getElementById('measureBtn').classList.add('active');
            tempEntities.forEach(e => viewer.entities.remove(e));
            tempEntities = [];
            points = [];
            totalDistance = 0;
        }
    });

    // 测量：双击结束
    viewer.screenSpaceEventHandler.setInputAction(function () {
        if (measureActive) {
            tempEntities.forEach(e => viewer.entities.remove(e));
            tempEntities = [];
            points = [];
            totalDistance = 0;
            measureResultDiv.textContent = '单击添加点，双击结束当前线段';
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

// 添加测量点
function addMeasurePoint(cartesian, lon, lat) {
    const measureResultDiv = document.getElementById('measureResult');
    const pointEntity = viewer.entities.add({
        position: cartesian,
        point: {
            pixelSize: 12,
            color: Cesium.Color.ORANGE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1
        },
        label: {
            text: `${points.length + 1}`,
            font: '14px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -12),
            fillColor: Cesium.Color.BLACK,
            backgroundColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 1,
            outlineColor: Cesium.Color.BLACK
        }
    });
    tempEntities.push(pointEntity);

    if (points.length > 0) {
        const prev = points[points.length - 1];
        const lineEntity = viewer.entities.add({
            polyline: {
                positions: [prev.cartesian, cartesian],
                width: 3,
                material: Cesium.Color.BLUE,
                clampToGround: false
            }
        });
        tempEntities.push(lineEntity);
        const segmentLength = Cesium.Cartesian3.distance(prev.cartesian, cartesian);
        totalDistance += segmentLength;
        measureResultDiv.textContent = `总长度: ${totalDistance.toFixed(1)} 米`;
    }

    points.push({ cartesian, lon, lat });
}

// 更新用户位置点
function updateUserLocation(lon, lat) {
    const existing = viewer.entities.getById('userLocation');
    if (existing) viewer.entities.remove(existing);
    viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: {
            pixelSize: 14,
            color: Cesium.Color.BLUE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2
        },
        id: 'userLocation'
    });
}

// ==================== 潮汐功能 ====================
function getCenterLonLat() {
    const scene = viewer.scene;
    const canvas = viewer.canvas;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(centerX, centerY));
    const intersection = scene.globe.pick(ray, scene);
    
    if (intersection) {
        const cartographic = Cesium.Cartographic.fromCartesian(intersection);
        return {
            lon: Cesium.Math.toDegrees(cartographic.longitude),
            lat: Cesium.Math.toDegrees(cartographic.latitude)
        };
    }
    
    const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    return {
        lon: Cesium.Math.toDegrees(cartographic.longitude),
        lat: Cesium.Math.toDegrees(cartographic.latitude)
    };
}

let tideChartInstance = null;
let tidePanel = null;
let closeTideBtn = null;
let tideBtn = null;

function initTideFunctionality() {
    tidePanel = document.getElementById('tidePanel');
    closeTideBtn = document.getElementById('closeTideBtn');
    tideBtn = document.getElementById('tideBtn');

    if (closeTideBtn) {
        closeTideBtn.addEventListener('click', () => tidePanel.style.display = 'none');
    }

    if (tideBtn) {
        tideBtn.addEventListener('click', async () => {
            const center = getCenterLonLat();
            await fetchTideData(center.lon, center.lat);
        });
    }
}

async function fetchTideData(lon, lat) {
    try {
        // 确保tidePanel已初始化
        if (!tidePanel) {
            tidePanel = document.getElementById('tidePanel');
        }
        if (tidePanel) {
            tidePanel.style.display = 'block';
        }
        document.getElementById('tideCurrent').innerHTML = '查询中...';
        document.getElementById('tideLocation').innerHTML = `正在获取潮汐数据`;

        const proxyUrl = `${window.API_BASE_URL}/api/proxy/tide?lon=${lon}&lat=${lat}`;
        
        const proxyRes = await fetch(proxyUrl);
        const proxyData = await proxyRes.json();
        
        
        if (proxyRes.status !== 200) {
            throw new Error(proxyData.detail || '潮汐查询失败');
        }
        
        const poiName = proxyData.station_name || '附近海域';
        const tideData = proxyData.tide;
        let allHourly = tideData.tideHourly || [];

        allHourly.sort((a, b) => new Date(a.fxTime) - new Date(b.fxTime));
        updateTidePanel(allHourly, poiName);
        renderTideChart(allHourly);
    } catch (error) {
        console.error('潮汐查询出错:', error);
        document.getElementById('tideCurrent').innerHTML = '查询失败';
        document.getElementById('tideLocation').innerHTML = `❌ ${error.message}`;
        document.getElementById('tideDetail').innerHTML = '';
    }
}

function updateTidePanel(allHourly, locationName) {
    const now = new Date();
    let best = null, minDiff = Infinity;
    for (let item of allHourly) {
        const diff = Math.abs(new Date(item.fxTime) - now);
        if (diff < minDiff) {
            minDiff = diff;
            best = item;
        }
    }
    const height = best ? parseFloat(best.height).toFixed(1) : '--';
    const time = best ? new Date(best.fxTime).toLocaleTimeString('zh-CN', { hour: 'numeric', minute: 'numeric' }) : '';
    document.getElementById('tideLocation').innerHTML = `📍 ${locationName}`;
    document.getElementById('tideCurrent').innerHTML = `${height} 米`;
    document.getElementById('tideTime').innerHTML = `⏱️ ${time}`;
    document.getElementById('tideDetail').innerHTML = '';
}

function renderTideChart(tideHourly) {
    const canvas = document.getElementById('tideChart');
    if (!canvas) {
        console.error('找不到 tideChart canvas 元素！');
        return;
    }
    
    if (!tideHourly || tideHourly.length === 0) {
        console.warn('tideHourly 数据为空，无法绘制图表');
        return;
    }

    const now = new Date();
    let currentIndex = -1, minDiff = Infinity;
    for (let i = 0; i < tideHourly.length; i++) {
        const diff = Math.abs(new Date(tideHourly[i].fxTime) - now);
        if (diff < minDiff) {
            minDiff = diff;
            currentIndex = i;
        }
    }
    if (currentIndex === -1) currentIndex = Math.floor(tideHourly.length / 2);
    
    const start = Math.max(0, currentIndex - 6);
    const end = Math.min(tideHourly.length, currentIndex + 7);
    const sliced = tideHourly.slice(start, end);
    const labels = sliced.map(item => new Date(item.fxTime).getHours() + ':00');
    const values = sliced.map(item => parseFloat(item.height));
    const highlightIndex = currentIndex - start;

    if (tideChartInstance) {
        tideChartInstance.destroy();
    }

    // 为数据集准备数组形式的 pointRadius 和 pointBackgroundColor（Chart.js v4 推荐）
    const pointRadiusArr = values.map((_, idx) => idx === highlightIndex ? 6 : 3);
    const pointBgColorArr = values.map((_, idx) => idx === highlightIndex ? '#ff0000' : '#1890ff');

    const ctx = canvas.getContext('2d');
    tideChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                borderColor: '#1890ff',
                backgroundColor: 'rgba(24,144,255,0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: pointRadiusArr,
                pointBackgroundColor: pointBgColorArr
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } }
        }
    });
}

// 初始化飞行和潮汐功能（直接调用，因为脚本在页面底部加载，DOM已就绪）
initTideFunctionality();
initFlyFunctionality();

// ==================== 飞行功能 ====================

// 初始化飞行功能
function initFlyFunctionality() {
    const flyBtn = document.getElementById('flyBtn');
    const flyPanel = document.getElementById('flyPanel');
    const closeFlyBtn = document.getElementById('closeFlyBtn');
    const flyRouteList = document.getElementById('flyRouteList');
    const stopFlyBtn = document.getElementById('stopFlyBtn');
    const pauseFlyBtn = document.getElementById('pauseFlyBtn');
    const resumeFlyBtn = document.getElementById('resumeFlyBtn');
    const speedControl = document.getElementById('speedControl');

    // 渲染飞行路径列表
    renderFlyRouteList(flyRouteList);

    // 飞行按钮点击
    flyBtn.addEventListener('click', () => {
        if (flyPanel.style.display === 'none') {
            flyPanel.style.display = 'block';
        } else {
            flyPanel.style.display = 'none';
        }
    });

    // 关闭面板
    closeFlyBtn.addEventListener('click', () => {
        flyPanel.style.display = 'none';
    });

    // 停止飞行
    stopFlyBtn.addEventListener('click', () => {
        stopFlight();
    });

    // 暂停飞行
    pauseFlyBtn.addEventListener('click', () => {
        pauseFlight();
    });

    // 继续飞行
    resumeFlyBtn.addEventListener('click', () => {
        resumeFlight();
    });

    // 速度控制按钮
    const speedBtns = document.querySelectorAll('.speed-btn');
    speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const speed = parseFloat(btn.dataset.speed);
            setFlySpeed(speed);
            // 更新按钮状态
            speedBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 视角模式按钮（v1.246：跟随/驾驶舱/自由；v1.247：回看开关）
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setViewMode(btn.dataset.view);
            updateViewBtnActive();
        });
    });
}

// 同步视角/回看按钮高亮状态
function updateViewBtnActive() {
    document.querySelectorAll('.view-btn').forEach(b => {
        const v = b.dataset.view;
        if (v === 'retro') {
            b.classList.toggle('active', flyState.retro);
        } else {
            b.classList.toggle('active', flyState.viewMode === v);
        }
    });
}

// 切换飞行视角模式（v1.246/v1.247）
// follow=跟随（飞机后上方） | cockpit=驾驶舱第一视角 | free=自由查看 | retro=回看开关（仅跟随视角生效）
function setViewMode(mode) {
    if (mode === 'retro') {
        // 回看是跟随视角下的相机方位开关，开启时强制回跟随
        flyState.retro = !flyState.retro;
        if (flyState.retro && flyState.viewMode !== 'follow') {
            flyState.viewMode = 'follow';
        }
        return;
    }
    if (!['follow', 'cockpit', 'free'].includes(mode)) return;
    flyState.viewMode = mode;
    flyState.retro = false; // 切常规视角时取消回看

    if (mode === 'follow' && flyState.active && flyState.planeEntity && !flyState.preFlight) {
        // 立即把相机归位到飞机后上方（下一帧动画循环会持续锁定）
        const pos = flyState.planeEntity.position.getValue(Cesium.JulianDate.now());
        if (pos) {
            const route = flyState.route;
            const cameraRange = route && route.isKML ? 1500 : 600;
            const cameraPitch = Cesium.Math.toRadians(route && route.isKML ? -25 : -15);
            viewer.camera.lookAt(
                pos,
                new Cesium.HeadingPitchRange(flyState.smoothHeading, cameraPitch, cameraRange)
            );
            flyState._lookAtLocked = true;
        }
    } else if (mode !== 'follow' && flyState._lookAtLocked) {
        // 切到驾驶舱/自由：解除锁定，把相机放到飞机当前位置避免视角跳变
        if (flyState.planeEntity) {
            const pos = flyState.planeEntity.position.getValue(Cesium.JulianDate.now());
            if (pos) viewer.camera.setView({ destination: pos });
        }
        resetCameraTransform();
        flyState._lookAtLocked = false;
    }
}

// 设置飞行速度
function setFlySpeed(multiplier) {
    flyState.speedMultiplier = multiplier;
    // 状态栏由 updateFlyStatus 统一刷新（含速度/剩余距离/剩余时间）
    if (flyState.active && flyState.route) {
        updateFlyStatus();
    }
}

// 渲染飞行路径列表
function renderFlyRouteList(container) {
    container.innerHTML = '';
    
    if (flyRoutes.length === 0) {
        // 显示加载状态
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'fly-route-item';
        loadingDiv.style.textAlign = 'center';
        loadingDiv.style.color = '#999';
        loadingDiv.style.cursor = 'default';
        loadingDiv.innerHTML = `<div class="route-name" style="font-size: 12px;">⏳ 正在加载KML路线...</div>`;
        container.appendChild(loadingDiv);
        return;
    }
    
    flyRoutes.forEach(route => {
        const item = document.createElement('div');
        item.className = 'fly-route-item';
        item.innerHTML = `
            <div class="route-name">${route.name}</div>
            <div class="route-info">${route.description} | 航点: ${route.waypoints.length} | 速度: ${route.speed}m/s</div>
        `;
        item.addEventListener('click', () => {
            startFlight(route);
        });
        container.appendChild(item);
    });
}

// 启动飞行
function startFlight(route) {
    // 如果之前有飞行，先停止
    if (flyState.active || flyState.preFlight) {
        stopFlight();
    }

    flyState.route = route;
    flyState.active = true;
    flyState.paused = false;
    flyState.currentSegment = 0;
    flyState.segmentProgress = 0;
    flyState.startTime = performance.now();
    flyState.lastTime = performance.now();
    flyState.speedMultiplier = 1; // 默认正常速度
    flyState.preFlightComplete = false;

    // 计算各段距离和总距离（优化：对于大量航点使用近似计算）
    flyState.segmentDistances = [];
    flyState.totalDistance = 0;
    const isKMLRoute = route.namedPoints && route.namedPoints.length > 0;
    
    if (isKMLRoute) {
        // 对于KML路线，使用近似距离计算（1度约111公里）
        for (let i = 0; i < route.waypoints.length - 1; i++) {
            const wp1 = route.waypoints[i];
            const wp2 = route.waypoints[i + 1];
            const dLon = (wp2.lon - wp1.lon) * 111000 * Math.cos((wp1.lat + wp2.lat) / 2 * Math.PI / 180);
            const dLat = (wp2.lat - wp1.lat) * 111000;
            const dist = Math.sqrt(dLon * dLon + dLat * dLat + Math.pow(wp2.height - wp1.height, 2));
            flyState.segmentDistances.push(dist);
            flyState.totalDistance += dist;
        }
    } else {
        for (let i = 0; i < route.waypoints.length - 1; i++) {
            const wp1 = route.waypoints[i];
            const wp2 = route.waypoints[i + 1];
            const dist = calculateDistance(wp1, wp2);
            flyState.segmentDistances.push(dist);
            flyState.totalDistance += dist;
        }
    }

    // 创建路径线
    createRouteLine(route);

    // 创建航点实体
    createWaypointEntities(route);

    // 创建飞机实体（起点位置）
    createPlaneEntity(route.waypoints[0]);

    // 重置视角模式为跟随 + 平滑航向同步初始切线（v1.246）
    flyState.viewMode = 'follow';
    flyState._lookAtLocked = false;
    flyState.smoothHeading = flyState._currentHeading || 0;
    flyState.retro = false;

    // 已飞轨迹橙线（v1.247 回看配套，初始仅起点）
    const startWp0 = route.waypoints[0];
    const startPos = route.isKML
        ? Cesium.Cartesian3.fromDegrees(startWp0.lon, startWp0.lat, 0)
        : Cesium.Cartesian3.fromDegrees(startWp0.lon, startWp0.lat, startWp0.height);
    flyState._flownPrefix = [startPos];
    flyState._flownSegIdx = 0;
    flyState.flownLineEntity = viewer.entities.add({
        polyline: {
            positions: [startPos],
            width: 5,
            material: Cesium.Color.ORANGE,
            clampToGround: !!route.isKML
        }
    });

    // 显示控制面板
    document.getElementById('stopFlyBtn').style.display = 'block';
    document.getElementById('pauseFlyBtn').style.display = 'block';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.getElementById('speedControl').style.display = 'block';
    document.getElementById('viewControl').style.display = 'block';
    // 重置速度按钮状态
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.speed-btn[data-speed="1"]').classList.add('active');
    // 重置视角/回看按钮状态
    updateViewBtnActive();
    document.getElementById('flyStatus').textContent = `预飞中: ${route.name}`;
    document.body.classList.add('flying');

    // 预飞阶段：从当前视角飞到起点高空（4秒过渡）
    const startWp = route.waypoints[0];
    const preFlightHeight = Math.max(startWp.height + 1000, 3000); // 起点上方1000米，至少3000米
    
    flyState.preFlight = true;
    
    // 显示第一个有名称的航点（预飞完成后显示）
    const firstNamedWp = route.waypoints.find(wp => wp.name);
    
    // 计算飞行时间提示
    const totalSeconds = flyState.totalDistance / (route.speed * flyState.speedMultiplier);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    document.getElementById('flyStatus').textContent = 
        `🚀 飞往起点... | 路径总长: ${(flyState.totalDistance/1000).toFixed(1)}km | 预计飞行: ${minutes}分${seconds}秒`;
    
    // 平滑飞到起点高空
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(startWp.lon, startWp.lat + 0.02, preFlightHeight),
        orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-30),
            roll: 0
        },
        duration: 4, // 4秒预飞
        complete: () => {
            // 预飞完成
            flyState.preFlight = false;
            flyState.preFlightComplete = true;

            // 初始相机定位按视角模式处理（v1.246）
            if (flyState.viewMode === 'follow') {
                const planePos = Cesium.Cartesian3.fromDegrees(
                    route.waypoints[0].lon,
                    route.waypoints[0].lat,
                    route.waypoints[0].height
                );
                const cameraRange = route.isKML ? 1500 : 600;
                const cameraPitch = Cesium.Math.toRadians(route.isKML ? -25 : -15);
                viewer.camera.lookAt(
                    planePos,
                    new Cesium.HeadingPitchRange(flyState.smoothHeading, cameraPitch, cameraRange)
                );
                flyState._lookAtLocked = true;
            } else {
                // 驾驶舱/自由视角：不锁定相机，由动画循环接管
                resetCameraTransform();
                flyState._lookAtLocked = false;
            }

            // 显示第一个有名称的航点
            if (firstNamedWp) {
                showWaypointLabel(firstNamedWp.name);
            }
            
            document.getElementById('flyStatus').textContent = 
                `✈️ 飞行中: ${route.name} | 总长: ${(flyState.totalDistance/1000).toFixed(1)}km`;
        }
    });

    // 开始动画（预飞阶段也启动，飞机会显示在起点等待）
    animateFlight();
}

// 计算两个航点之间的距离（考虑地球曲率的近似计算）
function calculateDistance(wp1, wp2) {
    const pos1 = Cesium.Cartesian3.fromDegrees(wp1.lon, wp1.lat, wp1.height);
    const pos2 = Cesium.Cartesian3.fromDegrees(wp2.lon, wp2.lat, wp2.height);
    return Cesium.Cartesian3.distance(pos1, pos2);
}

// 创建路径线
function createRouteLine(route) {
    // KML路线贴地显示，其他路线按高度显示
    if (route.isKML) {
        // 贴地路径：只需要经纬度，高度设为0让Cesium贴地
        const positions = route.waypoints.map(wp =>
            Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0)
        );
        flyState.routeLineEntity = viewer.entities.add({
            polyline: {
                positions: positions,
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.3,
                    color: Cesium.Color.CYAN
                }),
                clampToGround: true
            }
        });
    } else {
        // 普通路线：按飞行高度显示
        const positions = route.waypoints.map(wp =>
            Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.height)
        );
        flyState.routeLineEntity = viewer.entities.add({
            polyline: {
                positions: positions,
                width: 3,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.3,
                    color: Cesium.Color.CYAN
                }),
                clampToGround: false
            }
        });
    }
}

// 创建航点实体
function createWaypointEntities(route) {
    // 对于KML路线，waypoints数量可能很大（100+），只为命名点创建实体
    const hasNamedPoints = route.namedPoints && route.namedPoints.length > 0;
    
    if (hasNamedPoints) {
        // KML路线：命名点贴地显示
        flyState.waypointEntities = route.namedPoints.map(np => {
            return viewer.entities.add({
                id: 'named_' + np.originalName,
                position: Cesium.Cartesian3.fromDegrees(np.lon, np.lat, 0),
                point: {
                    pixelSize: 14,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                label: {
                    text: np.name,
                    font: '14px sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    backgroundColor: Cesium.Color.fromCssColorString('rgba(0,100,200,0.85)'),
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth: 2,
                    outlineColor: Cesium.Color.BLACK,
                    pixelOffset: new Cesium.Cartesian2(0, -20),
                    show: false,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
        });
    } else {
        // 普通路线：为所有航点创建实体
        flyState.waypointEntities = route.waypoints.map((wp, index) => {
            return viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.height),
                point: {
                    pixelSize: 12,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.NONE,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                label: {
                    text: wp.name,
                    font: '14px sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    backgroundColor: Cesium.Color.fromCssColorString('rgba(0,100,200,0.8)'),
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth: 2,
                    outlineColor: Cesium.Color.BLACK,
                    pixelOffset: new Cesium.Cartesian2(0, -25),
                    show: false,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    heightReference: Cesium.HeightReference.NONE,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
        });
    }
}

// 创建飞机实体（使用带朝向的箭头billboard）
function createPlaneEntity(waypoint) {
    const position = Cesium.Cartesian3.fromDegrees(waypoint.lon, waypoint.lat, waypoint.height);

    // 计算初始航向（曲线切线的地理方位角，与飞行动画一致）
    let heading = 0;
    if (flyState.route && flyState.route.waypoints.length > 1) {
        heading = getCurveHeading(flyState.route, 0);
    }

    // 飞机箭头SVG (三角形指向上方=北方，与Cesium heading 0=北方一致)
    const planeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
        '<path d="M24 4 L36 34 L24 27 L12 34 Z" fill="#ff4444" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M12 34 L36 34" stroke="#ffffff" stroke-width="2"/>' +
        '</svg>';
    
    const planeImage = 'data:image/svg+xml;base64,' + btoa(planeSvg);

    flyState.planeEntity = viewer.entities.add({
        position: position,
        billboard: {
            image: planeImage,
            width: 36,
            height: 36,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            // 使用 rotation 控制朝向（弧度），Cesium heading 0=北，SVG机头朝北
            rotation: heading,
            // alignedAxis=UNIT_Z 让 billboard 在地图平面内旋转
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            sizeInMeters: false
        }
    });

    // 保存初始航向，updatePlanePosition 中通过 rotation 属性更新
    flyState._currentHeading = heading;
}

// 显示航点标签（闪烁效果）
function showWaypointLabel(name, duration = 2000) {
    const route = flyState.route;
    if (!route) return;

    let entity = null;
    let entityIndex = -1;

    // KML路线：在namedPoints中查找
    if (route.namedPoints && route.namedPoints.length > 0) {
        const npIndex = route.namedPoints.findIndex(np => np.name === name);
        if (npIndex !== -1 && flyState.waypointEntities[npIndex]) {
            entity = flyState.waypointEntities[npIndex];
            entityIndex = npIndex;
            // 标记已触发
            route.namedPoints[npIndex].triggered = true;
        }
    } else {
        // 普通路线：在waypoints中查找
        const index = route.waypoints.findIndex(wp => wp.name === name);
        if (index !== -1 && flyState.waypointEntities[index]) {
            entity = flyState.waypointEntities[index];
            entityIndex = index;
        }
    }

    if (!entity) return;

    // 显示标签
    entity.label.show = true;
    entity.label.font = 'bold 18px sans-serif';
    entity.label.fillColor = Cesium.Color.YELLOW;
    entity.label.scale = 1.5;

    // 重置标签样式
    setTimeout(() => {
        if (entity && entity.label) {
            entity.label.font = '14px sans-serif';
            entity.label.fillColor = Cesium.Color.WHITE;
            entity.label.scale = 1.0;
        }
    }, duration);

    // 节点闪烁动画 - 使用多个脉冲
    let pulseCount = 0;
    const pulseInterval = setInterval(() => {
        if (!flyState.active) {
            clearInterval(pulseInterval);
            return;
        }
        entity.point.pixelSize = 16 + pulseCount * 4;
        entity.point.color = Cesium.Color.RED;
        setTimeout(() => {
            if (entity && entity.point) {
                entity.point.pixelSize = 14;
                entity.point.color = Cesium.Color.YELLOW;
            }
        }, 150);
        pulseCount++;
        if (pulseCount >= 3) {
            clearInterval(pulseInterval);
        }
    }, 300);
}

// 飞行动画循环
function animateFlight() {
    const now = performance.now();

    // 预飞阶段或暂停状态：只刷新时钟不推进，防止恢复瞬间 deltaTime 巨大导致飞机瞬移（回闪根因）
    if (flyState.preFlight || flyState.paused) {
        flyState.lastTime = now;
        flyState.rafId = requestAnimationFrame(animateFlight);
        return;
    }

    // 非飞行状态，停止动画
    if (!flyState.active && !flyState.preFlight) {
        return;
    }

    // deltaTime 上限 0.1s：标签页切回/卡顿后不会大步跳变
    const deltaTime = Math.min((now - flyState.lastTime) / 1000, 0.1);
    flyState.lastTime = now;

    const route = flyState.route;
    const currentSpeed = route.speed * flyState.speedMultiplier; // 应用速度倍率
    const segmentDistance = flyState.segmentDistances[flyState.currentSegment];

    // 计算当前段的进度
    if (segmentDistance > 0) {
        flyState.segmentProgress += (currentSpeed * deltaTime) / segmentDistance;
    } else {
        flyState.segmentProgress = 1;
    }

    // 如果完成当前段
    if (flyState.segmentProgress >= 1) {
        flyState.segmentProgress = 1;

        // 检查下一个航点是否有命名点
        const nextIndex = flyState.currentSegment + 1;
        if (nextIndex < route.waypoints.length) {
            const nextWp = route.waypoints[nextIndex];
            if (nextWp.name) {
                showWaypointLabel(nextWp.name);
            }
        }

        // 移动到下一段
        flyState.currentSegment++;
        flyState.segmentProgress = 0;

        // 如果完成所有段
        if (flyState.currentSegment >= route.waypoints.length - 1) {
            finishFlight();
            return;
        }
    }

    // 更新飞机位置（传入 deltaTime 用于航向帧率无关平滑）
    updatePlanePosition(deltaTime);

    // 更新状态显示
    updateFlyStatus();

    flyState.rafId = requestAnimationFrame(animateFlight);
}

// 计算曲线在某个全局进度位置的切线航向角（v1.249）
// pointMode：段内线性直飞 → 返回该段恒定方位角（稳定的关键）
// 沿线模式：向心 Catmull-Rom 数值导数，与 updatePlanePosition 完全同一条曲线
function getCurveHeading(route, globalProgress) {
    const waypoints = route.waypoints;
    const n = waypoints.length;
    if (n < 2) return 0;

    const idx = Math.min(Math.floor(globalProgress), n - 2);
    const u = Math.max(0, Math.min(1, globalProgress - idx));
    const p1 = waypoints[idx];
    const p2 = waypoints[idx + 1];

    // 按关键点飞行：段内直线，方位角恒定（段间跳变由 smoothHeading 平滑过渡）
    if (route.pointMode) {
        const dLon = (p2.lon - p1.lon) * Math.cos(p1.lat * Math.PI / 180);
        const dLat = p2.lat - p1.lat;
        if (dLon === 0 && dLat === 0) return flyState.smoothHeading || 0;
        return Math.atan2(dLon, dLat);
    }

    // 沿线模式：与插值相同的四个控制点（端点钳制）
    const p0 = waypoints[Math.max(0, idx - 1)];
    const p3 = waypoints[Math.min(n - 1, idx + 2)];
    const knots = crKnots(p0, p1, p2, p3);

    // 数值导数：中心差分（ε 取段内归一化步长）
    const eps = 0.02;
    const uA = Math.max(0, u - eps), uB = Math.min(1, u + eps);
    const lonA = crEval(knots, p0.lon, p1.lon, p2.lon, p3.lon, uA);
    const lonB = crEval(knots, p0.lon, p1.lon, p2.lon, p3.lon, uB);
    const latA = crEval(knots, p0.lat, p1.lat, p2.lat, p3.lat, uA);
    const latB = crEval(knots, p0.lat, p1.lat, p2.lat, p3.lat, uB);
    const dLon = (lonB - lonA) / (uB - uA);
    const dLat = (latB - latA) / (uB - uA);
    if (dLon === 0 && dLat === 0) return flyState.smoothHeading || 0;

    // 方位角 = atan2(东分量, 北分量)，东向需乘 cos(lat) 修正经度收敛
    const curLat = crEval(knots, p0.lat, p1.lat, p2.lat, p3.lat, u);
    const east = dLon * Math.cos(curLat * Math.PI / 180);
    return Math.atan2(east, dLat);
}

// 计算路径在某个全局进度位置的俯仰角
function getPathPitch(route, globalProgress) {
    const waypoints = route.waypoints;
    const n = waypoints.length;
    if (n < 2) return 0;

    const idx = Math.min(Math.floor(globalProgress), n - 2);
    const beforeIdx = Math.max(0, idx - 1);
    const afterIdx = Math.min(n - 1, idx + 1);

    const p1 = waypoints[beforeIdx];
    const p2 = waypoints[afterIdx];
    const dLat = (p2.lat - p1.lat) * 111000;
    const dLonM = (p2.lon - p1.lon) * 111000 * Math.cos((p1.lat + p2.lat) / 2 * Math.PI / 180);
    const dH = p2.height - p1.height;
    const horiz = Math.sqrt(dLonM * dLonM + dLat * dLat);
    return Math.atan2(dH, horiz || 1);
}

// 更新飞机位置和朝向（v1.246：Catmull-Rom 曲线插值 + 航向最短路径平滑 + 三视角相机）
function updatePlanePosition(deltaTime) {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const wp1 = route.waypoints[segIdx];
    const wp2 = route.waypoints[segIdx + 1];
    const t = flyState.segmentProgress;

    // —— 位置插值 ——
    // pointMode（按关键点飞行 v1.249）：线性插值精确过点，段间长直线航向恒定 → 最平稳
    // 沿线模式：向心 Catmull-Rom 曲线（v1.248：消除点距不均导致的过冲摇摆）
    const wp0 = route.waypoints[Math.max(0, segIdx - 1)];
    const wp3 = route.waypoints[Math.min(route.waypoints.length - 1, segIdx + 2)];
    let lon, lat, height;
    if (route.pointMode) {
        lon = wp1.lon + (wp2.lon - wp1.lon) * t;
        lat = wp1.lat + (wp2.lat - wp1.lat) * t;
        height = wp1.height + (wp2.height - wp1.height) * t;
    } else {
        const knots = crKnots(wp0, wp1, wp2, wp3);
        lon = crEval(knots, wp0.lon, wp1.lon, wp2.lon, wp3.lon, t);
        lat = crEval(knots, wp0.lat, wp1.lat, wp2.lat, wp3.lat, t);
        height = crEval(knots, wp0.height, wp1.height, wp2.height, wp3.height, t);
    }

    const newPosition = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    flyState.planeEntity.position = newPosition;

    // —— 航向平滑：曲线切线航向 → 最短路径指数逼近（防 ±180° 猛甩/回闪）——
    const globalProgress = segIdx + t;
    const targetHeading = getCurveHeading(route, globalProgress);
    // 帧率无关平滑系数：时间常数约 0.25s（约 4 帧 @60fps 收敛 95%）
    const alpha = 1 - Math.exp(-(deltaTime || 0.016) * 4);
    flyState.smoothHeading = lerpAngle(flyState.smoothHeading, targetHeading, alpha);
    const heading = flyState.smoothHeading;

    // 更新飞机朝向：使用 billboard.rotation 控制方向（弧度）
    if (flyState.planeEntity && flyState.planeEntity.billboard) {
        flyState.planeEntity.billboard.rotation = heading;
    }
    flyState._currentHeading = heading;

    // —— 三视角相机 ——
    if (flyState.viewMode === 'follow') {
        // 跟随视角：飞机后上方，用平滑航向避免相机猛甩；lookAt 允许用户拖动微调角度
        let cameraRange = route.isKML ? 1500 : 600;
        let cameraPitch = Cesium.Math.toRadians(route.isKML ? -25 : -15);
        let lookHeading = heading;
        if (flyState.retro) {
            // 回看（v1.247）：相机移到机头前方，朝后看飞机与已飞橙线轨迹
            lookHeading = normAngle(heading + Math.PI);
            cameraPitch = Cesium.Math.toRadians(-12);
            cameraRange = route.isKML ? 2500 : 900;
        }
        viewer.camera.lookAt(
            newPosition,
            new Cesium.HeadingPitchRange(lookHeading, cameraPitch, cameraRange)
        );
        flyState._lookAtLocked = true;
    } else if (flyState.viewMode === 'cockpit') {
        // 驾驶舱第一视角：相机即飞机，沿机头方向前视（解除 lookAt 锁定后 setView）
        if (flyState._lookAtLocked) {
            resetCameraTransform();
            flyState._lookAtLocked = false;
        }
        viewer.camera.setView({
            destination: newPosition,
            orientation: {
                heading: heading,
                pitch: Cesium.Math.toRadians(-8),
                roll: 0
            }
        });
    } else {
        // 自由视角：不干预相机，用户自由拖动缩放查看飞行
        if (flyState._lookAtLocked) {
            resetCameraTransform();
            flyState._lookAtLocked = false;
        }
    }

    // —— 已飞轨迹橙线实时延长（v1.247 回看配套）——
    if (flyState.flownLineEntity) {
        // 段索引前进时，把整航点追加进前缀缓存（避免每帧全量重建）
        if (flyState._flownSegIdx !== segIdx) {
            for (let i = flyState._flownSegIdx + 1; i <= segIdx; i++) {
                const wp = route.waypoints[i];
                flyState._flownPrefix.push(route.isKML
                    ? Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0)
                    : Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.height));
            }
            flyState._flownSegIdx = segIdx;
        }
        flyState.flownLineEntity.polyline.positions =
            flyState._flownPrefix.concat(newPosition);
    }
}

// 更新相机跟随（使用 trackedEntity 自动跟随，不需要每帧设置）
function updateCameraFollow() {
    // 使用 trackedEntity 时，Cesium 自动处理相机跟随
    // 这里不需要额外操作，留空以避免性能问题
    // 如果需要，可以添加平滑的视角过渡
}

// 更新飞行状态显示（v1.246：进度按距离加权 + 速度/剩余距离/剩余时间 HUD）
function updateFlyStatus() {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const segDists = flyState.segmentDistances;

    // 已飞距离 = 前面整段之和 + 当前段部分（按距离加权，比按段数平均准确）
    let flown = 0;
    for (let i = 0; i < segIdx && i < segDists.length; i++) flown += segDists[i];
    if (segIdx < segDists.length) flown += segDists[segIdx] * flyState.segmentProgress;
    const remainDist = Math.max(0, flyState.totalDistance - flown);
    const progressPct = flyState.totalDistance > 0 ? (flown / flyState.totalDistance * 100) : 0;

    // 当前速度与剩余时间
    const speedNow = route.speed * flyState.speedMultiplier;
    const remainSec = speedNow > 0 ? remainDist / speedNow : 0;
    const rMin = Math.floor(remainSec / 60);
    const rSec = Math.round(remainSec % 60);

    const currentWp = route.waypoints[segIdx];

    // 计算当前高度（线性插值）
    let currentHeight = 0;
    let currentGroundHeight = 0;
    if (segIdx < route.waypoints.length - 1) {
        const wp1 = route.waypoints[segIdx];
        const wp2 = route.waypoints[segIdx + 1];
        currentHeight = Math.round(wp1.height + (wp2.height - wp1.height) * flyState.segmentProgress);
        if (route.isKML && wp1.groundHeight !== undefined) {
            currentGroundHeight = Math.round(wp1.groundHeight + (wp2.groundHeight - wp1.groundHeight) * flyState.segmentProgress);
        }
    } else {
        currentHeight = Math.round(currentWp.height);
        if (route.isKML && currentWp.groundHeight !== undefined) {
            currentGroundHeight = Math.round(currentWp.groundHeight);
        }
    }

    // 查找最近的命名点
    let currentNamedPoint = '';
    if (route.namedPoints && route.namedPoints.length > 0) {
        for (const np of route.namedPoints) {
            if (segIdx >= np.segmentIndex - 2 && segIdx <= np.segmentIndex + 2) {
                currentNamedPoint = np.name;
                break;
            }
        }
    }

    // KML路线显示地形高度+飞行高度
    let heightText;
    if (route.isKML && currentGroundHeight > 0) {
        heightText = `地形:${currentGroundHeight}m 飞行:${currentHeight}m`;
    } else {
        heightText = `高度:${currentHeight}m`;
    }

    const remainText = rMin > 0 ? `${rMin}分${rSec}秒` : `${rSec}秒`;
    if (currentNamedPoint) {
        document.getElementById('flyStatus').textContent =
            `进度: ${progressPct.toFixed(0)}% | ${Math.round(speedNow * 3.6)}km/h | 剩余${(remainDist/1000).toFixed(1)}km/${remainText} | ${heightText} | 📍 ${currentNamedPoint}`;
    } else {
        document.getElementById('flyStatus').textContent =
            `进度: ${progressPct.toFixed(0)}% | ${Math.round(speedNow * 3.6)}km/h | 剩余${(remainDist/1000).toFixed(1)}km/${remainText} | ${heightText}`;
    }
}

// 暂停飞行
function pauseFlight() {
    if (!flyState.active) return;
    flyState.paused = true;
    document.getElementById('pauseFlyBtn').style.display = 'none';
    document.getElementById('resumeFlyBtn').style.display = 'block';
    document.getElementById('flyStatus').textContent += ' (已暂停)';
}

// 继续飞行
function resumeFlight() {
    if (!flyState.active || !flyState.paused) return;
    flyState.paused = false;
    flyState.lastTime = performance.now();
    document.getElementById('pauseFlyBtn').style.display = 'block';
    document.getElementById('resumeFlyBtn').style.display = 'none';
}

// 停止飞行
function stopFlight() {
    if (flyState.rafId) {
        cancelAnimationFrame(flyState.rafId);
        flyState.rafId = null;
    }

    // 取消相机跟踪
    viewer.trackedEntity = null;
    resetCameraTransform(); // 解除 lookAt 锁定（v1.248 兼容旧版 Cesium）
    flyState._lookAtLocked = false;
    if (flyState.planeEntity) {
        viewer.entities.remove(flyState.planeEntity);
        flyState.planeEntity = null;
    }
    if (flyState.routeLineEntity) {
        viewer.entities.remove(flyState.routeLineEntity);
        flyState.routeLineEntity = null;
    }
    if (flyState.flownLineEntity) {
        viewer.entities.remove(flyState.flownLineEntity);
        flyState.flownLineEntity = null;
    }
    flyState._flownPrefix = [];
    flyState._flownSegIdx = 0;
    flyState.waypointEntities.forEach(e => viewer.entities.remove(e));
    flyState.waypointEntities = [];

    // 重置状态
    flyState.active = false;
    flyState.preFlight = false;
    flyState.preFlightComplete = false;
    flyState.paused = false;
    flyState.route = null;
    flyState.currentSegment = 0;
    flyState.segmentProgress = 0;
    flyState.viewMode = 'follow';
    flyState.retro = false;

    // 隐藏控制面板
    document.getElementById('stopFlyBtn').style.display = 'none';
    document.getElementById('pauseFlyBtn').style.display = 'none';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.getElementById('speedControl').style.display = 'none';
    document.getElementById('viewControl').style.display = 'none';
    document.getElementById('flyStatus').textContent = '';
    document.body.classList.remove('flying');
}

// 完成飞行
function finishFlight() {
    flyState.active = false;
    if (flyState.rafId) {
        cancelAnimationFrame(flyState.rafId);
        flyState.rafId = null;
    }

    // 解除相机锁定，停留在终点上空，由用户自由浏览（v1.246：不再强制拉回初始位置）
    resetCameraTransform();
    flyState._lookAtLocked = false;
    flyState.retro = false;
    document.getElementById('stopFlyBtn').style.display = 'none';
    document.getElementById('pauseFlyBtn').style.display = 'none';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.getElementById('speedControl').style.display = 'none';
    document.getElementById('viewControl').style.display = 'none';
    const routeName = flyState.route ? flyState.route.name : '';
    document.getElementById('flyStatus').textContent =
        `✅ 飞行完成: ${routeName}（3秒后清理画面，可自由浏览）`;
    document.body.classList.remove('flying');

    // 3秒后清除实体（视角保持当前位置，不拉回初始位置）
    setTimeout(() => {
        if (flyState.planeEntity) viewer.entities.remove(flyState.planeEntity);
        if (flyState.routeLineEntity) viewer.entities.remove(flyState.routeLineEntity);
        if (flyState.flownLineEntity) viewer.entities.remove(flyState.flownLineEntity);
        flyState.waypointEntities.forEach(e => viewer.entities.remove(e));
        flyState.planeEntity = null;
        flyState.routeLineEntity = null;
        flyState.flownLineEntity = null;
        flyState._flownPrefix = [];
        flyState._flownSegIdx = 0;
        flyState.waypointEntities = [];
        flyState.route = null;
        document.getElementById('flyStatus').textContent = '';
    }, 3000);
}

// ==================== KML飞行路径解析 ====================

// 解析KML文件
async function parseKMLFile() {
    if (kmlLoadAttempted) return kmlRoute;
    kmlLoadAttempted = true;
    
    try {
        const response = await fetch('data/JILONG20260826.kml', { cache: 'no-cache' });
        if (!response.ok) throw new Error('无法加载KML文件');
        const kmlText = await response.text();
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(kmlText, 'text/xml');
        
        // 解析所有 Placemark
        const allPlacemarks = xml.getElementsByTagName('Placemark');
        const pointPlacemarks = [];
        let linePlacemark = null;
        
        for (let i = 0; i < allPlacemarks.length; i++) {
            const pm = allPlacemarks[i];
            
            // 获取 Placemark 的直接子元素 name
            const nameEl = pm.children[0];
            const pmName = nameEl ? nameEl.textContent.trim() : '';
            
            // 从 ExtendedData 中获取属性
            const extData = pm.getElementsByTagName('ExtendedData')[0];
            let type = '';
            let displayName = pmName;
            
            if (extData) {
                const dataEls = extData.getElementsByTagName('Data');
                for (let j = 0; j < dataEls.length; j++) {
                    const dataEl = dataEls[j];
                    const attrName = dataEl.getAttribute('name');
                    const valueEl = dataEl.getElementsByTagName('value')[0];
                    const value = valueEl ? valueEl.textContent.trim() : '';
                    
                    if (attrName === 'type') type = value;
                    if (attrName === '名称') displayName = value;
                }
            }
            
            // 判断是点还是线
            const hasPoint = pm.getElementsByTagName('Point').length > 0;
            const hasLineString = pm.getElementsByTagName('LineString').length > 0;
            
            if (hasPoint && type === 'Point') {
                const coordsEl = pm.getElementsByTagName('coordinates')[0];
                const coords = coordsEl ? coordsEl.textContent.trim() : '';
                if (coords) {
                    const parts = coords.split(',').map(Number);
                    pointPlacemarks.push({
                        name: displayName,
                        lon: parts[0],
                        lat: parts[1],
                        originalName: pmName
                    });
                }
            } else if (hasLineString && type === 'LineString') {
                const coordsEl = pm.getElementsByTagName('coordinates')[0];
                const coordsText = coordsEl ? coordsEl.textContent.trim() : '';
                if (coordsText) {
                    const lineCoords = coordsText.split(/\s+/).map(pair => {
                        const parts = pair.split(',').map(Number);
                        return { lon: parts[0], lat: parts[1] };
                    });
                    linePlacemark = { coords: lineCoords, name: displayName };
                }
            }
        }
        
        if (!linePlacemark || linePlacemark.coords.length === 0) {
            throw new Error('KML中未找到有效的路径线');
        }
        
        // 简化路径点（抽稀处理，避免渲染错误）
        // 原始点太多（100+），需要简化到合理数量
        const SIMPLIFY_DISTANCE = 0.0005; // 经纬度差阈值（约50米）
        const simplifiedCoords = simplifyLine(linePlacemark.coords, SIMPLIFY_DISTANCE);
        console.log(`路径简化: ${linePlacemark.coords.length} → ${simplifiedCoords.length} 个点`);
        
        // 使用简化后的坐标
        linePlacemark.coords = simplifiedCoords;
        
        // 采样地形高度：为每个路径点获取实际地形高度
        const cartographics = linePlacemark.coords.map(c => 
            Cesium.Cartographic.fromDegrees(c.lon, c.lat)
        );
        
        let terrainHeights = null;
        const terrainProvider = viewer.globe ? viewer.globe.terrainProvider : viewer.terrainProvider;
        
        try {
            // Cesium 1.233: 确保availability已就绪后再采样
            if (terrainProvider && terrainProvider.availability) {
                // 使用 Cesium.sampleTerrainMostDetailed（全局函数）
                if (typeof Cesium.sampleTerrainMostDetailed === 'function') {
                    const sampled = await Cesium.sampleTerrainMostDetailed(
                        terrainProvider, 
                        cartographics
                    );
                    terrainHeights = sampled.map(h => h.height);
                    console.log(`✅ 地形采样成功: ${terrainHeights.length}个点`);
                }
            }
        } catch (err) {
            // 静默降级，不需要警告
            console.log('地形采样降级使用估算值');
        }
        
        // 如果采样失败或不支持，使用估算高度（吉隆沟从5000m→1800m）
        if (!terrainHeights || terrainHeights.length === 0) {
            terrainHeights = cartographics.map((_, i) => {
                const t = i / (cartographics.length - 1);
                return 5000 + (1800 - 5000) * t;
            });
            console.log('📏 使用估算高度: 起点5000m → 终点1800m（线性过渡）');
        }
        
        // 构建航点：地形高度 + 飞行偏移
        const lineWaypoints = linePlacemark.coords.map((c, i) => {
            const terrainHeight = terrainHeights[i] || 3000;
            const flightHeight = terrainHeight + FLIGHT_OFFSET; // 离地200米
            return {
                lon: c.lon,
                lat: c.lat,
                height: flightHeight,
                groundHeight: terrainHeight, // 保存地形高度用于显示
                name: '',
                index: i
            };
        });
        
        // 建立点到线段的映射关系
        const namedPoints = pointPlacemarks.map(pp => {
            let minDist = Infinity;
            let segmentIdx = 0;
            for (let i = 0; i < lineWaypoints.length - 1; i++) {
                const wp1 = lineWaypoints[i];
                const wp2 = lineWaypoints[i + 1];
                const dist = pointToSegmentDistance(pp.lon, pp.lat, wp1, wp2);
                if (dist < minDist) {
                    minDist = dist;
                    segmentIdx = i;
                }
            }
            return {
                ...pp,
                segmentIndex: segmentIdx,
                triggered: false
            };
        });

        // 为命名点采样地形高度（v1.249 按点飞行模式使用）
        try {
            if (namedPoints.length && typeof Cesium.sampleTerrainMostDetailed === 'function' && terrainProvider) {
                const npCarto = namedPoints.map(np => Cesium.Cartographic.fromDegrees(np.lon, np.lat));
                const sampledNp = await Cesium.sampleTerrainMostDetailed(terrainProvider, npCarto);
                namedPoints.forEach((np, i) => { np.groundHeight = sampledNp[i].height; });
                console.log(`✅ 命名点地形采样成功: ${sampledNp.length}个点`);
            }
        } catch (err) {
            console.log('命名点地形采样降级，使用邻近线段高度');
        }
        // 降级：未采样成功的点沿用其投影线段航点的地形高度
        namedPoints.forEach(np => {
            if (np.groundHeight === undefined && np.segmentIndex < lineWaypoints.length) {
                np.groundHeight = lineWaypoints[np.segmentIndex].groundHeight;
            }
        });
        
        // 设置路径点的名称（仅在命名点所在位置标记）
        namedPoints.forEach(np => {
            if (np.segmentIndex < lineWaypoints.length) {
                lineWaypoints[np.segmentIndex].name = np.name;
                lineWaypoints[np.segmentIndex].namedPoint = true;
            }
        });
        
        kmlRoute = {
            id: 'kml_route',
            name: '🏔️ 吉隆沟泥石流路径',
            description: `KML导入路径 · 约20公里 · 离地${FLIGHT_OFFSET}m飞行`,
            speed: 50, // 约50m/s ≈ 180km/h，模拟泥石流冲击速度
            waypoints: lineWaypoints,
            namedPoints: namedPoints,
            isKML: true
        };
        
        return kmlRoute;
    } catch (error) {
        console.error('KML解析失败:', error);
        return null;
    }
}

// 计算点到线段的距离（使用经纬度近似）
function pointToSegmentDistance(plon, plat, wp1, wp2) {
    const dx = wp2.lon - wp1.lon;
    const dy = wp2.lat - wp1.lat;
    if (dx === 0 && dy === 0) {
        const dlon = plon - wp1.lon;
        const dlat = plat - wp1.lat;
        return Math.sqrt(dlon * dlon + dlat * dlat);
    }
    
    let t = ((plon - wp1.lon) * dx + (plat - wp1.lat) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    
    const projLon = wp1.lon + t * dx;
    const projLat = wp1.lat + t * dy;
    
    const dlon = plon - projLon;
    const dlat = plat - projLat;
    return Math.sqrt(dlon * dlon + dlat * dlat);
}

// 简化线函数（距离阈值法）
function simplifyLine(coords, minDistance) {
    if (coords.length <= 2) return coords;
    
    const result = [coords[0]];
    
    for (let i = 1; i < coords.length; i++) {
        const last = result[result.length - 1];
        const curr = coords[i];
        const dx = curr.lon - last.lon;
        const dy = curr.lat - last.lat;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // 保留距离大于阈值的点，或强制保留首尾点
        if (dist >= minDistance || i === coords.length - 1) {
            result.push(curr);
        }
    }
    
    // 确保至少有2个点
    if (result.length < 2) {
        result.push(coords[coords.length - 1]);
    }
    
    return result;
}

// 构造"智能航迹"路线（v1.26）——水平/垂直解耦：
//   水平：按"点夹角+距离"从 KML 线中智能提取拐点（转角累计≥阈值才保留，段间直线走廊→航向恒定不摇摆）
//   垂直：拐点间每~300m 采样地形高度（高度剖面贴地→与地形匹配）
// 飞行插值用线性（pointMode）：直线段航向恒定，只在地形真拐弯处平滑转向
function llDistM(a, b) {
    const dLon = (b.lon - a.lon) * 111000 * Math.cos(a.lat * Math.PI / 180);
    const dLat = (b.lat - a.lat) * 111000;
    return Math.sqrt(dLon * dLon + dLat * dLat);
}
function llBearing(a, b) {
    return Math.atan2((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat);
}
function angleDiffRad(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
}
// 拐点提取：转角累计≥angleThresholdDeg 且距上个保留点≥minDistM 才保留；距上个保留点≥maxDistM 强制保留（防长直线穿山）
// forceIdx：强制保留的原始索引（命名关键点），首尾点必保留
function extractTurningPoints(waypoints, angleThresholdDeg, minDistM, maxDistM, forceIdx) {
    const keep = new Set([0, waypoints.length - 1]);
    (forceIdx || []).forEach(i => { if (i > 0 && i < waypoints.length - 1) keep.add(i); });

    let lastKept = 0;
    let accAngle = 0;
    const threshold = angleThresholdDeg * Math.PI / 180;
    for (let i = 1; i < waypoints.length - 1; i++) {
        const b = waypoints[i];
        const c = waypoints[i + 1];
        if (llDistM(b, c) < 1) continue; // 跳过重叠点

        // 累计转角：上个保留点→当前点 与 当前点→下一点 的方位角差
        accAngle += angleDiffRad(llBearing(waypoints[lastKept], b), llBearing(b, c));
        const distFromLast = llDistM(waypoints[lastKept], b);

        if ((accAngle >= threshold && distFromLast >= minDistM) || distFromLast >= maxDistM) {
            keep.add(i);
            lastKept = i;
            accAngle = 0;
        }
    }
    return Array.from(keep).sort((x, y) => x - y);
}

async function buildSmartRoute() {
    if (!kmlRoute || !kmlRoute.waypoints || kmlRoute.waypoints.length < 3) return null;
    const wps = kmlRoute.waypoints;

    // 1) 智能提取拐点（命名点强制保留）
    const forceIdx = (kmlRoute.namedPoints || []).map(np => np.segmentIndex).filter(i => i < wps.length);
    const idxList = extractTurningPoints(wps, 25, 200, 2000, forceIdx);

    // 2) 拐点间按 ~300m 细分水平点（高度采样网格）
    const SUB_STEP = 300;
    const rawPts = [];
    const keyWpIdx = []; // 拐点（原idxList顺序）在新 rawPts 中的索引
    for (let k = 0; k < idxList.length - 1; k++) {
        const a = wps[idxList[k]];
        const b = wps[idxList[k + 1]];
        keyWpIdx.push(rawPts.length);
        rawPts.push({ lon: a.lon, lat: a.lat });
        const segLen = llDistM(a, b);
        const nSub = Math.max(1, Math.round(segLen / SUB_STEP));
        for (let s = 1; s < nSub; s++) {
            rawPts.push({
                lon: a.lon + (b.lon - a.lon) * s / nSub,
                lat: a.lat + (b.lat - a.lat) * s / nSub
            });
        }
    }
    const lastIdx = idxList[idxList.length - 1];
    keyWpIdx.push(rawPts.length);
    rawPts.push({ lon: wps[lastIdx].lon, lat: wps[lastIdx].lat });

    // 3) 全点贴地采样地形高度（一次批量）
    const waypoints = rawPts.map(p => ({
        lon: p.lon, lat: p.lat,
        groundHeight: 0, height: 0,
        name: '', index: 0
    }));
    try {
        const carto = waypoints.map(w => Cesium.Cartographic.fromDegrees(w.lon, w.lat));
        const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, carto);
        waypoints.forEach((w, i) => {
            w.groundHeight = sampled[i].height;
            w.height = w.groundHeight + FLIGHT_OFFSET;
        });
    } catch (e) {
        console.log('智能航迹地形采样失败：', e);
        return null;
    }

    // 4) 命名关键点映射到新航点索引（HUD 提示 + 航点标记复用）
    const namedPoints = (kmlRoute.namedPoints || []).map(np => {
        const orig = np.segmentIndex;
        let nearest = 0, best = Infinity;
        keyWpIdx.forEach((wi, k) => {
            const d = Math.abs(idxList[k] - orig);
            if (d < best) { best = d; nearest = k; }
        });
        const wpIdx = keyWpIdx[nearest];
        if (wpIdx < waypoints.length) {
            waypoints[wpIdx].name = np.name || waypoints[wpIdx].name;
        }
        return {
            name: np.name,
            lon: wps[orig] ? wps[orig].lon : np.lon,
            lat: wps[orig] ? wps[orig].lat : np.lat,
            originalName: np.originalName,
            segmentIndex: wpIdx,
            triggered: false
        };
    });

    // 估算里程
    let totalKm = 0;
    for (let i = 0; i < waypoints.length - 1; i++) totalKm += llDistM(waypoints[i], waypoints[i + 1]);
    totalKm = Math.round(totalKm / 100) / 10;

    return {
        id: 'kml_smart_route',
        name: '🧭 吉隆沟智能航迹',
        description: `智能提取${idxList.length}个地形拐点（${waypoints.length}个贴地航点·约${totalKm}公里）· 直线走廊+贴地高度 · 平稳`,
        speed: 50,
        waypoints: waypoints.map((w, i) => ({ ...w, index: i })),
        namedPoints,
        isKML: true,     // 贴地渲染与 KML 相机参数
        pointMode: true  // 线性插值：直线段航向恒定
    };
}

// 构造"按关键点飞行"路线（v1.249）
// 用 KML 中的命名关键点（如6个）做点对点直飞：段间长直线、航向恒定，只过点时平滑转向，彻底避免沿线插值的摇摆
function buildPointRoute() {
    if (!kmlRoute || !kmlRoute.namedPoints || kmlRoute.namedPoints.length < 2) return null;

    const waypoints = kmlRoute.namedPoints.map((np, i) => ({
        lon: np.lon,
        lat: np.lat,
        height: (np.groundHeight !== undefined ? np.groundHeight : 0) + FLIGHT_OFFSET,
        groundHeight: np.groundHeight,
        name: np.name || '',
        index: i
    }));

    // 估算总里程用于描述
    let totalKm = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        const dLon = (waypoints[i + 1].lon - waypoints[i].lon) * 111000 * Math.cos(waypoints[i].lat * Math.PI / 180);
        const dLat = (waypoints[i + 1].lat - waypoints[i].lat) * 111000;
        totalKm += Math.sqrt(dLon * dLon + dLat * dLat);
    }
    totalKm = Math.round(totalKm / 100) / 10;

    return {
        id: 'kml_point_route',
        name: '📍 吉隆沟关键点飞行',
        description: `按KML关键点直飞（${waypoints.length}个点·约${totalKm}公里）· 点间直线 · 最平稳`,
        speed: 50,
        waypoints,
        // 关键点即航点：namedPoints 供 HUD 提示与航点标记，segmentIndex=航点索引
        namedPoints: kmlRoute.namedPoints.map((np, i) => ({
            name: np.name,
            lon: np.lon,
            lat: np.lat,
            originalName: np.originalName,
            segmentIndex: i,
            triggered: false
        })),
        isKML: true,     // 沿用贴地渲染与 KML 相机参数
        pointMode: true  // 线性插值直飞标志（updatePlanePosition/getCurveHeading 分支）
    };
}

// KML路线专用的飞行初始化
async function initKMLRoute() {
    try {
        kmlLoading = true;
        const routeList = document.getElementById('flyRouteList');

        // 先显示加载状态
        renderFlyRouteList(routeList);

        // 解析KML文件
        await parseKMLFile();

        // 添加到路线列表
        if (kmlRoute && !flyRoutes.find(r => r.id === 'kml_route')) {
            flyRoutes.push(kmlRoute);
            // 同时提供"按关键点飞行"模式（v1.249：点对点直飞，更平稳）
            const pointRoute = buildPointRoute();
            if (pointRoute) flyRoutes.push(pointRoute);
            renderFlyRouteList(routeList);

            // 智能航迹（v1.26：拐点提取+贴地采样，异步构建完成后加入列表）
            buildSmartRoute().then(smart => {
                if (smart && !flyRoutes.find(r => r.id === 'kml_smart_route')) {
                    flyRoutes.push(smart);
                    renderFlyRouteList(routeList);
                    console.log(`✅ 智能航迹构建完成: ${smart.description}`);
                }
            }).catch(e => console.log('智能航迹构建失败:', e));

            // 加载成功后自动定位到KML路径区域（吉隆沟）
            // 延时1秒等待初始加载的视角完成
            setTimeout(() => {
                flyToKMLRoute(kmlRoute);
            }, 1000);
        }
        
        // 如果KML加载失败
        if (!kmlRoute) {
            console.error('KML路线加载失败');
            routeList.innerHTML = '<div class="fly-route-item" style="text-align:center;color:#ff4d4f;cursor:pointer;" id="retryLoadKML"><div class="route-name" style="font-size:12px;">❌ KML加载失败，点击重试</div></div>';
            const retryBtn = document.getElementById('retryLoadKML');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    // 重置加载状态，重试
                    kmlLoadAttempted = false;
                    kmlRoute = null;
                    initKMLRoute();
                });
            }
        }
    } catch (error) {
        console.error('初始化KML路线时出错:', error);
    } finally {
        kmlLoading = false;
    }
}

// 飞到KML路径区域查看
function flyToKMLRoute(route) {
    if (!route || !route.waypoints || route.waypoints.length === 0) return;
    
    // 计算路径的中心位置和范围
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    route.waypoints.forEach(wp => {
        minLon = Math.min(minLon, wp.lon);
        maxLon = Math.max(maxLon, wp.lon);
        minLat = Math.min(minLat, wp.lat);
        maxLat = Math.max(maxLat, wp.lat);
    });
    
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    
    // 计算路径长度估算（度）
    const spanLon = maxLon - minLon;
    const spanLat = maxLat - minLat;
    const maxSpan = Math.max(spanLon, spanLat);
    
    // 根据范围计算合适的飞行高度
    const viewHeight = Math.max(5000, maxSpan * 111000 * 3); // 3倍范围
    
    console.log(`🎯 定位到KML路径中心: ${centerLon.toFixed(4)}, ${centerLat.toFixed(4)}`);
    console.log(`📏 路径范围: ${spanLon.toFixed(3)}° × ${spanLat.toFixed(3)}°`);
    
    // 平滑飞到路径中心上方
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, viewHeight),
        orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-45),
            roll: 0
        },
        duration: 3
    });
}
