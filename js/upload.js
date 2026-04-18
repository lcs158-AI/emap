// 文件上传相关的功能

// 初始化上传功能
function initUpload() {
    document.getElementById('sidebarUploadBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('sidebarFileInput');
        const progressEl = document.getElementById('sidebarUploadProgress');
        const token = localStorage.getItem('gis_token') || localStorage.getItem('access_token');
        const username = localStorage.getItem('username');
        
        if (!fileInput.files.length) { progressEl.innerText = '请选择文件'; return; }
        if (!token) { progressEl.innerText = '请先登录'; return; }
        if (!username) { progressEl.innerText = '用户信息缺失'; return; }

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

        const formData = new FormData();
        for (let file of fileInput.files) formData.append('files', file);
        formData.append('username', username); // 添加用户名参数

        progressEl.innerText = '上传中...';
        
        try {
            const res = await fetch(`${window.API_BASE_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            console.log('上传结果:', result);
            if (res.ok) {
                progressEl.innerText = `上传完成! 成功: ${result.success}, 失败: ${result.failed}, 重复: ${result.duplicate}`;
                progressEl.style.color = 'green';
                fileInput.value = ''; // 清空
                
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
                
                // 上传成功后刷新图层管理
                if (typeof window.createLayerControl === 'function') {
                    window.createLayerControl();
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

// 暴露函数到全局
window.initUpload = initUpload;