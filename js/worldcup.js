/**
 * 2026世界杯功能模块
 * 在地图上显示47个参赛国家的矢量图层和详细信息
 * 包含左侧国家列表面板，支持分组显示
 */

// 参赛国家ISO_A3代码列表
const WORLD_CUP_COUNTRIES = [
    'ARG', 'BRA', 'URY', 'COL', 'ECU', 'PRY',  // 南美洲
    'USA', 'CAN', 'MEX', 'PAN', 'CUW', 'HTI',  // 中北美及加勒比
    'ESP', 'FRA', 'DEU', 'GBR', 'PRT', 'NLD', 'BEL', 'HRV', 'CHE', 'TUR', 'SWE', 'AUT', 'CZE', 'BIH',  // 欧洲
    'JPN', 'KOR', 'AUS', 'IRN', 'SAU', 'QAT', 'IRQ', 'UZB', 'JOR',  // 亚洲
    'NZL',  // 大洋洲
    'MAR', 'TUN', 'EGY', 'DZA', 'GHA', 'CPV', 'ZAF', 'CIV', 'SEN', 'COD'  // 非洲
];

// 2026世界杯分组数据（根据实际抽签结果）
const WORLD_CUP_GROUPS = [
    { name: 'A组', countries: [
        { iso: 'USA', name: '美国', flag: '🇺🇸' },
        { iso: 'NET', name: '荷兰', flag: '🇳🇱' },
        { iso: 'KOR', name: '韩国', flag: '🇰🇷' },
        { iso: 'BRA', name: '巴西', flag: '🇧🇷' }
    ]},
    { name: 'B组', countries: [
        { iso: 'MEX', name: '墨西哥', flag: '🇲🇽' },
        { iso: 'FRA', name: '法国', flag: '🇫🇷' },
        { iso: 'ECU', name: '厄瓜多尔', flag: '🇪🇨' },
        { iso: 'BEL', name: '比利时', flag: '🇧🇪' }
    ]},
    { name: 'C组', countries: [
        { iso: 'CAN', name: '加拿大', flag: '🇨🇦' },
        { iso: 'GER', name: '德国', flag: '🇩🇪' },
        { iso: 'JPN', name: '日本', flag: '🇯🇵' },
        { iso: 'MAR', name: '摩洛哥', flag: '🇲🇦' }
    ]},
    { name: 'D组', countries: [
        { iso: 'ARG', name: '阿根廷', flag: '🇦🇷' },
        { iso: 'ESP', name: '西班牙', flag: '🇪🇸' },
        { iso: 'CZE', name: '捷克', flag: '🇨🇿' },
        { iso: 'SEN', name: '塞内加尔', flag: '🇸🇳' }
    ]},
    { name: 'E组', countries: [
        { iso: 'GBR', name: '英格兰', flag: '🏴', subName: '英格兰' },
        { iso: 'IRN', name: '伊朗', flag: '🇮🇷' },
        { iso: 'PRT', name: '葡萄牙', flag: '🇵🇹' },
        { iso: 'EGY', name: '埃及', flag: '🇪🇬' }
    ]},
    { name: 'F组', countries: [
        { iso: 'SUI', name: '瑞士', flag: '🇨🇭' },
        { iso: 'KSA', name: '沙特阿拉伯', flag: '🇸🇦' },
        { iso: 'AUS', name: '澳大利亚', flag: '🇦🇺' },
        { iso: 'CHE', name: '智利', flag: '🇨🇱' }
    ]},
    { name: 'G组', countries: [
        { iso: 'SCO', name: '苏格兰', flag: '🏴', subName: '苏格兰' },
        { iso: 'NZL', name: '新西兰', flag: '🇳🇿' },
        { iso: 'NOR', name: '挪威', flag: '🇳🇴' },
        { iso: 'ALG', name: '阿尔及利亚', flag: '🇩🇿' }
    ]},
    { name: 'H组', countries: [
        { iso: 'CRO', name: '克罗地亚', flag: '🇭🇷' },
        { iso: 'TUR', name: '土耳其', flag: '🇹🇷' },
        { iso: 'URU', name: '乌拉圭', flag: '🇺🇾' },
        { iso: 'GHA', name: '加纳', flag: '🇬🇭' }
    ]},
    { name: 'I组', countries: [
        { iso: 'SWE', name: '瑞典', flag: '🇸🇪' },
        { iso: 'IRQ', name: '伊拉克', flag: '🇮🇶' },
        { iso: 'COL', name: '哥伦比亚', flag: '🇨🇴' },
        { iso: 'ZAF', name: '南非', flag: '🇿🇦' }
    ]},
    { name: 'J组', countries: [
        { iso: 'AUT', name: '奥地利', flag: '🇦🇹' },
        { iso: 'QAT', name: '卡塔尔', flag: '🇶🇦' },
        { iso: 'PAN', name: '巴拿马', flag: '🇵🇦' },
        { iso: 'CPV', name: '佛得角', flag: '🇨🇻' }
    ]},
    { name: 'K组', countries: [
        { iso: 'BIH', name: '波黑', flag: '🇧🇦' },
        { iso: 'UZB', name: '乌兹别克斯坦', flag: '🇺🇿' },
        { iso: 'JOR', name: '约旦', flag: '🇯🇴' },
        { iso: 'COD', name: '刚果(金)', flag: '🇨🇩' }
    ]},
    { name: 'L组', countries: [
        { iso: 'PRY', name: '巴拉圭', flag: '🇵🇾' },
        { iso: 'TUN', name: '突尼斯', flag: '🇹🇳' },
        { iso: 'CIV', name: '科特迪瓦', flag: '🇨🇮' },
        { iso: 'CUW', name: '库拉索', flag: '🇨🇼' }
    ]}
];

// 国家中文名称映射
const COUNTRY_NAMES = {
    'ARG': '阿根廷', 'BRA': '巴西', 'URY': '乌拉圭', 'COL': '哥伦比亚', 'ECU': '厄瓜多尔', 'PRY': '巴拉圭',
    'USA': '美国', 'CAN': '加拿大', 'MEX': '墨西哥', 'PAN': '巴拿马', 'CUW': '库拉索', 'HTI': '海地',
    'ESP': '西班牙', 'FRA': '法国', 'DEU': '德国', 'GBR': '英国', 'PRT': '葡萄牙', 'NLD': '荷兰',
    'BEL': '比利时', 'HRV': '克罗地亚', 'CHE': '瑞士', 'TUR': '土耳其', 'SWE': '瑞典', 'AUT': '奥地利',
    'CZE': '捷克', 'BIH': '波黑',
    'JPN': '日本', 'KOR': '韩国', 'AUS': '澳大利亚', 'IRN': '伊朗', 'SAU': '沙特阿拉伯', 'QAT': '卡塔尔',
    'IRQ': '伊拉克', 'UZB': '乌兹别克斯坦', 'JOR': '约旦', 'NZL': '新西兰',
    'MAR': '摩洛哥', 'TUN': '突尼斯', 'EGY': '埃及', 'DZA': '阿尔及利亚', 'GHA': '加纳', 'CPV': '佛得角',
    'ZAF': '南非', 'CIV': '科特迪瓦', 'SEN': '塞内加尔', 'COD': '刚果(金)'
};

// 国家数据缓存
let worldCupData = null;
let worldCupLayer = null;
let worldCupOverlay = null;
let worldCupPanel = null;
let worldCupFeatures = null; // 存储GeoJSON features用于定位

// 国旗映射
const FLAG_MAP = {
    'ARG': '🇦🇷', 'BRA': '🇧🇷', 'URY': '🇺🇾', 'COL': '🇨🇴', 'ECU': '🇪🇨', 'PRY': '🇵🇾',
    'USA': '🇺🇸', 'CAN': '🇨🇦', 'MEX': '🇲🇽', 'PAN': '🇵🇦', 'CUW': '🇨🇼', 'HTI': '🇭🇹',
    'ESP': '🇪🇸', 'FRA': '🇫🇷', 'DEU': '🇩🇪', 'GBR': '🇬🇧', 'PRT': '🇵🇹', 'NLD': '🇳🇱', 'BEL': '🇧🇪',
    'HRV': '🇭🇷', 'CHE': '🇨🇭', 'TUR': '🇹🇷', 'SWE': '🇸🇪', 'AUT': '🇦🇹', 'CZE': '🇨🇿', 'BIH': '🇧🇦',
    'JPN': '🇯🇵', 'KOR': '🇰🇷', 'AUS': '🇦🇺', 'IRN': '🇮🇷', 'SAU': '🇸🇦', 'QAT': '🇶🇦',
    'IRQ': '🇮🇶', 'UZB': '🇺🇿', 'JOR': '🇯🇴', 'NZL': '🇳🇿',
    'MAR': '🇲🇦', 'TUN': '🇹🇳', 'EGY': '🇪🇬', 'DZA': '🇩🇿', 'GHA': '🇬🇭', 'CPV': '🇨🇻',
    'ZAF': '🇿🇦', 'CIV': '🇨🇮', 'SEN': '🇸🇳', 'COD': '🇨🇩'
};

/**
 * 加载世界杯国家数据
 */
async function loadWorldCupData() {
    try {
        const response = await fetch('../DATA/2026世界杯参赛国家数据.csv');
        const text = await response.text();
        const lines = text.split('\n');
        const headers = lines[0].split(',');
        
        const data = {};
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',');
            const iso = values[1] ? values[1].trim() : '';
            if (!iso) continue;
            const countryData = {};
            headers.forEach((header, index) => {
                countryData[header.trim()] = values[index] ? values[index].trim() : '';
            });
            data[iso] = countryData;
        }
        console.log('世界杯数据加载成功，共', Object.keys(data).length, '个国家');
        return data;
    } catch (error) {
        console.error('加载世界杯数据失败:', error);
        return {};
    }
}

/**
 * 从world.json中提取参赛国家的GeoJSON
 */
async function extractWorldCupGeoJSON() {
    try {
        const response = await fetch('geojson/world.json');
        const worldData = await response.json();
        
        const features = worldData.features.filter(feature => {
            const iso = feature.properties.iso_a3;
            return WORLD_CUP_COUNTRIES.includes(iso);
        });
        
        return {
            type: 'FeatureCollection',
            features: features
        };
    } catch (error) {
        console.error('提取世界杯GeoJSON失败:', error);
        return null;
    }
}

// 记录已处理的国家，确保每个国家只显示一个图标
const renderedCountries = new Set();

/**
 * 创建国旗图标样式（每个国家只在主体图斑上显示一个国旗）
 */
function createFootballStyle(feature) {
    const iso = feature.get('iso_a3');
    
    // 获取国旗
    const flag = FLAG_MAP[iso] || '🏳️';
    
    // 创建基础样式
    const style = new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(255, 215, 0, 0.3)'
        }),
        stroke: new ol.style.Stroke({
            color: '#FF6B35',
            width: 2
        })
    });
    
    // 只在首次渲染时添加文字（防止多图斑显示多个图标）
    if (!renderedCountries.has(iso)) {
        renderedCountries.add(iso);
        
        // 国旗显示
        style.setText(new ol.style.Text({
            text: flag,
            font: '28px Arial',
            fill: new ol.style.Fill({
                color: '#000'
            }),
            placement: 'point',
            textAlign: 'center',
            textBaseline: 'middle',
            offsetY: 0
        }));
    }
    
    return style;
}

/**
 * 创建国家列表面板HTML
 */
function createCountryListPanel() {
    let groupsHtml = '';
    
    WORLD_CUP_GROUPS.forEach((group, groupIndex) => {
        let countriesHtml = '';
        
        group.countries.forEach((country) => {
            const flag = country.flag || FLAG_MAP[country.iso] || '🏳️';
            const displayName = country.subName || country.name;
            
            countriesHtml += `
                <div class="worldcup-country-item" onclick="flyToCountry('${country.iso}', '${displayName}')">
                    <span class="worldcup-flag">${flag}</span>
                    <span class="worldcup-country-name">${displayName}</span>
                </div>
            `;
        });
        
        groupsHtml += `
            <div class="worldcup-group">
                <div class="worldcup-group-title">${group.name}</div>
                <div class="worldcup-group-countries">${countriesHtml}</div>
            </div>
        `;
    });
    
    return `
        <div class="worldcup-panel">
            <div class="worldcup-panel-header">
                <span class="worldcup-title">⚽ 2026世界杯</span>
                <span class="worldcup-count">48支球队</span>
            </div>
            <div class="worldcup-panel-content">
                ${groupsHtml}
            </div>
        </div>
    `;
}

/**
 * 创建信息弹出窗口
 * @param {Object} countryData - 国家数据
 * @param {string} iso - ISO代码
 * @param {string} displayName - 显示名称（可选，用于地区名称如英格兰/苏格兰）
 */
function createInfoPopup(countryData, iso, displayName) {
    const flag = FLAG_MAP[iso] || '🏳️';
    const name = displayName || COUNTRY_NAMES[iso] || (countryData ? countryData['国家名称'] : '') || iso;
    
    const getValue = (key) => {
        if (!countryData) return '--';
        const val = countryData[key];
        return val && val !== '' && val !== 'undefined' ? val : '--';
    };
    
    return `
        <div style="
            width: 320px;
            max-height: 450px;
            overflow-y: auto;
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            color: white;
        ">
            <div style="padding: 20px; text-align: center; background: rgba(255,255,255,0.1); border-radius: 12px 12px 0 0;">
                <div style="font-size: 48px; margin-bottom: 10px;">${flag}</div>
                <h2 style="margin: 0; font-size: 24px; font-weight: bold;">${name}</h2>
                <div style="font-size: 14px; opacity: 0.8; margin-top: 5px;">2026世界杯参赛地区</div>
            </div>
            
            <div style="padding: 15px; background: rgba(255,255,255,0.95); color: #333; border-radius: 0 0 12px 12px;">
                ${createDataSection('📊 基本数据', [
                    ['国土面积', `${getValue('国土面积(km²)')} km²`],
                    ['人口(2024)', formatNumber(getValue('人口(2024)'))],
                    ['最新GDP', `${formatNumber(getValue('最新GDP(百万美元)'))} 百万美元`],
                    ['人均GDP', `${formatNumber(getValue('人均GDP(美元)'))} 美元`]
                ])}
                
                ${createDataSection('🏭 经济产业', [
                    ['主要产业', getValue('主要产业')]
                ])}
                
                ${createDataSection('⚽ 足球数据', [
                    ['足球人口', formatNumber(getValue('足球人口'))],
                    ['世界杯夺冠', `${getValue('世界杯夺冠次数')} 次`],
                    ['本洲杯赛夺冠', `${getValue('本洲杯赛夺冠次数')} 次`]
                ])}
                
                ${createDataSection('🇨🇳 对华贸易', [
                    ['与中国贸易量', `${formatNumber(getValue('与中国贸易量(百万美元)'))} 百万美元`]
                ])}
            </div>
        </div>
    `;
}

/**
 * 创建数据区块
 */
function createDataSection(title, items) {
    const itemsHtml = items.map(([label, value]) => `
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
            <span style="color: #666; font-size: 13px;">${label}</span>
            <span style="color: #333; font-size: 13px; font-weight: 500; text-align: right; max-width: 180px; word-break: break-all;">${value || '--'}</span>
        </div>
    `).join('');
    
    return `
        <div style="margin-bottom: 15px;">
            <div style="font-size: 14px; font-weight: bold; color: #667eea; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 2px solid #667eea;">${title}</div>
            ${itemsHtml}
        </div>
    `;
}

/**
 * 格式化数字
 */
function formatNumber(num) {
    if (!num) return '--';
    const n = parseFloat(num);
    if (isNaN(n)) return num;
    return n.toLocaleString('zh-CN');
}

// ISO代码映射表（处理分组中使用的不同代码）
const ISO_MAPPING = {
    'GBR': 'GBR', 'SCO': 'GBR', 'ENG': 'GBR',      // 英国相关
    'GER': 'DEU',                                   // 德国
    'NET': 'NLD',                                   // 荷兰
    'KSA': 'SAU',                                   // 沙特
    'URU': 'URY',                                   // 乌拉圭
    'ALG': 'DZA',                                   // 阿尔及利亚
    'CRO': 'HRV',                                   // 克罗地亚
    'SUI': 'CHE',                                   // 瑞士
    'CHE': 'CHL',                                   // 智利
    'NOR': 'NOR',                                   // 挪威
    'AUS': 'AUS', 'AUS2': 'AUS'                     // 澳大利亚
};

/**
 * 飞到指定国家
 */
function flyToCountry(iso, displayName) {
    // 使用映射表转换ISO代码
    const mappedIso = ISO_MAPPING[iso] || iso;
    
    // 查找对应的feature
    const feature = worldCupFeatures.find(f => f.get('iso_a3') === mappedIso);
    
    if (feature) {
        const geometry = feature.getGeometry();
        if (geometry) {
            const extent = geometry.getExtent();
            const center = ol.extent.getCenter(extent);
            
            // 地图飞行动画
            map.getView().animate({
                center: center,
                zoom: 4,
                duration: 1500,
                complete: () => {
                    // 动画完成后显示弹窗
                    const countryData = worldCupData[mappedIso] || {};
                    const popupElement = worldCupOverlay.getElement();
                    popupElement.innerHTML = createInfoPopup(countryData, mappedIso, displayName);
                    popupElement.style.cursor = 'pointer';
                    
                    popupElement.onclick = (e) => {
                        e.stopPropagation();
                        worldCupOverlay.setPosition(undefined);
                    };
                    
                    worldCupOverlay.setPosition(center);
                }
            });
            
            // 高亮显示
            highlightFeature(feature);
        }
    } else {
        console.warn('未找到国家:', iso, '(映射为:', mappedIso + ')');
    }
}

/**
 * 高亮显示feature
 */
function highlightFeature(feature) {
    // 临时改变样式
    const originalStyle = feature.getStyle();
    
    feature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(255, 107, 53, 0.5)'
        }),
        stroke: new ol.style.Stroke({
            color: '#FF6B35',
            width: 4
        })
    }));
    
    // 3秒后恢复
    setTimeout(() => {
        feature.setStyle(originalStyle);
    }, 3000);
}

/**
 * 初始化世界杯功能
 */
async function initWorldCup() {
    // 加载数据
    worldCupData = await loadWorldCupData();
    
    // 提取GeoJSON
    const geojson = await extractWorldCupGeoJSON();
    if (!geojson) {
        console.error('无法加载世界杯GeoJSON');
        return;
    }
    
    // 保存features引用
    worldCupFeatures = new ol.format.GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857'
    });
    
    // 创建矢量图层
    const source = new ol.source.Vector({
        features: worldCupFeatures
    });
    
    worldCupLayer = new ol.layer.Vector({
        source: source,
        style: createFootballStyle,
        visible: false,
        zIndex: 100
    });
    
    // 添加到地图
    map.addLayer(worldCupLayer);
    
    // 创建弹出层
    worldCupOverlay = new ol.Overlay({
        element: document.createElement('div'),
        autoPan: {
            animation: {
                duration: 250
            }
        },
        autoPanMargin: 50
    });
    map.addOverlay(worldCupOverlay);
    
    // 点击事件 - 使用图层点击事件，防止"要素"窗口弹出
    worldCupLayer.on('click', (evt) => {
        // 阻止事件传播到map级别，防止map.js中的点击处理程序触发"要素"窗口
        evt.stopPropagation ? evt.stopPropagation() : (evt.propagationStopped = true);
        
        const feature = evt.feature;
        if (feature) {
            const iso = feature.get('iso_a3');
            console.log('点击国家:', iso);
            
            const countryData = worldCupData[iso] || {};
            console.log('国家数据:', countryData);
            
            const popupElement = worldCupOverlay.getElement();
            popupElement.innerHTML = createInfoPopup(countryData, iso);
            popupElement.style.cursor = 'pointer';
            
            popupElement.onclick = (e) => {
                e.stopPropagation();
                worldCupOverlay.setPosition(undefined);
            };
            
            const geometry = feature.getGeometry();
            const center = geometry.getExtent ? ol.extent.getCenter(geometry.getExtent()) : geometry.getCoordinates();
            worldCupOverlay.setPosition(center);
        }
    });
    
    // 鼠标悬停效果
    map.on('pointermove', (evt) => {
        if (!worldCupLayer.getVisible()) return;
        
        const hit = map.hasFeatureAtPixel(evt.pixel, {
            layerFilter: (layer) => layer === worldCupLayer
        });
        map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });
    
    // 添加面板样式
    addWorldCupStyles();
}

/**
 * 添加CSS样式
 */
function addWorldCupStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .worldcup-panel {
            position: absolute;
            left: 10px;
            top: 80px;
            width: 220px;
            max-height: calc(100vh - 200px);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 1000;
            overflow: hidden;
        }
        
        .worldcup-panel-header {
            padding: 15px;
            background: rgba(255,255,255,0.15);
            border-bottom: 1px solid rgba(255,255,255,0.2);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .worldcup-title {
            font-size: 18px;
            font-weight: bold;
            color: white;
        }
        
        .worldcup-count {
            font-size: 12px;
            color: rgba(255,255,255,0.8);
            background: rgba(255,255,255,0.2);
            padding: 4px 8px;
            border-radius: 10px;
        }
        
        .worldcup-panel-content {
            max-height: calc(100vh - 280px);
            overflow-y: auto;
            padding: 10px;
        }
        
        .worldcup-panel-content::-webkit-scrollbar {
            width: 6px;
        }
        
        .worldcup-panel-content::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.1);
        }
        
        .worldcup-panel-content::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.3);
            border-radius: 3px;
        }
        
        .worldcup-group {
            margin-bottom: 10px;
        }
        
        .worldcup-group-title {
            font-size: 12px;
            font-weight: bold;
            color: rgba(255,255,255,0.7);
            padding: 5px 0;
            border-bottom: 1px solid rgba(255,255,255,0.2);
            margin-bottom: 5px;
        }
        
        .worldcup-group-countries {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3px;
        }
        
        .worldcup-country-item {
            display: flex;
            align-items: center;
            padding: 6px 8px;
            background: rgba(255,255,255,0.9);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .worldcup-country-item:hover {
            background: rgba(255,255,255,1);
            transform: scale(1.02);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .worldcup-flag {
            font-size: 16px;
            margin-right: 5px;
        }
        
        .worldcup-country-name {
            font-size: 11px;
            color: #333;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .worldcup-panel.hidden {
            display: none;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 切换世界杯图层显示
 */
function toggleWorldCupLayer() {
    if (!worldCupLayer) {
        console.error('世界杯图层未初始化');
        return;
    }
    
    const visible = !worldCupLayer.getVisible();
    worldCupLayer.setVisible(visible);
    
    // 更新按钮状态
    const btn = document.getElementById('worldCupBtn');
    if (btn) {
        btn.style.background = visible ? 'rgba(255, 107, 53, 0.8)' : 'rgba(255, 255, 255, 0.9)';
        btn.style.color = visible ? 'white' : '#333';
    }
    
    // 显示/隐藏面板
    if (!worldCupPanel) {
        worldCupPanel = document.createElement('div');
        worldCupPanel.innerHTML = createCountryListPanel();
        document.body.appendChild(worldCupPanel);
        
        // 移除内层div的额外wrapper
        const panel = worldCupPanel.querySelector('.worldcup-panel');
        worldCupPanel.innerHTML = '';
        worldCupPanel.appendChild(panel);
    }
    
    if (visible) {
        // 重置已渲染国家集合，确保图标重新显示
        renderedCountries.clear();
        // 强制刷新图层
        worldCupLayer.getSource().changed();
        worldCupPanel.style.display = 'block';
        map.getView().animate({
            center: ol.proj.fromLonLat([0, 20]),
            zoom: 1,
            duration: 1000
        });
    } else {
        worldCupPanel.style.display = 'none';
        if (worldCupOverlay) {
            worldCupOverlay.setPosition(undefined);
        }
    }
}

// 暴露给全局
window.initWorldCup = initWorldCup;
window.toggleWorldCupLayer = toggleWorldCupLayer;
window.flyToCountry = flyToCountry;
