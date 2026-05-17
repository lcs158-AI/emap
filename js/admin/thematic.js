let currentThematicTable = null;

async function loadThematicTables() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/thematic/tables`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error('Failed to load thematic tables');
        }
        const data = await response.json();
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
        const response = await fetch(`${API_BASE_URL}/api/thematic/data/${encodeURIComponent(tableName)}`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error('Failed to load thematic data');
        }
        const data = await response.json();
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
    
    if (data.length === 0) {
        body.innerHTML = '<tr><td colspan="100" style="text-align:center;">暂无数据</td></tr>';
        return;
    }
    
    const fields = Object.keys(data[0]);
    fields.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        headerRow.appendChild(th);
    });
    
    data.forEach(row => {
        const tr = document.createElement('tr');
        fields.forEach(field => {
            const td = document.createElement('td');
            td.textContent = row[field] !== null ? row[field].toString() : '';
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
}

function hideThematicData() {
    document.getElementById('thematic-data-panel').style.display = 'none';
    currentThematicTable = null;
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

function exportSingleThematicData(tableName) {
    window.open(`${API_BASE_URL}/api/thematic/export/${encodeURIComponent(tableName)}`, '_blank');
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
