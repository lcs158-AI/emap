// ======================== 拍照测量功能模块 ========================
// 全局变量
let cameraStream = null;
let filteredCompass = null;
let filteredPitch = null;
let rawTrueNorth = 0;
let currentDeclination = 5.0;
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

// 地图图层（仅用于预览显示）
let footprintLayer = null;
let positionMarkerLayer = null;

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

function getApproxDeclination(lat, lon) {
    let dec = 5.0;
    if (lon > 110 && lat > 30) dec = 5.5;
    else if (lon > 100 && lat > 25) dec = 4.5;
    else if (lon < 100) dec = 2.0;
    return dec;
}

async function updateDeclination(lat, lon) {
    currentDeclination = getApproxDeclination(lat, lon);
    if (rawTrueNorth !== null && rawTrueNorth !== 0) {
        const magnetic = normalizeAngle(rawTrueNorth - currentDeclination);
        filteredCompass = magnetic;
        if (compassSpan) compassSpan.innerText = filteredCompass.toFixed(1) + "°";
    }
}

// ======================== 传感器监听 ========================
function startOrientationListener() {
    if (orientationHandler) window.removeEventListener('deviceorientation', orientationHandler);
    orientationHandler = (event) => {
        if (event.alpha === null || event.beta === null) return;
        
        let rawAlpha = event.alpha;
        rawTrueNorth = rawAlpha;
        let rawBeta = event.beta;
        
        // 平滑方位角
        if (filteredCompass === null) {
            let initMagnetic = normalizeAngle(rawAlpha - currentDeclination);
            filteredCompass = initMagnetic;
        } else {
            let instantMagnetic = normalizeAngle(rawAlpha - currentDeclination);
            let delta = instantMagnetic - filteredCompass;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            filteredCompass = normalizeAngle(filteredCompass + SMOOTHING_FACTOR * delta);
        }
        
        // 平滑俯仰角 - 遵循DJI约定：向下为负，范围 -90° ~ 0°
        // 原始 beta 值：0°=水平，负值=向下倾斜（俯视），正值=向上倾斜（仰视）
        // DJI约定：向下为负，所以直接使用原始beta并限制范围
        let adjustedPitch = rawBeta;
        // 限制在 -90° ~ 0° 范围内（向下为负）
        if (adjustedPitch < -90) adjustedPitch = -90;
        if (adjustedPitch > 0) adjustedPitch = 0;
        
        // 初始化时使用当前值，确保有初始值
        if (filteredPitch === null || isNaN(filteredPitch)) {
            filteredPitch = adjustedPitch;
        } else {
            filteredPitch += SMOOTHING_FACTOR * (adjustedPitch - filteredPitch);
        }
        // 确保最终值在范围内
        if (filteredPitch < -90) filteredPitch = -90;
        if (filteredPitch > 0) filteredPitch = 0;
        
        // 更新UI
        if (compassSpan) compassSpan.innerText = filteredCompass.toFixed(1) + "°";
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
            
            updateDeclination(currentLat, currentLon);
            
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
    
    // 更新地图预览
    updateMapPreview(currentLat, currentLon, finalHeight, distance, pitch);
}

// ======================== 在主地图显示预览（仅用于界面展示） ========================
function initPreviewLayers() {
    if (typeof window.ol !== 'undefined' && typeof window.map !== 'undefined') {
        footprintLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: new ol.style.Style({
                fill: new ol.style.Fill({ color: 'rgba(255, 80, 40, 0.35)' }),
                stroke: new ol.style.Stroke({ color: '#ff4d4f', width: 2 })
            })
        });
        
        positionMarkerLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 8,
                    fill: new ol.style.Fill({ color: '#1e88e5' }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                })
            })
        });
        
        window.map.addLayer(footprintLayer);
        window.map.addLayer(positionMarkerLayer);
    }
}

function updateMapPreview(lat, lon, height, distance, pitch) {
    if (!footprintLayer || !positionMarkerLayer || lat === 0 || lon === 0) return;
    
    let azimuth = filteredCompass;
    if (azimuth === null) azimuth = 0;
    
    const pitchRad = Math.radians(pitch);
    const horizDist = distance * Math.cos(pitchRad);
    
    function getPoint(lat, lon, dist, brg) {
        const R = 6371000;
        const φ1 = Math.radians(lat);
        const λ1 = Math.radians(lon);
        const θ = Math.radians(brg);
        const δ = dist / R;
        const φ2 = Math.asin(Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(θ));
        const λ2 = λ1 + Math.atan2(Math.sin(θ)*Math.sin(δ)*Math.cos(φ1), Math.cos(δ) - Math.sin(φ1)*Math.sin(φ2));
        return [Math.degrees(λ2), Math.degrees(φ2)];
    }
    
    const leftAngle = azimuth - H_FOV/2;
    const rightAngle = azimuth + H_FOV/2;
    const leftFront = getPoint(lat, lon, horizDist, leftAngle);
    const rightFront = getPoint(lat, lon, horizDist, rightAngle);
    const backDist = horizDist * 0.3;
    const leftBack = getPoint(lat, lon, backDist, leftAngle + 180);
    const rightBack = getPoint(lat, lon, backDist, rightAngle + 180);
    
    const polyCoords = [leftFront, rightFront, rightBack, leftBack, leftFront];
    
    footprintLayer.getSource().clear();
    const transformedCoords = polyCoords.map(p => ol.proj.fromLonLat(p));
    const polygon = new ol.geom.Polygon([transformedCoords]);
    footprintLayer.getSource().addFeature(new ol.Feature(polygon));
    
    positionMarkerLayer.getSource().clear();
    positionMarkerLayer.getSource().addFeature(
        new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat([lon, lat])))
    );
    
    window.map.getView().setCenter(ol.proj.fromLonLat([lon, lat]));
    window.map.getView().setZoom(17);
}

function clearPreview() {
    if (footprintLayer) {
        footprintLayer.getSource().clear();
    }
    if (positionMarkerLayer) {
        positionMarkerLayer.getSource().clear();
    }
}

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
        capturedParamsEl.innerHTML = `
            <div style="font-size:12px; color:#666; margin-bottom:8px;">📊 拍照参数</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>位置:</strong> ${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>方位角:</strong> ${azimuth?.toFixed(1)||'?'}°</div>
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
    if (!capturedPhoto || !capturedParams) {
        alert('请先拍照');
        return;
    }
    
    const { latitude, longitude, azimuth, pitch, relativeHeight, h_fov, v_fov } = capturedParams;
    
    // 将base64图片转换为blob
    let blob;
    try {
        blob = await fetch(capturedPhoto).then(res => res.blob());
        console.log('照片Blob大小:', blob.size, 'bytes');
    } catch (e) {
        console.error('照片转换失败:', e);
        alert('照片转换失败，请重试');
        return;
    }
    
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    
    // 创建表单数据
    const formData = new FormData();
    formData.append('file', file);
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    
    // 判断设备类型：有方位角和俯仰角则为phone-footprint，否则为phone
    const hasValidOrientation = azimuth !== null && azimuth !== undefined && !isNaN(azimuth) && pitch !== null && pitch !== undefined && !isNaN(pitch);
    formData.append('device_type', hasValidOrientation ? 'phone-footprint' : 'phone');
    
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
    }
    
    // 获取API地址
    const apiUrl = window.API_BASE_URL || API_BASE_URL || 'https://lzy-fastapi.onrender.com';
    console.log('上传到:', `${apiUrl}/api/upload`);
    
    // 上传到后端
    try {
        const response = await fetch(`${apiUrl}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(`上传成功！\n\n文件名: ${result.filename}\n位置: ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}\n设备类型: ${result.device_type}`);
            
            // 刷新地图数据
            if (typeof loadUserUploadedData === 'function') {
                loadUserUploadedData();
            }
            
            // 重置状态
            resetCamera();
        } else {
            alert('上传失败，请重试');
        }
    } catch (error) {
        console.error('上传失败:', error);
        alert('上传失败，请检查网络连接');
    }
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
    
    // 等待地图加载完成后创建预览图层
    const checkMapReady = setInterval(() => {
        if (typeof window.map !== 'undefined' && window.map !== null) {
            clearInterval(checkMapReady);
            initPreviewLayers();
        }
    }, 500);
    
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