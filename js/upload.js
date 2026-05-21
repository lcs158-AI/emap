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
        const token = localStorage.getItem('access_token');
        
        // 检查是否选择了文件
        const hasCameraFiles = cameraInput && cameraInput.files && cameraInput.files.length > 0;
        const hasLocalImageFiles = localImageInput && localImageInput.files && localImageInput.files.length > 0;
        
        if (!hasCameraFiles && !hasLocalImageFiles) {
            progressEl.innerText = '请选择文件';
            return;
        }
        
        if (!token) { 
            progressEl.innerText = '📤 请先登录后再上传照片'; 
            progressEl.style.color = '#e6a23c';
            return; 
        }

        const formData = new FormData();
        
        // 添加相机拍摄的文件
        if (cameraInput && hasCameraFiles) {
            for (let file of cameraInput.files) {
                formData.append('files', file);
            }
        }
        
        // 添加本地图片文件（所有登录用户都可以上传本地图片）
        if (hasLocalImageFiles) {
            for (let file of localImageInput.files) {
                formData.append('files', file);
            }
        }
        
        // 时间字段处理规则：
        // 1. 拍照上传：capture_time = 上传时间（当前时间），后端直接使用
        // 2. 本地照片上传：不传capture_time，让后端从EXIF读取拍照时间
        if (hasCameraFiles) {
            // 拍照上传：传递当前时间为capture_time
            formData.append('capture_time', getBeijingTime());
        }
        // 本地照片上传：不传递capture_time，后端从EXIF读取
        
        // 添加问题类型
        const problemTypeSelect = document.getElementById('problemTypeSelect');
        const problemType = problemTypeSelect ? problemTypeSelect.value : '';
        formData.append('problem_type', problemType);

        progressEl.innerText = '上传中...';
        
        try {
            const res = await fetch(`${window.API_BASE_URL}/api/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            if (res.status === 401) {
                progressEl.innerText = '📤 登录已过期，请重新登录';
                progressEl.style.color = '#e6a23c';
                // 清除本地登录状态
                localStorage.removeItem('access_token');
                localStorage.removeItem('username');
                // 刷新UI
                if (typeof updateSidebarUI === 'function') {
                    updateSidebarUI();
                }
                return;
            }
            
            const result = await res.json();
            
            if (res.ok) {
                let message = `上传完成! 成功: ${result.success}, 失败: ${result.failed}, 重复: ${result.duplicate}`;
                if (result.no_location && result.no_location > 0) {
                    message += `, 无定位图片: ${result.no_location} (未入库)`;
                }
                progressEl.innerText = message;
                progressEl.style.color = 'green';
                
                // 清空输入
                if (cameraInput) {
                    cameraInput.value = '';
                }
                localImageInput.value = '';
                
                // 定位到最新上传数据的中心位置
                if (result.latest_center) {
                    const { lat, lon, zoom } = result.latest_center;
                    if (window.map && window.ol) {
                        const center = window.ol.proj.fromLonLat([lon, lat]);
                        window.map.getView().setCenter(center);
                        window.map.getView().setZoom(zoom);
                    }
                }
                
                // 加载用户数据到地图
                if (result.user_data) {
                    if (typeof loadUserDataToMap === 'function') {
                        loadUserDataToMap(result.user_data);
                    }
                } else {
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
                maximumAge: forceNew ? 0 : 60000
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
