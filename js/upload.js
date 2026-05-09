// 文件上传相关的功能

// 初始化上传功能
function initUpload() {
    const sidebarUploadBtn = document.getElementById('sidebarUploadBtn');
    const progressEl = document.getElementById('sidebarUploadProgress');
    
    if (!sidebarUploadBtn || !progressEl) {
        console.warn('上传按钮或进度元素不存在，跳过初始化');
        return;
    }
    
    sidebarUploadBtn.addEventListener('click', async () => {
        const cameraInput = document.getElementById('cameraInput');
        const localImageInput = document.getElementById('localImageInput');
        const localFileInput = document.getElementById('localFileInput');
        const token = localStorage.getItem('access_token');
        const username = localStorage.getItem('username');
        
        // 检查是否选择了文件（添加空值检查）
        const hasCameraFiles = cameraInput && cameraInput.files && cameraInput.files.length > 0;
        const hasLocalImageFiles = localImageInput && localImageInput.files && localImageInput.files.length > 0;
        const hasLocalFiles = localFileInput && localFileInput.files && localFileInput.files.length > 0;
        
        if (!hasCameraFiles && !hasLocalImageFiles && !hasLocalFiles) {
            progressEl.innerText = '请选择文件';
            return;
        }
        
        if (!token) { 
            progressEl.innerText = '请先登录'; 
            return; 
        }
        if (!username) { 
            progressEl.innerText = '用户信息缺失'; 
            return; 
        }

        // 检查是否是管理员
        try {
            const response = await fetch(`${window.API_BASE_URL}/api/users`);
            if (response.ok) {
                const data = await response.json();
                const users = data.users || [];
                const currentUser = users.find(user => user.username === username);
                
                if (currentUser && currentUser.role === 'admin') {
                    progressEl.innerText = '管理员用户不能上传图片，请使用普通用户上传';
                    progressEl.style.color = 'red';
                    return;
                }
            }
        } catch (error) {
            console.error('检查用户角色失败:', error);
            // 出错时继续上传，避免影响用户体验
        }

        // 处理本地文件上传（GeoJSON、KML、KMZ）
        if (hasLocalFiles) {
            console.log('处理本地文件上传');
            // 模拟点击原有的文件输入，触发现有的本地文件加载逻辑
            const geoJsonFileInput = document.getElementById('geoJsonFileInput');
            if (geoJsonFileInput) {
                // 复制文件到原有的输入元素
                // 注意：由于安全限制，不能直接设置files属性，需要触发change事件
                // 这里我们使用一种间接的方法，创建一个新的change事件
                const file = localFileInput.files[0];
                if (file) {
                    // 临时存储文件名，以便在map.js中处理
                    window.tempLocalFileName = file.name;
                    
                    // 触发原有的文件输入点击，让用户重新选择文件
                    // 这是一种变通方法，因为直接设置files属性会受到浏览器安全限制
                    geoJsonFileInput.click();
                }
            }
            
            // 清空本地文件输入
            localFileInput.value = '';
            return;
        }

        const formData = new FormData();
        
        // 添加相机拍摄的文件
        if (cameraInput) {
            for (let file of cameraInput.files) {
                formData.append('files', file);
            }
        }
        
        // 添加本地图片文件
        for (let file of localImageInput.files) {
            formData.append('files', file);
        }
        
        formData.append('username', username); // 添加用户名参数
        formData.append('capture_time', getBeijingTime()); // 添加北京时间
        // 不设置 device_type，由后端根据 EXIF 数据判断是 drone 还是 phone
        
        // 添加问题类型
        const problemTypeSelect = document.getElementById('problemTypeSelect');
        const problemType = problemTypeSelect ? problemTypeSelect.value : '';
        formData.append('problem_type', problemType); // 添加问题类型

        progressEl.innerText = '上传中...';
        
        try {
            const res = await fetch(`${window.API_BASE_URL}/api/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await res.json();
            console.log('上传结果:', result);
            if (res.ok) {
                let message = `上传完成! 成功: ${result.success}, 失败: ${result.failed}, 重复: ${result.duplicate}`;
                if (result.no_location && result.no_location > 0) {
                    message += `, 无定位图片: ${result.no_location} (未入库)`;
                }
                progressEl.innerText = message;
                progressEl.style.color = 'green';
                
                // 清空输入
                cameraInput.value = '';
                localImageInput.value = '';
                
                // 定位到最新上传数据的中心位置
                if (result.latest_center) {
                    const { lat, lon, zoom } = result.latest_center;
                    if (window.map && window.ol) {
                        // 使用OpenLayers的正确方法设置视图
                        const center = window.ol.proj.fromLonLat([lon, lat]);
                        window.map.getView().setCenter(center);
                        window.map.getView().setZoom(zoom);
                    }
                } else {
                    console.log('没有最新中心位置信息');
                }
                
                // 加载用户数据到地图
                if (result.user_data) {
                    console.log('用户数据:', result.user_data);
                    // 调用user.js中的函数
                    if (typeof loadUserDataToMap === 'function') {
                        loadUserDataToMap(result.user_data);
                    }
                } else {
                    // 如果没有返回用户数据，重新加载用户数据
                    console.log('没有用户数据，重新加载');
                    // 调用user.js中的函数
                    if (typeof loadUserUploadedData === 'function') {
                        loadUserUploadedData();
                    }
                }
                

            } else {
                console.error('上传失败:', result);
                progressEl.innerText = '上传失败: ' + (result.detail || 'Unknown');
                progressEl.style.color = 'red';
            }
        } catch (e) {
            console.error('上传错误:', e);
            progressEl.innerText = '上传出错: ' + e.message;
            progressEl.style.color = 'red';
        }
    });
}

// 获取当前位置信息
function getCurrentLocation(forceNew = false) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持地理定位'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                reject(new Error('获取位置失败: ' + error.message));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: forceNew ? 0 : 60000 // 强制获取新位置时设置为0，否则保留1分钟缓存
            }
        );
    });
}

// 获取北京时间字符串 (YYYY-MM-DD HH:MM:SS)
function getBeijingTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 暴露函数到全局
window.initUpload = initUpload;