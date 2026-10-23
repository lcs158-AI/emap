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

        // 优先插到 layerHeader > leftSection 里（同一行显示）
        const leftSection = containerDiv.querySelector(':scope > div:first-child > div:first-child')
            || containerDiv.querySelector('div[style*="justifyContent"] > div:first-child');
        const mountPoint = leftSection || containerDiv;

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
                startEditLayer(layerItem); // startEditLayer 内部会统一设置 editable
            } else {
                // 只清这个图层
                layerItem.editable = false;
                stopEditLayer();
            }
            createLayerControl(); // 重建面板，更新所有勾选
        });

        editWrap.appendChild(editCheck);
        editWrap.appendChild(editLabel);
        mountPoint.appendChild(editWrap);
    }

    // 暴露
    window.addEditableCheckbox = addEditableCheckbox;

    // =====================================================
    // =====================================================
    // 2.5 自动推断字段 schema（从已有 features 提取公共属性）
    // =====================================================
    function inferSchemaFromSource(source) {
        const features = source.getFeatures();
        const fieldMap = {}; // name -> {count, sampleValues}
        let geomSeen = false;

        features.forEach(f => {
            const props = f.getProperties();
            Object.keys(props).forEach(k => {
                if (k === 'geometry' || k === 'layer') return;
                if (!fieldMap[k]) fieldMap[k] = { count: 0, samples: [] };
                fieldMap[k].count++;
                if (fieldMap[k].samples.length < 3) fieldMap[k].samples.push(props[k]);
            });
        });

        const fields = Object.keys(fieldMap).map(name => {
            const samples = fieldMap[name].samples;
            let type = 'text';
            if (samples.every(v => typeof v === 'number')) type = 'number';
            else if (samples.every(v => v === 'true' || v === 'false' || typeof v === 'boolean')) type = 'boolean';
            else if (samples.some(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) type = 'datetime';
            return {
                name: name,
                type: type,
                default: '',
                options: null
            };
        });

        // 默认把 name/名称 放最前（如果存在）
        const priority = ['name', '名称', 'NAME', 'Name', 'label', '标签'];
        fields.sort((a, b) => {
            const pa = priority.indexOf(a.name);
            const pb = priority.indexOf(b.name);
            if (pa === -1 && pb === -1) return 0;
            if (pa === -1) return 1;
            if (pb === -1) return -1;
            return pa - pb;
        });

        if (fields.length === 0) {
            // 兜底：给最基础的字段
            fields.push({ name: 'name', type: 'text', default: '', options: null });
            fields.push({ name: '编辑时间', type: 'datetime', default: '', options: null });
        }

        return { fields };
    }

    // 3. 开始编辑某图层
    // =====================================================
    function startEditLayer(layerItem) {
        if (!map) return;

        // 停止之前的编辑（保留当前目标图层的 editable 状态）
        stopEditLayer(layerItem);

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

        // === schema: 优先用已保存的，没有就自动推断 ===
        if (layerItem.schema && layerItem.schema.fields && layerItem.schema.fields.length > 0) {
            editorState.schema = layerItem.schema;
        } else {
            const inferred = inferSchemaFromSource(source);
            editorState.schema = inferred;
            layerItem.schema = inferred; // 持久化到图层对象
            console.log('📐 自动推断字段结构:', inferred.fields.length, '个字段 →', inferred.fields.map(f => f.name).join(', '));
        }

        // 确保勾选状态一致
        localGeoJsonLayers.forEach(l => { l.editable = (l === layerItem); });

        // ====== Select 交互 (默认关闭 — 让地图可平移，点👆才激活) ======
        editorState.selectInteraction = new ol.interaction.Select({
            layers: [vectorLayer],
            toggleCondition: ol.events.condition.shiftKeyOnly,
            style: selectedFeatureStyle
        });
        editorState.selectInteraction.setActive(false);
        map.addInteraction(editorState.selectInteraction);

        editorState.selectInteraction.on('select', (evt) => {
            editorState.selectedFeatures = evt.selected;
            showPropertyPanel(); // 调用共享模块
        });

        // ====== Modify 交互 (整形，默认关闭) ======
        editorState.modifyInteraction = new ol.interaction.Modify({
            source: source,
            style: vertexStyle,
            features: editorState.selectInteraction.getFeatures()
        });
        editorState.modifyInteraction.setActive(false);
        map.addInteraction(editorState.modifyInteraction);

        // ====== Translate 交互 (整体移动，默认关闭) ======
        editorState.translateInteraction = new ol.interaction.Translate({
            features: editorState.selectInteraction.getFeatures()
        });
        editorState.translateInteraction.setActive(false);
        map.addInteraction(editorState.translateInteraction);

        // ====== Snap 交互 (按需挂载) ======
        editorState.snapInteraction = new ol.interaction.Snap({
            source: source
        });
        // 不立即 add — 切换 Draw/Modify 时按需挂载

        // 创建编辑工具栏
        createEditorToolbar();

        console.log('🖊️ 开始编辑图层:', layerItem.name, '(所有交互默认关闭)');
    }

    // =====================================================
    // 4. 停止编辑
    //    keepEditable: 传入图层对象则保留其 editable 状态，否则清全部
    // =====================================================
    function stopEditLayer(keepEditable) {
        if (!map) return;

        // 移除交互
        ['selectInteraction', 'modifyInteraction', 'translateInteraction', 'drawInteraction', 'snapInteraction'].forEach(key => {
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
            { key: 'select',     icon: '👆', label: '选择',       hint: '点击图斑选中' },
            { key: 'translate',  icon: '✋', label: '移动',       hint: '拖动选中的图斑整体移动' },
            { key: 'modify',     icon: '✏️', label: '整形',       hint: '拖动顶点改形状' },
            { key: 'schema',     icon: '🏷️', label: '字段结构',   hint: '定义属性字段' },
            { key: 'drawPoint',  icon: '📍', label: '新建点' },
            { key: 'drawLine',   icon: '✏️', label: '新建线' },
            { key: 'drawPolygon',icon: '🔲', label: '新建面' },
            { key: 'delete',     icon: '🗑️', label: '删除选中' },
        ];

        tools.forEach(t => {
            const btn = document.createElement('button');
            btn.dataset.tool = t.key;
            btn.innerHTML = `${t.icon} ${t.label}`;
            if (t.hint) btn.title = t.hint;
            btn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;background:white;border-radius:4px;cursor:pointer;font-size:12px;text-align:left;transition:all 0.15s;';
            btn.onmouseenter = () => { btn.style.background = '#e6f7ff'; btn.style.borderColor = '#1890ff'; };
            btn.onmouseleave = () => { btn.style.background = 'white'; btn.style.borderColor = '#ddd'; };
            btn.onclick = () => switchTool(t.key);
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
    // 6. 切换工具 —— 每种工具独立激活自己的交互
    // =====================================================
    function switchTool(toolKey) {
        editorState.tool = toolKey;

        // === 0. 先关所有交互 ===
        if (editorState.selectInteraction)  editorState.selectInteraction.setActive(false);
        if (editorState.modifyInteraction)  editorState.modifyInteraction.setActive(false);
        if (editorState.translateInteraction)editorState.translateInteraction.setActive(false);
        if (editorState.snapInteraction) { map.removeInteraction(editorState.snapInteraction); }

        // 移除 Draw（如果正在画）
        if (editorState.drawInteraction) {
            map.removeInteraction(editorState.drawInteraction);
            editorState.drawInteraction = null;
        }

        // === 1. 按工具激活对应交互 ===
        if (toolKey === 'select') {
            // 👆 选择：只激活 Select，点中后自动弹属性面板
            editorState.selectInteraction.setActive(true);

        } else if (toolKey === 'translate') {
            // ✋ 移动：Select + Translate 同时开 — 先选中再拖
            editorState.selectInteraction.setActive(true);
            editorState.translateInteraction.setActive(true);

        } else if (toolKey === 'modify') {
            // ✏️ 整形：Select + Modify 同时开
            editorState.selectInteraction.setActive(true);
            editorState.modifyInteraction.setActive(true);
            map.addInteraction(editorState.snapInteraction);

        } else if (toolKey === 'schema') {
            // 打开 Schema 设计器（共享模块）— 不持久激活
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
                    // 保存到图层 item 上（下次编辑恢复）
                    if (editorState.editingLayer) editorState.editingLayer.schema = schema;
                }
            });
            // 设计器弹完后回到"空闲"态（地图可平移）
            editorState.tool = null;
            updateToolButtons();
            return;

        } else if (toolKey === 'delete') {
            deleteSelectedFeatures();

        } else if (toolKey === 'drawPoint' || toolKey === 'drawLine' || toolKey === 'drawPolygon') {
            const typeMap = { drawPoint: 'Point', drawLine: 'LineString', drawPolygon: 'Polygon' };
            addDrawInteraction(typeMap[toolKey]);
            map.addInteraction(editorState.snapInteraction); // Draw 时开吸附
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

            // 没有 schema 则临时推断一次（防御性兜底）
            let schema = editorState.schema;
            if (!schema || !schema.fields || schema.fields.length === 0) {
                schema = inferSchemaFromSource(editorState.source);
                editorState.schema = schema;
                if (editorState.editingLayer) editorState.editingLayer.schema = schema;
            }
            // 按 schema 默认值填充所有字段
            schema.fields.forEach(f => {
                if (feature.get(f.name) === undefined) {
                    feature.set(f.name, f.default ?? '');
                }
            });

            editorState.source.addFeature(feature);
            console.log('✅ 新增要素:', geomType, feature.getId());

            // 绘制完成：自动选中该要素并打开属性面板
            editorState.selectInteraction.getFeatures().clear();
            editorState.selectInteraction.getFeatures().push(feature);
            editorState.selectedFeatures = [feature];
            showPropertyPanel();

            // Draw 完成 → 所有交互关闭（空闲态），地图可平移
            map.removeInteraction(editorState.snapInteraction);
            editorState.drawInteraction = null;
            editorState.tool = null;
            updateToolButtons();
        });

        map.addInteraction(editorState.drawInteraction);
        // Snap 由 switchTool 统一管理，addDrawInteraction 不再自己处理
    }

    function deleteSelectedFeatures() {
        const select = editorState.selectInteraction;
        const source = editorState.source;
        if (!select || !source) return;
        const features = select.getFeatures().getArray();
        if (features.length === 0) {
            alert('请先选择要删除的要素（点击要素，按住 Shift 可多选）');
            return;
        }
        if (!confirm(`确定删除选中的 ${features.length} 个要素吗？\n\n此操作会同时从图层中移除。`)) return;

        // 同时从 source 和 Select 中移除（防止选中状态残留）
        features.forEach(f => {
            if (source.hasFeature(f)) {
                source.removeFeature(f);
            }
        });
        select.getFeatures().clear();
        editorState.selectedFeatures = [];
        showPropertyPanel(); // 面板会检测 features.length===0 自动关闭
        console.log('🗑️ 已删除', features.length, '个要素');

        // 删除完回到空闲态（地图可平移）
        editorState.tool = null;
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
        const now = new Date();
        const ts = formatTimestamp(now);
        const baseName = (layerItem.fileInfo && layerItem.fileInfo.fileName)
            ? stripExt(layerItem.fileInfo.fileName)
            : layerItem.name;

        // 智能文件名：优先替换原文件名中已有的时间戳，否则追加
        const [datePart, timePart] = ts.split('_');
        let newBase = baseName;
        let replaced = false;

        // 替换日期部分: _YYYYMMDD 或 _20261023 格式
        const dateRegex = /_(\d{8})(?=$|_\d{6}($|$))/;
        if (dateRegex.test(newBase)) {
            newBase = newBase.replace(dateRegex, `_${datePart}`);
            replaced = true;
        }
        // 替换时间部分: _HHMMSS (6位连续数字，通常在日期之后)
        const timeRegex = /(?<=_\d{8})_(\d{6})(?=$)/;
        if (timeRegex.test(newBase)) {
            newBase = newBase.replace(timeRegex, `_${timePart}`);
            replaced = true;
        }
        // 如果原文件名根本没时间戳，追加
        if (!replaced) {
            newBase = `${baseName}_${ts}`;
        }

        let outputContent, outputName, mimeType;

        if (originalFormat === 'kml' || originalFormat === 'kmz') {
            // 转 KML
            const kmlWriter = new ol.format.KML();
            const kmlText = kmlWriter.writeFeatures(features, {
                featureProjection: 'EPSG:3857',
                dataProjection: 'EPSG:4326'
            });
            outputContent = kmlText;
            outputName = `${newBase}.kml`;
            mimeType = 'application/vnd.google-earth.kml+xml';
        } else {
            // GeoJSON
            outputContent = JSON.stringify(JSON.parse(geoJson), null, 2);
            outputName = `${newBase}.geojson`;
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
    // 12. 初始化入口：绑定 HTML 里的 editLocalLayerBtn（方案A）
    //     如果不存在，fallback 到在工具栏创建独立按钮
    // =====================================================
    function initEditorEntry() {
        // 编辑入口已统一到图层管理面板的「编辑」复选框中（addEditableCheckboxToLayerItem）
        // 此处不再需要独立按钮
        console.log('🖊️ 本地图层编辑入口：图层管理面板 → 勾选「编辑」');
    }

    // 弹出"选择要编辑的本地图层"浮层（可复用，绑定到任意按钮）
    function attachLayerListPopup(triggerBtn) {
        let popup = null;

        function close() { if (popup) { popup.remove(); popup = null; } }
        function refresh() {
            if (!popup) return;
            popup.innerHTML = '';

            if (editorState.active) {
                const header = document.createElement('div');
                header.style.cssText = 'padding:8px 12px;background:#e6f7ff;border-bottom:1px solid #91d5ff;font-size:12px;color:#1890ff;font-weight:bold;';
                header.textContent = `🛠️ 正在编辑: ${editorState.editingLayer.name}`;
                popup.appendChild(header);

                const saveRow = document.createElement('button');
                saveRow.className = 'dropdown-btn';
                saveRow.style.cssText = 'display:block;width:100%;text-align:left;';
                saveRow.textContent = '💾 保存当前编辑';
                saveRow.onclick = () => { saveCurrentLayer(); };
                popup.appendChild(saveRow);

                const stopRow = document.createElement('button');
                stopRow.className = 'dropdown-btn';
                stopRow.style.cssText = 'display:block;width:100%;text-align:left;';
                stopRow.textContent = '✕ 停止编辑';
                stopRow.onclick = () => { stopEditLayer(); close(); };
                popup.appendChild(stopRow);
                return;
            }

            if (!localGeoJsonLayers || localGeoJsonLayers.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:14px;font-size:12px;color:#999;text-align:center;line-height:1.8;';
                empty.innerHTML = '暂无本地图层<br>请从 🗂️ → 📁 本地图层 加载<br>或从 ✏️ 图形编辑 新建';
                popup.appendChild(empty);
                return;
            }

            const header = document.createElement('div');
            header.style.cssText = 'padding:8px 12px;background:#fafafa;border-bottom:1px solid #eee;font-size:12px;color:#666;font-weight:bold;';
            header.textContent = '选择要编辑的图层:';
            popup.appendChild(header);

            localGeoJsonLayers.forEach(item => {
                const row = document.createElement('button');
                row.className = 'dropdown-btn';
                row.style.cssText = 'display:block;width:100%;text-align:left;';
                row.innerHTML = `📄 ${item.name}`;
                row.onclick = () => { startEditLayer(item); close(); };
                popup.appendChild(row);
            });
        }

        triggerBtn.onclick = (e) => {
            e.stopPropagation();
            if (popup) { close(); return; }
            // 定位在 triggerBtn 下方
            const rect = triggerBtn.getBoundingClientRect();
            popup = document.createElement('div');
            popup.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;min-width:200px;max-height:360px;overflow-y:auto;background:white;border:1px solid #ddd;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.15);z-index:2000;display:block;`;
            document.body.appendChild(popup);
            refresh();
        };

        document.addEventListener('click', (e) => {
            if (popup && !popup.contains(e.target) && e.target !== triggerBtn) close();
        });
    }

    // 兼容 fallback：创建独立工具栏按钮（原来的 addEditorToolbarButton 简化版）
    function addStandaloneToolbarButton() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) { setTimeout(addStandaloneToolbarButton, 300); return; }
        if (document.getElementById('layerEditorToolbarBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'layerEditorToolbarBtn';
        btn.className = 'action-btn';
        btn.dataset.title = '本地数据编辑';
        btn.textContent = '🖊️';
        toolbar.appendChild(btn);
        attachLayerListPopup(btn);
        console.log('⚠️ fallback: 已创建独立 🖊️ 按钮');
    }

    // =====================================================
    // 13. 初始化
    // =====================================================
    function initLayerEditor() {
        patchLoaders();
        patchCreateLayerControl();
        initEditorEntry();
        console.log('✅ layer_editor.js 已初始化');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayerEditor);
    } else {
        initLayerEditor();
    }

})();
