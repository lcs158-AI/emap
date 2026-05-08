// ======================== 拍照测量功能模块 ========================
// 全局变量
let cameraStream = null;
let filteredCompass = null;
let filteredPitch = null;
let rawAlpha = 0;
const SMOOTHING_FACTOR = 0.2;

// 摄像头传感器原始视场角（竖屏模式，长边为垂直）
// 以iPhone 14 Pro为例，后置摄像头：水平约78°，垂直约43°
const SENSOR_H_FOV = 78;
const SENSOR_V_FOV = 43;

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
let northZeroBtn = null;
let photoPreviewEl = null;
let capturedParamsEl = null;

// 传感器监听
let orientationHandler = null;

// 正北归零相关变量
let isNorthZeroed = false;
let northZeroBaseAngle = 0;
let sensorReady = false;
let lastAlphaForRotation = 0;  // 用于计算旋转的上次传感器值
let relativeAzimuth = null;     // 相对方位角（归零后通过旋转增量计算）

// ======================== 辅助函数 ========================
Math.radians = (deg) => deg * Math.PI / 180;
Math.degrees = (rad) => rad * 180 / Math.PI;

// 竖屏模式，返回互换后的视场角
function getCurrentFOV() {
    return { h_fov: SENSOR_V_FOV, v_fov: SENSOR_H_FOV };
}

// 将角度转换为 -180~180 范围（顺时针为正）
function convertTo180Range(angle) {
    angle = angle % 360;
    if (angle > 180) {
        return angle - 360;
    }
    if (angle <= -180) {
        return angle + 360;
    }
    return angle;
}

function normalizeAngle(angle) {
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}

// ======================== 正北归零 ========================
function setNorthZero() {
    if (!sensorReady) {
        alert('⚠️ 传感器尚未就绪，请稍后再试');
        return;
    }
    
    // 记录归零时刻的传感器方位角（已转为 -180~180）作为基准
    northZeroBaseAngle = convertTo180Range(rawAlpha);
    lastAlphaForRotation = rawAlpha;
    isNorthZeroed = true;
    relativeAzimuth = 0;  // 相对方位角从零开始
    
    if (compassSpan) {
        compassSpan.innerText = '0.0° (相对)';
    }
    
    alert('✅ 正北已归零！\n\n相对方位角从当前位置开始计算：\n- 正北 = 0°\n- 正东 = 90°\n- 正南 = 180°\n- 正西 = -90°');
    
    // 更新按钮状态
    if (northZeroBtn) {
        northZeroBtn.innerText = '取消归零';
        northZeroBtn.removeEventListener('click', setNorthZero);
        northZeroBtn.addEventListener('click', cancelNorthZero);
    }
}

// ======================== 取消正北归零 ========================
function cancelNorthZero() {
    isNorthZeroed = false;
    northZeroBaseAngle = 0;
    lastAlphaForRotation = 0;
    relativeAzimuth = null;  // 清除相对方位角
    
    if (northZeroBtn) {
        northZeroBtn.innerText = '正北归零';
        northZeroBtn.removeEventListener('click', cancelNorthZero);
        northZeroBtn.addEventListener('click', setNorthZero);
    }
    
    alert('✅ 已取消正北归零，恢复使用传感器原始方位角');
}

// ======================== 传感器监听启动 ========================
function startOrientationListener() {
    if (orientationHandler) {
        window.removeEventListener('deviceorientation', orientationHandler);
    }
    
    sensorReady = false;
    
    orientationHandler = (event) => {
        if (event.alpha === null || event.beta === null) return;
        
        sensorReady = true;
        
        // 获取设备方位角 - 使用 webkitCompassHeading（iOS 原生罗盘航向）优先
        // iOS 上 webkitCompassHeading 返回 0-360 顺时针真北航向，更准确
        // 其他设备退化为 event.alpha（标准 W3C 规范为顺时针递增）
        if (typeof event.webkitCompassHeading !== 'undefined' && event.webkitCompassHeading !== null) {
            rawAlpha = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            rawAlpha = event.alpha;
        } else {
            return;
        }
        
        let rawBeta = event.beta;
        
        // ========== 始终更新传感器方位角（filteredCompass） ==========
        let sensorAzimuth = convertTo180Range(rawAlpha);
        
        if (filteredCompass === null) {
            filteredCompass = sensorAzimuth;
        } else {
            let delta = sensorAzimuth - filteredCompass;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            filteredCompass = filteredCompass + SMOOTHING_FACTOR * delta;
            filteredCompass = convertTo180Range(filteredCompass);
        }
        
        // ========== 正北归零后，同时计算相对方位角 ==========
        if (isNorthZeroed) {
            // 直接根据当前传感器方位角与归零基准计算相对方位角（非增量，无累积误差）
            let sensorNow = convertTo180Range(rawAlpha);
            let delta = sensorNow - northZeroBaseAngle;
            relativeAzimuth = convertTo180Range(delta);
        }
        
        // 俯仰角处理（竖屏模式）
        let adjustedPitch = rawBeta - 90;
        if (filteredPitch === null || isNaN(filteredPitch)) {
            filteredPitch = adjustedPitch;
        } else {
            filteredPitch += SMOOTHING_FACTOR * (adjustedPitch - filteredPitch);
        }
        
        // 更新UI
        if (compassSpan) {
            if (isNorthZeroed && relativeAzimuth !== null) {
                // 显示相对方位角（优先使用）
                compassSpan.innerText = relativeAzimuth.toFixed(1) + "° (相对)";
            } else {
                // 显示传感器方位角
                compassSpan.innerText = filteredCompass.toFixed(1) + "°";
            }
        }
        if (pitchSpan) pitchSpan.innerText = filteredPitch.toFixed(1) + "°";
        
        // 更新视场范围
        updateFootprintPreview();
    };
    
    window.addEventListener('deviceorientation', orientationHandler);
}

// ======================== 视场范围预览 ========================
function updateFootprintPreview() {
    if (!currentLat || !currentLon) return;
    
    const azimuth = filteredCompass;
    const pitch = filteredPitch;
    const relativeHeight = parseFloat(relativeHeightInput?.value) || 1.6;
    
    let distance = relativeHeight * 20;
    
    if (autoDistanceCheck?.checked && pitch > 5 && pitch < 85) {
        const pitchRad = Math.radians(pitch);
        const calcDist = relativeHeight / Math.tan(pitchRad);
        if (calcDist > 0.5 && calcDist < 2000) {
            distance = calcDist;
        }
    }
    
    const { h_fov, v_fov } = getCurrentFOV();
    const halfWidth = distance * Math.tan(Math.radians(h_fov/2));
    const halfHeight = distance * Math.tan(Math.radians(v_fov/2));
    if (footprintSizeSpan) footprintSizeSpan.innerText = `${(halfWidth*2).toFixed(1)}m × ${(halfHeight*2).toFixed(1)}m`;
}

// ======================== 摄像头启动 ========================
async function startCamera() {
    // 检查是否为竖屏
    if (window.innerWidth > window.innerHeight) {
        alert('📱 请将手机转为竖屏模式拍摄！');
        return;
    }
    
    isNorthZeroed = false;
    northZeroBaseAngle = 0;
    filteredCompass = null;
    filteredPitch = null;
    
    try {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        
        const constraints = { 
            video: { 
                facingMode: { exact: "environment" }, 
                width: { ideal: 720 }, 
                height: { ideal: 1280 }
            } 
        };
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = cameraStream;
        videoEl.style.display = 'block';
        startCameraBtn.style.display = 'none';
        captureBtn.style.display = 'block';
        photoUploadBtn.style.display = 'none';
        
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    startOrientationListener();
                    document.getElementById('sensorData').style.display = 'block';
                    document.getElementById('footprintSettings').style.display = 'block';
                    if (northZeroBtn) northZeroBtn.style.display = 'block';
                }
            } catch (err) {
                console.warn('传感器权限请求失败:', err);
            }
        } else {
            startOrientationListener();
            document.getElementById('sensorData').style.display = 'block';
            document.getElementById('footprintSettings').style.display = 'block';
            if (northZeroBtn) northZeroBtn.style.display = 'block';
        }
        
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
        (position) => {
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;
            if (heightSpan) heightSpan.innerText = position.coords.altitude ? position.coords.altitude.toFixed(1) + 'm' : '--m';
            console.log(`GPS位置获取成功: ${currentLat}, ${currentLon}`);
        },
        (error) => {
            console.error('GPS定位失败:', error);
            alert('无法获取GPS位置，请确保已开启定位权限');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// ======================== 拍照 ========================
function capturePhoto() {
    if (!videoEl || !videoEl.videoWidth || !videoEl.srcObject) {
        alert('请先启动摄像头');
        return;
    }
    
    if (currentLat === 0 || currentLon === 0) {
        alert('无法获取GPS位置，请确保已开启定位权限');
        getRealTimeLocation();
        return;
    }
    
    if (!isNorthZeroed) {
        alert('⚠️ 请先点击"正北归零"按钮进行方位校准！');
        return;
    }
    
    // 优先使用相对方位角（正北归零后计算的），否则使用传感器方位角
    const azimuth = (relativeAzimuth !== null) ? relativeAzimuth : filteredCompass;
    const pitch = filteredPitch;
    const relativeHeight = parseFloat(relativeHeightInput?.value) || 1.6;
    const azimuthType = (relativeAzimuth !== null) ? '相对方位角' : '传感器方位角';
    
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        alert('无法创建画布上下文');
        return;
    }
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    
    const { h_fov, v_fov } = getCurrentFOV();
    
    capturedPhoto = canvas.toDataURL('image/jpeg', 0.9);
    capturedParams = {
        latitude: currentLat,
        longitude: currentLon,
        azimuth: azimuth,
        pitch: pitch,
        relativeHeight: relativeHeight,
        h_fov: h_fov,
        v_fov: v_fov,
        azimuthType: azimuthType  // 记录使用的方位角类型
    };
    
    if (photoPreviewEl) {
        photoPreviewEl.src = capturedPhoto;
        photoPreviewEl.style.display = 'block';
    }
    
    if (capturedParamsEl) {
        const displayPitch = pitch !== null ? pitch.toFixed(1) : '?';
        const displayAzimuth = azimuth !== null ? azimuth.toFixed(1) : '?';
        capturedParamsEl.innerHTML = `
            <div style="font-size:12px; color:#666; margin-bottom:8px;">📊 拍照参数</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>位置:</strong> ${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>方位角:</strong> ${displayAzimuth}° (${azimuthType}, 正北=0°, 正东=90°)</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>俯仰角:</strong> ${displayPitch}°</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>相对高度:</strong> ${relativeHeight}m</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>水平视场角:</strong> ${h_fov}°</div>
            <div style="font-size:12px;"><strong>垂直视场角:</strong> ${v_fov}°</div>
        `;
        capturedParamsEl.style.display = 'block';
    }
    
    captureBtn.style.display = 'none';
    photoUploadBtn.style.display = 'block';
    videoEl.style.display = 'none';
}

// ======================== 上传 ========================
async function uploadPhoto() {
    if (!capturedPhoto || !capturedParams) {
        alert('错误：请先拍照');
        return;
    }
    
    if (!capturedPhoto.startsWith('data:image/jpeg;base64,')) {
        alert('错误：照片数据格式无效');
        return;
    }
    
    try {
        const blob = await fetch(capturedPhoto).then(res => res.blob());
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        const formData = new FormData();
        formData.append('files', file);
        
        try {
            const latestLocation = await getCurrentLocation(true);
            formData.append('latitude', latestLocation.lat);
            formData.append('longitude', latestLocation.lon);
            console.log('使用最新位置:', latestLocation);
        } catch (locationError) {
            console.warn('获取最新位置失败，使用拍照时的位置:', locationError.message);
            formData.append('latitude', capturedParams.latitude);
            formData.append('longitude', capturedParams.longitude);
        }
        
        formData.append('datetime', new Date().toISOString().replace('T', ' ').substring(0, 19));
        
        const username = localStorage.getItem('username');
        if (username) {
            formData.append('username', username);
            console.log('当前登录用户:', username);
        }
        
        formData.append('device_type', 'phone-footprint');
        formData.append('yaw', capturedParams.azimuth);
        formData.append('pitch', capturedParams.pitch);
        formData.append('relative_height', capturedParams.relativeHeight);
        formData.append('h_fov', capturedParams.h_fov);
        formData.append('v_fov', capturedParams.v_fov);
        
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ 上传成功！');
            console.log('上传结果:', result);
            
            if (result.user_data && typeof loadUserDataToMap === 'function') {
                loadUserDataToMap(result.user_data);
                console.log('已刷新用户照片数据');
            }
            
            capturedPhoto = null;
            capturedParams = null;
            photoPreviewEl.style.display = 'none';
            capturedParamsEl.style.display = 'none';
            photoUploadBtn.style.display = 'none';
            startCameraBtn.style.display = 'block';
        } else {
            alert('❌ 上传失败: ' + (result.detail || '未知错误'));
        }
    } catch (error) {
        console.error('上传失败:', error);
        alert('❌ 上传失败: ' + error.message);
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
    northZeroBtn = document.getElementById('northZeroBtn');
    photoPreviewEl = document.getElementById('capturedPhotoPreview');
    capturedParamsEl = document.getElementById('capturedParams');
    
    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', startCamera);
    }
    if (captureBtn) {
        captureBtn.addEventListener('click', capturePhoto);
    }
    if (photoUploadBtn) {
        photoUploadBtn.addEventListener('click', uploadPhoto);
    }
    if (northZeroBtn) {
        northZeroBtn.addEventListener('click', setNorthZero);
    }
}

window.initCameraFootprint = initCameraFootprint;
