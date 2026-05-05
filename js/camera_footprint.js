// ======================== 拍照测量功能模块 ========================
// 全局变量
let cameraStream = null;
let filteredCompass = null;
let filteredPitch = null;
let rawMagneticNorth = 0;
// 广东地区固定磁偏角（西偏约3°，即真北 = 磁北 - 3°）
const FIXED_DECLINATION = -3.0;
const SMOOTHING_FACTOR = 0.2;
const H_FOV = 78;
const V_FOV = 43;

// 当前GPS位置
let currentLat = 0;
let currentLon = 0;

// 拍照后保存的数据
let capturedPhoto = null;
let capturedParams = null;

// DOM元素
let videoEl = null;
let startCameraBtn = null;
let captureBtn = null;
let photoUploadBtn = null;
let compassSpan = null;
let pitchSpan = null;
let heightSpan = null;
let relativeHeightInput = null;
let flatModeCheck = null;
let autoDistanceCheck = null;
let footprintSizeSpan = null;
let calibrateBtn = null;
let photoPreviewEl = null;
let capturedParamsEl = null;

// 不再使用地图预览图层（用户要求拍照后不显示视域范围）

// 传感器监听
let orientationHandler = null;

// ======================== 辅助函数 ========================
Math.radians = (deg) => deg * Math.PI / 180;
Math.degrees = (rad) => rad * 180 / Math.PI;

function normalizeAngle(angle) {
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}

function convertTo180Range(angle) {
    angle = normalizeAngle(angle);
    if (angle > 180) {
        angle -= 360;
    }
    return angle;
}

function convertMagneticToTrue(magneticAzimuth) {
    // 真北 = 磁北 - 磁偏角
    // FIXED_DECLINATION为负（西偏），所以实际上是磁北 + |磁偏角|
    return normalizeAngle(magneticAzimuth - FIXED_DECLINATION);
}

// ======================== 传感器监听 ========================
function startOrientationListener() {
    if (orientationHandler) window.removeEventListener('deviceorientation', orientationHandler);
    orientationHandler = (event) => {
        if (event.alpha === null || event.beta === null) return;
        
        let rawAlpha = event.alpha;
        rawMagneticNorth = rawAlpha;
        let rawBeta = event.beta;
        
        // 将磁北方位角转换为真北（与无人机偏航角逻辑一致）
        let instantTrueNorth = convertMagneticToTrue(rawAlpha);
        
        // 平滑方位角（使用真北，与无人机gimbal_yaw一致）
        if (filteredCompass === null) {
            filteredCompass = instantTrueNorth;
        } else {
            let delta = instantTrueNorth - filteredCompass;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            filteredCompass = normalizeAngle(filteredCompass + SMOOTHING_FACTOR * delta);
        }
        
        // 平滑俯仰角 - 转换为无人机格式（向下为负，与水平方向夹角）
        // 原始 beta 值：视线与垂直方向夹角，向上为正
        // 无人机格式：视线与水平方向夹角，向下为负
        // 转换公式：转换后俯仰角 = 原始俯仰角 - 90（结果为负表示向下，正表示向上）
        let adjustedPitch = rawBeta - 90;
        
        // 初始化时使用当前值，确保有初始值
        if (filteredPitch === null || isNaN(filteredPitch)) {
            filteredPitch = adjustedPitch;
        } else {
            filteredPitch += SMOOTHING_FACTOR * (adjustedPitch - filteredPitch);
        }
        
        // 将方位角转换为 -180° ~ +180° 范围（与无人机gimbal_yaw一致）
        filteredCompass = convertTo180Range(filteredCompass);
        
        // 更新UI（显示为 0~360 范围以便用户理解）
        const displayCompass = filteredCompass < 0 ? filteredCompass + 360 : filteredCompass;
        if (compassSpan) compassSpan.innerText = displayCompass.toFixed(1) + "°";
        if (pitchSpan) pitchSpan.innerText = filteredPitch.toFixed(1) + "°";
        
        // 更新预览显示（如果需要）
        updatePreviewDisplay();
    };
    window.addEventListener('deviceorientation', orientationHandler);
}

// ======================== 8字校准 ========================
function startCalibrationGuide() {
    alert('📡 请将手机平放，在空中缓慢画横向"8"字，持续10秒...\n\n校准完成后传感器数据将更准确！');
    filteredCompass = null;
    filteredPitch = null;
}

// ======================== 摄像头启动 ========================
async function startCamera() {
    try {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        const constraints = { video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } };
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = cameraStream;
        videoEl.style.display = 'block';
        startCameraBtn.style.display = 'none';
        captureBtn.style.display = 'block';
        photoUploadBtn.style.display = 'none';
        
        // 请求传感器权限
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    startOrientationListener();
                    document.getElementById('sensorData').style.display = 'block';
                    document.getElementById('footprintSettings').style.display = 'block';
                    calibrateBtn.style.display = 'block';
                }
            } catch (err) {
                console.warn('传感器权限请求失败:', err);
            }
        } else {
            startOrientationListener();
            document.getElementById('sensorData').style.display = 'block';
            document.getElementById('footprintSettings').style.display = 'block';
            calibrateBtn.style.display = 'block';
        }
        
        // 获取GPS位置（立即获取）
        getRealTimeLocation();
    } catch (err) {
        console.error('摄像头启动失败:', err);
        alert('摄像头启动失败，请检查权限设置');
    }
}

// ======================== 获取GPS位置 ========================
function getRealTimeLocation() {
    if (!navigator.geolocation) {
        alert('您的设备不支持GPS定位');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentLat = pos.coords.latitude;
            currentLon = pos.coords.longitude;
            const alt = pos.coords.altitude;
            
            // 保存到隐藏字段供上传使用
            const latInput = document.getElementById('latitude');
            const lonInput = document.getElementById('longitude');
            if (latInput) latInput.value = currentLat.toFixed(6);
            if (lonInput) lonInput.value = currentLon.toFixed(6);
            
            // 更新高度
            if (alt && !flatModeCheck?.checked) {
                let finalAlt = alt;
                if (finalAlt < 1) finalAlt = 1.6;
                relativeHeightInput.value = finalAlt.toFixed(1);
            }
            if (heightSpan) heightSpan.innerText = relativeHeightInput.value + 'm';
            
            // 更新预览显示
            updatePreviewDisplay();
            
            console.log(`GPS位置获取成功: ${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}`);
        },
        (error) => {
            console.error('GPS获取失败:', error);
            alert('无法获取GPS位置，请检查定位权限设置');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// ======================== 更新预览显示（仅用于界面展示） ========================
function updatePreviewDisplay() {
    if (!relativeHeightInput) return;
    
    let relH = parseFloat(relativeHeightInput.value) || 1.6;
    if (relH < 1) { relH = 1.6; relativeHeightInput.value = "1.6"; }
    const finalHeight = flatModeCheck?.checked ? 1.6 : relH;
    
    if (heightSpan) heightSpan.innerText = finalHeight.toFixed(1) + 'm';
    
    // 计算预览距离（仅用于显示）
    let distance = 10;
    let pitch = Math.abs(filteredPitch || 0);
    
    if (autoDistanceCheck?.checked && pitch > 5 && pitch < 85) {
        const pitchRad = Math.radians(pitch);
        const calcDist = finalHeight / Math.tan(pitchRad);
        if (calcDist > 0.5 && calcDist < 2000) {
            distance = calcDist;
        }
    }
    
    const halfWidth = distance * Math.tan(Math.radians(H_FOV/2));
    const halfHeight = distance * Math.tan(Math.radians(V_FOV/2));
    if (footprintSizeSpan) footprintSizeSpan.innerText = `${(halfWidth*2).toFixed(1)}m × ${(halfHeight*2).toFixed(1)}m`;
    
    // 不再更新地图预览（用户要求拍照后不显示视域范围）
}

// ======================== 在主地图显示预览（仅用于界面展示） ========================
// 不再使用视域预览功能（用户要求拍照后不显示视域范围）

// ======================== 拍照（仅拍照，不上传） ========================
function capturePhoto() {
    if (!videoEl || !videoEl.videoWidth || !videoEl.srcObject) {
        alert('请先启动摄像头');
        return;
    }
    
    // 检查GPS位置
    if (currentLat === 0 || currentLon === 0) {
        alert('无法获取GPS位置，请确保已开启定位权限');
        getRealTimeLocation();
        return;
    }
    
    const azimuth = filteredCompass;
    const pitch = filteredPitch;
    const relativeHeight = parseFloat(relativeHeightInput?.value) || 1.6;
    
    // 拍照
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        alert('无法创建画布上下文');
        return;
    }
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    
    // 保存照片和参数
    capturedPhoto = canvas.toDataURL('image/jpeg', 0.9);
    console.log('拍照成功，照片数据长度:', capturedPhoto.length);
    capturedParams = {
        latitude: currentLat,
        longitude: currentLon,
        azimuth: azimuth,
        pitch: pitch,
        relativeHeight: relativeHeight,
        h_fov: H_FOV,
        v_fov: V_FOV
    };
    
    // 显示照片预览
    if (photoPreviewEl) {
        photoPreviewEl.src = capturedPhoto;
        photoPreviewEl.style.display = 'block';
    }
    
    // 显示参数信息
    if (capturedParamsEl) {
        const displayPitch = pitch !== null ? pitch.toFixed(1) : '?';
        // 显示时转换为 0~360 范围，保存和上传使用 -180~180 范围
        const displayAzimuth = azimuth !== null ? (azimuth < 0 ? azimuth + 360 : azimuth).toFixed(1) : '?';
        capturedParamsEl.innerHTML = `
            <div style="font-size:12px; color:#666; margin-bottom:8px;">📊 拍照参数</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>位置:</strong> ${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>方位角:</strong> ${displayAzimuth}°</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>俯仰角:</strong> ${displayPitch}°</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>相对高度:</strong> ${relativeHeight}m</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>水平视场角:</strong> ${H_FOV}°</div>
            <div style="font-size:12px;"><strong>垂直视场角:</strong> ${V_FOV}°</div>
        `;
        capturedParamsEl.style.display = 'block';
    }
    
    // 隐藏拍照按钮，显示上传按钮
    captureBtn.style.display = 'none';
    photoUploadBtn.style.display = 'block';
    
    // 隐藏摄像头预览
    videoEl.style.display = 'none';
}

// ======================== 上传（仅上传，不拍照） ========================
async function uploadPhoto() {
    console.log('========== 开始上传 ==========');
    console.log('capturedPhoto存在:', !!capturedPhoto);
    console.log('capturedParams存在:', !!capturedParams);
    console.log('capturedPhoto长度:', capturedPhoto ? capturedPhoto.length : 0);
    
    if (!capturedPhoto || !capturedParams) {
        const msg = '错误：请先拍照';
        console.error(msg);
        alert(msg);
        return;
    }
    
    // 检查照片数据是否有效
    if (!capturedPhoto.startsWith('data:image/jpeg;base64,')) {
        const msg = '错误：照片数据格式无效';
        console.error(msg);
        alert(msg);
        return;
    }
    
    const { latitude, longitude, azimuth, pitch, relativeHeight, h_fov, v_fov } = capturedParams;
    
    console.log('上传参数:');
    console.log('  - 位置:', latitude, longitude);
    console.log('  - 方位角:', azimuth);
    console.log('  - 俯仰角:', pitch);
    console.log('  - 相对高度:', relativeHeight);
    console.log('  - 水平视场角:', h_fov);
    console.log('  - 垂直视场角:', v_fov);
    
    // 将base64图片转换为blob
    let blob;
    try {
        console.log('开始转换照片为Blob...');
        blob = await fetch(capturedPhoto).then(res => res.blob());
        console.log('照片Blob大小:', blob.size, 'bytes');
    } catch (e) {
        const msg = '错误：照片转换失败: ' + (e.message || e.toString());
        console.error(msg);
        alert(msg);
        return;
    }
    
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    console.log('创建文件对象:', file.name, file.type, file.size);
    
    // 获取当前登录用户
    const username = localStorage.getItem('username') || 'anonymous';
    console.log('上传人:', username);
    
    // 创建表单数据
    const formData = new FormData();
    formData.append('files', file);
    formData.append('username', username);
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    
    // 添加拍摄时间
    const captureTime = new Date().toISOString();
    formData.append('capture_time', captureTime);
    console.log('拍摄时间:', captureTime);
    
    // 判断设备类型：有方位角和俯仰角则为phone-footprint，否则为phone
    const hasValidOrientation = azimuth !== null && azimuth !== undefined && !isNaN(azimuth) && pitch !== null && pitch !== undefined && !isNaN(pitch);
    const deviceType = hasValidOrientation ? 'phone-footprint' : 'phone';
    formData.append('device_type', deviceType);
    console.log('设备类型:', deviceType);
    
    // 添加传感器参数（后端根据这些参数生成视域）
    formData.append('yaw', azimuth || 0);
    formData.append('pitch', pitch || 0);
    formData.append('relative_height', relativeHeight);
    formData.append('h_fov', h_fov);
    formData.append('v_fov', v_fov);
    
    // 获取问题类型
    const problemType = document.getElementById('problemTypeSelect')?.value || '';
    if (problemType) {
        formData.append('problem_type', problemType);
        console.log('问题类型:', problemType);
    }
    
    // 获取API地址
    const apiUrl = window.API_BASE_URL || API_BASE_URL || 'https://lzy-fastapi.onrender.com';
    console.log('API地址:', apiUrl);
    
    // 上传到后端
    try {
        console.log('发送POST请求到:', `${apiUrl}/api/upload`);
        console.log('请求体大小（估计）:', blob.size + 1000, 'bytes');
        
        const startTime = Date.now();
        const response = await fetch(`${apiUrl}/api/upload`, {
            method: 'POST',
            body: formData
        });
        const responseTime = Date.now() - startTime;
        
        console.log('响应时间:', responseTime, 'ms');
        console.log('响应状态码:', response.status);
        console.log('响应状态文本:', response.statusText);
        
        if (response.ok) {
            try {
                const result = await response.json();
                console.log('上传成功:', JSON.stringify(result, null, 2));
                
                // 安全地获取响应数据
                const successCount = result.success || 0;
                const failedCount = result.failed || 0;
                
                // 从 latest_center 获取坐标（后端返回的结构）
                const latestCenter = result.latest_center || {};
                const lat = latestCenter.lat !== undefined ? latestCenter.lat.toFixed(5) : '未知';
                const lon = latestCenter.lon !== undefined ? latestCenter.lon.toFixed(5) : '未知';
                
                alert(`上传成功！\n\n成功: ${successCount} 张\n失败: ${failedCount} 张\n位置: ${lat}, ${lon}`);
                
                // 刷新地图数据
                if (typeof loadUserUploadedData === 'function') {
                    loadUserUploadedData();
                }
                
                // 重置状态
                resetCamera();
            } catch (e) {
                const msg = '错误：响应解析失败: ' + (e.message || e.toString());
                console.error(msg);
                alert(msg);
            }
        } else {
            let errorMsg = `HTTP错误 ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData && typeof errorData === 'object') {
                    errorMsg = errorData.detail || errorData.message || JSON.stringify(errorData, null, 2);
                } else if (typeof errorData === 'string') {
                    errorMsg = errorData;
                }
            } catch (e) {
                try {
                    const text = await response.text();
                    errorMsg = text.substring(0, 500);
                } catch (e2) {
                    // 保持原有错误信息
                }
            }
            console.error('上传失败:', errorMsg);
            alert('上传失败:\n\n' + errorMsg);
        }
    } catch (error) {
        const errorMsg = error.message || error.toString();
        console.error('上传异常:', errorMsg);
        console.error('错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        // 根据错误类型提供更详细的提示
        let detailedMsg = '上传失败，请检查网络连接';
        if (errorMsg.includes('Failed to fetch')) {
            detailedMsg = '网络请求失败，请检查：\n1. 网络连接是否正常\n2. 是否可以访问外网\n3. 服务器是否正常运行';
        } else if (errorMsg.includes('CORS')) {
            detailedMsg = '跨域请求被阻止，请联系管理员检查服务器配置';
        } else if (errorMsg.includes('timeout')) {
            detailedMsg = '请求超时，请检查网络连接或稍后重试';
        }
        
        alert(detailedMsg + '\n\n错误详情: ' + errorMsg);
    }
    console.log('========== 上传结束 ==========');
}

// ======================== 重置摄像头状态 ========================
function resetCamera() {
    // 清空保存的数据
    capturedPhoto = null;
    capturedParams = null;
    
    // 隐藏照片预览和参数
    if (photoPreviewEl) {
        photoPreviewEl.style.display = 'none';
    }
    if (capturedParamsEl) {
        capturedParamsEl.style.display = 'none';
    }
    
    // 隐藏上传按钮，显示拍照按钮
    photoUploadBtn.style.display = 'none';
    captureBtn.style.display = 'block';
    
    // 显示摄像头预览
    if (videoEl && cameraStream) {
        videoEl.style.display = 'block';
    }
}

// ======================== 初始化 ========================
function initCameraFootprint() {
    videoEl = document.getElementById('cameraPreview');
    startCameraBtn = document.getElementById('startCameraBtn');
    captureBtn = document.getElementById('capturePhotoBtn');
    photoUploadBtn = document.getElementById('uploadPhotoBtn');
    compassSpan = document.getElementById('compassValue');
    pitchSpan = document.getElementById('pitchValue');
    heightSpan = document.getElementById('heightValue');
    relativeHeightInput = document.getElementById('relativeHeightInput');
    flatModeCheck = document.getElementById('flatModeCheck');
    autoDistanceCheck = document.getElementById('autoDistanceCheck');
    footprintSizeSpan = document.getElementById('footprintSize');
    calibrateBtn = document.getElementById('calibrateBtn');
    photoPreviewEl = document.getElementById('capturedPhotoPreview');
    capturedParamsEl = document.getElementById('capturedParams');
    
    // 不再创建视域预览图层（用户要求拍照后不显示视域范围）
    
    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', startCamera);
    }
    if (captureBtn) {
        captureBtn.addEventListener('click', capturePhoto);
    }
    if (photoUploadBtn) {
        photoUploadBtn.addEventListener('click', uploadPhoto);
    }
    if (calibrateBtn) {
        calibrateBtn.addEventListener('click', startCalibrationGuide);
    }
    if (flatModeCheck) {
        flatModeCheck.addEventListener('change', () => {
            if (flatModeCheck.checked) {
                relativeHeightInput.value = "1.6";
            }
            updatePreviewDisplay();
        });
    }
    if (autoDistanceCheck) {
        autoDistanceCheck.addEventListener('change', updatePreviewDisplay);
    }
    if (relativeHeightInput) {
        relativeHeightInput.addEventListener('input', updatePreviewDisplay);
    }
}

// 导出函数供外部调用
window.initCameraFootprint = initCameraFootprint;