/**
 * 2026世界杯功能模块
 */

// API基础URL
const API_BASE_URL = window.API_BASE_URL || '/readexif';

// 获取认证头
function getWorldCupAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const WORLD_CUP_COUNTRIES = [
    'ARG', 'BRA', 'URY', 'COL', 'ECU', 'PRY',
    'USA', 'CAN', 'MEX', 'PAN', 'CUW', 'HTI',
    'ESP', 'FRA', 'DEU', 'GBR', 'PRT', 'NLD', 'BEL', 'HRV', 'CHE', 'TUR', 'SWE', 'AUT', 'CZE', 'BIH', 'NOR',
    'JPN', 'KOR', 'AUS', 'IRN', 'SAU', 'QAT', 'IRQ', 'UZB', 'JOR',
    'NZL',
    'MAR', 'TUN', 'EGY', 'DZA', 'GHA', 'CPV', 'ZAF', 'CIV', 'SEN', 'COD'
];

const WORLD_CUP_GROUPS = [
    { name: 'A组', countries: [
        { iso: 'MEX', name: '墨西哥', flag: 'MX' },
        { iso: 'ZAF', name: '南非', flag: 'ZA' },
        { iso: 'KOR', name: '韩国', flag: 'KR' },
        { iso: 'CZE', name: '捷克', flag: 'CZ' }
    ]},
    { name: 'B组', countries: [
        { iso: 'CAN', name: '加拿大', flag: 'CA' },
        { iso: 'BIH', name: '波黑', flag: 'BA' },
        { iso: 'QAT', name: '卡塔尔', flag: 'QA' },
        { iso: 'CHE', name: '瑞士', flag: 'CH' }
    ]},
    { name: 'C组', countries: [
        { iso: 'BRA', name: '巴西', flag: 'BR' },
        { iso: 'MAR', name: '摩洛哥', flag: 'MA' },
        { iso: 'HTI', name: '海地', flag: 'HT' },
        { iso: 'GBR', name: '苏格兰', flag: 'SCO', subName: '苏格兰' }
    ]},
    { name: 'D组', countries: [
        { iso: 'USA', name: '美国', flag: 'US' },
        { iso: 'PRY', name: '巴拉圭', flag: 'PY' },
        { iso: 'AUS', name: '澳大利亚', flag: 'AU' },
        { iso: 'TUR', name: '土耳其', flag: 'TR' }
    ]},
    { name: 'E组', countries: [
        { iso: 'DEU', name: '德国', flag: 'DE' },
        { iso: 'CUW', name: '库拉索', flag: 'CW' },
        { iso: 'CIV', name: '科特迪瓦', flag: 'CI' },
        { iso: 'ECU', name: '厄瓜多尔', flag: 'EC' }
    ]},
    { name: 'F组', countries: [
        { iso: 'NLD', name: '荷兰', flag: 'NL' },
        { iso: 'JPN', name: '日本', flag: 'JP' },
        { iso: 'SWE', name: '瑞典', flag: 'SE' },
        { iso: 'TUN', name: '突尼斯', flag: 'TN' }
    ]},
    { name: 'G组', countries: [
        { iso: 'BEL', name: '比利时', flag: 'BE' },
        { iso: 'EGY', name: '埃及', flag: 'EG' },
        { iso: 'IRN', name: '伊朗', flag: 'IR' },
        { iso: 'NZL', name: '新西兰', flag: 'NZ' }
    ]},
    { name: 'H组', countries: [
        { iso: 'ESP', name: '西班牙', flag: 'ES' },
        { iso: 'CPV', name: '佛得角', flag: 'CV' },
        { iso: 'SAU', name: '沙特阿拉伯', flag: 'SA' },
        { iso: 'URY', name: '乌拉圭', flag: 'UY' }
    ]},
    { name: 'I组', countries: [
        { iso: 'FRA', name: '法国', flag: 'FR' },
        { iso: 'SEN', name: '塞内加尔', flag: 'SN' },
        { iso: 'IRQ', name: '伊拉克', flag: 'IQ' },
        { iso: 'NOR', name: '挪威', flag: 'NO' }
    ]},
    { name: 'J组', countries: [
        { iso: 'ARG', name: '阿根廷', flag: 'AR' },
        { iso: 'DZA', name: '阿尔及利亚', flag: 'DZ' },
        { iso: 'AUT', name: '奥地利', flag: 'AT' },
        { iso: 'JOR', name: '约旦', flag: 'JO' }
    ]},
    { name: 'K组', countries: [
        { iso: 'PRT', name: '葡萄牙', flag: 'PT' },
        { iso: 'COD', name: '民主刚果', flag: 'CD' },
        { iso: 'UZB', name: '乌兹别克斯坦', flag: 'UZ' },
        { iso: 'COL', name: '哥伦比亚', flag: 'CO' }
    ]},
    { name: 'L组', countries: [
        { iso: 'GBR', name: '英格兰', flag: 'ENG', subName: '英格兰' },
        { iso: 'HRV', name: '克罗地亚', flag: 'HR' },
        { iso: 'GHA', name: '加纳', flag: 'GH' },
        { iso: 'PAN', name: '巴拿马', flag: 'PA' }
    ]}
];

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

let worldCupData = null;
let worldCupLayer = null;
let worldCupOverlay = null;
let worldCupPanel = null;
let worldCupFeatures = null;
const renderedCountries = new Set();

async function loadWorldCupData() {
    try {
        console.log('尝试从后端API加载世界杯数据...');
        const tableName = '2026世界杯参赛国家数据';
        const url = `${API_BASE_URL}/api/thematic/data/${encodeURIComponent(tableName)}`;
        console.log('API URL:', url);
        
        const response = await fetch(url, {
            headers: getWorldCupAuthHeaders()
        });
        console.log('HTTP状态:', response.status);
        
        if (!response.ok) {
            console.error('数据加载失败，HTTP状态:', response.status);
            return {};
        }
        
        const result = await response.json();
        console.log('API返回结果:', JSON.stringify(result, null, 2));
        
        const dataArray = result.data || result || [];
        
        console.log('API数据加载成功，共', dataArray.length, '条记录');
        
        // 转换为以iso_a3为键的对象，支持多种可能的字段名
        const data = {};
        dataArray.forEach((row, index) => {
            const iso = row.iso_a3 || row.iso || row.ISO || row['iso_a3'] || '';
            if (iso) {
                data[iso.trim()] = row;
            } else {
                console.warn('第', index, '条记录缺少ISO代码:', row);
            }
        });
        
        console.log('世界杯数据解析完成，共', Object.keys(data).length, '个国家:', Object.keys(data));
        return data;
    } catch (error) {
        console.error('从API加载世界杯数据失败:', error);
        return {};
    }
}

/**
 * 实时提取机制：根据ISO代码从后端获取单个国家数据
 */
async function fetchCountryData(iso) {
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`实时获取数据(${attempt}/${maxRetries}):`, iso);
            const tableName = '2026世界杯参赛国家数据';
            // 使用公开数据端点，无需登录认证
            const url = `${API_BASE_URL}/api/thematic/public/data/${encodeURIComponent(tableName)}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            const response = await fetch(url, { headers: headers });
            
            if (!response.ok) {
                console.error(`获取数据失败(${attempt}/${maxRetries})，HTTP状态:`, response.status);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                return null;
            }
            
            const result = await response.json();
            const dataArray = result.data || result || [];
            
            // 根据iso_a3查找对应国家数据
            const countryData = dataArray.find(row => {
                const rowIso = row.iso_a3 || row.iso || '';
                return rowIso.trim() === iso;
            });
            
            console.log('找到数据:', iso, countryData ? '是' : '否');
            return countryData || null;
        } catch (error) {
            console.error(`获取国家数据失败(${attempt}/${maxRetries}):`, error);
            lastError = error;
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    }
    
    console.error('获取数据最终失败:', lastError);
    return null;
}

async function extractWorldCupGeoJSON() {
    try {
        const response = await fetch('geojson/world.json');
        const worldData = await response.json();
        const features = worldData.features.filter(feature => {
            const iso = feature.properties.iso_a3;
            return WORLD_CUP_COUNTRIES.includes(iso);
        });
        return { type: 'FeatureCollection', features: features };
    } catch (error) {
        console.error('提取世界杯GeoJSON失败:', error);
        return null;
    }
}

function createFootballStyle(feature) {
    const iso = feature.get('iso_a3');
    
    const style = new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(255, 215, 0, 0.3)' }),
        stroke: new ol.style.Stroke({ color: '#FF6B35', width: 2 })
    });
    
    if (!renderedCountries.has(iso)) {
        renderedCountries.add(iso);
        const canvas = createFlagCanvas(iso);
        if (canvas) {
            style.setImage(new ol.style.Icon({
                img: canvas,
                imgSize: [24, 24],
                anchor: [0.5, 0.5]
            }));
        }
    }
    
    return style;
}

function createFlagCanvas(iso) {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    
    const colors = getFlagColors(iso);
    drawFlag(ctx, colors);
    
    return canvas;
}

function getFlagColors(iso) {
    const colors = {
        'ARG': ['#003893', '#FFFFFF', '#CE1126'],
        'BRA': ['#009B3A', '#FFFFFF', '#FFCC00', '#003893'],
        'URY': ['#003893', '#FFFFFF', '#FFCC00'],
        'COL': ['#FFCC00', '#FFFFFF', '#003893'],
        'ECU': ['#003893', '#FFFFFF', '#CE1126'],
        'PRY': ['#CE1126', '#FFFFFF', '#003893'],
        'USA': ['#B22234', '#3C3B6E', '#FFFFFF'],
        'CAN': ['#FF0000', '#FFFFFF'],
        'MEX': ['#006644', '#FFFFFF', '#CE1126'],
        'PAN': ['#003893', '#FFFFFF', '#CE1126'],
        'CUW': ['#003893', '#FFFFFF', '#CE1126'],
        'HTI': ['#003893', '#FFFFFF', '#CE1126'],
        'ESP': ['#CE1126', '#FFFFFF'],
        'FRA': ['#003893', '#FFFFFF', '#CE1126'],
        'DEU': ['#000000', '#DDCC00', '#CE1126'],
        'GBR': ['#CE1126', '#00247D', '#FFFFFF'],
        'PRT': ['#006600', '#FFFFFF', '#CE1126'],
        'NLD': ['#CE1126', '#FFFFFF', '#003893'],
        'BEL': ['#000000', '#FFCC00', '#CE1126'],
        'HRV': ['#CE1126', '#FFFFFF'],
        'CHE': ['#FFCC00', '#CE1126'],
        'TUR': ['#CE1126', '#FFFFFF'],
        'SWE': ['#003893', '#FFCC00'],
        'AUT': ['#CE1126', '#FFFFFF', '#003893'],
        'CZE': ['#CE1126', '#FFFFFF', '#003893'],
        'BIH': ['#CE1126', '#FFFFFF', '#003893'],
        'JPN': ['#FFFFFF', '#CE1126'],
        'KOR': ['#FFFFFF', '#CE1126', '#000000'],
        'AUS': ['#003893', '#FFCC00'],
        'IRN': ['#CE1126', '#FFFFFF', '#009B3A'],
        'SAU': ['#006600', '#FFFFFF'],
        'QAT': ['#CE1126', '#FFFFFF'],
        'IRQ': ['#CE1126', '#FFFFFF', '#009B3A'],
        'UZB': ['#003893', '#FFFFFF', '#CE1126'],
        'JOR': ['#003893', '#FFFFFF', '#CE1126'],
        'NZL': ['#003893', '#FFCC00'],
        'MAR': ['#CE1126', '#FFFFFF', '#006600'],
        'TUN': ['#CE1126', '#FFFFFF', '#006600'],
        'EGY': ['#CE1126', '#FFFFFF', '#003893'],
        'DZA': ['#006600', '#FFFFFF', '#CE1126'],
        'GHA': ['#CE1126', '#FFCC00', '#006600', '#003893'],
        'CPV': ['#003893', '#FFCC00', '#CE1126'],
        'ZAF': ['#003893', '#FFCC00', '#CE1126'],
        'CIV': ['#FFCC00', '#CE1126'],
        'SEN': ['#CE1126', '#FFCC00', '#006600'],
        'COD': ['#CE1126', '#FFFFFF', '#003893']
    };
    return colors[iso] || ['#666', '#CCC'];
}

function drawFlag(ctx, colors) {
    if (colors.length === 2) {
        ctx.fillStyle = colors[0];
        ctx.fillRect(0, 0, 12, 24);
        ctx.fillStyle = colors[1];
        ctx.fillRect(12, 0, 12, 24);
    } else if (colors.length === 3) {
        const h = 8;
        ctx.fillStyle = colors[0];
        ctx.fillRect(0, 0, 24, h);
        ctx.fillStyle = colors[1];
        ctx.fillRect(0, h, 24, h);
        ctx.fillStyle = colors[2];
        ctx.fillRect(0, h * 2, 24, h);
    } else if (colors.length === 4) {
        ctx.fillStyle = colors[0];
        ctx.fillRect(0, 0, 12, 12);
        ctx.fillStyle = colors[1];
        ctx.fillRect(12, 0, 12, 12);
        ctx.fillStyle = colors[2];
        ctx.fillRect(0, 12, 12, 12);
        ctx.fillStyle = colors[3];
        ctx.fillRect(12, 12, 12, 12);
    }
}

function createCountryListPanel() {
    let groupsHtml = '';
    
    WORLD_CUP_GROUPS.forEach((group) => {
        let countriesHtml = '';
        group.countries.forEach((country) => {
            const displayName = country.subName || country.name;
            const flagUrl = getFlagUrl(country.flag);
            countriesHtml += `
                <div class="worldcup-country-item" onclick="flyToCountry('${country.iso}', '${displayName}')">
                    <img class="worldcup-flag" src="${flagUrl}" />
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
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="worldcup-count">48支球队</span>
                    <button class="worldcup-close-btn" onclick="toggleWorldCupLayer()">×</button>
                </div>
            </div>
            <div class="worldcup-panel-content">${groupsHtml}</div>
        </div>
    `;
}

function getFlagUrl(code) {
    if (code === 'ENG') return 'https://flagcdn.com/w20/gb-eng.png';
    if (code === 'SCO') return 'https://flagcdn.com/w20/gb-sct.png';
    return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}

/**
 * 实时提取机制：加载中提示
 */
function createLoadingPopup(name) {
    return `
        <div style="width: 320px; padding: 40px 20px; font-family: 'Microsoft YaHei', Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white; text-align: center;">
            <div style="margin-bottom: 15px;">
                <div style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
            </div>
            <div style="font-size: 16px; margin-bottom: 5px;">正在加载 ${name} 数据...</div>
            <div style="font-size: 12px; opacity: 0.7;">实时从数据库获取</div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        </div>
    `;
}

/**
 * 实时提取机制：加载失败提示
 */
function createErrorPopup(name) {
    return `
        <div style="width: 320px; padding: 40px 20px; font-family: 'Microsoft YaHei', Arial, sans-serif; background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); border-radius: 12px; color: white; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
            <div style="font-size: 16px; margin-bottom: 5px;">加载失败</div>
            <div style="font-size: 14px; opacity: 0.8;">无法获取 ${name} 的数据</div>
            <div style="font-size: 12px; opacity: 0.6; margin-top: 10px;">请检查网络连接或重新登录</div>
        </div>
    `;
}

function createInfoPopup(countryData, iso, displayName) {
    const name = displayName || COUNTRY_NAMES[iso] || (countryData ? countryData['国家名称'] : '') || iso;
    
    const getValue = (key) => {
        if (!countryData) return '--';
        const val = countryData[key];
        return val && val !== '' && val !== 'undefined' ? val : '--';
    };
    
    return `
        <div id="worldcup-popup-container" style="width: 320px; max-height: 450px; overflow-y: auto; font-family: 'Microsoft YaHei', Arial, sans-serif; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <!-- 窄条 -->
            <div id="worldcup-popup-header" style="height: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 5px; padding-right: 5px;">
                <button id="worldcup-popup-close" style="width: 24px; height: 24px; border: none; border-radius: 50%; background: rgba(255,255,255,0.2); color: white; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">×</button>
            </div>
            <!-- 数据内容 -->
            <div style="padding: 15px; background: rgba(255,255,255,0.95); color: #333; border-radius: 0 0 12px 12px;">
                <!-- 国家名称 -->
                <div style="text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${name}</h3>
                    <div style="font-size: 12px; color: #999;">2026世界杯参赛地区</div>
                </div>
                ${createDataSection('📊 基本数据', [
                    ['国土面积', `${getValue('国土面积(km²)')} km²`],
                    ['人口(2024)', formatNumber(getValue('人口(2024)'))],
                    ['最新GDP', `${formatNumber(getValue('最新GDP(百万美元)'))} 百万美元`],
                    ['人均GDP', `${formatNumber(getValue('人均GDP(美元)'))} 美元`]
                ])}
                ${createDataSection('🏭 经济产业', [['主要产业', getValue('主要产业')]])}
                ${createDataSection('⚽ 足球数据', [
                    ['足球人口', formatNumber(getValue('足球人口'))],
                    ['世界杯夺冠', `${getValue('世界杯夺冠次数')} 次`],
                    ['本洲杯赛夺冠', `${getValue('本洲杯赛夺冠次数')} 次`]
                ])}
                ${createDataSection('🇨🇳 对华贸易', [['与中国贸易量', `${formatNumber(getValue('与中国贸易量(百万美元)'))} 百万美元`]])}
            </div>
        </div>
    `;
}

function getFlagUrlForPopup(displayName, iso) {
    if (displayName === '英格兰') return 'https://flagcdn.com/w40/gb-eng.png';
    if (displayName === '苏格兰') return 'https://flagcdn.com/w40/gb-sct.png';
    
    // 三位ISO代码转两位代码映射
    const iso3To2 = {
        'ARG': 'AR', 'BRA': 'BR', 'URY': 'UY', 'COL': 'CO', 'ECU': 'EC', 'PRY': 'PY',
        'USA': 'US', 'CAN': 'CA', 'MEX': 'MX', 'PAN': 'PA', 'CUW': 'CW', 'HTI': 'HT',
        'ESP': 'ES', 'FRA': 'FR', 'DEU': 'DE', 'GBR': 'GB', 'PRT': 'PT', 'NLD': 'NL', 'BEL': 'BE',
        'HRV': 'HR', 'CHE': 'CH', 'TUR': 'TR', 'SWE': 'SE', 'AUT': 'AT', 'CZE': 'CZ', 'BIH': 'BA',
        'JPN': 'JP', 'KOR': 'KR', 'AUS': 'AU', 'IRN': 'IR', 'SAU': 'SA', 'QAT': 'QA',
        'IRQ': 'IQ', 'UZB': 'UZ', 'JOR': 'JO', 'NZL': 'NZ',
        'MAR': 'MA', 'TUN': 'TN', 'EGY': 'EG', 'DZA': 'DZ', 'GHA': 'GH', 'CPV': 'CV',
        'ZAF': 'ZA', 'CIV': 'CI', 'SEN': 'SN', 'COD': 'CD', 'NOR': 'NO'
    };
    
    const code = iso3To2[iso] || iso.substring(0, 2);
    return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

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

function formatNumber(num) {
    if (!num) return '--';
    const n = parseFloat(num);
    if (isNaN(n)) return num;
    return n.toLocaleString('zh-CN');
}

const ISO_MAPPING = {
    'GBR': 'GBR', 'SCO': 'GBR', 'ENG': 'GBR',
    'GER': 'DEU', 'NET': 'NLD', 'KSA': 'SAU', 'URU': 'URY',
    'ALG': 'DZA', 'CRO': 'HRV', 'SUI': 'CHE', 'NOR': 'NOR'
};

// 需要过滤海外领土的国家（只显示主体部分）
const MAINLAND_FILTER = {
    'FRA': { minLon: -5, maxLon: 10, minLat: 41, maxLat: 52 },  // 法国本土
    'NLD': { minLon: 3, maxLon: 7.5, minLat: 50, maxLat: 54 },  // 荷兰本土
    'USA': { minLon: -130, maxLon: -65, minLat: 24, maxLat: 50 }, // 美国本土（不含阿拉斯加、夏威夷）
    'PRT': { minLon: -10, maxLon: -6, minLat: 36, maxLat: 43 },  // 葡萄牙本土
    'ESP': { minLon: -10, maxLon: 4, minLat: 35, maxLat: 44 },   // 西班牙本土
    'MAR': { minLon: -18, maxLon: -1, minLat: 21, maxLat: 36 },  // 摩洛哥本土
    'CHE': { minLon: 5, maxLon: 11, minLat: 45, maxLat: 48 },    // 瑞士
    'TUR': { minLon: 25, maxLon: 45, minLat: 35, maxLat: 43 },   // 土耳其本土
};

/**
 * 实时提取机制：飞往指定国家并显示数据
 */
async function flyToCountry(iso, displayName) {
    const mappedIso = ISO_MAPPING[iso] || iso;
    const feature = worldCupFeatures.find(f => f.get('iso_a3') === mappedIso);
    
    if (feature) {
        const geometry = feature.getGeometry();
        if (geometry) {
            // 获取主体图斑的范围
            const mainExtent = getMainlandExtent(geometry, mappedIso);
            
            // 显示加载状态
            const popupElement = worldCupOverlay.getElement();
            popupElement.innerHTML = createLoadingPopup(displayName);
            const center = ol.extent.getCenter(mainExtent);
            worldCupOverlay.setPosition(center);
            
            // 使用fit自动计算合适的缩放级别
            map.getView().fit(mainExtent, {
                padding: [50, 50, 50, 50],
                duration: 1500,
                maxZoom: 8,
                callback: async () => {
                    // 实时从后端获取数据
                    const countryData = await fetchCountryData(mappedIso);
                    
                    if (countryData) {
                        popupElement.innerHTML = createInfoPopup(countryData, mappedIso, countryData['国家名称'] || displayName);
                    } else {
                        popupElement.innerHTML = createErrorPopup(displayName);
                    }
                    
                    popupElement.style.cursor = 'pointer';
                    popupElement.onclick = (e) => {
                        e.stopPropagation();
                        worldCupOverlay.setPosition(undefined);
                    };
                }
            });
        }
    }
}

/**
 * 获取国家主体图斑的范围（过滤海外领土）
 */
function getMainlandExtent(geometry, iso) {
    const filter = MAINLAND_FILTER[iso];
    
    if (!filter) {
        // 没有过滤配置，直接返回完整范围
        return geometry.getExtent();
    }
    
    // 对于多边形，筛选主体部分
    const type = geometry.getType();
    
    if (type === 'MultiPolygon') {
        let maxArea = 0;
        let mainExtent = null;
        
        geometry.getCoordinates().forEach(polygon => {
            // 计算多边形范围
            const polyExtent = ol.extent.boundingExtent(polygon[0]);
            // 转换为经纬度进行过滤判断
            const center = ol.proj.transform(ol.extent.getCenter(polyExtent), 'EPSG:3857', 'EPSG:4326');
            
            // 检查是否在过滤范围内
            if (center[0] >= filter.minLon && center[0] <= filter.maxLon &&
                center[1] >= filter.minLat && center[1] <= filter.maxLat) {
                // 计算面积
                const area = ol.extent.getWidth(polyExtent) * ol.extent.getHeight(polyExtent);
                if (area > maxArea) {
                    maxArea = area;
                    mainExtent = polyExtent;
                }
            }
        });
        
        if (mainExtent) {
            return mainExtent;
        }
    }
    
    // 默认返回完整范围
    return geometry.getExtent();
}

async function initWorldCup() {
    console.log('初始化世界杯模块...');
    
    // ========== 预提取机制（已注释，改为实时提取）==========
    // worldCupData = await loadWorldCupData();
    // console.log('已获取专题数据，共', Object.keys(worldCupData).length, '条');
    
    const geojson = await extractWorldCupGeoJSON();
    if (!geojson) return;
    
    worldCupFeatures = new ol.format.GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857'
    });
    
    // ========== 预提取机制：合并数据到feature（已注释）==========
    // worldCupFeatures.forEach(feature => {
    //     const iso = feature.get('iso_a3');
    //     if (iso && worldCupData[iso]) {
    //         Object.keys(worldCupData[iso]).forEach(key => {
    //             feature.set(key, worldCupData[iso][key]);
    //         });
    //         feature.set('countryData', worldCupData[iso]);
    //         console.log('合并数据到:', iso, feature.get('国家名称') || feature.get('name'));
    //     }
    // });
    
    const source = new ol.source.Vector({ features: worldCupFeatures });
    
    worldCupLayer = new ol.layer.Vector({
        source: source,
        style: createFootballStyle,
        visible: false,
        zIndex: 100
    });
    
    // 更新全局引用
    window.worldCupLayer = worldCupLayer;
    
    map.addLayer(worldCupLayer);
    
    worldCupOverlay = new ol.Overlay({
        element: document.createElement('div'),
        autoPan: { animation: { duration: 250 } },
        autoPanMargin: 50
    });
    map.addOverlay(worldCupOverlay);
    
    // 使用map点击事件，过滤世界杯图层（实时提取机制）
    map.on('click', async (evt) => {
        if (!worldCupLayer.getVisible()) return;
        
        // 检查点击的是否是世界杯图层的feature
        const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
            layerFilter: (layer) => layer === worldCupLayer
        });
        
        if (feature) {
            // 阻止事件传播，防止触发map.js中的"要素"窗口
            evt.stopPropagation();
            
            const iso = feature.get('iso_a3');
            const name = COUNTRY_NAMES[iso] || feature.get('name') || iso;
            
            console.log('点击图斑:', name, '开始实时获取数据...');
            
            // 显示加载状态
            const popupElement = worldCupOverlay.getElement();
            popupElement.innerHTML = createLoadingPopup(name);
            // 计算弹窗位置，确保在可视区域内
            const geometry = feature.getGeometry();
            const rawCenter = geometry.getExtent ? ol.extent.getCenter(geometry.getExtent()) : geometry.getCoordinates();
            
            // 获取地图视图边界
            const mapSize = map.getSize();
            const popupWidth = 320;
            const popupHeight = 450;
            const margin = 50;
            
            // 将地图坐标转换为像素坐标
            const pixel = map.getPixelFromCoordinate(rawCenter);
            
            // 计算安全的弹窗位置（考虑弹窗居中定位）
            // 弹窗中心点的限制范围
            const minCenterX = margin + popupWidth / 2;
            const maxCenterX = mapSize[0] - margin - popupWidth / 2;
            const minCenterY = margin + popupHeight / 2;
            const maxCenterY = mapSize[1] - margin - popupHeight / 2;
            
            let safeCenterX = Math.max(minCenterX, Math.min(pixel[0], maxCenterX));
            let safeCenterY = Math.max(minCenterY, Math.min(pixel[1], maxCenterY));
            
            // 转换回地图坐标
            const safeCenter = map.getCoordinateFromPixel([safeCenterX, safeCenterY]);
            
            worldCupOverlay.setPosition(safeCenter);
            
            // 实时从后端获取数据
            const countryData = await fetchCountryData(iso);
            
            if (countryData) {
                popupElement.innerHTML = createInfoPopup(countryData, iso, countryData['国家名称'] || name);
            } else {
                popupElement.innerHTML = createErrorPopup(name);
            }
            
            popupElement.style.cursor = 'default';
            
            // 关闭按钮
            const closeBtn = popupElement.querySelector('#worldcup-popup-close');
            if (closeBtn) {
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    worldCupOverlay.setPosition(undefined);
                };
            }
        }
    });
    
    map.on('pointermove', (evt) => {
        if (!worldCupLayer.getVisible()) return;
        const hit = map.hasFeatureAtPixel(evt.pixel, {
            layerFilter: (layer) => layer === worldCupLayer
        });
        map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });
    
    addWorldCupStyles();
}

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
        .worldcup-title { font-size: 18px; font-weight: bold; color: white; }
        .worldcup-close-btn {
            width: 28px; height: 28px; border: none; background: rgba(255,255,255,0.2);
            color: white; border-radius: 50%; font-size: 16px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
        }
        .worldcup-close-btn:hover { background: rgba(255,255,255,0.3); }
        .worldcup-count {
            font-size: 12px; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.2);
            padding: 4px 8px; border-radius: 10px;
        }
        .worldcup-panel-content { max-height: calc(100vh - 280px); overflow-y: auto; padding: 10px; }
        .worldcup-panel-content::-webkit-scrollbar { width: 6px; }
        .worldcup-panel-content::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); }
        .worldcup-panel-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
        .worldcup-group { margin-bottom: 10px; }
        .worldcup-group-title {
            font-size: 12px; font-weight: bold; color: rgba(255,255,255,0.7);
            padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.2); margin-bottom: 5px;
        }
        .worldcup-group-countries { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
        .worldcup-country-item {
            display: flex; align-items: center; padding: 6px 8px;
            background: rgba(255,255,255,0.9); border-radius: 6px; cursor: pointer; transition: all 0.2s;
        }
        .worldcup-country-item:hover { background: rgba(255,255,255,1); transform: scale(1.02); }
        .worldcup-country-flag { width: 16px; height: 12px; margin-right: 6px; border-radius: 2px; }
        .worldcup-country-name { font-size: 12px; color: #333; flex: 1; }
        .worldcup-country-code { font-size: 10px; color: #999; }
        
        /* 手机端样式 */
        @media (max-width: 768px) {
            .worldcup-panel {
                left: 0;
                right: 0;
                bottom: 10px;
                top: auto;
                width: calc(100% - 20px);
                max-height: 180px;
                height: 180px;
                margin: 0 10px;
            }
            .worldcup-panel-header {
                padding: 8px 12px;
            }
            .worldcup-title { font-size: 14px; }
            .worldcup-count {
                font-size: 10px;
                padding: 3px 6px;
            }
            .worldcup-panel-content {
                max-height: 120px;
                padding: 6px;
            }
            .worldcup-group { margin-bottom: 6px; }
            .worldcup-group-title {
                font-size: 10px;
                padding: 3px 0;
            }
            .worldcup-group-countries {
                grid-template-columns: 1fr 1fr;
                gap: 2px;
            }
            .worldcup-country-item {
                padding: 4px 5px;
            }
            .worldcup-country-flag {
                width: 12px;
                height: 9px;
                margin-right: 4px;
            }
            .worldcup-country-name { font-size: 10px; }
            .worldcup-country-code { font-size: 8px; }
        }
        
        .worldcup-country-item:hover {            background: rgba(255,255,255,1); transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .worldcup-flag { width: 16px; height: 12px; border-radius: 2px; margin-right: 5px; }
        .worldcup-country-name {
            font-size: 11px; color: #333; font-weight: 500;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        
        @media (max-width: 768px) {
            .worldcup-panel { left: 5px; right: 5px; top: 60px; width: auto; max-height: 60vh; }
            .worldcup-group-countries { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 480px) {
            .worldcup-panel { max-height: 50vh; }
            .worldcup-group-countries { grid-template-columns: repeat(2, 1fr); }
        }
    `;
    document.head.appendChild(style);
}

function toggleWorldCupLayer() {
    if (!worldCupLayer) return;
    
    const visible = !worldCupLayer.getVisible();
    worldCupLayer.setVisible(visible);
    
    const btn = document.getElementById('worldCupBtn');
    if (btn) {
        btn.style.background = visible ? 'rgba(255, 107, 53, 0.8)' : 'rgba(255, 255, 255, 0.9)';
        btn.style.color = visible ? 'white' : '#333';
    }
    
    if (!worldCupPanel) {
        worldCupPanel = document.createElement('div');
        worldCupPanel.innerHTML = createCountryListPanel();
        const panel = worldCupPanel.querySelector('.worldcup-panel');
        worldCupPanel.innerHTML = '';
        worldCupPanel.appendChild(panel);
        document.body.appendChild(worldCupPanel);
    }
    
    if (visible) {
        renderedCountries.clear();
        worldCupLayer.getSource().changed();
        worldCupPanel.style.display = 'block';
        map.getView().animate({ center: ol.proj.fromLonLat([0, 20]), zoom: 1, duration: 1000 });
    } else {
        worldCupPanel.style.display = 'none';
        if (worldCupOverlay) worldCupOverlay.setPosition(undefined);
    }
}

// 暴露给全局
window.initWorldCup = initWorldCup;
window.toggleWorldCupLayer = toggleWorldCupLayer;
window.flyToCountry = flyToCountry;
window.worldCupLayer = worldCupLayer;