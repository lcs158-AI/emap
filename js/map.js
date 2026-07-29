﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿//================== 地图初始化 ====================
// 触摸检测
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
document.body.classList.add(isTouchDevice ? 'touch' : 'no-touch');
// 存储动态加载的图层（用于图层管理）
window.dynamicLayers = [];
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
// 将地图实例赋值给window对象，以便在其他文件中访问
window.map = map;

// 按顺序添加图层
map.addLayer(esriImagery);

// 检查是否在 lzywhy.com 域名下运行
function isOnLzywhyDomain() {
    const hostname = window.location.hostname;
    return hostname === 'lzywhy.com' || hostname.endsWith('.lzywhy.com');
}

// 只有在 lzywhy.com 域名下才加载天地图
if (isOnLzywhyDomain()) {
    esriImagery.setVisible(false);
    map.addLayer(vecLayer);
    map.addLayer(cvaLayer);
} else {
    esriImagery.setVisible(true);
}

// 确保标注层始终在最上面
function bringCvaLayerToTop() {
    if (isOnLzywhyDomain()) {
        map.removeLayer(cvaLayer);
        map.addLayer(cvaLayer);
    }
}

// ==================== 从后端API加载用户数据 ====================
// 标记是否已加载用户数据
let userDataLoaded = false;

// 从 URL 参数中获取用户名
function getUsernameFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('user');
}

// 页面加载时立即检查是否有上传标记
window.addEventListener('load', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const uploaded = urlParams.get('uploaded');
    if (uploaded === '1') {
        setTimeout(() => {
            centerMapToUploadedData();
        }, 1000);
    }
});

// 跳转到上传的数据位置
function centerMapToUploadedData() {
    let allCoordinates = [];
    
    window.dynamicLayers.forEach((layerItem) => {
        const layer = layerItem.layer;
        const source = layer.getSource();
        const features = source.getFeatures();
        
        features.forEach((feature) => {
            const geometry = feature.getGeometry();
            if (geometry && (geometry.getType() === 'Point' || geometry.getType() === 'MultiPoint')) {
                const coordinates = geometry.getCoordinates();
                if (Array.isArray(coordinates)) {
                    if (Array.isArray(coordinates[0])) {
                        allCoordinates.push(...coordinates);
                    } else {
                        allCoordinates.push(coordinates);
                    }
                }
            }
        });
    });
    
    if (allCoordinates.length > 0) {
        const projectedCoordinates = allCoordinates.map(coord => {
            return ol.proj.fromLonLat(coord);
        });
        
        const olExtent = ol.extent.boundingExtent(projectedCoordinates);
        
        if (ol.extent.getWidth(olExtent) > 0 && ol.extent.getHeight(olExtent) > 0) {
            view.fit(olExtent, {
                padding: [50, 50, 50, 50],
                duration: 1000
            });
        } else {
            if (projectedCoordinates.length > 0) {
                view.setCenter(projectedCoordinates[0]);
                view.setZoom(15);
            }
        }
    } else {
        loadUploadpicData();
        
        setTimeout(() => {
            centerMapToUploadedData();
        }, 2000);
    }
}

// 添加 GeoJSON 图层到地图
function addGeoJsonLayer(geoJson, name, config) {
    try {
        // 将 GeoJSON 转换为 OpenLayers 要素
        const features = new ol.format.GeoJSON().readFeatures(geoJson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        
        
        
        // 创建矢量图层
        const vectorLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features: features }),
            style: function(feature) {
                // 使用配置中的样式，或者默认样式
                const styleConfig = config.style || {};
                
                if (feature.getGeometry().getType() === 'Point') {
                    return new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: styleConfig.pointRadius || 8,
                            fill: new ol.style.Fill({
                                color: styleConfig.fillColor || '#ff0000'
                            }),
                            stroke: new ol.style.Stroke({
                                color: styleConfig.strokeColor || '#ffffff',
                                width: styleConfig.strokeWidth || 2
                            })
                        })
                    });
                } else if (feature.getGeometry().getType() === 'Polygon') {
                    return new ol.style.Style({
                        fill: new ol.style.Fill({
                            color: styleConfig.fillColor || 'rgba(0, 128, 255, 0.3)'
                        }),
                        stroke: new ol.style.Stroke({
                            color: styleConfig.strokeColor || '#0066cc',
                            width: styleConfig.strokeWidth || 2
                        })
                    });
                }
                return new ol.style.Style();
            }
        });
        
        // 设置图层属性
        vectorLayer.set('name', name);
        vectorLayer.set('linkField', config.link_field || 'filename');
        vectorLayer.set('linkPathPrefix', 'http://localhost:8082/PICS/');
        vectorLayer.set('labelField', config.label_field || 'datetime');
        
        // 添加到地图
        map.addLayer(vectorLayer);
        
        // 添加到动态图层列表（用于图层管理）
        window.dynamicLayers.push({
            name: name,
            layer: vectorLayer,
            visible: true,
            linkField: config.link_field || 'filename',
            linkPathPrefix: 'http://localhost:8082/PICS/',
            labelField: config.label_field || 'datetime',
            style: config.style || {}
        });
        
        
        
    } catch (error) {
        console.error('加载 GeoJSON 失败:', error);
    }
}


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

/**
 * 显示要素弹出框
 */
function showFeaturePopup(feature, coordinate) {
    const layer = feature.get('layer');
    let content = '';

    if (layer && layer.linkField) {
        const imgFile = feature.get(layer.linkField);
        if (imgFile) {
            const labelText = layer.labelField ? feature.get(layer.labelField) : '';
            const pathPrefix = layer.linkPathPrefix || '/pics/';
            const normalizedPrefix = pathPrefix.endsWith('/') ? pathPrefix : pathPrefix + '/';
            
            let fullPath;
            if (imgFile.startsWith('/') || imgFile.includes('/')) {
                fullPath = imgFile;
            } else {
                fullPath = normalizedPrefix + imgFile;
            }
            
            const isLocalPath = fullPath.startsWith('file:///') || /^[a-zA-Z]:[\\/]/.test(fullPath);
            
            if (isLocalPath) {
                content = `
                    <div class="popup-content" style="position: relative;">
                        <button onclick="closePopup()" style="position: absolute; top: -10px; right: -10px; width: 24px; height: 24px; border: none; background: #ff4d4f; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center; padding: 0; z-index: 10;">×</button>
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
                content = `
                    <div class="popup-content" style="text-align: center; position: relative;">
                        <button onclick="closePopup()" style="position: absolute; top: -10px; right: -10px; width: 24px; height: 24px; border: none; background: #ff4d4f; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center; padding: 0; z-index: 10;">×</button>
                        <b>${labelText}</b><br>
                        <div class="popup-image-container" style="position: relative; margin-top: 8px; cursor: zoom-in; display: inline-block;" onclick="openImageViewer('${fullPath}', '${labelText}')">
                            <img src="${fullPath}" alt="照片" style="max-width: 100%; max-height: 400px; border-radius: 4px; display: block; margin: 0 auto;" onerror="this.onerror=null; this.parentElement.parentElement.innerHTML='<button onclick=\\'closePopup()\\' style=\\'position:absolute;top:-10px;right:-10px;width:24px;height:24px;border:none;background:#ff4d4f;color:white;border-radius:50%;cursor:pointer;font-size:14px;line-height:24px;text-align:center;padding:0;z-index:10;\\'>×</button><b>${labelText}</b><br><div style=\\'background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;padding:10px;margin-top:8px;font-size:12px;color:#721c24;\\'>❌ 图片加载失败<br>路径：${fullPath}</div>';">
                            <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; pointer-events: none;">
                                🔍 点击查看大图
                            </div>
                        </div>
                    </div>
                `;
            }
        } else {
            const labelText = layer.labelField ? feature.get(layer.labelField) : '';
            content = `<div style="position: relative; padding-top: 5px;"><button onclick="closePopup()" style="position: absolute; top: -15px; right: -15px; width: 24px; height: 24px; border: none; background: #ff4d4f; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center; padding: 0; z-index: 10;">×</button><b>${labelText}</b></div>`;
        }
    }
    else if (layer && layer.labelField) {
        const labelText = feature.get(layer.labelField);
        content = `<div style="position: relative; padding-top: 5px;"><button onclick="closePopup()" style="position: absolute; top: -15px; right: -15px; width: 24px; height: 24px; border: none; background: #ff4d4f; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center; padding: 0; z-index: 10;">×</button><b>${labelText}</b></div>`;
    } else if (feature.get('DD')) {
        const labelText = feature.get('DD');
        content = `<div style="position: relative; padding-top: 5px;"><button onclick="closePopup()" style="position: absolute; top: -15px; right: -15px; width: 24px; height: 24px; border: none; background: #ff4d4f; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center; padding: 0; z-index: 10;">×</button><b>${labelText}</b></div>`;
    } else {
        content = `<div style="position: relative; padding-top: 5px;"><button onclick="closePopup()" style="position: absolute; top: -15px; right: -15px; width: 24px; height: 24px; border: none; background: #ff4d4f; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center; padding: 0; z-index: 10;">×</button><b>要素</b></div>`;
    }

    popup.getElement().innerHTML = content;
    popup.setPosition(coordinate);
    popup.getElement().style.display = 'block';
}

map.on('dblclick', function () {
    if (measureActive) return;
    popup.setPosition(undefined);
    popup.getElement().style.display = 'none';
});

/**
 * 关闭弹出框
 */
function closePopup() {
    popup.setPosition(undefined);
    popup.getElement().style.display = 'none';
}

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

// 我的按钮下拉菜单
const myBtn = document.getElementById('myBtn');
const myDropdown = document.getElementById('myDropdown');

if (myBtn && myDropdown) {
    myBtn.addEventListener('click', function() {
        myDropdown.style.display = myDropdown.style.display === 'block' ? 'none' : 'block';
    });
}

// 点击页面其他地方关闭下拉菜单
window.addEventListener('click', function(event) {
    if (!event.target.closest('.dropdown')) {
        if (myDropdown) {
            myDropdown.style.display = 'none';
        }
        if (measureDropdown) {
            measureDropdown.style.display = 'none';
        }
        if (weatherDropdown) {
            weatherDropdown.style.display = 'none';
        }
    }
});

// 上传按钮事件已在 IIFE 中定义（第5870行附近）

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
        // 切换到影像图
        vecLayer.setVisible(false);
        cvaLayer.setVisible(true); // 保持标注层可见
        esriImagery.setVisible(true);
        // 确保标注层在影像层上面
        bringCvaLayerToTop();
        this.classList.add('active');
    } else {
        // 切换到矢量图
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

let searchActive = false;
let clickWeatherActive = false;
const citySearchBtn = document.getElementById('cityWeatherBtn') || document.getElementById('citySearchBtn');
const citySearchWrapper = document.getElementById('citySearchWrapper');
const citySearchInput = document.getElementById('citySearchInput');
const clickWeatherBtn = document.getElementById('clickWeatherBtn');

// 获取双击缩放交互
let dblClickZoomInteraction = null;
map.getInteractions().forEach(function (interaction) {
    if (interaction instanceof ol.interaction.DoubleClickZoom) {
        dblClickZoomInteraction = interaction;
    }
});

function deactivateAllTools() {
    if (measureActive) {
        deactivateMeasurement();
    }
    if (searchActive) {
        deactivateSearch();
    }
    if (clickWeatherActive) {
        clickWeatherActive = false;
        if (clickWeatherBtn) {
            clickWeatherBtn.classList.remove('active');
        }
    }
    if (drawMode) {
        stopDraw();
    }
}

function deactivateSearch() {
    searchActive = false;
    if (citySearchBtn) {
        citySearchBtn.classList.remove('active');
    }
    if (citySearchWrapper) {
        citySearchWrapper.style.display = 'none';
    }
}

function toggleClickWeather() {
    if (clickWeatherActive) {
        clickWeatherActive = false;
        if (clickWeatherBtn) {
            clickWeatherBtn.classList.remove('active');
        }
    } else {
        deactivateAllTools();
        clickWeatherActive = true;
        if (clickWeatherBtn) {
            clickWeatherBtn.classList.add('active');
        }
    }
}

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

    if (measureActive) {
        // 如果已经激活了测量功能，只需要更换测量类型，不清除之前的测量结果
        if (currentMeasureType !== type) {
            // 更换测量类型时，只需要移除当前的绘制交互，不需要清除图层
            if (measureDraw) {
                map.removeInteraction(measureDraw);
                measureDraw = null;
            }
            currentMeasureType = type;
            
            // 更新按钮状态
            if (type === 'length') {
                measureLengthBtn.classList.add('active');
                measureAreaBtn.classList.remove('active');
            } else {
                measureAreaBtn.classList.add('active');
                measureLengthBtn.classList.remove('active');
            }
        } else {
            // 如果是相同类型，直接返回
            return;
        }
    } else {
        deactivateAllTools();
        measureActive = true;
        currentMeasureType = type;
        
        // 更新按钮状态
        if (type === 'length') {
            measureLengthBtn.classList.add('active');
            measureAreaBtn.classList.remove('active');
        } else {
            measureAreaBtn.classList.add('active');
            measureLengthBtn.classList.remove('active');
        }
        
        if (dblClickZoomInteraction) dblClickZoomInteraction.setActive(false);
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
let tideBtn, tidePanel, closeTideBtn, tideChartInstance;

// 在DOM加载完成后初始化潮汐功能
function initTideFunctionality() {
    tideBtn = document.getElementById('tideBtn');
    tidePanel = document.getElementById('tidePanel');
    closeTideBtn = document.getElementById('closeTideBtn');
    
    if (closeTideBtn) {
        closeTideBtn.addEventListener('click', () => {
            tidePanel.style.display = 'none';
        });
    }
    
    if (tideBtn) {
        tideBtn.addEventListener('click', async function () {
            const center = map.getView().getCenter();
            const lonLat = ol.proj.toLonLat(center);
            await fetchTideData(lonLat[0], lonLat[1]);
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

// 全局图表实例
// tideChartInstance 已在顶部定义

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
        

        // 获取配置文件的基准路径
        const configBasePath = configUrl.substring(0, configUrl.lastIndexOf('/') + 1) || '';
        

        // GeoJSON 文件的基础路径（可在配置文件中指定，默认为配置文件的基准路径）
        const geojsonBasePath = config.geojson_base_path !== undefined
            ? (config.geojson_base_path.startsWith('/')
                ? config.geojson_base_path
                : configBasePath + config.geojson_base_path)
            : configBasePath;
        

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
        window.dynamicLayers.forEach(item => map.removeLayer(item.layer));
        window.dynamicLayers = [];

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
            window.dynamicLayers.push(item); // 保持顺序与配置文件一致（正序）
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
        window.dynamicLayers.forEach(item => map.removeLayer(item.layer));
        window.dynamicLayers = [];
        // 清除图层控制面板
        const layerControl = document.getElementById('layerControl');
        if (layerControl) {
            layerControl.remove();
        }
        // 隐藏加载提示
        if (loadingPanel) {
            loadingPanel.style.display = 'none';
        }
        
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
    header.style.cursor = 'move';
    
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
    
    // 实现面板拖动功能
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(panel.style.left) || (window.innerWidth - panel.offsetWidth - 20);
        startTop = parseInt(panel.style.top) || (window.innerHeight - panel.offsetHeight - 20);
        panel.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        const newLeft = startLeft + dx;
        const newTop = startTop + dy;
        
        // 限制面板在视窗内
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;
        
        panel.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        panel.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'default';
    });
    
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
            
            // 移除图层按钮
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '🗑️';
            removeBtn.title = '移除图层';
            removeBtn.style.background = 'none';
            removeBtn.style.border = 'none';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.fontSize = '14px';
            removeBtn.style.padding = '2px 4px';
            removeBtn.style.marginLeft = '5px';
            removeBtn.addEventListener('click', () => {
                // 从地图中移除图层
                map.removeLayer(item.layer);
                // 从本地图层列表中移除
                localGeoJsonLayers.splice(index, 1);
                // 重新创建图层控制面板
                createLayerControl();
            });
            
            layerHeader.appendChild(leftSection);
            layerHeader.appendChild(infoBtn);
            layerHeader.appendChild(removeBtn);
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
    if (window.dynamicLayers.length > 0) {
        const dynamicTitle = document.createElement('div');
        dynamicTitle.textContent = '配置图层';
        dynamicTitle.style.fontWeight = 'bold';
        dynamicTitle.style.marginTop = '10px';
        dynamicTitle.style.marginBottom = '5px';
        dynamicTitle.style.fontSize = '12px';
        dynamicTitle.style.color = '#666';
        panel.appendChild(dynamicTitle);
        
        window.dynamicLayers.reverse().forEach((item, index) => {
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
            
            // 移除图层按钮
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '🗑️';
            removeBtn.title = '移除图层';
            removeBtn.style.background = 'none';
            removeBtn.style.border = 'none';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.fontSize = '14px';
            removeBtn.style.padding = '2px 4px';
            removeBtn.style.marginLeft = '5px';
            removeBtn.addEventListener('click', () => {
                // 从地图中移除图层
                map.removeLayer(item.layer);
                // 从动态图层列表中移除
                dynamicLayers.splice(index, 1);
                // 重新创建图层控制面板
                createLayerControl();
            });
            
            layerHeader.appendChild(leftSection);
            layerHeader.appendChild(infoBtn);
            layerHeader.appendChild(removeBtn);
            div.appendChild(layerHeader);
            
            panel.appendChild(div);
            console.log(`图层 ${item.name} visible: ${item.visible}`);
        });
        
        // 添加导出配置按钮（只有当有动态图层时显示）
        if (dynamicLayers.length > 0) {
            const exportConfigDiv = document.createElement('div');
            exportConfigDiv.style.marginTop = '15px';
            exportConfigDiv.style.paddingTop = '10px';
            exportConfigDiv.style.borderTop = '1px solid #eee';
            
            const exportConfigBtn = document.createElement('button');
            exportConfigBtn.textContent = '💾 导出图层配置';
            exportConfigBtn.style.width = '100%';
            exportConfigBtn.style.padding = '8px';
            exportConfigBtn.style.backgroundColor = '#52c41a';
            exportConfigBtn.style.color = 'white';
            exportConfigBtn.style.border = 'none';
            exportConfigBtn.style.borderRadius = '4px';
            exportConfigBtn.style.cursor = 'pointer';
            exportConfigBtn.style.fontSize = '12px';
            exportConfigBtn.addEventListener('click', exportLayerConfig);
            
            exportConfigDiv.appendChild(exportConfigBtn);
            panel.appendChild(exportConfigDiv);
        }
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

// 检测是否为file://协议
const isFileProtocol = window.location.protocol === 'file:';

// 检测是否为手机Chrome浏览器
const isMobileChrome = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent);

if (loadGeoJsonBtn) {
    loadGeoJsonBtn.addEventListener('click', function() {
        // 检测file://协议 + 手机浏览器
        if (isFileProtocol && isMobileChrome) {
            alert('⚠️ 手机Chrome浏览器不支持从文件打开。\n\n请选择以下方式之一：\n1. 使用微信浏览器打开\n2. 通过本地Web服务器访问\n3. 使用电脑端浏览器');
            return;
        }
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
            loadingProgress.textContent = '正在加载文件...';
        }
        
        const fileName = file.name.toLowerCase();
        console.log('开始加载本地文件:', file.name);
        console.log('文件扩展名检查:', fileName);
        
        // 使用正则表达式检查文件扩展名，更可靠
        if (/\.kmz$/.test(fileName)) {
            // 处理 KMZ 文件
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    console.log('KMZ 文件读取成功，准备解压');
                    loadLocalKMZ(event.target.result, file.name.replace(/\.kmz$/i, ''), loadingPanel, loadingProgress);
                } catch (error) {
                    console.error('KMZ 处理失败:', error);
                    // 显示错误提示
                    if (loadingPanel && loadingProgress) {
                        loadingProgress.textContent = '加载失败: ' + error.message;
                        setTimeout(() => {
                            loadingPanel.style.display = 'none';
                        }, 2000);
                    } else {
                        alert('文件解析失败：' + error.message);
                    }
                    
                    // 清空 input
                    geoJsonFileInput.value = '';
                }
            };
            
            reader.onerror = function() {
                console.error('读取文件失败');
                // 显示错误提示
                if (loadingPanel && loadingProgress) {
                    loadingProgress.textContent = '读取文件失败';
                    setTimeout(() => {
                        loadingPanel.style.display = 'none';
                    }, 2000);
                } else {
                    alert('读取文件失败');
                }
                
                // 清空 input
                geoJsonFileInput.value = '';
            };
            
            reader.readAsArrayBuffer(file);
        } else {
            // 处理其他文件格式
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    if (/\.(geojson|json)$/.test(fileName)) {
                        // 加载 GeoJSON
                        try {
                            const geoJson = JSON.parse(event.target.result);
                            console.log('GeoJSON 解析成功，准备加载到地图');
                            loadLocalGeoJSON(geoJson, file.name.replace(/\.(geojson|json)$/i, ''));
                        } catch (parseError) {
                            console.error('GeoJSON 解析失败:', parseError);
                            throw new Error('GeoJSON 文件解析失败: ' + parseError.message);
                        }
                    } else if (/\.kml$/.test(fileName)) {
                        // 加载 KML
                        try {
                            console.log('KML 文件读取成功，准备加载到地图');
                            loadLocalKML(event.target.result, file.name.replace(/\.kml$/i, ''));
                        } catch (parseError) {
                            console.error('KML 解析失败:', parseError);
                            throw new Error('KML 文件解析失败: ' + parseError.message);
                        }
                    } else if (/\.gml$/.test(fileName)) {
                        // 加载 GML
                        try {
                            console.log('GML 文件读取成功，准备加载到地图');
                            loadLocalGML(event.target.result, file.name.replace(/\.gml$/i, ''));
                        } catch (parseError) {
                            console.error('GML 解析失败:', parseError);
                            throw new Error('GML 文件解析失败: ' + parseError.message);
                        }
                    } else {
                        throw new Error('不支持的文件格式，请选择 .geojson、.json、.kml、.kmz 或 .gml 文件');
                    }
                    
                    // 隐藏加载提示
                    if (loadingPanel) {
                        loadingProgress.textContent = '加载完成';
                        setTimeout(() => {
                            loadingPanel.style.display = 'none';
                        }, 1000);
                    }
                    
                    // 清空 input，允许重复加载同一文件
                    geoJsonFileInput.value = '';
                    
                    console.log('本地文件加载完成:', file.name);
                } catch (error) {
                    console.error('解析文件失败:', error);
                    // 显示错误提示
                    if (loadingPanel && loadingProgress) {
                        loadingProgress.textContent = '加载失败: ' + error.message;
                        setTimeout(() => {
                            loadingPanel.style.display = 'none';
                        }, 2000);
                    } else {
                        alert('文件解析失败：' + error.message);
                    }
                    
                    // 清空 input
                    geoJsonFileInput.value = '';
                }
            };
            
            reader.onerror = function() {
                console.error('读取文件失败');
                // 显示错误提示
                if (loadingPanel && loadingProgress) {
                    loadingProgress.textContent = '读取文件失败';
                    setTimeout(() => {
                        loadingPanel.style.display = 'none';
                    }, 2000);
                } else {
                    alert('读取文件失败');
                }
                
                // 清空 input
                geoJsonFileInput.value = '';
            };
            
            reader.readAsText(file);
        }
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
            visible: true,
            style: {} // 初始化空样式对象
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
 * 加载本地 KML 数据到地图
 * @param {string} kmlText - KML 文本内容
 * @param {string} name - 图层名称
 */
function loadLocalKML(kmlText, name) {
    try {
        // 使用 OpenLayers KML 解析器
        const kmlFormat = new ol.format.KML({
            extractStyles: false, // 禁用 KML 样式，使用自定义样式
            extractAttributes: true, // 提取 KML 中的属性
            writeStyle: false
        });
        
        // 解析 KML 数据
        const features = kmlFormat.readFeatures(kmlText, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        
        console.log('成功加载本地 KML:', name, '要素数量:', features.length);
        
        // 为每个要素设置图层信息
        features.forEach(feature => {
            feature.set('layer', {
                labelField: 'name', // KML 通常使用 name 字段作为标签
                linkField: ''
            });
            
            // 打印要素属性，用于调试
            console.log('KML要素:', feature.get('name'), feature.getGeometry().getType());
        });
        
        // 创建矢量图层
        const vectorLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features }),
            style: function(feature) {
                // 强制使用自定义样式，确保点可见
                const geometryType = feature.getGeometry().getType();
                
                if (geometryType === 'Point') {
                    return new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 8, // 增大半径
                            fill: new ol.style.Fill({ color: 'rgba(255, 0, 0, 0.8)' }), // 红色
                            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                        }),
                        text: new ol.style.Text({
                            text: feature.get('name') || '',
                            offsetY: -15,
                            fill: new ol.style.Fill({ color: '#333' }),
                            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                        })
                    });
                } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: 'rgba(54, 162, 235, 0.9)',
                            width: 3
                        })
                    });
                } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                    return new ol.style.Style({
                        fill: new ol.style.Fill({
                            color: 'rgba(75, 192, 192, 0.3)'
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(75, 192, 192, 0.9)',
                            width: 2
                        })
                    });
                }
                
                return new ol.style.Style();
            },
            visible: true,
            properties: {
                labelField: 'name', // KML 通常使用 name 字段作为标签
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
            visible: true,
            style: {}, // 初始化空样式对象
            labelField: 'name' // 默认使用 name 字段作为标签
        });
        
        // 更新图层控制面板
        createLayerControl();
        
        // 自动缩放到图层范围
        zoomToLayerExtent(vectorLayer);
        
        console.log('本地 KML 图层已添加:', name);
        console.log('图层可见性:', vectorLayer.getVisible());
        console.log('图层源要素数量:', vectorLayer.getSource().getFeatures().length);
        
        // 检查图层是否在地图中
        const layers = map.getLayers().getArray();
        console.log('地图中的图层数量:', layers.length);
        layers.forEach((layer, index) => {
            if (layer === vectorLayer) {
                console.log('KML图层在地图中的索引:', index);
            }
        });
        
    } catch (error) {
        console.error('加载本地 KML 失败:', error);
        throw error;
    }
}

/**
 * 加载本地 GML 数据到地图
 * @param {string} gmlText - GML 文本内容
 * @param {string} name - 图层名称
 */
function loadLocalGML(gmlText, name) {
    try {
        // 使用 OpenLayers GML 解析器
        const gmlFormat = new ol.format.GML({
            extractAttributes: true,
            writeStyle: false
        });
        
        // 解析 GML 数据
        const features = gmlFormat.readFeatures(gmlText, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        
        // 为每个要素设置默认属性
        features.forEach(function(feature) {
            // 设置默认名称
            if (!feature.get('name')) {
                feature.set('name', name + '-' + features.indexOf(feature));
            }
        });
        
        // 创建矢量图层
        const vectorLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features }),
            style: function(feature) {
                const geometryType = feature.getGeometry().getType();
                
                if (geometryType === 'Point') {
                    return new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 8,
                            fill: new ol.style.Fill({ color: 'rgba(255, 0, 0, 0.8)' }),
                            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                        }),
                        text: new ol.style.Text({
                            text: feature.get('name') || '',
                            offsetY: -15,
                            fill: new ol.style.Fill({ color: '#333' }),
                            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                        })
                    });
                } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: 'rgba(54, 162, 235, 0.9)',
                            width: 3
                        })
                    });
                } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                    return new ol.style.Style({
                        fill: new ol.style.Fill({
                            color: 'rgba(75, 192, 192, 0.3)'
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(75, 192, 192, 0.9)',
                            width: 2
                        })
                    });
                }
                
                return new ol.style.Style();
            },
            visible: true,
            properties: {
                labelField: 'name',
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
            visible: true,
            style: {},
            labelField: 'name'
        });
        
        // 更新图层控制面板
        createLayerControl();
        
        // 自动缩放到图层范围
        zoomToLayerExtent(vectorLayer);
        
        console.log('本地 GML 图层已添加:', name);
        
    } catch (error) {
        console.error('加载本地 GML 失败:', error);
        throw error;
    }
}

/**
 * 加载本地 KMZ 数据到地图
 * @param {ArrayBuffer} kmzData - KMZ 文件的 ArrayBuffer
 * @param {string} name - 图层名称
 * @param {HTMLElement} loadingPanel - 加载提示面板
 * @param {HTMLElement} loadingProgress - 加载进度元素
 */
function loadLocalKMZ(kmzData, name, loadingPanel, loadingProgress) {
    try {
        // 检查是否有解压库
        if (typeof JSZip === 'undefined') {
            throw new Error('KMZ 解析需要 JSZip 库，请确保已加载该库');
        }
        
        console.log('开始解压 KMZ 文件');
        if (loadingProgress) {
            loadingProgress.textContent = '正在解压 KMZ 文件...';
        }
        
        // 使用 JSZip 解压
        JSZip.loadAsync(kmzData).then(function(zip) {
            console.log('KMZ 解压成功，查找 KML 文件');
            
            // 查找 KML 文件
            let kmlFileFound = false;
            zip.forEach(function(relativePath, zipEntry) {
                if (!kmlFileFound && zipEntry.name.toLowerCase().endsWith('.kml')) {
                    console.log('找到 KML 文件:', zipEntry.name);
                    kmlFileFound = true;
                    
                    // 读取 KML 文件内容
                    zipEntry.async('string').then(function(kmlText) {
                        console.log('KML 文件读取成功，准备加载到地图');
                        if (loadingProgress) {
                            loadingProgress.textContent = '正在加载 KML 数据...';
                        }
                        
                        // 使用现有的 KML 加载函数
                        loadLocalKML(kmlText, name);
                        
                        // 隐藏加载提示
                        if (loadingPanel) {
                            loadingProgress.textContent = '加载完成';
                            setTimeout(() => {
                                loadingPanel.style.display = 'none';
                            }, 1000);
                        }
                        
                        // 清空 input
                        const geoJsonFileInput = document.getElementById('geoJsonFileInput');
                        if (geoJsonFileInput) {
                            geoJsonFileInput.value = '';
                        }
                        
                        console.log('KMZ 文件加载完成:', name);
                    }).catch(function(error) {
                        console.error('读取 KML 文件失败:', error);
                        throw error;
                    });
                }
            });
            
            if (!kmlFileFound) {
                throw new Error('KMZ 文件中未找到 KML 文件');
            }
        }).catch(function(error) {
            console.error('KMZ 解压失败:', error);
            throw error;
        });
    } catch (error) {
        console.error('加载本地 KMZ 失败:', error);
        // 显示错误提示
        if (loadingPanel && loadingProgress) {
            loadingProgress.textContent = '加载失败: ' + error.message;
            setTimeout(() => {
                loadingPanel.style.display = 'none';
            }, 2000);
        } else {
            alert('文件解析失败：' + error.message);
        }
        
        // 清空 input
        const geoJsonFileInput = document.getElementById('geoJsonFileInput');
        if (geoJsonFileInput) {
            geoJsonFileInput.value = '';
        }
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
/**
 * 计算字段表达式的值并显示分类UI
 */
function evaluateExpression(expr, features, categoryValuesDiv, categoryStyles, presetColors, existingStyles) {
    expr = expr.trim();
    if (!expr) {
        categoryValuesDiv.innerHTML = '<div style="color: #999; font-size: 11px;">请输入表达式</div>';
        return;
    }

    // 安全计算表达式 - 替换字段名为特征值
    function computeExpr(feature) {
        const props = feature.getProperties();
        let evalExpr = expr;
        const fieldRegex = /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*/g;
        const reserved = ['Math', 'NaN', 'Infinity', 'parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'JSON', 'isNaN', 'isFinite', 'abs', 'round', 'floor', 'ceil', 'pow', 'sqrt', 'PI'];
        const matchedFields = evalExpr.match(fieldRegex) || [];
        matchedFields.forEach(field => {
             if (reserved.includes(field) || /^[0-9]+(\.[0-9]+)?$/.test(field)) return;
             if (props[field] !== undefined) {
                 var fval = props[field];
                 if (typeof fval === 'number' || (!isNaN(parseFloat(fval)) && isFinite(fval))) {
                     evalExpr = evalExpr.split(field).join('(' + (typeof fval === 'number' ? fval : parseFloat(fval)) + ')');
                 } else {
                     evalExpr = evalExpr.split(field).join('(0)');
                 }
             } else {
                 evalExpr = evalExpr.split(field).join('(0)');
             }
         });
        return Function('"use strict"; return (' + evalExpr + ')')();
    }

    // 计算所有特征值
    const computedValues = [];
    features.forEach(feature => {
        try {
            var val = computeExpr(feature);
            if (val !== undefined && val !== null && val !== '') {
                computedValues.push(parseFloat(parseFloat(val).toFixed(4)));
            }
        } catch(e) {}
    });

    if (computedValues.length === 0) {
        categoryValuesDiv.innerHTML = '<div style="color: #999; font-size: 11px;">表达式无法计算有效数值，请检查字段名是否正确</div>';
        return;
    }

    // 按数值范围分类
    categoryStyles._isNumeric = true;
    categoryStyles._isExpression = true;
    delete categoryStyles._numericRanges;

    var min = Math.min(...computedValues);
    var max = Math.max(...computedValues);
    var range = max - min;

    var minValue, maxValue;
    if (range === 0) {
        minValue = min * 0.9;
        maxValue = max * 1.1;
    } else {
        minValue = min - range * 0.1;
        maxValue = max + range * 0.1;
    }

    const rangeSection = document.createElement('div');
    rangeSection.style.marginBottom = '15px';
    rangeSection.style.padding = '10px';
    rangeSection.style.backgroundColor = '#e6f7ff';
    rangeSection.style.borderRadius = '4px';
    rangeSection.style.border = '1px solid #91d5ff';

    const rangeTitle = document.createElement('div');
    rangeTitle.textContent = '数值范围设置（表达式结果）';
    rangeTitle.style.fontWeight = 'bold';
    rangeTitle.style.fontSize = '12px';
    rangeTitle.style.marginBottom = '10px';
    rangeTitle.style.color = '#1890ff';
    rangeSection.appendChild(rangeTitle);

    const rangeInfo = document.createElement('div');
    rangeInfo.style.fontSize = '11px';
    rangeInfo.style.color = '#666';
    rangeInfo.style.marginBottom = '10px';
    rangeInfo.textContent = '表达式值范围：' + parseFloat(min).toFixed(2) + ' ~ ' + parseFloat(max).toFixed(2) + '，共 ' + computedValues.length + ' 个有效值';
    rangeSection.appendChild(rangeInfo);

    const rangeCountDiv = document.createElement('div');
    rangeCountDiv.style.display = 'flex';
    rangeCountDiv.style.alignItems = 'center';
    rangeCountDiv.style.marginBottom = '8px';

    const rangeCountLabel = document.createElement('label');
    rangeCountLabel.textContent = '分段数量:';
    rangeCountLabel.style.fontSize = '11px';
    rangeCountLabel.style.marginRight = '8px';
    rangeCountDiv.appendChild(rangeCountLabel);

    var rangeCountInput = document.createElement('input');
    rangeCountInput.type = 'number';
    rangeCountInput.id = 'rangeCountInput';
    rangeCountInput.min = '2';
    rangeCountInput.max = '20';
    rangeCountInput.value = existingStyles._rangeCount || '5';
    rangeCountInput.style.width = '60px';
    rangeCountInput.style.padding = '3px';
    rangeCountInput.style.fontSize = '11px';
    rangeCountInput.style.border = '1px solid #ddd';
    rangeCountInput.style.borderRadius = '3px';
    rangeCountDiv.appendChild(rangeCountInput);

    const rangeBtn = document.createElement('button');
    rangeBtn.textContent = '生成分段';
    rangeBtn.style.marginLeft = '8px';
    rangeBtn.style.padding = '3px 10px';
    rangeBtn.style.fontSize = '11px';
    rangeBtn.style.cursor = 'pointer';
    rangeBtn.style.border = '1px solid #1890ff';
    rangeBtn.style.backgroundColor = '#1890ff';
    rangeBtn.style.color = 'white';
    rangeBtn.style.borderRadius = '3px';
    rangeCountDiv.appendChild(rangeBtn);

    rangeSection.appendChild(rangeCountDiv);

    const rangesContainer = document.createElement('div');
    rangesContainer.id = 'rangesContainer';
    rangesContainer.style.maxHeight = '180px';
    rangesContainer.style.overflowY = 'auto';
    rangeSection.appendChild(rangesContainer);

    // 生成分段的函数
    function generateRanges() {
        rangesContainer.innerHTML = '';
        var count = parseInt(rangeCountInput.value) || 5;
        if (count < 2) count = 2;
        if (count > 20) count = 20;

        var step = (maxValue - minValue) / count;
        var ranges = [];
        for (var i = 0; i < count; i++) {
            var rangeStart = minValue + i * step;
            var rangeEnd = minValue + (i + 1) * step;
            var rangeLabel = parseFloat(rangeStart).toFixed(2) + ' ~ ' + parseFloat(rangeEnd).toFixed(2);
            ranges.push(rangeLabel);

            if (!categoryStyles[rangeLabel]) {
                categoryStyles[rangeLabel] = {};
            }
            if (!categoryStyles[rangeLabel].color) {
                categoryStyles[rangeLabel].color = presetColors[i % presetColors.length];
            }

            var matchingCount = 0;
            computedValues.forEach(v => {
                if (v >= rangeStart && (i === count - 1 ? v <= rangeEnd : v < rangeEnd)) {
                    matchingCount++;
                }
            });

            var rangeDiv = document.createElement('div');
            rangeDiv.style.marginBottom = '5px';
            rangeDiv.style.padding = '5px';
            rangeDiv.style.backgroundColor = 'white';
            rangeDiv.style.borderRadius = '3px';
            rangeDiv.style.border = '1px solid #e8e8e8';
            rangeDiv.style.display = 'flex';
            rangeDiv.style.alignItems = 'center';
            rangeDiv.style.justifyContent = 'space-between';

            var rangeLabelSpan = document.createElement('span');
            rangeLabelSpan.textContent = rangeLabel + ' (' + matchingCount + ')';
            rangeLabelSpan.style.fontSize = '11px';
            rangeLabelSpan.style.flex = '1';
            rangeDiv.appendChild(rangeLabelSpan);

            var colorBtn = document.createElement('button');
            colorBtn.textContent = '  ';
            colorBtn.style.width = '25px';
            colorBtn.style.height = '18px';
            colorBtn.style.backgroundColor = categoryStyles[rangeLabel].color;
            colorBtn.style.border = '1px solid #ddd';
            colorBtn.style.borderRadius = '3px';
            colorBtn.style.cursor = 'pointer';
            colorBtn.style.flexShrink = '0';
            rangeDiv.appendChild(colorBtn);

            var colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = categoryStyles[rangeLabel].color;
            colorInput.style.position = 'fixed';
            colorInput.style.top = '50%';
            colorInput.style.left = '50%';
            colorInput.style.zIndex = '100000';
            rangeDiv.appendChild(colorInput);

            colorBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                colorInput.click();
            });

            (function(currentLabel) {
                colorInput.addEventListener('change', function() {
                    colorBtn.style.backgroundColor = colorInput.value;
                    if (!categoryStyles[currentLabel]) categoryStyles[currentLabel] = {};
                    categoryStyles[currentLabel].color = colorInput.value;
                });
            })(rangeLabel);

            rangesContainer.appendChild(rangeDiv);
        }

        categoryStyles._numericRanges = ranges;
        categoryStyles._rangeCount = count;
        categoryStyles._rangeMin = minValue;
        categoryStyles._rangeMax = maxValue;
    }

    // 恢复之前保存的数值范围
    if (existingStyles._numericRanges && existingStyles._rangeCount) {
        // 找到之前已保存的分段，尝试恢复
        setTimeout(function() {
            var savedCount = existingStyles._rangeCount;
            if (savedCount && savedCount <= 20 && savedCount >= 2) {
                rangeCountInput.value = savedCount;
            }
            generateRanges();
        }, 100);
    } else {
        rangeBtn.addEventListener('click', generateRanges);
        generateRanges();
    }

    categoryValuesDiv.innerHTML = '';
    categoryValuesDiv.appendChild(rangeSection);
}

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
    
    // 检测图层几何类型
    const geometryTypes = new Set();
    features.forEach(feature => {
        const geom = feature.getGeometry();
        if (geom) {
            const type = geom.getType();
            if (type.includes('Point')) geometryTypes.add('Point');
            else if (type.includes('LineString')) geometryTypes.add('LineString');
            else if (type.includes('Polygon')) geometryTypes.add('Polygon');
        }
    });
    const layerGeometryType = geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'Mixed';
    
    // 样式设置部分
    const styleSection = document.createElement('div');
    styleSection.style.marginBottom = '15px';
    styleSection.style.padding = '15px';
    styleSection.style.backgroundColor = '#f8f9fa';
    styleSection.style.borderRadius = '4px';
    styleSection.style.border = '1px solid #e9ecef';
    
    const styleTitle = document.createElement('div');
    styleTitle.textContent = '样式设置';
    styleTitle.style.fontWeight = 'bold';
    styleTitle.style.marginBottom = '10px';
    styleTitle.style.fontSize = '14px';
    styleSection.appendChild(styleTitle);
    
    // 显示几何类型
    const geomTypeLabel = document.createElement('div');
    geomTypeLabel.innerHTML = `<span style="color: #666; font-size: 12px;">几何类型: <b>${layerGeometryType}</b></span>`;
    geomTypeLabel.style.marginBottom = '10px';
    styleSection.appendChild(geomTypeLabel);
    
    // 获取当前样式
    const currentStyle = item.style || {};
    
    // 点样式设置
    if (layerGeometryType === 'Point' || layerGeometryType === 'Mixed') {
        const pointStyleDiv = document.createElement('div');
        pointStyleDiv.style.marginBottom = '10px';
        pointStyleDiv.innerHTML = '<div style="font-size: 12px; margin-bottom: 5px;"><b>点样式</b></div>';
        
        // 点颜色 - 使用颜色选择器（手机端友好）
        const pointColorLabel = document.createElement('label');
        pointColorLabel.textContent = '颜色:';
        pointColorLabel.style.fontSize = '11px';
        pointColorLabel.style.marginRight = '5px';
        pointStyleDiv.appendChild(pointColorLabel);
        
        // 创建颜色选择按钮
        const pointColorBtn = document.createElement('button');
        pointColorBtn.id = 'stylePointColorBtn';
        pointColorBtn.style.width = '40px';
        pointColorBtn.style.height = '25px';
        pointColorBtn.style.backgroundColor = currentStyle.pointColor || '#1890ff';
        pointColorBtn.style.border = '2px solid #ddd';
        pointColorBtn.style.borderRadius = '4px';
        pointColorBtn.style.cursor = 'pointer';
        pointStyleDiv.appendChild(pointColorBtn);
        
        // 创建隐藏的颜色输入
        const pointColorInput = document.createElement('input');
        pointColorInput.type = 'color';
        pointColorInput.value = currentStyle.pointColor || '#1890ff';
        pointColorInput.id = 'stylePointColor';
        pointColorInput.style.position = 'absolute';
        pointColorInput.style.opacity = '0';
        pointColorInput.style.width = '0';
        pointColorInput.style.height = '0';
        pointColorInput.style.pointerEvents = 'none';
        pointStyleDiv.appendChild(pointColorInput);
        
        // 点击按钮触发颜色选择
        pointColorBtn.addEventListener('click', () => {
            pointColorInput.click();
        });
        
        // 颜色变化时更新按钮和值
        pointColorInput.addEventListener('input', () => {
            pointColorBtn.style.backgroundColor = pointColorInput.value;
        });
        pointColorInput.addEventListener('change', () => {
            pointColorBtn.style.backgroundColor = pointColorInput.value;
        });
        
        // 点大小
        const pointSizeLabel = document.createElement('label');
        pointSizeLabel.textContent = '大小:';
        pointSizeLabel.style.fontSize = '11px';
        pointSizeLabel.style.marginLeft = '10px';
        pointSizeLabel.style.marginRight = '5px';
        pointStyleDiv.appendChild(pointSizeLabel);
        
        const pointSizeInput = document.createElement('input');
        pointSizeInput.type = 'number';
        pointSizeInput.value = currentStyle.pointSize || '6';
        pointSizeInput.id = 'stylePointSize';
        pointSizeInput.style.width = '50px';
        pointSizeInput.style.padding = '2px 5px';
        pointSizeInput.style.fontSize = '11px';
        pointStyleDiv.appendChild(pointSizeInput);
        
        // 点符号选择
        const pointSymbolDiv = document.createElement('div');
        pointSymbolDiv.style.marginTop = '8px';
        
        const pointSymbolLabel = document.createElement('label');
        pointSymbolLabel.textContent = '符号:';
        pointSymbolLabel.style.fontSize = '11px';
        pointSymbolLabel.style.marginRight = '5px';
        pointSymbolDiv.appendChild(pointSymbolLabel);
        
        // 定义符号选项（包括 Emoji）
        const symbols = [
            { value: 'circle', label: '● 圆形', emoji: '●' },
            { value: 'square', label: '■ 方形', emoji: '■' },
            { value: 'triangle', label: '▲ 三角形', emoji: '▲' },
            { value: 'star', label: '★ 星形', emoji: '★' },
            { value: 'diamond', label: '◆ 菱形', emoji: '◆' },
            { value: 'cross', label: '✚ 十字', emoji: '✚' },
            { value: 'x', label: '✕ 叉号', emoji: '✕' },
            { value: '📍', label: '📍 定位', emoji: '📍' },
            { value: '📌', label: '📌 图钉', emoji: '📌' },
            { value: '🚩', label: '🚩 旗帜', emoji: '🚩' },
            { value: '🔴', label: '🔴 红圈', emoji: '🔴' },
            { value: '🟢', label: '🟢 绿圈', emoji: '🟢' },
            { value: '🔵', label: '🔵 蓝圈', emoji: '🔵' },
            { value: '🟡', label: '🟡 黄圈', emoji: '🟡' },
            { value: '⚠️', label: '⚠️ 警告', emoji: '⚠️' },
            { value: '❌', label: '❌ 错误', emoji: '❌' },
            { value: '✅', label: '✅ 正确', emoji: '✅' },
            { value: '❓', label: '❓ 问题', emoji: '❓' },
            { value: '💡', label: '💡 提示', emoji: '💡' },
            { value: '🔥', label: '🔥 热点', emoji: '🔥' },
            { value: '🏠', label: '🏠 房屋', emoji: '🏠' },
            { value: '🏢', label: '🏢 建筑', emoji: '🏢' },
            { value: '🚗', label: '🚗 汽车', emoji: '🚗' },
            { value: '🚢', label: '🚢 船只', emoji: '🚢' },
            { value: '✈️', label: '✈️ 飞机', emoji: '✈️' },
            { value: '📷', label: '📷 相机', emoji: '📷' },
            { value: '🎯', label: '🎯 目标', emoji: '🎯' },
            { value: '🌟', label: '🌟 星星', emoji: '🌟' },
            { value: '💎', label: '💎 钻石', emoji: '💎' },
            { value: '🌲', label: '🌲 树木', emoji: '🌲' }
        ];
        
        const pointSymbolSelect = document.createElement('select');
        pointSymbolSelect.id = 'stylePointSymbol';
        pointSymbolSelect.style.width = '120px';
        pointSymbolSelect.style.padding = '3px';
        pointSymbolSelect.style.fontSize = '11px';
        pointSymbolSelect.style.border = '1px solid #ddd';
        pointSymbolSelect.style.borderRadius = '3px';
        
        symbols.forEach(symbol => {
            const option = document.createElement('option');
            option.value = symbol.value;
            option.textContent = symbol.label;
            if (currentStyle.pointSymbol === symbol.value) {
                option.selected = true;
            }
            pointSymbolSelect.appendChild(option);
        });
        
        pointSymbolDiv.appendChild(pointSymbolSelect);
        pointStyleDiv.appendChild(pointSymbolDiv);
        
        styleSection.appendChild(pointStyleDiv);
    }
    
    // 线样式设置
    if (layerGeometryType === 'LineString' || layerGeometryType === 'Mixed') {
        const lineStyleDiv = document.createElement('div');
        lineStyleDiv.style.marginBottom = '10px';
        lineStyleDiv.innerHTML = '<div style="font-size: 12px; margin-bottom: 5px;"><b>线样式</b></div>';
        
        // 线颜色 - 使用颜色选择器（手机端友好）
        const lineColorLabel = document.createElement('label');
        lineColorLabel.textContent = '颜色:';
        lineColorLabel.style.fontSize = '11px';
        lineColorLabel.style.marginRight = '5px';
        lineStyleDiv.appendChild(lineColorLabel);
        
        // 创建颜色选择按钮
        const lineColorBtn = document.createElement('button');
        lineColorBtn.id = 'styleLineColorBtn';
        lineColorBtn.style.width = '40px';
        lineColorBtn.style.height = '25px';
        lineColorBtn.style.backgroundColor = currentStyle.lineColor || '#52c41a';
        lineColorBtn.style.border = '2px solid #ddd';
        lineColorBtn.style.borderRadius = '4px';
        lineColorBtn.style.cursor = 'pointer';
        lineStyleDiv.appendChild(lineColorBtn);
        
        // 创建隐藏的颜色输入
        const lineColorInput = document.createElement('input');
        lineColorInput.type = 'color';
        lineColorInput.value = currentStyle.lineColor || '#52c41a';
        lineColorInput.id = 'styleLineColor';
        lineColorInput.style.position = 'absolute';
        lineColorInput.style.opacity = '0';
        lineColorInput.style.width = '0';
        lineColorInput.style.height = '0';
        lineColorInput.style.pointerEvents = 'none';
        lineStyleDiv.appendChild(lineColorInput);
        
        // 点击按钮触发颜色选择
        lineColorBtn.addEventListener('click', () => {
            lineColorInput.click();
        });
        
        // 颜色变化时更新按钮和值
        lineColorInput.addEventListener('input', () => {
            lineColorBtn.style.backgroundColor = lineColorInput.value;
        });
        lineColorInput.addEventListener('change', () => {
            lineColorBtn.style.backgroundColor = lineColorInput.value;
        });
        
        // 线宽
        const lineWidthLabel = document.createElement('label');
        lineWidthLabel.textContent = '宽度:';
        lineWidthLabel.style.fontSize = '11px';
        lineWidthLabel.style.marginLeft = '10px';
        lineWidthLabel.style.marginRight = '5px';
        lineStyleDiv.appendChild(lineWidthLabel);
        
        const lineWidthInput = document.createElement('input');
        lineWidthInput.type = 'number';
        lineWidthInput.value = currentStyle.lineWidth || '2';
        lineWidthInput.id = 'styleLineWidth';
        lineWidthInput.style.width = '50px';
        lineWidthInput.style.padding = '2px 5px';
        lineWidthInput.style.fontSize = '11px';
        lineStyleDiv.appendChild(lineWidthInput);
        
        styleSection.appendChild(lineStyleDiv);
    }
    
    // 面样式设置
    if (layerGeometryType === 'Polygon' || layerGeometryType === 'Mixed') {
        const polygonStyleDiv = document.createElement('div');
        polygonStyleDiv.style.marginBottom = '10px';
        polygonStyleDiv.innerHTML = '<div style="font-size: 12px; margin-bottom: 5px;"><b>面样式</b></div>';
        
        // 填充颜色 - 使用颜色选择器（手机端友好）
        const fillColorLabel = document.createElement('label');
        fillColorLabel.textContent = '填充:';
        fillColorLabel.style.fontSize = '11px';
        fillColorLabel.style.marginRight = '5px';
        polygonStyleDiv.appendChild(fillColorLabel);
        
        // 填充颜色选择按钮
        const fillColorBtn = document.createElement('button');
        fillColorBtn.id = 'styleFillColorBtn';
        fillColorBtn.style.width = '35px';
        fillColorBtn.style.height = '22px';
        fillColorBtn.style.backgroundColor = currentStyle.fillColor || '#ffa500';
        fillColorBtn.style.border = '2px solid #ddd';
        fillColorBtn.style.borderRadius = '4px';
        fillColorBtn.style.cursor = 'pointer';
        polygonStyleDiv.appendChild(fillColorBtn);
        
        // 隐藏的颜色输入
        const fillColorInput = document.createElement('input');
        fillColorInput.type = 'color';
        fillColorInput.value = currentStyle.fillColor || '#ffa500';
        fillColorInput.id = 'styleFillColor';
        fillColorInput.style.position = 'absolute';
        fillColorInput.style.opacity = '0';
        fillColorInput.style.width = '0';
        fillColorInput.style.height = '0';
        fillColorInput.style.pointerEvents = 'none';
        polygonStyleDiv.appendChild(fillColorInput);
        
        fillColorBtn.addEventListener('click', () => {
            fillColorInput.click();
        });
        
        fillColorInput.addEventListener('input', () => {
            fillColorBtn.style.backgroundColor = fillColorInput.value;
        });
        fillColorInput.addEventListener('change', () => {
            fillColorBtn.style.backgroundColor = fillColorInput.value;
        });
        
        // 边框颜色 - 使用颜色选择器（手机端友好）
        const strokeColorLabel = document.createElement('label');
        strokeColorLabel.textContent = '边框:';
        strokeColorLabel.style.fontSize = '11px';
        strokeColorLabel.style.marginLeft = '8px';
        strokeColorLabel.style.marginRight = '5px';
        polygonStyleDiv.appendChild(strokeColorLabel);
        
        // 边框颜色选择按钮
        const strokeColorBtn = document.createElement('button');
        strokeColorBtn.id = 'styleStrokeColorBtn';
        strokeColorBtn.style.width = '35px';
        strokeColorBtn.style.height = '22px';
        strokeColorBtn.style.backgroundColor = currentStyle.strokeColor || '#ffa500';
        strokeColorBtn.style.border = '2px solid #ddd';
        strokeColorBtn.style.borderRadius = '4px';
        strokeColorBtn.style.cursor = 'pointer';
        polygonStyleDiv.appendChild(strokeColorBtn);
        
        // 隐藏的颜色输入
        const strokeColorInput = document.createElement('input');
        strokeColorInput.type = 'color';
        strokeColorInput.value = currentStyle.strokeColor || '#ffa500';
        strokeColorInput.id = 'styleStrokeColor';
        strokeColorInput.style.position = 'absolute';
        strokeColorInput.style.opacity = '0';
        strokeColorInput.style.width = '0';
        strokeColorInput.style.height = '0';
        strokeColorInput.style.pointerEvents = 'none';
        polygonStyleDiv.appendChild(strokeColorInput);
        
        strokeColorBtn.addEventListener('click', () => {
            strokeColorInput.click();
        });
        
        strokeColorInput.addEventListener('input', () => {
            strokeColorBtn.style.backgroundColor = strokeColorInput.value;
        });
        strokeColorInput.addEventListener('change', () => {
            strokeColorBtn.style.backgroundColor = strokeColorInput.value;
        });
        
        // 透明度
        const opacityLabel = document.createElement('label');
        opacityLabel.textContent = '透明度:';
        opacityLabel.style.fontSize = '11px';
        opacityLabel.style.marginLeft = '10px';
        opacityLabel.style.marginRight = '5px';
        polygonStyleDiv.appendChild(opacityLabel);
        
        const opacityInput = document.createElement('input');
        opacityInput.type = 'range';
        opacityInput.min = '0';
        opacityInput.max = '100';
        opacityInput.value = currentStyle.opacity || '30';
        opacityInput.id = 'styleOpacity';
        opacityInput.style.width = '60px';
        opacityInput.style.verticalAlign = 'middle';
        polygonStyleDiv.appendChild(opacityInput);
        
        const opacityValue = document.createElement('span');
        opacityValue.textContent = (currentStyle.opacity || '30') + '%';
        opacityValue.id = 'opacityValue';
        opacityValue.style.fontSize = '11px';
        opacityValue.style.marginLeft = '3px';
        polygonStyleDiv.appendChild(opacityValue);
        
        opacityInput.addEventListener('input', () => {
            opacityValue.textContent = opacityInput.value + '%';
        });
        
        styleSection.appendChild(polygonStyleDiv);
    }
    
    // 分类样式设置
    const categoryStyleSection = document.createElement('div');
    categoryStyleSection.style.marginBottom = '15px';
    categoryStyleSection.style.padding = '15px';
    categoryStyleSection.style.backgroundColor = '#f0f8ff';
    categoryStyleSection.style.borderRadius = '4px';
    categoryStyleSection.style.border = '1px solid #b0d4f1';
    
    const categoryStyleTitle = document.createElement('div');
    categoryStyleTitle.textContent = '分类样式设置';
    categoryStyleTitle.style.fontWeight = 'bold';
    categoryStyleTitle.style.marginBottom = '10px';
    categoryStyleTitle.style.fontSize = '14px';
    categoryStyleTitle.style.color = '#1890ff';
    categoryStyleSection.appendChild(categoryStyleTitle);
    
    // 分类字段选择
    const categoryFieldDiv = document.createElement('div');
    categoryFieldDiv.style.marginBottom = '10px';
    
    const categoryFieldLabel = document.createElement('label');
    categoryFieldLabel.textContent = '分类字段:';
    categoryFieldLabel.style.fontSize = '11px';
    categoryFieldLabel.style.marginRight = '5px';
    categoryFieldDiv.appendChild(categoryFieldLabel);
    
    const categoryFieldSelect = document.createElement('select');
    categoryFieldSelect.id = 'categoryField';
    categoryFieldSelect.style.width = '120px';
    categoryFieldSelect.style.padding = '3px';
    categoryFieldSelect.style.fontSize = '11px';
    categoryFieldSelect.style.border = '1px solid #ddd';
    categoryFieldSelect.style.borderRadius = '3px';
    
    // 添加空选项
    const emptyCategoryOption = document.createElement('option');
    emptyCategoryOption.value = '';
    emptyCategoryOption.textContent = '-- 不分类 --';
    categoryFieldSelect.appendChild(emptyCategoryOption);
    
    // 辅助函数：检测字段类型
    function getFieldType(fieldName) {
        let hasNumeric = false;
        let hasString = false;
        let hasBoolean = false;
        let hasDate = false;
        let hasOther = false;
        let totalCount = 0;
        let dateCount = 0;

        // 日期正则：匹配常见日期格式
        const datePatterns = [
            /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/,
            /^\d{4}年\d{1,2}月\d{1,2}日/,
            /^\d{1,2}[-/]\d{1,2}[-/]\d{4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/,
            /^\d{1,2}\.\d{1,2}\.\d{4}/
        ];

        function isDateValue(val) {
            if (typeof val === 'number') {
                if (val > 1000000000 && val < 20000000000000) return true;
                return false;
            }
            if (typeof val === 'string') {
                for (let p of datePatterns) {
                    if (p.test(val.trim())) return true;
                }
                var d = new Date(val);
                if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
                    return true;
                }
            }
            return false;
        }

        features.forEach(feature => {
            const value = feature.get(fieldName);
            if (value === undefined || value === null || value === '') return;

            totalCount++;
            const type = typeof value;
            if (type === 'number') {
                if (isDateValue(value)) {
                    dateCount++;
                    hasDate = true;
                } else {
                    hasNumeric = true;
                }
            } else if (type === 'boolean') {
                hasBoolean = true;
            } else if (type === 'string') {
                if (isDateValue(value)) {
                    dateCount++;
                    hasDate = true;
                } else if (!isNaN(parseFloat(value)) && isFinite(value)) {
                    hasNumeric = true;
                } else {
                    hasString = true;
                }
            } else {
                hasOther = true;
            }
        });

        if (hasDate && dateCount >= totalCount * 0.5) return 'date';
        if (hasBoolean && !hasNumeric && !hasString && !hasOther) return 'boolean';
        if (hasNumeric && !hasString && !hasOther) return 'numeric';
        if (hasString || hasOther) return 'string';
        return 'unknown';
    }
    
    // 添加符合条件的字段（字符型、数值型、逻辑型、日期型）
    fieldList.forEach(field => {
        const fieldType = getFieldType(field);
        // 只允许字符型、数值型、逻辑型和日期型字段
        if (fieldType === 'string' || fieldType === 'numeric' || fieldType === 'boolean' || fieldType === 'date') {
            const option = document.createElement('option');
            option.value = field;
            // 显示字段名和类型
            const typeLabel = fieldType === 'numeric' ? '(数值)' : fieldType === 'boolean' ? '(逻辑)' : fieldType === 'date' ? '(日期)' : '(字符)';
            option.textContent = field + ' ' + typeLabel;
            option.dataset.fieldType = fieldType;
            if (item.categoryField === field) {
                option.selected = true;
            }
            categoryFieldSelect.appendChild(option);
        }
    });
    
    // 添加表达式选项
    const exprOption = document.createElement('option');
    exprOption.value = '__expression__';
    exprOption.textContent = '✏️ 字段表达式...';
    exprOption.dataset.fieldType = 'numeric';
    if (item.categoryField && item.categoryField.startsWith('__expr__:')) {
        exprOption.selected = true;
    }
    categoryFieldSelect.appendChild(exprOption);
    
    // 表达式输入框（默认隐藏）
    const exprInputDiv = document.createElement('div');
    exprInputDiv.id = 'exprInputDiv';
    exprInputDiv.style.marginTop = '8px';
    exprInputDiv.style.marginBottom = '5px';
    exprInputDiv.style.display = 'none';
    
    const exprLabel = document.createElement('label');
    exprLabel.textContent = '字段表达式:';
    exprLabel.style.fontSize = '11px';
    exprLabel.style.fontWeight = 'bold';
    exprLabel.style.display = 'block';
    exprLabel.style.marginBottom = '3px';
    exprInputDiv.appendChild(exprLabel);
    
    const exprHelp = document.createElement('div');
    exprHelp.textContent = '例: height - 10,  field1 * 0.5 - field2,  (a + b) / c';
    exprHelp.style.fontSize = '10px';
    exprHelp.style.color = '#888';
    exprHelp.style.marginBottom = '4px';
    exprInputDiv.appendChild(exprHelp);
    
    const exprInput = document.createElement('input');
    exprInput.type = 'text';
    exprInput.id = 'exprInput';
    exprInput.placeholder = '输入表达式...';
    exprInput.style.width = '100%';
    exprInput.style.padding = '4px';
    exprInput.style.fontSize = '12px';
    exprInput.style.border = '1px solid #ddd';
    exprInput.style.borderRadius = '3px';
    exprInput.style.boxSizing = 'border-box';
    // 恢复已保存的表达式
    if (item.categoryField && item.categoryField.startsWith('__expr__:')) {
        exprInput.value = item.categoryField.replace('__expr__:', '');
        exprInputDiv.style.display = 'block';
    }
    exprInputDiv.appendChild(exprInput);
    
    // 表达式输入实时计算
    var exprTimeout;
    exprInput.addEventListener('keyup', function() {
        clearTimeout(exprTimeout);
        exprTimeout = setTimeout(function() {
            if (exprInput.value.trim()) {
                var select = document.getElementById('categoryFieldSelect');
                if (select && select.value === '__expression__') {
                    evaluateExpression(exprInput.value.trim(), features, categoryValuesDiv, categoryStyles, presetColors, item.categoryStyles || {})
                }
            }
        }, 500);
    });
    
    categoryFieldDiv.appendChild(categoryFieldSelect);
    categoryFieldDiv.appendChild(exprInputDiv);
    categoryStyleSection.appendChild(categoryFieldDiv);
    
    // 分类值和样式设置区域
    const categoryValuesDiv = document.createElement('div');
    categoryValuesDiv.id = 'categoryValuesDiv';
    categoryValuesDiv.style.maxHeight = '200px';
    categoryValuesDiv.style.overflowY = 'auto';
    categoryValuesDiv.style.border = '1px solid #e8e8e8';
    categoryValuesDiv.style.borderRadius = '4px';
    categoryValuesDiv.style.padding = '8px';
    categoryValuesDiv.style.backgroundColor = '#fafafa';
    
    // 存储分类样式的对象 - 使用对象确保引用不变
    const categoryStyles = item.categoryStyles || {};
    
    // 当选择分类字段时，显示该字段的所有唯一值
    categoryFieldSelect.addEventListener('change', () => {
        const selectedField = categoryFieldSelect.value;
        const selectedOption = categoryFieldSelect.options[categoryFieldSelect.selectedIndex];
        
        // 处理表达式输入框显示
        const exprInputDiv = document.getElementById('exprInputDiv');
        const exprInput = document.getElementById('exprInput');
        if (exprInputDiv && exprInput) {
            if (selectedField === '__expression__') {
                exprInputDiv.style.display = 'block';
                // 如果有表达式内容，触发计算
                if (exprInput.value.trim()) {
                    evaluateExpression(exprInput.value.trim(), features, categoryValuesDiv, categoryStyles, presetColors);
                }
            } else {
                exprInputDiv.style.display = 'none';
            }
        }
        
        const fieldType = selectedOption ? selectedOption.dataset.fieldType : 'string';
        
        categoryValuesDiv.innerHTML = '';
        
        if (!selectedField) {
            categoryValuesDiv.style.display = 'none';
            return;
        }
        
        categoryValuesDiv.style.display = 'block';
        
        // 预设颜色列表
        const presetColors = ['#ff4d4f', '#52c41a', '#1890ff', '#faad14', '#722ed1', '#eb2f96', '#13c2c2', '#fa8c16', '#a0d911', '#2f54eb'];
        
        // 数值型字段：提供数值段分类选项
        if (fieldType === 'numeric') {
            // 收集所有数值
            const numericValues = [];
            features.forEach(feature => {
                const value = feature.get(selectedField);
                if (value !== undefined && value !== null && value !== '') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        numericValues.push(numValue);
                    }
                }
            });
            
            if (numericValues.length === 0) {
                categoryValuesDiv.innerHTML = '<div style="color: #999; font-size: 11px;">该字段没有可用数值</div>';
                return;
            }
            
            // 计算数值范围
            const minValue = Math.min(...numericValues);
            const maxValue = Math.max(...numericValues);
            
            // 创建数值段设置区域
            const rangeSection = document.createElement('div');
            rangeSection.style.marginBottom = '15px';
            rangeSection.style.padding = '10px';
            rangeSection.style.backgroundColor = '#e6f7ff';
            rangeSection.style.borderRadius = '4px';
            rangeSection.style.border = '1px solid #91d5ff';
            
            const rangeTitle = document.createElement('div');
            rangeTitle.textContent = `数值范围: ${minValue.toFixed(2)} - ${maxValue.toFixed(2)}`;
            rangeTitle.style.fontWeight = 'bold';
            rangeTitle.style.fontSize = '12px';
            rangeTitle.style.marginBottom = '10px';
            rangeTitle.style.color = '#1890ff';
            rangeSection.appendChild(rangeTitle);
            
            // 数值段列表容器
            const rangesContainer = document.createElement('div');
            rangesContainer.id = 'numericRangesContainer';
            rangeSection.appendChild(rangesContainer);
            
            // 添加数值段按钮
            const addRangeBtn = document.createElement('button');
            addRangeBtn.textContent = '+ 添加数值段';
            addRangeBtn.style.marginTop = '10px';
            addRangeBtn.style.padding = '5px 10px';
            addRangeBtn.style.border = '1px solid #1890ff';
            addRangeBtn.style.backgroundColor = '#fff';
            addRangeBtn.style.color = '#1890ff';
            addRangeBtn.style.borderRadius = '3px';
            addRangeBtn.style.cursor = 'pointer';
            addRangeBtn.style.fontSize = '11px';
            
            let rangeIndex = 0;
            
            // 存储数值段样式
            if (!categoryStyles._numericRanges) {
                categoryStyles._numericRanges = [];
            }
            
            // 添加数值段函数
            function addRangeRow(min, max, color, symbol, size) {
                const rangeId = rangeIndex++;
                const rangeRow = document.createElement('div');
                rangeRow.className = 'numeric-range-row';
                rangeRow.dataset.rangeId = rangeId;
                rangeRow.style.marginBottom = '10px';
                rangeRow.style.padding = '8px';
                rangeRow.style.backgroundColor = 'white';
                rangeRow.style.borderRadius = '3px';
                rangeRow.style.border = '1px solid #d9d9d9';
                
                // 范围输入
                const rangeInputRow = document.createElement('div');
                rangeInputRow.style.display = 'flex';
                rangeInputRow.style.alignItems = 'center';
                rangeInputRow.style.marginBottom = '8px';
                rangeInputRow.style.gap = '5px';
                
                const minInput = document.createElement('input');
                minInput.type = 'number';
                minInput.value = min !== undefined ? min : '';
                minInput.placeholder = '最小值';
                minInput.style.width = '60px';
                minInput.style.padding = '3px';
                minInput.style.fontSize = '11px';
                minInput.style.border = '1px solid #ddd';
                minInput.style.borderRadius = '3px';
                
                const sepLabel = document.createElement('span');
                sepLabel.textContent = '-';
                sepLabel.style.fontSize = '11px';
                
                const maxInput = document.createElement('input');
                maxInput.type = 'number';
                maxInput.value = max !== undefined ? max : '';
                maxInput.placeholder = '最大值';
                maxInput.style.width = '60px';
                maxInput.style.padding = '3px';
                maxInput.style.fontSize = '11px';
                maxInput.style.border = '1px solid #ddd';
                maxInput.style.borderRadius = '3px';
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '×';
                deleteBtn.style.marginLeft = '5px';
                deleteBtn.style.width = '20px';
                deleteBtn.style.height = '20px';
                deleteBtn.style.border = 'none';
                deleteBtn.style.backgroundColor = '#ff4d4f';
                deleteBtn.style.color = 'white';
                deleteBtn.style.borderRadius = '50%';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.fontSize = '12px';
                deleteBtn.style.lineHeight = '20px';
                deleteBtn.style.padding = '0';
                
                deleteBtn.addEventListener('click', () => {
                    rangeRow.remove();
                    // 从数组中移除
                    const idx = categoryStyles._numericRanges.findIndex(r => r.id === rangeId);
                    if (idx > -1) {
                        categoryStyles._numericRanges.splice(idx, 1);
                    }
                });
                
                rangeInputRow.appendChild(minInput);
                rangeInputRow.appendChild(sepLabel);
                rangeInputRow.appendChild(maxInput);
                rangeInputRow.appendChild(deleteBtn);
                rangeRow.appendChild(rangeInputRow);
                
                // 样式设置行
                const styleRow = document.createElement('div');
                styleRow.style.display = 'flex';
                styleRow.style.alignItems = 'center';
                styleRow.style.gap = '10px';
                
                // 颜色选择
                const colorLabel = document.createElement('label');
                colorLabel.textContent = '颜色:';
                colorLabel.style.fontSize = '10px';
                styleRow.appendChild(colorLabel);
                
                const colorBtn = document.createElement('button');
                colorBtn.style.width = '30px';
                colorBtn.style.height = '20px';
                colorBtn.style.backgroundColor = color || presetColors[rangeId % presetColors.length];
                colorBtn.style.border = '1px solid #ddd';
                colorBtn.style.borderRadius = '3px';
                colorBtn.style.cursor = 'pointer';
                styleRow.appendChild(colorBtn);
                
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = color || presetColors[rangeId % presetColors.length];
                colorInput.style.position = 'fixed';
                colorInput.style.top = '50%';
                colorInput.style.left = '50%';
                colorInput.style.transform = 'translate(-50%, -50%)';
                colorInput.style.zIndex = '100000';
                styleRow.appendChild(colorInput);
                
                colorBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    colorInput.click();
                });
                
                colorInput.addEventListener('change', () => {
                    colorBtn.style.backgroundColor = colorInput.value;
                });
                
                // 符号选择（仅点数据）
                let symbolSelect = null;
                if (layerGeometryType === 'Point' || layerGeometryType === 'Mixed') {
                    const symbolLabel = document.createElement('label');
                    symbolLabel.textContent = '符号:';
                    symbolLabel.style.fontSize = '10px';
                    symbolLabel.style.marginLeft = '5px';
                    styleRow.appendChild(symbolLabel);
                    
                    symbolSelect = document.createElement('select');
                    symbolSelect.style.width = '70px';
                    symbolSelect.style.padding = '2px';
                    symbolSelect.style.fontSize = '10px';
                    symbolSelect.style.border = '1px solid #ddd';
                    symbolSelect.style.borderRadius = '3px';
                    
                    const symbols = [
                        { value: 'circle', label: '● 圆' },
                        { value: 'square', label: '■ 方' },
                        { value: 'triangle', label: '▲ 三角' },
                        { value: 'diamond', label: '◆ 菱形' },
                        { value: 'star', label: '★ 星形' },
                        { value: '✈️', label: '✈️ 飞机' },
                        { value: '📷', label: '📷 相机' },
                        { value: '🚁', label: '🚁 直升机' },
                        { value: '📍', label: '📍 标记' },
                        { value: '📡', label: '📡 雷达' },
                        { value: '🎯', label: '🎯 目标' },
                        { value: '⚓', label: '⚓ 锚点' },
                        { value: '🚢', label: '🚢 船只' },
                        { value: '🏠', label: '🏠 房屋' },
                        { value: '🌲', label: '🌲 树木' },
                        { value: '⛽', label: '⛽ 加油站' },
                        { value: '🏥', label: '🏥 医院' },
                        { value: '🏫', label: '🏫 学校' },
                        { value: '🏢', label: '🏢 办公楼' },
                        { value: '🚗', label: '🚗 汽车' },
                        { value: '🚲', label: '🚲 自行车' },
                        { value: '🚶', label: '🚶 行人' },
                        { value: '⚠️', label: '⚠️ 警告' },
                        { value: '❌', label: '❌ 禁止' },
                        { value: '✅', label: '✅ 确认' },
                        { value: '⭐', label: '⭐ 星星' },
                        { value: '❤️', label: '❤️ 爱心' },
                        { value: '🔥', label: '🔥 火焰' },
                        { value: '💧', label: '💧 水滴' },
                        { value: '⚡', label: '⚡ 闪电' }
                    ];
                    
                    symbols.forEach(sym => {
                        const option = document.createElement('option');
                        option.value = sym.value;
                        option.textContent = sym.label;
                        if (symbol === sym.value) {
                            option.selected = true;
                        }
                        symbolSelect.appendChild(option);
                    });
                    
                    if (!symbol) {
                        symbolSelect.selectedIndex = 0;
                    }
                    
                    styleRow.appendChild(symbolSelect);
                    
                    // 符号大小设置
                    const sizeLabel = document.createElement('label');
                    sizeLabel.textContent = '大小:';
                    sizeLabel.style.fontSize = '10px';
                    sizeLabel.style.marginLeft = '10px';
                    styleRow.appendChild(sizeLabel);
                    
                    const sizeInput = document.createElement('input');
                    sizeInput.type = 'number';
                    sizeInput.value = size || 6;
                    sizeInput.min = '1';
                    sizeInput.max = '50';
                    sizeInput.style.width = '40px';
                    sizeInput.style.padding = '2px';
                    sizeInput.style.fontSize = '10px';
                    sizeInput.style.border = '1px solid #ddd';
                    sizeInput.style.borderRadius = '3px';
                    styleRow.appendChild(sizeInput);
                    
                    // 符号选择事件监听
                    symbolSelect.addEventListener('change', () => {
                        const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                        if (data) data.symbol = symbolSelect.value;
                    });
                    
                    // 符号大小事件监听
                    sizeInput.addEventListener('change', () => {
                        const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                        if (data) data.size = parseInt(sizeInput.value) || 6;
                    });
                    sizeInput.addEventListener('input', () => {
                        const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                        if (data) data.size = parseInt(sizeInput.value) || 6;
                    });
                }
                
                rangeRow.appendChild(styleRow);
                rangesContainer.appendChild(rangeRow);
                
                // 保存数值段数据
                const rangeData = { 
                    id: rangeId, 
                    min: min, 
                    max: max, 
                    color: color || presetColors[rangeId % presetColors.length],
                    symbol: symbol || 'circle',
                    size: size || 6
                };
                categoryStyles._numericRanges.push(rangeData);
                
                // 监听输入变化
                minInput.addEventListener('change', () => {
                    const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                    if (data) data.min = parseFloat(minInput.value);
                });
                minInput.addEventListener('input', () => {
                    const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                    if (data) data.min = parseFloat(minInput.value);
                });
                
                maxInput.addEventListener('change', () => {
                    const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                    if (data) data.max = parseFloat(maxInput.value);
                });
                maxInput.addEventListener('input', () => {
                    const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                    if (data) data.max = parseFloat(maxInput.value);
                });
                
                colorInput.addEventListener('change', () => {
                    const data = categoryStyles._numericRanges.find(r => r.id === rangeId);
                    if (data) data.color = colorInput.value;
                });
            }
            
            // 恢复已有的数值段
            if (categoryStyles._numericRanges && categoryStyles._numericRanges.length > 0) {
                categoryStyles._numericRanges.forEach(range => {
                    addRangeRow(range.min, range.max, range.color, range.symbol, range.size);
                });
            } else {
                // 默认添加5个数值段示例
                const step = (maxValue - minValue) / 5;
                for (let i = 0; i < 5; i++) {
                    const rangeMin = minValue + step * i;
                    const rangeMax = minValue + step * (i + 1);
                    addRangeRow(
                        parseFloat(rangeMin.toFixed(2)), 
                        parseFloat(rangeMax.toFixed(2)), 
                        presetColors[i % presetColors.length],
                        'circle',
                        6 + i * 2  // 符号大小递增
                    );
                }
            }
            
            addRangeBtn.addEventListener('click', () => {
                addRangeRow(undefined, undefined, presetColors[rangeIndex % presetColors.length], 'circle', 6);
            });
            
            rangeSection.appendChild(addRangeBtn);
            categoryValuesDiv.appendChild(rangeSection);
            
            // 标记为数值型分类
            categoryStyles._isNumeric = false;
            
        } else if (fieldType === 'date') {
            // 日期型字段：提供按年、按月、按年月分类选项
            categoryStyles._isNumeric = false;
            delete categoryStyles._numericRanges;

            // 日期解析辅助函数
            function parseDateValue(val) {
                if (typeof val === 'number') return new Date(val < 10000000000 ? val * 1000 : val);
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
            }

            // 收集所有日期值
            const dateValues = [];
            features.forEach(feature => {
                const value = feature.get(selectedField);
                if (value !== undefined && value !== null && value !== '') {
                    const d = parseDateValue(value);
                    if (d) dateValues.push({ date: d, raw: value });
                }
            });

            if (dateValues.length === 0) {
                categoryValuesDiv.innerHTML = '<div style="color: #999; font-size: 11px;">该字段没有可用日期</div>';
                return;
            }

            // 创建日期分类设置区域
            const dateSection = document.createElement('div');
            dateSection.style.marginBottom = '15px';
            dateSection.style.padding = '10px';
            dateSection.style.backgroundColor = '#f6ffed';
            dateSection.style.borderRadius = '4px';
            dateSection.style.border = '1px solid #b7eb8f';

            const dateTitle = document.createElement('div');
            dateTitle.textContent = '日期分类方式';
            dateTitle.style.fontWeight = 'bold';
            dateTitle.style.fontSize = '12px';
            dateTitle.style.marginBottom = '10px';
            dateTitle.style.color = '#52c41a';
            dateSection.appendChild(dateTitle);

            // 分类方式选择
            const dateModeSelect = document.createElement('select');
            dateModeSelect.id = 'dateModeSelect';
            dateModeSelect.style.width = '100%';
            dateModeSelect.style.padding = '5px';
            dateModeSelect.style.fontSize = '12px';
            dateModeSelect.style.border = '1px solid #ddd';
            dateModeSelect.style.borderRadius = '3px';
            dateModeSelect.style.marginBottom = '10px';

            const modes = [
                { value: 'year', label: '按年分类' },
                { value: 'month', label: '按年月分类' },
                { value: 'day', label: '按日期分类' },
                { value: 'value', label: '按原始值分类' }
            ];
            modes.forEach(mode => {
                const opt = document.createElement('option');
                opt.value = mode.value;
                opt.textContent = mode.label;
                dateModeSelect.appendChild(opt);
            });

            dateSection.appendChild(dateModeSelect);

            // 恢复之前保存的日期分类模式
            if (categoryStyles._dateMode) {
                for (let i = 0; i < dateModeSelect.options.length; i++) {
                    if (dateModeSelect.options[i].value === categoryStyles._dateMode) {
                        dateModeSelect.selectedIndex = i;
                        break;
                    }
                }
            }

            // 分类结果容器
            const dateCategoriesDiv = document.createElement('div');
            dateCategoriesDiv.id = 'dateCategoriesContainer';
            dateCategoriesDiv.style.maxHeight = '180px';
            dateCategoriesDiv.style.overflowY = 'auto';
            dateSection.appendChild(dateCategoriesDiv);

            // 渲染日期分类的函数
            function renderDateCategories() {
                const mode = dateModeSelect.value;
                dateCategoriesDiv.innerHTML = '';

                // 按选定方式分组
                const groups = {};
                dateValues.forEach(item => {
                    let key;
                    if (mode === 'year') {
                        key = item.date.getFullYear() + '年';
                    } else if (mode === 'month') {
                        key = item.date.getFullYear() + '-' + String(item.date.getMonth() + 1).padStart(2, '0');
                    } else if (mode === 'day') {
                        key = item.date.getFullYear() + '-' + String(item.date.getMonth() + 1).padStart(2, '0') + '-' + String(item.date.getDate()).padStart(2, '0');
                    } else {
                        key = String(item.raw);
                    }
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(item);
                });

                // 按key排序
                const sortedKeys = Object.keys(groups).sort();

                if (sortedKeys.length === 0) {
                    dateCategoriesDiv.innerHTML = '<div style="color: #999; font-size: 11px;">没有可用分类</div>';
                    return;
                }

                // 显示统计信息
                const statsDiv = document.createElement('div');
                statsDiv.style.fontSize = '11px';
                statsDiv.style.color = '#666';
                statsDiv.style.marginBottom = '8px';
                statsDiv.style.padding = '4px 8px';
                statsDiv.style.backgroundColor = '#fffbe6';
                statsDiv.style.borderRadius = '3px';
                statsDiv.textContent = `共 ${sortedKeys.length} 个分组，${dateValues.length} 个要素`;
                dateCategoriesDiv.appendChild(statsDiv);

                // 为每个分组创建样式设置
                sortedKeys.forEach((key, index) => {
                    const groupDiv = document.createElement('div');
                    groupDiv.style.marginBottom = '6px';
                    groupDiv.style.padding = '6px';
                    groupDiv.style.backgroundColor = 'white';
                    groupDiv.style.borderRadius = '3px';
                    groupDiv.style.border = '1px solid #e8e8e8';

                    // 组名和数量
                    const groupHeader = document.createElement('div');
                    groupHeader.style.display = 'flex';
                    groupHeader.style.justifyContent = 'space-between';
                    groupHeader.style.alignItems = 'center';

                    const groupName = document.createElement('span');
                    groupName.textContent = key;
                    groupName.style.fontWeight = 'bold';
                    groupName.style.fontSize = '12px';

                    const groupCount = document.createElement('span');
                    groupCount.textContent = `(${groups[key].length})`;
                    groupCount.style.fontSize = '11px';
                    groupCount.style.color = '#999';

                    groupHeader.appendChild(groupName);
                    groupHeader.appendChild(groupCount);
                    groupDiv.appendChild(groupHeader);

                    // 颜色选择行
                    const colorRow = document.createElement('div');
                    colorRow.style.display = 'flex';
                    colorRow.style.alignItems = 'center';
                    colorRow.style.marginTop = '4px';

                    const colorLabel = document.createElement('label');
                    colorLabel.textContent = '颜色:';
                    colorLabel.style.fontSize = '10px';
                    colorLabel.style.marginRight = '5px';
                    colorRow.appendChild(colorLabel);

                    if (!categoryStyles[key]) {
                        categoryStyles[key] = {};
                    }
                    if (!categoryStyles[key].color) {
                        categoryStyles[key].color = presetColors[index % presetColors.length];
                    }

                    const colorBtn = document.createElement('button');
                    colorBtn.textContent = '  ';
                    colorBtn.style.width = '30px';
                    colorBtn.style.height = '20px';
                    colorBtn.style.backgroundColor = categoryStyles[key].color;
                    colorBtn.style.border = '1px solid #ddd';
                    colorBtn.style.borderRadius = '3px';
                    colorBtn.style.cursor = 'pointer';
                    colorRow.appendChild(colorBtn);

                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.value = categoryStyles[key].color;
                    colorInput.style.position = 'fixed';
                    colorInput.style.top = '50%';
                    colorInput.style.left = '50%';
                    colorInput.style.transform = 'translate(-50%, -50%)';
                    colorInput.style.zIndex = '100000';
                    colorRow.appendChild(colorInput);

                    colorBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        colorInput.click();
                    });

                    (function(currentKey) {
                        colorInput.addEventListener('change', () => {
                            colorBtn.style.backgroundColor = colorInput.value;
                            categoryStyles[currentKey] = categoryStyles[currentKey] || {};
                            categoryStyles[currentKey].color = colorInput.value;
                        });
                    })(key);

                    groupDiv.appendChild(colorRow);
                    dateCategoriesDiv.appendChild(groupDiv);
                });
            }

            // 监听分类方式变化
            dateModeSelect.addEventListener('change', renderDateCategories);

            // 初始渲染
            renderDateCategories();

            categoryValuesDiv.appendChild(dateSection);
            
        } else {
            // 非数值型/非日期型字段：使用原有的唯一值分类方式
            categoryStyles._isNumeric = false;
            delete categoryStyles._numericRanges;
            
            // 收集该字段的所有唯一值
            const uniqueValues = new Set();
            features.forEach(feature => {
                const value = feature.get(selectedField);
                if (value !== undefined && value !== null && value !== '') {
                    uniqueValues.add(String(value));
                }
            });
            
            // 为每个唯一值创建样式设置
            const valuesArray = Array.from(uniqueValues).sort();
            
            if (valuesArray.length === 0) {
                categoryValuesDiv.innerHTML = '<div style="color: #999; font-size: 11px;">该字段没有可用值</div>';
                return;
            }
            
            valuesArray.forEach((value, index) => {
                const valueDiv = document.createElement('div');
                valueDiv.style.marginBottom = '8px';
                valueDiv.style.padding = '5px';
                valueDiv.style.backgroundColor = 'white';
                valueDiv.style.borderRadius = '3px';
                valueDiv.style.border = '1px solid #e8e8e8';
                
                // 值名称
                const valueName = document.createElement('div');
                valueName.textContent = value;
                valueName.style.fontWeight = 'bold';
                valueName.style.fontSize = '11px';
                valueName.style.marginBottom = '5px';
                valueDiv.appendChild(valueName);
                
                // 获取或初始化该值的样式 - 保留已有设置
                if (!categoryStyles[value]) {
                    categoryStyles[value] = {};
                }
                if (!categoryStyles[value].color) {
                    categoryStyles[value].color = presetColors[index % presetColors.length];
                }
                
                // 颜色选择行
                const colorRow = document.createElement('div');
                colorRow.style.display = 'flex';
                colorRow.style.alignItems = 'center';
                colorRow.style.marginBottom = '5px';
                
                const colorLabel = document.createElement('label');
                colorLabel.textContent = '颜色:';
                colorLabel.style.fontSize = '10px';
                colorLabel.style.marginRight = '5px';
                colorRow.appendChild(colorLabel);
                
                const colorBtn = document.createElement('button');
                colorBtn.className = 'category-color-btn';
                colorBtn.dataset.value = value;
                colorBtn.style.width = '30px';
                colorBtn.style.height = '20px';
                colorBtn.style.backgroundColor = categoryStyles[value].color;
                colorBtn.style.border = '1px solid #ddd';
                colorBtn.style.borderRadius = '3px';
                colorBtn.style.cursor = 'pointer';
                colorRow.appendChild(colorBtn);
                
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = categoryStyles[value].color;
                // 使用fixed定位确保取色器在视口中正确显示
                colorInput.style.position = 'fixed';
                colorInput.style.top = '50%';
                colorInput.style.left = '50%';
                colorInput.style.transform = 'translate(-50%, -50%)';
                colorInput.style.zIndex = '100000';
                colorRow.appendChild(colorInput);
                
                colorBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    colorInput.click();
                });
                
                // 使用闭包捕获当前value
                (function(currentValue) {
                    colorInput.addEventListener('change', () => {
                        colorBtn.style.backgroundColor = colorInput.value;
                        categoryStyles[currentValue] = categoryStyles[currentValue] || {};
                        categoryStyles[currentValue].color = colorInput.value;
                        console.log('分类颜色已更新:', currentValue, colorInput.value);
                    });
                })(value);
                
                valueDiv.appendChild(colorRow);
                
                // 符号选择（仅点数据）
                if (layerGeometryType === 'Point' || layerGeometryType === 'Mixed') {
                    const symbolRow = document.createElement('div');
                    symbolRow.style.display = 'flex';
                    symbolRow.style.alignItems = 'center';
                    
                    const symbolLabel = document.createElement('label');
                    symbolLabel.textContent = '符号:';
                    symbolLabel.style.fontSize = '10px';
                    symbolLabel.style.marginRight = '5px';
                    symbolRow.appendChild(symbolLabel);
                    
                    const symbolSelect = document.createElement('select');
                    symbolSelect.className = 'category-symbol-select';
                    symbolSelect.dataset.value = value;
                    symbolSelect.style.width = '80px';
                    symbolSelect.style.padding = '2px';
                    symbolSelect.style.fontSize = '10px';
                    symbolSelect.style.border = '1px solid #ddd';
                    symbolSelect.style.borderRadius = '3px';
                    
                    // 符号选项
                    const symbols = [
                        { value: 'circle', label: '● 圆形' },
                        { value: 'square', label: '■ 方形' },
                        { value: 'triangle', label: '▲ 三角' },
                        { value: 'diamond', label: '◆ 菱形' },
                        { value: 'star', label: '★ 星形' },
                        { value: '✈️', label: '✈️ 飞机' },
                        { value: '📷', label: '📷 相机' },
                        { value: '🚁', label: '🚁 直升机' },
                        { value: '📍', label: '📍 标记' },
                        { value: '📡', label: '📡 雷达' },
                        { value: '🎯', label: '🎯 目标' },
                        { value: '⚓', label: '⚓ 锚点' },
                        { value: '🚢', label: '🚢 船只' },
                        { value: '🏠', label: '🏠 房屋' },
                        { value: '🌲', label: '🌲 树木' },
                        { value: '⛽', label: '⛽ 加油站' },
                        { value: '🏥', label: '🏥 医院' },
                        { value: '🏫', label: '🏫 学校' },
                        { value: '🏢', label: '🏢 办公楼' },
                        { value: '🚗', label: '🚗 汽车' },
                        { value: '🚲', label: '🚲 自行车' },
                        { value: '🚶', label: '🚶 行人' },
                        { value: '⚠️', label: '⚠️ 警告' },
                        { value: '❌', label: '❌ 禁止' },
                        { value: '✅', label: '✅ 确认' },
                        { value: '⭐', label: '⭐ 星星' },
                        { value: '❤️', label: '❤️ 爱心' },
                        { value: '🔥', label: '🔥 火焰' },
                        { value: '💧', label: '💧 水滴' },
                        { value: '⚡', label: '⚡ 闪电' }
                    ];
                    
                    symbols.forEach(sym => {
                        const option = document.createElement('option');
                        option.value = sym.value;
                        option.textContent = sym.label;
                        if (categoryStyles[value].symbol === sym.value) {
                            option.selected = true;
                        }
                        symbolSelect.appendChild(option);
                    });
                    
                    // 如果没有设置符号，默认选择圆形
                    if (!categoryStyles[value].symbol) {
                        categoryStyles[value].symbol = 'circle';
                    }
                    
                    symbolSelect.addEventListener('change', (function(currentValue) {
                        return function() {
                            categoryStyles[currentValue] = categoryStyles[currentValue] || {};
                            categoryStyles[currentValue].symbol = this.value;
                            console.log('分类符号已更新:', currentValue, this.value);
                        };
                    })(value));
                    
                    symbolRow.appendChild(symbolSelect);
                    valueDiv.appendChild(symbolRow);
                }
                
                categoryValuesDiv.appendChild(valueDiv);
            });
        }
    });
    
    // 如果已有分类字段设置，触发change事件显示分类值
    if (item.categoryField) {
        setTimeout(() => {
            categoryFieldSelect.dispatchEvent(new Event('change'));
        }, 0);
    } else {
        categoryValuesDiv.style.display = 'none';
    }
    
    categoryStyleSection.appendChild(categoryValuesDiv);
    styleSection.appendChild(categoryStyleSection);
    
    content.appendChild(styleSection);
    
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
        
        // 保存样式设置
        const newStyle = {};
        
        // 点样式
        if (layerGeometryType === 'Point' || layerGeometryType === 'Mixed') {
            const pointColorInput = document.getElementById('stylePointColor');
            const pointSizeInput = document.getElementById('stylePointSize');
            const pointSymbolSelect = document.getElementById('stylePointSymbol');
            if (pointColorInput) newStyle.pointColor = pointColorInput.value;
            if (pointSizeInput) newStyle.pointSize = parseInt(pointSizeInput.value) || 6;
            if (pointSymbolSelect) newStyle.pointSymbol = pointSymbolSelect.value;
        }
        
        // 线样式
        if (layerGeometryType === 'LineString' || layerGeometryType === 'Mixed') {
            const lineColorInput = document.getElementById('styleLineColor');
            const lineWidthInput = document.getElementById('styleLineWidth');
            if (lineColorInput) newStyle.lineColor = lineColorInput.value;
            if (lineWidthInput) newStyle.lineWidth = parseInt(lineWidthInput.value) || 2;
        }
        
        // 面样式
        if (layerGeometryType === 'Polygon' || layerGeometryType === 'Mixed') {
            const fillColorInput = document.getElementById('styleFillColor');
            const strokeColorInput = document.getElementById('styleStrokeColor');
            const opacityInput = document.getElementById('styleOpacity');
            if (fillColorInput) newStyle.fillColor = fillColorInput.value;
            if (strokeColorInput) newStyle.strokeColor = strokeColorInput.value;
            if (opacityInput) newStyle.opacity = parseInt(opacityInput.value) || 30;
        }
        
        // 保存分类样式设置
        const categoryFieldSelect = document.getElementById('categoryField');
        if (categoryFieldSelect) {
            var selectedCategoryField = categoryFieldSelect.value;
            // 如果是表达式，保存实际表达式内容
            if (selectedCategoryField === '__expression__') {
                const exprInput = document.getElementById('exprInput');
                if (exprInput && exprInput.value.trim()) {
                    selectedCategoryField = '__expr__:' + exprInput.value.trim();
                }
            }
            item.categoryField = selectedCategoryField;
            newStyle.categoryField = selectedCategoryField;
            
            // 只有选择了分类字段时才保存分类样式
            if (selectedCategoryField) {
                // 保存日期分类模式
                const dateModeSelect = document.getElementById('dateModeSelect');
                if (dateModeSelect) {
                    categoryStyles._dateMode = dateModeSelect.value;
                }
                item.categoryStyles = categoryStyles;
                // 深拷贝分类样式对象，确保数据被正确保存
                newStyle.categoryStyles = JSON.parse(JSON.stringify(categoryStyles));
                console.log('保存分类样式:', selectedCategoryField, categoryStyles);
            } else {
                // 清空分类样式
                item.categoryStyles = null;
                newStyle.categoryStyles = null;
            }
        }
        
        // 保存样式到图层对象
        item.style = newStyle;
        
        // 应用新样式到图层
        applyLayerStyle(item.layer, newStyle, layerGeometryType);
        
        // 关闭模态框
        document.body.removeChild(modal);
        
        // 刷新图层控制面板
        createLayerControl();
        
        console.log(`图层 ${item.name} 设置已更新:`, {
            labelField: selectedLabelField,
            linkField: selectedLinkField,
            linkPathPrefix: pathPrefix,
            style: newStyle
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

// ==================== 配置图层样式编辑器 ====================

/**
 * 打开配置图层样式编辑器
 * @param {Object} item - 图层对象
 * @param {number} index - 图层索引
 */
function openLayerStyleEditor(item, index) {
    // 获取图层的所有属性字段
    const source = item.layer.getSource();
    const features = source.getFeatures();
    
    if (features.length === 0) {
        alert('该图层没有要素，无法设置样式');
        return;
    }
    
    // 检测图层几何类型
    const geometryTypes = new Set();
    features.forEach(feature => {
        const geom = feature.getGeometry();
        if (geom) {
            const type = geom.getType();
            if (type.includes('Point')) geometryTypes.add('Point');
            else if (type.includes('LineString')) geometryTypes.add('LineString');
            else if (type.includes('Polygon')) geometryTypes.add('Polygon');
        }
    });
    const layerGeometryType = geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'Mixed';
    
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
    content.style.maxWidth = '450px';
    content.style.width = '90%';
    content.style.maxHeight = '80vh';
    content.style.overflowY = 'auto';
    
    // 标题
    const title = document.createElement('h3');
    title.textContent = `设置图层样式 - ${item.name}`;
    title.style.marginTop = '0';
    title.style.marginBottom = '15px';
    content.appendChild(title);
    
    // 显示几何类型
    const geomTypeLabel = document.createElement('div');
    geomTypeLabel.innerHTML = `<span style="color: #666; font-size: 12px;">几何类型: <b>${layerGeometryType}</b></span>`;
    geomTypeLabel.style.marginBottom = '15px';
    content.appendChild(geomTypeLabel);
    
    // 获取当前样式
    const currentStyle = item.style || {};
    
    // 样式设置区域
    const styleSection = document.createElement('div');
    styleSection.style.marginBottom = '15px';
    styleSection.style.padding = '15px';
    styleSection.style.backgroundColor = '#f8f9fa';
    styleSection.style.borderRadius = '4px';
    styleSection.style.border = '1px solid #e9ecef';
    
    // 获取所有属性字段
    const allFields = new Set();
    features.forEach(feature => {
        const properties = feature.getProperties();
        Object.keys(properties).forEach(key => {
            if (key !== 'geometry') {
                allFields.add(key);
            }
        });
    });
    const fieldList = Array.from(allFields);
    
    // 分类设置
    const categorySection = document.createElement('div');
    categorySection.style.marginBottom = '15px';
    categorySection.style.padding = '15px';
    categorySection.style.backgroundColor = '#f8f9fa';
    categorySection.style.borderRadius = '4px';
    categorySection.style.border = '1px solid #e9ecef';
    categorySection.innerHTML = '<div style="font-size: 14px; margin-bottom: 10px; font-weight: bold;">分类设置</div>';
    
    // 分类字段选择
    const categoryFieldRow = document.createElement('div');
    categoryFieldRow.style.display = 'flex';
    categoryFieldRow.style.alignItems = 'center';
    categoryFieldRow.style.marginBottom = '10px';
    
    const categoryFieldLabel = document.createElement('label');
    categoryFieldLabel.textContent = '分类字段:';
    categoryFieldLabel.style.fontSize = '12px';
    categoryFieldLabel.style.marginRight = '10px';
    categoryFieldLabel.style.width = '80px';
    categoryFieldRow.appendChild(categoryFieldLabel);
    
    const categoryFieldSelect = document.createElement('select');
    categoryFieldSelect.id = 'configCategoryField';
    categoryFieldSelect.style.width = '150px';
    categoryFieldSelect.style.padding = '5px';
    categoryFieldSelect.style.border = '1px solid #ddd';
    categoryFieldSelect.style.borderRadius = '4px';
    
    // 添加空选项
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '无（统一样式）';
    categoryFieldSelect.appendChild(emptyOption);
    
    // 添加所有字段选项
    fieldList.forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        if (currentStyle.categoryField === field) {
            option.selected = true;
        }
        categoryFieldSelect.appendChild(option);
    });
    categoryFieldRow.appendChild(categoryFieldSelect);
    categorySection.appendChild(categoryFieldRow);
    content.appendChild(categorySection);
    
    // 点样式设置
    if (layerGeometryType === 'Point' || layerGeometryType === 'Mixed') {
        const pointStyleDiv = document.createElement('div');
        pointStyleDiv.style.marginBottom = '15px';
        pointStyleDiv.innerHTML = '<div style="font-size: 14px; margin-bottom: 10px; font-weight: bold;">点样式</div>';
        
        // 点样式类型
        const pointTypeRow = document.createElement('div');
        pointTypeRow.style.display = 'flex';
        pointTypeRow.style.alignItems = 'center';
        pointTypeRow.style.marginBottom = '10px';
        
        const pointTypeLabel = document.createElement('label');
        pointTypeLabel.textContent = '样式:';
        pointTypeLabel.style.fontSize = '12px';
        pointTypeLabel.style.marginRight = '10px';
        pointTypeLabel.style.width = '50px';
        pointTypeRow.appendChild(pointTypeLabel);
        
        const pointTypeSelect = document.createElement('select');
        pointTypeSelect.id = 'configPointType';
        pointTypeSelect.style.width = '120px';
        pointTypeSelect.style.padding = '5px';
        pointTypeSelect.style.border = '1px solid #ddd';
        pointTypeSelect.style.borderRadius = '4px';
        
        const pointTypes = [
            { value: 'circle', label: '圆形' },
            { value: 'square', label: '方形' },
            { value: 'triangle', label: '三角形' },
            { value: 'star', label: '星形' }
        ];
        
        pointTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.value;
            option.textContent = type.label;
            if (currentStyle.pointType === type.value) {
                option.selected = true;
            }
            pointTypeSelect.appendChild(option);
        });
        pointTypeRow.appendChild(pointTypeSelect);
        pointStyleDiv.appendChild(pointTypeRow);
        
        // 点颜色
        const pointColorRow = document.createElement('div');
        pointColorRow.style.display = 'flex';
        pointColorRow.style.alignItems = 'center';
        pointColorRow.style.marginBottom = '10px';
        
        const pointColorLabel = document.createElement('label');
        pointColorLabel.textContent = '颜色:';
        pointColorLabel.style.fontSize = '12px';
        pointColorLabel.style.marginRight = '10px';
        pointColorLabel.style.width = '50px';
        pointColorRow.appendChild(pointColorLabel);
        
        const pointColorInput = document.createElement('input');
        pointColorInput.type = 'color';
        pointColorInput.value = currentStyle.pointColor || '#1890ff';
        pointColorInput.id = 'configPointColor';
        pointColorInput.style.width = '60px';
        pointColorInput.style.height = '30px';
        pointColorInput.style.border = '1px solid #ddd';
        pointColorInput.style.borderRadius = '4px';
        pointColorRow.appendChild(pointColorInput);
        pointStyleDiv.appendChild(pointColorRow);
        
        // 点大小
        const pointSizeRow = document.createElement('div');
        pointSizeRow.style.display = 'flex';
        pointSizeRow.style.alignItems = 'center';
        pointSizeRow.style.marginBottom = '10px';
        
        const pointSizeLabel = document.createElement('label');
        pointSizeLabel.textContent = '大小:';
        pointSizeLabel.style.fontSize = '12px';
        pointSizeLabel.style.marginRight = '10px';
        pointSizeLabel.style.width = '50px';
        pointSizeRow.appendChild(pointSizeLabel);
        
        const pointSizeInput = document.createElement('input');
        pointSizeInput.type = 'number';
        pointSizeInput.value = currentStyle.pointSize || '6';
        pointSizeInput.id = 'configPointSize';
        pointSizeInput.style.width = '80px';
        pointSizeInput.style.padding = '5px';
        pointSizeInput.style.border = '1px solid #ddd';
        pointSizeInput.style.borderRadius = '4px';
        pointSizeRow.appendChild(pointSizeInput);
        pointStyleDiv.appendChild(pointSizeRow);
        
        styleSection.appendChild(pointStyleDiv);
    }
    
    // 线样式设置
    if (layerGeometryType === 'LineString' || layerGeometryType === 'Mixed') {
        const lineStyleDiv = document.createElement('div');
        lineStyleDiv.style.marginBottom = '15px';
        lineStyleDiv.innerHTML = '<div style="font-size: 14px; margin-bottom: 10px; font-weight: bold;">线样式</div>';
        
        // 线颜色
        const lineColorRow = document.createElement('div');
        lineColorRow.style.display = 'flex';
        lineColorRow.style.alignItems = 'center';
        lineColorRow.style.marginBottom = '10px';
        
        const lineColorLabel = document.createElement('label');
        lineColorLabel.textContent = '颜色:';
        lineColorLabel.style.fontSize = '12px';
        lineColorLabel.style.marginRight = '10px';
        lineColorLabel.style.width = '50px';
        lineColorRow.appendChild(lineColorLabel);
        
        const lineColorInput = document.createElement('input');
        lineColorInput.type = 'color';
        lineColorInput.value = currentStyle.lineColor || '#52c41a';
        lineColorInput.id = 'configLineColor';
        lineColorInput.style.width = '60px';
        lineColorInput.style.height = '30px';
        lineColorInput.style.border = '1px solid #ddd';
        lineColorInput.style.borderRadius = '4px';
        lineColorRow.appendChild(lineColorInput);
        lineStyleDiv.appendChild(lineColorRow);
        
        // 线宽
        const lineWidthRow = document.createElement('div');
        lineWidthRow.style.display = 'flex';
        lineWidthRow.style.alignItems = 'center';
        lineWidthRow.style.marginBottom = '10px';
        
        const lineWidthLabel = document.createElement('label');
        lineWidthLabel.textContent = '宽度:';
        lineWidthLabel.style.fontSize = '12px';
        lineWidthLabel.style.marginRight = '10px';
        lineWidthLabel.style.width = '50px';
        lineWidthRow.appendChild(lineWidthLabel);
        
        const lineWidthInput = document.createElement('input');
        lineWidthInput.type = 'number';
        lineWidthInput.value = currentStyle.lineWidth || '2';
        lineWidthInput.id = 'configLineWidth';
        lineWidthInput.style.width = '80px';
        lineWidthInput.style.padding = '5px';
        lineWidthInput.style.border = '1px solid #ddd';
        lineWidthInput.style.borderRadius = '4px';
        lineWidthRow.appendChild(lineWidthInput);
        lineStyleDiv.appendChild(lineWidthRow);
        
        styleSection.appendChild(lineStyleDiv);
    }
    
    // 面样式设置
    if (layerGeometryType === 'Polygon' || layerGeometryType === 'Mixed') {
        const polygonStyleDiv = document.createElement('div');
        polygonStyleDiv.style.marginBottom = '15px';
        polygonStyleDiv.innerHTML = '<div style="font-size: 14px; margin-bottom: 10px; font-weight: bold;">面样式</div>';
        
        // 填充颜色
        const fillColorRow = document.createElement('div');
        fillColorRow.style.display = 'flex';
        fillColorRow.style.alignItems = 'center';
        fillColorRow.style.marginBottom = '10px';
        
        const fillColorLabel = document.createElement('label');
        fillColorLabel.textContent = '填充:';
        fillColorLabel.style.fontSize = '12px';
        fillColorLabel.style.marginRight = '10px';
        fillColorLabel.style.width = '50px';
        fillColorRow.appendChild(fillColorLabel);
        
        const fillColorInput = document.createElement('input');
        fillColorInput.type = 'color';
        fillColorInput.value = currentStyle.fillColor || '#ffa500';
        fillColorInput.id = 'configFillColor';
        fillColorInput.style.width = '60px';
        fillColorInput.style.height = '30px';
        fillColorInput.style.border = '1px solid #ddd';
        fillColorInput.style.borderRadius = '4px';
        fillColorRow.appendChild(fillColorInput);
        polygonStyleDiv.appendChild(fillColorRow);
        
        // 边框颜色
        const strokeColorRow = document.createElement('div');
        strokeColorRow.style.display = 'flex';
        strokeColorRow.style.alignItems = 'center';
        strokeColorRow.style.marginBottom = '10px';
        
        const strokeColorLabel = document.createElement('label');
        strokeColorLabel.textContent = '边框:';
        strokeColorLabel.style.fontSize = '12px';
        strokeColorLabel.style.marginRight = '10px';
        strokeColorLabel.style.width = '50px';
        strokeColorRow.appendChild(strokeColorLabel);
        
        const strokeColorInput = document.createElement('input');
        strokeColorInput.type = 'color';
        strokeColorInput.value = currentStyle.strokeColor || '#ffa500';
        strokeColorInput.id = 'configStrokeColor';
        strokeColorInput.style.width = '60px';
        strokeColorInput.style.height = '30px';
        strokeColorInput.style.border = '1px solid #ddd';
        strokeColorInput.style.borderRadius = '4px';
        strokeColorRow.appendChild(strokeColorInput);
        polygonStyleDiv.appendChild(strokeColorRow);
        
        // 透明度
        const opacityRow = document.createElement('div');
        opacityRow.style.display = 'flex';
        opacityRow.style.alignItems = 'center';
        opacityRow.style.marginBottom = '10px';
        
        const opacityLabel = document.createElement('label');
        opacityLabel.textContent = '透明度:';
        opacityLabel.style.fontSize = '12px';
        opacityLabel.style.marginRight = '10px';
        opacityLabel.style.width = '50px';
        opacityRow.appendChild(opacityLabel);
        
        const opacityInput = document.createElement('input');
        opacityInput.type = 'range';
        opacityInput.min = '0';
        opacityInput.max = '100';
        opacityInput.value = currentStyle.opacity || '30';
        opacityInput.id = 'configOpacity';
        opacityInput.style.width = '150px';
        opacityInput.style.verticalAlign = 'middle';
        opacityRow.appendChild(opacityInput);
        
        const opacityValue = document.createElement('span');
        opacityValue.textContent = (currentStyle.opacity || '30') + '%';
        opacityValue.id = 'configOpacityValue';
        opacityValue.style.fontSize = '12px';
        opacityValue.style.marginLeft = '10px';
        opacityRow.appendChild(opacityValue);
        
        opacityInput.addEventListener('input', () => {
            opacityValue.textContent = opacityInput.value + '%';
        });
        
        polygonStyleDiv.appendChild(opacityRow);
        styleSection.appendChild(polygonStyleDiv);
    }
    
    content.appendChild(styleSection);
    
    // 按钮区域
    const buttonSection = document.createElement('div');
    buttonSection.style.display = 'flex';
    buttonSection.style.justifyContent = 'flex-end';
    buttonSection.style.gap = '10px';
    buttonSection.style.marginTop = '20px';
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.padding = '8px 20px';
    cancelBtn.style.border = '1px solid #ddd';
    cancelBtn.style.backgroundColor = '#fff';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    buttonSection.appendChild(cancelBtn);
    
    // 确定按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.padding = '8px 20px';
    confirmBtn.style.border = 'none';
    confirmBtn.style.backgroundColor = '#1890ff';
    confirmBtn.style.color = 'white';
    confirmBtn.style.borderRadius = '4px';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.addEventListener('click', () => {
        // 保存样式设置
        const newStyle = {};
        
        // 分类设置
        const categoryFieldSelect = document.getElementById('configCategoryField');
        if (categoryFieldSelect) {
            newStyle.categoryField = categoryFieldSelect.value;
        }
        
        // 点样式
        if (layerGeometryType === 'Point' || layerGeometryType === 'Mixed') {
            const pointTypeSelect = document.getElementById('configPointType');
            const pointColorInput = document.getElementById('configPointColor');
            const pointSizeInput = document.getElementById('configPointSize');
            if (pointTypeSelect) newStyle.pointType = pointTypeSelect.value;
            if (pointColorInput) newStyle.pointColor = pointColorInput.value;
            if (pointSizeInput) newStyle.pointSize = parseInt(pointSizeInput.value) || 6;
        }
        
        // 线样式
        if (layerGeometryType === 'LineString' || layerGeometryType === 'Mixed') {
            const lineColorInput = document.getElementById('configLineColor');
            const lineWidthInput = document.getElementById('configLineWidth');
            if (lineColorInput) newStyle.lineColor = lineColorInput.value;
            if (lineWidthInput) newStyle.lineWidth = parseInt(lineWidthInput.value) || 2;
        }
        
        // 面样式
        if (layerGeometryType === 'Polygon' || layerGeometryType === 'Mixed') {
            const fillColorInput = document.getElementById('configFillColor');
            const strokeColorInput = document.getElementById('configStrokeColor');
            const opacityInput = document.getElementById('configOpacity');
            if (fillColorInput) newStyle.fillColor = fillColorInput.value;
            if (strokeColorInput) newStyle.strokeColor = strokeColorInput.value;
            if (opacityInput) newStyle.opacity = parseInt(opacityInput.value) || 30;
        }
        
        // 保存样式到图层对象
        item.style = newStyle;
        
        // 应用新样式到图层
        applyLayerStyle(item.layer, newStyle, layerGeometryType);
        
        // 关闭模态框
        document.body.removeChild(modal);
        
        console.log(`图层 ${item.name} 样式已更新:`, newStyle);
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

/**
 * 应用样式到图层
 * @param {ol.layer.Vector} layer - 矢量图层
 * @param {Object} style - 样式对象
 * @param {string} geometryType - 几何类型
 */
function applyLayerStyle(layer, style, geometryType) {
    console.log('应用样式到图层:', style);
    const newStyleFunction = function(feature) {
        const geomType = feature.getGeometry().getType();
        const styles = [];
        
        // 检查是否有分类样式设置
        const categoryField = style.categoryField;
        const categoryStyles = style.categoryStyles;
        let categoryColor = null;
        let categorySymbol = null;
        let categorySize = null;
        
        if (categoryField && categoryStyles && typeof categoryStyles === 'object') {
            var fieldValue;
            
            // 处理字段表达式
            if (categoryField.startsWith('__expr__:')) {
                const expr = categoryField.replace('__expr__:', '');
                try {
                    const props = feature.getProperties();
                    let evalExpr = expr;
                    const fieldRegex = /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*/g;
                    const reserved = ['Math', 'NaN', 'Infinity', 'parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'JSON', 'isNaN', 'isFinite', 'abs', 'round', 'floor', 'ceil', 'pow', 'sqrt', 'PI'];
                    const matchedFields = evalExpr.match(fieldRegex) || [];
                    matchedFields.forEach(field => {
                        if (reserved.includes(field) || /^[0-9]+(\.[0-9]+)?$/.test(field)) return;
                        if (props[field] !== undefined) {
                            var val = props[field];
                            if (typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val))) {
                                evalExpr = evalExpr.split(field).join('(' + (typeof val === 'number' ? val : parseFloat(val)) + ')');
                            } else {
                                evalExpr = evalExpr.split(field).join('(0)');
                            }
                        } else {
                            evalExpr = evalExpr.split(field).join('(0)');
                        }
                    });
                    fieldValue = parseFloat(Function('"use strict"; return (' + evalExpr + ')')());
                } catch(e) {
                    fieldValue = undefined;
                }
            } else {
                fieldValue = feature.get(categoryField);
            }
            
            if (fieldValue !== undefined && fieldValue !== null) {
                // 检查是否是数值型分类（使用数值段）
                if (categoryStyles._isNumeric && categoryStyles._numericRanges) {
                    const numValue = parseFloat(fieldValue);
                    if (!isNaN(numValue)) {
                        // 查找匹配的数值段
                        for (const range of categoryStyles._numericRanges) {
                            const min = range.min !== undefined ? parseFloat(range.min) : -Infinity;
                            const max = range.max !== undefined ? parseFloat(range.max) : Infinity;
                            if (numValue >= min && numValue < max) {
                                categoryColor = range.color;
                                categorySymbol = range.symbol;
                                categorySize = range.size;
                                console.log('应用数值段样式:', numValue, `[${min}, ${max})`, range.color, range.symbol, range.size);
                                break;
                            }
                        }
                    }
                } else if (categoryStyles._dateMode) {
                    // 日期型分类
                    const parsedDate = new Date(fieldValue);
                    if (!isNaN(parsedDate.getTime())) {
                        const mode = categoryStyles._dateMode;
                        let dateKey;
                        if (mode === 'year') {
                            dateKey = parsedDate.getFullYear() + '年';
                        } else if (mode === 'month') {
                            dateKey = parsedDate.getFullYear() + '-' + String(parsedDate.getMonth() + 1).padStart(2, '0');
                        } else if (mode === 'day') {
                            dateKey = parsedDate.getFullYear() + '-' + String(parsedDate.getMonth() + 1).padStart(2, '0') + '-' + String(parsedDate.getDate()).padStart(2, '0');
                        } else {
                            dateKey = String(fieldValue);
                        }
                        if (categoryStyles[dateKey] && categoryStyles[dateKey].color) {
                            categoryColor = categoryStyles[dateKey].color;
                        }
                    }
                } else {
                    // 非数值型分类（使用精确匹配）
                    const valueKey = String(fieldValue);
                    if (categoryStyles[valueKey] && categoryStyles[valueKey].color) {
                        categoryColor = categoryStyles[valueKey].color;
                        categorySymbol = categoryStyles[valueKey].symbol;
                        console.log('应用分类样式:', valueKey, categoryColor, categorySymbol);
                    }
                }
            }
        }
        
        // 点样式
        if (geomType === 'Point' || geomType === 'MultiPoint') {
            // 优先使用分类颜色，否则使用默认颜色
            const pointColor = categoryColor || style.pointColor || '#1890ff';
            // 优先使用分类大小（数值型字段），否则使用默认大小
            const pointSize = categorySize || style.pointSize || 6;
            
            // 优先使用分类符号，否则使用默认符号
            const pointSymbol = categorySymbol || style.pointType || 'circle';
            
            // 转换颜色为 rgba
            const r = parseInt(pointColor.slice(1, 3), 16);
            const g = parseInt(pointColor.slice(3, 5), 16);
            const b = parseInt(pointColor.slice(5, 7), 16);
            const color = `rgba(${r}, ${g}, ${b}, 0.8)`;
            const strokeColor = '#fff';
            
            // 根据符号类型创建不同的样式
            if (pointSymbol.length === 2 && pointSymbol.charCodeAt(0) > 255) {
                // Emoji 符号 - 使用文本样式
                styles.push(new ol.style.Style({
                    text: new ol.style.Text({
                        text: pointSymbol,
                        font: `${pointSize * 3}px Arial`,
                        fill: new ol.style.Fill({ color: pointColor }),
                        stroke: new ol.style.Stroke({ color: strokeColor, width: 1 })
                    })
                }));
            } else {
                // 几何符号
                switch (pointSymbol) {
                    case 'square':
                        styles.push(new ol.style.Style({
                            image: new ol.style.RegularShape({
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 }),
                                points: 4,
                                radius: pointSize,
                                angle: Math.PI / 4
                            })
                        }));
                        break;
                    case 'triangle':
                        styles.push(new ol.style.Style({
                            image: new ol.style.RegularShape({
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 }),
                                points: 3,
                                radius: pointSize,
                                rotation: 0
                            })
                        }));
                        break;
                    case 'star':
                        styles.push(new ol.style.Style({
                            image: new ol.style.RegularShape({
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 }),
                                points: 5,
                                radius: pointSize,
                                radius2: pointSize / 2,
                                angle: 0
                            })
                        }));
                        break;
                    case 'diamond':
                        styles.push(new ol.style.Style({
                            image: new ol.style.RegularShape({
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 }),
                                points: 4,
                                radius: pointSize,
                                angle: Math.PI / 4
                            })
                        }));
                        break;
                    case 'cross':
                        styles.push(new ol.style.Style({
                            image: new ol.style.RegularShape({
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 }),
                                points: 4,
                                radius: pointSize,
                                radius2: 0,
                                angle: 0
                            })
                        }));
                        break;
                    case 'x':
                        styles.push(new ol.style.Style({
                            image: new ol.style.RegularShape({
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 }),
                                points: 4,
                                radius: pointSize,
                                radius2: 0,
                                angle: Math.PI / 4
                            })
                        }));
                        break;
                    default: // circle
                        styles.push(new ol.style.Style({
                            image: new ol.style.Circle({
                                radius: pointSize,
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: strokeColor, width: 2 })
                            })
                        }));
                }
            }
        }
        
        // 线样式
        if (geomType === 'LineString' || geomType === 'MultiLineString') {
            // 优先使用分类颜色
            const lineColor = categoryColor || style.lineColor || '#52c41a';
            const lineWidth = style.lineWidth || 2;
            
            styles.push(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: lineColor,
                    width: lineWidth
                })
            }));
        }
        
        // 面样式
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            // 优先使用分类颜色
            const fillColor = categoryColor || style.fillColor || '#ffa500';
            const strokeColor = categoryColor || style.strokeColor || '#ffa500';
            const opacity = (style.opacity || 30) / 100;
            
            // 转换填充颜色为 rgba
            const r = parseInt(fillColor.slice(1, 3), 16);
            const g = parseInt(fillColor.slice(3, 5), 16);
            const b = parseInt(fillColor.slice(5, 7), 16);
            
            styles.push(new ol.style.Style({
                fill: new ol.style.Fill({
                    color: `rgba(${r}, ${g}, ${b}, ${opacity})`
                }),
                stroke: new ol.style.Stroke({
                    color: strokeColor,
                    width: 2
                })
            }));
        }
        
        return styles;
    };
    
    // 应用新样式
    layer.setStyle(newStyleFunction);
}

// ==================== 图片查看器功能 ====================

/**
 * 打开图片查看器
 * 支持放大、缩小、平移、旋转功能
 * @param {string} imageSrc - 图片路径
 * @param {string} title - 图片标题
 */
function openImageViewer(imageSrc, title) {
    // 阻止事件冒泡，避免触发地图点击
    if (event) {
        event.stopPropagation();
    }
    
    // 创建查看器容器
    const viewer = document.createElement('div');
    viewer.id = 'imageViewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        z-index: 100000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;
    
    // 创建标题栏
    const header = document.createElement('div');
    header.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        padding: 15px 20px;
        background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 100001;
    `;
    
    const titleEl = document.createElement('div');
    titleEl.textContent = title || '图片查看';
    titleEl.style.cssText = 'font-size: 16px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 5px 10px;
        border-radius: 4px;
        transition: background 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'none';
    closeBtn.onclick = () => document.body.removeChild(viewer);
    
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    viewer.appendChild(header);
    
    // 创建图片容器
    const imageContainer = document.createElement('div');
    imageContainer.style.cssText = `
        position: relative;
        width: 90%;
        height: 80%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
    `;
    
    // 创建图片元素
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        transition: transform 0.1s ease-out;
        user-select: none;
        -webkit-user-drag: none;
    `;
    
    // 图片状态
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    
    // 更新图片变换
    function updateTransform() {
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
    
    // 鼠标滚轮缩放
    imageContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.5, Math.min(5, scale * delta));
        
        if (newScale !== scale) {
            scale = newScale;
            updateTransform();
        }
    });
    
    // 鼠标拖拽
    imageContainer.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // 左键
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            imageContainer.style.cursor = 'grabbing';
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        }
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        imageContainer.style.cursor = 'grab';
    });
    
    // 触摸支持
    let lastTouchDistance = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    
    imageContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
        } else if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
            lastTouchCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }
    });
    
    imageContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            updateTransform();
        } else if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
            const delta = distance / lastTouchDistance;
            scale = Math.max(0.5, Math.min(5, scale * delta));
            lastTouchDistance = distance;
            updateTransform();
        }
    });
    
    imageContainer.addEventListener('touchend', () => {
        isDragging = false;
    });
    
    // 双击重置
    imageContainer.addEventListener('dblclick', () => {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    });
    
    imageContainer.appendChild(img);
    viewer.appendChild(imageContainer);
    
    // 创建控制栏
    const controls = document.createElement('div');
    controls.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        background: rgba(0, 0, 0, 0.7);
        padding: 10px 20px;
        border-radius: 30px;
        z-index: 100001;
    `;
    
    // 控制按钮
    const buttons = [
        { icon: '−', title: '缩小', action: () => { scale = Math.max(0.5, scale * 0.8); updateTransform(); } },
        { icon: '100%', title: '原始大小', action: () => { scale = 1; translateX = 0; translateY = 0; updateTransform(); } },
        { icon: '+', title: '放大', action: () => { scale = Math.min(5, scale * 1.2); updateTransform(); } },
        { icon: '⟲', title: '逆时针旋转', action: () => { img.style.transform += ' rotate(-90deg)'; } },
        { icon: '⟳', title: '顺时针旋转', action: () => { img.style.transform += ' rotate(90deg)'; } }
    ];
    
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.innerHTML = btn.icon;
        button.title = btn.title;
        button.style.cssText = `
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;
        button.onmouseover = () => button.style.background = 'rgba(255,255,255,0.4)';
        button.onmouseout = () => button.style.background = 'rgba(255,255,255,0.2)';
        button.onclick = btn.action;
        controls.appendChild(button);
    });
    
    viewer.appendChild(controls);
    
    // 提示信息
    const hint = document.createElement('div');
    hint.innerHTML = '滚轮缩放 | 拖拽移动 | 双击重置';
    hint.style.cssText = `
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        pointer-events: none;
    `;
    viewer.appendChild(hint);
    
    // ESC 键关闭
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(viewer);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // 点击背景关闭
    viewer.addEventListener('click', (e) => {
        if (e.target === viewer) {
            document.body.removeChild(viewer);
        }
    });
    
    document.body.appendChild(viewer);
}
// ==================== 海洋风场可视化（Open-Meteo API） ====================
// 风场图层
let windLayer = null;
let windDataVisible = false;

// 粒子风场
let windParticlesLayer = null;
let windAnimationId = null;
let windParticleCanvas = null;
let windContext = null;
let particles = [];
let windGridData = null;  // 存储风场网格数据用于插值



// 粒子风场配置
const particleConfig = {
    particleCount: 1000,      // 粒子数量（减少一半）
    particleSpeed: 0.2,       // 粒子速度
    particleTrailLength: 20,  // 拖尾长度
    particleWidth: 1.2,       // 粒子宽度
    maxSpeed: 20,            // 最大风速（用于颜色映射）
    gridResolution: 0.5,      // 网格分辨率
    speedMultiplier: 1.0     // 风速倍乘系数
};



// 地图交互状态
let isMapInteracting = false;

// 粒子类
class WindParticle {
    constructor(map) {
        this.map = map;
        this.reset();
    }
    
    reset() {
        const size = this.map.getSize();
        this.x = Math.random() * size[0];
        this.y = Math.random() * size[1];
        this.age = 0;
        this.maxAge = Math.floor(Math.random() * 100) + 50;
    }
    
    update(windGrid, map) {
        const coord = map.getCoordinateFromPixel([this.x, this.y]);
        if (!coord) {
            this.reset();
            return;
        }
        
        const lonLat = ol.proj.toLonLat(coord);
        const wind = getWindAtPoint(lonLat[0], lonLat[1], windGrid);
        
        if (wind && wind.speed !== null && wind.speed > 0.1) {
            // 有真实风场数据，按实际风速流动（应用倍乘系数让慢速风也能明显流动）
            // 风向转换：API返回的是风从哪里来的方向，需要转换为风往哪里去的方向
            const angleRad = ((wind.direction + 180) % 360 - 90) * Math.PI / 180;
            // 应用倍乘系数，但限制最大速度
            const adjustedSpeed = Math.min(
                wind.speed * particleConfig.speedMultiplier, 
                particleConfig.maxSpeed
            );
            const dx = Math.cos(angleRad) * adjustedSpeed * particleConfig.particleSpeed;
            const dy = Math.sin(angleRad) * adjustedSpeed * particleConfig.particleSpeed;
            
            this.x += dx;
            this.y += dy;
            
            // 保存原始风速和风向用于绘制（显示真实风速颜色）
            this.currentSpeed = wind.speed;
            this.currentDirection = wind.direction;
            this.hasRealData = true;
        } else {
            // 移动到无数据区域，立即重置
            this.reset();
            return;
        }

        this.age++;

        // 如果粒子超出边界或寿命结束，重置
        const size = this.map.getSize();
        if (this.x < 0 || this.x > size[0] || this.y < 0 || this.y > size[1] || this.age > this.maxAge) {
            this.reset();
        }
    }
    
    draw(ctx) {
        const alpha = 1 - (this.age / this.maxAge);
        
        if (this.hasRealData) {
            // 有真实数据，显示渐隐拖尾效果
            const speed = this.currentSpeed || 5;
            const baseColor = getSpeedColorRGB(speed);
            const angleRad = (this.currentDirection - 90) * Math.PI / 180;
            
            // 绘制渐隐拖尾
            const segments = 8;
            for (let i = 0; i < segments; i++) {
                const t = i / segments;
                const trailAlpha = alpha * (1 - t) * 0.6;
                const segmentLength = particleConfig.particleTrailLength / segments;
                
                const x1 = this.x - Math.cos(angleRad) * segmentLength * i;
                const y1 = this.y - Math.sin(angleRad) * segmentLength * i;
                const x2 = this.x - Math.cos(angleRad) * segmentLength * (i + 1);
                const y2 = this.y - Math.sin(angleRad) * segmentLength * (i + 1);
                
                ctx.strokeStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${trailAlpha})`;
                ctx.lineWidth = particleConfig.particleWidth * (1 - t * 0.5);
                ctx.lineCap = 'round';
                
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        } else {
            // 无真实数据，不显示（减少视觉干扰）
        }
    }
}

// 根据风速获取颜色（统一颜色，不随速度变化）
function getSpeedColor(speed) {
    // 统一使用青绿色
    return 'rgba(100, 220, 180, 1.0)';
}

// 根据风速获取 RGB 颜色对象（统一颜色）
function getSpeedColorRGB(speed) {
    // 统一使用青绿色
    return {
        r: 100,
        g: 220,
        b: 180
    };
}

// HSL 转 RGB
function hslToRgb(h, s, l) {
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// 获取指定点的风速和风向（使用双线性插值）
function getWindAtPoint(lon, lat, windGrid) {
    if (!windGrid || !windGrid.points || windGrid.points.length === 0) {
        return null;
    }
    
    const points = windGrid.points;
    let minDist = Infinity;
    let nearest = null;
    
    // 找到最近的点
    for (const point of points) {
        if (point.speed === null || point.direction === null) continue;
        const dist = Math.sqrt(Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2));
        if (dist < minDist) {
            minDist = dist;
            nearest = point;
        }
    }
    
    if (!nearest) return null;
    
    // 如果距离太远，返回最近点的风场
    if (minDist > 2) return { speed: nearest.speed, direction: nearest.direction };
    
    // 双线性插值
    let totalWeight = 0;
    let weightedSpeed = 0;
    let weightedDirX = 0;
    let weightedDirY = 0;
    
    for (const point of points) {
        if (point.speed === null || point.direction === null) continue;
        const dist = Math.max(0.01, Math.sqrt(Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2)));
        const weight = 1 / (dist * dist);
        
        totalWeight += weight;
        weightedSpeed += point.speed * weight;
        
        const dirRad = (point.direction - 90) * Math.PI / 180;
        weightedDirX += Math.cos(dirRad) * weight;
        weightedDirY += Math.sin(dirRad) * weight;
    }
    
    if (totalWeight === 0) return null;
    
    const avgSpeed = weightedSpeed / totalWeight;
    let avgDir = Math.atan2(weightedDirY, weightedDirX) * 180 / Math.PI + 90;
    if (avgDir < 0) avgDir += 360;
    
    return { speed: avgSpeed, direction: avgDir };
}

// 创建粒子风场图层
function createParticleWindLayer(map, windData) {
    // 转换风场数据为网格格式
    const points = [];
    for (let i = 0; i < windData.latitudes.length; i++) {
        points.push({
            lat: parseFloat(windData.latitudes[i]),
            lon: parseFloat(windData.longitudes[i]),
            speed: windData.风速[i],
            direction: windData.风向[i]
        });
    }
    
    windGridData = { points: points, bounds: map.getView().calculateExtent(map.getSize()) };
    
    // 创建 Canvas
    if (windParticleCanvas) {
        windParticleCanvas.parentNode.removeChild(windParticleCanvas);
    }
    
    windParticleCanvas = document.createElement('canvas');
    windParticleCanvas.id = 'windParticleCanvas';
    windParticleCanvas.style.position = 'absolute';
    windParticleCanvas.style.top = '0';
    windParticleCanvas.style.left = '0';
    windParticleCanvas.style.pointerEvents = 'none';
    windParticleCanvas.style.zIndex = '1000';
    windParticleCanvas.style.backgroundColor = 'transparent';
    
    const mapElement = map.getTargetElement();
    const size = map.getSize();
    
    console.log('地图尺寸:', size);
    
    // 确保尺寸有效
    if (!size || size[0] === 0 || size[1] === 0) {
        console.error('地图尺寸无效');
        return false;
    }
    
    windParticleCanvas.width = size[0];
    windParticleCanvas.height = size[1];
    
    console.log('Canvas尺寸:', windParticleCanvas.width, 'x', windParticleCanvas.height);
    
    // 将 canvas 插入到地图容器内
    mapElement.style.position = 'relative';
    mapElement.appendChild(windParticleCanvas);
    
    windContext = windParticleCanvas.getContext('2d');
    
    // 测试绘制一个红点确认 canvas 正常工作
    windContext.fillStyle = 'red';
    windContext.beginPath();
    windContext.arc(50, 50, 5, 0, Math.PI * 2);
    windContext.fill();
    console.log('测试绘制完成');
    
    // 创建粒子
    particles = [];
    for (let i = 0; i < particleConfig.particleCount; i++) {
        particles.push(new WindParticle(map));
    }
    
    console.log('创建了', particles.length, '个粒子');
    
    // 开始动画
    animateParticles(map);
    
    return true;
}

// 粒子动画循环
function animateParticles(map) {
    // 如果地图正在交互，暂停更新但继续动画循环
    if (!isMapInteracting) {
        // 使用半透明清除创建拖尾效果（类似 nullschool）
        windContext.globalCompositeOperation = 'destination-out';
        windContext.fillStyle = 'rgba(0, 0, 0, 0.15)';
        windContext.fillRect(0, 0, windParticleCanvas.width, windParticleCanvas.height);
        windContext.globalCompositeOperation = 'source-over';
        
        // 更新和绘制粒子
        for (const particle of particles) {
            const coord = map.getCoordinateFromPixel([particle.x, particle.y]);
            if (coord) {
                const lonLat = ol.proj.toLonLat(coord);
                const wind = getWindAtPoint(lonLat[0], lonLat[1], windGridData);
                if (wind) {
                    particle.currentSpeed = wind.speed;
                    particle.currentDirection = wind.direction;
                }
            }
            
            particle.update(windGridData, map);
            particle.draw(windContext);
        }
    }
    
    windAnimationId = requestAnimationFrame(() => animateParticles(map));
}

// 停止粒子动画
function stopParticleAnimation() {
    if (windAnimationId) {
        cancelAnimationFrame(windAnimationId);
        windAnimationId = null;
    }
    
    if (windParticleCanvas) {
        windParticleCanvas.parentNode.removeChild(windParticleCanvas);
        windParticleCanvas = null;
        windContext = null;
    }
    
    particles = [];
    windGridData = null;
}

// 风场样式配置
const windStyle = {
    arrowLength: 30,      // 箭头长度（像素）
    arrowColor: '#ff3366',
    arrowWidth: 2,
    showSpeed: true,      // 是否显示风速数值
    useParticles: true    // 是否使用粒子效果
};

// 获取风场数据
async function fetchWindData(bounds, zoom) {
    // 根据缩放级别调整网格密度（zoom越大，网格越密）
    const gridSize = zoom > 8 ? 1.0 : (zoom > 6 ? 1.5 : 2.0);
    
    // 计算经纬度范围（bounds 是 EPSG:3857 投影坐标）
    const minLonLat = ol.proj.toLonLat([bounds[0], bounds[1]]);
    const maxLonLat = ol.proj.toLonLat([bounds[2], bounds[3]]);
    
    // 扩展一点范围，让边缘也有数据
    const lonMin = Math.max(-180, minLonLat[0] - 2);
    const lonMax = Math.min(180, maxLonLat[0] + 2);
    const latMin = Math.max(-90, minLonLat[1] - 2);
    const latMax = Math.min(90, maxLonLat[1] + 2);
    
    // 构建网格点列表
    // Open-Meteo API 要求纬度和经度数组长度相同，需要构建配对点
    const points = [];
    for (let lat = latMin; lat <= latMax; lat += gridSize) {
        for (let lon = lonMin; lon <= lonMax; lon += gridSize) {
            points.push({
                lat: lat.toFixed(2),
                lon: lon.toFixed(2)
            });
        }
    }
    
    if (points.length === 0) return null;
    
    // 限制网格点数量，避免URL过长
    // Open-Meteo API 对 URL 长度有限制，同时 marine API 可能只支持特定区域
    const maxPoints = 50;  // 减少点数以提高成功率
    if (points.length > maxPoints) {
        const step = Math.ceil(points.length / maxPoints);
        const sampledPoints = points.filter((_, i) => i % step === 0);
        points.length = 0;
        points.push(...sampledPoints);
    }
    
    // 分离纬度和经度数组（确保长度相同）
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    
    console.log('构建的网格点:', points.length, '个');
    
    // 使用 Open-Meteo API（标准天气API，覆盖范围更广）
    // 备选：marine-api 只覆盖海洋，普通 api 覆盖全球
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=windspeed_10m,winddirection_10m&timezone=auto&forecast_days=1`;
    
    console.log('请求风场数据:', url);
    console.log('网格点数量:', points.length, '纬度:', lats.length, '经度:', lons.length);
    console.log('经纬度范围:', latMin, latMax, lonMin, lonMax);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('API响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API响应错误:', response.status, errorText);
            throw new Error(`API请求失败: ${response.status} - ${errorText.substring(0, 200)}`);
        }
        let data = await response.json();
        
        console.log('风场API响应:', data);
        
        // Open-Meteo API 当请求多个点时，返回的是数组格式
        // 每个数组元素代表一个经纬度点的数据
        if (Array.isArray(data)) {
            console.log('API返回数组格式，点数:', data.length);
            
            // 处理数组格式的响应
            const latArray = [];
            const lonArray = [];
            const speeds = [];
            const directions = [];
            
            // 获取当前小时索引（根据本地时间）
            const now = new Date();
            const currentHour = now.getHours();
            console.log('当前本地时间:', now.toLocaleString(), '小时:', currentHour);
            
            for (const point of data) {
                // 标准API使用 windspeed_10m 和 winddirection_10m（注意没有下划线）
                const windSpeedArray = point.hourly?.windspeed_10m || point.hourly?.wind_speed_10m;
                const windDirArray = point.hourly?.winddirection_10m || point.hourly?.wind_direction_10m;
                
                if (windSpeedArray && windDirArray) {
                    latArray.push(point.latitude);
                    lonArray.push(point.longitude);
                    
                    // 尝试获取当前小时的数据
                    let speed = windSpeedArray[currentHour];
                    let direction = windDirArray[currentHour];
                    
                    // 如果当前小时为null，尝试找最近的有效数据
                    if (speed === null || direction === null || speed === undefined || direction === undefined) {
                        for (let i = 0; i < 24; i++) {
                            if (windSpeedArray[i] !== null && windSpeedArray[i] !== undefined && 
                                windDirArray[i] !== null && windDirArray[i] !== undefined) {
                                speed = windSpeedArray[i];
                                direction = windDirArray[i];
                                console.log(`使用第 ${i} 小时的数据: 风速=${speed.toFixed(1)}m/s, 风向=${direction}°`);
                                break;
                            }
                        }
                    } else {
                        console.log(`当前小时数据: 风速=${speed.toFixed(1)}m/s, 风向=${direction}°`);
                    }
                    
                    speeds.push(speed);
                    directions.push(direction);
                }
            }
            
            if (speeds.length === 0) {
                throw new Error('所有点的风场数据都为空（可能是陆地位置）');
            }
            
            console.log('提取的风速数据:', speeds.length, '条');
            console.log('提取的风向数据:', directions.length, '条');
            
            return {
                latitudes: latArray,
                longitudes: lonArray,
                风速: speeds,
                风向: directions
            };
        }
        
        // 单点情况（对象格式）
        if (!data.hourly || !data.hourly.wind_speed_10m || !data.hourly.wind_direction_10m) {
            console.error('API返回数据格式不正确:', data);
            throw new Error('API返回数据格式不正确');
        }
        
        // 单点情况
        const windSpeedData = data.hourly.wind_speed_10m;
        const windDirData = data.hourly.wind_direction_10m;
        
        return {
            latitudes: [data.latitude],
            longitudes: [data.longitude],
            风速: [windSpeedData[0]],
            风向: [windDirData[0]]
        };
    } catch (error) {
        console.error('获取风场数据失败:', error);
        return null;
    }
}

// 创建风场矢量图层
function createWindLayer(windData) {
    if (!windData || !windData.风速 || !windData.风向) return null;
    
    const features = [];
    const speeds = windData.风速;
    const directions = windData.风向;
    const lats = windData.latitudes;
    const lons = windData.longitudes;
    
    // 确保数据是数组格式
    const speedArray = Array.isArray(speeds) ? speeds : [speeds];
    const dirArray = Array.isArray(directions) ? directions : [directions];
    const latArray = Array.isArray(lats) ? lats : [lats];
    const lonArray = Array.isArray(lons) ? lons : [lons];
    
    console.log('创建风场图层:', speedArray.length, '个点');
    
    let validPointCount = 0;
    let nullPointCount = 0;
    
    // 为每个点创建箭头
    // 注意：API返回的是一维数组格式，每个点对应一个 lat/lon/speed/direction
    for (let idx = 0; idx < speedArray.length; idx++) {
        const speed = speedArray[idx];
        const direction = dirArray[idx];
        const lat = latArray[idx];
        const lon = lonArray[idx];
        
        // 跳过无效数据
        if (speed === undefined || direction === undefined) continue;
        if (speed === null || direction === null) {
            nullPointCount++;
            continue;
        }
        if (speed < 0.1) continue; // 风速太小不显示
        
        validPointCount++;
        console.log(`点 ${idx}: lat=${lat}, lon=${lon}, speed=${speed}, dir=${direction}`);
        
        // 计算箭头终点（根据风向和风速调整箭头长度）
        // 风向转换：API返回的是风从哪里来的方向，需要转换为风往哪里去的方向
        const angleRad = ((direction + 180) % 360 - 90) * Math.PI / 180;
        const arrowScale = Math.min(1, speed / 15); // 最大风速15m/s时箭头最长
        const arrowLen = windStyle.arrowLength * (0.3 + arrowScale * 0.7);
        
        const dx = Math.cos(angleRad) * arrowLen;
        const dy = Math.sin(angleRad) * arrowLen;
        
        // 起点坐标（投影坐标）
        const startPoint = ol.proj.fromLonLat([lon, lat]);
        const endPoint = [startPoint[0] + dx, startPoint[1] + dy];
        
        // 创建箭头线
        const lineFeature = new ol.Feature({
            geometry: new ol.geom.LineString([startPoint, endPoint]),
            speed: speed,
            direction: direction,
            lat: lat,
            lon: lon
        });
        features.push(lineFeature);
        
        // 添加箭头头部（三角形）
        const arrowHeadLen = 8;
        const arrowHeadAngle = Math.PI / 6; // 30度
        
        const headX = endPoint[0];
        const headY = endPoint[1];
        const backAngle = angleRad + Math.PI;
        
        const leftX = headX + Math.cos(backAngle - arrowHeadAngle) * arrowHeadLen;
        const leftY = headY + Math.sin(backAngle - arrowHeadAngle) * arrowHeadLen;
        const rightX = headX + Math.cos(backAngle + arrowHeadAngle) * arrowHeadLen;
        const rightY = headY + Math.sin(backAngle + arrowHeadAngle) * arrowHeadLen;
        
        const arrowFeature = new ol.Feature({
            geometry: new ol.geom.Polygon([[
                [headX, headY],
                [leftX, leftY],
                [rightX, rightY],
                [headX, headY]
            ]]),
            speed: speed,
            direction: direction
        });
        features.push(arrowFeature);
    }
    
    console.log(`风场数据汇总: 总点数=${speedArray.length}, 有效点=${validPointCount}, null点=${nullPointCount}`);
    
    // 如果没有有效数据，显示提示
    if (features.length === 0) {
        console.warn('没有有效的风场数据可显示');
        // 显示提示信息
        const loadingPanel = document.getElementById('windLoadingPanel');
        if (loadingPanel) {
            const loadingProgress = document.getElementById('windLoadingProgress');
            if (loadingProgress) {
                if (nullPointCount > 0) {
                    loadingProgress.innerHTML = '<span style="color: #ff9800;">⚠️ 当前区域无海洋风场数据</span><br><span style="font-size: 12px;">Open-Meteo Marine API 仅提供海洋区域数据<br>请尝试缩放至海洋区域（如南海、东海等）</span>';
                } else {
                    loadingProgress.innerHTML = '<span style="color: #ff9800;">⚠️ 未找到有效的风场数据</span>';
                }
            }
            setTimeout(() => {
                loadingPanel.style.display = 'none';
            }, 4000);
        }
        return null;
    }
    
    // 创建矢量图层
    const source = new ol.source.Vector({ features: features });
    
    const layer = new ol.layer.Vector({
        source: source,
        style: function(feature) {
            const geomType = feature.getGeometry().getType();
            const speed = feature.get('speed');
            
            // 根据风速设置颜色
            let color = '#ff3366';
            if (speed < 3) color = '#66cc66';      // 微风 绿色
            else if (speed < 8) color = '#ffcc33';  // 和风 黄色
            else if (speed < 15) color = '#ff9933'; // 强风 橙色
            else color = '#ff3366';                  // 大风 红色
            
            if (geomType === 'LineString') {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: color,
                        width: windStyle.arrowWidth
                    })
                });
            } else if (geomType === 'Polygon') {
                return new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: color
                    }),
                    stroke: new ol.style.Stroke({
                        color: color,
                        width: 1
                    })
                });
            }
            return new ol.style.Style();
        }
    });
    
    return layer;
}

// 加载并显示风场
async function loadWindData() {
    const loadingPanel = document.getElementById('loadingPanel');
    const loadingProgress = document.getElementById('loadingProgress');
    
    if (loadingPanel) {
        loadingPanel.style.display = 'block';
        loadingProgress.textContent = '正在获取海洋风场数据...';
    }
    
    try {
        // 获取当前地图视图范围
        const view = map.getView();
        const extent = view.calculateExtent();
        const zoom = view.getZoom();
        
        const windData = await fetchWindData(extent, zoom);
        
        console.log('获取到的风场数据:', windData);
        
        if (windData && windData.风速 && windData.风向) {
            // 检查数据有效性
            if (windData.风速.length === 0 || windData.风向.length === 0) {
                throw new Error('风场数据为空数组');
            }
            
            // 移除旧图层
            if (windLayer) {
                map.removeLayer(windLayer);
                windLayer = null;
            }
            
            // 停止旧的粒子动画
            stopParticleAnimation();
            
            // 根据配置选择显示方式
            if (windStyle.useParticles) {
                // 使用粒子效果
                const success = createParticleWindLayer(map, windData);
                if (success) {
                    windDataVisible = true;
                    const windBtn = document.getElementById('toggleWindBtn');
                    if (windBtn) windBtn.classList.add('active');
                    console.log('粒子风场加载成功');
                    if (loadingPanel) loadingPanel.style.display = 'none';
                } else {
                    console.log('粒子风场未创建');
                    return;
                }
            } else {
                // 使用箭头效果
                windLayer = createWindLayer(windData);
                
                if (windLayer) {
                    map.addLayer(windLayer);
                    windDataVisible = true;
                    
                    // 更新按钮状态
                    const windBtn = document.getElementById('toggleWindBtn');
                    if (windBtn) windBtn.classList.add('active');
                    
                    console.log('风场数据加载成功');
                    if (loadingPanel) loadingPanel.style.display = 'none';
                } else {
                    // createWindLayer 返回 null 表示没有有效数据（已在函数内显示提示）
                    console.log('风场图层未创建，可能是当前区域无海洋数据');
                    // 不要抛出错误，因为提示信息已经在 createWindLayer 中显示
                    return;
                }
            }
        } else {
            console.error('风场数据无效:', windData);
            throw new Error('未获取到有效数据，API可能返回了空数据或格式不正确');
        }
    } catch (error) {
        console.error('加载风场失败:', error);
        if (loadingPanel) {
            loadingProgress.textContent = '加载失败: ' + error.message;
            setTimeout(() => {
                loadingPanel.style.display = 'none';
            }, 2000);
        }
        alert('获取风场数据失败，请检查网络后重试');
    }
}

// 关闭风场图层
function hideWindLayer() {
    // 移除箭头图层
    if (windLayer) {
        map.removeLayer(windLayer);
        windLayer = null;
    }
    
    // 停止粒子动画
    stopParticleAnimation();
    
    windDataVisible = false;
    
    const windBtn = document.getElementById('toggleWindBtn');
    if (windBtn) windBtn.classList.remove('active');
}

// 切换风场显示
async function toggleWindLayer() {
    if (windDataVisible) {
        hideWindLayer();
    } else {
        await loadWindData();
    }
}

// ==================== 添加风场控制按钮 ====================
// 在工具栏添加风场切换按钮
function addWindControlButton() {
    // 风场按钮已在HTML中定义，只需要添加事件监听器
    const windBtn = document.getElementById('toggleWindBtn');
    if (windBtn) {
        windBtn.addEventListener('click', toggleWindLayer);
    }
}

// 地图移动/缩放后自动刷新风场（可选，需要时取消注释）
let refreshTimer = null;
function setupAutoRefreshWind() {
    map.getView().on('change', function() {
        if (windDataVisible) {
            // 防抖：移动停止后0.5秒再刷新
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                loadWindData();
            }, 500);
        }
    });
}

// ==================== 初始化风场功能 ====================
// 页面加载完成后添加按钮
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addWindControlButton();
        // 如果需要自动刷新，取消下面注释
        // setupAutoRefreshWind();
    });
} else {
    addWindControlButton();
    // setupAutoRefreshWind();
}

// ==================== 点击查询风速 ====================
// 创建风速查询弹出框
function createWindQueryPopup() {
    // 检查是否已存在
    if (document.getElementById('windQueryPopup')) return;
    
    const popup = document.createElement('div');
    popup.id = 'windQueryPopup';
    popup.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 15px;
        border-radius: 6px;
        font-size: 13px;
        pointer-events: none;
        z-index: 10000;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.2);
        min-width: 150px;
    `;
    document.body.appendChild(popup);
    return popup;
}

// 显示风速信息
function showWindInfo(pixel, coordinate) {
    const popup = document.getElementById('windQueryPopup') || createWindQueryPopup();
    const lonLat = ol.proj.toLonLat(coordinate);
    
    // 查询该点的风速
    const wind = getWindAtPoint(lonLat[0], lonLat[1], windGridData);
    
    if (wind && wind.speed !== null && wind.speed > 0.1) {
        // 根据风速设置颜色
        let color = '#ff3366';
        if (wind.speed < 3) color = '#66cc66';
        else if (wind.speed < 8) color = '#ffcc33';
        else if (wind.speed < 15) color = '#ff9933';
        
        popup.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">🌬️ 风场信息</div>
            <div>风速: <span style="color: ${color}; font-weight: bold;">${wind.speed.toFixed(1)} m/s</span></div>
            <div>风向: ${wind.direction.toFixed(0)}°</div>
            <div style="font-size: 11px; color: #aaa; margin-top: 5px;">
                ${getWindDirectionText(wind.direction)}
            </div>
        `;
    } else {
        popup.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">🌬️ 风场信息</div>
            <div style="color: #888;">该位置无风场数据</div>
        `;
    }
    
    // 设置位置
    popup.style.left = (pixel[0] + 15) + 'px';
    popup.style.top = (pixel[1] + 15) + 'px';
    popup.style.display = 'block';
}

// 获取风向文字描述
function getWindDirectionText(degree) {
    const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const index = Math.round(degree / 45) % 8;
    return directions[index] + '风';
}

// 隐藏风速信息
function hideWindInfo() {
    const popup = document.getElementById('windQueryPopup');
    if (popup) popup.style.display = 'none';
}

// 创建流场查询弹出框
function createCurrentQueryPopup() {
    if (document.getElementById('currentQueryPopup')) return;
    
    const popup = document.createElement('div');
    popup.id = 'currentQueryPopup';
    popup.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 15px;
        border-radius: 6px;
        font-size: 13px;
        pointer-events: none;
        z-index: 10000;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.2);
        min-width: 150px;
    `;
    document.body.appendChild(popup);
    return popup;
}

// 显示流场信息
function showCurrentInfo(pixel, coordinate) {
    const popup = document.getElementById('currentQueryPopup') || createCurrentQueryPopup();
    const lonLat = ol.proj.toLonLat(coordinate);
    
    const current = getWindAtPoint(lonLat[0], lonLat[1], currentGridData);
    
    if (current && current.speed !== null && current.speed > 0.1) {
        popup.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">🌀 洋流信息</div>
            <div>流速: <span style="color: #66aaff; font-weight: bold;">${current.speed.toFixed(2)} m/s</span></div>
            <div>流向: ${current.direction.toFixed(0)}°</div>
            <div style="font-size: 11px; color: #aaa; margin-top: 5px;">
                ${getCurrentDirectionText(current.direction)}
            </div>
        `;
    } else {
        popup.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">🌀 洋流信息</div>
            <div style="color: #888;">该位置无洋流数据</div>
        `;
    }
    
    popup.style.left = (pixel[0] + 15) + 'px';
    popup.style.top = (pixel[1] + 15) + 'px';
    popup.style.display = 'block';
}

// 获取流向文字描述
function getCurrentDirectionText(degree) {
    const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const index = Math.round(degree / 45) % 8;
    return '向' + directions[index] + '流动';
}

// 隐藏流场信息
function hideCurrentInfo() {
    const popup = document.getElementById('currentQueryPopup');
    if (popup) popup.style.display = 'none';
}

// 添加地图点击事件（风场或流场显示时启用）
map.on('click', function(evt) {
    if (windDataVisible) {
        showWindInfo(evt.pixel, evt.coordinate);
        setTimeout(hideWindInfo, 3000);
    }
});

// 鼠标移动时更新位置（如果弹出框显示中）
map.on('pointermove', function(evt) {
    const windPopup = document.getElementById('windQueryPopup');
    if (windPopup && windPopup.style.display === 'block' && windDataVisible) {
        showWindInfo(evt.pixel, evt.coordinate);
    }
});

// ==================== 海洋流场（洋流）可视化 ====================

// 获取洋流数据




// ==================== 地图交互时暂停粒子动画 ====================
// 监听地图交互开始
map.on('movestart', function() {
    isMapInteracting = true;
});

// 监听地图交互结束
map.on('moveend', function() {
    isMapInteracting = false;
});

// 监听拖拽开始
map.on('pointerdrag', function() {
    isMapInteracting = true;
});

// 监听缩放开始
map.getView().on('change:resolution', function() {
    isMapInteracting = true;
});

// 监听缩放结束（延迟恢复，避免连续缩放时的闪烁）
let zoomEndTimer = null;
map.getView().on('change:resolution', function() {
    if (zoomEndTimer) clearTimeout(zoomEndTimer);
    zoomEndTimer = setTimeout(() => {
        isMapInteracting = false;
    }, 300);
});

// ==================== 地图绘制功能（点线面） ====================
// 绘制状态
let drawMode = null; // 'Point', 'LineString', 'Polygon'
let drawLayer = null;
let drawSource = null;
let drawInteraction = null;
let drawFeatures = [];
let featureFields = null; // 存储字段结构（字段名称列表）

// 初始化绘制图层
function initDrawLayer() {
    if (drawLayer) return;
    
    drawSource = new ol.source.Vector();
    drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 255, 255, 0.2)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffcc33',
                width: 2
            }),
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({
                    color: '#ffcc33'
                })
            })
        })
    });
    
    drawLayer.set('name', '绘制图层');
    map.addLayer(drawLayer);
}

// 开始绘制
function startDraw(mode) {
    initDrawLayer();
    
    deactivateAllTools();
    
    // 移除之前的绘制交互
    if (drawInteraction) {
        map.removeInteraction(drawInteraction);
    }
    
    drawMode = mode;
    
    drawInteraction = new ol.interaction.Draw({
        source: drawSource,
        type: mode
    });
    
    // 绘制完成事件
    drawInteraction.on('drawend', function(evt) {
        const feature = evt.feature;
        
        // 添加属性
        feature.set('id', Date.now());
        feature.set('type', mode);
        feature.set('name', mode + '_' + drawFeatures.length);
        
        drawFeatures.push(feature);
        
        // 显示属性编辑对话框
        showFeatureEditDialog(feature);
    });
    
    map.addInteraction(drawInteraction);
    
    // 更新按钮状态
    updateDrawButtons(mode);
}

// 停止绘制
function stopDraw() {
    if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    }
    drawMode = null;
    updateDrawButtons(null);
}

// 更新绘制按钮状态
function updateDrawButtons(activeMode) {
    const buttons = ['drawPointBtn', 'drawLineBtn', 'drawPolygonBtn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('active');
        }
    });
    
    if (activeMode) {
        const activeBtn = document.getElementById(
            activeMode === 'Point' ? 'drawPointBtn' :
            activeMode === 'LineString' ? 'drawLineBtn' : 'drawPolygonBtn'
        );
        if (activeBtn) activeBtn.classList.add('active');
    }
}

// 显示要素编辑对话框
function showFeatureEditDialog(feature) {
    const geomType = feature.get('type');
    const currentName = feature.get('name') || '';
    
    const name = prompt('请输入要素名称:', currentName);
    if (name !== null) {
        feature.set('name', name);
    }
    
    // 检查是否是第一个对象
    if (drawFeatures.length === 1) {
        // 第一个对象，询问是否添加自定义属性
        const addMore = confirm('是否添加自定义属性?');
        if (addMore) {
            addCustomProperties(feature);
            // 存储字段结构（只存储字段名称）
            const properties = feature.getProperties();
            featureFields = [];
            Object.keys(properties).forEach(key => {
                if (key !== 'geometry' && key !== 'id' && key !== 'type' && key !== 'name') {
                    featureFields.push(key);
                }
            });
        }
    } else if (featureFields && featureFields.length > 0) {
        // 不是第一个对象，根据字段结构提示用户输入值
        featureFields.forEach(field => {
            const value = prompt(`请输入 ${field} 的值:`, '');
            if (value !== null) {
                feature.set(field, value);
            }
        });
    }
}

// 添加自定义属性
function addCustomProperties(feature) {
    let addMore = true;
    
    while (addMore) {
        const key = prompt('属性名:');
        if (!key) break;
        
        const value = prompt('属性值:');
        if (value !== null) {
            feature.set(key, value);
        }
        
        addMore = confirm('继续添加属性?');
    }
}

// 删除选中的要素
function deleteSelectedFeature() {
    const selected = drawSource.getFeatures().filter(f => f.get('selected'));
    selected.forEach(f => {
        drawSource.removeFeature(f);
        const idx = drawFeatures.indexOf(f);
        if (idx > -1) drawFeatures.splice(idx, 1);
    });
}

// 清空绘制图层
function clearDrawLayer() {
    if (confirm('确定要清空所有绘制的要素吗?')) {
        drawSource.clear();
        drawFeatures = [];
        featureFields = null; // 重置字段结构
    }
}

// 导出为 GeoJSON 或 KML
function exportDrawLayer() {
    if (drawFeatures.length === 0) {
        alert('没有可导出的要素');
        return;
    }
    
    const features = drawSource.getFeatures();
    
    // 显示导出格式选择对话框
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 100000;
        max-width: 400px;
        width: 90%;
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-top: 0;">选择导出格式</h3>
        <div style="margin: 20px 0;">
            <button id="exportGeoJSON" style="width: 100%; padding: 10px; margin-bottom: 10px;">导出为 GeoJSON</button>
            <button id="exportKML" style="width: 100%; padding: 10px;">导出为 KML</button>
        </div>
        <div style="text-align: right;">
            <button id="closeExportDialog" style="padding: 8px 16px;">取消</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 导出为 GeoJSON
    document.getElementById('exportGeoJSON').onclick = () => {
        const geojson = new ol.format.GeoJSON().writeFeatures(features, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
        });
        showExportDialog(geojson, 'draw_layer.geojson', 'GeoJSON');
        document.body.removeChild(dialog);
    };
    
    // 导出为 KML
    document.getElementById('exportKML').onclick = () => {
        const kml = new ol.format.KML().writeFeatures(features, {
            featureProjection: 'EPSG:3857'
        });
        showExportDialog(kml, 'draw_layer.kml', 'KML');
        document.body.removeChild(dialog);
    };
    
    // 关闭按钮
    document.getElementById('closeExportDialog').onclick = () => {
        document.body.removeChild(dialog);
    };
}

// 显示导出对话框
function showExportDialog(content, filename, format = 'GeoJSON') {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 100000;
        max-width: 600px;
        width: 90%;
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-top: 0;">导出 ${format}</h3>
        <textarea style="width: 100%; height: 300px; font-family: monospace; font-size: 11px;" readonly>${content}</textarea>
        <div style="margin-top: 15px; text-align: right;">
            <button id="copyData" style="margin-right: 10px; padding: 8px 16px;">复制</button>
            <button id="downloadData" style="margin-right: 10px; padding: 8px 16px;">下载</button>
            <button id="closeDialog" style="padding: 8px 16px;">关闭</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 复制按钮
    document.getElementById('copyData').onclick = () => {
        navigator.clipboard.writeText(content).then(() => {
            alert('已复制到剪贴板');
        });
    };
    
    // 下载按钮
    document.getElementById('downloadData').onclick = () => {
        const mimeType = format === 'KML' ? 'application/vnd.google-earth.kml+xml' : 'application/json';
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    
    // 关闭按钮
    document.getElementById('closeDialog').onclick = () => {
        document.body.removeChild(dialog);
    };
}

// 添加绘制工具栏
function addDrawToolbar() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    
    // 检查是否已存在
    if (document.getElementById('drawToolbar')) return;
    
    const drawDiv = document.createElement('div');
    drawDiv.id = 'drawToolbar';
    drawDiv.style.cssText = `
        position: relative;
    `;
    
    drawDiv.innerHTML = `
        <div class="dropdown">
            <button id="drawMainBtn" class="action-btn" data-title="图形编辑">✏️</button>
            <div id="drawDropdownMenu" class="dropdown-menu" style="display: none;">
                <button id="drawPointBtn" class="dropdown-btn" data-title="绘制点">📌 绘制点</button>
                <button id="drawLineBtn" class="dropdown-btn" data-title="绘制线">✍️ 绘制线</button>
                <button id="drawPolygonBtn" class="dropdown-btn" data-title="绘制面">⬟ 绘制面</button>
                <div class="draw-menu-divider"></div>
                <button id="drawStopBtn" class="dropdown-btn" data-title="结束绘制">⏹️ 结束绘制</button>
                <div class="draw-menu-divider"></div>
                <button id="drawClearBtn" class="dropdown-btn" data-title="清空">🗑️ 清空</button>
                <button id="drawExportBtn" class="dropdown-btn" data-title="导出">💾 导出</button>
            </div>
        </div>

    `;
    
    toolbar.appendChild(drawDiv);
    
    // 绘制按钮事件
    document.getElementById('drawPointBtn').onclick = () => {
        if (drawMode === 'Point') stopDraw();
        else startDraw('Point');
        document.getElementById('drawDropdownMenu').style.display = 'none';
    };
    
    document.getElementById('drawLineBtn').onclick = () => {
        if (drawMode === 'LineString') stopDraw();
        else startDraw('LineString');
        document.getElementById('drawDropdownMenu').style.display = 'none';
    };
    
    document.getElementById('drawPolygonBtn').onclick = () => {
        if (drawMode === 'Polygon') stopDraw();
        else startDraw('Polygon');
        document.getElementById('drawDropdownMenu').style.display = 'none';
    };
    
    document.getElementById('drawStopBtn').onclick = () => {
        stopDraw();
        document.getElementById('drawDropdownMenu').style.display = 'none';
    };
    
    document.getElementById('drawClearBtn').onclick = () => {
        clearDrawLayer();
        document.getElementById('drawDropdownMenu').style.display = 'none';
    };
    
    document.getElementById('drawExportBtn').onclick = () => {
        exportDrawLayer();
        document.getElementById('drawDropdownMenu').style.display = 'none';
    };
}

// 页面加载完成后添加绘制工具栏
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addDrawToolbar();
        initDropdowns();
    });
} else {
    addDrawToolbar();
    initDropdowns();
}

// 初始化下拉菜单
function initDropdowns() {
    // 初始化潮汐功能
    initTideFunctionality();
    
    // 测量工具下拉菜单
    const measureMainBtn = document.getElementById('measureMainBtn');
    const measureDropdown = document.getElementById('measureDropdown');
    
    if (measureMainBtn && measureDropdown) {
        measureMainBtn.onclick = () => {
            measureDropdown.style.display = measureDropdown.style.display === 'block' ? 'none' : 'block';
        };
    }
    
    // 天气工具下拉菜单
    const weatherMainBtn = document.getElementById('weatherMainBtn');
    const weatherDropdown = document.getElementById('weatherDropdown');
    
    if (weatherMainBtn && weatherDropdown) {
        weatherMainBtn.onclick = () => {
            weatherDropdown.style.display = weatherDropdown.style.display === 'block' ? 'none' : 'block';
        };
    }
    
    // 图层工具下拉菜单
    const layerMainBtn = document.getElementById('layerMainBtn');
    const layerDropdown = document.getElementById('layerDropdown');
    
    if (layerMainBtn && layerDropdown) {
        layerMainBtn.onclick = () => {
            layerDropdown.style.display = layerDropdown.style.display === 'block' ? 'none' : 'block';
        };
    }
    
    // 专题地图下拉菜单
    const thematicMapBtn = document.getElementById('thematicMapBtn');
    const thematicDropdown = document.getElementById('thematicDropdown');
    
    if (thematicMapBtn && thematicDropdown) {
        thematicMapBtn.onclick = (e) => {
            e.preventDefault();
            thematicDropdown.style.display = thematicDropdown.style.display === 'block' ? 'none' : 'block';
        };
    }
    
    // 图形编辑下拉菜单
    const drawMainBtn = document.getElementById('drawMainBtn');
    const drawDropdownMenu = document.getElementById('drawDropdownMenu');
    
    if (drawMainBtn && drawDropdownMenu) {
        drawMainBtn.onclick = () => {
            drawDropdownMenu.style.display = drawDropdownMenu.style.display === 'block' ? 'none' : 'block';
        };
    }
    
    // 点击其他地方关闭所有下拉菜单
    document.addEventListener('click', (e) => {
        const dropdowns = document.querySelectorAll('.dropdown-menu');
        dropdowns.forEach(dropdown => {
            if (!dropdown.parentElement.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    });
}

// ==================== 导出图层配置功能 ====================

/**
 * 导出图层配置为JSON
 */
function exportLayerConfig() {
    // 构建图层配置对象
    const config = {
        version: '1.0',
        export_time: new Date().toISOString(),
        map_center: ol.proj.toLonLat(map.getView().getCenter()),
        camera_altitude_km: Math.round(10000 / Math.pow(2, map.getView().getZoom() - 3)),
        layers: []
    };
    
    // 导出配置图层（从网站加载的）
    dynamicLayers.forEach(item => {
        const layerConfig = {
            name: item.name,
            visible: item.visible,
            label_field: item.labelField || '',
            link_field: item.linkField || '',
            link_path_prefix: item.linkPathPrefix || '',
            style: item.style || {}
        };
        config.layers.push(layerConfig);
    });
    
    // 导出本地图层
    localGeoJsonLayers.forEach(item => {
        const layerConfig = {
            name: item.name,
            visible: item.visible,
            label_field: item.labelField || '',
            link_field: item.linkField || '',
            link_path_prefix: item.linkPathPrefix || '',
            style: item.style || {},
            is_local: true
        };
        config.layers.push(layerConfig);
    });
    
    // 转换为JSON字符串
    const jsonStr = JSON.stringify(config, null, 2);
    
    // 显示导出对话框
    showLayerConfigExportDialog(jsonStr);
}

/**
 * 显示图层配置导出对话框
 * @param {string} content - JSON内容
 */
function showLayerConfigExportDialog(content) {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 100000;
        max-width: 700px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 15px;">导出图层配置</h3>
        <textarea style="width: 100%; height: 400px; font-family: monospace; font-size: 11px; resize: vertical;" readonly>${content}</textarea>
        <div style="margin-top: 15px; text-align: right;">
            <button id="copyLayerConfig" style="margin-right: 10px; padding: 8px 16px; background: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer;">复制</button>
            <button id="downloadLayerConfig" style="margin-right: 10px; padding: 8px 16px; background: #52c41a; color: white; border: none; border-radius: 4px; cursor: pointer;">下载</button>
            <button id="closeLayerConfigDialog" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer;">关闭</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 复制按钮
    document.getElementById('copyLayerConfig').onclick = () => {
        navigator.clipboard.writeText(content).then(() => {
            alert('已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
            alert('复制失败，请手动复制');
        });
    };
    
    // 下载按钮
    document.getElementById('downloadLayerConfig').onclick = () => {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `layer_config_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    
    // 关闭按钮
    document.getElementById('closeLayerConfigDialog').onclick = () => {
        document.body.removeChild(dialog);
    };
}
// ==================== 集成侧边栏上传功能 ====================
(function() {
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // 防止冒泡关闭下拉菜单
            
            // 检查 AIsea.html 中是否已定义打开侧边栏的函数
            if (typeof window.openUploadSidebar === 'function') {
                window.openUploadSidebar();
            } else {
                console.warn('未找到 openUploadSidebar 函数，请检查 AIsea.html 是否正确加载了侧边栏脚本。');
                // 备选方案：如果侧边栏没好，可以暂时 alert 提示
                // alert('侧边栏功能暂未就绪');
            }
            
            // 手动关闭“我的”下拉菜单（因为 stopPropagation 阻止了全局点击关闭）
            const myDropdown = document.getElementById('myDropdown');
            if (myDropdown) {
                myDropdown.style.display = 'none';
            }
        });
    }
})();

// ==================== 潮汐数据获取 ====================

/**
 * 获取潮汐数据
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {Promise<string>} 潮位信息，格式：H,L,C
 */
async function getTideData(lat, lon) {
    // 和风天气API Key (需要替换为真实的API Key)
    const API_KEY = 'YOUR_QWEATHER_API_KEY';
    
    try {
        // 构建API请求URL
        const url = `https://devapi.qweather.com/v7/tide/grid?location=${lon},${lat}&key=${API_KEY}`;
        
        console.log('获取潮汐数据:', url);
        
        // 发送请求
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('潮汐数据响应:', data);
        
        if (data.code !== '200') {
            throw new Error(`API error: ${data.code}, ${data.message}`);
        }
        
        // 处理潮汐数据
        if (!data.tideInfo || data.tideInfo.length === 0) {
            throw new Error('未获取到潮汐数据');
        }
        
        // 获取今天的日期
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // 筛选今天的潮汐数据
        const todayTides = data.tideInfo.filter(item => {
            return item.time.startsWith(todayStr);
        });
        
        if (todayTides.length === 0) {
            throw new Error('未获取到今天的潮汐数据');
        }
        
        // 计算高潮值(H)、低潮值(L)和当前潮位值(C)
        let highTide = -Infinity;
        let lowTide = Infinity;
        let currentTide = null;
        
        // 找到最高和最低潮位
        todayTides.forEach(tide => {
            const height = parseFloat(tide.height);
            if (!isNaN(height)) {
                if (height > highTide) {
                    highTide = height;
                }
                if (height < lowTide) {
                    lowTide = height;
                }
            }
        });
        
        // 找到当前时间最近的潮位
        const now = new Date();
        let closestTide = null;
        let minTimeDiff = Infinity;
        
        todayTides.forEach(tide => {
            const tideTime = new Date(tide.time);
            const timeDiff = Math.abs(tideTime - now);
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestTide = tide;
            }
        });
        
        if (closestTide) {
            currentTide = parseFloat(closestTide.height);
        }
        
        // 检查是否获取到有效数据
        if (highTide === -Infinity || lowTide === Infinity || currentTide === null) {
            throw new Error('潮汐数据计算失败');
        }
        
        // 格式化为 H,L,C 格式
        const tideInfo = `${highTide.toFixed(2)},${lowTide.toFixed(2)},${currentTide.toFixed(2)}`;
        console.log('计算的潮汐信息:', tideInfo);
        
        return tideInfo;
        
    } catch (error) {
        console.error('获取潮汐数据失败:', error);
        // 如果API调用失败，返回默认值
        return '0.00,0.00,0.00';
    }
}

// 暴露函数到全局
window.getTideData = getTideData;

// ==================== 气温热力图功能（基于城市点） ====================
let temperatureHeatmapLayer = null;
let temperatureDataVisible = false;
let temperatureLegendPanel = null;
let cityWeatherData = [];

const temperatureConfig = {
    blur: 25,
    radius: 35,
    batchSize: 50,
    requestDelay: 1000,
    maxRetries: 3,
    retryDelay: 60000
};

async function loadCitiesData() {
    try {
        const response = await fetch('./js/cities.json');
        if (!response.ok) {
            throw new Error('加载城市数据失败');
        }
        const geojson = await response.json();
        if (geojson.type === 'FeatureCollection' && geojson.features) {
            return geojson.features.map(feature => ({
                name: feature.properties.name,
                english: feature.properties.english,
                country: feature.properties.country,
                lat: feature.geometry.coordinates[1],
                lon: feature.geometry.coordinates[0]
            }));
        }
        return [];
    } catch (error) {
        console.error('加载城市数据失败:', error);
        return [];
    }
}

async function fetchBatchCityTemperatures(cities) {
    const latitudes = cities.map(c => c.lat).join(',');
    const longitudes = cities.map(c => c.lon === 180.0 ? 179.9999 : c.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=temperature_2m&timezone=auto`;

    try {
        const response = await fetch(url, { method: 'GET' });

        if (response.status === 429) {
            return null;
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`API请求失败: ${response.status} - ${errorText}`);
            return null;
        }

        const data = await response.json();
        const results = [];

        // Open-Meteo 批量请求返回数组，单个请求返回对象
        const dataArray = Array.isArray(data) ? data : [data];

        for (let i = 0; i < cities.length && i < dataArray.length; i++) {
            const item = dataArray[i];
            if (item && item.current && item.current.temperature_2m !== null && item.current.temperature_2m !== undefined) {
                results.push({
                    ...cities[i],
                    temperature: item.current.temperature_2m
                });
            }
        }

        return results;
    } catch (error) {
        console.warn('批量气温获取失败:', error);
        return null;
    }
}

async function fetchTemperatureData() {
    const loadingPanel = document.getElementById('loadingPanel');
    const loadingProgress = document.getElementById('loadingProgress');
    
    try {
        if (loadingProgress) {
            loadingProgress.textContent = '正在加载气温数据...';
        }
        
        const response = await fetch(`${window.API_BASE_URL}/api/weather/data`);
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '获取数据失败');
        }
        
        if (result.message) {
            showTemperatureDataNotice(result.message, result.data_date);
        }
        
        cityWeatherData = result.cities.map(city => ({
            name: city.city_name_cn,
            english: city.city_name_en,
            country: city.country,
            lat: city.lat,
            lon: city.lon,
            temperature: city.temperature
        }));
        
        if (cityWeatherData.length === 0) {
            throw new Error('未获取到有效的气温数据');
        }
        
        return cityWeatherData;
        
    } catch (error) {
        console.error('获取气温数据失败:', error);
        return await fetchTemperatureDataFallback();
    }
}

async function fetchTemperatureDataFallback() {
    const loadingPanel = document.getElementById('loadingPanel');
    const loadingProgress = document.getElementById('loadingProgress');
    
    try {
        if (loadingProgress) {
            loadingProgress.textContent = '使用备用方式获取数据...';
        }
        
        const cities = await loadCitiesData();
        if (cities.length === 0) {
            throw new Error('未加载到城市数据');
        }
        
        cityWeatherData = [];
        
        const batches = [];
        for (let i = 0; i < cities.length; i += temperatureConfig.batchSize) {
            batches.push(cities.slice(i, i + temperatureConfig.batchSize));
        }
        
        let successCount = 0;
        const totalPoints = cities.length;
        let rateLimitCount = 0;
        
        for (let i = 0; i < batches.length; i++) {
            if (loadingProgress) {
                loadingProgress.textContent = `正在获取气温数据 ${successCount}/${totalPoints}...`;
            }
            
            const batchResults = await fetchBatchCityTemperatures(batches[i]);
            
            if (batchResults === null) {
                rateLimitCount++;
                if (rateLimitCount >= temperatureConfig.maxRetries) {
                    throw new Error('API速率限制，无法继续获取数据');
                }
                console.warn(`第${rateLimitCount}次遇到速率限制，等待60秒后继续...`);
                if (loadingProgress) {
                    loadingProgress.textContent = `速率限制，等待60秒后重试... (${rateLimitCount}/${temperatureConfig.maxRetries})`;
                }
                await new Promise(resolve => setTimeout(resolve, temperatureConfig.retryDelay));
                i--;
                continue;
            }
            
            rateLimitCount = 0;
            
            batchResults.forEach(r => {
                cityWeatherData.push(r);
                successCount++;
            });
            
            if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, temperatureConfig.requestDelay));
            }
        }
        
        if (cityWeatherData.length === 0) {
            throw new Error('未获取到有效的气温数据');
        }
        
        return cityWeatherData;
        
    } catch (error) {
        console.error('获取气温数据失败:', error);
        if (loadingPanel && loadingProgress) {
            loadingProgress.textContent = '加载失败: ' + error.message;
            setTimeout(() => {
                loadingPanel.style.display = 'none';
            }, 2000);
        }
        return null;
    }
}

function createTemperatureHeatmap(temperatureData) {
    if (!temperatureData || temperatureData.length === 0) return null;
    
    const features = [];
    
    for (let i = 0; i < temperatureData.length; i++) {
        const city = temperatureData[i];
        const temp = city.temperature;
        const lat = city.lat;
        const lon = city.lon;
        
        if (temp === null || temp === undefined) continue;
        
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            temperature: temp,
            name: city.name,
            english: city.english,
            country: city.country
        });
        features.push(feature);
    }
    
    const source = new ol.source.Vector({ features: features });
    
    const heatmapLayer = new ol.layer.Heatmap({
        source: source,
        blur: temperatureConfig.blur,
        radius: temperatureConfig.radius,
        gradient: ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff7f00', '#ff0000']
    });
    
    heatmapLayer.set('name', '气温热力图');
    
    return heatmapLayer;
}

function createTemperatureLegend() {
    if (document.getElementById('temperatureLegend')) return;
    
    temperatureLegendPanel = document.createElement('div');
    temperatureLegendPanel.id = 'temperatureLegend';
    temperatureLegendPanel.style.cssText = `
        position: absolute;
        bottom: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        min-width: 160px;
        display: none;
    `;
    
    temperatureLegendPanel.innerHTML = `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; color: #333;">🌡️ 气温热力图</div>
        <div style="height: 20px; width: 100%; border-radius: 10px; background: linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff7f00, #ff0000); margin-bottom: 8px;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
            <span>-30°C</span>
            <span>0°C</span>
            <span>30°C</span>
            <span>50°C</span>
        </div>
        <div style="font-size: 11px; color: #aaa; margin-top: 8px; text-align: right;">数据: Open-Meteo</div>
    `;
    
    document.getElementById('map').appendChild(temperatureLegendPanel);
}

function showTemperatureLegend() {
    if (!temperatureLegendPanel) createTemperatureLegend();
    if (temperatureLegendPanel) {
        temperatureLegendPanel.style.display = 'block';
    }
}

function hideTemperatureLegend() {
    if (temperatureLegendPanel) {
        temperatureLegendPanel.style.display = 'none';
    }
}

let temperatureNoticePanel = null;

function showTemperatureDataNotice(message, dataDate) {
    if (temperatureNoticePanel) {
        temperatureNoticePanel.remove();
    }
    
    temperatureNoticePanel = document.createElement('div');
    temperatureNoticePanel.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 8px;
        padding: 10px 15px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 12px;
        color: #666;
        border-left: 3px solid #4CAF50;
        max-width: 250px;
    `;
    
    temperatureNoticePanel.innerHTML = `
        <div style="font-weight: bold; color: #333; margin-bottom: 4px;">📊 数据信息</div>
        <div>日期: ${dataDate}</div>
        <div>${message}</div>
    `;
    
    document.getElementById('map').appendChild(temperatureNoticePanel);
    
    setTimeout(() => {
        if (temperatureNoticePanel) {
            temperatureNoticePanel.style.opacity = '0';
            temperatureNoticePanel.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                if (temperatureNoticePanel && temperatureNoticePanel.parentNode) {
                    temperatureNoticePanel.parentNode.removeChild(temperatureNoticePanel);
                    temperatureNoticePanel = null;
                }
            }, 500);
        }
    }, 5000);
}

async function toggleTemperatureHeatmap() {
    if (temperatureDataVisible) {
        if (temperatureHeatmapLayer) {
            map.removeLayer(temperatureHeatmapLayer);
            temperatureHeatmapLayer = null;
        }
        hideTemperatureLegend();
        
        temperatureDataVisible = false;
        
        const tempBtn = document.getElementById('toggleTemperatureBtn');
        if (tempBtn) tempBtn.classList.remove('active');
        
        const weatherDropdown = document.getElementById('weatherDropdown');
        if (weatherDropdown) weatherDropdown.style.display = 'none';
    } else {
        const loadingPanel = document.getElementById('loadingPanel');
        const loadingProgress = document.getElementById('loadingProgress');
        
        if (loadingPanel) {
            loadingPanel.style.display = 'block';
            loadingProgress.textContent = '正在获取全球气温数据...';
        }
        
        const temperatureData = await fetchTemperatureData();
        
        if (temperatureData) {
            if (temperatureHeatmapLayer) {
                map.removeLayer(temperatureHeatmapLayer);
            }
            
            temperatureHeatmapLayer = createTemperatureHeatmap(temperatureData);
            
            if (temperatureHeatmapLayer) {
                map.addLayer(temperatureHeatmapLayer);
                temperatureDataVisible = true;
                showTemperatureLegend();
                
                const tempBtn = document.getElementById('toggleTemperatureBtn');
                if (tempBtn) tempBtn.classList.add('active');
                
                if (loadingPanel) loadingPanel.style.display = 'none';
                
                const weatherDropdown = document.getElementById('weatherDropdown');
                if (weatherDropdown) weatherDropdown.style.display = 'none';
                
                console.log('气温热力图加载成功');
            }
        }
    }
}

function addTemperatureControlButton() {
    const tempBtn = document.getElementById('toggleTemperatureBtn');
    if (tempBtn) {
        tempBtn.addEventListener('click', toggleTemperatureHeatmap);
    }
}

// ==================== 城市搜索与天气功能 ====================
const OPENWEATHERMAP_API_KEY = '70e14258227314d2ea4e307c7f24daa5';
let citySearchTimeout = null;
let cityMarker = null;

function getWeatherIcon(weatherCode) {
    if (weatherCode >= 200 && weatherCode < 300) return '⛈️';
    if (weatherCode >= 300 && weatherCode < 400) return '🌧️';
    if (weatherCode >= 500 && weatherCode < 600) return '🌧️';
    if (weatherCode >= 600 && weatherCode < 700) return '❄️';
    if (weatherCode >= 700 && weatherCode < 800) return '🌫️';
    if (weatherCode === 800) return '☀️';
    if (weatherCode > 800) return '☁️';
    return '🌤️';
}

function getWeatherDescription(weatherCode) {
    if (weatherCode >= 200 && weatherCode < 300) return '雷暴';
    if (weatherCode >= 300 && weatherCode < 400) return '小雨';
    if (weatherCode >= 500 && weatherCode < 600) return '大雨';
    if (weatherCode >= 600 && weatherCode < 700) return '雪';
    if (weatherCode >= 700 && weatherCode < 800) return '雾';
    if (weatherCode === 800) return '晴天';
    if (weatherCode > 800) return '多云';
    return '未知';
}

function getAirQualityLevel(aqi, standard = 'china') {
    if (standard === 'eu') {
        if (aqi <= 25) return { text: '优', color: '#00e400' };
        if (aqi <= 50) return { text: '良', color: '#ffff00' };
        if (aqi <= 75) return { text: '轻度污染', color: '#ff7e00' };
        if (aqi <= 100) return { text: '中度污染', color: '#ff0000' };
        return { text: '重度污染', color: '#99004c' };
    }
    if (standard === 'us') {
        if (aqi <= 50) return { text: '优', color: '#00e400' };
        if (aqi <= 100) return { text: '良', color: '#ffff00' };
        if (aqi <= 150) return { text: '轻度污染', color: '#ff7e00' };
        if (aqi <= 200) return { text: '中度污染', color: '#ff0000' };
        if (aqi <= 300) return { text: '重度污染', color: '#99004c' };
        return { text: '严重污染', color: '#7e0023' };
    }
    if (aqi <= 50) return { text: '优', color: '#00e400' };
    if (aqi <= 100) return { text: '良', color: '#ffff00' };
    if (aqi <= 150) return { text: '轻度污染', color: '#ff7e00' };
    if (aqi <= 200) return { text: '中度污染', color: '#ff0000' };
    if (aqi <= 300) return { text: '重度污染', color: '#99004c' };
    return { text: '严重污染', color: '#7e0023' };
}

function convertUSToEU(aqiUS) {
    if (aqiUS <= 50) return aqiUS;
    if (aqiUS <= 100) return Math.round(aqiUS * 0.5);
    if (aqiUS <= 150) return Math.round(aqiUS * 0.4 + 10);
    if (aqiUS <= 200) return Math.round(aqiUS * 0.35 + 20);
    if (aqiUS <= 300) return Math.round(aqiUS * 0.25 + 50);
    return Math.round(aqiUS * 0.2);
}

function averageValues(...values) {
    const validValues = values.filter(v => v !== undefined && v !== null && !isNaN(v));
    if (validValues.length === 0) return null;
    const sum = validValues.reduce((a, b) => a + b, 0);
    return Math.round(sum / validValues.length * 10) / 10;
}

async function searchCity(query) {
    if (!query.trim()) {
        hideCitySearchResults();
        return;
    }
    
    try {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=10&appid=${OPENWEATHERMAP_API_KEY}`;
        const response = await fetch(url);
        const results = await response.json();
        
        if (results && results.length > 0) {
            showCitySearchResults(results);
        } else {
            hideCitySearchResults();
        }
    } catch (error) {
        console.error('城市搜索失败:', error);
        hideCitySearchResults();
    }
}

function showCitySearchResults(results) {
    const resultsDiv = document.getElementById('citySearchResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = '';
    
    results.forEach(city => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        item.innerHTML = `
            <div>
                <div style="font-weight: bold; color: #333;">${city.name}</div>
                <div style="font-size: 12px; color: #999;">${city.state || ''} ${city.country}</div>
            </div>
            <div style="font-size: 12px; color: #666;">📍</div>
        `;
        
        item.addEventListener('click', () => {
            selectCity(city);
            hideCitySearchResults();
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#f5f5f5';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = '';
        });
        
        resultsDiv.appendChild(item);
    });
    
    resultsDiv.style.display = 'block';
}

function hideCitySearchResults() {
    const resultsDiv = document.getElementById('citySearchResults');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
}

function selectCity(city) {
    const lat = city.lat;
    const lon = city.lon;
    const name = city.name;
    const country = city.country;
    
    map.getView().animate({
        center: ol.proj.fromLonLat([lon, lat]),
        zoom: 10,
        duration: 1000
    });
    
    if (cityMarker) {
        map.removeLayer(cityMarker);
    }
    
    const markerSource = new ol.source.Vector({
        features: [new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
        })]
    });
    
    cityMarker = new ol.layer.Vector({
        source: markerSource,
        style: new ol.style.Style({
            image: new ol.style.Icon({
                src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iIzE4OTBmZiIgZD0iTTI0IDRjLTExLjYgMC0yMSA5LjQtMjEgMjFzOS40IDIxIDIxIDIxIDIxLTkuNCAyMS0yMS05LjQtMjEtMjEtMjF6bTAgMzJjLTYuMSAwLTExLTQuOS0xMS0xMWMwLTYuMSA0LjktMTEgMTEtMTFzMTEgNC45IDExIDExYzAgNi4xLTQuOSAxMS0xMSAxMXoiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNNDIgMTJoLTJWMTRjMC0yLjItMS44LTQtNC00aC00di0yaC00djItNGgtNHYySDhjLTYuNiAwLTEyIDUuNC0xMiAxMnYxNmMwIDYuNiA1LjQgMTIgMTIgMTJoMjhjNi42IDAgMTItNS40IDEyLTEydi0xNmMwLTYuNi01LjQtMTItMTItMTJoLTJoLTEydi0yaC0ydi0yaC00di0yaC00di0yaC00em0tMjIgOHY0aDZ2LTJoLTZ6Ii8+PC9zdmc+',
                anchor: [0.5, 1],
                scale: 1.2
            })
        })
    });
    
    map.addLayer(cityMarker);
    
    fetchCityWeatherAndAir(lat, lon, name, country);
}

async function fetchCityWeatherAndAir(lat, lon, name, country) {
    const panel = document.getElementById('cityWeatherPanel');
    if (panel) panel.style.display = 'block';
    
    document.getElementById('cityWeatherTitle').textContent = `${name}, ${country}`;
    document.getElementById('cityWeatherCoords').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    
    try {
        const [omWeather, owmWeather] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`)
                .then(r => r.json()).catch(e => ({})),
            fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`)
                .then(r => r.json()).catch(e => ({})),
        ]);
        
        const omCurrent = omWeather.current || {};
        const omDaily = omWeather.daily || {};
        const owmMain = owmWeather.main || {};
        const owmWeatherDesc = owmWeather.weather ? owmWeather.weather[0] : {};
        
        const tempCurrent = averageValues(omCurrent.temperature_2m, owmMain.temp);
        const tempMax = averageValues(omDaily.temperature_2m_max ? omDaily.temperature_2m_max[0] : null, owmMain.temp_max);
        const tempMin = averageValues(omDaily.temperature_2m_min ? omDaily.temperature_2m_min[0] : null, owmMain.temp_min);
        const humidity = averageValues(omCurrent.relative_humidity_2m, owmMain.humidity);
        const windSpeed = averageValues(omCurrent.wind_speed_10m, owmWeather.wind ? owmWeather.wind.speed : null);
        const pressure = averageValues(omCurrent.surface_pressure, owmMain.pressure);
        
        const weatherCode = omCurrent.weather_code || (owmWeatherDesc.id ? Math.round(owmWeatherDesc.id / 10) * 10 : null);
        const weatherIcon = getWeatherIcon(weatherCode);
        const weatherDesc = getWeatherDescription(weatherCode);
        
        document.getElementById('cityWeatherIcon').textContent = weatherIcon;
        document.getElementById('cityWeatherTemp').textContent = tempCurrent !== null ? `${Math.round(tempCurrent)}°C` : '--';
        document.getElementById('cityWeatherDesc').textContent = weatherDesc;
        document.getElementById('cityWeatherHumidity').textContent = humidity !== null ? `${Math.round(humidity)}%` : '--';
        document.getElementById('cityWeatherWind').textContent = windSpeed !== null ? `${windSpeed} m/s` : '--';
        document.getElementById('cityWeatherPressure').textContent = pressure !== null ? `${Math.round(pressure)} hPa` : '--';
        
        const tempRangeEl = document.getElementById('cityWeatherTempRange');
        if (tempRangeEl) {
            tempRangeEl.textContent = tempMax !== null && tempMin !== null ? `${Math.round(tempMin)}°C ~ ${Math.round(tempMax)}°C` : '--';
        }
        
    } catch (error) {
        console.error('获取天气数据失败:', error);
        document.getElementById('cityWeatherTemp').textContent = '--';
    }
    
    try {
        const [omAir, owmAir] = await Promise.all([
            fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide&timezone=auto`)
                .then(r => r.json()).catch(e => ({})),
            fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}`)
                .then(r => r.json()).catch(e => ({})),
        ]);
        
        const omCurrentAir = omAir.current || {};
        const owmListAir = owmAir.list && owmAir.list.length > 0 ? owmAir.list[0] : {};
        const owmComponents = owmListAir.components || {};
        const owmAqi = owmListAir.main ? owmListAir.main.aqi : null;
        
        const euAqiFromOm = omCurrentAir.european_aqi;
        const euAqiFromOwm = owmAqi ? convertUSToEU(owmAqi * 100) : null;
        
        const finalAqi = averageValues(euAqiFromOm, euAqiFromOwm);
        
        const pm25 = averageValues(omCurrentAir.pm2_5, owmComponents.pm2_5);
        const pm10 = averageValues(omCurrentAir.pm10, owmComponents.pm10);
        const co = averageValues(omCurrentAir.carbon_monoxide, owmComponents.co ? owmComponents.co / 1000 : null);
        const so2 = averageValues(omCurrentAir.sulphur_dioxide, owmComponents.so2);
        
        if (finalAqi !== null) {
            const level = getAirQualityLevel(finalAqi, 'eu');
            
            document.getElementById('cityAirQualitySection').style.display = 'block';
            document.getElementById('cityAirQualityLevel').textContent = level.text;
            document.getElementById('cityAirQualityLevel').style.backgroundColor = level.color;
            document.getElementById('cityAirQualityLevel').style.color = level.color === '#ffff00' ? '#333' : '#fff';
            
            document.getElementById('cityAQIPM25').textContent = pm25 !== null ? `${Math.round(pm25)}` : '--';
            document.getElementById('cityAQIPM10').textContent = pm10 !== null ? `${Math.round(pm10)}` : '--';
            document.getElementById('cityAQICO').textContent = co !== null ? `${co.toFixed(1)}` : '--';
            document.getElementById('cityAQISO2').textContent = so2 !== null ? `${Math.round(so2)}` : '--';
        } else {
            document.getElementById('cityAirQualitySection').style.display = 'none';
        }
    } catch (error) {
        console.error('获取空气质量数据失败:', error);
        document.getElementById('cityAirQualitySection').style.display = 'none';
    }
}

function closeCityWeatherPanel() {
    const panel = document.getElementById('cityWeatherPanel');
    if (panel) panel.style.display = 'none';
    
    if (cityMarker) {
        map.removeLayer(cityMarker);
        cityMarker = null;
    }
}

function initCitySearch() {
    const searchInput = document.getElementById('citySearchInput');
    const searchBtn = document.getElementById('cityWeatherBtn') || document.getElementById('citySearchBtn');
    const searchWrapper = document.getElementById('citySearchWrapper');
    const closeBtn = document.getElementById('closeCityWeatherBtn');
    const clickWeatherBtn = document.getElementById('clickWeatherBtn');
    
    if (clickWeatherBtn) {
        clickWeatherBtn.addEventListener('click', () => {
            toggleClickWeather();
            document.getElementById('weatherDropdown').style.display = 'none';
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (citySearchTimeout) clearTimeout(citySearchTimeout);
            citySearchTimeout = setTimeout(() => {
                searchCity(searchInput.value);
            }, 300);
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchCity(searchInput.value);
            }
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (searchActive) {
                deactivateSearch();
            } else {
                deactivateAllTools();
                searchActive = true;
                searchBtn.classList.add('active');
                if (searchWrapper) {
                    searchWrapper.style.display = 'block';
                    if (searchInput) {
                        searchInput.focus();
                    }
                }
            }
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCityWeatherPanel);
    }
    
    document.addEventListener('click', (e) => {
        const searchResults = document.getElementById('citySearchResults');
        const btnSelector = '#cityWeatherBtn, #citySearchBtn';
        if (searchResults && !searchResults.contains(e.target) && !e.target.closest('#citySearchWrapper') && !e.target.closest(btnSelector)) {
            hideCitySearchResults();
        }
    });
    
    map.on('click', (evt) => {
        if (measureActive || drawMode) {
            return;
        }
        
        if (searchActive) {
            deactivateSearch();
            return;
        }
        
        // 检查是否点击了世界杯图层
        if (typeof worldCupLayer !== 'undefined' && worldCupLayer && worldCupLayer.getVisible()) {
            const worldCupFeature = map.forEachFeatureAtPixel(evt.pixel, f => f, {
                layerFilter: (layer) => layer === worldCupLayer
            });
            if (worldCupFeature) return;
        }
        
        const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
        
        if (feature) {
            // 点击了要素
            if (positionLayer && positionLayer.getSource().getFeatures().includes(feature)) {
                return;
            }
            
            // 显示要素信息
            showFeaturePopup(feature, evt.coordinate);
            
            // 如果是天气模式，同时查询该点天气
            if (clickWeatherActive) {
                const lonlat = ol.proj.toLonLat(evt.coordinate);
                searchNearbyCity(lonlat[1], lonlat[0]);
            }
        } else {
            // 点击了空白处
            popup.setPosition(undefined);
            popup.getElement().style.display = 'none';
            
            // 只有在天气模式下才查询天气
            if (clickWeatherActive) {
                const lonlat = ol.proj.toLonLat(evt.coordinate);
                searchNearbyCity(lonlat[1], lonlat[0]);
            }
        }
    });
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function searchNearbyCity(lat, lon) {
    try {
        const proxyUrl = `${window.API_BASE_URL}/api/proxy/reverse-geocode?lon=${lon}&lat=${lat}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        if (data.code === '200' && data.location && data.location.length > 0) {
            const loc = data.location[0];
            const cityName = loc.name || loc.district || loc.city || loc.adm1 || loc.adm2 || '未知地点';
            const country = loc.country || '未知国家';
            
            map.getView().animate({
                center: ol.proj.fromLonLat([lon, lat]),
                zoom: 10,
                duration: 1000
            });
            
            fetchCityWeatherAndAir(lat, lon, cityName, country);
            return;
        }
    } catch (error) {
        console.warn('逆地理编码失败，使用本地城市匹配:', error);
    }
    
    if (cityWeatherData.length === 0) {
        const loadingPanel = document.getElementById('loadingPanel');
        const loadingProgress = document.getElementById('loadingProgress');
        
        if (loadingPanel) loadingPanel.style.display = 'block';
        if (loadingProgress) loadingProgress.textContent = '正在加载城市数据...';
        
        const cities = await loadCitiesData();
        if (cities.length > 0) {
            cityWeatherData = cities;
        }
        
        if (loadingPanel) loadingPanel.style.display = 'none';
    }
    
    let nearestCity = null;
    let minDistance = Infinity;
    
    for (const city of cityWeatherData) {
        const distance = getDistance(lat, lon, city.lat, city.lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearestCity = city;
        }
    }
    
    if (nearestCity && minDistance < 200000) {
        map.getView().animate({
            center: ol.proj.fromLonLat([nearestCity.lon, nearestCity.lat]),
            zoom: 10,
            duration: 1000
        });
        
        fetchCityWeatherAndAir(nearestCity.lat, nearestCity.lon, nearestCity.name, nearestCity.country);
    }
}

function addTemperatureControlButton() {
    const tempBtn = document.getElementById('toggleTemperatureBtn');
    if (tempBtn) {
        tempBtn.addEventListener('click', toggleTemperatureHeatmap);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addTemperatureControlButton();
        initCitySearch();
    });
} else {
    addTemperatureControlButton();
    initCitySearch();
}