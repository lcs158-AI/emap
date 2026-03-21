// ==================== 地图初始化 ====================
// 触摸检测
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
document.body.classList.add(isTouchDevice ? 'touch' : 'no-touch');

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

// 照片点图层
const vectorSource = new ol.source.Vector({
    features: new ol.format.GeoJSON().readFeatures(photoPoints, {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'
    })
});
const vectorLayer = new ol.layer.Vector({
    source: vectorSource,
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 8,
            fill: new ol.style.Fill({ color: 'rgba(255,0,0,0.8)' }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
        })
    })
});
map.addLayer(vectorLayer);

// ----- 悬浮提示 -----
let tooltip = null;
if (!isTouchDevice) {
    tooltip = new ol.Overlay({
        element: document.createElement('div'),
        positioning: 'top-center', offset: [0, -15], className: 'ol-tooltip'
    });
    map.addOverlay(tooltip);
    tooltip.getElement().style.display = 'none';
    map.on('pointermove', function(evt) {
        const pixel = map.getEventPixel(evt.originalEvent);
        const feature = map.forEachFeatureAtPixel(pixel, f => f);
        if (feature) {
            const ddValue = feature.get('DD');
            const coord = feature.getGeometry().getCoordinates();
            tooltip.setPosition(coord);
            tooltip.getElement().innerHTML = ddValue;
            tooltip.getElement().style.display = 'block';
            map.getTargetElement().style.cursor = 'pointer';
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

map.on('click', function(evt) {
    if (measureActive) return;

    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
    if (feature) {
        if (positionLayer && positionLayer.getSource().getFeatures().includes(feature)) return;

        const props = feature.getProperties();
        const coord = feature.getGeometry().getCoordinates();
        if (props.MC) {
            const imgSrc = `/pics/${props.MC}`;
            const content = `
                <div class="popup-content">
                    <b>${props.DD}</b><br>
                    <img src="${imgSrc}" alt="照片" onerror="this.onerror=null; this.src='https://via.placeholder.com/250x150?text=图片未找到';">
                </div>
            `;
            popup.getElement().innerHTML = content;
            popup.setPosition(coord);
            popup.getElement().style.display = 'block';
        }
    } else {
        popup.setPosition(undefined);
        popup.getElement().style.display = 'none';
    }
});

map.on('dblclick', function() {
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

document.getElementById('locateBtn').addEventListener('click', function() {
    if (!watching) {
        if ('geolocation' in navigator) {
            firstPosition = true;
            watchId = navigator.geolocation.watchPosition(
                function(position) {
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
                function(error) { alert('获取位置失败：' + error.message); },
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
switchBtn.addEventListener('click', function() {
    const isVectorVisible = vecLayer.getVisible();
    if (isVectorVisible) {
        vecLayer.setVisible(false);
        cvaLayer.setVisible(false);
        esriImagery.setVisible(true);
        this.classList.add('active');   // 影像模式激活
    } else {
        vecLayer.setVisible(true);
        cvaLayer.setVisible(true);
        esriImagery.setVisible(false);
        this.classList.remove('active'); // 矢量模式非激活
    }
});

// ==================== 测量功能 ====================
const measureLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ff33cc', width: 3, lineDash: [5,5] }),
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
map.getInteractions().forEach(function(interaction) {
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
    console.log('activateMeasurement called, type:', type);
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

    // 确保 measureLayer 存在且 source 可用
    console.log('measureLayer source:', measureLayer.getSource());

    measureDraw = new ol.interaction.Draw({
        source: measureLayer.getSource(),
        type: type === 'length' ? 'LineString' : 'Polygon'
    });
    console.log('measureDraw created:', measureDraw);

    measureDraw.on('drawstart', function(evt) {
        console.log('drawstart event');
        const sketch = evt.feature;
        const listener = sketch.getGeometry().on('change', function(evt) {
            const geom = evt.target;
            if (type === 'length') {
                const length = ol.sphere.getLength(geom, { projection: 'EPSG:3857' });
                measureResult.innerHTML = formatLength(length);
            } else {
                const area = ol.sphere.getArea(geom, { projection: 'EPSG:3857' });
                measureResult.innerHTML = formatArea(area);
            }
        });
        sketch.once('change', function() {
            ol.Observable.unByKey(listener);
        });
    });

    measureDraw.on('drawend', function(evt) {
        console.log('drawend event');
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
    console.log('interactions after add:', map.getInteractions().getArray());
}

measureLengthBtn.addEventListener('click', function() {
    if (measureActive && currentMeasureType === 'length') {
        deactivateMeasurement();
    } else {
        activateMeasurement('length');
    }
});

measureAreaBtn.addEventListener('click', function() {
    if (measureActive && currentMeasureType === 'area') {
        deactivateMeasurement();
    } else {
        activateMeasurement('area');
    }
});

// ==================== 潮汐功能 ====================
// 获取DOM元素
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

tideBtn.addEventListener('click', async function() {
    const center = map.getView().getCenter();
    const lonLat = ol.proj.toLonLat(center);
    await fetchTideData(lonLat[0].toFixed(4), lonLat[1].toFixed(4));
});

// 全局图表实例
let tideChartInstance = null;

function renderTideChart(tideHourly, useFullData = false) {
    console.log('renderTideChart 被调用，数据长度:', tideHourly.length, 'useFullData:', useFullData);
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
                return `${d.getMonth()+1}/${d.getDate()} ${hour}:00`;
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
                label: '潮高 (米)',
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

console.log('地图加载完成，照片点数量：', photoPoints.features.length);