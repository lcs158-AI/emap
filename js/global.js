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
    preFlightComplete: false
};

// KML路线相关变量
let kmlRoute = null;
let kmlLoadAttempted = false;
const FLIGHT_OFFSET = 200;

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
            
            // 不使用 trackedEntity（与 lookAt 冲突会导致卡顿）
            // 改为在 updatePlanePosition 中手动控制相机跟随
            
            // 初始相机定位：在飞机后上方
            const planePos = Cesium.Cartesian3.fromDegrees(
                route.waypoints[0].lon, 
                route.waypoints[0].lat, 
                route.waypoints[0].height
            );
            const cameraRange = route.isKML ? 1500 : 600;
            const cameraPitch = Cesium.Math.toRadians(route.isKML ? -25 : -15);
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

    // 计算初始朝向（使用真实地理方位角）
    let heading = 0;
    if (flyState.route && flyState.route.waypoints.length > 1) {
        const wp2 = flyState.route.waypoints[1];
        const dLonRad = (wp2.lon - waypoint.lon) * Math.PI / 180;
        const lat1Rad = waypoint.lat * Math.PI / 180;
        const lat2Rad = wp2.lat * Math.PI / 180;
        const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);
        heading = Math.atan2(y, x);
    }

    // 飞机箭头SVG (三角形指向右边为机头方向)
    const planeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
        '<path d="M24 6 L38 30 L24 25 L10 30 Z" fill="#ff4444" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M24 12 L24 36" stroke="#ffffff" stroke-width="2"/>' +
        '</svg>';
    
    const planeImage = 'data:image/svg+xml;base64,' + btoa(planeSvg);

    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
    const quaternion = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

    flyState.planeEntity = viewer.entities.add({
        position: position,
        billboard: {
            image: planeImage,
            width: 36,
            height: 36,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            sizeInMeters: false
        },
        // 使用 orientation 属性让 billboard 跟随地球表面朝向
        orientation: quaternion
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

// 更新飞机位置和朝向
function updatePlanePosition() {
    const route = flyState.route;
    const segIdx = flyState.currentSegment;
    const wp1 = route.waypoints[segIdx];
    const wp2 = route.waypoints[segIdx + 1];
    const t = flyState.segmentProgress;

    // 计算插值位置
    const lon = wp1.lon + (wp2.lon - wp1.lon) * t;
    const lat = wp1.lat + (wp2.lat - wp1.lat) * t;
    const height = wp1.height + (wp2.height - wp1.height) * t;

    const newPosition = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    flyState.planeEntity.position = newPosition;

    // 计算航向（使用真实地理方位角，不是经纬度平面角）
    // 方位角公式：bearing = atan2(sin(Δlon)·cos(lat2), cos(lat1)·sin(lat2) − sin(lat1)·cos(lat2)·cos(Δlon))
    const dLon = (wp2.lon - wp1.lon) * Math.PI / 180;
    const lat1Rad = wp1.lat * Math.PI / 180;
    const lat2Rad = wp2.lat * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const heading = Math.atan2(y, x);

    // 俯仰角：根据高度变化
    const dLat = (wp2.lat - wp1.lat) * 111000;
    const dLonMeters = (wp2.lon - wp1.lon) * 111000 * Math.cos((wp1.lat + wp2.lat) / 2 * Math.PI / 180);
    const dHeight = wp2.height - wp1.height;
    const horizontalDist = Math.sqrt(dLonMeters * dLonMeters + dLat * dLat);
    const pitch = Math.atan2(dHeight, horizontalDist || 1);

    // 更新飞机朝向
    const hpr = new Cesium.HeadingPitchRoll(heading, pitch, 0);
    flyState.planeEntity.orientation = Cesium.Transforms.headingPitchRollQuaternion(newPosition, hpr);

    // 手动更新相机跟随（在飞机后上方）
    const cameraRange = route.isKML ? 1500 : 600;
    const cameraPitch = Cesium.Math.toRadians(route.isKML ? -25 : -15);
    viewer.camera.lookAt(
        newPosition,
        new Cesium.HeadingPitchRange(heading, cameraPitch, cameraRange)
    );
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

    if (currentNamedPoint) {
        document.getElementById('flyStatus').textContent =
            `进度: ${progress}% | ${heightText} | 📍 ${currentNamedPoint}`;
    } else {
        document.getElementById('flyStatus').textContent =
            `进度: ${progress}% | ${heightText} | 飞行中...`;
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
    viewer.camera.lookAtReset(); // 解除 lookAt 锁定
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
    viewer.camera.lookAtReset(); // 解除 lookAt 锁定
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
