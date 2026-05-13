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
    panel.style.display = isPanelOpen ? 'block' : 'none';
}

function updateSliderDisplay(sliderId, valueId, unit) {
    const slider = document.getElementById(sliderId);
    const value = document.getElementById(valueId);
    value.textContent = slider.value + unit;
}

async function loadTables() {
    console.log('[Debug] loadTables() called');
    try {
        const url = `${API_BASE_URL}/api/thematic/tables`;
        console.log('[Debug] Fetching tables from:', url);
        
        const response = await fetch(url);
        console.log('[Debug] Response status:', response.status);
        
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
        return;
    }
    
    try {
        const url = `${API_BASE_URL}/api/thematic/fields/${tableName}`;
        console.log('[Debug] Fetching fields from:', url);
        
        const response = await fetch(url);
        console.log('[Debug] Fields response status:', response.status);
        
        const fields = await response.json();
        console.log('[Debug] Fields received:', fields);
        
        const select = document.getElementById('fieldSelect');
        select.innerHTML = '<option value="">请选择字段</option>';
        fields.forEach(field => {
            if (field.type === 'REAL' || field.type === 'INTEGER') {
                const option = document.createElement('option');
                option.value = field.name;
                option.textContent = `${field.label} (${field.unit || ''})`;
                select.appendChild(option);
            }
        });
        console.log('[Debug] Fields loaded into dropdown');
    } catch (error) {
        console.error('[Debug] 加载字段失败:', error);
        alert('加载字段失败: ' + error.message);
    }
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

async function applyThematicLayer() {
    console.log('[Debug] applyThematicLayer() called');
    const tableName = document.getElementById('tableSelect').value;
    const fieldName = document.getElementById('fieldSelect').value;
    const level = document.getElementById('levelSelect').value;
    
    console.log('[Debug] Parameters:', { tableName, fieldName, level });
    
    if (!tableName || !fieldName) {
        alert('请选择数据表和字段');
        return;
    }

    document.getElementById('loadingPanel').style.display = 'block';
    
    try {
        console.log('[Debug] Fetching GeoJSON and data...');
        const [geoJson, data] = await Promise.all([
            loadGeoJson(level),
            fetch(`${API_BASE_URL}/api/thematic/data/${tableName}`).then(r => r.json())
        ]);
        
        console.log('[Debug] GeoJSON loaded:', !!geoJson);
        console.log('[Debug] Data loaded:', data);
        
        if (!geoJson || !data) {
            console.error('[Debug] GeoJSON or data is null!');
            return;
        }
        
        console.log('[Debug] Creating styled features...');
        const styledFeatures = createStyledFeatures(geoJson, data.data, fieldName, level);
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
            console.log('[Debug] First feature style:', firstFeature.get('style'));
        }
        
        thematicLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                features: styledFeatures
            }),
            style: function(feature) {
                const s = feature.get('style');
                return s;
            }
        });
        
        map.addLayer(thematicLayer);
        console.log('[Debug] Thematic layer added to map, layers count:', map.getLayers().getLength());
        
        // 调整视图以适应数据范围
        const extent = thematicLayer.getSource().getExtent();
        if (extent && extent.length === 4) {
            console.log('[Debug] Fitting view to extent:', extent);
            map.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 10
            });
        }
        
        updateLegend(data.data, fieldName);
        document.getElementById('dataInfo').innerHTML = `数据记录: ${data.data.length} 条 | 数据来源: ${data.table_label}`;
        
    } catch (error) {
        console.error('[Debug] 应用专题图层失败:', error);
        alert('加载数据失败，请重试: ' + error.message);
    } finally {
        document.getElementById('loadingPanel').style.display = 'none';
    }
}

function createStyledFeatures(geoJson, data, fieldName, level) {
    console.log('[Debug] createStyledFeatures() called');
    
    const values = data.map(item => parseFloat(item[fieldName])).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    console.log('[Debug] Data values - min:', min, 'max:', max, 'range:', range);
    
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    console.log('[Debug] Color scheme:', colorScheme, 'Scale length:', colorScale.length);
    
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    
    const features = [];
    
    let matchedCount = 0;
    
    geoJson.features.forEach((feature, index) => {
        const name = feature.properties.full_name || feature.properties.name;
        const dataItem = data.find(item => 
            item['地区'] === name || 
            item['省（区、市）'] === name || 
            item['省份'] === name ||
            item['name'] === name
        );
        
        if (dataItem) {
            matchedCount++;
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
        
        olFeature.set('style', style);
        olFeature.set('name', name);
        olFeature.set('value', value);
        features.push(olFeature);
    });
    
    console.log('[Debug] Data matching:', matchedCount, '/', geoJson.features.length, 'features matched');
    console.log('[Debug] Data sample:', data.slice(0, 3));
    console.log('[Debug] GeoJSON properties sample:', geoJson.features[0]?.properties);
    
    return features;
}

function updateLegend(data, fieldName) {
    console.log('[Debug] updateLegend() called');
    
    const values = data.map(item => parseFloat(item[fieldName])).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    
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
            togglePanel();
        }
        
        // 加载并显示省级地图作为底图
        loadAndShowProvinceMap();
        
        console.log('[Debug] initThematicMap() completed!');
    } catch (error) {
        console.error('[Debug] Error during initialization:', error);
    }
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
