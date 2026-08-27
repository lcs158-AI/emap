// ==================== 初始化 Cesium ====================
// 设置 Cesium Ion 默认 token（已填回）
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3NzVhMzE5My0zNWU2LTQ1ZDYtYTI2MC05N2EzOTBhNDgxYzgiLCJpZCI6NDA3MDg1LCJpYXQiOjE3NzQxMDMyNjV9.PLB9fgVKv_MZLTFwzwMOea4W2uaAT8MT1w0pYcFuRZU';

// 设置 Cesium Ion Token（仍用于地形等，但底图已禁用）


// 创建 Viewer，完全禁用默认底图，仅使用自定义影像
const viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false,          // 隐藏底图选择器
    imageryProvider: false,          // 关键！禁用默认的 Cesium Ion 影像
    //terrainProvider: new Cesium.EllipsoidTerrainProvider(), // 平面地形（可后续升级）
    terrain: Cesium.Terrain.fromWorldTerrain({
        maximumLevel: 12           // 限制最大级别为12（值越小加载越快，细节越少）
        //terrainExaggeration: 0.3    // 降低地形夸张程度，让市区更平滑（默认1.0）
    }),
    animation: false,                // 隐藏动画控件
    timeline: false,                 // 隐藏时间线
    infoBox: false,                  // 隐藏信息框
    selectionIndicator: false,       // 隐藏选中指示器
    navigationHelpButton: false,     // 隐藏导航帮助按钮
    homeButton: false,               // 隐藏主页按钮
    fullscreenButton: false,         // 隐藏全屏按钮
    skyBox: false,                   // 禁用星空背景
    skyAtmosphere: false             // 禁用大气效果（减少请求）
});

// ==================== 添加影像底图 ====================
// 使用 Esri World Imagery（与平面地图一致）
const esriImagery = new Cesium.UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    tilingScheme: new Cesium.WebMercatorTilingScheme()
});
viewer.imageryLayers.addImageryProvider(esriImagery);


// 切换标注按钮的事件（已在原有代码中定义，无需重复）
// document.getElementById('toggleAnnotationBtn').addEventListener('click', () => {
//     annotationLayer.show = !annotationLayer.show;
//     document.getElementById('toggleAnnotationBtn').classList.toggle('active');
// });

let userLocationVisible = false;
// 默认底图自动加载，不需要手动添加 IonImageryProvider
// 直接叠加天地图注记层（默认隐藏）
const tiandituAnnotation = new Cesium.UrlTemplateImageryProvider({
    url: `https://t0.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maximumLevel: 18,
    tilingScheme: new Cesium.WebMercatorTilingScheme()
});
const annotationLayer = viewer.imageryLayers.addImageryProvider(tiandituAnnotation);
annotationLayer.show = false; // 默认隐藏

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

// 添加或更新用户位置蓝点（永久显示）
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

// 切换标注按钮
document.getElementById('toggleAnnotationBtn').addEventListener('click', () => {
    annotationLayer.show = !annotationLayer.show;
    document.getElementById('toggleAnnotationBtn').classList.toggle('active');
});

// ==================== 启动后跳转到指定位置 ====================
if (initCenter && initCenter.length >= 4) {
    const [lon, lat, height, pitch] = initCenter;
    flyToLocation(lon, lat, height, pitch);
    //updateUserLocation(lon, lat);   // 可同时显示蓝点（可选）
} else {
    flyToLocation(113.5, 22.5, 20000, 45);
}

// ==================== 照片点实体 ====================
const entities = [];
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

// 悬浮提示
let lastHighlighted = null;
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

// 点击弹出照片
viewer.screenSpaceEventHandler.setInputAction(function (click) {
    const picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && picked.id && picked.id.properties) {
        const props = picked.id.properties;
        const imgSrc = `/pics/${props.MC}`;
        alert(`${props.DD}\n图片路径: ${imgSrc}\n(请确保图片存在)`);
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


// ==================== 定位功能 ====================
// 定位按钮点击事件
document.getElementById('locateBtn').addEventListener('click', () => {
    if (userLocationVisible) {
        // 隐藏蓝点
        const existing = viewer.entities.getById('userLocation');
        if (existing) viewer.entities.remove(existing);
        userLocationVisible = false;
        document.getElementById('locateBtn').classList.remove('active');
    } else {
        // 显示蓝点并定位
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

// ==================== 测量功能 ====================
let measureActive = false;
let points = [];           // 存储点坐标及位置
let tempEntities = [];     // 存储所有临时实体（点、线）
let totalDistance = 0;     // 当前折线总长度（米）
const measureResultDiv = document.getElementById('measureResult');

document.getElementById('measureBtn').addEventListener('click', () => {
    if (measureActive) {
        // 退出测量模式：清除所有临时实体，重置状态
        tempEntities.forEach(e => viewer.entities.remove(e));
        tempEntities = [];
        points = [];
        totalDistance = 0;
        measureResultDiv.style.display = 'none';
        document.getElementById('measureBtn').classList.remove('active');
        measureActive = false;
    } else {
        // 进入测量模式
        measureActive = true;
        measureResultDiv.style.display = 'block';
        measureResultDiv.textContent = '单击添加点，双击结束当前线段';
        document.getElementById('measureBtn').classList.add('active');
        // 清空旧数据（以防残留）
        tempEntities.forEach(e => viewer.entities.remove(e));
        tempEntities = [];
        points = [];
        totalDistance = 0;
    }
});

// 添加点并更新折线
function addMeasurePoint(cartesian, lon, lat) {
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

    // 如果已有前一个点，添加线段并累计长度
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
        // 计算新线段长度并累加
        const segmentLength = Cesium.Cartesian3.distance(prev.cartesian, cartesian);
        totalDistance += segmentLength;
        measureResultDiv.textContent = `总长度: ${totalDistance.toFixed(1)} 米`;
    }

    points.push({ cartesian, lon, lat });
}

// 单击添加点
viewer.screenSpaceEventHandler.setInputAction(function (click) {
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

// 双击结束当前线段（清除点线，但保持测量模式）
viewer.screenSpaceEventHandler.setInputAction(function () {
    if (measureActive) {
        tempEntities.forEach(e => viewer.entities.remove(e));
        tempEntities = [];
        points = [];
        totalDistance = 0;
        measureResultDiv.textContent = '单击添加点，双击结束当前线段';
    }
}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

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

document.addEventListener('DOMContentLoaded', () => {
    initTideFunctionality();
    initFlyFunctionality();
});

// ==================== 飞行功能 ====================
// 飞行路径数据：每个路径包含多个航点（经度、纬度、高度、名称）
const flyRoutes = [
    {
        id: 'route1',
        name: '🗺️ 博贺湾沿海观光',
        description: '沿海岸线飞行，欣赏博贺湾美景',
        speed: 200, // 飞行速度 (米/秒)
        waypoints: [
            { lon: 111.116915, lat: 21.467190, height: 500, name: '滨海旅游公路' },
            { lon: 111.130000, lat: 21.470000, height: 600, name: '海岸观景点' },
            { lon: 111.150000, lat: 21.475000, height: 700, name: '海岛远眺' },
            { lon: 111.180000, lat: 21.480000, height: 800, name: '海湾中心' },
            { lon: 111.212202, lat: 21.483160, height: 600, name: '博贺湾大酒店' }
        ]
    },
    {
        id: 'route2',
        name: '🏔️ 地形探索飞行',
        description: '穿越起伏地形，体验3D地貌',
        speed: 300,
        waypoints: [
            { lon: 111.100000, lat: 21.450000, height: 800, name: '起点高地' },
            { lon: 111.120000, lat: 21.460000, height: 1000, name: '山谷航点' },
            { lon: 111.150000, lat: 21.470000, height: 1200, name: '山峰观测' },
            { lon: 111.180000, lat: 21.485000, height: 900, name: '下坡航点' },
            { lon: 111.220000, lat: 21.500000, height: 700, name: '终点平原' }
        ]
    },
    {
        id: 'route3',
        name: '🌅 日出东方航线',
        description: '从西向东飞行，模拟日出方向',
        speed: 250,
        waypoints: [
            { lon: 111.100000, lat: 21.480000, height: 600, name: '西部起点' },
            { lon: 111.130000, lat: 21.482000, height: 700, name: '中段高点' },
            { lon: 111.160000, lat: 21.483000, height: 800, name: '观景平台' },
            { lon: 111.190000, lat: 21.484000, height: 750, name: '东部航点' },
            { lon: 111.220000, lat: 21.485000, height: 650, name: '东岸终点' }
        ]
    }
];

// 飞行状态变量
let flyState = {
    active: false,          // 是否正在飞行
    paused: false,          // 是否暂停
    route: null,            // 当前飞行路径
    currentSegment: 0,      // 当前段索引
    segmentProgress: 0,     // 当前段进度 (0-1)
    startTime: 0,           // 动画起始时间
    lastTime: 0,            // 上一帧时间
    planeEntity: null,      // 飞机实体
    routeLineEntity: null,  // 路径线实体
    waypointEntities: [],   // 航点实体
    rafId: null,            // requestAnimationFrame ID
    totalDistance: 0,       // 路径总距离
    segmentDistances: []    // 各段距离
};

// 初始化飞行功能
function initFlyFunctionality() {
    const flyBtn = document.getElementById('flyBtn');
    const flyPanel = document.getElementById('flyPanel');
    const closeFlyBtn = document.getElementById('closeFlyBtn');
    const flyRouteList = document.getElementById('flyRouteList');
    const stopFlyBtn = document.getElementById('stopFlyBtn');
    const pauseFlyBtn = document.getElementById('pauseFlyBtn');
    const resumeFlyBtn = document.getElementById('resumeFlyBtn');

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
}

// 渲染飞行路径列表
function renderFlyRouteList(container) {
    container.innerHTML = '';
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
    if (flyState.active) {
        stopFlight();
    }

    flyState.route = route;
    flyState.active = true;
    flyState.paused = false;
    flyState.currentSegment = 0;
    flyState.segmentProgress = 0;
    flyState.startTime = performance.now();
    flyState.lastTime = performance.now();

    // 计算各段距离和总距离
    flyState.segmentDistances = [];
    flyState.totalDistance = 0;
    for (let i = 0; i < route.waypoints.length - 1; i++) {
        const wp1 = route.waypoints[i];
        const wp2 = route.waypoints[i + 1];
        const dist = calculateDistance(wp1, wp2);
        flyState.segmentDistances.push(dist);
        flyState.totalDistance += dist;
    }

    // 创建路径线
    createRouteLine(route);

    // 创建航点实体
    createWaypointEntities(route);

    // 创建飞机实体
    createPlaneEntity(route.waypoints[0]);

    // 让相机跟随飞机
    viewer.trackedEntity = flyState.planeEntity;
    
    // 设置相机视角参数
    const planePos = flyState.planeEntity.position;
    viewer.camera.lookAt(
        planePos,
        new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-15), 400)
    );

    // 显示控制面板
    document.getElementById('stopFlyBtn').style.display = 'block';
    document.getElementById('pauseFlyBtn').style.display = 'block';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.getElementById('flyStatus').textContent = `飞行中: ${route.name}`;
    document.body.classList.add('flying');

    // 显示第一个航点名称
    showWaypointLabel(route.waypoints[0].name);

    // 开始动画
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

// 创建航点实体
function createWaypointEntities(route) {
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

// 创建飞机实体（使用点和标签表示）
function createPlaneEntity(waypoint) {
    const position = Cesium.Cartesian3.fromDegrees(waypoint.lon, waypoint.lat, waypoint.height);

    flyState.planeEntity = viewer.entities.add({
        position: position,
        point: {
            pixelSize: 16,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: Cesium.HeightReference.NONE
        },
        label: {
            text: '✈️',
            font: '28px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -20),
            show: true,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: Cesium.HeightReference.NONE,
            scale: 1.0
        }
    });
}

// 显示航点标签（闪烁效果）
function showWaypointLabel(name, duration = 2000) {
    const route = flyState.route;
    if (!route) return;

    // 找到对应的航点实体
    const index = route.waypoints.findIndex(wp => wp.name === name);
    if (index === -1 || !flyState.waypointEntities[index]) return;

    const entity = flyState.waypointEntities[index];

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
        if (!flyState.active || flyState.currentSegment <= index - 1) {
            clearInterval(pulseInterval);
            return;
        }
        entity.point.pixelSize = 16 + pulseCount * 4;
        entity.point.color = Cesium.Color.RED;
        setTimeout(() => {
            if (entity && entity.point) {
                entity.point.pixelSize = 12;
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
    if (!flyState.active || flyState.paused) {
        flyState.rafId = requestAnimationFrame(animateFlight);
        return;
    }

    const now = performance.now();
    const deltaTime = (now - flyState.lastTime) / 1000; // 转换为秒
    flyState.lastTime = now;

    const route = flyState.route;
    const currentSpeed = route.speed; // 米/秒
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

        // 显示下一个航点的标签
        const nextIndex = flyState.currentSegment + 1;
        if (nextIndex < route.waypoints.length) {
            showWaypointLabel(route.waypoints[nextIndex].name);
        }

        // 移动到下一段
        flyState.currentSegment++;
        flyState.segmentProgress = 0;

        // 如果完成所有段
        if (flyState.currentSegment >= route.waypoints.length - 1) {
            // 飞行完成
            finishFlight();
            return;
        }
    }

    // 更新飞机位置
    updatePlanePosition();

    // 更新相机跟随
    updateCameraFollow();

    // 更新状态显示
    updateFlyStatus();

    flyState.rafId = requestAnimationFrame(animateFlight);
}

// 更新飞机位置（在当前段的两个航点之间插值）
function updatePlanePosition() {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const wp1 = route.waypoints[segIdx];
    const wp2 = route.waypoints[segIdx + 1];
    const t = flyState.segmentProgress;

    // 计算插值位置（使用球面线性插值的近似）
    const lon = wp1.lon + (wp2.lon - wp1.lon) * t;
    const lat = wp1.lat + (wp2.lat - wp1.lat) * t;
    const height = wp1.height + (wp2.height - wp1.height) * t;

    const newPosition = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    flyState.planeEntity.position = newPosition;
}

// 更新相机跟随（使用 trackedEntity 自动跟随，这里只更新航向）
function updateCameraFollow() {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const wp1 = route.waypoints[segIdx];
    const wp2 = route.waypoints[segIdx + 1];

    // 计算航向角
    const dirLon = wp2.lon - wp1.lon;
    const dirLat = wp2.lat - wp1.lat;
    const heading = Math.atan2(dirLat, dirLon);

    // 如果使用 trackedEntity，不需要更新相机位置
    // 但可以更新相机朝向
    if (viewer.trackedEntity === flyState.planeEntity) {
        const planePos = flyState.planeEntity.position;
        viewer.camera.lookAt(
            planePos,
            new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-15), 400)
        );
    }
}

// 更新飞行状态显示
function updateFlyStatus() {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const progress = ((segIdx + flyState.segmentProgress) / (route.waypoints.length - 1) * 100).toFixed(0);
    const currentWp = route.waypoints[segIdx];
    const nextWp = route.waypoints[segIdx + 1];

    document.getElementById('flyStatus').textContent =
        `进度: ${progress}% | 当前: ${currentWp.name} → 下一: ${nextWp ? nextWp.name : '终点'}`;
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

    // 移除所有飞行实体
    if (flyState.planeEntity) {
        viewer.entities.remove(flyState.planeEntity);
        flyState.planeEntity = null;
    }
    if (flyState.routeLineEntity) {
        viewer.entities.remove(flyState.routeLineEntity);
        flyState.routeLineEntity = null;
    }
    flyState.waypointEntities.forEach(e => viewer.entities.remove(e));
    flyState.waypointEntities = [];

    // 重置状态
    flyState.active = false;
    flyState.paused = false;
    flyState.route = null;
    flyState.currentSegment = 0;
    flyState.segmentProgress = 0;

    // 隐藏控制面板
    document.getElementById('stopFlyBtn').style.display = 'none';
    document.getElementById('pauseFlyBtn').style.display = 'none';
    document.getElementById('resumeFlyBtn').style.display = 'none';
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

    // 取消相机跟踪
    viewer.trackedEntity = null;

    document.getElementById('flyStatus').textContent = '✅ 飞行完成！';
    document.getElementById('stopFlyBtn').style.display = 'none';
    document.getElementById('pauseFlyBtn').style.display = 'none';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.body.classList.remove('flying');

    // 3秒后清除实体
    setTimeout(() => {
        if (flyState.planeEntity) viewer.entities.remove(flyState.planeEntity);
        if (flyState.routeLineEntity) viewer.entities.remove(flyState.routeLineEntity);
        flyState.waypointEntities.forEach(e => viewer.entities.remove(e));
        flyState.planeEntity = null;
        flyState.routeLineEntity = null;
        flyState.waypointEntities = [];
        flyState.route = null;

        // 飞行完成后，用flyTo回到初始位置
        if (initCenter && initCenter.length >= 4) {
            const [lon, lat, height, pitch] = initCenter;
            flyToLocation(lon, lat, height, pitch);
        }
    }, 3000);
}
