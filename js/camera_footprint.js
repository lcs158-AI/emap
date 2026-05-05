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

// 方位角归零修正功能
let isZeroed = false;           // 是否已归零
let zeroAlpha = 0;              // 归零时的原始alpha值
let lastRelativeAngle = 0;      // 归零后的相对角度

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

// 指南针弹窗相关
let compassModal = null;
let compassNeedle = null;
let compassDirection = null;
let compassCardinal = null;

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

// ======================== 方位角归零修正功能 ========================
function zeroAzimuth() {
    // 记录当前原始alpha值作为归零基准
    zeroAlpha = rawAlpha;
    lastRelativeAngle = 0;
    isZeroed = true;
    filteredCompass = 0;
    console.log(`方位角已归零！归零时原始alpha: ${zeroAlpha}°`);
    alert('✅ 方位角已归零！\n\n现在请保持手机水平，旋转手机来调整拍摄方向。\n归零后将使用相对旋转角度计算方位角。');
    
    // 更新UI显示归零状态
    updateZeroIndicator(true);
}

function resetZero() {
    isZeroed = false;
    zeroAlpha = 0;
    lastRelativeAngle = 0;
    console.log('方位角归零已取消，恢复使用原始传感器数据');
    alert('已取消归零，恢复使用原始传感器方位角');
    
    // 更新UI显示归零状态
    updateZeroIndicator(false);
}

function updateZeroIndicator(isActive) {
    const zeroBtn = document.getElementById('zeroAzimuthBtn');
    if (zeroBtn) {
        zeroBtn.textContent = isActive ? '🔄 取消归零' : '🎯 归零正北';
        zeroBtn.style.background = isActive ? '#ff6b6b' : '#10b981';
    }
}

// ======================== 指南针弹窗功能 ========================
function showCompass() {
    if (compassModal) {
        compassModal.style.display = 'flex';
        // 初始化刻度
        initCompassTicks();
    }
}

function hideCompass() {
    if (compassModal) {
        compassModal.style.display = 'none';
    }
}

function initCompassTicks() {
    const ticksContainer = document.getElementById('compassTicks');
    if (!ticksContainer) return;
    
    ticksContainer.innerHTML = '';
    for (let i = 0; i < 36; i++) {
        const angle = i * 10;
        const isMajor = i % 3 === 0;
        const tick = document.createElement('div');
        tick.style.position = 'absolute';
        tick.style.width = isMajor ? '2px' : '1px';
        tick.style.height = isMajor ? '12px' : '6px';
        tick.style.background = '#fff';
        tick.style.top = '8px';
        tick.style.left = '50%';
        tick.style.transformOrigin = '50% 92px';
        tick.style.transform = `translateX(-50%) rotate(${angle}deg)`;
        ticksContainer.appendChild(tick);
    }
}

function updateCompass(angle) {
    if (compassNeedle) {
        compassNeedle.style.transform = `translate(-50%, -100%) rotate(${-angle}deg)`;
    }
    if (compassDirection) {
        compassDirection.textContent = angle.toFixed(1) + '°';
    }
    if (compassCardinal) {
        compassCardinal.textContent = getCardinalDirection(angle);
    }
}

function getCardinalDirection(angle) {
    const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const index = Math.round(angle / 45) % 8;
    return directions[index];
}

// ======================== 传感器监听 ========================
function startOrientationListener() {
    if (orientationHandler) window.removeEventListener('deviceorientation', orientationHandler);
    orientationHandler = (event) => {
        if (event.alpha === null || event.beta === null) return;

        // 保存原始alpha值（用于归零功能）
        rawAlpha = event.alpha;
        let rawBeta = event.beta;

        // ========== 关键修正：转换为后置摄像头方向 ==========
        // 后置摄像头指向与屏幕正面法线相反，因此方位角 = (alpha + 180) % 360
        let cameraAlpha = (rawAlpha + 180) % 360;

        // ========== 归零修正逻辑 ==========
        let currentAngle;
        if (isZeroed) {
            // 已归零：计算相对旋转角度
            let delta = cameraAlpha - zeroAlpha;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            lastRelativeAngle = (lastRelativeAngle + delta + 360) % 360;
            currentAngle = lastRelativeAngle;
            zeroAlpha = cameraAlpha; // 更新基准值
        } else {
            // 未归零：使用原始传感器数据
            currentAngle = cameraAlpha;
        }

        // 平滑处理
        if (filteredCompass === null) {
            filteredCompass = currentAngle;
        } else {
            let delta = currentAngle - filteredCompass;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            filteredCompass = (filteredCompass + SMOOTHING_FACTOR * delta + 360) % 360;
        }

        // 俯仰角处理保持不变
        let adjustedPitch = rawBeta - 90;
        if (filteredPitch === null || isNaN(filteredPitch)) {
            filteredPitch = adjustedPitch;
        } else {
            filteredPitch += SMOOTHING_FACTOR * (adjustedPitch - filteredPitch);
        }

        // 更新 UI（明确标注为“镜头方向”）
        if (compassSpan) compassSpan.innerText = filteredCompass.toFixed(1) + "° (镜头)";
        if (pitchSpan) pitchSpan.innerText = filteredPitch.toFixed(1) + "°";

        // 更新指南针显示
        updateCompass(filteredCompass);

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
    
    // 使用当前屏幕方向对应的视场角
    const { h_fov, v_fov } = getCurrentFOV();
    const halfWidth = distance * Math.tan(Math.radians(h_fov/2));
    const halfHeight = distance * Math.tan(Math.radians(v_fov/2));
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
    
    // 获取当前屏幕方向对应的视场角
    const { h_fov, v_fov } = getCurrentFOV();
    
    // 保存照片和参数
    capturedPhoto = canvas.toDataURL('image/jpeg', 0.9);
    console.log('拍照成功，照片数据长度:', capturedPhoto.length);
    capturedParams = {
        latitude: currentLat,
        longitude: currentLon,
        azimuth: azimuth,
        pitch: pitch,
        relativeHeight: relativeHeight,
        h_fov: h_fov,
        v_fov: v_fov
    };
    
    // 显示照片预览
    if (photoPreviewEl) {
        photoPreviewEl.src = capturedPhoto;
        photoPreviewEl.style.display = 'block';
    }
    
    // 显示参数信息
    if (capturedParamsEl) {
        const displayPitch = pitch !== null ? pitch.toFixed(1) : '?';
        const displayAzimuth = azimuth !== null ? azimuth.toFixed(1) : '?';
        capturedParamsEl.innerHTML = `
            <div style="font-size:12px; color:#666; margin-bottom:8px;">📊 拍照参数</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>位置:</strong> ${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}</div>
            <div style="font-size:12px; margin-bottom:3px;"><strong>方位角(alpha):</strong> ${displayAzimuth}°</div>
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
    
    // 初始化屏幕方向
    updateScreenOrientation();
    
    // 添加屏幕方向变化监听
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
    
    // 方位角归零按钮
    const zeroBtn = document.getElementById('zeroAzimuthBtn');
    if (zeroBtn) {
        zeroBtn.addEventListener('click', () => {
            if (isZeroed) {
                resetZero();
            } else {
                zeroAzimuth();
            }
        });
    }
    
    // 指南针弹窗相关初始化
    compassModal = document.getElementById('compassModal');
    compassNeedle = document.getElementById('compassNeedle');
    compassDirection = document.getElementById('compassDirection');
    compassCardinal = document.getElementById('compassCardinal');
    
    // 打开指南针按钮
    const showCompassBtn = document.getElementById('showCompassBtn');
    if (showCompassBtn) {
        showCompassBtn.addEventListener('click', showCompass);
    }
    
    // 关闭指南针按钮
    const closeCompassBtn = document.getElementById('closeCompassBtn');
    if (closeCompassBtn) {
        closeCompassBtn.addEventListener('click', hideCompass);
    }
    
    // 指南针中归零按钮
    const zeroInCompassBtn = document.getElementById('zeroInCompassBtn');
    if (zeroInCompassBtn) {
        zeroInCompassBtn.addEventListener('click', () => {
            zeroAzimuth();
            hideCompass();
        });
    }
    
    // 点击遮罩层关闭指南针
    if (compassModal) {
        compassModal.addEventListener('click', (e) => {
            if (e.target === compassModal) {
                hideCompass();
            }
        });
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