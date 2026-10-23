// =====================================================
// 共享属性表单模块 (feature_form.js)
// 版本: v20261023
// 提供: Schema 设计器 + 属性编辑面板
// 供 layer_editor.js (本地图层编辑) 和 map.js (绘制图层) 共用
// 字段类型: text / number / select / date / checkbox
// =====================================================

(function () {
    'use strict';

    // --- 字段类型定义 ---
    const FIELD_TYPES = [
        { value: 'text',   label: '文本' },
        { value: 'number', label: '数字' },
        { value: 'select', label: '下拉选项' },
        { value: 'date',   label: '日期' },
        { value: 'checkbox', label: '是/否' }
    ];

    // 默认 Schema
    function defaultSchema() {
        return {
            fields: [
                { name: '名称', type: 'text', default: '新要素', options: [] }
            ]
        };
    }

    // =====================================================
    // 1. Schema 设计器弹窗
    // =====================================================
    function showSchemaDesigner(options) {
        options = options || {};
        const initial = options.initialSchema || defaultSchema();
        const onConfirm = options.onConfirm || (() => {});
        const title = options.title || '定义属性字段结构';

        // 创建遮罩
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:9999;';
        document.body.appendChild(overlay);

        // 创建弹窗
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: white; border-radius: 10px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.3);
            z-index: 10000; width: 540px; max-width: 92vw; max-height: 85vh;
            display: flex; flex-direction: column;
        `;

        dialog.innerHTML = `
            <div style="padding:14px 18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;font-size:15px;color:#1890ff;">📐 ${title}</h3>
                <span style="font-size:12px;color:#999;">定义字段结构后，新建图斑将按默认值填充</span>
            </div>
            <div id="schemaFieldsContainer" style="flex:1;overflow-y:auto;padding:14px 18px;"></div>
            <div style="padding:12px 18px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                <button id="schemaAddField" style="padding:7px 14px;background:#f0f0f0;border:1px dashed #bbb;border-radius:4px;cursor:pointer;font-size:13px;">+ 添加字段</button>
                <div style="display:flex;gap:10px;">
                    <button id="schemaCancel" style="padding:7px 16px;background:white;border:1px solid #ddd;border-radius:4px;cursor:pointer;">取消</button>
                    <button id="schemaReset" style="padding:7px 16px;background:#faad14;border:none;color:white;border-radius:4px;cursor:pointer;">重置</button>
                    <button id="schemaOk" style="padding:7px 16px;background:#1890ff;border:none;color:white;border-radius:4px;cursor:pointer;">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        let schema = deepClone(initial);
        if (!schema.fields || schema.fields.length === 0) {
            schema = defaultSchema();
        }

        const container = dialog.querySelector('#schemaFieldsContainer');

        function renderFields() {
            container.innerHTML = '';
            schema.fields.forEach((field, idx) => {
                container.appendChild(createFieldRow(field, idx));
            });
        }

        function createFieldRow(field, idx) {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 40px;gap:8px;margin-bottom:10px;align-items:center;';

            // 字段名
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = field.name;
            nameInput.placeholder = '字段名';
            nameInput.style.cssText = 'padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
            nameInput.oninput = (e) => { schema.fields[idx].name = e.target.value; };

            // 类型
            const typeSelect = document.createElement('select');
            typeSelect.style.cssText = 'padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
            FIELD_TYPES.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.value;
                opt.textContent = t.label;
                if (t.value === field.type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.onchange = (e) => {
                schema.fields[idx].type = e.target.value;
                renderFields(); // 重新渲染以刷新默认值输入控件
            };

            // 默认值 (根据类型不同显示不同控件)
            const defaultWrap = document.createElement('div');
            defaultWrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
            const defaultInput = document.createElement('input');
            defaultInput.type = getInputType(field.type);
            defaultInput.value = field.default ?? '';
            defaultInput.placeholder = getPlaceholder(field.type);
            defaultInput.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
            defaultInput.oninput = (e) => {
                let v = e.target.value;
                if (field.type === 'number') v = parseFloat(v) || 0;
                schema.fields[idx].default = v;
            };
            defaultWrap.appendChild(defaultInput);

            // 如果是 select 类型，显示选项输入
            if (field.type === 'select') {
                const optionsInput = document.createElement('input');
                optionsInput.type = 'text';
                optionsInput.value = (field.options || []).join(',');
                optionsInput.placeholder = '选项用逗号分隔';
                optionsInput.style.cssText = 'grid-column:1 / -1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;margin-top:4px;';
                optionsInput.oninput = (e) => {
                    schema.fields[idx].options = e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                };
                row.style.gridTemplateRows = 'auto auto';
                row.appendChild(optionsInput); // 占位（稍后重新调整）
            }

            // 删除按钮
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.title = '删除此字段';
            delBtn.style.cssText = 'padding:6px;background:#ff4d4f;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
            delBtn.onclick = () => {
                schema.fields.splice(idx, 1);
                renderFields();
            };

            row.appendChild(nameInput);
            row.appendChild(typeSelect);
            row.appendChild(defaultWrap);
            row.appendChild(delBtn);

            // 注释行
            const comment = document.createElement('div');
            comment.style.cssText = 'grid-column:1 / -1;font-size:11px;color:#999;margin-top:-6px;margin-bottom:6px;';
            if (field.type === 'select') {
                comment.textContent = '💡 在下方输入选项（逗号分隔）';
                row.appendChild(comment);
            }

            return row;
        }

        function getInputType(type) {
            const map = { text: 'text', number: 'number', select: 'text', date: 'date', checkbox: 'text' };
            return map[type] || 'text';
        }
        function getPlaceholder(type) {
            const map = { text: '默认值', number: '0', select: '默认值', date: '', checkbox: 'true/false' };
            return map[type] || '';
        }

        renderFields();

        // 事件绑定
        dialog.querySelector('#schemaAddField').onclick = () => {
            schema.fields.push({ name: '新字段', type: 'text', default: '', options: [] });
            renderFields();
        };

        dialog.querySelector('#schemaCancel').onclick = () => { close(); };
        dialog.querySelector('#schemaReset').onclick = () => {
            schema = defaultSchema();
            renderFields();
        };
        dialog.querySelector('#schemaOk').onclick = () => {
            // 过滤空字段名
            schema.fields = schema.fields.filter(f => f.name && f.name.trim());
            if (schema.fields.length === 0) {
                alert('至少保留一个字段');
                return;
            }
            close();
            onConfirm(schema);
        };

        overlay.onclick = () => close();

        function close() {
            dialog.remove();
            overlay.remove();
        }

        // 暴露 close 给外部
        return { close };
    }

    // =====================================================
    // 2. 属性编辑面板（浮动面板）
    // =====================================================
    function showPropertyPanel(options) {
        options = options || {};
        const features = options.features || [];
        const source = options.source;       // ol.source.Vector
        const schema = options.schema;       // 可选的字段结构
        const container = options.container; // 面板容器
        const position = options.position || { top: '60px', left: '20px' };
        const commitMode = options.commitMode !== false; // 默认 true = 保存/取消模式

        if (!features || features.length === 0) {
            closePropertyPanel();
            return null;
        }

        // 备份原始属性（用于取消）
        const backups = features.map(f => {
            const p = f.getProperties();
            delete p.geometry;
            return JSON.parse(JSON.stringify(p));
        });

        // 面板容器
        let panel = container || document.getElementById('featureFormPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'featureFormPanel';
            panel.style.cssText = `position:absolute;z-index:1000;background:white;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.2);padding:12px;min-width:260px;max-width:340px;max-height:72vh;overflow-y:auto;`;
            Object.assign(panel.style, position);
            document.body.appendChild(panel);
        }
        panel.innerHTML = '';

        // 标题
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:bold;font-size:13px;color:#1890ff;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;';
        title.innerHTML = `<span>📝 属性编辑 (${features.length} 个要素)</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#999;font-size:14px;';
        closeBtn.onclick = () => closePropertyPanel();
        title.appendChild(closeBtn);
        panel.appendChild(title);

        const dirtyInputs = []; // 记录已修改的 input（commitMode 下）

        features.forEach((feature, fIdx) => {
            const featBox = document.createElement('div');
            featBox.style.cssText = 'margin-bottom:10px;padding:8px;border:1px solid #e6f7ff;border-radius:4px;background:#fafcff;';

            const geomType = feature.getGeometry() ? feature.getGeometry().getType() : 'Unknown';
            const geomBadge = document.createElement('div');
            geomBadge.textContent = `📍 ${geomType}`;
            geomBadge.style.cssText = 'font-size:11px;color:#1890ff;margin-bottom:6px;';
            featBox.appendChild(geomBadge);

            // 收集要显示的字段
            let fieldList;
            if (schema && schema.fields && schema.fields.length > 0) {
                // 使用 schema 定义的字段 + 额外的未定义字段
                fieldList = schema.fields.map(sf => ({
                    name: sf.name,
                    type: sf.type,
                    options: sf.options,
                    value: feature.get(sf.name)
                }));
                const props = feature.getProperties();
                Object.keys(props).forEach(key => {
                    if (key === 'geometry') return;
                    if (!schema.fields.some(sf => sf.name === key)) {
                        fieldList.push({ name: key, type: 'text', value: props[key] });
                    }
                });
            } else {
                // 没有 schema，遍历所有 properties
                fieldList = [];
                const props = feature.getProperties();
                Object.keys(props).forEach(key => {
                    if (key === 'geometry') return;
                    fieldList.push({ name: key, type: 'text', value: props[key] });
                });
            }

            fieldList.forEach(f => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;margin-bottom:4px;font-size:12px;';

                const lbl = document.createElement('label');
                lbl.textContent = f.name;
                lbl.style.cssText = 'width:80px;color:#666;flex-shrink:0;font-size:12px;';

                const input = createFieldInput(f, feature);

                row.appendChild(lbl);
                row.appendChild(input);
                featBox.appendChild(row);
            });

            // 新增字段按钮
            const addBtn = document.createElement('button');
            addBtn.textContent = '+ 新增字段';
            addBtn.style.cssText = 'padding:3px 8px;margin-top:4px;border:1px dashed #1890ff;background:white;color:#1890ff;border-radius:3px;cursor:pointer;font-size:11px;';
            addBtn.onclick = () => {
                const name = prompt('请输入字段名:');
                if (!name) return;
                const val = prompt(`请输入 "${name}" 的值:`) || '';
                feature.set(name, val);
                showPropertyPanel({ features, source, schema, container: panel }); // 刷新
            };
            featBox.appendChild(addBtn);

            panel.appendChild(featBox);
        });

        // === 底部按钮区 ===
        if (commitMode) {
            const btnBar = document.createElement('div');
            btnBar.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';

            // 取消 → 从备份恢复属性
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = 'padding:5px 14px;border:1px solid #ddd;background:white;border-radius:4px;cursor:pointer;font-size:12px;color:#666;';
            cancelBtn.onclick = () => {
                features.forEach((f, i) => {
                    // 清掉所有属性，恢复备份
                    const current = f.getProperties();
                    Object.keys(current).forEach(k => { if (k !== 'geometry') f.unset(k); });
                    Object.keys(backups[i]).forEach(k => f.set(k, backups[i][k]));
                });
                closePropertyPanel();
            };

            // 保存 → 直接关闭（属性已实时写回）
            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.style.cssText = 'padding:5px 14px;border:none;background:#1890ff;color:white;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
            saveBtn.onclick = () => {
                closePropertyPanel();
            };

            btnBar.appendChild(cancelBtn);
            btnBar.appendChild(saveBtn);
            panel.appendChild(btnBar);
        }

        return panel;
    }

    // 根据字段类型创建合适的输入控件
    function createFieldInput(field, feature) {
        let input;
        if (field.type === 'select' && field.options && field.options.length > 0) {
            input = document.createElement('select');
            field.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                if (String(field.value) === String(opt)) o.selected = true;
                input.appendChild(o);
            });
        } else if (field.type === 'checkbox') {
            input = document.createElement('select');
            ['true', 'false'].forEach(v => {
                const o = document.createElement('option');
                o.value = v;
                o.textContent = v === 'true' ? '是' : '否';
                if (String(field.value) === v) o.selected = true;
                input.appendChild(o);
            });
        } else if (field.type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.value = field.value ?? '';
        } else if (field.type === 'date') {
            input = document.createElement('input');
            input.type = 'date';
            input.value = field.value ?? '';
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = field.value ?? '';
        }
        input.style.cssText = 'flex:1;padding:3px 5px;border:1px solid #ddd;border-radius:3px;font-size:12px;';
        input.onchange = (e) => {
            let v = e.target.value;
            if (field.type === 'number') v = parseFloat(v) || 0;
            feature.set(field.name, v);
            console.log(`✅ 属性已更新: ${field.name} = ${v}`);
        };
        return input;
    }

    function closePropertyPanel() {
        const panel = document.getElementById('featureFormPanel');
        if (panel) panel.remove();
    }

    // =====================================================
    // 3. 工具函数
    // =====================================================
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // =====================================================
    // 4. 暴露到全局
    // =====================================================
    window.FeatureForm = {
        showSchemaDesigner: showSchemaDesigner,
        showPropertyPanel: showPropertyPanel,
        closePropertyPanel: closePropertyPanel,
        FIELD_TYPES: FIELD_TYPES,
        defaultSchema: defaultSchema
    };

    console.log('✅ feature_form.js 已加载');

})();
