let map;
let thematicLayers = []; // 支持多个专题图层
let baseProvinceLayer;
let geoJsonData = {};
let isPanelOpen = false;
let currentBreaks = [];
let currentData = []; // 保存当前加载的数据
let currentLayerId = 0; // 当前图层ID
let currentLegendLayerId = null; // 记录当前图例对应的图层ID

// 时间轴相关变量
let timelineFields = []; // 年份字段列表
let selectedTimelineIndices = []; // 选中的字段索引列表
let currentTimelineIndex = 0; // 当前时间轴索引
let timelineInterval = null; // 播放定时器
let isTimelinePlaying = false; // 是否正在播放
let timelineGlobalBreaks = []; // 时间轴模式下全局统一的分级断点

// 轴拖动相关变量
let isDragging = false;
let isAxisDragging = false;
let dragIndex = -1;
let dragTrack = null;
let axisDragLegendElement = null;

// 图例面板拖动相关变量
let isDraggingLegendPanel = false;
let legendPanelStartX = 0;
let legendPanelStartY = 0;
let legendPanelStartLeft = 0;
let legendPanelStartTop = 0;

// 单个图例拖动相关变量（保留用于旧功能兼容）
let isDraggingLegend = false;
let dragLegendElement = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartLeft = 0;
let dragStartTop = 0;
let hasMoved = false; // 标记是否真正发生了移动

function getCurrentThematicLayer() {
    if (thematicLayers.length === 0) return null;
    return thematicLayers[thematicLayers.length - 1];
}

function createLayerLegend(layerId, layerName, breaks, colorScale, classCount) {
    const container = document.getElementById('legendAxesContainer');
    const template = document.getElementById('legendAxisTemplate');
    
    if (!template) {
        console.error('[Debug] Legend template not found');
        return null;
    }
    
    if (thematicLayers.length > 5) {
        console.warn('[Debug] Maximum 5 legends allowed');
        return null;
    }
    
    const legendClone = template.content.cloneNode(true);
    const legendElement = legendClone.querySelector('.legend-axis');
    
    legendElement.dataset.layerId = layerId;
    legendElement.querySelector('.axis-title').textContent = layerName;
    legendElement.querySelector('.axis-class-count').textContent = `${classCount}级`;
    
    container.appendChild(legendClone);
    
    updateLegendContent(legendElement, breaks, colorScale, classCount);
    
    setActiveLegend(legendElement);
    
    return legendElement;
}

function updateLegendContent(legendElement, breaks, colorScale, classCount) {
    if (!legendElement) return;
    
    const container = legendElement.querySelector('.axis-container');
    const track = legendElement.querySelector('.axis-track');
    const labelMax = legendElement.querySelector('.axis-label-max');
    const labelMin = legendElement.querySelector('.axis-label-min');
    const classCountEl = legendElement.querySelector('.axis-class-count');
    
    container.innerHTML = '';
    track.innerHTML = '';
    container.appendChild(track);
    
    if (breaks.length === 0) return;
    
    labelMax.textContent = formatNumber(breaks[breaks.length - 1] || 0);
    labelMin.textContent = formatNumber(breaks[0] || 0);
    
    if (classCountEl) {
        classCountEl.textContent = `${classCount}级`;
    }
    
    const min = breaks[0];
    const max = breaks[breaks.length - 1];
    const range = max - min;

    const colorScheme = getCurrentColorScheme();
    
    if (colorScheme === 'size_only') {
        const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
        const minSize = pointSize * 0.2;
        const maxSize = pointSize * 2.5;
        
        const sizeLegend = document.createElement('div');
        sizeLegend.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 0;';
        
        const smallDot = document.createElement('div');
        smallDot.style.cssText = `width: ${minSize*2}px; height: ${minSize*2}px; background: rgb(66, 146, 198); border-radius: 50%;`;
        const smallLabel = document.createElement('span');
        smallLabel.textContent = '小';
        smallLabel.style.cssText = 'font-size: 12px; color: #666; margin-left: 5px;';
        
        const leftContainer = document.createElement('div');
        leftContainer.style.cssText = 'display: flex; align-items: center;';
        leftContainer.appendChild(smallDot);
        leftContainer.appendChild(smallLabel);
        sizeLegend.appendChild(leftContainer);
        
        const largeDot = document.createElement('div');
        largeDot.style.cssText = `width: ${maxSize*2}px; height: ${maxSize*2}px; background: rgb(66, 146, 198); border-radius: 50%;`;
        const largeLabel = document.createElement('span');
        largeLabel.textContent = '大';
        largeLabel.style.cssText = 'font-size: 12px; color: #666; margin-right: 5px;';
        
        const rightContainer = document.createElement('div');
        rightContainer.style.cssText = 'display: flex; align-items: center;';
        rightContainer.appendChild(largeLabel);
        rightContainer.appendChild(largeDot);
        sizeLegend.appendChild(rightContainer);
        
        container.appendChild(sizeLegend);
        
        track.style.height = '20px';
        track.style.marginTop = '5px';
        
        const segment = document.createElement('div');
        segment.className = 'axis-segment';
        segment.style.left = '0%';
        segment.style.width = '100%';
        segment.style.backgroundColor = 'rgb(66, 146, 198)';
        track.appendChild(segment);
    } else {
        for (let i = 0; i < classCount; i++) {
            const color = colorScale[i] || [200, 200, 200];
            const segment = document.createElement('div');
            segment.className = 'axis-segment';
            
            const startPercent = range > 0 ? ((breaks[i] - min) / range) * 100 : (i / classCount) * 100;
            const endPercent = range > 0 ? ((breaks[i + 1] - min) / range) * 100 : ((i + 1) / classCount) * 100;
            
            segment.style.left = `${startPercent}%`;
            segment.style.width = `${endPercent - startPercent}%`;
            segment.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            track.appendChild(segment);
        }
    }
    
    for (let i = 0; i < breaks.length; i++) {
        const marker = document.createElement('div');
        marker.className = 'axis-marker';
        const percent = range > 0 ? ((breaks[i] - min) / range) * 100 : (i / classCount) * 100;
        marker.style.left = `${percent}%`;
        track.appendChild(marker);
        
        const handle = document.createElement('div');
        handle.className = 'axis-handle';
        if (i === 0 || i === breaks.length - 1) {
            handle.classList.add('fixed');
        }
        handle.dataset.index = i;
        handle.style.left = `${percent}%`;
        
        const label = document.createElement('div');
        label.className = 'axis-handle-label';
        label.textContent = formatNumber(breaks[i]);
        handle.appendChild(label);
        
        if (i > 0 && i < breaks.length - 1) {
            handle.addEventListener('mousedown', startAxisDrag);
            handle.addEventListener('touchstart', startAxisDrag, { passive: false });
        }
        
        track.appendChild(handle);
    }
}

function setActiveLegend(legendElement) {
    document.querySelectorAll('.legend-axis').forEach(el => {
        el.classList.remove('active');
    });
    
    if (legendElement) {
        legendElement.classList.add('active');
        currentLegendLayerId = parseInt(legendElement.dataset.layerId);
    }
}

function getActiveLegend() {
    return document.querySelector('.legend-axis.active');
}

function toggleLegendCollapse(legendElement) {
    if (!legendElement) return;
    
    // 如果正在拖动或刚刚拖动过，不要执行折叠
    if (isDraggingLegend || hasMoved) return;
    
    const wasActive = legendElement.classList.contains('active');
    
    legendElement.classList.toggle('collapsed');
    
    if (!wasActive) {
        setActiveLegend(legendElement);
    }
}

/**
 * 计算多边形的面积（用于找出最大图斑）
 */
function calculatePolygonArea(coordinates) {
    let area = 0;
    const ring = coordinates[0];
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(area / 2);
}

/**
 * 找到面积最大的多边形（最本土图斑）
 */
function findLargestPolygon(geometry) {
    let largestCoords = null;
    let maxArea = 0;
    
    if (geometry.getType() === 'MultiPolygon') {
        const polygons = geometry.getPolygons();
        for (const polygon of polygons) {
            const coords = polygon.getCoordinates();
            const area = calculatePolygonArea(coords);
            if (area > maxArea) {
                maxArea = area;
                largestCoords = coords;
            }
        }
    } else if (geometry.getType() === 'Polygon') {
        largestCoords = geometry.getCoordinates();
    }
    
    return largestCoords;
}

/**
 * 计算多边形的质心
 */
function calculateCentroid(coordinates) {
    const ring = coordinates[0];
    let area = 0;
    let cx = 0;
    let cy = 0;
    
    for (let i = 0; i < ring.length - 1; i++) {
        const x1 = ring[i][0];
        const y1 = ring[i][1];
        const x2 = ring[i + 1][0];
        const y2 = ring[i + 1][1];
        const cross = x1 * y2 - x2 * y1;
        area += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    
    area /= 2;
    cx /= (6 * area);
    cy /= (6 * area);
    
    return [cx, cy];
}

/**
 * 确保点在多边形内部（如果质心不在内部，使用polylabel找内部点）
 * 简化版：如果质心不在内部，使用多边形的第一个内环点或边界上的点
 */
function getPointInsidePolygon(coordinates, centroid) {
    const polygon = new ol.geom.Polygon(coordinates);
    const point = new ol.geom.Point(centroid);
    
    if (polygon.intersectsCoordinate(centroid)) {
        return centroid;
    }
    
    // 如果质心在外部，使用polylabel算法找内部点（简化版）
    // 这里用一个简化方法：取多边形边缘的中点
    const ring = coordinates[0];
    const midIdx = Math.floor(ring.length / 2);
    return ring[midIdx];
}

/**
 * 获取最合适的国家中心点
 */
function getCountryCenter(geometry) {
    const largestCoords = findLargestPolygon(geometry);
    if (!largestCoords) {
        return ol.extent.getCenter(geometry.getExtent());
    }
    
    let centroid = calculateCentroid(largestCoords);
    centroid = getPointInsidePolygon(largestCoords, centroid);
    
    return centroid;
}

const colorSchemes = {
    blue: [
        [247, 251, 255], [222, 235, 247], [198, 219, 239],
        [158, 202, 225], [107, 174, 214], [66, 146, 198],
        [33, 113, 181], [8, 81, 156], [8, 48, 107]
    ],
    orange: [
        [255, 247, 237], [254, 230, 206], [253, 208, 162],
        [253, 174, 107], [253, 141, 60], [230, 85, 13],
        [179, 70, 38], [127, 39, 4], [102, 37, 6]
    ],
    purple: [
        [245, 243, 250], [231, 225, 239], [212, 197, 224],
        [188, 158, 204], [158, 118, 183], [128, 80, 161],
        [101, 54, 135], [65, 33, 89], [40, 11, 54]
    ],
    coolwarm: [
        [44, 123, 182], [96, 165, 206], [145, 200, 222],
        [209, 229, 240], [255, 255, 255], [253, 219, 199],
        [244, 165, 130], [214, 96, 77], [165, 15, 21]
    ],
    viridis: [
        [68, 1, 84], [59, 28, 110], [49, 52, 133], [38, 76, 149],
        [33, 97, 152], [34, 120, 147], [39, 141, 139],
        [58, 165, 119], [94, 188, 92], [144, 208, 58], [222, 226, 31]
    ],
    heatmap: [
        [255, 255, 204], [255, 237, 160], [254, 217, 118],
        [254, 178, 76], [253, 141, 60], [252, 78, 42],
        [227, 26, 28], [189, 0, 38], [128, 0, 38]
    ],
    rainbow: [
        [158, 1, 66], [213, 62, 79], [244, 109, 67],
        [253, 174, 97], [254, 224, 139], [255, 255, 191],
        [230, 245, 152], [171, 221, 164], [102, 194, 165],
        [50, 136, 189], [94, 79, 162]
    ],
    gray: [
        [255, 255, 255], [230, 230, 230], [204, 204, 204],
        [178, 178, 178], [152, 152, 152], [127, 127, 127],
        [102, 102, 102], [76, 76, 76], [51, 51, 51]
    ],
    greenred: [
        [26, 152, 80], [102, 189, 99], [166, 217, 106],
        [217, 239, 139], [255, 255, 191], [254, 224, 139],
        [253, 174, 97], [252, 124, 69], [215, 48, 39]
    ],
    size_only: [
        [66, 146, 198], [66, 146, 198], [66, 146, 198],
        [66, 146, 198], [66, 146, 198], [66, 146, 198],
        [66, 146, 198], [66, 146, 198], [66, 146, 198]
    ],
    tableau10: [
        [78, 121, 167], [242, 142, 43], [225, 87, 89],
        [118, 183, 178], [153, 107, 167], [156, 158, 55],
        [237, 139, 193], [94, 94, 94], [176, 122, 89],
        [129, 184, 120], [191, 144, 0], [64, 120, 184]
    ],
    okabe: [
        [0, 0, 0], [230, 159, 0], [86, 180, 233], [0, 158, 115],
        [240, 228, 66], [0, 114, 178], [213, 94, 0], [204, 121, 167]
    ],
    spectral: [
        [158, 1, 66], [213, 62, 79], [244, 109, 67], [253, 141, 60],
        [254, 174, 97], [254, 224, 139], [255, 255, 191],
        [230, 245, 152], [171, 221, 164], [102, 194, 165],
        [50, 136, 189], [94, 79, 162]
    ],
    category3: [
        [215, 48, 39], [254, 224, 139], [26, 152, 80]
    ]
};

const classifyMethods = {
    equalInterval: function(values, classes) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const breaks = [];
        const step = (max - min) / classes;
        for (let i = 0; i <= classes; i++) {
            breaks.push(min + step * i);
        }
        return breaks;
    },
    
    quantile: function(values, classes) {
        const sorted = [...values].sort((a, b) => a - b);
        const breaks = [];
        for (let i = 0; i <= classes; i++) {
            const index = Math.floor(i * (sorted.length - 1) / classes);
            breaks.push(sorted[index]);
        }
        return breaks;
    },
    
    naturalBreaks: function(values, classes) {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;

        if (n <= classes) {
            const breaks = [sorted[0]];
            for (let i = 1; i < n; i++) {
                breaks.push(sorted[i]);
            }
            while (breaks.length <= classes) {
                breaks.push(sorted[n - 1]);
            }
            return breaks;
        }

        let matrix = [];
        let backtrack = [];

        for (let i = 0; i <= n; i++) {
            matrix[i] = [];
            backtrack[i] = [];
            for (let j = 0; j <= classes; j++) {
                matrix[i][j] = Infinity;
                backtrack[i][j] = 0;
            }
        }

        matrix[0][0] = 0;

        for (let l = 1; l <= n; l++) {
            let sum = 0;
            let sumSq = 0;

            for (let m = 1; m <= l; m++) {
                sum += sorted[l - m];
                sumSq += sorted[l - m] * sorted[l - m];
                const variance = sumSq - (sum * sum) / m;

                for (let k = 1; k <= classes; k++) {
                    if (matrix[l - m][k - 1] + variance < matrix[l][k]) {
                        matrix[l][k] = matrix[l - m][k - 1] + variance;
                        backtrack[l][k] = l - m;
                    }
                }
            }
        }

        const breaks = [];
        let k = n;
        for (let j = classes; j > 0; j--) {
            breaks.unshift(sorted[k - 1]);
            k = backtrack[k][j];
        }
        breaks.unshift(sorted[0]);

        return breaks;
    },

    proportional: function(values, classes) {
        return [0, 20, 40, 60, 80, 100];
    },

    normalized: function(values, classes) {
        return [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    },

    relative: function(values, classes) {
        const absValues = values.map(v => Math.abs(v)).filter(v => !isNaN(v) && isFinite(v));
        const maxAbs = absValues.length > 0 ? Math.max(...absValues) : 1;
        const breaks = [];
        const step = (2 * maxAbs) / classes;
        for (let i = 0; i <= classes; i++) {
            breaks.push(-maxAbs + step * i);
        }
        return breaks;
    },

    globalEqualInterval: function(values, classes) {
        const filtered = values.filter(v => !isNaN(v) && isFinite(v));
        if (filtered.length === 0) return [0, 1];
        const min = Math.min(...filtered);
        const max = Math.max(...filtered);
        const breaks = [];
        const step = (max - min) / classes;
        for (let i = 0; i <= classes; i++) {
            breaks.push(min + step * i);
        }
        return breaks;
    },

    globalQuantile: function(values, classes) {
        const filtered = values.filter(v => !isNaN(v) && isFinite(v));
        const sorted = [...filtered].sort((a, b) => a - b);
        if (sorted.length === 0) return [0, 1];
        const breaks = [];
        for (let i = 0; i <= classes; i++) {
            const index = Math.floor(i * (sorted.length - 1) / classes);
            breaks.push(sorted[index]);
        }
        return breaks;
    },

    globalNaturalBreaks: function(values, classes) {
        const filtered = values.filter(v => !isNaN(v) && isFinite(v));
        if (filtered.length <= classes) {
            const sorted = [...filtered].sort((a, b) => a - b);
            if (sorted.length === 0) return [0, 1];
            const breaks = [sorted[0]];
            for (let i = 1; i < sorted.length; i++) {
                breaks.push(sorted[i]);
            }
            while (breaks.length <= classes) {
                breaks.push(sorted[sorted.length - 1]);
            }
            return breaks;
        }
        return classifyMethods.naturalBreaks(filtered, classes);
    }
};

let baseMapLayers = { esri: null, vec: null, cva: null };

// 检查是否在 lzywhy.com 域名下运行
function isOnLzywhyDomain() {
    const hostname = window.location.hostname;
    return hostname === 'lzywhy.com' || hostname.endsWith('.lzywhy.com');
}

function initMap() {
    console.log('[Debug] initMap() called');
    try {
        console.log('[Debug] Creating OpenLayers map...');
        
        // 初始化底图
        baseMapLayers.esri = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                crossOrigin: 'anonymous',
                maxZoom: 19
            })
        });
        
        baseMapLayers.vec = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: `https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
                crossOrigin: 'anonymous',
                tileSize: 256,
                zoomOffset: 1
            })
        });
        
        baseMapLayers.cva = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: `https://t0.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileMatrix={z}&TileCol={x}&TileRow={y}&tk=${TIANDITU_KEY}`,
                crossOrigin: 'anonymous',
                tileSize: 256,
                zoomOffset: 1
            })
        });
        
        const initialLayers = [];
        
        // 根据域名选择底图
        if (isOnLzywhyDomain()) {
            baseMapLayers.esri.setVisible(false);
            initialLayers.push(baseMapLayers.vec);
            initialLayers.push(baseMapLayers.cva);
        } else {
            baseMapLayers.esri.setVisible(true);
            initialLayers.push(baseMapLayers.esri);
        }
        
        map = new ol.Map({
            target: 'map',
            layers: initialLayers,
            view: new ol.View({
                center: ol.proj.fromLonLat([104.1954, 35.8617]),
                zoom: 4
            })
        });
        console.log('[Debug] Map created successfully!');
    } catch (error) {
        console.error('[Debug] Error creating map:', error);
    }
}

function togglePanel() {
    const panel = document.getElementById('controlPanel');
    isPanelOpen = !isPanelOpen;
    
    if (window.innerWidth <= 600) {
        // 手机端使用过渡动画
        if (isPanelOpen) {
            panel.style.display = 'block';
            panel.style.animation = 'slideUp 0.3s ease-out';
        } else {
            panel.style.animation = 'slideDown 0.3s ease-in';
            setTimeout(() => {
                panel.style.display = 'none';
            }, 300);
        }
    } else {
        panel.style.display = isPanelOpen ? 'block' : 'none';
    }
}

function updateSliderDisplay(sliderId, valueId, unit) {
    const slider = document.getElementById(sliderId);
    const value = document.getElementById(valueId);
    value.textContent = slider.value + unit;
}

async function loadTables() {
    console.log('[Debug] loadTables() called');
    const token = localStorage.getItem('access_token');
    if (!token) {
        document.getElementById('tableSelect').innerHTML = '<option value="">需要登录后使用</option>';
        document.getElementById('fieldSelect').innerHTML = '<option value="">请先登录</option>';
        return;
    }
    try {
        const url = `${API_BASE_URL}/api/thematic/tables`;
        console.log('[Debug] Fetching tables from:', url);
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        console.log('[Debug] Response status:', response.status);
        
        if (!response.ok) {
            document.getElementById('tableSelect').innerHTML = '<option value="">登录已过期，请重新登录</option>';
            return;
        }
        
        const tables = await response.json();
        console.log('[Debug] Tables received:', tables);
        
        const select = document.getElementById('tableSelect');
        select.innerHTML = '<option value="">请选择数据表</option>';
        tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table.name;
            option.textContent = table.label;
            select.appendChild(option);
        });
        console.log('[Debug] Tables loaded into dropdown');
    } catch (error) {
        console.error('[Debug] 加载数据表失败:', error);
        alert('加载数据表失败: ' + error.message);
    }
}

async function onTableChange() {
    console.log('[Debug] onTableChange() called');
    const tableName = document.getElementById('tableSelect').value;
    console.log('[Debug] Selected table:', tableName);
    
    if (!tableName) {
        document.getElementById('fieldSelect').innerHTML = '<option value="">请先选择数据表</option>';
        document.getElementById('expressionSection').style.display = 'none';
        // 清空多字段面板
        const multiFieldList = document.getElementById('multiFieldList');
        if (multiFieldList) multiFieldList.innerHTML = '';
        if (typeof selectedMultiFields !== 'undefined') selectedMultiFields = [];
        hideTimeline();
        return;
    }
    
    try {
        const url = `${API_BASE_URL}/api/thematic/fields/${tableName}`;
        console.log('[Debug] Fetching fields from:', url);
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        console.log('[Debug] Fields response status:', response.status);
        
        const fields = await response.json();
        console.log('[Debug] Fields received:', fields);
        
        const select = document.getElementById('fieldSelect');
        select.innerHTML = '<option value="">请选择字段</option><option value="expression">📊 使用表达式</option>';
        fields.forEach(field => {
            if (field.type === 'REAL' || field.type === 'INTEGER') {
                const option = document.createElement('option');
                option.value = field.name;
                option.textContent = `${field.label} (${field.unit || ''})`;
                select.appendChild(option);
            }
        });
        console.log('[Debug] Fields loaded into dropdown');
        
        // 重置多字段选择并更新面板
        selectedMultiFields = [];
        updateMultiFieldPanel(fields);
        
        // 更新可用字段按钮
        updateFieldButtons(fields);
        
        // 检测年份字段并创建时间轴
        detectTimelineFields(fields);
    } catch (error) {
        console.error('[Debug] 加载字段失败:', error);
        alert('加载字段失败: ' + error.message);
    }
}

function detectTimelineFields(fields) {
    // 检测年份字段（匹配格式：2020年、2020、产量_2020等）
    const yearFieldRegex = /(\d{4})年?|_(\d{4})/;
    timelineFields = fields
        .filter(f => f.type === 'REAL' || f.type === 'INTEGER')
        .filter(f => yearFieldRegex.test(f.name) || yearFieldRegex.test(f.label))
        .sort((a, b) => {
            const yearA = extractYear(a.name) || extractYear(a.label);
            const yearB = extractYear(b.name) || extractYear(b.label);
            return yearA - yearB;
        });
    
    console.log('[Timeline] Detected timeline fields:', timelineFields.map(f => f.name));
    
    if (timelineFields.length >= 2) {
        showTimeline();
    } else {
        hideTimeline();
    }
    
    return timelineFields;
}

function extractYear(str) {
    const match = str.match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
}

function showTimeline() {
    const timelineContainer = document.getElementById('timelineContainer');
    if (!timelineContainer) {
        createTimeline();
        return;
    }
    
    // 默认全选所有字段
    selectedTimelineIndices = timelineFields.map((_, index) => index);
    
    // 更新字段选择面板
    updateFieldSelectionPanel();
    
    const slider = document.getElementById('timelineSlider');
    slider.min = 0;
    slider.max = timelineFields.length - 1;
    slider.value = 0;
    currentTimelineIndex = 0;
    
    // 更新时间显示
    updateTimelineDisplay();
    
    timelineContainer.style.display = 'block';
}

function hideTimeline() {
    const timelineContainer = document.getElementById('timelineContainer');
    if (timelineContainer) {
        timelineContainer.style.display = 'none';
    }
    // 停止播放
    stopTimeline();
}

function createTimeline() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    const timelineHTML = `
        <div id="timelineContainer" style="display: none; position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); z-index: 200; 
            background: rgba(255, 255, 255, 0.95); border-radius: 10px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); 
            padding: 12px 20px; min-width: 500px; max-width: 700px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 14px; font-weight: 600; color: #666;">⏱️ 时间轴</span>
                <span id="timelineYearDisplay" style="font-weight: 600; color: #1890ff; font-size: 16px; min-width: 60px;"></span>
                
                <button id="timelinePrevBtn" onclick="prevTimeline()" 
                    style="width: 30px; height: 30px; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; 
                           font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                    ⏮
                </button>
                <button id="timelinePlayBtn" onclick="toggleTimelinePlay()" 
                    style="width: 30px; height: 30px; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; 
                           font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                    ▶
                </button>
                <button id="timelineNextBtn" onclick="nextTimeline()" 
                    style="width: 30px; height: 30px; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; 
                           font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                    ⏭
                </button>
                
                <div style="flex: 1; margin: 0 10px;">
                    <input type="range" id="timelineSlider" oninput="onTimelineChange()" 
                        style="width: 100%; height: 6px; border-radius: 3px; background: #ddd; outline: none; cursor: pointer;
                               -webkit-appearance: none;">
                    <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #999;">
                        <span>${extractYear(timelineFields[0].name) || extractYear(timelineFields[0].label)}</span>
                        <span>${extractYear(timelineFields[timelineFields.length-1].name) || extractYear(timelineFields[timelineFields.length-1].label)}</span>
                    </div>
                </div>
                
                <button id="timelineFieldsBtn" onclick="toggleFieldSelection()" 
                    style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; cursor: pointer; 
                           font-size: 12px; color: #666; transition: all 0.2s;">
                    字段选择 ▼
                </button>
            </div>
            
            <!-- 字段选择面板 -->
            <div id="timelineFieldPanel" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
                <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px;">
                    <button onclick="selectAllTimelineFields()" 
                        style="padding: 4px 8px; font-size: 11px; border: 1px solid #1890ff; border-radius: 3px; 
                               background: white; color: #1890ff; cursor: pointer;">
                        全选
                    </button>
                    <button onclick="deselectAllTimelineFields()" 
                        style="padding: 4px 8px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; 
                               background: white; color: #666; cursor: pointer;">
                        全不选
                    </button>
                </div>
                <div id="timelineFieldList" style="max-height: 120px; overflow-y: auto; display: flex; flex-wrap: gap: 8px;">
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', timelineHTML);
}

function toggleFieldSelection() {
    const panel = document.getElementById('timelineFieldPanel');
    const btn = document.getElementById('timelineFieldsBtn');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        btn.innerHTML = '字段选择 ▲';
    } else {
        panel.style.display = 'none';
        btn.innerHTML = '字段选择 ▼';
    }
}

function updateFieldSelectionPanel() {
    const container = document.getElementById('timelineFieldList');
    if (!container) return;
    
    container.innerHTML = '';
    
    timelineFields.forEach((field, index) => {
        const year = extractYear(field.name) || extractYear(field.label);
        const isSelected = selectedTimelineIndices.includes(index);
        
        const checkbox = document.createElement('label');
        checkbox.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px; 
            padding: 4px 8px; margin: 2px; background: #f8f9fa; 
            border-radius: 4px; cursor: pointer; font-size: 12px;
        `;
        
        checkbox.innerHTML = `
            <input type="checkbox" ${isSelected ? 'checked' : ''} 
                   onchange="toggleTimelineField(${index})" 
                   style="width: 14px; height: 14px;">
            <span>${year || field.name}</span>
        `;
        
        container.appendChild(checkbox);
    });
}

function toggleTimelineField(index) {
    const idx = selectedTimelineIndices.indexOf(index);
    if (idx > -1) {
        selectedTimelineIndices.splice(idx, 1);
    } else {
        selectedTimelineIndices.push(index);
        selectedTimelineIndices.sort((a, b) => a - b);
    }
    
    // 如果取消了当前选中的字段，切换到第一个选中的字段
    if (!selectedTimelineIndices.includes(currentTimelineIndex) && selectedTimelineIndices.length > 0) {
        currentTimelineIndex = selectedTimelineIndices[0];
        document.getElementById('timelineSlider').value = currentTimelineIndex;
        updateTimelineDisplay();
        updateTimelineLayer();
    }
    
    // 如果没有选中任何字段，停止播放
    if (selectedTimelineIndices.length === 0) {
        stopTimeline();
    }
}

function selectAllTimelineFields() {
    selectedTimelineIndices = timelineFields.map((_, index) => index);
    updateFieldSelectionPanel();
}

function deselectAllTimelineFields() {
    selectedTimelineIndices = [];
    updateFieldSelectionPanel();
    stopTimeline();
}

function updateTimelineDisplay() {
    const yearDisplay = document.getElementById('timelineYearDisplay');
    const currentField = timelineFields[currentTimelineIndex];
    const year = extractYear(currentField.name) || extractYear(currentField.label);
    yearDisplay.textContent = year ? `${year}年` : currentField.name;
}

function onTimelineChange() {
    const slider = document.getElementById('timelineSlider');
    currentTimelineIndex = parseInt(slider.value);
    updateTimelineDisplay();
    
    // 如果有活跃的专题图层，更新为当前年份字段
    updateTimelineLayer();
}

function prevTimeline() {
    if (selectedTimelineIndices.length === 0) return;
    
    const currentPos = selectedTimelineIndices.indexOf(currentTimelineIndex);
    if (currentPos > 0) {
        currentTimelineIndex = selectedTimelineIndices[currentPos - 1];
        document.getElementById('timelineSlider').value = currentTimelineIndex;
        updateTimelineDisplay();
        updateTimelineLayer();
    }
}

function nextTimeline() {
    if (selectedTimelineIndices.length === 0) return;
    
    const currentPos = selectedTimelineIndices.indexOf(currentTimelineIndex);
    if (currentPos < selectedTimelineIndices.length - 1) {
        currentTimelineIndex = selectedTimelineIndices[currentPos + 1];
        document.getElementById('timelineSlider').value = currentTimelineIndex;
        updateTimelineDisplay();
        updateTimelineLayer();
    } else {
        // 播放到最后，停止播放
        stopTimeline();
    }
}

function toggleTimelinePlay() {
    if (isTimelinePlaying) {
        stopTimeline();
    } else {
        startTimeline();
    }
}

function startTimeline() {
    if (selectedTimelineIndices.length === 0) return;
    
    isTimelinePlaying = true;
    document.getElementById('timelinePlayBtn').textContent = '⏸';
    
    timelineInterval = setInterval(() => {
        const currentPos = selectedTimelineIndices.indexOf(currentTimelineIndex);
        if (currentPos < selectedTimelineIndices.length - 1) {
            nextTimeline();
        } else {
            // 循环播放 - 回到第一个选中的字段
            currentTimelineIndex = selectedTimelineIndices[0];
            document.getElementById('timelineSlider').value = currentTimelineIndex;
            updateTimelineDisplay();
            updateTimelineLayer();
        }
    }, 2000); // 每2秒切换一次
}

function stopTimeline() {
    isTimelinePlaying = false;
    if (timelineInterval) {
        clearInterval(timelineInterval);
        timelineInterval = null;
    }
    const playBtn = document.getElementById('timelinePlayBtn');
    if (playBtn) {
        playBtn.textContent = '▶';
    }
}

function updateTimelineLayer() {
    if (thematicLayers.length > 0 && timelineFields.length > 0) {
        const currentField = timelineFields[currentTimelineIndex];
        console.log('[Timeline] Updating layer to field:', currentField.name);

        const tableName = document.getElementById('tableSelect').value;
        const level = document.getElementById('levelSelect').value;

        if (tableName) {
            const view = map.getView();
            const center = view.getCenter();
            const zoom = view.getZoom();
            const rotation = view.getRotation();

            removeAllThematicLayers();

            loadGeoJson(level).then(geoJson => {
                fetch(`${API_BASE_URL}/api/thematic/data/${tableName}`, {
                    headers: getAuthHeaders()
                }).then(dataRes => dataRes.json()).then(data => {
                    let styledFeatures;
                    // 使用全局统一的 breaks（时间轴模式下保持一致的配色
                    if (timelineGlobalBreaks && timelineGlobalBreaks.length > 0) {
                        styledFeatures = createStyledFeaturesWithBreaks(geoJson, data.data, currentField.name, level, timelineGlobalBreaks);
                    } else {
                        styledFeatures = createStyledFeatures(geoJson, data.data, currentField.name, level);
                    }

                    const newLayer = new ol.layer.Vector({
                        source: new ol.source.Vector({
                            features: styledFeatures
                        }),
                        style: function(feature) {
                            return feature.getStyle();
                        },
                        zIndex: 10
                    });

                    newLayer.set('layerId', 1);
                    newLayer.set('name', `${currentField.name} (时间轴)`);
                    newLayer.set('timelineMode', true);
                    newLayer.set('fieldName', currentField.name);
                    thematicLayers.push(newLayer);
                    map.addLayer(newLayer);

                    view.setCenter(center);
                    view.setZoom(zoom);
                    view.setRotation(rotation);

                    updateLayerList();
                });
            });
        }
    }
}

function updateFieldButtons(fields) {
    const container = document.getElementById('expressionSection').querySelector('div:last-child');
    container.innerHTML = '';
    
    const numericFields = fields.filter(f => f.type === 'REAL' || f.type === 'INTEGER');
    numericFields.forEach(field => {
        const button = document.createElement('button');
        button.type = 'button';
        button.onclick = () => insertField(field.name);
        button.style.cssText = 'padding: 4px 8px; font-size: 12px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; margin: 2px;';
        button.textContent = field.name;
        container.appendChild(button);
    });
}

function insertField(fieldName) {
    const input = document.getElementById('expressionInput');
    input.value += fieldName;
    input.focus();
}

function onFieldChange() {
    const fieldSelect = document.getElementById('fieldSelect');
    const expressionSection = document.getElementById('expressionSection');
    
    if (fieldSelect.value === 'expression') {
        expressionSection.style.display = 'block';
    } else {
        expressionSection.style.display = 'none';
    }
}

function evaluateExpression(data, expression, resultFieldName = '表达式') {
    console.log('[Debug] evaluateExpression() called');
    console.log('[Debug] Original expression:', expression, 'Result field:', resultFieldName);
    
    const allFields = new Set();
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            const value = parseFloat(row[key]);
            if (!isNaN(value)) {
                allFields.add(key);
            }
        });
    });
    
    console.log('[Debug] Available fields:', Array.from(allFields));
    
    const result = data.map(row => {
        let expr = expression;
        
        allFields.forEach(field => {
            const value = parseFloat(row[field]);
            if (!isNaN(value)) {
                expr = expr.replace(new RegExp(field, 'g'), value);
            }
        });
        
        let resultValue;
        try {
            if (/^[\d+\-*/().\s]+$/.test(expr)) {
                resultValue = eval(expr);
            } else {
                console.warn('[Debug] Expression contains invalid characters:', expr);
                resultValue = null;
            }
        } catch (error) {
            console.error('[Debug] Expression evaluation error:', error);
            resultValue = null;
        }
        
        const newRow = { ...row };
        newRow[resultFieldName] = resultValue;
        
        return newRow;
    });
    
    return result;
}

async function loadGeoJson(level) {
    console.log('[Debug] loadGeoJson() called with level:', level);
    if (geoJsonData[level]) {
        console.log('[Debug] GeoJSON already loaded for level', level);
        return geoJsonData[level];
    }
    
    const fileMap = {
        'country': 'geojson/world.json',
        'province': 'geojson/chn-level-1.json',
        'city': 'geojson/chn-level-2.json'
    };
    
    const filePath = fileMap[level];
    console.log('[Debug] Loading GeoJSON from:', filePath);
    
    try {
        const response = await fetch(filePath);
        console.log('[Debug] GeoJSON response status:', response.status);
        
        const data = await response.json();
        console.log('[Debug] GeoJSON loaded, features count:', data.features ? data.features.length : 0);
        
        geoJsonData[level] = data;
        return data;
    } catch (error) {
        console.error('[Debug] 加载GeoJSON失败:', error);
        return null;
    }
}

function parseExpression(input) {
    const match = input.match(/^\((.+)\)"([^"]+)"/);
    if (match) {
        return {
            expr: match[1].trim(),
            name: match[2].trim()
        };
    }
    return {
        expr: input.trim(),
        name: '表达式'
    };
}

async function applyThematicLayer() {
    console.log('[Debug] applyThematicLayer() called');
    const tableName = document.getElementById('tableSelect').value;
    const level = document.getElementById('levelSelect').value;
    const overlayMode = document.getElementById('overlayMode')?.checked || false;
    
    // 获取当前渲染模式
    const renderMode = document.querySelector('input[name="renderMode"]:checked').value;
    
    let fieldName = '';
    let exprStr = '';
    let isExpression = false;
    
    // 根据渲染模式获取字段信息
    switch(renderMode) {
        case 'single':
            fieldName = document.getElementById('fieldSelect').value;
            if (!fieldName) {
                alert('请选择字段');
                return;
            }
            break;
        case 'expression':
            exprStr = document.getElementById('expressionInput').value;
            if (!exprStr) {
                alert('请输入表达式');
                return;
            }
            isExpression = true;
            const parsed = parseExpression(exprStr);
            exprStr = parsed.expr;
            fieldName = parsed.name;
            break;
        case 'multi':
            if (selectedMultiFields.length === 0) {
                alert('请选择至少一个字段');
                return;
            }
            fieldName = selectedMultiFields.join(',');
            break;
        case 'timeline':
            // 时间轴模式：检测年份字段并显示时间轴
            break;
    }
    
    console.log('[Debug] Parameters:', { tableName, fieldName, exprStr, level, isExpression, overlayMode, renderMode });
    
    if (!tableName) {
        alert('请选择数据表');
        return;
    }

    document.getElementById('loadingPanel').style.display = 'block';
    
    const token = localStorage.getItem('access_token');
    if (!token) {
        document.getElementById('loadingPanel').style.display = 'none';
        alert('请先登录后使用专题地图功能');
        return;
    }
    
    try {
        console.log('[Debug] Fetching GeoJSON and data...');
        const [geoJson, dataRes] = await Promise.all([
            loadGeoJson(level),
            fetch(`${API_BASE_URL}/api/thematic/data/${tableName}`, {
                headers: getAuthHeaders()
            })
        ]);
        
        if (!dataRes.ok) {
            document.getElementById('loadingPanel').style.display = 'none';
            alert('登录已过期，请重新登录');
            return;
        }
        
        const data = await dataRes.json();
        
        console.log('[Debug] GeoJSON loaded:', !!geoJson);
        console.log('[Debug] Data loaded:', data);
        
        if (!geoJson || !data) {
            console.error('[Debug] GeoJSON or data is null!');
            return;
        }
        
        let processedData = data.data;
        if (isExpression) {
            console.log('[Debug] Processing expression:', exprStr);
            processedData = evaluateExpression(data.data, exprStr, fieldName);
            console.log('[Debug] Expression evaluated, processed rows:', processedData.length);
        }
        
        // 时间轴模式处理
        if (renderMode === 'timeline') {
            // 复用 onTableChange() 已检测到的年份字段（字段元数据有 type/label 信息）
            // 如果为空，则从数据行字段名中检测（兼容直接打开页面的情况）
            if (!timelineFields || timelineFields.length === 0) {
                const yearRegex = /(\d{4})/;
                const firstRow = data.data[0] || {};
                const fieldCandidates = Object.keys(firstRow)
                    .filter(key => yearRegex.test(key))
                    .filter(key => {
                        const sample = data.data.find(row => row[key] != null);
                        return sample && !isNaN(parseFloat(sample[key]));
                    })
                    .sort((a, b) => {
                        const yearA = parseInt(a.match(yearRegex)[1]);
                        const yearB = parseInt(b.match(yearRegex)[1]);
                        return yearA - yearB;
                    })
                    .map(name => ({ name, type: 'REAL', label: name }));
                timelineFields = fieldCandidates;
                if (timelineFields.length > 0) {
                    showTimeline();
                }
            }

            if (!timelineFields || timelineFields.length === 0) {
                document.getElementById('loadingPanel').style.display = 'none';
                alert('该数据表中未检测到年份字段（字段名需包含4位年份，如 GDP2020、产量_2020）');
                return;
            }

            // 默认全选所有年份字段
            selectedTimelineIndices = timelineFields.map((_, index) => index);

            // 收集所有年份数据，计算全局统一 breaks
            const allYearValues = [];
            const fieldNames = timelineFields.map(f => f.name);
            for (const row of data.data) {
                for (const fn of fieldNames) {
                    const parsed = parseFloat(row[fn]);
                    if (!isNaN(parsed)) {
                        allYearValues.push(parsed);
                    }
                }
            }

            const classifyMethod = getCurrentClassifyMethod();
            const classCount = parseInt(document.getElementById('classCount').value);
            let globalBreaks = classifyMethods[classifyMethod](allYearValues, classCount);
            timelineGlobalBreaks = globalBreaks;
            currentBreaks = globalBreaks;

            // 保存当前数据
            currentData = { data: data.data, fieldName: timelineFields[0].name };

            // 使用全局 breaks 创建第一个时间点的图层
            console.log('[Debug] Creating timeline layer with global breaks:', globalBreaks);
            const timelineFeatures = createStyledFeaturesWithBreaks(geoJson, data.data, timelineFields[0].name, level, globalBreaks);

            // 移除所有旧的专题图层
            if (!overlayMode) {
                removeAllThematicLayers();
            }

            currentLayerId++;
            const layerId = currentLayerId;

            const newLayer = new ol.layer.Vector({
                source: new ol.source.Vector({
                    features: timelineFeatures
                }),
                style: function(feature) {
                    return feature.getStyle();
                },
                zIndex: 10 + layerId
            });

            newLayer.set('layerId', layerId);
            newLayer.set('name', `${timelineFields[0].name} (时间轴)`);
            newLayer.set('visible', true);
            newLayer.set('timelineMode', true);
            thematicLayers.push(newLayer);
            map.addLayer(newLayer);

            // 显示时间轴和图例（图例使用全局 breaks）
            updateLegend(globalBreaks, `${fieldNames[0]} - ${fieldNames[fieldNames.length - 1]} (${fieldNames.length}个时间点)`);
            showTimeline();

            // 更新图层列表
            updateLayerList();

            document.getElementById('loadingPanel').style.display = 'none';
            return;
        }

        // 多字段模式处理
        if (renderMode === 'multi') {
            const multiRenderType = document.querySelector('input[name="multiRenderType"]:checked')?.value || 'sideBySide';
            console.log('[Debug] Multi-field render mode:', multiRenderType, 'fields:', selectedMultiFields);

            const multiFeatures = createMultiFieldFeatures(geoJson, data.data, selectedMultiFields, level, multiRenderType);
            console.log('[Debug] Created', multiFeatures.length, 'multi-field features');

            if (!overlayMode) {
                removeAllThematicLayers();
            }

            currentLayerId++;
            const layerId = currentLayerId;

            const newLayer = new ol.layer.Vector({
                source: new ol.source.Vector({ features: multiFeatures }),
                zIndex: 100 + thematicLayers.length,
                style: function(feature) { return feature.getStyle(); }
            });

            newLayer.set('id', layerId);
            newLayer.set('name', `多字段对比: ${selectedMultiFields.slice(0, 3).join(', ')}${selectedMultiFields.length > 3 ? '...' : ''}`);
            newLayer.set('visible', true);
            newLayer.set('tableName', tableName);
            newLayer.set('renderType', 'multi');

            map.addLayer(newLayer);
            thematicLayers.push(newLayer);

            updateLayerList();

            // 显示多字段图例
            hideLegendPanel();
            const legendPanel = document.getElementById('legendPanel');
            if (legendPanel) {
                legendPanel.innerHTML = '';
                legendPanel.style.display = 'block';
                const legend = createMultiFieldLegend(selectedMultiFields);
                legendPanel.appendChild(legend);
            }

            currentBreaks = [];
            currentData = { data: data.data, fieldName: selectedMultiFields.join(',') };

            document.getElementById('loadingPanel').style.display = 'none';
            return;
        }

        // 保存当前数据
        currentData = { data: processedData, fieldName };
        
        console.log('[Debug] Creating styled features...');
        const styledFeatures = createStyledFeatures(geoJson, processedData, fieldName, level);
        console.log('[Debug] Created', styledFeatures.length, 'styled features');
        
        // 如果不是叠加模式，移除所有旧的专题图层
        if (!overlayMode) {
            console.log('[Debug] Removing all existing thematic layers');
            removeAllThematicLayers();
        }
        
        // 生成新图层ID
        currentLayerId++;
        const layerId = currentLayerId;
        
        console.log('[Debug] Creating new thematic layer with', styledFeatures.length, 'features');
        
        // 验证第一个要素的样式
        if (styledFeatures.length > 0) {
            const firstFeature = styledFeatures[0];
            const featureStyle = firstFeature.getStyle();
            console.log('[Debug] First feature style:', featureStyle);
            if (featureStyle) {
                const fill = featureStyle.getFill();
                const stroke = featureStyle.getStroke();
                console.log('[Debug] First feature fill:', fill ? fill.getColor() : 'null');
                console.log('[Debug] First feature stroke:', stroke ? stroke.getColor() : 'null');
            }
        }
        
        // 检查样式创建是否正确
        console.log('[Debug] Checking styledFeatures...');
        styledFeatures.forEach((feature, index) => {
            if (index < 3) {
                const style = feature.getStyle();
                const fill = style ? style.getFill() : null;
                const color = fill ? fill.getColor() : 'no color';
                console.log(`[Debug] Feature ${index} style color:`, color);
            }
        });
        
        const newLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                features: styledFeatures
            }),
            zIndex: 100 + thematicLayers.length,
            style: function(feature) {
                const style = feature.getStyle();
                return style;
            }
        });
        
        // 设置图层元数据
        newLayer.set('id', layerId);
        newLayer.set('name', fieldName);
        newLayer.set('visible', true);
        newLayer.set('tableName', tableName);
        newLayer.set('renderType', document.querySelector('input[name="renderType"]:checked').value);
        
        // 直接为每个要素设置样式，而不是依赖属性
        styledFeatures.forEach(feature => {
            feature.setStyle(feature.getStyle());
        });
        
        map.addLayer(newLayer);
        thematicLayers.push(newLayer);
        console.log('[Debug] Thematic layer added to map, layers count:', map.getLayers().getLength());
        
        // 更新图层列表UI
        updateLayerList();
        
        // 验证图层是否正确添加
        setTimeout(() => {
            const layers = map.getLayers().getArray();
            console.log('[Debug] All layers:', layers.map(l => l.get('name') || 'unnamed'));
        }, 500);
        
        // 调整视图以适应数据范围（仅在非叠加模式下）
        if (!overlayMode) {
            const extent = newLayer.getSource().getExtent();
            if (extent && extent.length === 4) {
                console.log('[Debug] Fitting view to extent:', extent);
                map.getView().fit(extent, {
                    padding: [50, 50, 50, 50],
                    maxZoom: 10
                });
            }
        }
        
        updateLegend(currentBreaks, fieldName);
        document.getElementById('dataInfo').innerHTML = `数据记录: ${processedData.length} 条 | 数据来源: ${data.table_label}`;
        
    } catch (error) {
        console.error('[Debug] 应用专题图层失败:', error);
        alert('加载数据失败，请重试: ' + error.message);
    } finally {
        document.getElementById('loadingPanel').style.display = 'none';
    }
}

function removeAllThematicLayers() {
    thematicLayers.forEach(layer => {
        map.removeLayer(layer);
    });
    thematicLayers = [];
    
    document.querySelectorAll('.legend-axis').forEach(legend => {
        legend.remove();
    });
    
    updateLayerList();
    
    // 更新图例计数并隐藏面板
    updateLegendCount();
    const legendPanel = document.getElementById('legendPanel');
    if (legendPanel) {
        legendPanel.style.display = 'none';
    }
}

function removeThematicLayer(layerId) {
    const index = thematicLayers.findIndex(l => l.get('id') === layerId);
    if (index !== -1) {
        map.removeLayer(thematicLayers[index]);
        thematicLayers.splice(index, 1);
        
        const legendElement = document.querySelector(`.legend-axis[data-layer-id="${layerId}"]`);
        if (legendElement) {
            legendElement.remove();
        }
        
        if (thematicLayers.length > 0) {
            const lastLayer = thematicLayers[thematicLayers.length - 1];
            const lastLegend = document.querySelector(`.legend-axis[data-layer-id="${lastLayer.get('id')}"]`);
            setActiveLegend(lastLegend);
        }
        
        updateLayerList();
        
        // 更新图例计数
        updateLegendCount();
        
        // 如果没有图层了，隐藏图例面板
        if (thematicLayers.length === 0) {
            const legendPanel = document.getElementById('legendPanel');
            if (legendPanel) {
                legendPanel.style.display = 'none';
            }
        }
    }
}

function toggleLayerVisibility(layerId) {
    const layer = thematicLayers.find(l => l.get('id') === layerId);
    if (layer) {
        const visible = !layer.get('visible');
        layer.setVisible(visible);
        updateLayerList();
    }
}

function updateLayerList() {
    const container = document.getElementById('layerList');
    if (!container) return;
    
    if (thematicLayers.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; color: #999; text-align: center; padding: 8px;">暂无专题图层</div>';
        return;
    }
    
    container.innerHTML = thematicLayers.map((layer, index) => {
        const id = layer.get('id');
        const name = layer.get('name') || `图层${id}`;
        const visible = layer.get('visible');
        const renderType = layer.get('renderType') === 'point' ? '●' : '■';
        
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #666;">${renderType}</span>
                    <span style="color: #333;">${name}</span>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="toggleLayerVisibility(${id})" style="width: 24px; height: 24px; border: none; border-radius: 4px; background: ${visible ? '#1890ff' : '#f0f0f0'}; color: white; cursor: pointer; font-size: 12px;">
                        ${visible ? '✓' : ''}
                    </button>
                    <button onclick="removeThematicLayer(${id})" style="width: 24px; height: 24px; border: none; border-radius: 4px; background: #f5f5f5; color: #999; cursor: pointer; font-size: 14px;" title="移除图层">
                        ×
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function createStyledFeatures(geoJson, data, fieldName, level) {
    const values = data.map(item => {
        const val = parseFloat(item[fieldName]);
        return isNaN(val) ? null : val;
    }).filter(v => v !== null);

    const classifyMethod = getCurrentClassifyMethod();
    const classCount = parseInt(document.getElementById('classCount').value);

    let breaks = [];
    if (values.length > 0) {
        breaks = classifyMethods[classifyMethod](values, classCount);
        currentBreaks = breaks;
    }

    return createStyledFeaturesWithBreaks(geoJson, data, fieldName, level, breaks);
}

function updateLegend(breaks, fieldName) {
    console.log('[Debug] updateLegend() called');
    console.log('[Debug] Breaks:', breaks, 'Field:', fieldName);

    const colorScheme = getCurrentColorScheme();
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const classCount = breaks.length - 1;
    
    currentBreaks = [...breaks];
    
    if (breaks.length === 0) {
        return;
    }
    
    const currentLayer = getCurrentThematicLayer();
    if (!currentLayer) {
        console.warn('[Debug] No current thematic layer');
        return;
    }
    
    const layerId = currentLayer.get('id');
    const layerName = currentLayer.get('name') || `图层${layerId}`;
    
    let legendElement = document.querySelector(`.legend-axis[data-layer-id="${layerId}"]`);
    
    if (!legendElement) {
        legendElement = createLayerLegend(layerId, layerName, breaks, colorScale, classCount);
    } else {
        updateLegendContent(legendElement, breaks, colorScale, classCount);
        setActiveLegend(legendElement);
    }
    
    // 显示图例面板
    const legendPanel = document.getElementById('legendPanel');
    if (legendPanel) {
        legendPanel.style.display = 'block';
    }
    
    // 更新图例计数
    updateLegendCount();
}

function updateAxisLegend(breaks, colorScale, classCount) {
    const container = document.getElementById('axisContainer');
    const track = document.getElementById('axisTrack');
    const labelMax = document.getElementById('axisLabelMax');
    const labelMin = document.getElementById('axisLabelMin');
    const colorScheme = getCurrentColorScheme();

    container.innerHTML = '';
    track.innerHTML = '';
    container.appendChild(track);
    
    labelMax.textContent = formatNumber(breaks[breaks.length - 1] || 0);
    labelMin.textContent = formatNumber(breaks[0] || 0);
    
    const axisClassCount = document.getElementById('axisClassCount');
    if (axisClassCount) {
        axisClassCount.textContent = classCount;
    }
    
    const min = breaks[0];
    const max = breaks[breaks.length - 1];
    const range = max - min;
    
    if (colorScheme === 'size_only') {
        // 单色调大小分级：展示大小对比的图例
        const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
        const minSize = pointSize * 0.2;
        const maxSize = pointSize * 2.5;
        
        // 添加大小说明
        const sizeLegend = document.createElement('div');
        sizeLegend.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 0;';
        
        // 左侧：小点
        const smallDot = document.createElement('div');
        smallDot.style.cssText = `width: ${minSize*2}px; height: ${minSize*2}px; background: rgb(66, 146, 198); border-radius: 50%;`;
        const smallLabel = document.createElement('span');
        smallLabel.textContent = '小';
        smallLabel.style.cssText = 'font-size: 12px; color: #666; margin-left: 5px;';
        
        const leftContainer = document.createElement('div');
        leftContainer.style.cssText = 'display: flex; align-items: center;';
        leftContainer.appendChild(smallDot);
        leftContainer.appendChild(smallLabel);
        sizeLegend.appendChild(leftContainer);
        
        // 右侧：大点
        const largeDot = document.createElement('div');
        largeDot.style.cssText = `width: ${maxSize*2}px; height: ${maxSize*2}px; background: rgb(66, 146, 198); border-radius: 50%;`;
        const largeLabel = document.createElement('span');
        largeLabel.textContent = '大';
        largeLabel.style.cssText = 'font-size: 12px; color: #666; margin-right: 5px;';
        
        const rightContainer = document.createElement('div');
        rightContainer.style.cssText = 'display: flex; align-items: center;';
        rightContainer.appendChild(largeLabel);
        rightContainer.appendChild(largeDot);
        sizeLegend.appendChild(rightContainer);
        
        container.appendChild(sizeLegend);
        
        // 添加可拖动的断点（保持在底层）
        track.style.height = '20px';
        track.style.marginTop = '5px';
        
        // 使用单一蓝色作为背景条
        const segment = document.createElement('div');
        segment.className = 'axis-segment';
        segment.style.left = '0%';
        segment.style.width = '100%';
        segment.style.backgroundColor = 'rgb(66, 146, 198)';
        track.appendChild(segment);
        
    } else {
        // 普通颜色渐变图例
        for (let i = 0; i < classCount; i++) {
            const color = colorScale[i] || [200, 200, 200];
            const segment = document.createElement('div');
            segment.className = 'axis-segment';
            
            // 根据数值计算位置
            const startPercent = range > 0 ? ((breaks[i] - min) / range) * 100 : (i / classCount) * 100;
            const endPercent = range > 0 ? ((breaks[i + 1] - min) / range) * 100 : ((i + 1) / classCount) * 100;
            
            segment.style.left = `${startPercent}%`;
            segment.style.width = `${endPercent - startPercent}%`;
            segment.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            track.appendChild(segment);
        }
    }
    
    // 添加断点标记和拖动handle
    for (let i = 0; i < breaks.length; i++) {
        const marker = document.createElement('div');
        marker.className = 'axis-marker';
        const percent = range > 0 ? ((breaks[i] - min) / range) * 100 : (i / classCount) * 100;
        marker.style.left = `${percent}%`;
        track.appendChild(marker);
        
        const handle = document.createElement('div');
        handle.className = 'axis-handle';
        if (i === 0 || i === breaks.length - 1) {
            handle.classList.add('fixed');
        }
        handle.dataset.index = i;
        handle.style.left = `${percent}%`;
        
        // 添加断点数值标签
        const label = document.createElement('div');
        label.className = 'axis-handle-label';
        label.textContent = formatNumber(breaks[i]);
        handle.appendChild(label);
        
        if (i > 0 && i < breaks.length - 1) {
            handle.addEventListener('mousedown', startAxisDrag);
            handle.addEventListener('touchstart', startAxisDrag, { passive: false });
        }
        
        track.appendChild(handle);
    }
}

function startAxisDrag(e) {
    e.preventDefault();
    isAxisDragging = true;
    dragIndex = parseInt(e.target.dataset.index);
    
    axisDragLegendElement = e.target.closest('.legend-axis');
    if (!axisDragLegendElement) return;
    
    dragTrack = axisDragLegendElement.querySelector('.axis-container');
    
    document.addEventListener('mousemove', doAxisDrag);
    document.addEventListener('mouseup', endAxisDrag);
    document.addEventListener('touchmove', doAxisDrag, { passive: false });
    document.addEventListener('touchend', endAxisDrag);
}

function doAxisDrag(e) {
    if (!isAxisDragging || !dragTrack || !axisDragLegendElement) return;
    e.preventDefault();
    
    const rect = dragTrack.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let percent = (clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    
    const classCount = currentBreaks.length - 1;
    const newValue = currentBreaks[0] + percent * (currentBreaks[classCount] - currentBreaks[0]);
    
    const prevValue = currentBreaks[dragIndex - 1] || currentBreaks[0];
    const nextValue = currentBreaks[dragIndex + 1] || currentBreaks[classCount];
    
    const clampedValue = Math.max(prevValue + 0.001, Math.min(nextValue - 0.001, newValue));
    currentBreaks[dragIndex] = clampedValue;
    
    updateAxisLegendBar(axisDragLegendElement);
    
    const layerId = parseInt(axisDragLegendElement.dataset.layerId);
    const targetLayer = thematicLayers.find(l => l.get('id') === layerId);
    
    if (targetLayer && currentBreaks.length > 0) {
        updateMapStyles(targetLayer);
    }
}

function endAxisDrag() {
    if (isAxisDragging) {
        isAxisDragging = false;
        document.removeEventListener('mousemove', doAxisDrag);
        document.removeEventListener('mouseup', endAxisDrag);
        document.removeEventListener('touchmove', doAxisDrag);
        document.removeEventListener('touchend', endAxisDrag);
        
        if (axisDragLegendElement && currentBreaks.length > 0) {
            const layerId = parseInt(axisDragLegendElement.dataset.layerId);
            const targetLayer = thematicLayers.find(l => l.get('id') === layerId);
            
            if (targetLayer) {
                applyThematicLayerWithBreaks(currentBreaks, targetLayer);
            }
        }
    }
    dragIndex = -1;
    dragTrack = null;
    axisDragLegendElement = null;
}

function updateAxisLegendBar(legendElement) {
    if (!legendElement) return;

    const colorScheme = getCurrentColorScheme();
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const classCount = currentBreaks.length - 1;
    
    const track = legendElement.querySelector('.axis-track');
    const labelMax = legendElement.querySelector('.axis-label-max');
    const labelMin = legendElement.querySelector('.axis-label-min');
    
    if (!track) return;
    
    labelMax.textContent = formatNumber(currentBreaks[currentBreaks.length - 1] || 0);
    labelMin.textContent = formatNumber(currentBreaks[0] || 0);
    
    const segments = track.querySelectorAll('.axis-segment');
    const markers = track.querySelectorAll('.axis-marker');
    const handles = track.querySelectorAll('.axis-handle');
    
    // 更新颜色段 - 跟随断点位置
    if (currentBreaks.length > 1) {
        const min = currentBreaks[0];
        const max = currentBreaks[currentBreaks.length - 1];
        const range = max - min;
        
        if (colorScheme === 'size_only') {
            // 单色调模式：只更新唯一的颜色段
            if (segments.length > 0) {
                segments[0].style.backgroundColor = 'rgb(66, 146, 198)';
                segments[0].style.left = '0%';
                segments[0].style.width = '100%';
            }
        } else {
            // 普通颜色渐变模式
            segments.forEach((segment, i) => {
                const color = colorScale[i] || [200, 200, 200];
                segment.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                
                // 计算颜色段位置和宽度
                const startPercent = range > 0 ? ((currentBreaks[i] - min) / range) * 100 : 0;
                const endPercent = range > 0 ? ((currentBreaks[i + 1] - min) / range) * 100 : 100;
                segment.style.left = `${startPercent}%`;
                segment.style.width = `${endPercent - startPercent}%`;
            });
        }
        
        // 更新断点位置和标签
        handles.forEach((handle, i) => {
            const percent = range > 0 ? ((currentBreaks[i] - min) / range) * 100 : (i / classCount) * 100;
            handle.style.left = `${percent}%`;
            
            // 更新标签
            const label = handle.querySelector('.axis-handle-label');
            if (label) {
                label.textContent = formatNumber(currentBreaks[i]);
            }
        });
        
        markers.forEach((marker, i) => {
            const percent = range > 0 ? ((currentBreaks[i] - min) / range) * 100 : (i / classCount) * 100;
            marker.style.left = `${percent}%`;
        });
    }
}

function adjustClassCount(delta) {
    const classCountInput = document.getElementById('classCount');
    const currentCount = parseInt(classCountInput.value);
    const newCount = Math.max(3, Math.min(12, currentCount + delta));
    classCountInput.value = newCount;
    document.getElementById('classCountValue').textContent = newCount + '级';
    document.getElementById('axisClassCount').textContent = newCount;
    
    if (currentBreaks.length > 0) {
        const min = currentBreaks[0];
        const max = currentBreaks[currentBreaks.length - 1];
        const classifyMethod = getCurrentClassifyMethod();

        // 先获取实际数据来计算合理的断点
        const validData = getAllDataValues();
        if (validData.length > 0) {
            currentBreaks = classifyMethods[classifyMethod](validData, newCount);
        } else {
            // 如果没有数据，创建等间距断点
            const values = [];
            for (let i = 0; i <= newCount; i++) {
                values.push(min + (max - min) * i / newCount);
            }
            currentBreaks = values;
        }

        const colorScheme = getCurrentColorScheme();
        const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
        updateAxisLegend(currentBreaks, colorScale, newCount);
        
        const currentLayer = getCurrentThematicLayer();
        if (currentLayer) {
            applyThematicLayerWithBreaks(currentBreaks, currentLayer);
        }
    }
}

function getAllDataValues() {
    if (!currentData || !currentData.data || !currentData.fieldName) {
        return [];
    }
    const values = [];
    for (const row of currentData.data) {
        const value = parseFloat(row[currentData.fieldName]);
        if (!isNaN(value)) {
            values.push(value);
        }
    }
    return values;
}

function formatNumber(num) {
    if (num >= 100000000) {
        return (num / 100000000).toFixed(1) + '亿';
    } else if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
        return num.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
    } else {
        return num.toFixed(1);
    }
}

async function applyThematicLayerWithBreaks(breaks, targetLayer) {
    console.log('[Debug] applyThematicLayerWithBreaks() called');
    
    const tableName = document.getElementById('tableSelect').value;
    const fieldSelectValue = document.getElementById('fieldSelect').value;
    const expression = document.getElementById('expressionInput').value;
    const level = document.getElementById('levelSelect').value;
    const isExpression = fieldSelectValue === 'expression';
    
    let fieldName = isExpression ? parseExpression(expression).name : fieldSelectValue;
    
    const token = localStorage.getItem('access_token');
    if (!token) return;
    
    try {
        const [geoJson, dataRes] = await Promise.all([
            loadGeoJson(level),
            fetch(`${API_BASE_URL}/api/thematic/data/${tableName}`, {
                headers: getAuthHeaders()
            })
        ]);
        
        if (!dataRes.ok) return;
        
        const data = await dataRes.json();
        let processedData = data.data;
        if (isExpression) {
            processedData = evaluateExpression(data.data, parseExpression(expression).expr, fieldName);
        }
        
        const styledFeatures = createStyledFeaturesWithBreaks(geoJson, processedData, fieldName, level, breaks);
        
        if (targetLayer) {
            targetLayer.getSource().clear();
            targetLayer.getSource().addFeatures(styledFeatures);
        }
        
        console.log('[Debug] Thematic layer updated with custom breaks');
        
    } catch (error) {
        console.error('[Debug] 应用专题图层失败:', error);
    }
}

function createStyledFeaturesWithBreaks(geoJson, data, fieldName, level, breaks) {
    const colorScheme = getCurrentColorScheme();
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    
    const features = [];
    
    geoJson.features.forEach((feature) => {
        // 根据级别选择不同的空间数据字段
        let name;
        if (level === 'province') {
            name = feature.properties.full_name;  // 省级数据用全称
        } else if (level === 'city') {
            name = feature.properties.name;  // 市级数据用简称
        } else {  // country 级别
            name = feature.properties.full_name || feature.properties.name;
        }
        
        const dataItem = findDataItem(data, name, level, feature.properties.iso_a3);
        
        let value = null;
        let hasData = false;
        if (dataItem && dataItem[fieldName] !== undefined && dataItem[fieldName] !== null && dataItem[fieldName] !== '') {
            const parsed = parseFloat(dataItem[fieldName]);
            if (!isNaN(parsed)) {
                value = parsed;
                hasData = true;
            }
        }
        
        let style;
        
        if (!hasData || breaks.length === 0) {
            style = new ol.style.Style({
                fill: new ol.style.Fill({
                    color: 'rgba(200, 200, 200, 0.3)'
                }),
                stroke: new ol.style.Stroke({
                    color: 'rgba(150, 150, 150, 0.5)',
                    width: 1
                })
            });
        } else {
            let colorIndex = 0;
            for (let i = 0; i < breaks.length - 1; i++) {
                if (value >= breaks[i] && value <= breaks[i + 1]) {
                    colorIndex = i;
                    break;
                }
            }
            
            const color = colorScale[colorIndex] || [200, 200, 200];
            const classCount = breaks.length - 1;
            
            if (renderType === 'point') {
                const isSizeOnly = colorScheme === 'size_only';
                const minSize = pointSize * 0.2;
                const maxSize = isSizeOnly ? pointSize * 2.5 : pointSize;
                const size = minSize + (maxSize - minSize) * (colorIndex / (classCount - 1));
                
                const fillColor = isSizeOnly ? 
                    `rgba(66, 146, 198, ${opacity})` : 
                    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
                
                style = new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: size,
                        fill: new ol.style.Fill({
                            color: fillColor
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(0, 0, 0, 0.5)',
                            width: borderWidth
                        })
                    })
                });
            } else {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(0, 0, 0, 0.3)',
                        width: borderWidth
                    })
                });
            }
        }
        
        const olFeature = new ol.format.GeoJSON().readFeature(feature, {
            featureProjection: 'EPSG:3857'
        });
        
        if (renderType === 'point') {
            const geometry = olFeature.getGeometry();
            const center = getCountryCenter(geometry);
            const pointGeom = new ol.geom.Point(center);
            olFeature.setGeometry(pointGeom);
        }
        
        olFeature.setStyle(style);
        olFeature.set('name', name);
        olFeature.set('value', value);
        olFeature.set('dataValue', value);
        olFeature.set('fieldName', fieldName);
        features.push(olFeature);
    });
    
    return features;
}

function rgbToRgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function getMultiFieldColor(i, total) {
    const colorScheme = getCurrentColorScheme();
    const scheme = colorSchemes[colorScheme];
    if (scheme && scheme.length > 0) {
        if (colorScheme === 'tableau10' || colorScheme === 'okabe' || colorScheme === 'category3') {
            return scheme[i % scheme.length];
        }
        const idx = Math.floor((i / Math.max(total - 1, 1)) * (scheme.length - 1));
        return scheme[idx];
    }
    return [31, 119, 180];
}

function createPieChart(values, labels, colors, size = 60) {
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    const cx = size;
    const cy = size;
    const radius = size * 0.85;

    const total = values.reduce((sum, v) => sum + v, 0);
    if (total <= 0) {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, size * 2 - 4, size * 2 - 4);
        return canvas.toDataURL();
    }

    let startAngle = -Math.PI / 2;
    values.forEach((value, i) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        const color = colors[i % colors.length];
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        startAngle += sliceAngle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    return canvas.toDataURL();
}

function createStackedBar(values, labels, colors, width = 140, height = 70) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const total = values.reduce((sum, v) => sum + v, 0);
    if (total <= 0) {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
        return canvas.toDataURL();
    }

    const padding = { top: 5, bottom: 5, left: 5, right: 5 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    let x = padding.left;
    values.forEach((value, i) => {
        const barWidth = (value / total) * chartWidth;
        const color = colors[i % colors.length];
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillRect(x, padding.top, barWidth, chartHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, padding.top, barWidth, chartHeight);
        x += barWidth;
    });

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

    return canvas.toDataURL();
}

function createSideBySideBar(values, labels, colors, width = 160, height = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const padding = { top: 8, bottom: 18, left: 15, right: 8 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxVal = Math.max(...values, 1);
    const barWidth = chartWidth / values.length * 0.7;
    const gap = chartWidth / values.length * 0.3;

    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    values.forEach((value, i) => {
        const barHeight = (value / maxVal) * chartHeight;
        const x = padding.left + i * (barWidth + gap) + gap / 2;
        const y = padding.top + chartHeight - barHeight;
        const color = colors[i % colors.length];
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
    });

    return canvas.toDataURL();
}

function createGroupedBar(fieldValues, fieldNames, rowLabels, colors, width = 180, height = 100) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const padding = { top: 8, bottom: 18, left: 15, right: 8 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const numGroups = fieldValues.length;
    const numFields = fieldNames.length;
    const groupWidth = chartWidth / numGroups;
    const barWidth = groupWidth / numFields * 0.7;

    let maxVal = 1;
    for (const row of fieldValues) {
        for (const v of row) {
            if (v > maxVal) maxVal = v;
        }
    }

    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    fieldValues.forEach((rowVals, rowIdx) => {
        rowVals.forEach((value, fieldIdx) => {
            const barHeight = (value / maxVal) * chartHeight;
            const x = padding.left + rowIdx * groupWidth + fieldIdx * barWidth + (groupWidth - barWidth * numFields) / 2;
            const y = padding.top + chartHeight - barHeight;
            const color = colors[fieldIdx % colors.length];
            ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            ctx.fillRect(x, y, barWidth, barHeight);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, barWidth, barHeight);
        });
    });

    return canvas.toDataURL();
}

function createLineChart(values, labels, colors, width = 160, height = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const padding = { top: 8, bottom: 18, left: 15, right: 8 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values, 0);
    const range = Math.max(maxVal - minVal, 1);

    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    if (values.length > 1) {
        ctx.beginPath();
        values.forEach((value, i) => {
            const x = padding.left + (i / (values.length - 1)) * chartWidth;
            const y = padding.top + chartHeight - ((value - minVal) / range) * chartHeight;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        const color = colors[0] || [31, 119, 180];
        ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        values.forEach((value, i) => {
            const x = padding.left + (i / (values.length - 1)) * chartWidth;
            const y = padding.top + chartHeight - ((value - minVal) / range) * chartHeight;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            ctx.fill();
        });
    }

    return canvas.toDataURL();
}

function createRadarChart(values, labels, colors, size = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');

    const cx = size;
    const cy = size;
    const radius = size * 0.75;
    const numAxes = values.length;

    if (numAxes < 3) {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, size * 2 - 4, size * 2 - 4);
        return canvas.toDataURL();
    }

    const maxVal = Math.max(...values, 1);

    for (let level = 1; level <= 4; level++) {
        const r = (radius * level) / 4;
        ctx.beginPath();
        for (let i = 0; i < numAxes; i++) {
            const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    for (let i = 0; i < numAxes; i++) {
        const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    ctx.beginPath();
    const color = colors[0] || [31, 119, 180];
    for (let i = 0; i < numAxes; i++) {
        const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
        const r = (values[i] / maxVal) * radius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.45)`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    return canvas.toDataURL();
}

function computeMultiFieldValues(dataItems, fieldNames, classifyMethod) {
    const results = [];
    for (const item of dataItems) {
        const values = [];
        let valid = true;
        for (const fn of fieldNames) {
            const parsed = parseFloat(item[fn]);
            if (isNaN(parsed)) {
                values.push(0);
                valid = false;
            } else {
                values.push(parsed);
            }
        }
        results.push({
            values: values,
            labels: fieldNames,
            valid: valid
        });
    }
    return results;
}

function createMultiFieldFeatures(geoJson, data, fieldNames, level, renderType) {
    const multiColors = [];
    for (let i = 0; i < fieldNames.length; i++) {
        multiColors.push(getMultiFieldColor(i, fieldNames.length));
    }

    const features = [];

    geoJson.features.forEach((feature) => {
        let name;
        if (level === 'province') {
            name = feature.properties.full_name;
        } else if (level === 'city') {
            name = feature.properties.name;
        } else {
            name = feature.properties.full_name || feature.properties.name;
        }

        const dataItem = findDataItem(data, name, level, feature.properties.iso_a3);
        if (!dataItem) return;

        const values = [];
        for (const fn of fieldNames) {
            const parsed = parseFloat(dataItem[fn]);
            values.push(isNaN(parsed) ? 0 : parsed);
        }

        const geometry = feature.geometry;
        let centerLonLat;
        if (geometry.type === 'Polygon') {
            const coords = geometry.coordinates[0];
            let sumLon = 0, sumLat = 0;
            for (const c of coords) {
                sumLon += c[0];
                sumLat += c[1];
            }
            centerLonLat = [sumLon / coords.length, sumLat / coords.length];
        } else if (geometry.type === 'MultiPolygon') {
            const coords = geometry.coordinates[0][0];
            let sumLon = 0, sumLat = 0;
            for (const c of coords) {
                sumLon += c[0];
                sumLat += c[1];
            }
            centerLonLat = [sumLon / coords.length, sumLat / coords.length];
        } else {
            centerLonLat = [feature.properties.longitude || 0, feature.properties.latitude || 0];
        }

        let dataUrl;
        let iconSize;

        switch(renderType) {
            case 'pie':
                dataUrl = createPieChart(values, fieldNames, multiColors, 50);
                iconSize = [100, 100];
                break;
            case 'stacked':
                dataUrl = createStackedBar(values, fieldNames, multiColors, 120, 60);
                iconSize = [120, 60];
                break;
            case 'line':
                dataUrl = createLineChart(values, fieldNames, multiColors, 140, 70);
                iconSize = [140, 70];
                break;
            case 'radar':
                dataUrl = createRadarChart(values, fieldNames, multiColors, 60);
                iconSize = [120, 120];
                break;
            case 'groupedBar':
                dataUrl = createSideBySideBar(values, fieldNames, multiColors, 160, 80);
                iconSize = [160, 80];
                break;
            case 'sideBySide':
            default:
                dataUrl = createSideBySideBar(values, fieldNames, multiColors, 140, 70);
                iconSize = [140, 70];
                break;
        }

        const centerCoord = ol.proj.fromLonLat(centerLonLat);
        const pointGeom = new ol.geom.Point(centerCoord);
        const olFeature = new ol.Feature({ geometry: pointGeom });

        olFeature.setStyle(new ol.style.Style({
            image: new ol.style.Icon({
                src: dataUrl,
                scale: 1,
                opacity: 0.95
            })
        }));

        olFeature.set('name', name);
        olFeature.set('fieldNames', fieldNames.join(', '));
        olFeature.set('values', values.join(', '));
        features.push(olFeature);
    });

    return features;
}

function createMultiFieldLegend(fieldNames) {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 8px; background: rgba(255,255,255,0.95); border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #333;';
    title.textContent = `多字段对比 (${fieldNames.length}个字段)`;
    container.appendChild(title);

    const colorScheme = getCurrentColorScheme();
    const scheme = colorSchemes[colorScheme];

    fieldNames.forEach((fn, i) => {
        const color = getMultiFieldColor(i, fieldNames.length);
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 2px 0;';

        const colorBox = document.createElement('div');
        colorBox.style.cssText = `width: 14px; height: 14px; background: rgb(${color[0]}, ${color[1]}, ${color[2]}); border: 1px solid #999; border-radius: 2px;`;

        const label = document.createElement('span');
        label.style.cssText = 'color: #555;';
        label.textContent = fn;

        row.appendChild(colorBox);
        row.appendChild(label);
        container.appendChild(row);
    });

    return container;
}

function findDataItem(data, name, level, isoCode) {
    if (level === 'country') {
        // 1. 国家级数据：空间数据 iso_a3 ↔ 专题数据 iso_a3
        if (!isoCode) return null;
        for (const item of data) {
            if (item['iso_a3'] === isoCode) {
                return item;
            }
        }
        return null;
    } else if (level === 'province') {
        // 2. 省级数据：空间数据 full_name ↔ 专题数据 省份
        for (const item of data) {
            if (item['省份'] === name) {
                return item;
            }
        }
        return null;
    } else if (level === 'city') {
        // 3. 市级数据：空间数据 name ↔ 专题数据 name
        for (const item of data) {
            if (item['name'] === name) {
                return item;
            }
        }
        return null;
    }
    return null;
}

function detectTouch() {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.body.classList.add('touch');
    } else {
        document.body.classList.add('no-touch');
    }
}

function initThematicMap() {
    console.log('[Debug] initThematicMap() called');
    console.log('[Debug] API_BASE_URL:', API_BASE_URL);
    
    try {
        detectTouch();
        console.log('[Debug] detectTouch() done');
        
        initMap();
        console.log('[Debug] initMap() done');
        
        loadTables();
        console.log('[Debug] loadTables() called');
        
        document.getElementById('opacitySlider').addEventListener('input', function() {
            updateSliderDisplay('opacitySlider', 'opacityValue', '%');
        });

        document.getElementById('pointSizeSlider').addEventListener('input', function() {
            updateSliderDisplay('pointSizeSlider', 'pointSizeValue', 'px');
        });

        document.getElementById('borderWidthSlider').addEventListener('input', function() {
            updateSliderDisplay('borderWidthSlider', 'borderWidthValue', 'px');
        });
        
        document.getElementById('classCount').addEventListener('input', function() {
            updateSliderDisplay('classCount', 'classCountValue', '级');
        });
        
        document.getElementById('tableSelect').addEventListener('change', onTableChange);
        
        // 渲染模式切换：显示/隐藏各模式对应的配置区块
        document.querySelectorAll('input[name="renderMode"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const mode = this.value;
                const showSingle = (mode === 'single');
                const showMulti = (mode === 'multi');
                const showTimeline = (mode === 'timeline');
                const showExpression = (mode === 'expression');

                // 字段选择区
                document.getElementById('singleFieldSection').style.display = (showSingle || showExpression) ? 'block' : 'none';
                document.getElementById('multiFieldSection').style.display = showMulti ? 'block' : 'none';
                // 表达式区块由 onFieldChange() 控制，此处只处理模式切换时的默认状态
                if (!showExpression) {
                    document.getElementById('expressionSection').style.display = 'none';
                }

                // 分级方法区
                const singleCls = document.getElementById('singleClassifySection');
                const multiCls = document.getElementById('multiClassifySection');
                const timelineCls = document.getElementById('timelineClassifySection');
                if (singleCls) singleCls.style.display = (showSingle || showExpression) ? 'block' : 'none';
                if (multiCls) multiCls.style.display = showMulti ? 'block' : 'none';
                if (timelineCls) timelineCls.style.display = showTimeline ? 'block' : 'none';

                // 配色方案区
                const singleColor = document.getElementById('singleColorSection');
                const multiColor = document.getElementById('multiColorSection');
                const timelineColor = document.getElementById('timelineColorSection');
                if (singleColor) singleColor.style.display = (showSingle || showExpression) ? 'block' : 'none';
                if (multiColor) multiColor.style.display = showMulti ? 'block' : 'none';
                if (timelineColor) timelineColor.style.display = showTimeline ? 'block' : 'none';

                // 多字段渲染方式区
                const multiRender = document.getElementById('multiRenderSection');
                if (multiRender) multiRender.style.display = showMulti ? 'block' : 'none';
            });
        });

        // 页面初始化时，根据默认选中的渲染模式同步显示区块
        const defaultRadio = document.querySelector('input[name="renderMode"]:checked');
        if (defaultRadio) {
            defaultRadio.dispatchEvent(new Event('change'));
        }
        
        if (window.innerWidth <= 600) {
            // 手机端不自动收起面板，让用户更容易操作
            // togglePanel();
            showMobileHint();
        }

        // 添加地图交互
        addMapInteractions();
        
        // 初始化图例面板
        initLegendPanel();

        // 监听窗口大小变化
        window.addEventListener('resize', function() {
            // 确保按钮状态正确
        });

        console.log('[Debug] initThematicMap() completed!');
    } catch (error) {
        console.error('[Debug] Error during initialization:', error);
    }
}

// 显示移动端操作提示
function showMobileHint() {
    const isMobile = window.innerWidth <= 600;
    if (!isMobile) return;
    
    // 检查是否已经显示过
    if (sessionStorage.getItem('mobileHintShown')) return;
    
    // 显示提示
    const hint = document.createElement('div');
    hint.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.75);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-size: 14px;
        z-index: 1001;
        animation: fadeInUp 0.4s ease-out;
    `;
    hint.textContent = '📊 点击右上角按钮设置专题地图';
    document.body.appendChild(hint);
    
    // 3秒后消失
    setTimeout(() => {
        hint.style.animation = 'fadeOutDown 0.3s ease-in';
        setTimeout(() => hint.remove(), 300);
    }, 3000);
    
    // 标记已显示
    sessionStorage.setItem('mobileHintShown', 'true');
    
    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeOutDown {
            from { opacity: 1; transform: translateX(-50%) translateY(0); }
            to { opacity: 0; transform: translateX(-50%) translateY(20px); }
        }
    `;
    document.head.appendChild(style);
}

function addMapInteractions() {
    console.log('[Debug] addMapInteractions() called');
    
    // 检测是否为触摸设备
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // 创建信息弹窗
    const infoDiv = document.createElement('div');
    infoDiv.id = 'mapInfoPopup';
    infoDiv.style.cssText = `
        position: fixed;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid #ddd;
        border-radius: 12px;
        padding: 14px 18px;
        font-size: 15px;
        pointer-events: none;
        z-index: 1000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        max-width: 280px;
        display: none;
        line-height: 1.5;
        backdrop-filter: blur(4px);
    `;
    document.body.appendChild(infoDiv);
    
    // 只在非触摸设备上使用鼠标悬停
    if (!isTouchDevice) {
        // 鼠标移动事件 - 显示省份名称
        map.on('pointermove', function(evt) {
            const pixel = map.getEventPixel(evt.originalEvent);
            const hit = map.forEachFeatureAtPixel(pixel, function(feature) {
                return feature;
            });
            
            if (hit) {
                const name = hit.get('name') || hit.get('full_name') || hit.getProperties().full_name || hit.getProperties().name;
                const value = hit.get('dataValue');
                const fieldName = hit.get('fieldName');
                
                let content = `<strong style="color: #333; font-size: 16px;">${name}</strong>`;
                if (value !== undefined && fieldName) {
                    content += `<div style="color: #666; margin-top: 4px;">${fieldName}: <strong>${value.toLocaleString()}</strong></div>`;
                }
                
                infoDiv.innerHTML = content;
                infoDiv.style.display = 'block';
                
                // 定位弹窗 - 在手机上显示在底部
                if (window.innerWidth <= 600) {
                    infoDiv.style.left = '50%';
                    infoDiv.style.transform = 'translateX(-50%)';
                    infoDiv.style.bottom = '20px';
                    infoDiv.style.top = 'auto';
                } else {
                    infoDiv.style.left = (evt.originalEvent.clientX + 15) + 'px';
                    infoDiv.style.top = (evt.originalEvent.clientY - 10) + 'px';
                    infoDiv.style.transform = 'none';
                    infoDiv.style.bottom = 'auto';
                    
                    // 确保弹窗不超出视口
                    const rect = infoDiv.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        infoDiv.style.left = (evt.originalEvent.clientX - rect.width - 15) + 'px';
                    }
                    if (rect.bottom > window.innerHeight) {
                        infoDiv.style.top = (evt.originalEvent.clientY - rect.height - 10) + 'px';
                    }
                }
                
                map.getTargetElement().style.cursor = 'pointer';
            } else {
                infoDiv.style.display = 'none';
                map.getTargetElement().style.cursor = '';
            }
        });
    }
    
    // 点击/触摸事件 - 显示省份+换行+专题值
    map.on('click', function(evt) {
        const pixel = map.getEventPixel(evt.originalEvent);
        const hit = map.forEachFeatureAtPixel(pixel, function(feature) {
            return feature;
        });
        
        if (hit) {
            const name = hit.get('name') || hit.get('full_name') || hit.getProperties().full_name || hit.getProperties().name;
            const value = hit.get('dataValue');
            const fieldName = hit.get('fieldName');
            
            // 使用自定义弹窗而不是alert
            let content = `<strong style="color: #333; font-size: 18px;">${name}</strong>`;
            if (value !== undefined && fieldName) {
                content += `<div style="color: #666; margin-top: 8px; font-size: 15px;">${fieldName}</div>`;
                content += `<div style="color: #1890ff; font-size: 22px; font-weight: 600; margin-top: 4px;">${value.toLocaleString()}</div>`;
            }
            
            // 创建临时弹窗
            showCustomPopup(name, fieldName, value);
        }
    });
}

function showCustomPopup(name, fieldName, value) {
    // 移除旧的弹窗
    const oldPopup = document.getElementById('customPopup');
    if (oldPopup) oldPopup.remove();
    
    // 创建新弹窗
    const popup = document.createElement('div');
    popup.id = 'customPopup';
    popup.style.cssText = `
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 16px;
        padding: 24px;
        z-index: 2001;
        box-shadow: 0 10px 40px rgba(0,0,0,0.25);
        max-width: 320px;
        width: 90%;
        text-align: center;
        animation: popupIn 0.25s ease-out;
    `;
    
    // 添加动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes popupIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
    `;
    document.head.appendChild(style);
    
    let content = `<div style="font-size: 20px; font-weight: 700; color: #333; margin-bottom: 16px;">${name}</div>`;
    if (value !== undefined && fieldName) {
        content += `<div style="color: #999; font-size: 14px; margin-bottom: 8px;">${fieldName}</div>`;
        content += `<div style="color: #1890ff; font-size: 28px; font-weight: 700;">${value.toLocaleString()}</div>`;
    }
    
    content += `
        <button onclick="document.getElementById('customPopup').remove(); document.getElementById('popupOverlay').remove();" 
                style="margin-top: 24px; padding: 12px 32px; background: #1890ff; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%;">
            确定
        </button>
    `;
    
    popup.innerHTML = content;
    document.body.appendChild(popup);
    
    // 遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'popupOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.4);
        z-index: 2000;
    `;
    overlay.onclick = function() {
        popup.remove();
        overlay.remove();
    };
    document.body.appendChild(overlay);
}



// 多字段选择相关变量
let selectedMultiFields = [];

// 渲染模式切换事件处理
document.addEventListener('DOMContentLoaded', function() {
    const radioButtons = document.querySelectorAll('input[name="renderMode"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', onRenderModeChange);
    });
});

function onRenderModeChange() {
    const mode = document.querySelector('input[name="renderMode"]:checked').value;

    document.getElementById('singleFieldSection').style.display = 'none';
    document.getElementById('multiFieldSection').style.display = 'none';
    document.getElementById('expressionSection').style.display = 'none';
    document.getElementById('multiRenderSection').style.display = 'none';

    document.getElementById('singleClassifySection').style.display = 'none';
    document.getElementById('multiClassifySection').style.display = 'none';
    document.getElementById('timelineClassifySection').style.display = 'none';

    document.getElementById('singleColorSection').style.display = 'none';
    document.getElementById('multiColorSection').style.display = 'none';
    document.getElementById('timelineColorSection').style.display = 'none';

    switch(mode) {
        case 'single':
            document.getElementById('singleFieldSection').style.display = 'block';
            document.getElementById('singleClassifySection').style.display = 'block';
            document.getElementById('singleColorSection').style.display = 'block';
            hideTimeline();
            break;
        case 'expression':
            document.getElementById('expressionSection').style.display = 'block';
            document.getElementById('singleClassifySection').style.display = 'block';
            document.getElementById('singleColorSection').style.display = 'block';
            hideTimeline();
            break;
        case 'multi':
            document.getElementById('multiFieldSection').style.display = 'block';
            document.getElementById('multiRenderSection').style.display = 'block';
            document.getElementById('multiClassifySection').style.display = 'block';
            document.getElementById('multiColorSection').style.display = 'block';
            hideTimeline();
            break;
        case 'timeline':
            document.getElementById('timelineClassifySection').style.display = 'block';
            document.getElementById('timelineColorSection').style.display = 'block';
            break;
    }
}

function getCurrentClassifyMethod() {
    const mode = document.querySelector('input[name="renderMode"]:checked').value;
    switch(mode) {
        case 'multi':
            return document.getElementById('multiClassifyMethod').value;
        case 'timeline':
            return document.getElementById('timelineClassifyMethod').value;
        default:
            return document.getElementById('classifyMethod').value;
    }
}

function getCurrentColorScheme() {
    const mode = document.querySelector('input[name="renderMode"]:checked').value;
    switch(mode) {
        case 'multi':
            return document.getElementById('multiColorScheme').value;
        case 'timeline':
            return document.getElementById('timelineColorScheme').value;
        default:
            return document.getElementById('colorScheme').value;
    }
}

function updateMultiFieldPanel(fields) {
    const container = document.getElementById('multiFieldList');
    if (!container) return;
    
    container.innerHTML = '';
    
    const numericFields = fields.filter(f => f.type === 'REAL' || f.type === 'INTEGER');
    numericFields.forEach((field, index) => {
        const isSelected = selectedMultiFields.includes(field.name);
        
        const checkbox = document.createElement('label');
        checkbox.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px; 
            padding: 4px 8px; margin: 2px; background: #f8f9fa; 
            border-radius: 4px; cursor: pointer; font-size: 12px;
        `;
        
        checkbox.innerHTML = `
            <input type="checkbox" ${isSelected ? 'checked' : ''} 
                   onchange="toggleMultiField('${field.name}')" 
                   style="width: 14px; height: 14px;">
            <span>${field.label || field.name}</span>
        `;
        
        container.appendChild(checkbox);
    });
}

function toggleMultiField(fieldName) {
    const idx = selectedMultiFields.indexOf(fieldName);
    if (idx > -1) {
        selectedMultiFields.splice(idx, 1);
    } else {
        selectedMultiFields.push(fieldName);
    }
}

function selectAllMultiFields() {
    const fields = document.querySelectorAll('#multiFieldList input[type="checkbox"]');
    fields.forEach(field => {
        field.checked = true;
        const fieldName = field.nextElementSibling.textContent;
        if (!selectedMultiFields.includes(fieldName)) {
            selectedMultiFields.push(fieldName);
        }
    });
}

function deselectAllMultiFields() {
    const fields = document.querySelectorAll('#multiFieldList input[type="checkbox"]');
    fields.forEach(field => {
        field.checked = false;
    });
    selectedMultiFields = [];
}

console.log('[Debug] thematic_map.js loaded!');

// 关闭图例功能（只移除图例，不删除专题图层）
function closeLegend(legendElement) {
    if (!legendElement) {
        legendElement = getActiveLegend();
    }
    
    if (!legendElement) return;
    
    // 直接移除图例元素
    legendElement.remove();
    
    // 更新图例计数
    updateLegendCount();
    
    // 如果没有图例了，隐藏图例面板
    const axesContainer = document.getElementById('legendAxesContainer');
    const legendPanel = document.getElementById('legendPanel');
    if (axesContainer && legendPanel) {
        const remainingLegends = axesContainer.querySelectorAll('.legend-axis');
        if (remainingLegends.length === 0) {
            legendPanel.style.display = 'none';
        }
    }
}

// 最小化图例功能
function toggleLegendMinimize(legendElement) {
    if (!legendElement) return;
    
    const buttons = legendElement.querySelectorAll('.axis-control-btn');
    const btn = buttons.length > 0 ? buttons[0] : null; // 第一个按钮是最小化/展开
    
    legendElement.classList.toggle('minimized');
    
    if (legendElement.classList.contains('minimized')) {
        if (btn) {
            btn.textContent = '+';
            btn.title = '展开';
        }
    } else {
        if (btn) {
            btn.textContent = '−';
            btn.title = '最小化';
        }
    }
}

// 实时更新地图上的专题图层样式
function updateMapStyles(targetLayer) {
    if (!targetLayer) return;
    
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    const colorScheme = getCurrentColorScheme();
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const classCount = currentBreaks.length - 1;
    
    if (renderType !== 'point') return;
    
    const source = targetLayer.getSource();
    const features = source.getFeatures();
    
    features.forEach(feature => {
        const value = feature.get('value');
        if (value === undefined || value === null || currentBreaks.length === 0) return;
        
        let colorIndex = 0;
        for (let i = 0; i < currentBreaks.length - 1; i++) {
            if (value >= currentBreaks[i] && value <= currentBreaks[i + 1]) {
                colorIndex = i;
                break;
            }
        }
        
        const isSizeOnly = colorScheme === 'size_only';
        const minSize = pointSize * 0.2;
        const maxSize = isSizeOnly ? pointSize * 2.5 : pointSize;
        const size = minSize + (maxSize - minSize) * (colorIndex / (classCount - 1 || 1));
        
        const color = colorScale[colorIndex] || [200, 200, 200];
        const fillColor = isSizeOnly ? 
            `rgba(66, 146, 198, ${opacity})` : 
            `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
        
        const style = new ol.style.Style({
            image: new ol.style.Circle({
                radius: size,
                fill: new ol.style.Fill({
                    color: fillColor
                }),
                stroke: new ol.style.Stroke({
                    color: 'rgba(0, 0, 0, 0.5)',
                    width: borderWidth
                })
            })
        });
        
        feature.setStyle(style);
    });
}

// 开始拖动图例
function startDragLegend(e, legendElement) {
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingLegend = true;
    hasMoved = false;
    dragLegendElement = legendElement;
    
    // 设置图例为绝对定位
    legendElement.style.position = 'fixed';
    legendElement.style.zIndex = '1000';
    
    // 获取鼠标开始位置
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    dragStartX = clientX;
    dragStartY = clientY;
    
    // 获取图例当前位置
    const rect = legendElement.getBoundingClientRect();
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
    
    legendElement.classList.add('dragging');
    
    // 添加事件监听器
    document.addEventListener('mousemove', doDragLegend);
    document.addEventListener('mouseup', endDragLegend);
    document.addEventListener('touchmove', doDragLegend, { passive: false });
    document.addEventListener('touchend', endDragLegend);
}

// 拖动图例
function doDragLegend(e) {
    if (!isDraggingLegend || !dragLegendElement) return;
    
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // 计算移动距离
    const deltaX = clientX - dragStartX;
    const deltaY = clientY - dragStartY;
    
    // 如果移动距离大于5px，才算真正的拖动
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
    }
    
    // 更新位置
    dragLegendElement.style.left = (dragStartLeft + deltaX) + 'px';
    dragLegendElement.style.top = (dragStartTop + deltaY) + 'px';
    dragLegendElement.style.bottom = 'auto';
}

// 结束拖动图例
function endDragLegend() {
    if (isDraggingLegend) {
        isDraggingLegend = false;
        
        if (dragLegendElement) {
            dragLegendElement.classList.remove('dragging');
        }
        
        // 延迟重置 hasMoved，防止拖动结束后的点击事件触发折叠
        setTimeout(() => {
            hasMoved = false;
        }, 100);
        
        // 移除事件监听器
        document.removeEventListener('mousemove', doDragLegend);
        document.removeEventListener('mouseup', endDragLegend);
        document.removeEventListener('touchmove', doDragLegend);
        document.removeEventListener('touchend', endDragLegend);
    }
    
    dragLegendElement = null;
}

// ========== 图例面板操作函数 ==========

function initLegendPanel() {
    const legendPanel = document.getElementById('legendPanel');
    const header = document.getElementById('legendPanelHeader');
    
    if (header) {
        header.addEventListener('mousedown', startDragLegendPanel);
        header.addEventListener('touchstart', startDragLegendPanel, { passive: false });
    }
    
    // 初始化隐藏状态
    updateLegendCount();
}

function startDragLegendPanel(e) {
    e.preventDefault();
    const legendPanel = document.getElementById('legendPanel');
    if (!legendPanel) return;
    
    isDraggingLegendPanel = true;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    legendPanelStartX = clientX;
    legendPanelStartY = clientY;
    
    const rect = legendPanel.getBoundingClientRect();
    legendPanelStartLeft = rect.left;
    legendPanelStartTop = rect.top;
    
    legendPanel.style.position = 'fixed';
    legendPanel.classList.add('dragging');
    
    document.addEventListener('mousemove', doDragLegendPanel);
    document.addEventListener('mouseup', endDragLegendPanel);
    document.addEventListener('touchmove', doDragLegendPanel, { passive: false });
    document.addEventListener('touchend', endDragLegendPanel);
}

function doDragLegendPanel(e) {
    if (!isDraggingLegendPanel) return;
    
    e.preventDefault();
    
    const legendPanel = document.getElementById('legendPanel');
    if (!legendPanel) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - legendPanelStartX;
    const deltaY = clientY - legendPanelStartY;
    
    let newLeft = legendPanelStartLeft + deltaX;
    let newTop = legendPanelStartTop + deltaY;
    
    // 限制在视口内
    const panelWidth = legendPanel.offsetWidth;
    const panelHeight = legendPanel.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    newLeft = Math.max(10, Math.min(newLeft, viewportWidth - panelWidth - 10));
    newTop = Math.max(10, Math.min(newTop, viewportHeight - panelHeight - 10));
    
    legendPanel.style.left = newLeft + 'px';
    legendPanel.style.top = newTop + 'px';
    legendPanel.style.bottom = 'auto';
    legendPanel.style.transform = 'none';
}

function endDragLegendPanel() {
    if (isDraggingLegendPanel) {
        isDraggingLegendPanel = false;
        
        const legendPanel = document.getElementById('legendPanel');
        if (legendPanel) {
            legendPanel.classList.remove('dragging');
        }
        
        document.removeEventListener('mousemove', doDragLegendPanel);
        document.removeEventListener('mouseup', endDragLegendPanel);
        document.removeEventListener('touchmove', doDragLegendPanel);
        document.removeEventListener('touchend', endDragLegendPanel);
    }
}

function toggleLegendPanelMinimize() {
    const legendPanel = document.getElementById('legendPanel');
    const legendAxesContainer = document.getElementById('legendAxesContainer');
    const legendMinimizeBtn = document.getElementById('legendMinimizeBtn');
    const legendPanelTitle = document.getElementById('legendPanelTitle');
    
    if (!legendPanel) return;
    
    legendPanel.classList.toggle('minimized');
    
    if (legendPanel.classList.contains('minimized')) {
        legendAxesContainer.style.display = 'none';
        legendMinimizeBtn.textContent = '+';
        legendMinimizeBtn.title = '展开';
        legendPanelTitle.innerHTML = '<span>📊</span><span>图例</span>';
    } else {
        legendAxesContainer.style.display = 'flex';
        legendMinimizeBtn.textContent = '−';
        legendMinimizeBtn.title = '最小化';
        legendPanelTitle.innerHTML = '<span>📊</span><span>图例面板</span><span id="legendCount" style="font-size: 12px; color: #999; font-weight: 400;">(' + thematicLayers.length + ')</span>';
    }
}

function hideLegendPanel() {
    const legendPanel = document.getElementById('legendPanel');
    const showLegendBtn = document.getElementById('showLegendBtn');
    const toolbar = document.querySelector('.toolbar');
    
    if (legendPanel) {
        legendPanel.style.display = 'none';
    }
    
    if (showLegendBtn) {
        showLegendBtn.style.display = 'flex';
        // 添加到工具栏
        if (toolbar) {
            toolbar.appendChild(showLegendBtn);
        }
    }
}

function showLegendPanel() {
    const legendPanel = document.getElementById('legendPanel');
    const showLegendBtn = document.getElementById('showLegendBtn');
    
    if (legendPanel) {
        legendPanel.style.display = 'block';
        // 重置位置到底部中央（如果之前被拖动过）
        legendPanel.style.position = 'fixed';
        legendPanel.style.left = '50%';
        legendPanel.style.top = 'auto';
        legendPanel.style.bottom = '20px';
        legendPanel.style.transform = 'translateX(-50%)';
    }
    
    if (showLegendBtn) {
        showLegendBtn.style.display = 'none';
    }
}

function updateLegendCount() {
    const legendCount = document.getElementById('legendCount');
    if (legendCount) {
        legendCount.textContent = '(' + thematicLayers.length + ')';
    }
}
