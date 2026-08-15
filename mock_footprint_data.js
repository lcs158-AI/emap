/**
 * 视域生成 Mock 测试数据
 *
 * 使用方法（浏览器控制台）：
 *   loadMockFootprintData()    // 加载 mock 数据到地图
 *   clearMockFootprintData()   // 清除 mock 数据
 *
 * 然后点击工具栏 📐 → 🎯 视域生成，点击地图上的测试点即可。
 *
 * 测试场景：
 *   ① 天安门广场南侧 — 朝北俯拍（正常梯形视域）
 *   ② 天安门广场东侧 — 朝西俯拍（较陡角度，窄视域）
 *   ③ 天安门广场北侧 — 朝南平视（pitch=0°，全朝天→降级圆形）
 *   ④ 天安门广场西侧 — 缺少参数（无 yaw/pitch/h_fov 等→弹窗红色提示）
 *   ⑤ 故宫上方 — 无人机高空俯拍（pitch=-70°, h=200m, 大范围）
 */

// mock 图层引用
let mockFootprintLayer = null;

// 4+1 组测试数据（北京天安门广场附近）
const MOCK_POINTS = [
    {
        // ① 正常俯拍：朝北 30° 俯视，50m 高度
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [116.3975, 39.9087] },
        properties: {
            filename: 'mock_test1_north.jpg',
            datetime: '2024-06-15 10:30:00',
            upload_time: '2024-06-15',
            lat: 39.9087,
            lon: 116.3975,
            yaw: 0,           // 正北
            pitch: -30,        // 下俯 30°
            roll: 0,
            relative_height: 50,
            h_fov: 60,
            v_fov: 45,
            device_type: 'phone-footprint',
            uploader: 'mock_test'
        }
    },
    {
        // ② 较陡俯拍：朝西 50° 俯视，30m 高度
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [116.4050, 39.9087] },
        properties: {
            filename: 'mock_test2_west.jpg',
            datetime: '2024-06-15 11:00:00',
            upload_time: '2024-06-15',
            lat: 39.9087,
            lon: 116.4050,
            yaw: 270,          // 正西
            pitch: -50,        // 下俯 50°
            roll: 5,           // 带 5° 翻滚
            relative_height: 30,
            h_fov: 65,
            v_fov: 50,
            device_type: 'phone-footprint',
            uploader: 'mock_test'
        }
    },
    {
        // ③ 全朝天：朝南平视，pitch=0° → 降级为圆形
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [116.3975, 39.9150] },
        properties: {
            filename: 'mock_test3_level.jpg',
            datetime: '2024-06-15 12:00:00',
            upload_time: '2024-06-15',
            lat: 39.9150,
            lon: 116.3975,
            yaw: 180,          // 正南
            pitch: 0,          // 平视 → pitch - vfov/2 = 0-22.5 = -22.5 > -15 → 全朝天
            roll: 0,
            relative_height: 10,
            h_fov: 60,
            v_fov: 45,
            device_type: 'phone-footprint',
            uploader: 'mock_test'
        }
    },
    {
        // ④ 缺少参数：只有 GPS 坐标，无姿态参数
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [116.3900, 39.9087] },
        properties: {
            filename: 'mock_test4_noattitude.jpg',
            datetime: '2024-06-15 13:00:00',
            upload_time: '2024-06-15',
            lat: 39.9087,
            lon: 116.3900,
            device_type: '',
            uploader: 'mock_test'
            // 缺少: yaw, pitch, roll, relative_height, h_fov, v_fov
        }
    },
    {
        // ⑤ 无人机高空俯拍：朝东 70° 俯视，200m 高度
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [116.3975, 39.9050] },
        properties: {
            filename: 'mock_test5_drone.jpg',
            datetime: '2024-06-15 14:00:00',
            upload_time: '2024-06-15',
            lat: 39.9050,
            lon: 116.3975,
            yaw: 90,           // 正东
            pitch: -70,         // 下俯 70°
            roll: 0,
            relative_height: 200,
            h_fov: 75,
            v_fov: 55,
            device_type: 'drone-footprint',
            uploader: 'mock_test'
        }
    }
];

/**
 * 加载 Mock 数据到地图
 */
function loadMockFootprintData() {
    if (!window.map || !window.ol) {
        console.error('地图未初始化，请先打开地图页面');
        return;
    }

    // 清除旧的 mock 图层
    clearMockFootprintData();

    // 创建 GeoJSON 格式实例
    const geoJsonFormat = new ol.format.GeoJSON();

    // 将 FeatureCollection 从 EPSG:4326 转为 EPSG:3857
    const features = geoJsonFormat.readFeatures(
        { type: 'FeatureCollection', features: MOCK_POINTS },
        { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
    );

    // 为每个 feature 设置 layer 属性（模拟用户点图层）
    const layerInfo = {
        labelField: 'datetime',
        linkField: 'filename',
        linkPathPrefix: ''
    };
    features.forEach(f => f.set('layer', layerInfo));

    // 创建 mock 图层
    mockFootprintLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: features }),
        style: function (feature) {
            const props = feature.getProperties();
            // 根据参数完整性用不同颜色
            const hasFullParams = props.yaw != null && props.pitch != null && props.relative_height != null;
            const color = hasFullParams ? '#52c41a' : '#faad14';  // 绿=完整 黄=缺失
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 10,
                    fill: new ol.style.Fill({ color: color }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
                }),
                text: new ol.style.Text({
                    text: props.filename ? props.filename.substring(10, 15) : '?',
                    offsetY: -22,
                    font: 'bold 12px Arial',
                    fill: new ol.style.Fill({ color: '#333' }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
                })
            });
        }
    });

    mockFootprintLayer.set('name', 'Mock 测试点图层');
    window.map.addLayer(mockFootprintLayer);

    // 飞到测试区域
    const view = window.map.getView();
    view.animate({
        center: ol.proj.fromLonLat([116.3975, 39.9100]),
        zoom: 15,
        duration: 1000
    });

    console.log('[Mock] 已加载 ' + MOCK_POINTS.length + ' 个测试点:');
    console.log('  ① 绿点(南) - 朝北俯拍 yaw=0 pitch=-30 h=50m → 期望: 正常梯形视域');
    console.log('  ② 绿点(东) - 朝西俯拍 yaw=270 pitch=-50 h=30m → 期望: 窄梯形(带roll)');
    console.log('  ③ 绿点(北) - 朝南平视 yaw=180 pitch=0 h=10m → 期望: 降级圆形(全朝天)');
    console.log('  ④ 黄点(西) - 缺少参数 → 期望: 弹窗红色提示缺失');
    console.log('  ⑤ 绿点(南偏) - 无人机 yaw=90 pitch=-70 h=200m → 期望: 大范围梯形');
    console.log('请点击工具栏 📐 → 🎯 视域生成，然后点击地图上的测试点');
}

/**
 * 清除 Mock 数据
 */
function clearMockFootprintData() {
    if (mockFootprintLayer) {
        window.map.removeLayer(mockFootprintLayer);
        mockFootprintLayer = null;
        console.log('[Mock] 已清除测试数据');
    }
}
