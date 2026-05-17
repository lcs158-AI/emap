let map;
let thematicLayer;
let baseProvinceLayer;
let geoJsonData = {};
let isPanelOpen = false;

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
    ]
};

function initMap() {
    console.log('[Debug] initMap() called');
    try {
        console.log('[Debug] Creating OpenLayers map...');
        map = new ol.Map({
            target: 'map',
            layers: [],
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
    
    const isExpression = fieldSelectValue === 'expression';
    
    let fieldName = fieldSelectValue;
    let exprStr = expression;
    
    if (isExpression) {
        const parsed = parseExpression(expression);
        exprStr = parsed.expr;
        fieldName = parsed.name;
    }
    
    console.log('[Debug] Parameters:', { tableName, fieldName, exprStr, level, isExpression });
    
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
        
        console.log('[Debug] Creating styled features...');
        const styledFeatures = createStyledFeatures(geoJson, processedData, fieldName, level);
        console.log('[Debug] Created', styledFeatures.length, 'styled features');
        
        // 移除基础地图图层
        if (baseProvinceLayer) {
            console.log('[Debug] Removing base province layer');
            map.removeLayer(baseProvinceLayer);
            baseProvinceLayer = null;
        }
        
        if (thematicLayer) {
            console.log('[Debug] Removing existing thematic layer');
            map.removeLayer(thematicLayer);
        }
        
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
        
        thematicLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                features: styledFeatures
            }),
            zIndex: 100,
            style: function(feature) {
                const style = feature.getStyle();
                console.log('[Debug] Layer style function called for feature:', feature.get('name'));
                return style;
            }
        });
        
        // 直接为每个要素设置样式，而不是依赖属性
        styledFeatures.forEach(feature => {
            feature.setStyle(feature.getStyle());
        });
        
        map.addLayer(thematicLayer);
        console.log('[Debug] Thematic layer added to map, layers count:', map.getLayers().getLength());
        
        // 验证图层是否正确添加
        setTimeout(() => {
            const layers = map.getLayers().getArray();
            console.log('[Debug] All layers:', layers.map(l => l.get('name') || 'unnamed'));
            console.log('[Debug] Thematic layer in map:', map.getLayers().getArray().includes(thematicLayer));
        }, 500);
        
        // 调整视图以适应数据范围
        const extent = thematicLayer.getSource().getExtent();
        if (extent && extent.length === 4) {
            console.log('[Debug] Fitting view to extent:', extent);
            map.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 10
            });
        }
        
        updateLegend(processedData, fieldName);
        document.getElementById('dataInfo').innerHTML = `数据记录: ${processedData.length} 条 | 数据来源: ${data.table_label}`;
        
    } catch (error) {
        console.error('[Debug] 应用专题图层失败:', error);
        alert('加载数据失败，请重试: ' + error.message);
    } finally {
        document.getElementById('loadingPanel').style.display = 'none';
    }
}

function createStyledFeatures(geoJson, data, fieldName, level) {
    console.log('[Debug] createStyledFeatures() called');
    console.log('[Debug] Level:', level, 'GeoJSON features:', geoJson.features?.length, 'Data rows:', data.length);
    console.log('[Debug] Field name:', fieldName);
    
    // 解析数值
    const values = data.map(item => {
        const val = parseFloat(item[fieldName]);
        return isNaN(val) ? null : val;
    }).filter(v => v !== null);
    
    console.log('[Debug] Parsed values (first 10):', values.slice(0, 10));
    
    let min = 0, max = 1, range = 1;
    if (values.length > 0) {
        min = Math.min(...values);
        max = Math.max(...values);
        range = max - min || 1;
    }
    
    console.log('[Debug] Data values - min:', min, 'max:', max, 'range:', range, 'valid values:', values.length);
    
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    console.log('[Debug] Color scheme:', colorScheme, 'Scale length:', colorScale.length);
    
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    
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
        let name = data[i]['省份'] || data[i]['地区'] || data[i]['省（区、市）'] || data[i]['name'];
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
        
        // 改进的匹配逻辑
        const dataItem = data.find(item => {
            // 处理可能的BOM字符和各种字段名变体
            let dataName = '';
            const keys = Object.keys(item);
            
            // 尝试各种可能的字段名
            for (const key of keys) {
                // 去除BOM字符和空白
                const cleanKey = key.replace(/^\uFEFF|\uFFFE|\ufeff/g, '').trim();
                if (cleanKey === '省份' || cleanKey === '地区' || cleanKey === '省（区、市）' || cleanKey === 'name') {
                    dataName = item[key];
                    break;
                }
                // 也检查包含"省"字的字段
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
        });
        
        if (dataItem) {
            matchedCount++;
            // 输出前几个匹配的样本
            if (matchedCount <= 5) {
                console.log(`[Debug] Match ${matchedCount}: ${name}`);
            }
        }
        
        let value = 0;
        if (dataItem && dataItem[fieldName] !== undefined && dataItem[fieldName] !== null && dataItem[fieldName] !== '') {
            value = parseFloat(dataItem[fieldName]);
            if (isNaN(value)) {
                value = 0;
            }
        }
        
        let normalized = 0;
        if (range > 0) {
            normalized = (value - min) / range;
            normalized = Math.max(0, Math.min(normalized, 1));
        }
        
        const colorIndex = Math.max(0, Math.min(Math.floor(normalized * (colorScale.length - 1)), colorScale.length - 1));
        const color = colorScale[colorIndex] || [200, 200, 200];
        
        let style;
        
        if (renderType === 'point') {
            const size = pointSize * (0.5 + normalized * 0.5);
            style = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: size,
                    fill: new ol.style.Fill({
                        color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`
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
        
        const olFeature = new ol.format.GeoJSON().readFeature(feature, {
            featureProjection: 'EPSG:3857'
        });
        
        if (renderType === 'point') {
            const centroid = ol.extent.getCenter(olFeature.getGeometry().getExtent());
            const pointGeom = new ol.geom.Point(centroid);
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

function updateLegend(data, fieldName) {
    console.log('[Debug] updateLegend() called');
    console.log('[Debug] Data length:', data.length, 'Field:', fieldName);
    
    const values = data.map(item => parseFloat(item[fieldName])).filter(v => !isNaN(v));
    console.log('[Debug] Valid values for legend:', values.length);
    
    let min = 0, max = 1;
    if (values.length > 0) {
        min = Math.min(...values);
        max = Math.max(...values);
    } else {
        console.warn('[Debug] No valid values found for legend!');
    }
    
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    
    const legend = document.getElementById('legend');
    legend.innerHTML = '<div class="section-title">图例</div>';
    
    for (let i = 0; i < colorScale.length; i++) {
        const color = colorScale[i] || [200, 200, 200];
        const value = min + (max - min) * (i / (colorScale.length - 1));
        
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background: rgb(${color[0]}, ${color[1]}, ${color[2]})"></div>
            <span>${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</span>
        `;
        legend.appendChild(item);
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
        
        document.getElementById('tableSelect').addEventListener('change', onTableChange);
        
        if (window.innerWidth <= 600) {
            // 手机端不自动收起面板，让用户更容易操作
            // togglePanel();
            showMobileHint();
        }

        // 加载并显示省级地图作为底图
        loadAndShowProvinceMap();

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

async function loadAndShowProvinceMap() {
    console.log('[Debug] loadAndShowProvinceMap() called');
    
    try {
        const geoJson = await loadGeoJson('province');
        
        if (geoJson) {
            console.log('[Debug] Creating base province map layer');
            
            const vectorSource = new ol.source.Vector({
                features: new ol.format.GeoJSON().readFeatures(geoJson, {
                    featureProjection: 'EPSG:3857'
                })
            });
            
            baseProvinceLayer = new ol.layer.Vector({
                source: vectorSource,
                style: new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(200, 200, 200, 0.3)'
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#999',
                        width: 1
                    })
                })
            });
            
            map.addLayer(baseProvinceLayer);
            console.log('[Debug] Base province map layer added');
        }
    } catch (error) {
        console.error('[Debug] Error loading base province map:', error);
    }
}

console.log('[Debug] thematic_map.js loaded!');
