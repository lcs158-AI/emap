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
    initKMLRoute(); // 异步加载KML路线
});

// ==================== 飞行功能 ====================
// 飞行路径数据存储（初始为空，KML路线通过异步加载）
const flyRoutes = [];

// 加载状态提示
let kmlLoading = false;

// 飞行状态变量
let flyState = {
    active: false,          // 是否正在飞行
    preFlight: false,       // 是否处于预飞阶段（飞到起点）
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
    segmentDistances: [],   // 各段距离
    speedMultiplier: 1,     // 速度倍率
    preFlightComplete: false // 预飞是否完成
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
}

// 设置飞行速度
function setFlySpeed(multiplier) {
    flyState.speedMultiplier = multiplier;
    // 更新状态显示
    if (flyState.active && flyState.route) {
        const totalSeconds = flyState.totalDistance / (flyState.route.speed * multiplier);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.round(totalSeconds % 60);
        const progress = ((flyState.currentSegment + flyState.segmentProgress) / 
            (flyState.route.waypoints.length - 1) * 100).toFixed(0);
        document.getElementById('flyStatus').textContent = 
            `进度: ${progress}% | 速度: ${multiplier}x | 预计剩余: ${minutes}分${seconds}秒`;
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

    // 显示控制面板
    document.getElementById('stopFlyBtn').style.display = 'block';
    document.getElementById('pauseFlyBtn').style.display = 'block';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.getElementById('speedControl').style.display = 'block';
    // 重置速度按钮状态
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.speed-btn[data-speed="1"]').classList.add('active');
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
            
            // 让相机跟随飞机
            viewer.trackedEntity = flyState.planeEntity;
            
            // 根据路线类型调整相机距离
            const isHighAltitude = route.waypoints.some(wp => wp.height > 3000);
            const cameraRange = isHighAltitude ? 800 : 500;
            const cameraPitch = isHighAltitude ? Cesium.Math.toRadians(-20) : Cesium.Math.toRadians(-15);
            
            // 设置相机视角参数
            const planePos = flyState.planeEntity.position;
            viewer.camera.lookAt(
                planePos,
                new Cesium.HeadingPitchRange(0, cameraPitch, cameraRange)
            );

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
    // 预飞阶段或暂停状态
    if (flyState.preFlight || flyState.paused) {
        flyState.rafId = requestAnimationFrame(animateFlight);
        return;
    }
    
    // 非飞行状态，停止动画
    if (!flyState.active && !flyState.preFlight) {
        return;
    }

    const now = performance.now();
    const deltaTime = (now - flyState.lastTime) / 1000; // 转换为秒
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

    // 更新飞机位置
    updatePlanePosition();

    // 更新相机跟随（使用 trackedEntity，无需额外操作）

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

// 更新相机跟随（使用 trackedEntity 自动跟随，不需要每帧设置）
function updateCameraFollow() {
    // 使用 trackedEntity 时，Cesium 自动处理相机跟随
    // 这里不需要额外操作，留空以避免性能问题
    // 如果需要，可以添加平滑的视角过渡
}

// 更新飞行状态显示
function updateFlyStatus() {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const progress = ((segIdx + flyState.segmentProgress) / (route.waypoints.length - 1) * 100).toFixed(0);
    const currentWp = route.waypoints[segIdx];
    
    // 计算当前高度（线性插值）
    let currentHeight = 0;
    if (segIdx < route.waypoints.length - 1) {
        const wp1 = route.waypoints[segIdx];
        const wp2 = route.waypoints[segIdx + 1];
        currentHeight = Math.round(wp1.height + (wp2.height - wp1.height) * flyState.segmentProgress);
    } else {
        currentHeight = Math.round(currentWp.height);
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

    if (currentNamedPoint) {
        document.getElementById('flyStatus').textContent =
            `进度: ${progress}% | 高度: ${currentHeight}m | 📍 ${currentNamedPoint}`;
    } else {
        document.getElementById('flyStatus').textContent =
            `进度: ${progress}% | 高度: ${currentHeight}m | 飞行中...`;
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
    flyState.preFlight = false;
    flyState.preFlightComplete = false;
    flyState.paused = false;
    flyState.route = null;
    flyState.currentSegment = 0;
    flyState.segmentProgress = 0;

    // 隐藏控制面板
    document.getElementById('stopFlyBtn').style.display = 'none';
    document.getElementById('pauseFlyBtn').style.display = 'none';
    document.getElementById('resumeFlyBtn').style.display = 'none';
    document.getElementById('speedControl').style.display = 'none';
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
    document.getElementById('speedControl').style.display = 'none';
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

// ==================== KML飞行路径解析 ====================
// 存储解析后的KML路线
let kmlRoute = null;
let kmlLoadAttempted = false;

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
            const nameEl = pm.children[0]; // 第一个子元素通常是 <name>
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
        
        // 为路径线添加高度 - 根据吉隆沟地形特点，从5000米平缓降至1800米
        // 地形从起点约5000m降至终点约1800m，飞行高度在地形基础上保持约200m的飞行高度
        const pointCount = linePlacemark.coords.length;
        const startHeight = 5200;  // 起点飞行高度（地形5000m + 200m）
        const endHeight = 2000;    // 终点飞行高度（地形1800m + 200m）
        
        const lineWaypoints = linePlacemark.coords.map((c, i) => {
            // 使用三次曲线平滑过渡，使飞行高度变化更自然
            const t = i / (pointCount - 1);
            // 使用 ease-in-out 曲线，使高度变化在两端平缓
            const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const height = startHeight + (endHeight - startHeight) * easeT;
            
            return {
                lon: c.lon,
                lat: c.lat,
                height: height,
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
            description: 'KML导入路径 · 约20公里 · 7分钟冲击',
            speed: 50, // 约50m/s ≈ 180km/h，模拟泥石流冲击速度
            waypoints: lineWaypoints,
            namedPoints: namedPoints
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
            renderFlyRouteList(routeList);
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
