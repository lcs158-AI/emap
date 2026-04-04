// ==================== 地图初始化 ====================
// 触摸检测
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
document.body.classList.add(isTouchDevice ? 'touch' : 'no-touch');
// 存储动态加载的图层（用于图层管理）
let dynamicLayers = [];
// 天地图图层
const vecLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: `https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
        crossOrigin: 'anonymous', tileSize: 256, zoomOffset: 1
    })
});
const cvaLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: `https://t0.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
        crossOrigin: 'anonymous', tileSize: 256, zoomOffset: 1
    })
});

// Esri影像图层
const esriImagery = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        crossOrigin: 'anonymous', maxZoom: 19
    })
});

// 视图
const view = new ol.View({
    center: ol.proj.fromLonLat(initCenter),
    zoom: initZoom,
    projection: 'EPSG:3857'
});

// 地图
const map = new ol.Map({ target: 'map', layers: [], view: view });

// 按顺序添加图层
map.addLayer(esriImagery);
esriImagery.setVisible(false);
map.addLayer(vecLayer);
map.addLayer(cvaLayer);

// ----- 悬浮提示 -----
let tooltip = null;
if (!isTouchDevice) {
    tooltip = new ol.Overlay({
        element: document.createElement('div'),
        positioning: 'top-center', offset: [0, -15], className: 'ol-tooltip'
    });
    map.addOverlay(tooltip);
    tooltip.getElement().style.display = 'none';
    map.on('pointermove', function (evt) {
        if (measureActive) return;
        const pixel = map.getEventPixel(evt.originalEvent);
        const feature = map.forEachFeatureAtPixel(pixel, f => f);
        if (feature) {
            // 优先使用图层的标注字段
            const layer = feature.get('layer');
            let text = null;
            if (layer && layer.labelField) {
                text = feature.get(layer.labelField);
            } else {
                // 兼容旧数据（如有）
                text = feature.get('DD');
            }
            if (text) {
                const coord = feature.getGeometry().getCoordinates();
                tooltip.setPosition(coord);
                tooltip.getElement().innerHTML = text;
                tooltip.getElement().style.display = 'block';
                map.getTargetElement().style.cursor = 'pointer';
            }
        } else {
            tooltip.setPosition(undefined);
            tooltip.getElement().style.display = 'none';
            map.getTargetElement().style.cursor = '';
        }
    });
} else {
    map.getTargetElement().style.cursor = 'pointer';
}

// ----- 点击弹出框 -----
const popup = new ol.Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center', stopEvent: true, offset: [0, -10]
});
popup.getElement().className = 'ol-popup';
map.addOverlay(popup);
popup.getElement().style.display = 'none';

map.on('click', function (evt) {
    if (measureActive) return;
    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
    if (feature) {
        console.log('点击要素的属性:', feature.getProperties());
        if (positionLayer && positionLayer.getSource().getFeatures().includes(feature)) return;

        // 获取点击位置的实际地图坐标（用于弹出框定位）
        const coordinate = map.getCoordinateFromPixel(evt.pixel);

        const layer = feature.get('layer');
        let content = '';

        if (layer && layer.linkField) {
            const imgFile = feature.get(layer.linkField);
            if (imgFile) {
                const labelText = layer.labelField ? feature.get(layer.labelField) : '';
                // 使用路径前缀拼接完整路径，如果没有设置则默认使用 /pics/
                const pathPrefix = layer.linkPathPrefix || '/pics/';
                // 确保路径前缀以 / 结尾
                const normalizedPrefix = pathPrefix.endsWith('/') ? pathPrefix : pathPrefix + '/';
                const fullPath = normalizedPrefix + imgFile;
                
                // 检测是否为本地文件路径
                const isLocalPath = fullPath.startsWith('file:///') || /^[a-zA-Z]:[\\/]/.test(fullPath);
                
                if (isLocalPath) {
                    // 本地文件路径，显示警告信息
                    content = `
                        <div class="popup-content">
                            <b>${labelText}</b><br>
                            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 10px; margin-top: 8px; font-size: 12px; color: #856404;">
                                <b>⚠️ 无法加载本地图片</b><br>
                                浏览器安全策略阻止访问本地文件。<br><br>
                                <b>解决方案：</b><br>
                                1. 使用本地 Web 服务器访问<br>
                                2. 将图片复制到网站 /pics/ 目录<br>
                                3. 使用相对路径（如 ../pics/）<br><br>
                                <b>当前路径：</b><br>
                                ${fullPath}
                            </div>
                        </div>
                    `;
                } else {
                    // 网络路径，正常显示图片
                    content = `
                        <div class="popup-content">
                            <b>${labelText}</b><br>
                            <img src="${fullPath}" alt="照片" onerror="this.onerror=null; this.parentElement.innerHTML='<b>${labelText}</b><br><div style=\\'background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;padding:10px;margin-top:8px;font-size:12px;color:#721c24;\\'>❌ 图片加载失败<br>路径：${fullPath}</div>';">
                        </div>
                    `;
                }
            } else {
                const labelText = layer.labelField ? feature.get(layer.labelField) : '';
                content = `<div><b>${labelText}</b></div>`;
            }
        }
        else if (layer && layer.labelField) {
            const labelText = feature.get(layer.labelField);
            content = `<div><b>${labelText}</b></div>`;
        } else if (feature.get('DD')) {
            content = `<div><b>${feature.get('DD')}</b></div>`;
        } else {
            content = `<div><b>要素</b></div>`;
        }

        popup.getElement().innerHTML = content;
        popup.setPosition(coordinate);
        popup.getElement().style.display = 'block';
    } else {
        popup.setPosition(undefined);
        popup.getElement().style.display = 'none';
    }
});

map.on('dblclick', function () {
    if (measureActive) return;
    popup.setPosition(undefined);
    popup.getElement().style.display = 'none';
});

// ==================== 定位功能 ====================
const positionLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 10,
            fill: new ol.style.Fill({ color: 'rgba(0,102,255,0.8)' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
        })
    })
});
map.addLayer(positionLayer);

let watching = false;
let firstPosition = true;
let watchId = null;

document.getElementById('locateBtn').addEventListener('click', function () {
    if (!watching) {
        if ('geolocation' in navigator) {
            firstPosition = true;
            watchId = navigator.geolocation.watchPosition(
                function (position) {
                    const lon = position.coords.longitude;
                    const lat = position.coords.latitude;
                    const accuracy = position.coords.accuracy;

                    positionLayer.getSource().clear();
                    const point = new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
                    });
                    positionLayer.getSource().addFeature(point);
                    if (accuracy > 0 && accuracy < 1000) {
                        const circle = new ol.Feature({
                            geometry: new ol.geom.Circle(ol.proj.fromLonLat([lon, lat]), accuracy)
                        });
                        positionLayer.getSource().addFeature(circle);
                    }

                    if (firstPosition) {
                        map.getView().setCenter(ol.proj.fromLonLat([lon, lat]));
                        map.getView().setZoom(15);
                        firstPosition = false;
                    }
                },
                function (error) { alert('获取位置失败：' + error.message); },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            watching = true;
            this.classList.add('active');
        } else {
            alert('您的浏览器不支持地理定位。');
        }
    } else {
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        positionLayer.getSource().clear();
        watching = false;
        this.classList.remove('active');
    }
});

// ==================== 切换底图 ====================
const switchBtn = document.getElementById('switchBaseMapBtn');
switchBtn.addEventListener('click', function () {
    const isVectorVisible = vecLayer.getVisible();
    if (isVectorVisible) {
        vecLayer.setVisible(false);
        cvaLayer.setVisible(false);
        esriImagery.setVisible(true);
        this.classList.add('active');
    } else {
        vecLayer.setVisible(true);
        cvaLayer.setVisible(true);
        esriImagery.setVisible(false);
        this.classList.remove('active');
    }
});

// ==================== 测量功能 ====================
const measureLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ff33cc', width: 3, lineDash: [5, 5] }),
        fill: new ol.style.Fill({ color: 'rgba(255,51,204,0.1)' }),
        image: new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color: '#ff33cc' }) })
    })
});
map.addLayer(measureLayer);

let measureActive = false;
let currentMeasureType = null;
let measureDraw = null;
const measureLengthBtn = document.getElementById('measureLengthBtn');
const measureAreaBtn = document.getElementById('measureAreaBtn');
const measureResult = document.getElementById('measureResult');

// 获取双击缩放交互
let dblClickZoomInteraction = null;
map.getInteractions().forEach(function (interaction) {
    if (interaction instanceof ol.interaction.DoubleClickZoom) {
        dblClickZoomInteraction = interaction;
    }
});

function deactivateMeasurement() {
    if (measureDraw) {
        map.removeInteraction(measureDraw);
        measureDraw = null;
    }
    measureLayer.getSource().clear();
    measureActive = false;
    currentMeasureType = null;
    measureResult.style.display = 'none';
    measureResult.innerHTML = '0 米';
    measureLengthBtn.classList.remove('active');
    measureAreaBtn.classList.remove('active');
    if (dblClickZoomInteraction) dblClickZoomInteraction.setActive(true);
}

function activateMeasurement(type) {
    if (typeof formatLength !== 'function') {
        console.error('formatLength 未定义');
        alert('测量功能初始化失败：工具函数缺失');
        return;
    }
    if (typeof ol.sphere === 'undefined') {
        console.error('ol.sphere 未定义');
        alert('测量功能初始化失败：地图库错误');
        return;
    }

    if (measureActive) deactivateMeasurement();
    if (dblClickZoomInteraction) dblClickZoomInteraction.setActive(false);

    measureActive = true;
    currentMeasureType = type;

    if (type === 'length') {
        measureLengthBtn.classList.add('active');
        measureAreaBtn.classList.remove('active');
    } else {
        measureAreaBtn.classList.add('active');
        measureLengthBtn.classList.remove('active');
    }

    measureResult.style.display = 'block';
    measureResult.innerHTML = '单击加点，双击结束';

    measureDraw = new ol.interaction.Draw({
        source: measureLayer.getSource(),
        type: type === 'length' ? 'LineString' : 'Polygon'
    });

    measureDraw.on('drawstart', function (evt) {
        const sketch = evt.feature;
        const listener = sketch.getGeometry().on('change', function (evt) {
            const geom = evt.target;
            if (type === 'length') {
                const length = ol.sphere.getLength(geom, { projection: 'EPSG:3857' });
                measureResult.innerHTML = formatLength(length);
            } else {
                const area = ol.sphere.getArea(geom, { projection: 'EPSG:3857' });
                measureResult.innerHTML = formatArea(area);
            }
        });
        sketch.once('change', function () {
            ol.Observable.unByKey(listener);
        });
    });

    measureDraw.on('drawend', function (evt) {
        const geom = evt.feature.getGeometry();
        if (type === 'length') {
            const length = ol.sphere.getLength(geom, { projection: 'EPSG:3857' });
            measureResult.innerHTML = '长度: ' + formatLength(length);
        } else {
            const area = ol.sphere.getArea(geom, { projection: 'EPSG:3857' });
            measureResult.innerHTML = '面积: ' + formatArea(area);
        }
    });

    map.addInteraction(measureDraw);
}

measureLengthBtn.addEventListener('click', function () {
    if (measureActive && currentMeasureType === 'length') {
        deactivateMeasurement();
    } else {
        activateMeasurement('length');
    }
});

measureAreaBtn.addEventListener('click', function () {
    if (measureActive && currentMeasureType === 'area') {
        deactivateMeasurement();
    } else {
        activateMeasurement('area');
    }
});

// ==================== 潮汐功能 ====================
const tideBtn = document.getElementById('tideBtn');
const tidePanel = document.getElementById('tidePanel');
const closeTideBtn = document.getElementById('closeTideBtn');

closeTideBtn.addEventListener('click', () => {
    tidePanel.style.display = 'none';
});

async function fetchTideData(lon, lat) {
    try {
        tidePanel.style.display = 'block';
        document.getElementById('tideCurrent').innerHTML = '查询中...';
        document.getElementById('tideLocation').innerHTML = `正在获取潮汐数据`;

        const geoUrl = `https://${APIhost}/geo/v2/poi/lookup?location=${lon},${lat}&type=TSTA&key=${QWEATHER_KEY}`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        const poiId = geoData.poi?.[0]?.id;
        let poiName = '附近海域';
        if (geoData.code === '200' && geoData.poi && geoData.poi.length > 0) {
            poiName = geoData.poi[0].name || poiName;
        }
        if (!poiId) throw new Error('未找到附近潮汐站点');

        const now = new Date();
        const currentHour = now.getHours();
        const isEarlyMorning = currentHour >= 0 && currentHour <= 6;
        const todayStr = getLocalDateStr(now);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getLocalDateStr(tomorrow);

        let allHourly = [];

        if (isEarlyMorning) {
            const tideUrl = `https://${APIhost}/v7/ocean/tide?location=${poiId}&date=${todayStr}&key=${QWEATHER_KEY}`;
            const tideRes = await fetch(tideUrl);
            const tideData = await tideRes.json();
            if (tideData.code !== '200') throw new Error(`潮汐查询失败 (${tideData.code})`);
            if (!tideData.tideHourly || tideData.tideHourly.length === 0) throw new Error('今日潮汐数据为空');
            allHourly = tideData.tideHourly.filter(item => {
                const hour = new Date(item.fxTime).getHours();
                return hour >= 0 && hour <= 12;
            });
            if (allHourly.length === 0) throw new Error('今日0-12时数据为空');
        } else {
            const datesToFetch = [{ date: todayStr, label: '今天' }];
            if (currentHour >= 18) datesToFetch.push({ date: tomorrowStr, label: '明天' });
            for (const { date, label } of datesToFetch) {
                const tideUrl = `https://${APIhost}/v7/ocean/tide?location=${poiId}&date=${date}&key=${QWEATHER_KEY}`;
                const tideRes = await fetch(tideUrl);
                const tideData = await tideRes.json();
                if (tideData.code === '200' && tideData.tideHourly && tideData.tideHourly.length > 0) {
                    allHourly = allHourly.concat(tideData.tideHourly);
                }
            }
            if (allHourly.length === 0) throw new Error('无法获取任何有效潮汐数据');
        }

        allHourly.sort((a, b) => new Date(a.fxTime) - new Date(b.fxTime));
        updateTidePanel(allHourly, poiName, [lon, lat]);
        renderTideChart(allHourly, isEarlyMorning);
    } catch (error) {
        console.error('潮汐查询出错:', error);
        document.getElementById('tideCurrent').innerHTML = '查询失败';
        document.getElementById('tideDetail').innerHTML = `❌ ${error.message}`;
    }
}

function updateTidePanel(allHourly, locationName, coords) {
    const now = new Date();
    let bestItem = null, minDiff = Infinity;
    for (let item of allHourly) {
        const diff = Math.abs(new Date(item.fxTime) - now);
        if (diff < minDiff) {
            minDiff = diff;
            bestItem = item;
        }
    }
    const tideHeight = bestItem ? parseFloat(bestItem.height).toFixed(1) : '--';
    const bestTime = bestItem ? new Date(bestItem.fxTime).toLocaleString('zh-CN', { hour: 'numeric', minute: 'numeric' }) : '';
    document.getElementById('tideLocation').innerHTML = `📍 ${locationName}`;
    document.getElementById('tideCurrent').innerHTML = `${tideHeight} 米`;
    document.getElementById('tideTime').innerHTML = `⏱️ ${bestTime} 更新`;
    document.getElementById('tideDetail').innerHTML = '';
}

tideBtn.addEventListener('click', async function () {
    const center = map.getView().getCenter();
    const lonLat = ol.proj.toLonLat(center);
    await fetchTideData(lonLat[0].toFixed(4), lonLat[1].toFixed(4));
});

// 全局图表实例
let tideChartInstance = null;

function renderTideChart(tideHourly, useFullData = false) {
    if (!tideHourly || tideHourly.length === 0) return;

    const canvas = document.getElementById('tideChart');
    if (!canvas) return;

    let labels, values, highlightIndex = -1;

    if (useFullData) {
        labels = tideHourly.map(item => new Date(item.fxTime).getHours() + ':00');
        values = tideHourly.map(item => parseFloat(item.height));
        const now = new Date();
        const currentHour = now.getHours();
        highlightIndex = values.findIndex((_, idx) => new Date(tideHourly[idx].fxTime).getHours() === currentHour);
    } else {
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
        const startIdx = Math.max(0, currentIndex - 6);
        const endIdx = Math.min(tideHourly.length, currentIndex + 6 + 1);
        const sliced = tideHourly.slice(startIdx, endIdx);
        labels = sliced.map((item, idx) => {
            const d = new Date(item.fxTime);
            const hour = d.getHours().toString().padStart(2, '0');
            if (idx > 0 && d.toDateString() !== new Date(sliced[0].fxTime).toDateString()) {
                return `${d.getMonth() + 1}/${d.getDate()} ${hour}:00`;
            }
            return `${hour}:00`;
        });
        values = sliced.map(item => parseFloat(item.height));
        highlightIndex = currentIndex - startIdx;
    }

    if (tideChartInstance) tideChartInstance.destroy();
    const ctx = canvas.getContext('2d');
    const pointBackgroundColor = values.map((_, i) => i === highlightIndex ? '#ff0000' : '#1890ff');
    const pointRadius = values.map((_, i) => i === highlightIndex ? 8 : 3);
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
                pointBackgroundColor: pointBackgroundColor,
                pointRadius: pointRadius,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: false, title: { display: true, text: '潮高 (米)' } } }
        }
    });
}

// ==================== 动态图层加载（极简样式测试） ====================
// 辅助函数：颜色转换
function rgbFromMapInfoColor(colorInt, alpha = 1) {
    const r = (colorInt >> 16) & 0xFF;
    const g = (colorInt >> 8) & 0xFF;
    const b = colorInt & 0xFF;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createStyleFromConfig(styleConfig) {
    const pointConfig = styleConfig?.point || {};
    const lineConfig = styleConfig?.line || {};
    const fillConfig = styleConfig?.fill || {};

    // 默认点样式
    const defaultColor = pointConfig.color ? rgbFromMapInfoColor(pointConfig.color) : 'red';
    const defaultRadius = pointConfig.size / 2 || 6;

    // 线样式：根据 pattern 决定是否创建及线型
    let lineStyle = null;
    if (lineConfig.color && lineConfig.width && lineConfig.pattern !== 1) {
        const strokeColor = rgbFromMapInfoColor(lineConfig.color);
        const strokeWidth = lineConfig.width || 1;
        let lineDash = undefined;
        // MapInfo 线型映射（根据实际需求）
        if (lineConfig.pattern === 3) {
            // 虚线，可调整间距
            lineDash = [6, 4];
        } else if (lineConfig.pattern === 2) {
            // 实线，lineDash 保持 undefined
        } else {
            // 其他 pattern 按实线处理，或根据需求扩展
        }
        lineStyle = new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: strokeColor,
                width: strokeWidth,
                lineDash: lineDash
            })
        });
    }

    // 面样式：如果配置了前景色
    const fillStyle = fillConfig.foreground ? new ol.style.Style({
        fill: new ol.style.Fill({
            color: rgbFromMapInfoColor(fillConfig.foreground, 0.6)
        }),
        stroke: new ol.style.Stroke({
            color: rgbFromMapInfoColor(fillConfig.background || 0x000000),
            width: 1
        })
    }) : null;

    return function (feature) {
        const geometryType = feature.getGeometry().getType();
        const styles = [];

        if (geometryType === 'Point') {
            const sj = feature.get('SJ');
            let styleObj;
            if (sj === 'phone_pic') {
                styleObj = new ol.style.Style({
                    text: new ol.style.Text({
                        text: '📷',
                        font: '20px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
                        fill: new ol.style.Fill({ color: defaultColor }),
                        offsetY: -12
                    })
                });
            } else if (sj === 'plane_pic') {
                styleObj = new ol.style.Style({
                    text: new ol.style.Text({
                        text: '✈️',
                        font: '20px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
                        fill: new ol.style.Fill({ color: defaultColor }),
                        offsetY: -12
                    })
                });
            } else {
                styleObj = new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: defaultRadius,
                        fill: new ol.style.Fill({ color: defaultColor }),
                        stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
                    })
                });
            }
            styles.push(styleObj);
        }

        if (lineStyle && (geometryType === 'LineString' || geometryType === 'MultiLineString')) {
            styles.push(lineStyle);
        }

        if (fillStyle && (geometryType === 'Polygon' || geometryType === 'MultiPolygon')) {
            styles.push(fillStyle);
        }

        if (styles.length === 0) {
            styles.push(new ol.style.Style());
        }

        return styles;
    };
}

async function loadLayersFromConfig(configUrl) {
    try {
        // 显示加载提示
        const loadingPanel = document.getElementById('loadingPanel');
        const loadingProgress = document.getElementById('loadingProgress');
        if (loadingPanel) {
            loadingPanel.style.display = 'block';
            loadingProgress.textContent = '加载配置文件...';
        }
        
        const response = await fetch(configUrl);
        if (!response.ok) throw new Error(`配置文件加载失败: ${response.status}`);
        const config = await response.json();
        console.log('配置文件内容:', config);

        // 获取配置文件的基准路径
        const configBasePath = configUrl.substring(0, configUrl.lastIndexOf('/') + 1) || '';
        console.log('配置文件基准路径:', configBasePath);

        // GeoJSON 文件的基础路径（可在配置文件中指定，默认为配置文件的基准路径）
        const geojsonBasePath = config.geojson_base_path !== undefined
            ? (config.geojson_base_path.startsWith('/')
                ? config.geojson_base_path
                : configBasePath + config.geojson_base_path)
            : configBasePath;
        console.log('GeoJSON 基础路径:', geojsonBasePath);

        // 设置地图初始视图
        if (config.map_center && config.map_center.length === 2) {
            const center = ol.proj.fromLonLat(config.map_center);
            map.getView().setCenter(center);
            if (config.camera_altitude_km) {
                const zoom = Math.max(3, Math.min(18, 14 - Math.log2(config.camera_altitude_km / 10)));
                map.getView().setZoom(zoom);
            }
        }

        // 清空已有动态图层
        dynamicLayers.forEach(item => map.removeLayer(item.layer));
        dynamicLayers = [];

        const layersToAdd = []; // 临时存储图层对象

        // 加载所有图层到临时数组
        for (let i = 0; i < config.layers.length; i++) {
            const layerConfig = config.layers[i];
            if (!layerConfig.geojson_path) continue;

            // 更新加载进度
            if (loadingProgress) {
                loadingProgress.textContent = `加载图层 ${i + 1}/${config.layers.length}: ${layerConfig.name}`;
            }

            // 解析 geojson_path，支持多种写法：
            // 1. 纯文件名（如 "anfang.geojson"）-> 自动拼接 geojsonBasePath
            // 2. 相对路径（如 "subdir/anfang.geojson"）-> 自动拼接 geojsonBasePath
            // 3. 绝对路径（如 "/geojson/anfang.geojson" 或 "http://..."）-> 直接使用
            let geoJsonUrl = layerConfig.geojson_path;

            // 如果是纯文件名或相对路径（不以 / 或 http 开头），则拼接 geojsonBasePath
            if (!geoJsonUrl.startsWith('/') && !geoJsonUrl.startsWith('http')) {
                // 移除开头的 ./ 如果存在
                if (geoJsonUrl.startsWith('./')) {
                    geoJsonUrl = geoJsonUrl.substring(2);
                }
                geoJsonUrl = geojsonBasePath + geoJsonUrl;
            }

            console.log(`尝试加载: ${geoJsonUrl}`);

            let geoJsonResponse;
            try {
                geoJsonResponse = await fetch(geoJsonUrl);
            } catch (err) {
                console.error(`加载 GeoJSON 失败: ${geoJsonUrl}`, err);
                continue;
            }

            if (!geoJsonResponse.ok) {
                console.error(`加载 GeoJSON 失败: ${geoJsonUrl}, 状态码: ${geoJsonResponse.status}`);
                continue;
            }

            const geoJson = await geoJsonResponse.json();
            console.log(`成功加载 ${layerConfig.name}, 要素数量:`, geoJson.features?.length);

            const features = new ol.format.GeoJSON().readFeatures(geoJson, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });

            features.forEach(f => {
                f.set('layer', {
                    labelField: layerConfig.label_field || '',
                    linkField: layerConfig.link_field || ''
                });
            });

            const source = new ol.source.Vector({ features });
            const style = createStyleFromConfig(layerConfig.style);
            const initialVisible = layerConfig.visible !== undefined ? layerConfig.visible : true;
            const vectorLayer = new ol.layer.Vector({
                source: source,
                style: style,
                visible: initialVisible,   // 设置图层初始可见性
                properties: {
                    labelField: layerConfig.label_field || '',
                    linkField: layerConfig.link_field || ''
                },
                name: layerConfig.name
            });
            console.log(`图层 ${layerConfig.name} visible: ${layerConfig.visible}`);
            layersToAdd.push({
                layer: vectorLayer,
                name: layerConfig.name,
                visible: initialVisible,   // 关键：必须使用 initialVisible
                labelField: layerConfig.label_field || '',
                linkField: layerConfig.link_field || ''
            });
        }

        // 倒序添加图层到地图（使 MapInfo 中靠上的图层最后添加，显示在最上层）
        for (let i = layersToAdd.length - 1; i >= 0; i--) {
            const item = layersToAdd[i];
            map.addLayer(item.layer);
            dynamicLayers.push(item); // 保持顺序与配置文件一致（正序）
        }

        // 创建图层控制面板
        createLayerControl();

        // 隐藏加载提示
        if (loadingPanel) {
            loadingPanel.style.display = 'none';
        }

    } catch (err) {
        console.error('加载配置文件失败:', err);
        // 清理已加载的图层，回到无参数导入状态
        dynamicLayers.forEach(item => map.removeLayer(item.layer));
        dynamicLayers = [];
        // 清除图层控制面板
        const layerControl = document.getElementById('layerControl');
        if (layerControl) {
            layerControl.remove();
        }
        // 隐藏加载提示
        if (loadingPanel) {
            loadingPanel.style.display = 'none';
        }
        console.log('已清理图层，回到无参数导入状态');
    }
}

let layerPanelVisible = true; // 面板当前是否可见

function createLayerControl() {
    // 如果面板已存在，先移除（避免重复）
    const oldPanel = document.getElementById('layerControl');
    if (oldPanel) oldPanel.remove();
    
    // 创建新面板
    const panel = document.createElement('div');
    panel.id = 'layerControl';
    panel.style.position = 'absolute';
    panel.style.bottom = '20px';
    panel.style.right = '20px';
    panel.style.zIndex = '1000';
    panel.style.backgroundColor = 'white';
    panel.style.borderRadius = '8px';
    panel.style.padding = '10px';
    panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    panel.style.minWidth = '150px';
    panel.style.maxHeight = '60vh';
    panel.style.overflowY = 'auto';
    document.body.appendChild(panel);
    
    // 面板头部：标题 + 关闭按钮
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';
    header.style.borderBottom = '1px solid #eee';
    header.style.paddingBottom = '5px';
    
    const title = document.createElement('div');
    title.textContent = '图层管理';
    title.style.fontWeight = 'bold';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#999';
    closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
        layerPanelVisible = false;
        // 同步工具栏按钮状态（可选）
        const toggleBtn = document.getElementById('toggleLayerPanelBtn');
        if (toggleBtn) toggleBtn.classList.remove('active');
    });
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    
    // 添加本地 GeoJSON 图层列表
    if (localGeoJsonLayers.length > 0) {
        const localTitle = document.createElement('div');
        localTitle.textContent = '本地图层';
        localTitle.style.fontWeight = 'bold';
        localTitle.style.marginTop = '10px';
        localTitle.style.marginBottom = '5px';
        localTitle.style.fontSize = '12px';
        localTitle.style.color = '#666';
        panel.appendChild(localTitle);
        
        localGeoJsonLayers.forEach((item, index) => {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            div.style.padding = '5px';
            div.style.border = '1px solid #eee';
            div.style.borderRadius = '4px';
            
            // 图层名称行
            const layerHeader = document.createElement('div');
            layerHeader.style.display = 'flex';
            layerHeader.style.alignItems = 'center';
            layerHeader.style.justifyContent = 'space-between';
            
            const leftSection = document.createElement('div');
            leftSection.style.display = 'flex';
            leftSection.style.alignItems = 'center';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.visible;
            checkbox.setAttribute('data-layer-name', item.name);
            checkbox.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                item.layer.setVisible(isVisible);
                item.visible = isVisible;
            });
            
            const label = document.createElement('label');
            label.textContent = item.name;
            label.style.marginLeft = '5px';
            label.style.fontWeight = '500';
            
            leftSection.appendChild(checkbox);
            leftSection.appendChild(label);
            
            // 信息管理按钮
            const infoBtn = document.createElement('button');
            infoBtn.textContent = '⚙️';
            infoBtn.title = '设置字段信息';
            infoBtn.style.background = 'none';
            infoBtn.style.border = 'none';
            infoBtn.style.cursor = 'pointer';
            infoBtn.style.fontSize = '14px';
            infoBtn.style.padding = '2px 4px';
            infoBtn.addEventListener('click', () => {
                openLayerInfoEditor(item, index);
            });
            
            layerHeader.appendChild(leftSection);
            layerHeader.appendChild(infoBtn);
            div.appendChild(layerHeader);
            
            // 显示当前设置的字段信息
            if (item.labelField || item.linkField) {
                const fieldInfo = document.createElement('div');
                fieldInfo.style.fontSize = '11px';
                fieldInfo.style.color = '#666';
                fieldInfo.style.marginTop = '3px';
                fieldInfo.style.marginLeft = '20px';
                
                let infoText = '';
                if (item.labelField) {
                    infoText += `标签: ${item.labelField}`;
                }
                if (item.linkField) {
                    if (infoText) infoText += ' | ';
                    infoText += `链接: ${item.linkField}`;
                }
                fieldInfo.textContent = infoText;
                div.appendChild(fieldInfo);
                
                // 显示路径前缀
                if (item.linkField && item.linkPathPrefix) {
                    const pathInfo = document.createElement('div');
                    pathInfo.style.fontSize = '10px';
                    pathInfo.style.color = '#999';
                    pathInfo.style.marginTop = '2px';
                    pathInfo.style.marginLeft = '20px';
                    pathInfo.textContent = `路径: ${item.linkPathPrefix}`;
                    div.appendChild(pathInfo);
                }
            }
            
            panel.appendChild(div);
            console.log(`本地图层 ${item.name} visible: ${item.visible}`);
        });
    }
    
    // 遍历动态图层生成列表
    // 按地图显示顺序（倒序）生成列表
    if (dynamicLayers.length > 0) {
        const dynamicTitle = document.createElement('div');
        dynamicTitle.textContent = '配置图层';
        dynamicTitle.style.fontWeight = 'bold';
        dynamicTitle.style.marginTop = '10px';
        dynamicTitle.style.marginBottom = '5px';
        dynamicTitle.style.fontSize = '12px';
        dynamicTitle.style.color = '#666';
        panel.appendChild(dynamicTitle);
        
        dynamicLayers.reverse().forEach(item => {
            const div = document.createElement('div');
            div.style.marginBottom = '5px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.visible;
            checkbox.setAttribute('data-layer-name', item.name);
            checkbox.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                item.layer.setVisible(isVisible);
                item.visible = isVisible;
            });
            
            const label = document.createElement('label');
            label.textContent = item.name;
            label.style.marginLeft = '5px';
            
            div.appendChild(checkbox);
            div.appendChild(label);
            panel.appendChild(div);
            console.log(`图层 ${item.name} visible: ${item.visible}`);
        });
    }
    
    // 添加工具栏按钮事件（如果不存在则添加）
    let toggleBtn = document.getElementById('toggleLayerPanelBtn');
    if (!toggleBtn) {
        // 如果按钮不在工具栏，动态创建（但通常已在 HTML 中）
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'toggleLayerPanelBtn';
            toggleBtn.className = 'action-btn';
            toggleBtn.setAttribute('data-title', '图层管理');
            toggleBtn.textContent = '🗂️';
            toolbar.appendChild(toggleBtn);
        }
    }
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                layerPanelVisible = true;
                toggleBtn.classList.add('active');
            } else {
                panel.style.display = 'none';
                layerPanelVisible = false;
                toggleBtn.classList.remove('active');
            }
        });
        // 初始同步按钮状态
        if (layerPanelVisible) toggleBtn.classList.add('active');
    }
}
// 获取URL参数，决定加载哪个配置文件
function getConfigUrlFromParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const configParam = urlParams.get('config');
    console.log('URL参数 config:', configParam);
    console.log('当前页面URL:', window.location.href);
    if (configParam) {
        // 自动补全 .json 扩展名（如果未指定）
        let configFile = configParam.endsWith('.json') ? configParam : `${configParam}.json`;
        // 如果参数包含路径分隔符，直接使用；否则默认在data目录下查找
        const result = configFile.includes('/') ? configFile : `data/${configFile}`;
        console.log('配置文件路径:', result);
        return result;
    }
    return null;
}

// 根据 URL 参数决定是否加载图层
const configUrl = getConfigUrlFromParams();
console.log('最终配置文件 URL:', configUrl);
if (configUrl) {
    loadLayersFromConfig(configUrl);
} else {
    console.log('未指定配置文件，跳过图层加载。使用 ?config=xxx.json 参数指定配置文件');
}
console.log('地图加载完成');

// ==================== 加载本地 GeoJSON 文件 ====================
// 加载 GeoJSON 文件按钮事件
const loadGeoJsonBtn = document.getElementById('loadGeoJsonBtn');
const geoJsonFileInput = document.getElementById('geoJsonFileInput');

if (loadGeoJsonBtn) {
    loadGeoJsonBtn.addEventListener('click', function() {
        // 触发文件选择对话框
        geoJsonFileInput.click();
    });
}

if (geoJsonFileInput) {
    geoJsonFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 显示加载提示
        const loadingPanel = document.getElementById('loadingPanel');
        const loadingProgress = document.getElementById('loadingProgress');
        if (loadingPanel) {
            loadingPanel.style.display = 'block';
            loadingProgress.textContent = '正在加载 GeoJSON 文件...';
        }
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const geoJson = JSON.parse(event.target.result);
                loadLocalGeoJSON(geoJson, file.name.replace(/\.(geojson|json)$/i, ''));
                
                // 隐藏加载提示
                if (loadingPanel) {
                    loadingPanel.style.display = 'none';
                }
                
                // 清空 input，允许重复加载同一文件
                geoJsonFileInput.value = '';
            } catch (error) {
                console.error('解析 GeoJSON 失败:', error);
                alert('GeoJSON 文件解析失败：' + error.message);
                
                // 隐藏加载提示
                if (loadingPanel) {
                    loadingPanel.style.display = 'none';
                }
            }
        };
        
        reader.onerror = function() {
            console.error('读取文件失败');
            alert('读取 GeoJSON 文件失败');
            
            // 隐藏加载提示
            if (loadingPanel) {
                loadingPanel.style.display = 'none';
            }
        };
        
        reader.readAsText(file);
    });
}

// 存储本地加载的 GeoJSON 图层
let localGeoJsonLayers = [];

/**
 * 加载本地 GeoJSON 数据到地图
 * @param {Object} geoJson - GeoJSON 对象
 * @param {string} name - 图层名称
 */
function loadLocalGeoJSON(geoJson, name) {
    try {
        // 将 GeoJSON 转换为 OpenLayers 要素
        const features = new ol.format.GeoJSON().readFeatures(geoJson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        
        console.log('成功加载本地 GeoJSON:', name, '要素数量:', features.length);
        
        // 创建矢量图层
        const vectorLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features }),
            style: function(feature) {
                const geometryType = feature.getGeometry().getType();
                
                // 根据几何类型设置默认样式
                if (geometryType === 'Point') {
                    return new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 6,
                            fill: new ol.style.Fill({ color: 'rgba(24, 144, 255, 0.8)' }),
                            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                        })
                    });
                } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: 'rgba(82, 196, 26, 0.9)',
                            width: 3
                        })
                    });
                } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                    return new ol.style.Style({
                        fill: new ol.style.Fill({
                            color: 'rgba(255, 165, 0, 0.3)'
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(255, 165, 0, 0.9)',
                            width: 2
                        })
                    });
                }
                
                return new ol.style.Style();
            },
            visible: true,
            properties: {
                labelField: '',
                linkField: ''
            },
            name: name
        });
        
        // 添加到地图
        map.addLayer(vectorLayer);
        
        // 记录到本地图层数组
        localGeoJsonLayers.push({
            layer: vectorLayer,
            name: name,
            visible: true
        });
        
        // 更新图层控制面板
        createLayerControl();
        
        // 自动缩放到图层范围
        zoomToLayerExtent(vectorLayer);
        
        console.log('本地 GeoJSON 图层已添加:', name);
    } catch (error) {
        console.error('加载本地 GeoJSON 失败:', error);
        throw error;
    }
}

/**
 * 缩放到图层范围
 * @param {ol.layer.Vector} layer - 矢量图层
 */
function zoomToLayerExtent(layer) {
    const source = layer.getSource();
    if (!source || source.getFeatures().length === 0) return;
    
    const extent = ol.extent.createEmpty();
    source.getFeatures().forEach(feature => {
        const geom = feature.getGeometry();
        if (geom) {
            ol.extent.extend(extent, geom.getExtent());
        }
    });
    
    if (ol.extent.getWidth(extent) > 0 && ol.extent.getHeight(extent) > 0) {
        // 添加 10% 的边距
        const bufferedExtent = ol.extent.buffer(extent, ol.extent.getWidth(extent) * 0.1);
        map.getView().fit(bufferedExtent, {
            padding: [50, 50, 50, 50],
            duration: 500
        });
    }
}

/**
 * 打开图层信息编辑器
 * 允许用户设置 label 字段和 link 字段
 * @param {Object} item - 图层对象
 * @param {number} index - 图层索引
 */
function openLayerInfoEditor(item, index) {
    // 获取图层的所有属性字段
    const source = item.layer.getSource();
    const features = source.getFeatures();
    
    if (features.length === 0) {
        alert('该图层没有要素，无法获取属性字段');
        return;
    }
    
    // 收集所有可用的属性字段
    const allFields = new Set();
    features.forEach(feature => {
        const properties = feature.getProperties();
        Object.keys(properties).forEach(key => {
            if (key !== 'geometry') {
                allFields.add(key);
            }
        });
    });
    
    const fieldList = Array.from(allFields).sort();
    
    if (fieldList.length === 0) {
        alert('该图层没有可用的属性字段');
        return;
    }
    
    // 创建模态框
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    
    const content = document.createElement('div');
    content.style.backgroundColor = 'white';
    content.style.borderRadius = '8px';
    content.style.padding = '20px';
    content.style.maxWidth = '400px';
    content.style.width = '90%';
    content.style.maxHeight = '80vh';
    content.style.overflowY = 'auto';
    
    // 标题
    const title = document.createElement('h3');
    title.textContent = `设置图层字段 - ${item.name}`;
    title.style.marginTop = '0';
    title.style.marginBottom = '15px';
    content.appendChild(title);
    
    // Label 字段选择
    const labelSection = document.createElement('div');
    labelSection.style.marginBottom = '15px';
    
    const labelLabel = document.createElement('label');
    labelLabel.textContent = '标签字段 (Label):';
    labelLabel.style.display = 'block';
    labelLabel.style.marginBottom = '5px';
    labelLabel.style.fontWeight = 'bold';
    labelSection.appendChild(labelLabel);
    
    const labelSelect = document.createElement('select');
    labelSelect.style.width = '100%';
    labelSelect.style.padding = '8px';
    labelSelect.style.borderRadius = '4px';
    labelSelect.style.border = '1px solid #ddd';
    
    // 添加空选项
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- 不设置标签字段 --';
    labelSelect.appendChild(emptyOption);
    
    // 添加所有可用字段
    fieldList.forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        if (item.labelField === field) {
            option.selected = true;
        }
        labelSelect.appendChild(option);
    });
    
    labelSection.appendChild(labelSelect);
    content.appendChild(labelSection);
    
    // Link 字段选择
    const linkSection = document.createElement('div');
    linkSection.style.marginBottom = '15px';
    
    const linkLabel = document.createElement('label');
    linkLabel.textContent = '链接字段 (Link):用于关联图片';
    linkLabel.style.display = 'block';
    linkLabel.style.marginBottom = '5px';
    linkLabel.style.fontWeight = 'bold';
    linkSection.appendChild(linkLabel);
    
    const linkSelect = document.createElement('select');
    linkSelect.style.width = '100%';
    linkSelect.style.padding = '8px';
    linkSelect.style.borderRadius = '4px';
    linkSelect.style.border = '1px solid #ddd';
    linkSelect.style.marginBottom = '8px';
    
    // 添加空选项
    const emptyLinkOption = document.createElement('option');
    emptyLinkOption.value = '';
    emptyLinkOption.textContent = '-- 不设置链接字段 --';
    linkSelect.appendChild(emptyLinkOption);
    
    // 添加所有可用字段
    fieldList.forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        if (item.linkField === field) {
            option.selected = true;
        }
        linkSelect.appendChild(option);
    });
    
    linkSection.appendChild(linkSelect);
    
    // 路径前缀设置
    const pathPrefixLabel = document.createElement('label');
    pathPrefixLabel.textContent = '图片路径前缀:';
    pathPrefixLabel.style.display = 'block';
    pathPrefixLabel.style.marginBottom = '5px';
    pathPrefixLabel.style.fontSize = '12px';
    pathPrefixLabel.style.color = '#666';
    linkSection.appendChild(pathPrefixLabel);
    
    const pathPrefixInput = document.createElement('input');
    pathPrefixInput.type = 'text';
    pathPrefixInput.value = item.linkPathPrefix || '/pics/';
    pathPrefixInput.placeholder = '例如: /pics/ 或 C:/photos/';
    pathPrefixInput.style.width = '100%';
    pathPrefixInput.style.padding = '8px';
    pathPrefixInput.style.borderRadius = '4px';
    pathPrefixInput.style.border = '1px solid #ddd';
    pathPrefixInput.style.boxSizing = 'border-box';
    
    // 添加说明文字
    const pathHint = document.createElement('div');
    pathHint.innerHTML = `
        <div style="font-size: 11px; color: #999; margin-top: 3px;">
            <b>常用路径格式：</b><br>
            • <code>/pics/</code> - 网站 pics 目录（推荐）<br>
            • <code>../images/</code> - 相对路径<br>
            • <code>https://example.com/photos/</code> - 网络路径<br>
            <span style="color: #d9534f;">⚠️ 本地绝对路径（如 C:/pics/）会被浏览器阻止</span>
        </div>
    `;
    
    linkSection.appendChild(pathPrefixInput);
    linkSection.appendChild(pathHint);
    content.appendChild(linkSection);
    
    // 预览信息
    const previewSection = document.createElement('div');
    previewSection.style.marginBottom = '15px';
    previewSection.style.padding = '10px';
    previewSection.style.backgroundColor = '#f5f5f5';
    previewSection.style.borderRadius = '4px';
    previewSection.style.fontSize = '12px';
    
    const previewTitle = document.createElement('div');
    previewTitle.textContent = '字段预览 (第一个要素):';
    previewTitle.style.fontWeight = 'bold';
    previewTitle.style.marginBottom = '5px';
    previewSection.appendChild(previewTitle);
    
    const firstFeature = features[0];
    const firstProps = firstFeature.getProperties();
    let previewText = '';
    fieldList.slice(0, 5).forEach(field => {
        const value = firstProps[field];
        const displayValue = value !== undefined ? String(value).substring(0, 30) : 'N/A';
        previewText += `${field}: ${displayValue}\n`;
    });
    if (fieldList.length > 5) {
        previewText += `... 还有 ${fieldList.length - 5} 个字段`;
    }
    
    const previewContent = document.createElement('pre');
    previewContent.textContent = previewText;
    previewContent.style.margin = '0';
    previewContent.style.whiteSpace = 'pre-wrap';
    previewContent.style.wordBreak = 'break-all';
    previewSection.appendChild(previewContent);
    
    content.appendChild(previewSection);
    
    // 按钮区域
    const buttonSection = document.createElement('div');
    buttonSection.style.display = 'flex';
    buttonSection.style.justifyContent = 'flex-end';
    buttonSection.style.gap = '10px';
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #ddd';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.backgroundColor = '#fff';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    buttonSection.appendChild(cancelBtn);
    
    // 确定按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.padding = '8px 16px';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '4px';
    confirmBtn.style.backgroundColor = '#1890ff';
    confirmBtn.style.color = 'white';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.addEventListener('click', () => {
        // 保存设置
        const selectedLabelField = labelSelect.value;
        const selectedLinkField = linkSelect.value;
        const pathPrefix = pathPrefixInput.value.trim();
        
        // 更新图层对象的字段设置
        item.labelField = selectedLabelField;
        item.linkField = selectedLinkField;
        item.linkPathPrefix = pathPrefix;
        
        // 更新图层属性
        item.layer.set('labelField', selectedLabelField);
        item.layer.set('linkField', selectedLinkField);
        item.layer.set('linkPathPrefix', pathPrefix);
        
        // 更新所有要素的 layer 属性
        item.layer.getSource().getFeatures().forEach(feature => {
            feature.set('layer', {
                labelField: selectedLabelField,
                linkField: selectedLinkField,
                linkPathPrefix: pathPrefix
            });
        });
        
        // 关闭模态框
        document.body.removeChild(modal);
        
        // 刷新图层控制面板
        createLayerControl();
        
        console.log(`图层 ${item.name} 字段设置已更新:`, {
            labelField: selectedLabelField,
            linkField: selectedLinkField,
            linkPathPrefix: pathPrefix
        });
    });
    buttonSection.appendChild(confirmBtn);
    
    content.appendChild(buttonSection);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // 点击模态框背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}