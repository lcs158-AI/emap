let currentThematicTable = null;
let currentThematicFields = [];
let currentThematicData = [];

async function loadThematicTables() {
    try {
        console.log('[DEBUG] loadThematicTables called');
        console.log('[DEBUG] API_BASE_URL:', API_BASE_URL);
        console.log('[DEBUG] Auth headers:', getAuthHeaders());
        
        const response = await fetch(`${API_BASE_URL}/api/thematic/tables`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
                'Accept': 'application/json'
            },
            credentials: 'include'
        });
        
        console.log('[DEBUG] Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('[DEBUG] Response error:', response.status, errorData);
            throw new Error(`HTTP ${response.status}: ${errorData?.detail || 'Failed to load thematic tables'}`);
        }
        
        const data = await response.json();
        console.log('[DEBUG] Received tables:', data);
        renderThematicTables(data);
    } catch (error) {
        console.error('Error loading thematic tables:', error);
        showMessage('加载专题数据表失败: ' + error.message, 'error');
    }
}

function renderThematicTables(tables) {
    const tableBody = document.querySelector('#thematic-table tbody');
    tableBody.innerHTML = '';
    
    if (tables.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">暂无专题数据表</td></tr>';
        return;
    }
    
    tables.forEach(table => {
        const row = document.createElement('tr');
        
        const nameCell = document.createElement('td');
        nameCell.textContent = table.table_name;
        row.appendChild(nameCell);
        
        const labelCell = document.createElement('td');
        labelCell.textContent = table.table_label || table.table_name;
        row.appendChild(labelCell);
        
        const fieldsCell = document.createElement('td');
        fieldsCell.textContent = table.field_count || '-';
        row.appendChild(fieldsCell);
        
        const recordsCell = document.createElement('td');
        recordsCell.textContent = table.record_count || '-';
        row.appendChild(recordsCell);
        
        const createdCell = document.createElement('td');
        createdCell.textContent = table.created_at || '-';
        row.appendChild(createdCell);
        
        const actionCell = document.createElement('td');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const viewButton = document.createElement('button');
        viewButton.className = 'btn btn-primary';
        viewButton.textContent = '查看';
        viewButton.onclick = () => viewThematicData(table.table_name);
        actionButtons.appendChild(viewButton);
        
        const exportButton = document.createElement('button');
        exportButton.className = 'btn btn-info';
        exportButton.textContent = '导出';
        exportButton.onclick = () => exportSingleThematicData(table.table_name);
        actionButtons.appendChild(exportButton);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-danger';
        deleteButton.textContent = '删除';
        deleteButton.onclick = () => confirmDeleteTable(table.table_name);
        actionButtons.appendChild(deleteButton);
        
        actionCell.appendChild(actionButtons);
        row.appendChild(actionCell);
        
        tableBody.appendChild(row);
    });
}

async function viewThematicData(tableName) {
    currentThematicTable = tableName;
    document.getElementById('current-table-name').textContent = tableName;
    
    try {
        const [dataRes, fieldsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(tableName)}`, {
                headers: getAuthHeaders()
            }),
            fetch(`${API_BASE_URL}/api/thematic/fields/${encodeURIComponent(tableName)}`, {
                headers: getAuthHeaders()
            })
        ]);
        
        if (!dataRes.ok || !fieldsRes.ok) {
            throw new Error('Failed to load thematic data');
        }
        
        const data = await dataRes.json();
        const fields = await fieldsRes.json();
        
        currentThematicData = data.data || [];
        currentThematicFields = fields || [];
        
        renderThematicData(data.data);
        document.getElementById('thematic-data-panel').style.display = 'block';
    } catch (error) {
        console.error('Error loading thematic data:', error);
        showMessage('加载数据失败: ' + error.message, 'error');
    }
}

function renderThematicData(data) {
    const headerRow = document.getElementById('thematic-data-header');
    const body = document.getElementById('thematic-data-body');
    
    headerRow.innerHTML = '';
    body.innerHTML = '';
    
    if (!data || data.length === 0) {
        body.innerHTML = '<tr><td colspan="100" style="text-align:center;">暂无数据</td></tr>';
        return;
    }
    
    const fields = Object.keys(data[0]);
    
    const actionHeader = document.createElement('th');
    actionHeader.textContent = '操作';
    actionHeader.style.minWidth = '120px';
    headerRow.appendChild(actionHeader);
    
    fields.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        th.style.minWidth = '100px';
        headerRow.appendChild(th);
    });
    
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = index;
        
        const actionTd = document.createElement('td');
        const actionDiv = document.createElement('div');
        actionDiv.style.display = 'flex';
        actionDiv.style.gap = '5px';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-warning';
        editBtn.textContent = '编辑';
        editBtn.onclick = () => showEditRowModal(index, row);
        actionDiv.appendChild(editBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = () => confirmDeleteRow(index);
        actionDiv.appendChild(deleteBtn);
        
        actionTd.appendChild(actionDiv);
        tr.appendChild(actionTd);
        
        fields.forEach(field => {
            const td = document.createElement('td');
            td.textContent = row[field] !== null && row[field] !== undefined ? row[field].toString() : '';
            td.style.maxWidth = '200px';
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.title = td.textContent;
            tr.appendChild(td);
        });
        
        body.appendChild(tr);
    });
}

function hideThematicData() {
    document.getElementById('thematic-data-panel').style.display = 'none';
    currentThematicTable = null;
    currentThematicData = [];
    currentThematicFields = [];
}

function showImportModal() {
    document.getElementById('thematicImportModal').style.display = 'block';
}

async function submitThematicImport() {
    const fileInput = document.getElementById('importFile');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showMessage('请选择CSV文件', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('导入成功', 'success');
            closeModal('thematicImportModal');
            loadThematicTables();
        } else {
            showMessage('导入失败: ' + (result.detail || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error importing thematic data:', error);
        showMessage('导入失败: ' + error.message, 'error');
    }
}

async function exportSingleThematicData(tableName) {
    const token = localStorage.getItem('access_token');
    if (!token) {
        showMessage('请先登录', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/export/${encodeURIComponent(tableName)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tableName}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showMessage('导出成功', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showMessage('导出失败: ' + error.message, 'error');
    }
}

async function exportThematicData() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    exportSingleThematicData(currentThematicTable);
}

function confirmDeleteTable(tableName) {
    if (confirm(`确定要删除数据表 "${tableName}" 吗？此操作不可撤销！`)) {
        deleteThematicTableByName(tableName);
    }
}

async function deleteThematicTableByName(tableName) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/${encodeURIComponent(tableName)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showMessage('删除成功', 'success');
            loadThematicTables();
            hideThematicData();
        } else {
            const result = await response.json();
            showMessage('删除失败: ' + (result.detail || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error deleting table:', error);
        showMessage('删除失败: ' + error.message, 'error');
    }
}

async function deleteThematicTable() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    confirmDeleteTable(currentThematicTable);
}

async function fixThematicFields() {
    try {
        showMessage('正在修复字段...', 'info');
        const response = await fetch(`${API_BASE_URL}/api/thematic/fix-fields`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok) {
            let msg = '字段修复完成！\n';
            result.results.forEach(r => {
                if (r.status === 'success') {
                    if (r.added.length > 0) {
                        msg += `${r.table}: 新增 ${r.added.length} 个字段\n`;
                    }
                    if (r.updated.length > 0) {
                        msg += `${r.table}: 更新 ${r.updated.length} 个字段\n`;
                    }
                    if (r.added.length === 0 && r.updated.length === 0) {
                        msg += `${r.table}: 无需修复\n`;
                    }
                } else {
                    msg += `${r.table}: ${r.message}\n`;
                }
            });
            showMessage(msg.replace(/\n/g, ' '), 'success');
            loadThematicTables();
        } else {
            showMessage('修复失败: ' + (result.detail || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error fixing fields:', error);
        showMessage('修复失败: ' + error.message, 'error');
    }
}

async function showAddRowModal() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    let fieldsHtml = '';
    currentThematicFields.forEach(field => {
        fieldsHtml += `
            <div class="form-group">
                <label for="newRow_${field.name}">${field.label || field.name}</label>
                <input type="text" id="newRow_${field.name}" placeholder="${field.name}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
            </div>
        `;
    });
    
    document.getElementById('addRowFields').innerHTML = fieldsHtml;
    document.getElementById('addRowModal').style.display = 'block';
}

async function submitAddRow() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    const rowData = {};
    currentThematicFields.forEach(field => {
        const input = document.getElementById(`newRow_${field.name}`);
        if (input && input.value) {
            rowData[field.name] = input.value;
        }
    });
    
    if (Object.keys(rowData).length === 0) {
        showMessage('请至少填写一个字段', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(currentThematicTable)}/rows`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rowData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage(`添加成功（第${result.row_index}行）`, 'success');
            closeModal('addRowModal');
            viewThematicData(currentThematicTable);
        } else {
            showMessage('添加失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error adding row:', error);
        showMessage('添加失败: ' + error.message, 'error');
    }
}

function showEditRowModal(index, row) {
    let fieldsHtml = '';
    currentThematicFields.forEach(field => {
        fieldsHtml += `
            <div class="form-group">
                <label for="editRow_${field.name}">${field.label || field.name}</label>
                <input type="text" id="editRow_${field.name}" value="${row[field.name] || ''}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
            </div>
        `;
    });
    
    document.getElementById('editRowIndex').textContent = index;
    document.getElementById('editRowFields').innerHTML = fieldsHtml;
    document.getElementById('editRowModal').style.display = 'block';
}

async function submitEditRow() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    const index = parseInt(document.getElementById('editRowIndex').textContent);
    const rowData = {};
    currentThematicFields.forEach(field => {
        const input = document.getElementById(`editRow_${field.name}`);
        if (input) {
            rowData[field.name] = input.value;
        }
    });
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(currentThematicTable)}/rows/${index}`, {
            method: 'PUT',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rowData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage('更新成功', 'success');
            closeModal('editRowModal');
            viewThematicData(currentThematicTable);
        } else {
            showMessage('更新失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error updating row:', error);
        showMessage('更新失败: ' + error.message, 'error');
    }
}

function confirmDeleteRow(index) {
    if (confirm(`确定要删除第 ${index + 1} 行吗？此操作不可撤销！`)) {
        deleteRowByIndex(index);
    }
}

async function deleteRowByIndex(index) {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(currentThematicTable)}/rows/${index}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage('删除成功', 'success');
            viewThematicData(currentThematicTable);
        } else {
            showMessage('删除失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error deleting row:', error);
        showMessage('删除失败: ' + error.message, 'error');
    }
}

function showAddColumnModal() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    document.getElementById('addColumnModal').style.display = 'block';
}

async function submitAddColumn() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    const fieldName = document.getElementById('newColumnName').value.trim();
    const fieldLabel = document.getElementById('newColumnLabel').value.trim();
    const defaultValue = document.getElementById('newColumnDefault').value.trim();
    
    if (!fieldName) {
        showMessage('请输入字段名', 'error');
        return;
    }
    
    try {
        const params = new URLSearchParams({
            field_name: fieldName
        });
        if (fieldLabel) params.append('field_label', fieldLabel);
        if (defaultValue) params.append('default_value', defaultValue);
        
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(currentThematicTable)}/columns?${params}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage(`添加成功（字段：${result.column_name}）`, 'success');
            closeModal('addColumnModal');
            document.getElementById('newColumnName').value = '';
            document.getElementById('newColumnLabel').value = '';
            document.getElementById('newColumnDefault').value = '';
            viewThematicData(currentThematicTable);
        } else {
            showMessage('添加失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error adding column:', error);
        showMessage('添加失败: ' + error.message, 'error');
    }
}

function showUpdateColumnModal() {
    if (!currentThematicTable || currentThematicFields.length === 0) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    let fieldsHtml = '<option value="">-- 选择字段 --</option>';
    currentThematicFields.forEach(field => {
        fieldsHtml += `<option value="${field.name}">${field.label || field.name}</option>`;
    });
    document.getElementById('updateColumnSelect').innerHTML = fieldsHtml;
    document.getElementById('updateColumnModal').style.display = 'block';
}

async function submitUpdateColumn() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    const columnName = document.getElementById('updateColumnSelect').value;
    const newValue = document.getElementById('updateColumnValue').value.trim();
    
    if (!columnName) {
        showMessage('请选择要更新的字段', 'error');
        return;
    }
    
    if (!newValue) {
        showMessage('请输入新值', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(currentThematicTable)}/columns/${encodeURIComponent(columnName)}?new_value=${encodeURIComponent(newValue)}`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage(`更新成功（${result.rows_affected}行已更新）`, 'success');
            closeModal('updateColumnModal');
            document.getElementById('updateColumnValue').value = '';
            viewThematicData(currentThematicTable);
        } else {
            showMessage('更新失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error updating column:', error);
        showMessage('更新失败: ' + error.message, 'error');
    }
}

function confirmDeleteColumn() {
    if (!currentThematicTable || currentThematicFields.length === 0) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    let fieldsHtml = '<option value="">-- 选择字段 --</option>';
    currentThematicFields.forEach(field => {
        fieldsHtml += `<option value="${field.name}">${field.label || field.name}</option>`;
    });
    document.getElementById('deleteColumnSelect').innerHTML = fieldsHtml;
    document.getElementById('deleteColumnModal').style.display = 'block';
}

async function submitDeleteColumn() {
    if (!currentThematicTable) {
        showMessage('请先选择数据表', 'error');
        return;
    }
    
    const columnName = document.getElementById('deleteColumnSelect').value;
    
    if (!columnName) {
        showMessage('请选择要删除的字段', 'error');
        return;
    }
    
    if (!confirm(`确定要删除字段 "${columnName}" 吗？此操作不可撤销！`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(currentThematicTable)}/columns/${encodeURIComponent(columnName)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage(`删除成功（字段：${result.column_name}）`, 'success');
            closeModal('deleteColumnModal');
            viewThematicData(currentThematicTable);
        } else {
            showMessage('删除失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Error deleting column:', error);
        showMessage('删除失败: ' + error.message, 'error');
    }
}
