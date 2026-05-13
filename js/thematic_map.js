let map;
let thematicLayer;
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
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            })
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([104.1954, 35.8617]),
            zoom: 4
        })
    });
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
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/tables`);
        const tables = await response.json();
        
        const select = document.getElementById('tableSelect');
        select.innerHTML = '<option value="">请选择数据表</option>';
        tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table.name;
            option.textContent = table.label;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('加载数据表失败:', error);
    }
}

async function onTableChange() {
    const tableName = document.getElementById('tableSelect').value;
    if (!tableName) {
        document.getElementById('fieldSelect').innerHTML = '<option value="">请先选择数据表</option>';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/fields/${tableName}`);
        const fields = await response.json();
        
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
    } catch (error) {
        console.error('加载字段失败:', error);
    }
}

async function loadGeoJson(level) {
    if (geoJsonData[level]) return geoJsonData[level];
    
    const fileMap = {
        'country': 'geojson/world.json',
        'province': 'geojson/chn-level-1.json',
        'city': 'geojson/chn-level-2.json'
    };
    
    try {
        const response = await fetch(fileMap[level]);
        const data = await response.json();
        geoJsonData[level] = data;
        return data;
    } catch (error) {
        console.error('加载GeoJSON失败:', error);
        return null;
    }
}

async function applyThematicLayer() {
    const tableName = document.getElementById('tableSelect').value;
    const fieldName = document.getElementById('fieldSelect').value;
    const level = document.getElementById('levelSelect').value;
    
    if (!tableName || !fieldName) {
        alert('请选择数据表和字段');
        return;
    }

    document.getElementById('loadingPanel').style.display = 'block';
    
    try {
        const [geoJson, data] = await Promise.all([
            loadGeoJson(level),
            fetch(`${API_BASE_URL}/api/thematic/data/${tableName}`).then(r => r.json())
        ]);
        
        if (!geoJson || !data) return;
        
        const styledFeatures = createStyledFeatures(geoJson, data.data, fieldName, level);
        
        if (thematicLayer) {
            map.removeLayer(thematicLayer);
        }
        
        thematicLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                features: styledFeatures
            }),
            style: function(feature) {
                return feature.get('style');
            }
        });
        
        map.addLayer(thematicLayer);
        updateLegend(data.data, fieldName);
        document.getElementById('dataInfo').innerHTML = `数据记录: ${data.data.length} 条 | 数据来源: ${data.table_label}`;
        
    } catch (error) {
        console.error('应用专题图层失败:', error);
        alert('加载数据失败，请重试');
    } finally {
        document.getElementById('loadingPanel').style.display = 'none';
    }
}

function createStyledFeatures(geoJson, data, fieldName, level) {
    const values = data.map(item => parseFloat(item[fieldName])).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    const opacity = parseFloat(document.getElementById('opacitySlider').value) / 100;
    const pointSize = parseInt(document.getElementById('pointSizeSlider').value);
    const borderWidth = parseInt(document.getElementById('borderWidthSlider').value);
    const renderType = document.querySelector('input[name="renderType"]:checked').value;
    
    const features = [];
    
    geoJson.features.forEach(feature => {
        const name = feature.properties.name || feature.properties.full_name;
        const dataItem = data.find(item => 
            item['地区'] === name || 
            item['省（区、市）'] === name || 
            item['省份'] === name ||
            item['name'] === name
        );
        
        let value = 0;
        if (dataItem && dataItem[fieldName]) {
            value = parseFloat(dataItem[fieldName]);
        }
        
        const normalized = (value - min) / range;
        const colorIndex = Math.min(Math.floor(normalized * (colorScale.length - 1)), colorScale.length - 1);
        const color = colorScale[colorIndex];
        
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
        
        const olFeature = new ol.format.GeoJSON().readFeature(feature);
        
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
    
    return features;
}

function updateLegend(data, fieldName) {
    const values = data.map(item => parseFloat(item[fieldName])).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    const colorScheme = document.getElementById('colorScheme').value;
    const colorScale = colorSchemes[colorScheme] || colorSchemes.blue;
    
    const legend = document.getElementById('legend');
    legend.innerHTML = '<div class="section-title">图例</div>';
    
    for (let i = 0; i < colorScale.length; i++) {
        const color = colorScale[i];
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
    detectTouch();
    initMap();
    loadTables();
    
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
}