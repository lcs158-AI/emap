// =====================================================
// 本地图层编辑模块 (OpenLayers v7.5.2)
// 版本: v20261023d
// 支持: 属性编辑、图斑删除、图斑新增、图斑移动、线/面整形
// 共用模块: feature_form.js (Schema 设计器 + 属性面板)
// =====================================================

(function () {
    'use strict';

    // 从 window 获取跨文件共享的对象
    const map = window.map;
    const localGeoJsonLayers = window.localGeoJsonLayers;
    const createLayerControl = window.createLayerControl;
    const FeatureForm = window.FeatureForm;

    // 编辑状态
    const editorState = {
        active: false,               // 是否有图层正在编辑
        editingLayer: null,          // 当前正在编辑的图层对象 (localGeoJsonLayers 中的 item)
        source: null,                // 该图层的 vector source
        selectInteraction: null,     // Select 交互
        modifyInteraction: null,     // Modify 交互
        drawInteraction: null,       // Draw 交互
        snapInteraction: null,       // Snap 交互
        selectedFeatures: [],        // 当前选中的要素
        tool: 'select',              // 当前工具: select | modify | delete | drawPoint | drawLine | drawPolygon
        originalFileInfo: null,      // 原始文件信息 {fileName, format}
        schema: null                 // 当前图层的字段结构 {fields: [...]}
    };

    // 将 ol.interaction.Modify 和 ol.interaction.Select 暴露到全局以便外部访问
    window.layerEditor = {
        isEditing: () => editorState.active,
        getEditingLayer: () => editorState.editingLayer,
        stopEdit: stopEditLayer,
        saveCurrent: saveCurrentLayer
    };

    // =====================================================
    // 1. 为每个本地图层追加 fileInfo 和 editable 字段
    // =====================================================
    function registerLayerWithEditor(layerItem, fileInfo) {
        if (!localGeoJsonLayers.includes(layerItem)) {
            localGeoJsonLayers.push(layerItem);
        }
        layerItem.fileInfo = fileInfo || null;
        layerItem.editable = false;
    }

    // 暴露给外部调用 (loadLocalGeoJSON/KML/KMZ 后调用)
    window.registerLayerWithEditor = registerLayerWithEditor;

    // =====================================================
    // 2. 图层管理面板 - 添加「可编辑」勾选框
    //    在 createLayerControl 的 layerHeader 中调用
    // =====================================================
    function addEditableCheckbox(containerDiv, layerItem, index) {
        // 如果已经加过，跳过
        if (containerDiv.querySelector('[data-editable-checkbox]')) return;

        const editWrap = document.createElement('div');
        editWrap.style.display = 'flex';
        editWrap.style.alignItems = 'center';
        editWrap.style.marginLeft = '8px';
        editWrap.title = '设为可编辑（同一时间只能编辑一个图层）';

        const editCheck = document.createElement('input');
        editCheck.type = 'checkbox';
        editCheck.dataset.editableCheckbox = '1';
        editCheck.checked = !!layerItem.editable;
        editCheck.style.cursor = 'pointer';

        const editLabel = document.createElement('span');
        editLabel.textContent = '编辑';
        editLabel.style.fontSize = '11px';
        editLabel.style.color = '#1890ff';
        editLabel.style.marginLeft = '2px';

        editCheck.addEventListener('change', (e) => {
            if (e.target.checked) {
                // 先取消其他图层的编辑状态
                localGeoJsonLayers.forEach((l, i) => {
                    if (l !== layerItem && l.editable) {
                        l.editable = false;
                    }
                });
                layerItem.editable = true;
                startEditLayer(layerItem);
            } else {
                layerItem.editable = false;
                stopEditLayer();
            }
            createLayerControl(); // 重建面板，更新所有勾选
        });

        editWrap.appendChild(editCheck);
        editWrap.appendChild(editLabel);
        containerDiv.appendChild(editWrap);
    }

    // 暴露
    window.addEditableCheckbox = addEditableCheckbox;

    // =====================================================
    // 3. 开始编辑某图层
    // =====================================================
    function startEditLayer(layerItem) {
        if (!map) return;

        // 停止之前的编辑
        stopEditLayer();

        const vectorLayer = layerItem.layer;
        let source = vectorLayer.getSource();

        // 如果 source 不存在，尝试创建
        if (!source) {
            source = new ol.source.Vector();
            vectorLayer.setSource(source);
        }

        editorState.active = true;
        editorState.editingLayer = layerItem;
        editorState.source = source;
        editorState.originalFileInfo = layerItem.fileInfo;
        editorState.schema = layerItem.schema || null; // 恢复该图层的字段结构

        // ====== Select 交互 ======
        editorState.selectInteraction = new ol.interaction.Select({
            layers: [vectorLayer],
            toggleCondition: ol.events.condition.shiftKeyOnly,
            style: selectedFeatureStyle
        });
        map.addInteraction(editorState.selectInteraction);

        editorState.selectInteraction.on('select', (evt) => {
            editorState.selectedFeatures = evt.selected;
            showPropertyPanel(); // 调用共享模块
        });

        // ====== Modify 交互 ======
        editorState.modifyInteraction = new ol.interaction.Modify({
            source: source,
            style: vertexStyle,
            // 仅对选中的要素生效（通过 filter 限制）
            // OpenLayers v7: features 参数接受 Collection
            features: editorState.selectInteraction.getFeatures()
        });
        map.addInteraction(editorState.modifyInteraction);

        // ====== Snap 交互 (辅助吸附) ======
        editorState.snapInteraction = new ol.interaction.Snap({
            source: source
        });
        map.addInteraction(editorState.snapInteraction);

        // 创建编辑工具栏
        createEditorToolbar();

        console.log('🖊️ 开始编辑图层:', layerItem.name);
    }

    // =====================================================
    // 4. 停止编辑
    // =====================================================
    function stopEditLayer() {
        if (!map) return;

        // 移除交互
        ['selectInteraction', 'modifyInteraction', 'drawInteraction', 'snapInteraction'].forEach(key => {
            if (editorState[key]) {
                map.removeInteraction(editorState[key]);
                editorState[key] = null;
            }
        });

        // 清除选中
        if (editorState.selectInteraction) {
            editorState.selectInteraction.getFeatures().clear();
        }

        editorState.active = false;
        // 保存 schema 到图层对象
        if (editorState.editingLayer) {
            editorState.editingLayer.schema = editorState.schema;
        }
        editorState.editingLayer = null;
        editorState.source = null;
        editorState.selectedFeatures = [];
        editorState.tool = 'select';
        editorState.schema = null;

        // 移除工具栏
        const toolbar = document.getElementById('layerEditorToolbar');
        if (toolbar) toolbar.remove();

        // 移除属性面板（使用共享模块）
        if (FeatureForm && typeof FeatureForm.closePropertyPanel === 'function') {
            FeatureForm.closePropertyPanel();
        } else {
            const propPanel = document.getElementById('featureFormPanel');
            if (propPanel) propPanel.remove();
        }

        // 取消所有图层的 editable 勾选
        localGeoJsonLayers.forEach(l => { l.editable = false; });

        // 重建图层控制面板
        if (typeof createLayerControl === 'function') {
            createLayerControl();
        }

        console.log('✋ 停止编辑');
    }

    // =====================================================
    // 5. 编辑工具栏
    // =====================================================
    function createEditorToolbar() {
        // 已有则移除
        const old = document.getElementById('layerEditorToolbar');
        if (old) old.remove();

        const tb = document.createElement('div');
        tb.id = 'layerEditorToolbar';
        tb.style.cssText = 'position:absolute;top:60px;right:20px;z-index:1000;background:white;border-radius:8px;padding:10px;box-shadow:0 2px 12px rgba(0,0,0,0.2);display:flex;flex-direction:column;gap:6px;min-width:110px;';

        const title = document.createElement('div');
        title.textContent = '🖊️ 编辑工具';
        title.style.cssText = 'font-weight:bold;font-size:13px;margin-bottom:4px;color:#1890ff;border-bottom:1px solid #eee;padding-bottom:4px;';
        tb.appendChild(title);

        const tools = [
            { key: 'select',     icon: '👆', label: '选择/移动' },
            { key: 'schema',     icon: '🏷️', label: '字段结构' },
            { key: 'drawPoint',  icon: '📍', label: '新建点' },
            { key: 'drawLine',   icon: '✏️', label: '新建线' },
            { key: 'drawPolygon',icon: '🔲', label: '新建面' },
            { key: 'delete',     icon: '🗑️', label: '删除选中' },
        ];

        tools.forEach(t => {
            const btn = document.createElement('button');
            btn.dataset.tool = t.key;
            btn.innerHTML = `${t.icon} ${t.label}`;
            btn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;background:white;border-radius:4px;cursor:pointer;font-size:12px;text-align:left;transition:all 0.15s;';
            btn.onmouseenter = () => { btn.style.background = '#e6f7ff'; btn.style.borderColor = '#1890ff'; };
            btn.onmouseleave = () => { btn.style.background = 'white'; btn.style.borderColor = '#ddd'; };
            btn.onclick = () => switchTool(t.key, btn);
            tb.appendChild(btn);
        });

        // 分隔线
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#eee;margin:4px 0;';
        tb.appendChild(sep);

        // 保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '💾 保存';
        saveBtn.style.cssText = 'padding:8px 10px;border:none;background:#52c41a;color:white;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
        saveBtn.onclick = () => saveCurrentLayer();
        tb.appendChild(saveBtn);

        // 取消编辑按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '✕ 取消编辑';
        cancelBtn.style.cssText = 'padding:6px 10px;border:1px solid #ff7875;background:white;color:#ff4d4f;border-radius:4px;cursor:pointer;font-size:12px;';
        cancelBtn.onclick = () => { stopEditLayer(); };
        tb.appendChild(cancelBtn);

        document.body.appendChild(tb);

        // 默认选中选择工具
        updateToolButtons();
    }

    function updateToolButtons() {
        const tb = document.getElementById('layerEditorToolbar');
        if (!tb) return;
        tb.querySelectorAll('button[data-tool]').forEach(btn => {
            if (btn.dataset.tool === editorState.tool) {
                btn.style.background = '#1890ff';
                btn.style.color = 'white';
                btn.style.borderColor = '#1890ff';
            } else {
                btn.style.background = 'white';
                btn.style.color = '#333';
                btn.style.borderColor = '#ddd';
            }
        });
    }

    // =====================================================
    // 6. 切换工具
    // =====================================================
    function switchTool(toolKey, btn) {
        editorState.tool = toolKey;

        // 先移除之前的 Draw 交互
        if (editorState.drawInteraction) {
            map.removeInteraction(editorState.drawInteraction);
            editorState.drawInteraction = null;
        }

        // 根据工具调整 Modify 可用性
        if (editorState.modifyInteraction) {
            if (toolKey === 'select' || toolKey === 'modify') {
                editorState.modifyInteraction.setActive(true);
            } else {
                editorState.modifyInteraction.setActive(false);
            }
        }

        if (toolKey === 'select') {
            // 什么都不用加，Select 已存在
        } else if (toolKey === 'schema') {
            // 打开 Schema 设计器（共享模块）
            if (!FeatureForm || typeof FeatureForm.showSchemaDesigner !== 'function') {
                alert('字段结构设计器未加载');
                editorState.tool = 'select';
                updateToolButtons();
                return;
            }
            FeatureForm.showSchemaDesigner({
                title: `定义「${editorState.editingLayer.name}」字段结构`,
                initialSchema: editorState.schema,
                onConfirm: (schema) => {
                    editorState.schema = schema;
                    console.log('📐 字段结构已更新:', schema.fields.length, '个字段');
                }
            });
            editorState.tool = 'select'; // schema 不是持久工具
            updateToolButtons();
            return; // schema 不参与后续逻辑
        } else if (toolKey === 'delete') {
            deleteSelectedFeatures();
        } else if (toolKey === 'drawPoint') {
            addDrawInteraction('Point');
        } else if (toolKey === 'drawLine') {
            addDrawInteraction('LineString');
        } else if (toolKey === 'drawPolygon') {
            addDrawInteraction('Polygon');
        }

        updateToolButtons();
    }

    function addDrawInteraction(geomType) {
        if (!editorState.source) return;

        editorState.drawInteraction = new ol.interaction.Draw({
            source: editorState.source,
            type: geomType,
            stopClick: true,
            style: new ol.style.Style({
                fill: new ol.style.Fill({ color: 'rgba(24,144,255,0.3)' }),
                stroke: new ol.style.Stroke({ color: '#1890ff', width: 2 }),
                image: new ol.style.Circle({
                    radius: 5,
                    fill: new ol.style.Fill({ color: '#1890ff' })
                })
            })
        });

        editorState.drawInteraction.on('drawend', (evt) => {
            const feature = evt.feature;
            feature.setId('new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));

            // 按 schema 默认值填充，没有则给默认
            if (editorState.schema && editorState.schema.fields && editorState.schema.fields.length > 0) {
                editorState.schema.fields.forEach(f => {
                    if (feature.get(f.name) === undefined) {
                        feature.set(f.name, f.default ?? '');
                    }
                });
            } else {
                feature.setProperties({
                    '名称': '新要素',
                    '编辑时间': new Date().toISOString()
                }, true);
            }

            editorState.source.addFeature(feature);
            console.log('✅ 新增要素:', geomType, feature.getId());

            // 绘制完成：自动选中该要素并打开属性面板
            editorState.selectInteraction.getFeatures().clear();
            editorState.selectInteraction.getFeatures().push(feature);
            editorState.selectedFeatures = [feature];
            showPropertyPanel();

            editorState.drawInteraction = null;
            editorState.tool = 'select';
            if (editorState.modifyInteraction) editorState.modifyInteraction.setActive(true);
            updateToolButtons();
        });

        map.addInteraction(editorState.drawInteraction);

        // 添加对应的 Snap 辅助
        if (editorState.snapInteraction) {
            map.removeInteraction(editorState.snapInteraction);
        }
        editorState.snapInteraction = new ol.interaction.Snap({ source: editorState.source });
        map.addInteraction(editorState.snapInteraction);
    }

    function deleteSelectedFeatures() {
        const select = editorState.selectInteraction;
        if (!select) return;
        const features = select.getFeatures().getArray();
        if (features.length === 0) {
            alert('请先选择要删除的要素（点击要素，按住 Shift 可多选）');
            return;
        }
        if (!confirm(`确定删除选中的 ${features.length} 个要素吗？`)) return;

        features.forEach(f => {
            editorState.source.removeFeature(f);
        });
        select.getFeatures().clear();
        showPropertyPanel();
        console.log('🗑️ 已删除', features.length, '个要素');

        // 删除完成后切回 select
        editorState.tool = 'select';
        updateToolButtons();
    }

    // =====================================================
    // 7. 选中样式 & 顶点样式
    // =====================================================
    function selectedFeatureStyle(feature) {
        const geomType = feature.getGeometry().getType();
        const styles = [];
        if (geomType === 'Point') {
            styles.push(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 8,
                    fill: new ol.style.Fill({ color: 'rgba(255,77,79,0.8)' }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
                }),
                zIndex: 10
            }));
        } else if (geomType.includes('LineString')) {
            styles.push(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: '#ff4d4f', width: 4 }),
                zIndex: 10
            }));
        } else if (geomType.includes('Polygon')) {
            styles.push(new ol.style.Style({
                fill: new ol.style.Fill({ color: 'rgba(255,77,79,0.2)' }),
                stroke: new ol.style.Stroke({ color: '#ff4d4f', width: 3 }),
                zIndex: 10
            }));
        }
        return styles;
    }

    const vertexStyle = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 5,
            fill: new ol.style.Fill({ color: '#faad14' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
        }),
        geometry: function (feature) {
            // 返回顶点集合
            const geom = feature.getGeometry();
            if (!geom) return null;
            const coords = [];
            geom.applyTransform(ol.proj.get('EPSG:3857').getInverse ? ol.proj.get('EPSG:3857').getInverse() : (c) => c, ol.proj.projection);
            // 简化版本：返回每个坐标点
            // 修改器使用 feature.getGeometry() 内部的坐标
            return geom;
        }
    });

    // =====================================================
    // 8. 属性编辑面板 (薄封装，调用共享模块 FeatureForm)
    // =====================================================
    function showPropertyPanel() {
        if (!FeatureForm || typeof FeatureForm.showPropertyPanel !== 'function') {
            console.warn('FeatureForm 未加载，无法显示属性面板');
            return;
        }
        const features = editorState.selectedFeatures;
        if (!features || features.length === 0) {
            FeatureForm.closePropertyPanel();
            return;
        }
        FeatureForm.showPropertyPanel({
            features: features,
            source: editorState.source,
            schema: editorState.schema,
            position: { top: '60px', left: '20px' }
        });
    }

    // =====================================================
    // 9. 保存导出
    // =====================================================
    function saveCurrentLayer() {
        if (!editorState.editingLayer || !editorState.source) {
            alert('没有正在编辑的图层');
            return;
        }

        const layerItem = editorState.editingLayer;
        const source = editorState.source;
        const originalFormat = (layerItem.fileInfo && layerItem.fileInfo.format) || 'geojson';

        // 收集要素
        const features = source.getFeatures();
        if (features.length === 0) {
            if (!confirm('当前图层没有要素，是否仍然保存空文件？')) return;
        }

        // 转换坐标系 3857 -> 4326
        const writer = new ol.format.GeoJSON();
        const geoJson = writer.writeFeatures(features, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
        });

        // 生成时间戳
        const ts = formatTimestamp(new Date());
        const baseName = (layerItem.fileInfo && layerItem.fileInfo.fileName)
            ? stripExt(layerItem.fileInfo.fileName)
            : layerItem.name;

        let outputContent, outputName, mimeType;

        if (originalFormat === 'kml' || originalFormat === 'kmz') {
            // 转 KML
            const kmlWriter = new ol.format.KML();
            const kmlText = kmlWriter.writeFeatures(features, {
                featureProjection: 'EPSG:3857',
                dataProjection: 'EPSG:4326'
            });
            outputContent = kmlText;
            outputName = `${baseName}_${ts}.kml`;
            mimeType = 'application/vnd.google-earth.kml+xml';
        } else {
            // GeoJSON
            outputContent = JSON.stringify(JSON.parse(geoJson), null, 2);
            outputName = `${baseName}_${ts}.geojson`;
            mimeType = 'application/json';
        }

        downloadFile(outputContent, outputName, mimeType);

        // 更新 fileInfo
        layerItem.fileInfo = {
            fileName: outputName,
            format: originalFormat === 'kml' || originalFormat === 'kmz' ? 'kml' : 'geojson',
            lastSaved: new Date().toISOString()
        };

        alert(`✅ 已保存为: ${outputName}\n\n（文件下载到浏览器默认下载目录，原文件未被覆盖）`);
        console.log('💾 图层已保存:', outputName, '要素数:', features.length);
    }

    function downloadFile(content, filename, mimeType) {
        let blob;
        if (typeof content === 'string') {
            blob = new Blob([content], { type: mimeType });
        } else {
            blob = new Blob([content], { type: mimeType });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function formatTimestamp(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    function stripExt(name) {
        return name.replace(/\.(geojson|json|kml|kmz|gml)$/i, '');
    }

    // =====================================================
    // 10. (已废弃：在 map.js 中直接修改了 loadLocalGeoJSON/KML/KMZ)
    // =====================================================
    function patchLoaders() {
        // 函数签名已在 map.js 中更新，这里不再需要 patch
        console.log('📌 loaders patch skipped (already in map.js)');
    }

    // =====================================================
    // 11. 为图层管理面板的每一项添加「编辑」复选框
    //     在 createLayerControl 渲染完后追加
    // =====================================================
    function patchCreateLayerControl() {
        const origCreate = window.createLayerControl;
        if (typeof origCreate !== 'function') {
            console.warn('⚠️ createLayerControl 未暴露到 window，编辑功能的 UI 追加可能不生效');
            return;
        }

        window.createLayerControl = function () {
            origCreate.call(this);
            // 给每个本地图层项追加编辑勾选
            setTimeout(() => {
                const panel = document.getElementById('layerControl');
                if (!panel) return;

                // panel 内的每个本地图层项
                const items = panel.querySelectorAll('div[style*="border: 1px solid #eee"]');
                items.forEach(container => {
                    // 找到这一项的可见性 checkbox (data-layer-name)
                    const visCheck = container.querySelector('input[data-layer-name]');
                    if (!visCheck) return;

                    const layerName = visCheck.getAttribute('data-layer-name');
                    const item = localGeoJsonLayers.find(l => l.name === layerName);
                    if (item) {
                        addEditableCheckbox(container, item, localGeoJsonLayers.indexOf(item));
                    }
                });
            }, 20);
        };
    }

    // =====================================================
    // 12. 初始化：打补丁 + 监听
    // =====================================================
    function initLayerEditor() {
        patchLoaders();
        patchCreateLayerControl();
        console.log('✅ layer_editor.js 已初始化');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayerEditor);
    } else {
        initLayerEditor();
    }

})();
