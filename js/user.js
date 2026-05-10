// 用户相关的功能

// 辅助：获取存储的token
function getToken() {
    return localStorage.getItem('access_token');
}

// 辅助：带认证头的fetch
async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = { ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
}

function updateSidebarUI() {
    const authForm = document.getElementById('sidebarAuthForm');
    const cameraPanel = document.getElementById('sidebarCameraPanel');
    const uploadForm = document.getElementById('sidebarUploadForm');
    const userStatus = document.getElementById('sidebarUserStatus');
    const usernameSpan = document.getElementById('sidebarUsername');
    
    const token = localStorage.getItem('access_token');
    
    if (token) {
        // 已登录
        authForm.style.display = 'none';
        cameraPanel.style.display = 'block';
        uploadForm.style.display = 'block';
        userStatus.style.display = 'block';
        
        // 从 localStorage 中获取用户名
        const username = localStorage.getItem('username');
        usernameSpan.innerText = username || 'User';
    } else {
        // 未登录
        authForm.style.display = 'block';
        cameraPanel.style.display = 'none';
        uploadForm.style.display = 'none';
        userStatus.style.display = 'none';
    }
}

// 移除用户图层
function removeUserLayers() {
    if (window.map) {
        // 遍历所有图层，移除用户点图层和用户视域图层
        window.map.getLayers().forEach(layer => {
            // 检查图层是否存在且有 get 方法，避免 TypeError
            if (layer && typeof layer.get === 'function') {
                const layerName = layer.get('name');
                if (layerName === '用户点图层' || layerName === '用户视域图层') {
                    window.map.removeLayer(layer);
                }
            }
        });
        
        // 从dynamicLayers中移除用户图层
        if (window.dynamicLayers) {
            window.dynamicLayers = window.dynamicLayers.filter(item => 
                item.name !== '用户点图层' && item.name !== '用户视域图层'
            );
        }
    }
}

// 加载用户数据到地图
function loadUserDataToMap(userData) {
    // 先移除旧的用户图层
    removeUserLayers();
    
    if (!userData || (!userData.points && !userData.footprints)) {
        return;
    }
    
    if (!window.map || !window.ol) {
        console.error('地图或OpenLayers未初始化');
        return;
    }
    
    // 确保 window.dynamicLayers 存在（与map.js保持一致）
    if (typeof window.dynamicLayers === 'undefined') {
        window.dynamicLayers = [];
    }
    
    // 添加用户点图层
    if (userData.points && userData.points.length > 0) {
        // 创建GeoJSON格式实例
        const geoJsonFormat = new window.ol.format.GeoJSON();
        // 创建点数据源
        // 将Feature数组转换为FeatureCollection格式
        const pointsGeoJSON = {
            type: 'FeatureCollection',
            features: userData.points
        };
        const features = geoJsonFormat.readFeatures(pointsGeoJSON, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        
        // 为每个feature设置layer属性
        const layerInfo = {
            labelField: 'datetime',
            linkField: 'filename',
            linkPathPrefix: window.API_BASE_URL + '/PICS/'
        };
        features.forEach(feature => {
            feature.set('layer', layerInfo);
        });
        
        const pointSource = new window.ol.source.Vector({
            features: features
        });
        
        // 创建点图层
        const userPointLayer = new window.ol.layer.Vector({
            source: pointSource,
            style: function(feature) {
                return new window.ol.style.Style({
                    image: new window.ol.style.Icon({
                        src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                        scale: 0.5,
                        anchor: [12, 41],
                        anchorXUnits: 'pixels',
                        anchorYUnits: 'pixels'
                    })
                });
            }
        });
        
        // 设置图层属性，用于图层管理和弹出窗口
        userPointLayer.set('name', '用户点图层'); // 设置图层名称
        userPointLayer.set('labelField', 'datetime'); // 使用 datetime 作为标签
        userPointLayer.set('linkField', 'filename'); // 使用 filename 作为链接
        userPointLayer.set('linkPathPrefix', window.API_BASE_URL + '/PICS/'); // 设置图片路径前缀
        
        // 添加图层到地图
        window.map.addLayer(userPointLayer);
        
        // 添加到动态图层列表，用于图层管理
        window.dynamicLayers.push({
            name: '用户点图层',
            layer: userPointLayer,
            visible: true,
            labelField: 'datetime',
            linkField: 'filename',
            linkPathPrefix: window.API_BASE_URL + '/PICS/'
        });
    }
    
    // 添加用户视域图层
    if (userData.footprints && userData.footprints.length > 0) {
        // 创建GeoJSON格式实例
        const geoJsonFormat = new window.ol.format.GeoJSON();
        // 创建面数据源
        
        // 处理不同格式的视域数据，确保它们都是Feature对象
        const features = [];
        // 为每个feature设置layer属性
        const layerInfo = {
            labelField: 'datetime',
            linkField: 'filename',
            linkPathPrefix: window.API_BASE_URL + '/PICS/'
        };
        userData.footprints.forEach((footprint, index) => {
            let feature;
            if (footprint.type === 'Feature') {
                // 如果是Feature对象，直接使用（属性已经在loadUserUploadedData中设置好了）
                feature = geoJsonFormat.readFeature(footprint, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
                // 确保properties中的属性被正确设置
                if (footprint.properties) {
                    Object.keys(footprint.properties).forEach(key => {
                        feature.set(key, footprint.properties[key]);
                    });
                }
                
            } else if (footprint.type) {
                // 如果是Geometry对象（不应该出现，因为loadUserUploadedData已经转换为Feature）
                feature = new window.ol.Feature({
                    geometry: geoJsonFormat.readGeometry(footprint, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:3857'
                    })
                });
                // 注意：这里不再从点数据获取属性，因为视域数据应该已经在loadUserUploadedData中包含了正确的属性
                console.warn(`视域${index}是Geometry对象，没有属性信息`);
            }
            // 为feature设置layer属性
            if (feature) {
                feature.set('layer', layerInfo);
                features.push(feature);
            }
        });
        
        const footprintSource = new window.ol.source.Vector({
            features: features
        });
        
        // 创建面图层
        const userFootprintLayer = new window.ol.layer.Vector({
            source: footprintSource,
            style: function(feature) {
                return new window.ol.style.Style({
                    stroke: new window.ol.style.Stroke({
                        color: '#ff7800',
                        width: 2,
                        opacity: 0.7
                    }),
                    fill: new window.ol.style.Fill({
                        color: 'rgba(255, 120, 0, 0.2)'
                    })
                });
            }
        });
        
        // 设置图层属性，用于图层管理和弹出窗口
        userFootprintLayer.set('name', '用户视域图层'); // 设置图层名称
        userFootprintLayer.set('labelField', 'datetime'); // 使用 datetime 作为标签
        userFootprintLayer.set('linkField', 'filename'); // 使用 filename 作为链接
        userFootprintLayer.set('linkPathPrefix', window.API_BASE_URL + '/PICS/'); // 设置图片路径前缀
        
        // 添加图层到地图
        window.map.addLayer(userFootprintLayer);
        
        // 添加到动态图层列表，用于图层管理
        window.dynamicLayers.push({
            name: '用户视域图层',
            layer: userFootprintLayer,
            visible: true,
            labelField: 'datetime',
            linkField: 'filename',
            linkPathPrefix: window.API_BASE_URL + '/PICS/'
        });
    }
    
    // 刷新图层管理界面
    if (typeof window.createLayerControl === 'function') {
        window.createLayerControl();
    } else if (typeof window.updateLayerControl === 'function') {
        window.updateLayerControl();
    } else if (typeof window.initLayerControl === 'function') {
        window.initLayerControl();
    }
}

// 加载用户上传的数据
async function loadUserUploadedData() {
    const token = localStorage.getItem('access_token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        return;
    }
    
    // 显示加载提示
    const loadingPanel = document.getElementById('loadingPanel');
    const loadingProgress = document.getElementById('loadingProgress');
    if (loadingPanel) {
        loadingPanel.style.display = 'block';
        loadingProgress.textContent = '加载用户数据...';
    }
    
    try {
        // 确保 window.dynamicLayers 存在
        if (!window.dynamicLayers) {
            window.dynamicLayers = [];
        }
        
        
        
        // 尝试多次请求，提高可靠性
        let res;
        let retries = 3;
        let success = false;
        
        while (retries > 0 && !success) {
            try {
                
                res = await fetch(`${window.API_BASE_URL}/api/photos`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    cache: 'no-cache',
                    credentials: 'include'
                });
                
                if (res.ok) {
                    
                    success = true;
                } else {
                    console.warn(`请求失败，${retries-1}次重试机会:`, res.status, res.statusText);
                    retries--;
                    if (retries > 0) {
                        // 等待一段时间后重试
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } catch (error) {
                console.warn(`请求错误，${retries-1}次重试机会:`, error.message);
                retries--;
                if (retries > 0) {
                    // 等待一段时间后重试
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        if (!success) {
            console.error('多次尝试后仍无法加载用户数据');
            // 显示错误提示
            if (loadingProgress) {
                loadingProgress.textContent = '网络连接失败，请稍后重试';
            }
            return;
        }
        
        const data = await res.json();
        
        
        // 严格过滤出当前用户的照片
        let userFeatures;
        if (username === 'admin') {
            // 管理员用户，显示所有数据
            userFeatures = data.features || [];
            
        } else {
            // 普通用户，只显示自己的数据
            userFeatures = (data.features || []).filter(feature => {
                return feature.properties && feature.properties.uploader === username;
            });
            
        }
        
        // 转换数据格式为前端需要的格式
        const userData = {
            points: userFeatures,
            footprints: []
        };
        
        // 从用户数据中提取视域信息
        userFeatures.forEach((feature, index) => {
            const properties = feature.properties || {};
            
            if (properties.footprints) {
                try {
                    let footprints;
                    // 检查footprints的类型，如果是字符串则解析，否则直接使用
                    if (typeof properties.footprints === 'string') {
                        footprints = JSON.parse(properties.footprints);
                    } else {
                        footprints = properties.footprints;
                    }
                    
                    // 处理不同格式的视域数据
                    if (footprints) {
                        if (footprints.features) {
                            // 如果是FeatureCollection，为每个feature添加属性
                            footprints.features.forEach((f, fIndex) => {
                                if (!f.properties) {
                                    f.properties = {};
                                }
                                // 添加对应的点数据的属性
                                f.properties.filename = properties.filename;
                                f.properties.datetime = properties.datetime;
                                f.properties.upload_time = properties.upload_time;
                                userData.footprints.push(f);
                                
                            });
                        } else if (footprints.type) {
                            // 如果是Geometry对象，包装成Feature并添加属性
                            const footprintFeature = {
                                type: 'Feature',
                                properties: {
                                    filename: properties.filename,
                                    datetime: properties.datetime,
                                    upload_time: properties.upload_time
                                },
                                geometry: footprints.type === 'Polygon' ? footprints : null
                            };
                            // 如果已经是Feature，直接添加属性
                            if (footprints.type === 'Feature') {
                                footprintFeature.properties = { ...footprints.properties, ...footprintFeature.properties };
                                footprintFeature.geometry = footprints.geometry;
                            }
                            userData.footprints.push(footprintFeature);
                            
                        }
                    }
                } catch (e) {
                    console.error('解析视域数据失败:', e);
                }
            }
        });
        
        
        
        loadUserDataToMap(userData);
    } catch (e) {
        console.error('加载用户数据出错:', e);
        // 显示错误提示
        if (loadingProgress) {
            loadingProgress.textContent = '加载出错: ' + e.message;
        }
    } finally {
        // 隐藏加载提示
        if (loadingPanel) {
            setTimeout(() => {
                loadingPanel.style.display = 'none';
            }, 1000);
        }
    }
}

// 登录
function initLogin() {
    document.getElementById('sidebarLoginBtn').addEventListener('click', async () => {
        const username = document.getElementById('sidebarUsernameInput').value;
        const password = document.getElementById('sidebarPasswordInput').value;
        const msgEl = document.getElementById('sidebarAuthMsg');
        
        if (!username || !password) { msgEl.innerText = '请输入用户名和密码'; return; }
        
        try {
            // 登录接口使用 JSON 格式
            const res = await fetch(`${window.API_BASE_URL}/api/login/json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('username', username);
                msgEl.innerText = '';
                msgEl.style.color = 'green';
                msgEl.innerText = '登录成功';
                updateSidebarUI();
                // 登录成功后加载用户数据
                loadUserUploadedData();
                
                // 可选：登录成功后刷新地图图层
                if (typeof window.loadRemoteLayers === 'function') window.loadRemoteLayers();
                
                // 检查是否从admin.html跳转过来，如果是则返回admin.html
                const referrer = document.referrer;
                if (referrer.includes('admin.html')) {
                    setTimeout(() => {
                        window.location.href = 'admin.html';
                    }, 1000);
                }
            } else {
                msgEl.style.color = 'red';
                msgEl.innerText = data.detail || '登录失败';
            }
        } catch (e) {
            console.error('登录错误:', e);
            msgEl.style.color = 'red';
            msgEl.innerText = '网络错误: ' + e.message;
        }
    });
}

// 注册
function initRegister() {
    document.getElementById('sidebarRegisterBtn').addEventListener('click', async () => {
        const username = document.getElementById('sidebarUsernameInput').value;
        const password = document.getElementById('sidebarPasswordInput').value;
        const msgEl = document.getElementById('sidebarAuthMsg');
        
        if (!username || !password) { 
            msgEl.innerText = '请填写用户名和密码'; 
            return;
        }

        try {
            const res = await fetch(`${window.API_BASE_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password 
                })
            });
            const data = await res.json();
            if (res.ok) {
                msgEl.style.color = 'green';
                msgEl.innerText = '注册成功，等待管理员审核';
            } else {
                msgEl.style.color = 'red';
                msgEl.innerText = data.detail || '注册失败';
            }
        } catch (e) {
            console.error('注册错误:', e);
            msgEl.style.color = 'red';
            msgEl.innerText = '网络错误: ' + e.message;
        }
    });
}

// 退出登录
function initLogout() {
    document.getElementById('sidebarLogoutBtn').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('username');
        updateSidebarUI();
        alert('已退出登录');
    });
}

// 初始化用户相关功能
function initUserFunctions() {
    updateSidebarUI();
    initLogin();
    initRegister();
    initLogout();
    
    // 页面加载时检查登录状态并加载用户数据
    window.addEventListener('load', () => {
        const token = localStorage.getItem('access_token');
        if (token) {
            // 延迟加载，确保地图已经初始化
            setTimeout(loadUserUploadedData, 1000);
        }
    });
}

// 暴露函数到全局
window.updateSidebarUI = updateSidebarUI;
window.loadUserUploadedData = loadUserUploadedData;
window.loadUserDataToMap = loadUserDataToMap;
window.initUserFunctions = initUserFunctions;