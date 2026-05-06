// ======================== 拍照测量功能模块 ========================
// 全局变量
let cameraStream = null;
let filteredCompass = null;
let filteredPitch = null;
let rawAlpha = 0;
const SMOOTHING_FACTOR = 0.2;

// 摄像头传感器原始视场角（横屏模式，长边为水平）
// 以iPhone 14 Pro为例，后置摄像头：水平约78°，垂直约43°
const SENSOR_H_FOV = 78;
const SENSOR_V_FOV = 43;

// 当前屏幕方向
let isPortrait = false;

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

// 传感器监听
let orientationHandler = null;

// 广东地区磁偏角（西偏约3°）
const FIXED_DECLINATION = -3.0;

// ======================== 辅助函数 ========================
Math.radians = (deg) => deg * Math.PI / 180;
Math.degrees = (rad) => rad * 180 / Math.PI;

function getCurrentFOV() {
    if (isPortrait) {
        return { h_fov: SENSOR_V_FOV, v_fov: SENSOR_H_FOV };
    } else {
        return { h_fov: SENSOR_H_FOV, v_fov: SENSOR_V_FOV };
    }
}

function updateScreenOrientation() {
    if (typeof window.orientation !== 'undefined') {
        isPortrait = Math.abs(window.orientation) === 90;
    } else if (window.matchMedia) {
        isPortrait = window.matchMedia('(orientation: portrait)').matches;
    } else {
        isPortrait = window.innerHeight > window.innerWidth;
    }
    console.log(`屏幕方向更新: ${isPortrait ? '竖屏' : '横屏'}, 视场角: ${getCurrentFOV().h_fov}°(水平) × ${getCurrentFOV().v_fov}°(垂直)`);
}

// 将磁北方位角转换为真北
function convertMagneticToTrue(magneticAzimuth) {
    return (magneticAzimuth - FIXED_DECLINATION + 360) % 360;
}

// 将方位角转换为 -180~180 范围
function convertTo180Range(angle) {
    if (angle > 180) {
        return angle - 360;
    }
    return angle;
}

function normalizeAngle(angle) {
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}

// ======================== 8字校准 ========================
function startCalibrationGuide() {
    alert('📡 请将手机平放，在空中缓慢画横向"8"字，持续10秒...\n\n校准完成后传感器数据将更准确！');
    filteredCompass = null;
    filteredPitch = null;
}

// ======================== 传感器监听启动 ========================
function startOrientationListener() {
    if (orientationHandler) {
        window.removeEventListener('deviceorientation', orientationHandler);
    }
    
    orientationHandler = (event) => {
        if (event.alpha === null || event.beta === null) return;
        
        rawAlpha = event.alpha;
        let rawBeta = event.beta;
        
        // 将磁北方位角转换为真北（与无人机偏航角一致）
        let trueAzimuth = convertMagneticToTrue(rawAlpha);
        
        // 转换为后置摄像头方向
        let cameraAzimuth = (trueAzimuth + 180) % 360;
        
        // 平滑处理
        if (filteredCompass === null) {
            filteredCompass = cameraAzimuth;
        } else {
            let delta = cameraAzimuth - filteredCompass;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            filteredCompass = (filteredCompass + SMOOTHING_FACTOR * delta + 360) % 360;
        }
        
        // 俯仰角处理
        let adjustedPitch = rawBeta - 90;
        if (filteredPitch === null || isNaN(filteredPitch)) {
            filteredPitch = adjustedPitch;
        } else {
            filteredPitch += SMOOTHING_FACTOR * (adjustedPitch - filteredPitch);
        }
        
        // 更新UI
        if (compassSpan) compassSpan.innerText = filteredCompass.toFixed(1) + "°";
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
    
    const azimuth = filteredCompass;
    const pitch = filteredPitch;
    const relativeHeight = parseFloat(relativeHeightInput?.value) || 1.6;
    
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
        v_fov: v_fov
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
            <div style="font-size:12px; margin-bottom:3px;"><strong>方位角:</strong> ${displayAzimuth}°</div>
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
        formData.append('file', file);
        formData.append('latitude', capturedParams.latitude);
        formData.append('longitude', capturedParams.longitude);
        formData.append('device_type', 'phone-footprint');
        formData.append('yaw', capturedParams.azimuth);
        formData.append('pitch', capturedParams.pitch);
        formData.append('relative_height', capturedParams.relativeHeight);
        formData.append('h_fov', capturedParams.h_fov);
        formData.append('v_fov', capturedParams.v_fov);
        
        const response = await fetch(`${API_BASE_URL}/api/photos/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ 上传成功！');
            console.log('上传结果:', result);
            
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
    calibrateBtn = document.getElementById('calibrateBtn');
    photoPreviewEl = document.getElementById('capturedPhotoPreview');
    capturedParamsEl = document.getElementById('capturedParams');
    
    updateScreenOrientation();
    window.addEventListener('orientationchange', updateScreenOrientation);
    if (window.matchMedia) {
        window.matchMedia('(orientation: portrait)').addListener(updateScreenOrientation);
    }
    
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
}

window.initCameraFootprint = initCameraFootprint;
