let map;
let thematicLayers = []; // 支持多个专题图层
let baseProvinceLayer;
let geoJsonData = {};
let isPanelOpen = false;
let currentBreaks = [];
let currentData = []; // 保存当前加载的数据
let currentLayerId = 0; // 当前图层ID
let currentLegendLayerId = null; // 记录当前图例对应的图层ID

// 图例拖动相关变量
let isDraggingLegend = false;
let dragLegendElement = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartLeft = 0;
let dragStartTop = 0;

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
    
    const colorScheme = document.getElementById('colorScheme').value;
    
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
        
        // 更新可用字段按钮
        updateFieldButtons(fields);
    } catch (error) {
        console.error('[Debug] 加载字段失败:', error);
        alert('加载字段失败: ' + error.message);
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
    const fieldSelectValue = document.getElementById('fieldSelect').value;
    const expression = document.getElementById('expressionInput').value;
    const level = document.getElementById('levelSelect').value;
    const overlayMode = document.getElementById('overlayMode')?.checked || false;
    
    const isExpression = fieldSelectValue === 'expression';
    
    let fieldName = fieldSelectValue;
    let exprStr = expression;
    
    if (isExpression) {
        const parsed = parseExpression(expression);
        exprStr = parsed.expr;
        fieldName = parsed.name;
    }
    
    console.log('[Debug] Parameters:', { tableName, fieldName, exprStr, level, isExpression, overlayMode });
    
    if (!tableName || (!fieldSelectValue || (isExpression && !expression))) {
        alert(isExpression ? '请输入表达式' : '请选择数据表和字段');
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
    console.log('[Debug] createStyledFeatures() called');
    console.log('[Debug] Level:', level, 'GeoJSON features:', geoJson.features?.length, 'Data rows:', data.length);
    console.log('[Debug] Field name:', fieldName);
    
    const values = data.map(item => {
        const val = parseFloat(item[fieldName]);
        return isNaN(val) ? null : val;
    }).filter(v => v !== null);
    
    console.log('[Debug] Parsed values (first 10):', values.slice(0, 10));
    
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const classifyMethod = document.getElementById('classifyMethod').value;
    const classCount = parseInt(document.getElementById('classCount').value);
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    
    let breaks = [];
    if (values.length > 0) {
        breaks = classifyMethods[classifyMethod](values, classCount);
        currentBreaks = breaks;
    }
    
    console.log('[Debug] Classify method:', classifyMethod, 'Classes:', classCount, 'Breaks:', breaks);
    
    const features = [];
    
    let matchedCount = 0;
    
    // 输出前几个匹配样本用于调试
    console.log('[Debug] GeoJSON sample names (first 5):');
    for (let i = 0; i < Math.min(5, geoJson.features.length); i++) {
        const name = geoJson.features[i].properties.full_name || geoJson.features[i].properties.name;
        console.log(`  ${i + 1}: ${name}`);
    }
    console.log('[Debug] Data sample names (first 5):');
    for (let i = 0; i < Math.min(5, data.length); i++) {
        // 处理可能的BOM字符
        let name;
        if (level === 'country') {
            name = data[i]['name'];
        } else {
            name = data[i]['省份'] || data[i]['地区'] || data[i]['省（区、市）'] || data[i]['name'];
        }
        // 尝试处理带BOM的字段名
        if (!name) {
            const keys = Object.keys(data[i]);
            for (const key of keys) {
                if (key.includes('省份') || key.includes('省') || key.trim() === '省份') {
                    name = data[i][key];
                    break;
                }
            }
        }
        console.log(`  ${i + 1}: ${name}`);
    }
    
    geoJson.features.forEach((feature, index) => {
        const name = feature.properties.full_name || feature.properties.name;
        
        // 改进的匹配逻辑 - 根据级别选择匹配字段
        const dataItem = data.find(item => {
            let dataName = '';
            const keys = Object.keys(item);
            
            if (level === 'country') {
                // 国家级别：使用iso_a3字段精确匹配
                const geoCode = feature.properties.iso_a3;
                if (!geoCode) {
                    return false;
                }
                // 尝试各种可能的iso3字段名
                const keys = Object.keys(item);
                for (const key of keys) {
                    if (key.toLowerCase().includes('iso') && key.toLowerCase().includes('3')) {
                        if (item[key] === geoCode) {
                            return true;
                        }
                    }
                }
                return false;
            } else {
                // 省级/市级：尝试各种字段
                for (const key of keys) {
                    // 去除BOM字符和空白
                    const cleanKey = key.replace(/^\uFEFF|\uFFFE|\ufeff/g, '').trim();
                    if (cleanKey === '省份' || cleanKey === '地区' || cleanKey === '省（区、市）' || cleanKey === 'name') {
                        dataName = item[key];
                        break;
                    }
                    if (key.includes('省')) {
                        dataName = item[key];
                        break;
                    }
                }
                
                // 精确匹配
                if (item['地区'] === name || 
                    item['省（区、市）'] === name || 
                    item['省份'] === name ||
                    item['name'] === name ||
                    dataName === name) {
                    return true;
                }
                
                // 简化后的名称匹配（去掉"省"、"市"、"自治区"等后缀）
                const normalize = (s) => s.replace(/[省市区自治区特别行政区]+$/, '').trim();
                if (normalize(name) === normalize(dataName)) {
                    return true;
                }
                
                return false;
            }
        });
        
        if (dataItem) {
            matchedCount++;
            // 输出前几个匹配的样本
            if (matchedCount <= 5) {
                console.log(`[Debug] Match ${matchedCount}: ${name}`);
            }
        }
        
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
        
        // 直接设置样式，而不是通过属性
        olFeature.setStyle(style);
        olFeature.set('name', name);
        olFeature.set('value', value);
        olFeature.set('dataValue', value);
        olFeature.set('fieldName', fieldName);
        features.push(olFeature);
    });
    
    console.log('[Debug] Data matching:', matchedCount, '/', geoJson.features.length, 'features matched');
    console.log('[Debug] Data sample:', data.slice(0, 3));
    console.log('[Debug] GeoJSON properties sample:', geoJson.features[0]?.properties);
    
    return features;
}

function updateLegend(breaks, fieldName) {
    console.log('[Debug] updateLegend() called');
    console.log('[Debug] Breaks:', breaks, 'Field:', fieldName);
    
    const colorScheme = document.getElementById('colorScheme').value;
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
    
    if (legendElement) {
        legendElement.style.display = 'block';
    }
}

function updateAxisLegend(breaks, colorScale, classCount) {
    const container = document.getElementById('axisContainer');
    const track = document.getElementById('axisTrack');
    const labelMax = document.getElementById('axisLabelMax');
    const labelMin = document.getElementById('axisLabelMin');
    const colorScheme = document.getElementById('colorScheme').value;
    
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

let isDragging = false;
let isAxisDragging = false;
let dragIndex = -1;
let dragTrack = null;
let dragLegendElement = null;

function startAxisDrag(e) {
    e.preventDefault();
    isAxisDragging = true;
    dragIndex = parseInt(e.target.dataset.index);
    
    dragLegendElement = e.target.closest('.legend-axis');
    if (!dragLegendElement) return;
    
    dragTrack = dragLegendElement.querySelector('.axis-container');
    
    document.addEventListener('mousemove', doAxisDrag);
    document.addEventListener('mouseup', endAxisDrag);
    document.addEventListener('touchmove', doAxisDrag, { passive: false });
    document.addEventListener('touchend', endAxisDrag);
}

function doAxisDrag(e) {
    if (!isAxisDragging || !dragTrack || !dragLegendElement) return;
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
    
    updateAxisLegendBar(dragLegendElement);
    
    const layerId = parseInt(dragLegendElement.dataset.layerId);
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
        
        if (dragLegendElement && currentBreaks.length > 0) {
            const layerId = parseInt(dragLegendElement.dataset.layerId);
            const targetLayer = thematicLayers.find(l => l.get('id') === layerId);
            
            if (targetLayer) {
                applyThematicLayerWithBreaks(currentBreaks, targetLayer);
            }
        }
    }
    dragIndex = -1;
    dragTrack = null;
    dragLegendElement = null;
}

function updateAxisLegendBar(legendElement) {
    if (!legendElement) return;
    
    const colorScheme = document.getElementById('colorScheme').value;
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
        const classifyMethod = document.getElementById('classifyMethod').value;
        
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
        
        const colorScheme = document.getElementById('colorScheme').value;
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
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    
    const features = [];
    
    geoJson.features.forEach((feature) => {
        const name = feature.properties.full_name || feature.properties.name;
        
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

function findDataItem(data, name, level, isoCode) {
    if (level === 'country') {
        if (!isoCode) return null;
        const keys = Object.keys(data[0] || {});
        for (const item of data) {
            for (const key of keys) {
                if (key.toLowerCase().includes('iso') && key.toLowerCase().includes('3')) {
                    if (item[key] === isoCode) {
                        return item;
                    }
                }
            }
        }
        return null;
    } else {
        for (const item of data) {
            const keys = Object.keys(item);
            let dataName = '';
            for (const key of keys) {
                const cleanKey = key.replace(/^\uFEFF|\uFFFE|\ufeff/g, '').trim();
                if (cleanKey === '省份' || cleanKey === '地区' || cleanKey === '省（区、市）' || cleanKey === 'name') {
                    dataName = item[key];
                    break;
                }
            }
            
            if (item['地区'] === name || item['省（区、市）'] === name || 
                item['省份'] === name || item['name'] === name || dataName === name) {
                return item;
            }
            
            const normalize = (s) => s.replace(/[省市区自治区特别行政区]+$/, '').trim();
            if (normalize(name) === normalize(dataName)) {
                return item;
            }
        }
        return null;
    }
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
        
        if (window.innerWidth <= 600) {
            // 手机端不自动收起面板，让用户更容易操作
            // togglePanel();
            showMobileHint();
        }

        // 添加地图交互
        addMapInteractions();

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



console.log('[Debug] thematic_map.js loaded!');

// 关闭图例功能（隐藏单个图例并删除对应图层）
function closeLegend(legendElement) {
    if (!legendElement) {
        legendElement = getActiveLegend();
    }
    
    if (!legendElement) return;
    
    const layerId = parseInt(legendElement.dataset.layerId);
    
    legendElement.style.display = 'none';
    
    if (layerId) {
        removeThematicLayer(layerId);
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
    const colorScheme = document.getElementById('colorScheme').value;
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
        
        // 移除事件监听器
        document.removeEventListener('mousemove', doDragLegend);
        document.removeEventListener('mouseup', endDragLegend);
        document.removeEventListener('touchmove', doDragLegend);
        document.removeEventListener('touchend', endDragLegend);
    }
    
    dragLegendElement = null;
}
