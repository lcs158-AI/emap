// 用户相关的功能

// 全局变量，用于存储用户图层
let userPointLayer = null;
let userFootprintLayer = null;

// 更新侧边栏UI
function updateSidebarUI() {
    const authForm = document.getElementById('sidebarAuthForm');
    const uploadForm = document.getElementById('sidebarUploadForm');
    const userStatus = document.getElementById('sidebarUserStatus');
    const usernameSpan = document.getElementById('sidebarUsername');
    
    const token = localStorage.getItem('gis_token') || localStorage.getItem('access_token');
    
    if (token) {
        // 已登录
        authForm.style.display = 'none';
        uploadForm.style.display = 'block';
        userStatus.style.display = 'block';
        
        // 从 localStorage 中获取用户名
        const username = localStorage.getItem('username');
        usernameSpan.innerText = username || 'User';
    } else {
        // 未登录
        authForm.style.display = 'block';
        uploadForm.style.display = 'none';
        userStatus.style.display = 'none';
    }
}

// 移除用户图层
function removeUserLayers() {
    if (userPointLayer && window.map) {
        window.map.removeLayer(userPointLayer);
        userPointLayer = null;
    }
    if (userFootprintLayer && window.map) {
        window.map.removeLayer(userFootprintLayer);
        userFootprintLayer = null;
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
        const pointSource = new window.ol.source.Vector({
            features: geoJsonFormat.readFeatures(pointsGeoJSON, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            })
        });
        
        // 创建点图层
        userPointLayer = new window.ol.layer.Vector({
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
        userPointLayer.set('labelField', 'datetime'); // 使用 datetime 作为标签
        userPointLayer.set('linkField', 'filename'); // 使用 filename 作为链接
        userPointLayer.set('linkPathPrefix', window.API_BASE_URL + '/PICS/'); // 设置图片路径前缀
        
        // 添加图层到地图
        window.map.addLayer(userPointLayer);
        
        // 移除旧的用户图层（如果存在）
        window.dynamicLayers = window.dynamicLayers.filter(item => 
            item.name !== '用户点图层' && item.name !== '用户视域图层'
        );
        
        // 添加到动态图层列表，用于图层管理
        window.dynamicLayers.push({
            name: '用户点图层',
            layer: userPointLayer,
            visible: true,
            labelField: 'datetime',
            linkField: 'filename',
            linkPathPrefix: window.API_BASE_URL + '/PICS/'
        });
        
        // 不需要自定义点击事件，map.js 会自动处理
        // 已经设置了 labelField 和 linkField 属性，弹出窗口会自动显示正确的信息
    }
    
    // 添加用户视域图层
    if (userData.footprints && userData.footprints.length > 0) {
        // 创建GeoJSON格式实例
        const geoJsonFormat = new window.ol.format.GeoJSON();
        // 创建面数据源
        // 将Feature数组转换为FeatureCollection格式
        const footprintsGeoJSON = {
            type: 'FeatureCollection',
            features: userData.footprints
        };
        const footprintSource = new window.ol.source.Vector({
            features: geoJsonFormat.readFeatures(footprintsGeoJSON, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            })
        });
        
        // 创建面图层
        userFootprintLayer = new window.ol.layer.Vector({
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
    const token = localStorage.getItem('gis_token') || localStorage.getItem('access_token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        console.log('用户未登录，跳过加载用户数据');
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
        
        console.log('开始加载用户数据，用户名:', username);
        const res = await fetch(`${window.API_BASE_URL}/api/photos`, {
            method: 'GET'
        });
        
        if (res.ok) {
            const data = await res.json();
            console.log('获取到所有照片数据，要素数量:', data.features ? data.features.length : 0);
            
            // 严格过滤出当前用户的照片
            const userFeatures = (data.features || []).filter(feature => {
                return feature.properties && feature.properties.uploader === username;
            });
            
            console.log('过滤后用户照片数量:', userFeatures.length);
            
            // 转换数据格式为前端需要的格式
            const userData = {
                points: userFeatures,
                footprints: []
            };
            
            // 从用户数据中提取视域信息
            userFeatures.forEach(feature => {
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
                        if (footprints && footprints.features) {
                            userData.footprints = userData.footprints.concat(footprints.features);
                        }
                    } catch (e) {
                        console.error('解析视域数据失败:', e);
                    }
                }
            });
            
            console.log('提取到视域数据数量:', userData.footprints.length);
            
            loadUserDataToMap(userData);
            
            // 刷新图层管理界面
            if (typeof window.createLayerControl === 'function') {
                window.createLayerControl();
            } else if (typeof window.updateLayerControl === 'function') {
                window.updateLayerControl();
            } else if (typeof window.initLayerControl === 'function') {
                window.initLayerControl();
            }
        } else {
            console.error('获取用户数据失败:', res.status);
            // 显示错误提示
            if (loadingProgress) {
                loadingProgress.textContent = '获取数据失败';
            }
        }
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
                // 后端没有返回access_token，直接使用用户名作为token
                localStorage.setItem('gis_token', username);
                localStorage.setItem('access_token', username);
                localStorage.setItem('username', username); // 保存用户名
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
        const registerFields = document.getElementById('registerFields');
        const isRegisterMode = registerFields.style.display === 'block';
        
        if (!isRegisterMode) {
            // 切换到注册模式，显示注册专用字段
            registerFields.style.display = 'block';
            document.getElementById('sidebarRegisterBtn').textContent = '提交注册';
            return;
        }
        
        // 提交注册
        const username = document.getElementById('sidebarUsernameInput').value;
        const password = document.getElementById('sidebarPasswordInput').value;
        const realName = document.getElementById('sidebarRealNameInput').value;
        const workUnit = document.getElementById('sidebarWorkUnitInput').value;
        const phone = document.getElementById('sidebarPhoneInput').value;
        const msgEl = document.getElementById('sidebarAuthMsg');
        
        if (!username || !password || !realName || !workUnit || !phone) { 
            msgEl.innerText = '请填写所有字段'; 
            return;
        }
        
        // 注册成功后，切换回登录模式
        function resetRegisterForm() {
            registerFields.style.display = 'none';
            document.getElementById('sidebarRegisterBtn').textContent = '注册';
        }

        try {
            const res = await fetch(`${window.API_BASE_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password, 
                    real_name: realName, 
                    work_unit: workUnit, 
                    phone 
                })
            });
            const data = await res.json();
            if (res.ok) {
                msgEl.style.color = 'green';
                msgEl.innerText = '注册成功，等待管理员审核';
                // 注册成功后，切换回登录模式
                resetRegisterForm();
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
        localStorage.removeItem('gis_token');
        localStorage.removeItem('access_token');
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
        const token = localStorage.getItem('gis_token') || localStorage.getItem('access_token');
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