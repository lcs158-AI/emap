   // ==================== 初始化 Cesium ====================
        Cesium.Ion.defaultAccessToken = ''; // 若您有Ion token可填，无则使用默认
        const viewer = new Cesium.Viewer('cesiumContainer', {
            baseLayerPicker: false,
            imageryProvider: false,   // 手动添加底图
            terrainProvider: Cesium.createWorldTerrain(),
            animation: false,
            timeline: false,
            infoBox: false,
            selectionIndicator: false,
            navigationHelpButton: false,
            homeButton: false,
            fullscreenButton: false
        });

        // 1. 天地图影像底图（球面墨卡托投影 w）
        const tiandituProvider = new Cesium.WebMapTileServiceImageryProvider({
            url: `https://t0.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=img&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles&tk=${TIANDITU_KEY}`,
            subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
            maximumLevel: 18,
            tilingScheme: new Cesium.GeographicTilingScheme() // 球面墨卡托
        });
        viewer.imageryLayers.addImageryProvider(tiandituProvider);

        // 天地图注记层（可选）
        const annotationProvider = new Cesium.WebMapTileServiceImageryProvider({
            url: `https://t0.tianditu.gov.cn/cva_w/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=cva&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles&tk=${TIANDITU_KEY}`,
            subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
            maximumLevel: 18
        });
        viewer.imageryLayers.addImageryProvider(annotationProvider);

        // 2. Esri 影像图层（备用）
        let esriLayer = null;
        let esriVisible = false;
        async function initEsriLayer() {
            if (esriLayer) return;
            const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
            );
            esriLayer = viewer.imageryLayers.addImageryProvider(provider);
            esriLayer.show = false;
        }
        initEsriLayer();

        document.getElementById('toggleEsriBtn').addEventListener('click', async () => {
            if (!esriLayer) await initEsriLayer();
            if (esriLayer) {
                esriVisible = !esriVisible;
                esriLayer.show = esriVisible;
                document.getElementById('toggleEsriBtn').textContent = esriVisible ? '🗺️ 关闭 Esri' : '🗺️ 切换 Esri';
            }
        });

        // ==================== 添加照片点实体 ====================
        const entities = [];
        photoPoints.features.forEach(feature => {
            const [lon, lat] = feature.geometry.coordinates;
            const props = feature.properties;
            const entity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat),
                point: {
                    pixelSize: 10,
                    color: Cesium.Color.RED,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2
                },
                label: {
                    text: props.DD,
                    font: '14px sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    backgroundColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.6)'),
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth: 1,
                    outlineColor: Cesium.Color.BLACK,
                    pixelOffset: new Cesium.Cartesian2(0, -20),
                    show: false,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM
                },
                properties: props
            });
            entities.push(entity);
        });

        // 悬浮提示：鼠标移动时高亮最近点并显示标签
        let lastHighlighted = null;
        viewer.screenSpaceEventHandler.setInputAction(function (movement) {
            const picked = viewer.scene.pick(movement.endPosition);
            if (Cesium.defined(picked) && picked.id && picked.id.label) {
                if (lastHighlighted !== picked.id) {
                    if (lastHighlighted) {
                        lastHighlighted.label.show = false;
                        lastHighlighted.point.pixelSize = 10;
                    }
                    picked.id.label.show = true;
                    picked.id.point.pixelSize = 12;
                    lastHighlighted = picked.id;
                }
            } else {
                if (lastHighlighted) {
                    lastHighlighted.label.show = false;
                    lastHighlighted.point.pixelSize = 10;
                    lastHighlighted = null;
                }
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // 点击弹出照片（使用浏览器的 alert 简化，实际可用自定义弹窗）
        viewer.screenSpaceEventHandler.setInputAction(function (click) {
            const picked = viewer.scene.pick(click.position);
            if (Cesium.defined(picked) && picked.id && picked.id.properties) {
                const props = picked.id.properties;
                const imgSrc = `/pics/${props.MC}`;
                alert(`${props.DD}\n图片路径: ${imgSrc}\n(请确保图片存在)`);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // ==================== 定位功能 ====================
        document.getElementById('locateBtn').addEventListener('click', () => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(pos => {
                    const { longitude, latitude } = pos.coords;
                    viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude),
                        orientation: {
                            heading: 0,
                            pitch: -Cesium.Math.toRadians(45),
                            roll: 0
                        },
                        duration: 2
                    });
                    // 添加一个临时的蓝色圆点（可选）
                    viewer.entities.add({
                        position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
                        point: { pixelSize: 14, color: Cesium.Color.BLUE, outlineWidth: 2 },
                        id: 'tempLoc',
                        lifecycle: 5  // 5秒后移除（简单定时）
                    });
                    setTimeout(() => {
                        viewer.entities.removeById('tempLoc');
                    }, 5000);
                }, err => alert('获取位置失败: ' + err.message));
            } else {
                alert('浏览器不支持地理定位');
            }
        });

        // ==================== 简易距离测量 ====================
        let measureActive = false;
        let points = [];
        const measureResultDiv = document.getElementById('measureResult');
        document.getElementById('measureBtn').addEventListener('click', () => {
            measureActive = !measureActive;
            if (measureActive) {
                points = [];
                measureResultDiv.style.display = 'block';
                measureResultDiv.textContent = '点击地图添加点，双击结束';
                document.getElementById('measureBtn').style.background = '#e6f7ff';
            } else {
                measureResultDiv.style.display = 'none';
                document.getElementById('measureBtn').style.background = 'white';
                // 移除临时实体
                if (window.tempPoints) window.tempPoints.forEach(e => viewer.entities.remove(e));
                window.tempPoints = [];
            }
        });

        viewer.screenSpaceEventHandler.setInputAction(function (click) {
            if (!measureActive) return;
            const cartesian = viewer.scene.pickPosition(click.position);
            if (!Cesium.defined(cartesian)) return;
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            points.push({ lon, lat, cartesian });
            // 添加临时点标记
            const entity = viewer.entities.add({
                position: cartesian,
                point: { pixelSize: 8, color: Cesium.Color.ORANGE },
                label: { text: `${points.length}`, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -10) }
            });
            if (!window.tempPoints) window.tempPoints = [];
            window.tempPoints.push(entity);
            if (points.length >= 2) {
                const dist = Cesium.Cartesian3.distance(points[0].cartesian, points[1].cartesian);
                measureResultDiv.textContent = `距离: ${dist.toFixed(1)} 米`;
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewer.screenSpaceEventHandler.setInputAction(function () {
            if (measureActive) {
                measureActive = false;
                measureResultDiv.style.display = 'none';
                document.getElementById('measureBtn').style.background = 'white';
                if (window.tempPoints) window.tempPoints.forEach(e => viewer.entities.remove(e));
                window.tempPoints = [];
                points = [];
            }
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        // ==================== 潮汐功能（复用原有逻辑，但适配Cesium） ====================
        // 获取地图中心点（Cesium视角中心）
        function getCenterLonLat() {
            const center = viewer.camera.positionWC;
            const cartographic = Cesium.Cartographic.fromCartesian(center);
            return {
                lon: Cesium.Math.toDegrees(cartographic.longitude),
                lat: Cesium.Math.toDegrees(cartographic.latitude)
            };
        }

        // 以下潮汐函数与原代码基本相同，仅将地图中心点获取改为Cesium方式
        let tideChartInstance = null;
        const tidePanel = document.getElementById('tidePanel');
        const closeTideBtn = document.getElementById('closeTideBtn');
        const tideBtn = document.getElementById('tideBtn');

        closeTideBtn.addEventListener('click', () => tidePanel.style.display = 'none');

        function getLocalDateStr(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}${m}${d}`;
        }

        async function fetchTideData(lon, lat) {
            try {
                tidePanel.style.display = 'block';
                document.getElementById('tideCurrent').innerHTML = '查询中...';
                document.getElementById('tideLocation').innerHTML = `正在获取潮汐数据`;

                // 地理搜索获取站点ID（此处复用您原来的方法，仅修改API Host）
                const geoUrl = `https://${APIhost}/geo/v2/poi/lookup?location=${lon},${lat}&type=TSTA&key=${QWEATHER_KEY}`;
                const geoRes = await fetch(geoUrl);
                const geoData = await geoRes.json();
                if (geoData.code !== '200' || !geoData.poi || geoData.poi.length === 0) {
                    throw new Error('未找到附近潮汐站点');
                }
                const poiId = geoData.poi[0].id;
                const poiName = geoData.poi[0].name || '附近海域';

                const now = new Date();
                const todayStr = getLocalDateStr(now);
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = getLocalDateStr(tomorrow);

                const currentHour = now.getHours();
                const isEarlyMorning = currentHour >= 0 && currentHour <= 6;
                let allHourly = [];

                if (isEarlyMorning) {
                    const tideUrl = `https://${APIhost}/v7/ocean/tide?location=${poiId}&date=${todayStr}&key=${QWEATHER_KEY}`;
                    const tideRes = await fetch(tideUrl);
                    const tideData = await tideRes.json();
                    if (tideData.code !== '200') throw new Error(`潮汐查询失败 (${tideData.code})`);
                    allHourly = tideData.tideHourly.filter(item => {
                        const hour = new Date(item.fxTime).getHours();
                        return hour >= 0 && hour <= 12;
                    });
                } else {
                    const datesToFetch = [{ date: todayStr, label: '今天' }];
                    if (currentHour >= 18) datesToFetch.push({ date: tomorrowStr, label: '明天' });
                    for (const { date } of datesToFetch) {
                        const tideUrl = `https://${APIhost}/v7/ocean/tide?location=${poiId}&date=${date}&key=${QWEATHER_KEY}`;
                        const tideRes = await fetch(tideUrl);
                        const tideData = await tideRes.json();
                        if (tideData.code === '200' && tideData.tideHourly) {
                            allHourly = allHourly.concat(tideData.tideHourly);
                        }
                    }
                }
                if (allHourly.length === 0) throw new Error('无潮汐数据');

                allHourly.sort((a, b) => new Date(a.fxTime) - new Date(b.fxTime));
                updateTidePanel(allHourly, poiName);
                renderTideChart(allHourly);
            } catch (err) {
                console.error(err);
                document.getElementById('tideCurrent').innerHTML = '查询失败';
                document.getElementById('tideLocation').innerHTML = `❌ ${err.message}`;
            }
        }

        function updateTidePanel(allHourly, locationName) {
            const now = new Date();
            let best = null, minDiff = Infinity;
            for (let item of allHourly) {
                const diff = Math.abs(new Date(item.fxTime) - now);
                if (diff < minDiff) { minDiff = diff; best = item; }
            }
            const height = best ? parseFloat(best.height).toFixed(1) : '--';
            const time = best ? new Date(best.fxTime).toLocaleTimeString('zh-CN', { hour: 'numeric', minute: 'numeric' }) : '';
            document.getElementById('tideLocation').innerHTML = `📍 ${locationName}`;
            document.getElementById('tideCurrent').innerHTML = `${height} 米`;
            document.getElementById('tideTime').innerHTML = `⏱️ ${time}`;
        }

        function renderTideChart(tideHourly) {
            const canvas = document.getElementById('tideChart');
            if (!canvas) return;
            const now = new Date();
            let currentIndex = -1, minDiff = Infinity;
            for (let i = 0; i < tideHourly.length; i++) {
                const diff = Math.abs(new Date(tideHourly[i].fxTime) - now);
                if (diff < minDiff) { minDiff = diff; currentIndex = i; }
            }
            if (currentIndex === -1) currentIndex = Math.floor(tideHourly.length / 2);
            const start = Math.max(0, currentIndex - 6);
            const end = Math.min(tideHourly.length, currentIndex + 7);
            const sliced = tideHourly.slice(start, end);
            const labels = sliced.map(item => new Date(item.fxTime).getHours() + ':00');
            const values = sliced.map(item => parseFloat(item.height));
            const highlightIndex = currentIndex - start;

            if (tideChartInstance) tideChartInstance.destroy();
            const ctx = canvas.getContext('2d');
            tideChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        borderColor: '#1890ff',
                        backgroundColor: 'rgba(24,144,255,0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: (ctx, p) => p.dataIndex === highlightIndex ? 6 : 3,
                        pointBackgroundColor: (ctx, p) => p.dataIndex === highlightIndex ? '#ff0000' : '#1890ff'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }

        tideBtn.addEventListener('click', async () => {
            const center = getCenterLonLat();
            await fetchTideData(center.lon, center.lat);
        });

        // 启动后加载一次潮汐数据（可选）
        // fetchTideData(111.18, 21.48);