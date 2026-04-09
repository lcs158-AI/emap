/**
 * GeoJSON 地图编辑器 - 主 JavaScript 文件
 * 功能：支持 GeoJSON 数据的加载、编辑、测量和样式定制
 */

// ============================================
// 全局变量定义
// ============================================
let canvas, ctx;  // 画布元素和绘图上下文

// 地图数据状态对象
let mapData = {
    layers: [],           // 图层数组
    currentLayer: null,   // 当前选中的图层
    selectedFeature: null,// 当前选中的要素
    tool: 'select',       // 当前工具：select, point, line, polygon
    scale: 1,             // 地图缩放比例
    offsetX: 0,           // 地图水平偏移量
    offsetY: 0,           // 地图垂直偏移量
    isDragging: false,    // 是否正在拖拽地图
    lastMouseX: 0,        // 上次鼠标 X 坐标
    lastMouseY: 0,        // 上次鼠标 Y 坐标
    editPoints: [],       // 编辑中的点（用于绘制线/面）
    measureMode: false,   // 是否在测量模式
    measureType: 'length',// 测量类型：length 或 area
    measurePoints: [],    // 测量点数组
    measureResult: 0      // 测量结果
};

// ============================================
// 坐标转换函数
// ============================================

/**
 * 将经纬度坐标转换为屏幕像素坐标
 * 基于地图中心点和缩放比例计算
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {object} 像素坐标 {x, y}
 */
function lonLatToPixel(lon, lat, width, height) {
    const centerLon = 115.0; // 中心经度，调整到数据中心
    const centerLat = 22.5;  // 中心纬度，调整到数据中心
    const baseScale = 1000;  // 基础缩放比例，适配经纬度
    
    // 计算相对于中心的偏移
    const x = (lon - centerLon) * baseScale + width / 2;
    const y = height / 2 - (lat - centerLat) * baseScale;  // Y 轴翻转，纬度向上为正
    
    // 应用地图缩放和平移
    return { x: x * mapData.scale + mapData.offsetX, y: y * mapData.scale + mapData.offsetY };
}

/**
 * 将屏幕像素坐标转换为经纬度坐标
 * 基于地图中心点和缩放比例计算
 * @param {number} x - 像素 X 坐标
 * @param {number} y - 像素 Y 坐标
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {object} 经纬度坐标 {lon, lat}
 */
function pixelToLonLat(x, y, width, height) {
    const centerLon = 115.0;
    const centerLat = 22.5;
    const baseScale = 1000;
    
    // 逆向计算经纬度
    const lon = (x - width / 2 - mapData.offsetX) / mapData.scale / baseScale + centerLon;
    const lat = centerLat - (y - height / 2 - mapData.offsetY) / mapData.scale / baseScale;
    
    return { lon, lat };
}

/**
 * 获取当前地图中心点的地理坐标
 * @returns {object} 中心点坐标 {lon, lat}
 */
function getMapCenter() {
    const width = canvas.width;
    const height = canvas.height;
    return pixelToLonLat(width / 2, height / 2, width, height);
}

/**
 * 设置地图中心点到指定坐标
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 */
function setMapCenter(lon, lat) {
    const width = canvas.width;
    const height = canvas.height;
    const centerPixel = lonLatToPixel(lon, lat, width, height);
    mapData.offsetX = width / 2 - centerPixel.x;
    mapData.offsetY = height / 2 - centerPixel.y;
}

// ============================================
// 初始化函数
// ============================================

/**
 * 初始化地图编辑器
 * 设置画布、事件监听器，加载默认图层
 */
function init() {
    canvas = document.getElementById('mapCanvas');
    ctx = canvas.getContext('2d');
    
    // 设置画布大小
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // 鼠标事件监听
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    // 触摸事件监听（移动设备支持）
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    
    // 文件上传事件监听
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
    
    // 搜索输入框回车事件监听
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // 初始创建一个空图层
    const emptyLayer = {
        name: '默认图层',
        features: [],
        visible: true,
        style: {
            point: {
                color: '#1890ff',
                size: 5,
                opacity: 1,
                style: 'circle' // 点样式：circle, square, triangle, star, cross
            },
            line: {
                color: '#52c41a',
                width: 2,
                opacity: 1,
                lineDash: []
            },
            polygon: {
                fillColor: 'rgba(82, 196, 26, 0.3)',
                strokeColor: '#52c41a',
                strokeWidth: 2,
                opacity: 1
            }
        }
    };
    mapData.layers.push(emptyLayer);
    mapData.currentLayer = emptyLayer;
    updateLayerList();
    renderMap();
    
    // 检查 URL 参数，加载指定的图层配置文件
    const urlParams = new URLSearchParams(window.location.search);
    const configParam = urlParams.get('config');
    
    if (configParam) {
        // 自动补全 .json 扩展名
        let configUrl = configParam;
        if (!configUrl.endsWith('.json')) {
            configUrl += '.json';
        }
        // 如果不是绝对路径，加上 data/ 前缀
        if (!configUrl.startsWith('http://') && !configUrl.startsWith('https://') && !configUrl.startsWith('/')) {
            configUrl = 'data/' + configUrl;
        }
        loadLayerConfigFromUrl(configUrl);
    } else {
        // 默认加载 data/begin.json
        loadLayerConfigFromUrl('data/tw.json);
    }
}

/**
 * 调整画布大小以适应容器
 */
function resizeCanvas() {
    const mapContainer = document.getElementById('map');
    canvas.width = mapContainer.clientWidth;
    canvas.height = mapContainer.clientHeight;
    renderMap();
}

// ============================================
// 鼠标事件处理
// ============================================

let clickCount = 0;      // 点击计数器（用于区分单击/双击）
let clickTimer = null;   // 点击计时器

/**
 * 鼠标按下事件处理
 * @param {Event} e - 鼠标事件对象
 */
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 测量模式处理
    if (mapData.measureMode) {
        // 测量模式
        const lonLat = pixelToLonLat(x, y, canvas.width, canvas.height);
        mapData.measurePoints.push({ lon: lonLat.lon, lat: lonLat.lat, x, y });
        
        // 计算测量结果
        if (mapData.measureType === 'length' && mapData.measurePoints.length >= 2) {
            let totalLength = 0;
            for (let i = 1; i < mapData.measurePoints.length; i++) {
                const p1 = mapData.measurePoints[i-1];
                const p2 = mapData.measurePoints[i];
                totalLength += calculateDistance(p1.lon, p1.lat, p2.lon, p2.lat);
            }
            mapData.measureResult = totalLength;
        } else if (mapData.measureType === 'area' && mapData.measurePoints.length >= 3) {
            mapData.measureResult = calculateArea(mapData.measurePoints);
        }
        
        updateMeasureResult();
        renderMap();
        return;
    }
    
    // 选择工具处理
    if (mapData.tool === 'select') {
        const feature = findFeatureAt(x, y);
        if (feature) {
            selectFeature(feature);
        } else {
            // 未点击到要素，启动拖拽
            mapData.isDragging = true;
            mapData.lastMouseX = x;
            mapData.lastMouseY = y;
        }
    } else if (mapData.tool === 'point') {
        // 添加点要素
        addPointFeature(x, y);
    } else if (mapData.tool === 'line' || mapData.tool === 'polygon') {
        // 绘制线或面：单击添加节点
        clickCount++;
        
        if (clickCount === 1) {
            // 第一次点击，启动计时器
            clickTimer = setTimeout(() => {
                // 单击：添加节点
                mapData.editPoints.push({ x, y });
                if (mapData.editPoints.length > 1) {
                    renderMap();
                    drawEditPreview();
                }
                clickCount = 0;
            }, 300); // 300ms 内第二次点击视为双击
        } else if (clickCount === 2) {
            // 双击：结束绘制
            clearTimeout(clickTimer);
            if (mapData.tool === 'line' && mapData.editPoints.length >= 1) {
                // 双击时也添加最后一个点
                mapData.editPoints.push({ x, y });
                addLineFeature();
            } else if (mapData.tool === 'polygon' && mapData.editPoints.length >= 2) {
                // 双击时也添加最后一个点
                mapData.editPoints.push({ x, y });
                addPolygonFeature();
            }
            clickCount = 0;
        }
    }
}

/**
 * 鼠标移动事件处理
 * @param {Event} e - 鼠标事件对象
 */
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 拖拽地图处理（OpenLayers 风格：直接调整偏移量）
    if (mapData.isDragging) {
        const dx = x - mapData.lastMouseX;
        const dy = y - mapData.lastMouseY;
        
        // 更新偏移量
        mapData.offsetX += dx;
        mapData.offsetY += dy;
        
        // 更新鼠标位置
        mapData.lastMouseX = x;
        mapData.lastMouseY = y;
        
        renderMap();
    } else if (mapData.tool === 'line' || mapData.tool === 'polygon') {
        // 绘制线或面时显示预览
        if (mapData.editPoints.length > 0) {
            renderMap();
            drawEditPreview(x, y);
        }
    }
}

/**
 * 鼠标释放事件处理
 * @param {Event} e - 鼠标事件对象
 */
function handleMouseUp(e) {
    if (mapData.isDragging) {
        mapData.isDragging = false;
    }
    // 线和面不再自动完成，需要用户手动完成
    // 线：点击 "添加线" 按钮或按 Enter 键完成
    // 面：点击 "添加面" 按钮或按 Enter 键完成
}

// ============================================
// 触摸事件处理（移动设备支持）
// ============================================

/**
 * 触摸开始事件处理
 * @param {TouchEvent} e - 触摸事件对象
 */
function handleTouchStart(e) {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        mapData.lastMouseX = x;
        mapData.lastMouseY = y;
        mapData.isDragging = true;
    }
}

/**
 * 触摸移动事件处理（OpenLayers 风格）
 * @param {TouchEvent} e - 触摸事件对象
 */
function handleTouchMove(e) {
    if (e.touches.length === 1 && mapData.isDragging) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // 计算移动距离
        const dx = x - mapData.lastMouseX;
        const dy = y - mapData.lastMouseY;
        
        // 更新偏移量
        mapData.offsetX += dx;
        mapData.offsetY += dy;
        
        // 更新触摸位置
        mapData.lastMouseX = x;
        mapData.lastMouseY = y;
        
        renderMap();
    }
}

/**
 * 触摸结束事件处理
 * @param {TouchEvent} e - 触摸事件对象
 */
function handleTouchEnd(e) {
    mapData.isDragging = false;
}

// ============================================
// 缩放控制
// ============================================

/**
 * 双击放大事件处理
 * @param {MouseEvent} e - 鼠标事件对象
 */
function handleDoubleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 检查是否点击在要素上
    const feature = findFeatureAt(x, y);
    if (!feature) {
        // 如果未点击到要素，则以双击位置为基准点放大
        const zoomFactor = 1.5;
        zoomAt(x, y, zoomFactor);
    }
}

/**
 * 滚轮缩放事件处理（OpenLayers 风格）
 * 核心思想：以鼠标位置为锚点，保持锚点地理坐标不变
 * @param {WheelEvent} e - 滚轮事件对象
 */
function handleWheel(e) {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 根据滚轮方向调整缩放比例
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    // 以鼠标位置为锚点进行缩放
    zoomAt(x, y, zoomFactor);
    
    // 限制缩放范围
    if (mapData.scale < 0.1) {
        mapData.scale = 0.1;
        renderMap();
    } else if (mapData.scale > 10) {
        mapData.scale = 10;
        renderMap();
    }
}

// ============================================
// 文件上传处理
// ============================================

/**
 * 文件上传事件处理
 * @param {Event} e - 文件上传事件对象
 */
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const geojson = JSON.parse(e.target.result);
                addLayerFromGeoJSON(geojson, file.name);
            } catch (error) {
                alert('文件解析失败：' + error.message);
            }
        };
        reader.readAsText(file);
    }
}

/**
 * 从 GeoJSON 数据添加图层
 * @param {Object} geojson - GeoJSON 数据对象
 * @param {string} name - 图层名称
 */
function addLayerFromGeoJSON(geojson, name) {
    const layer = {
        name: name.replace('.geojson', ''),
        features: geojson.features || [],
        visible: true,
        style: {
            point: {
                color: '#1890ff',
                size: 5,
                opacity: 1
            },
            line: {
                color: '#52c41a',
                width: 2,
                opacity: 1,
                lineDash: []
            },
            polygon: {
                fillColor: 'rgba(82, 196, 26, 0.3)',
                strokeColor: '#52c41a',
                strokeWidth: 2,
                opacity: 1
            }
        }
    };
    
    // 分析数据坐标范围
    if (layer.features.length > 0) {
        let minLon = Infinity, maxLon = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        
        layer.features.forEach(feature => {
            const geometry = feature.geometry;
            switch (geometry.type) {
                case 'Point':
                    const lon = geometry.coordinates[0];
                    const lat = geometry.coordinates[1];
                    minLon = Math.min(minLon, lon);
                    maxLon = Math.max(maxLon, lon);
                    minLat = Math.min(minLat, lat);
                    maxLat = Math.max(maxLat, lat);
                    break;
                case 'LineString':
                case 'Polygon':
                    const coordinates = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
                    coordinates.forEach(coord => {
                        const lon = coord[0];
                        const lat = coord[1];
                        minLon = Math.min(minLon, lon);
                        maxLon = Math.max(maxLon, lon);
                        minLat = Math.min(minLat, lat);
                        maxLat = Math.max(maxLat, lat);
                    });
                    break;
            }
        });
        
        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        const rangeLon = maxLon - minLon;
        const rangeLat = maxLat - minLat;
        
        console.log(`${name} 数据范围:`, {
            minLon, maxLon,
            minLat, maxLat,
            centerLon, centerLat,
            rangeLon, rangeLat
        });
        
        // 调整地图中心到数据中心
        // 这里可以根据需要调整
    }
    
    mapData.layers.push(layer);
    mapData.currentLayer = layer;
    updateLayerList();
    renderMap();
    updateStats();
    console.log('图层加载完成:', name, '要素数量:', layer.features.length);
}

// ============================================
// 图层管理
// ============================================

/**
 * 更新图层列表显示
 */
function updateLayerList() {
    const layerList = document.getElementById('layer-list');
    layerList.innerHTML = '';
    
    // 按照 JSON 导入顺序显示图层（最先导入的在最上面）
    mapData.layers.forEach((layer, index) => {
        const item = document.createElement('div');
        item.className = 'layer-item' + (mapData.currentLayer === layer ? ' active' : '');
        item.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; flex: 1;">
                    <input type="checkbox" ${layer.visible ? 'checked' : ''} onchange="toggleLayerVisibility(${index})" style="margin-right: 8px;">
                    <span style="flex: 1; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" onclick="selectLayer(${index})">
                        <strong>${layer.name}</strong>
                    </span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn" onclick="moveLayerUp(${index})" style="padding: 2px 6px; font-size: 12px;">↑</button>
                    <button class="btn" onclick="moveLayerDown(${index})" style="padding: 2px 6px; font-size: 12px;">↓</button>
                    <button class="btn" onclick="openStyleEditor(${index})" style="padding: 2px 6px; font-size: 12px;">🎨</button>
                    <button class="btn" onclick="deleteLayer(${index})" style="padding: 2px 6px; font-size: 12px; background-color: #ff4d4f; color: white;">🗑️</button>
                </div>
            </div>
        `;
        layerList.appendChild(item);
    });
}

/**
 * 选择当前图层
 * @param {number} index - 图层索引
 */
function selectLayer(index) {
    mapData.currentLayer = mapData.layers[index];
    updateLayerList();
    renderMap();
}

/**
 * 切换图层可见性
 * @param {number} index - 图层索引
 */
function toggleLayerVisibility(index) {
    mapData.layers[index].visible = !mapData.layers[index].visible;
    renderMap();
}

/**
 * 移动图层向上（提高显示层级）
 * @param {number} index - 图层索引
 */
function moveLayerUp(index) {
    if (index > 0) {
        const temp = mapData.layers[index];
        mapData.layers[index] = mapData.layers[index - 1];
        mapData.layers[index - 1] = temp;
        updateLayerList();
        renderMap();
    }
}

/**
 * 移动图层向下（降低显示层级）
 * @param {number} index - 图层索引
 */
function moveLayerDown(index) {
    if (index < mapData.layers.length - 1) {
        const temp = mapData.layers[index];
        mapData.layers[index] = mapData.layers[index + 1];
        mapData.layers[index + 1] = temp;
        updateLayerList();
        renderMap();
    }
}

/**
 * 删除图层
 * @param {number} index - 图层索引
 */
function deleteLayer(index) {
    if (mapData.layers.length <= 1) {
        alert('至少需要保留一个图层');
        return;
    }
    
    if (confirm(`确定要删除图层 "${mapData.layers[index].name}" 吗？`)) {
        // 如果删除的是当前选中的图层，选择另一个图层
        if (mapData.currentLayer === mapData.layers[index]) {
            mapData.currentLayer = mapData.layers[index === 0 ? 1 : index - 1];
        }
        
        // 如果删除的是正在编辑的图层，清除选中状态
        if (currentStyleLayerIndex === index) {
            currentStyleLayerIndex = -1;
        }
        
        // 从数组中删除图层
        mapData.layers.splice(index, 1);
        
        // 更新界面
        updateLayerList();
        updateStats();
        renderMap();
        
        console.log('图层已删除');
    }
}

// ============================================
// 样式编辑器
// ============================================

let currentStyleLayerIndex = -1;  // 当前正在编辑样式的图层索引

/**
 * 打开样式编辑器
 * @param {number} index - 图层索引
 */
function openStyleEditor(index) {
    currentStyleLayerIndex = index;
    const layer = mapData.layers[index];
    const content = document.getElementById('styleEditorContent');
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h4>点样式</h4>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">颜色:</label>
                <input type="color" id="pointColor" value="${layer.style.point.color}" style="vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">大小:</label>
                <input type="number" id="pointSize" value="${layer.style.point.size}" min="1" max="20" style="width: 60px; vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">透明度:</label>
                <input type="range" id="pointOpacity" value="${layer.style.point.opacity * 100}" min="0" max="100" style="width: 150px; vertical-align: middle;">
                <span id="pointOpacityValue">${layer.style.point.opacity * 100}%</span>
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">样式:</label>
                <select id="pointStyle" style="vertical-align: middle;">
                    <option value="circle" ${layer.style.point.style === 'circle' ? 'selected' : ''}>圆形</option>
                    <option value="square" ${layer.style.point.style === 'square' ? 'selected' : ''}>方形</option>
                    <option value="triangle" ${layer.style.point.style === 'triangle' ? 'selected' : ''}>三角形</option>
                    <option value="star" ${layer.style.point.style === 'star' ? 'selected' : ''}>星形</option>
                    <option value="cross" ${layer.style.point.style === 'cross' ? 'selected' : ''}>十字</option>
                </select>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4>线样式</h4>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">颜色:</label>
                <input type="color" id="lineColor" value="${layer.style.line.color}" style="vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">宽度:</label>
                <input type="number" id="lineWidth" value="${layer.style.line.width}" min="1" max="10" style="width: 60px; vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">透明度:</label>
                <input type="range" id="lineOpacity" value="${layer.style.line.opacity * 100}" min="0" max="100" style="width: 150px; vertical-align: middle;">
                <span id="lineOpacityValue">${layer.style.line.opacity * 100}%</span>
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">线型:</label>
                <select id="lineDash" style="vertical-align: middle;">
                    <option value="[]" ${JSON.stringify(layer.style.line.lineDash) === '[]' ? 'selected' : ''}>实线</option>
                    <option value="[5,5]" ${JSON.stringify(layer.style.line.lineDash) === '[5,5]' ? 'selected' : ''}>虚线</option>
                    <option value="[10,5,2,5]" ${JSON.stringify(layer.style.line.lineDash) === '[10,5,2,5]' ? 'selected' : ''}>点划线</option>
                </select>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4>面样式</h4>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">填充色:</label>
                <input type="color" id="polygonFillColor" value="${layer.style.polygon.fillColor.replace(/rgba?\(([^)]+)\)/, (match, p1) => {
                    const [r, g, b] = p1.split(',').map(Number);
                    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                })}" style="vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">边框色:</label>
                <input type="color" id="polygonStrokeColor" value="${layer.style.polygon.strokeColor}" style="vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">边框宽度:</label>
                <input type="number" id="polygonStrokeWidth" value="${layer.style.polygon.strokeWidth}" min="1" max="10" style="width: 60px; vertical-align: middle;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: inline-block; width: 100px;">透明度:</label>
                <input type="range" id="polygonOpacity" value="${layer.style.polygon.opacity * 100}" min="0" max="100" style="width: 150px; vertical-align: middle;">
                <span id="polygonOpacityValue">${layer.style.polygon.opacity * 100}%</span>
            </div>
        </div>
    `;
    
    // 添加透明度滑块事件监听
    document.getElementById('pointOpacity').addEventListener('input', function() {
        document.getElementById('pointOpacityValue').textContent = this.value + '%';
    });
    
    document.getElementById('lineOpacity').addEventListener('input', function() {
        document.getElementById('lineOpacityValue').textContent = this.value + '%';
    });
    
    document.getElementById('polygonOpacity').addEventListener('input', function() {
        document.getElementById('polygonOpacityValue').textContent = this.value + '%';
    });
    
    document.getElementById('styleEditor').style.display = 'block';
}

/**
 * 关闭样式编辑器
 */
function closeStyleEditor() {
    document.getElementById('styleEditor').style.display = 'none';
    currentStyleLayerIndex = -1;
}

/**
 * 应用样式设置
 */
function applyStyle() {
    if (currentStyleLayerIndex === -1) return;
    
    const layer = mapData.layers[currentStyleLayerIndex];
    
    // 点样式
    layer.style.point.color = document.getElementById('pointColor').value;
    layer.style.point.size = parseInt(document.getElementById('pointSize').value);
    layer.style.point.opacity = parseInt(document.getElementById('pointOpacity').value) / 100;
    layer.style.point.style = document.getElementById('pointStyle').value;
    
    // 线样式
    layer.style.line.color = document.getElementById('lineColor').value;
    layer.style.line.width = parseInt(document.getElementById('lineWidth').value);
    layer.style.line.opacity = parseInt(document.getElementById('lineOpacity').value) / 100;
    layer.style.line.lineDash = JSON.parse(document.getElementById('lineDash').value);
    
    // 面样式
    const fillColor = document.getElementById('polygonFillColor').value;
    const fillOpacity = parseInt(document.getElementById('polygonOpacity').value) / 100;
    const r = parseInt(fillColor.slice(1, 3), 16);
    const g = parseInt(fillColor.slice(3, 5), 16);
    const b = parseInt(fillColor.slice(5, 7), 16);
    layer.style.polygon.fillColor = `rgba(${r}, ${g}, ${b}, ${fillOpacity})`;
    layer.style.polygon.strokeColor = document.getElementById('polygonStrokeColor').value;
    layer.style.polygon.strokeWidth = parseInt(document.getElementById('polygonStrokeWidth').value);
    layer.style.polygon.opacity = fillOpacity;
    
    closeStyleEditor();
    renderMap();
}

// ============================================
// 测量工具
// ============================================

/**
 * 开始测量
 * @param {string} type - 测量类型：'length' 或 'area'
 */
function startMeasure(type) {
    // 如果当前已经是测量模式且类型相同，则取消测量
    if (mapData.measureMode && mapData.measureType === type) {
        clearMeasure();
        return;
    }
    
    mapData.measureMode = true;
    mapData.measureType = type;
    mapData.measurePoints = [];
    mapData.measureResult = 0;
    updateMeasureResult();
    
    // 更新按钮状态
    document.querySelectorAll('.map-tool-btn').forEach(btn => btn.classList.remove('active'));
    
    if (type === 'length') {
        document.getElementById('measureLengthBtn').classList.add('active');
    } else {
        document.getElementById('measureAreaBtn').classList.add('active');
    }
    
    console.log('开始测量:', type);
}

/**
 * 清除测量
 */
function clearMeasure() {
    mapData.measureMode = false;
    mapData.measureType = '';
    mapData.measurePoints = [];
    mapData.measureResult = 0;
    updateMeasureResult();
    
    // 更新按钮状态
    document.getElementById('measureLengthBtn').classList.remove('active');
    document.getElementById('measureAreaBtn').classList.remove('active');
    
    renderMap();
    console.log('清除测量');
}

/**
 * 更新测量结果显示
 */
function updateMeasureResult() {
    const resultElement = document.getElementById('measureResult');
    if (mapData.measureType === 'length') {
        resultElement.textContent = `${mapData.measureResult.toFixed(2)} 米`;
    } else if (mapData.measureType === 'area') {
        resultElement.textContent = `${mapData.measureResult.toFixed(2)} 平方米`;
    } else {
        resultElement.textContent = '0 米';
    }
}

/**
 * 计算两点之间的距离（米）
 * 使用 Haversine 公式计算球面距离
 * @param {number} lon1 - 点 1 经度
 * @param {number} lat1 - 点 1 纬度
 * @param {number} lon2 - 点 2 经度
 * @param {number} lat2 - 点 2 纬度
 * @returns {number} 距离（米）
 */
function calculateDistance(lon1, lat1, lon2, lat2) {
    const R = 6371e3; // 地球半径（米）
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
}

/**
 * 计算多边形面积（平方米）
 * 使用球面多边形面积公式
 * @param {Array} points - 点数组 [{lon, lat}, ...]
 * @returns {number} 面积（平方米）
 */
function calculateArea(points) {
    if (points.length < 3) return 0;
    
    let area = 0;
    const R = 6371e3; // 地球半径（米）
    
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const φ1 = points[i].lat * Math.PI / 180;
        const λ1 = points[i].lon * Math.PI / 180;
        const φ2 = points[j].lat * Math.PI / 180;
        const λ2 = points[j].lon * Math.PI / 180;
        
        const dλ = λ2 - λ1;
        area += Math.sin(φ1) * Math.sin(φ2) * Math.cos(dλ) -
                Math.cos(φ1) * Math.cos(φ2);
    }
    
    area = Math.abs(area) * R * R / 2;
    return area;
}

// ============================================
// 工具选择
// ============================================

/**
 * 设置当前工具
 * @param {string} tool - 工具名称：'select', 'point', 'line', 'polygon'
 */
function setTool(tool) {
    mapData.tool = tool;
    mapData.editPoints = [];
    
    // 更新按钮状态
    document.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.map-tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tool + 'Tool')?.classList.add('active');
}

// ============================================
// 要素查找与选择
// ============================================

/**
 * 查找指定位置的要素
 * @param {number} x - 像素 X 坐标
 * @param {number} y - 像素 Y 坐标
 * @returns {Object|null} 要素信息 {layer, feature} 或 null
 */
function findFeatureAt(x, y) {
    for (const layer of mapData.layers) {
        if (!layer.visible) continue;
        
        for (const feature of layer.features) {
            if (isFeatureAt(feature, x, y)) {
                return { layer, feature };
            }
        }
    }
    return null;
}

/**
 * 判断要素是否在指定位置
 * @param {Object} feature - 要素对象
 * @param {number} x - 像素 X 坐标
 * @param {number} y - 像素 Y 坐标
 * @returns {boolean} 是否在位置处
 */
function isFeatureAt(feature, x, y) {
    const geometry = feature.geometry;
    
    switch (geometry.type) {
        case 'Point':
            const point = lonLatToPixel(geometry.coordinates[0], geometry.coordinates[1], canvas.width, canvas.height);
            const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
            return distance < 10;
        
        case 'LineString':
            // 简化的线要素检测：计算点到线段的最短距离
            for (let i = 0; i < geometry.coordinates.length - 1; i++) {
                const p1 = lonLatToPixel(geometry.coordinates[i][0], geometry.coordinates[i][1], canvas.width, canvas.height);
                const p2 = lonLatToPixel(geometry.coordinates[i+1][0], geometry.coordinates[i+1][1], canvas.width, canvas.height);
                if (pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 5) {
                    return true;
                }
            }
            return false;
        
        case 'Polygon':
            // 简化的面要素检测：射线法判断点是否在多边形内
            const polygon = geometry.coordinates[0].map(coord => 
                lonLatToPixel(coord[0], coord[1], canvas.width, canvas.height)
            );
            return pointInPolygon(x, y, polygon);
        
        default:
            return false;
    }
}

/**
 * 计算点到线段的最短距离
 * @param {number} x - 点 X 坐标
 * @param {number} y - 点 Y 坐标
 * @param {number} x1 - 线段起点 X 坐标
 * @param {number} y1 - 线段起点 Y 坐标
 * @param {number} x2 - 线段终点 X 坐标
 * @param {number} y2 - 线段终点 Y 坐标
 * @returns {number} 最短距离
 */
function pointToLineDistance(x, y, x1, y1, x2, y2) {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 判断点是否在多边形内（射线法）
 * @param {number} x - 点 X 坐标
 * @param {number} y - 点 Y 坐标
 * @param {Array} polygon - 多边形顶点数组 [{x, y}, ...]
 * @returns {boolean} 是否在多边形内
 */
function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > y) !== (yj > y)) && 
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * 选择要素
 * @param {Object} featureInfo - 要素信息 {layer, feature}
 */
function selectFeature(featureInfo) {
    mapData.selectedFeature = featureInfo;
    updateFeatureInfo(featureInfo);
    renderMap();
}

/**
 * 更新要素信息显示
 * @param {Object} featureInfo - 要素信息
 */
function updateFeatureInfo(featureInfo) {
    const infoPanel = document.getElementById('featureInfo');
    if (!featureInfo) {
        infoPanel.innerHTML = '点击要素查看信息';
        return;
    }
    
    const feature = featureInfo.feature;
    const properties = feature.properties || {};
    let html = `<strong>图层:</strong> ${featureInfo.layer.name}<br>`;
    html += '<strong>属性:</strong><br>';
    
    for (const [key, value] of Object.entries(properties)) {
        html += `${key}: ${value}<br>`;
    }
    
    infoPanel.innerHTML = html;
}

/**
 * 删除选中的要素
 */
function deleteSelected() {
    if (mapData.selectedFeature) {
        const { layer, feature } = mapData.selectedFeature;
        const index = layer.features.indexOf(feature);
        if (index > -1) {
            layer.features.splice(index, 1);
            mapData.selectedFeature = null;
            updateFeatureInfo(null);
            updateLayerList();
            updateStats();
            renderMap();
        }
    }
}

// ============================================
// 添加要素
// ============================================

/**
 * 添加点要素
 * @param {number} x - 像素 X 坐标
 * @param {number} y - 像素 Y 坐标
 */
function addPointFeature(x, y) {
    if (!mapData.currentLayer) {
        alert('请先选择或创建图层');
        return;
    }
    
    console.log('鼠标坐标:', x, y);
    console.log('画布大小:', canvas.width, canvas.height);
    console.log('缩放比例:', mapData.scale);
    console.log('偏移量:', mapData.offsetX, mapData.offsetY);
    
    const lonLat = pixelToLonLat(x, y, canvas.width, canvas.height);
    console.log('转换后的坐标:', lonLat.lon, lonLat.lat);
    
    const feature = {
        type: 'Feature',
        properties: {
            name: '新点',
            description: '手动添加的点'
        },
        geometry: {
            type: 'Point',
            coordinates: [lonLat.lon, lonLat.lat]
        }
    };
    
    mapData.currentLayer.features.push(feature);
    updateLayerList();
    updateStats();
    renderMap();
}

/**
 * 添加线要素
 */
function addLineFeature() {
    if (!mapData.currentLayer) {
        alert('请先选择或创建图层');
        return;
    }
    
    const coordinates = mapData.editPoints.map(point => {
        const lonLat = pixelToLonLat(point.x, point.y, canvas.width, canvas.height);
        return [lonLat.lon, lonLat.lat];
    });
    
    const feature = {
        type: 'Feature',
        properties: {
            name: '新线',
            description: '手动添加的线'
        },
        geometry: {
            type: 'LineString',
            coordinates: coordinates
        }
    };
    
    mapData.currentLayer.features.push(feature);
    mapData.editPoints = [];
    updateLayerList();
    updateStats();
    renderMap();
}

/**
 * 添加面要素
 */
function addPolygonFeature() {
    if (!mapData.currentLayer) {
        alert('请先选择或创建图层');
        return;
    }
    
    const coordinates = mapData.editPoints.map(point => {
        const lonLat = pixelToLonLat(point.x, point.y, canvas.width, canvas.height);
        return [lonLat.lon, lonLat.lat];
    });
    
    // 闭合多边形
    coordinates.push(coordinates[0]);
    
    const feature = {
        type: 'Feature',
        properties: {
            name: '新面',
            description: '手动添加的面'
        },
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
        }
    };
    
    mapData.currentLayer.features.push(feature);
    mapData.editPoints = [];
    updateLayerList();
    updateStats();
    renderMap();
}

/**
 * 绘制编辑预览
 * @param {number} x - 当前鼠标 X 坐标（可选）
 * @param {number} y - 当前鼠标 Y 坐标（可选）
 */
function drawEditPreview(x, y) {
    if (mapData.editPoints.length === 0) return;
    
    ctx.beginPath();
    ctx.moveTo(mapData.editPoints[0].x, mapData.editPoints[0].y);
    
    for (let i = 1; i < mapData.editPoints.length; i++) {
        ctx.lineTo(mapData.editPoints[i].x, mapData.editPoints[i].y);
    }
    
    if (x !== undefined && y !== undefined) {
        ctx.lineTo(x, y);
    }
    
    if (mapData.tool === 'polygon' && mapData.editPoints.length > 2) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 128, 255, 0.2)';
        ctx.fill();
    }
    
    ctx.strokeStyle = '#0080ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 绘制编辑点
    mapData.editPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0080ff';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

// ============================================
// 地图渲染
// ============================================

/**
 * 渲染地图
 */
function renderMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格
    drawGrid();
    
    // 绘制图层 - 按照 JSON 导入顺序，最先导入的在最下面，最后导入的在最上面
    let featureCount = 0;
    mapData.layers.forEach(layer => {
        if (layer.visible) {
            layer.features.forEach(feature => {
                drawFeature(feature, layer, false);
                featureCount++;
            });
        }
    });
    
    // 绘制测量结果
    drawMeasure();
    
    // 绘制选中要素
    if (mapData.selectedFeature) {
        drawFeature(mapData.selectedFeature.feature, mapData.selectedFeature.layer, true);
    }
    
    console.log('渲染完成，绘制要素数量:', featureCount);
}

/**
 * 绘制测量结果
 */
function drawMeasure() {
    if (!mapData.measureMode || mapData.measurePoints.length === 0) return;
    
    ctx.beginPath();
    
    // 绘制测量线
    const firstPoint = mapData.measurePoints[0];
    ctx.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < mapData.measurePoints.length; i++) {
        const point = mapData.measurePoints[i];
        ctx.lineTo(point.x, point.y);
    }
    
    // 如果是面积测量，闭合多边形
    if (mapData.measureType === 'area' && mapData.measurePoints.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 128, 255, 0.2)';
        ctx.fill();
    }
    
    // 绘制线条
    ctx.strokeStyle = '#ff4d4f';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 绘制测量点
    mapData.measurePoints.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4d4f';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 绘制点序号
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(index + 1, point.x, point.y);
    });
}

/**
 * 绘制网格
 */
function drawGrid() {
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
    ctx.lineWidth = 1;
    
    const gridSize = 50 * mapData.scale;
    
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

/**
 * 绘制要素
 * @param {Object} feature - 要素对象
 * @param {Object} layer - 图层对象
 * @param {boolean} isSelected - 是否选中
 */
function drawFeature(feature, layer, isSelected = false) {
    const geometry = feature.geometry;
    const properties = feature.properties || {};
    
    switch (geometry.type) {
        case 'Point':
            drawPoint(geometry.coordinates[0], geometry.coordinates[1], properties, layer, isSelected);
            break;
        case 'LineString':
            drawLine(geometry.coordinates, properties, layer, isSelected);
            break;
        case 'Polygon':
            drawPolygon(geometry.coordinates, properties, layer, isSelected);
            break;
    }
}

/**
 * 绘制点要素
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 * @param {Object} properties - 属性对象
 * @param {Object} layer - 图层对象
 * @param {boolean} isSelected - 是否选中
 */
function drawPoint(lon, lat, properties, layer, isSelected) {
    const point = lonLatToPixel(lon, lat, canvas.width, canvas.height);
    const size = isSelected ? 8 : layer.style.point.size;
    const color = isSelected ? '#ff4d4f' : layer.style.point.color;
    const opacity = isSelected ? 1 : layer.style.point.opacity;
    
    ctx.globalAlpha = opacity;
    
    // 根据点样式绘制不同形状
    switch (layer.style.point.style || 'circle') {
        case 'circle':
            ctx.beginPath();
            ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            break;
        
        case 'square':
            ctx.fillStyle = color;
            ctx.fillRect(point.x - size, point.y - size, size * 2, size * 2);
            break;
        
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(point.x, point.y - size * 1.5);
            ctx.lineTo(point.x - size, point.y + size * 0.5);
            ctx.lineTo(point.x + size, point.y + size * 0.5);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            break;
        
        case 'star':
            drawStar(point.x, point.y, size, 5, 0.5);
            ctx.fillStyle = color;
            ctx.fill();
            break;
        
        case 'cross':
            ctx.strokeStyle = color;
            ctx.lineWidth = size / 2;
            ctx.beginPath();
            ctx.moveTo(point.x - size, point.y);
            ctx.lineTo(point.x + size, point.y);
            ctx.moveTo(point.x, point.y - size);
            ctx.lineTo(point.x, point.y + size);
            ctx.stroke();
            break;
    }
    
    // 绘制边框
    if (layer.style.point.style !== 'cross') {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        
        switch (layer.style.point.style || 'circle') {
            case 'circle':
                ctx.beginPath();
                ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
                ctx.stroke();
                break;
            
            case 'square':
                ctx.strokeRect(point.x - size, point.y - size, size * 2, size * 2);
                break;
            
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(point.x, point.y - size * 1.5);
                ctx.lineTo(point.x - size, point.y + size * 0.5);
                ctx.lineTo(point.x + size, point.y + size * 0.5);
                ctx.closePath();
                ctx.stroke();
                break;
            
            case 'star':
                drawStar(point.x, point.y, size, 5, 0.5);
                ctx.stroke();
                break;
        }
    }
    
    ctx.globalAlpha = 1;
    
    // 绘制标签
    if (properties.name || properties.FL) {
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.fillText(properties.name || properties.FL, point.x + 10, point.y + 4);
    }
}

/**
 * 绘制星形
 * @param {number} x - 中心 X 坐标
 * @param {number} y - 中心 Y 坐标
 * @param {number} radius - 半径
 * @param {number} points - 角点数
 * @param {number} innerRadiusRatio - 内半径比例
 */
function drawStar(x, y, radius, points, innerRadiusRatio) {
    const innerRadius = radius * innerRadiusRatio;
    ctx.beginPath();
    
    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? radius : innerRadius;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    
    ctx.closePath();
}

/**
 * 绘制线要素
 * @param {Array} coordinates - 坐标数组 [[lon, lat], ...]
 * @param {Object} properties - 属性对象
 * @param {Object} layer - 图层对象
 * @param {boolean} isSelected - 是否选中
 */
function drawLine(coordinates, properties, layer, isSelected) {
    ctx.beginPath();
    
    const firstPoint = lonLatToPixel(coordinates[0][0], coordinates[0][1], canvas.width, canvas.height);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < coordinates.length; i++) {
        const point = lonLatToPixel(coordinates[i][0], coordinates[i][1], canvas.width, canvas.height);
        ctx.lineTo(point.x, point.y);
    }
    
    ctx.strokeStyle = isSelected ? '#ff4d4f' : layer.style.line.color;
    ctx.lineWidth = isSelected ? 4 : layer.style.line.width;
    ctx.setLineDash(isSelected ? [] : layer.style.line.lineDash);
    ctx.globalAlpha = isSelected ? 1 : layer.style.line.opacity;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

/**
 * 绘制面要素
 * @param {Array} coordinates - 坐标数组 [[[lon, lat], ...]]
 * @param {Object} properties - 属性对象
 * @param {Object} layer - 图层对象
 * @param {boolean} isSelected - 是否选中
 */
function drawPolygon(coordinates, properties, layer, isSelected) {
    const polygon = coordinates[0];
    
    ctx.beginPath();
    const firstPoint = lonLatToPixel(polygon[0][0], polygon[0][1], canvas.width, canvas.height);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < polygon.length; i++) {
        const point = lonLatToPixel(polygon[i][0], polygon[i][1], canvas.width, canvas.height);
        ctx.lineTo(point.x, point.y);
    }
    
    ctx.closePath();
    ctx.fillStyle = isSelected ? 'rgba(255, 77, 79, 0.3)' : layer.style.polygon.fillColor;
    ctx.globalAlpha = isSelected ? 1 : layer.style.polygon.opacity;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#ff4d4f' : layer.style.polygon.strokeColor;
    ctx.lineWidth = isSelected ? 3 : layer.style.polygon.strokeWidth;
    ctx.stroke();
    ctx.globalAlpha = 1;
}

// ============================================
// 视图控制（参考 OpenLayers 实现）
// ============================================

/**
 * 放大视图（以鼠标位置为锚点）
 * OpenLayers 实现方式：保持鼠标位置对应的地理坐标不变
 */
function zoomIn() {
    // 获取当前地图中心点
    const centerGeo = getMapCenter();
    
    // 执行缩放
    const oldScale = mapData.scale;
    mapData.scale *= 1.2;
    
    // 保持中心点位置不变
    setMapCenter(centerGeo.lon, centerGeo.lat);
    
    renderMap();
}

/**
 * 缩小视图（以鼠标位置为锚点）
 * OpenLayers 实现方式：保持鼠标位置对应的地理坐标不变
 */
function zoomOut() {
    // 获取当前地图中心点
    const centerGeo = getMapCenter();
    
    // 执行缩放
    const oldScale = mapData.scale;
    mapData.scale /= 1.2;
    
    // 保持中心点位置不变
    setMapCenter(centerGeo.lon, centerGeo.lat);
    
    renderMap();
}

/**
 * 以指定点为锚点进行缩放（OpenLayers 风格实现）
 * 核心思想：缩放前后，鼠标位置对应的地理坐标保持不变
 * @param {number} x - 鼠标像素 X 坐标
 * @param {number} y - 鼠标像素 Y 坐标
 * @param {number} factor - 缩放因子
 */
function zoomAt(x, y, factor) {
    // 1. 记录缩放前鼠标位置的地理坐标（锚点）
    const anchorGeo = pixelToLonLat(x, y, canvas.width, canvas.height);
    
    // 2. 执行缩放
    mapData.scale *= factor;
    
    // 3. 计算缩放后该地理坐标对应的新像素位置
    const newPixel = lonLatToPixel(anchorGeo.lon, anchorGeo.lat, canvas.width, canvas.height);
    
    // 4. 调整偏移量，使锚点地理坐标在缩放后仍然位于鼠标位置
    // OpenLayers 的做法：调整 center 使 anchor 点保持不动
    mapData.offsetX += x - newPixel.x;
    mapData.offsetY += y - newPixel.y;
    
    renderMap();
}

/**
 * 重置视图到初始状态
 */
function resetView() {
    mapData.scale = 1;
    mapData.offsetX = 0;
    mapData.offsetY = 0;
    renderMap();
}

/**
 * 缩放到要素（根据要素类型和范围自动调整）
 * OpenLayers 的 fit 方法实现
 * @param {Object} feature - 要素对象
 */
function zoomToFeature(feature) {
    const geometry = feature.geometry;
    let centerLon, centerLat, zoomLevel = 1;
    
    switch (geometry.type) {
        case 'Point':
            centerLon = geometry.coordinates[0];
            centerLat = geometry.coordinates[1];
            // 对于点，设置一个合适的缩放级别
            zoomLevel = 2;
            break;
            
        case 'LineString':
            // 计算线的中心点和范围
            let minLon = Infinity, maxLon = -Infinity;
            let minLat = Infinity, maxLat = -Infinity;
            
            geometry.coordinates.forEach(coord => {
                minLon = Math.min(minLon, coord[0]);
                maxLon = Math.max(maxLon, coord[0]);
                minLat = Math.min(minLat, coord[1]);
                maxLat = Math.max(maxLat, coord[1]);
            });
            
            centerLon = (minLon + maxLon) / 2;
            centerLat = (minLat + maxLat) / 2;
            
            // 根据线的范围计算合适的缩放级别
            const rangeLon = maxLon - minLon;
            const rangeLat = maxLat - minLat;
            const maxRange = Math.max(rangeLon, rangeLat);
            zoomLevel = Math.min(5, Math.max(0.5, 2 / maxRange));
            break;
            
        case 'Polygon':
            // 计算面的中心点和范围
            const polygon = geometry.coordinates[0];
            let minLonP = Infinity, maxLonP = -Infinity;
            let minLatP = Infinity, maxLatP = -Infinity;
            
            polygon.forEach(coord => {
                minLonP = Math.min(minLonP, coord[0]);
                maxLonP = Math.max(maxLonP, coord[0]);
                minLatP = Math.min(minLatP, coord[1]);
                maxLatP = Math.max(maxLatP, coord[1]);
            });
            
            centerLon = (minLonP + maxLonP) / 2;
            centerLat = (minLatP + maxLatP) / 2;
            
            // 根据面的范围计算合适的缩放级别
            const rangeLonP = maxLonP - minLonP;
            const rangeLatP = maxLatP - minLatP;
            const maxRangeP = Math.max(rangeLonP, rangeLatP);
            zoomLevel = Math.min(5, Math.max(0.5, 2 / maxRangeP));
            break;
    }
    
    // 设置缩放级别
    mapData.scale = zoomLevel;
    
    // 设置中心点，使要素居中（OpenLayers 的 setCenter）
    setMapCenter(centerLon, centerLat);
    
    renderMap();
}

// ============================================
// 搜索功能
// ============================================

/**
 * 执行搜索
 */
function performSearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (!searchTerm) return;
    
    const results = [];
    
    mapData.layers.forEach(layer => {
        layer.features.forEach(feature => {
            const properties = feature.properties || {};
            for (const [key, value] of Object.entries(properties)) {
                if (String(value).toLowerCase().includes(searchTerm)) {
                    results.push({ layer, feature });
                    break;
                }
            }
        });
    });
    
    // 显示搜索结果
    const resultsElement = document.getElementById('searchResults');
    if (results.length > 0) {
        resultsElement.innerHTML = '';
        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            // 获取要素名称或类型
            const featureName = result.feature.properties?.name || result.feature.properties?.FL || `要素 ${index + 1}`;
            const featureType = result.feature.geometry.type;
            
            item.innerHTML = `
                <div style="font-weight: 600;">${featureName}</div>
                <div style="font-size: 11px; color: #666;">类型：${featureType} | 图层：${result.layer.name}</div>
            `;
            
            // 点击结果定位到要素
            item.onclick = () => {
                selectFeature(result);
                // 定位并缩放到要素
                zoomToFeature(result.feature);
            };
            
            resultsElement.appendChild(item);
        });
    } else {
        resultsElement.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">未找到匹配要素</div>';
    }
}

// ============================================
// 统计信息
// ============================================

/**
 * 更新统计信息显示
 */
function updateStats() {
    let total = 0, points = 0, lines = 0, polygons = 0;
    
    mapData.layers.forEach(layer => {
        layer.features.forEach(feature => {
            total++;
            switch (feature.geometry.type) {
                case 'Point': points++;
                    break;
                case 'LineString': lines++;
                    break;
                case 'Polygon': polygons++;
                    break;
            }
        });
    });
    
    document.getElementById('totalFeatures').textContent = total;
    document.getElementById('pointCount').textContent = points;
    document.getElementById('lineCount').textContent = lines;
    document.getElementById('polygonCount').textContent = polygons;
}

// ============================================
// 加载指示器
// ============================================

/**
 * 显示加载指示器
 * @param {string} text - 加载提示文本
 */
function showLoading(text) {
    const loading = document.getElementById('loading');
    document.getElementById('loadingText').textContent = text;
    loading.style.display = 'block';
}

/**
 * 隐藏加载指示器
 */
function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

// ============================================
// 图层配置加载
// ============================================

/**
 * 加载图层配置文件（从文件选择器）
 */
function loadLayerConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const config = JSON.parse(event.target.result);
                    processLayerConfig(config);
                } catch (error) {
                    alert('配置文件解析失败：' + error.message);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

/**
 * 从 URL 加载图层配置
 * @param {string} url - 配置文件 URL
 */
function loadLayerConfigFromUrl(url) {
    showLoading('加载图层配置...');
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('网络请求失败：' + response.status);
            }
            return response.json();
        })
        .then(config => {
            processLayerConfig(config);
            hideLoading();
        })
        .catch(error => {
            alert('加载配置文件失败：' + error.message);
            hideLoading();
        });
}

/**
 * 将数字颜色值转换为十六进制颜色字符串
 * @param {number} num - 数字颜色值（如 16711680 表示红色）
 * @returns {string} 十六进制颜色字符串（如 #FF0000）
 */
function numToHexColor(num) {
    const hex = num.toString(16).padStart(6, '0');
    return '#' + hex;
}

/**
 * 处理图层配置
 * @param {Object} config - 图层配置对象
 */
function processLayerConfig(config) {
    // 清空现有图层
    mapData.layers = [];
    
    // 处理 geojson_base_path
    const geojsonBasePath = config.geojson_base_path || '';
    
    // 加载图层
    if (config.layers && Array.isArray(config.layers)) {
        config.layers.forEach(layerConfig => {
            // 创建图层对象
            const layer = {
                name: layerConfig.name || '未命名图层',
                features: [],
                visible: layerConfig.visible !== false,
                style: {
                    point: {
                        color: '#1890ff',
                        size: 5,
                        opacity: 1,
                        style: 'circle'
                    },
                    line: {
                        color: '#52c41a',
                        width: 2,
                        opacity: 1,
                        lineDash: []
                    },
                    polygon: {
                        fillColor: 'rgba(82, 196, 26, 0.3)',
                        strokeColor: '#52c41a',
                        strokeWidth: 2,
                        opacity: 0.3
                    }
                }
            };
            
            // 处理样式配置
            if (layerConfig.style) {
                // 处理点样式
                if (layerConfig.style.point) {
                    if (layerConfig.style.point.color !== undefined) {
                        layer.style.point.color = numToHexColor(layerConfig.style.point.color);
                    }
                    if (layerConfig.style.point.size !== undefined) {
                        layer.style.point.size = layerConfig.style.point.size;
                    }
                    if (layerConfig.style.point.font) {
                        // 保留字体信息
                    }
                }
                
                // 处理线样式
                if (layerConfig.style.line) {
                    if (layerConfig.style.line.color !== undefined) {
                        layer.style.line.color = numToHexColor(layerConfig.style.line.color);
                    }
                    if (layerConfig.style.line.width !== undefined) {
                        layer.style.line.width = layerConfig.style.line.width;
                    }
                    if (layerConfig.style.line.pattern !== undefined) {
                        // 转换线型模式：1 为空，2 为实线，3 为虚线
                        switch (layerConfig.style.line.pattern) {
                            case 1:
                                layer.style.line.lineDash = [];
                                break;
                            case 2:
                                layer.style.line.lineDash = [];
                                break;
                            case 3:
                                layer.style.line.lineDash = [5, 5];
                                break;
                            default:
                                layer.style.line.lineDash = [];
                        }
                    }
                }
                
                // 处理面样式
                if (layerConfig.style.fill) {
                    if (layerConfig.style.fill.foreground !== undefined) {
                        const fillColor = numToHexColor(layerConfig.style.fill.foreground);
                        layer.style.polygon.fillColor = fillColor + '40'; // 40 是 64 的十六进制，表示 25% 透明度
                        layer.style.polygon.strokeColor = fillColor;
                    }
                    if (layerConfig.style.fill.background !== undefined) {
                        // 背景色暂时不使用
                    }
                }
            }
            
            // 加载 GeoJSON 数据
            if (layerConfig.geojson_path) {
                let geojsonUrl = layerConfig.geojson_path;
                // 如果不是绝对路径，使用 geojson_base_path
                if (!geojsonUrl.startsWith('http://') && !geojsonUrl.startsWith('https://') && !geojsonUrl.startsWith('/')) {
                    geojsonUrl = geojsonBasePath + geojsonUrl;
                }
                
                loadGeoJSONFromUrl(layer, geojsonUrl);
            }
            
            // 添加图层到数组（保持导入顺序）
            mapData.layers.push(layer);
        });
    }
    
    // 设置当前图层
    if (mapData.layers.length > 0) {
        mapData.currentLayer = mapData.layers[0];
    }
    
    // 根据 JSON 配置设置地图初始位置和视野
    if (config.map_center) {
        const centerLon = config.map_center[0];
        const centerLat = config.map_center[1];
        
        // 计算中心点的像素位置
        const centerPixel = lonLatToPixel(centerLon, centerLat, canvas.width, canvas.height);
        
        // 调整偏移量，使中心点位于窗口中心
        mapData.offsetX = canvas.width / 2 - centerPixel.x;
        mapData.offsetY = canvas.height / 2 - centerPixel.y;
        
        console.log('设置地图中心位置:', centerLon, centerLat);
    }
    
    // 根据 camera_altitude_km 设置视野宽度
    if (config.camera_altitude_km) {
        // 计算合适的缩放级别
        // 高度与缩放级别成反比
        const altitude = config.camera_altitude_km;
        // 调整缩放计算比例，确保地图不会缩成一团
        // 高度越高，缩放级别越小，但保持在合理范围内
        const scale = Math.max(0.1, Math.min(10, 50 / altitude));
        mapData.scale = scale;
        
        console.log('设置地图视野高度:', altitude, 'km, 缩放级别:', scale);
    }
    
    updateLayerList();
    updateStats();
    renderMap();
    
    console.log('图层配置加载完成，共加载', mapData.layers.length, '个图层');
}

/**
 * 从 URL 加载 GeoJSON 数据到指定图层
 * @param {Object} layer - 图层对象
 * @param {string} url - GeoJSON 数据 URL
 */
function loadGeoJSONFromUrl(layer, url) {
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('网络请求失败：' + response.status);
            }
            return response.json();
        })
        .then(geojson => {
            if (geojson.type === 'FeatureCollection') {
                layer.features = geojson.features;
            } else if (geojson.type === 'Feature') {
                layer.features = [geojson];
            }
            updateLayerList();
            updateStats();
            renderMap();
            console.log('GeoJSON 数据加载完成:', url, '要素数量:', layer.features.length);
        })
        .catch(error => {
            console.error('加载 GeoJSON 失败:', error.message);
        });
}

// ============================================
// 程序入口
// ============================================

// 页面加载完成后初始化
window.onload = init;

// ============================================
// 视图状态管理工具（OpenLayers 风格）
// ============================================

/**
 * 获取当前视图状态（用于保存和恢复）
 * @returns {Object} 视图状态对象 {center, scale, rotation}
 */
function getViewState() {
    const center = getMapCenter();
    return {
        center: { lon: center.lon, lat: center.lat },
        scale: mapData.scale,
        rotation: 0 // 当前不支持旋转，预留接口
    };
}

/**
 * 设置视图状态（从保存的状态恢复）
 * @param {Object} state - 视图状态对象
 */
function setViewState(state) {
    if (state.center) {
        setMapCenter(state.center.lon, state.center.lat);
    }
    if (state.scale) {
        mapData.scale = state.scale;
    }
    renderMap();
}

/**
 * 平移到指定坐标（不改变缩放级别）
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 */
function panTo(lon, lat) {
    setMapCenter(lon, lat);
    renderMap();
}

/**
 * 飞行动画到指定坐标（预留接口）
 * 未来可以实现平滑过渡动画
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 * @param {number} zoom - 缩放级别
 */
function flyTo(lon, lat, zoom) {
    // 简单实现：直接设置视图
    if (zoom !== undefined) {
        mapData.scale = zoom;
    }
    setMapCenter(lon, lat);
    renderMap();
}
