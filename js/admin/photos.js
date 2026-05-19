let allPhotos = [];
let currentPage = 1;
let totalPages = 1;
const pageSize = 10;

async function loadPhotos(page = 1) {
    console.log('[DEBUG] loadPhotos called, page:', page);
    console.log('[DEBUG] API_BASE_URL:', API_BASE_URL);
    console.log('[DEBUG] Auth headers:', getAuthHeaders());
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/photos?page=${page}&page_size=${pageSize}`, {
            headers: getAuthHeaders()
        });
        
        console.log('[DEBUG] Photos API response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('[DEBUG] Photos API error:', response.status, errorData);
            throw new Error(`Failed to load photos (${response.status})`);
        }
        
        const data = await response.json();
        console.log('[DEBUG] Photos data received:', data);
        
        const features = data.features || [];
        allPhotos = features.map(feature => ({
            id: feature.properties?.id || Date.now() + Math.random(),
            filename: feature.properties?.filename || '',
            uploader: feature.properties?.uploader || feature.properties?.username || '',
            upload_time: feature.properties?.upload_time || '',
            datetime: feature.properties?.datetime || '',
            lat: feature.geometry?.coordinates?.[1] || feature.properties?.lat || '',
            lon: feature.geometry?.coordinates?.[0] || feature.properties?.lon || '',
            device_type: feature.properties?.device_type || '',
            yaw: feature.properties?.yaw,
            pitch: feature.properties?.pitch,
            relative_height: feature.properties?.relative_height,
            h_fov: feature.properties?.h_fov,
            v_fov: feature.properties?.v_fov,
            tide_info: feature.properties?.tide_info || '',
            problem_type: feature.properties?.problem_type || ''
        }));
        
        console.log('[DEBUG] Processed photos count:', allPhotos.length);
        
        currentPage = data.page;
        totalPages = Math.ceil(data.total / pageSize);
        
        renderPhotos(allPhotos);
        updatePagination();
    } catch (error) {
        console.error('[DEBUG] Error loading photos:', error);
        showMessage('加载照片数据失败: ' + error.message, 'error');
    }
}

function renderPhotos(photos) {
    const tableBody = document.querySelector('#photos-table tbody');
    tableBody.innerHTML = '';
    
    photos.forEach(photo => {
        const row = document.createElement('tr');
        
        // 1. 复选框
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'photo-checkbox';
        checkbox.value = photo.id;
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);
        
        // 2. 照片预览
        const previewCell = document.createElement('td');
        if (photo.filename) {
            previewCell.innerHTML = `<a href="${API_BASE_URL}/PICS/${photo.filename}" target="_blank">${photo.filename}</a>`;
        } else {
            previewCell.textContent = '-';
        }
        row.appendChild(previewCell);
        
        // 3. 上传人
        const uploaderCell = document.createElement('td');
        uploaderCell.textContent = photo.uploader || '-';
        row.appendChild(uploaderCell);
        
        // 4. 上传时间
        const uploadTimeCell = document.createElement('td');
        uploadTimeCell.textContent = photo.upload_time ? photo.upload_time.substring(0, 19) : '-';
        row.appendChild(uploadTimeCell);
        
        // 5. 拍摄时间
        const datetimeCell = document.createElement('td');
        datetimeCell.textContent = photo.datetime || '-';
        row.appendChild(datetimeCell);
        
        // 6. 纬度
        const latCell = document.createElement('td');
        latCell.textContent = photo.lat ? photo.lat.toFixed(4) : '-';
        row.appendChild(latCell);
        
        // 7. 经度
        const lonCell = document.createElement('td');
        lonCell.textContent = photo.lon ? photo.lon.toFixed(4) : '-';
        row.appendChild(lonCell);
        
        // 8. 设备类型
        const deviceCell = document.createElement('td');
        deviceCell.textContent = photo.device_type || '-';
        row.appendChild(deviceCell);
        
        // 9. 偏航角
        const yawCell = document.createElement('td');
        yawCell.textContent = photo.yaw !== undefined && photo.yaw !== null ? photo.yaw.toFixed(2) : '-';
        row.appendChild(yawCell);
        
        // 10. 俯仰角
        const pitchCell = document.createElement('td');
        pitchCell.textContent = photo.pitch !== undefined && photo.pitch !== null ? photo.pitch.toFixed(2) : '-';
        row.appendChild(pitchCell);
        
        // 11. 相对高度
        const heightCell = document.createElement('td');
        heightCell.textContent = photo.relative_height !== undefined && photo.relative_height !== null ? photo.relative_height.toFixed(2) : '-';
        row.appendChild(heightCell);
        
        // 12. 水平视场角
        const hFovCell = document.createElement('td');
        hFovCell.textContent = photo.h_fov !== undefined && photo.h_fov !== null ? photo.h_fov.toFixed(2) : '-';
        row.appendChild(hFovCell);
        
        // 13. 垂直视场角
        const vFovCell = document.createElement('td');
        vFovCell.textContent = photo.v_fov !== undefined && photo.v_fov !== null ? photo.v_fov.toFixed(2) : '-';
        row.appendChild(vFovCell);
        
        // 14. 潮位信息
        const tideCell = document.createElement('td');
        tideCell.textContent = photo.tide_info || '-';
        row.appendChild(tideCell);
        
        // 15. 问题类型
        const problemCell = document.createElement('td');
        problemCell.textContent = photo.problem_type || '-';
        row.appendChild(problemCell);
        
        // 16. 操作
        const actionCell = document.createElement('td');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const editButton = document.createElement('button');
        editButton.className = 'btn btn-primary';
        editButton.textContent = '编辑';
        editButton.onclick = () => editPhoto(photo);
        actionButtons.appendChild(editButton);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-danger';
        deleteButton.textContent = '删除';
        deleteButton.onclick = () => deletePhoto(photo.id);
        actionButtons.appendChild(deleteButton);
        
        actionCell.appendChild(actionButtons);
        row.appendChild(actionCell);
        
        tableBody.appendChild(row);
    });
}

function updatePagination() {
    document.getElementById('pageInfo').textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;
    document.getElementById('prevBtn').disabled = currentPage <= 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

function prevPage() {
    if (currentPage > 1) {
        loadPhotos(currentPage - 1);
    }
}

function nextPage() {
    if (currentPage < totalPages) {
        loadPhotos(currentPage + 1);
    }
}

function editPhoto(photo) {
    document.getElementById('editPhotoId').value = photo.id;
    document.getElementById('editPhotoFilename').value = photo.filename;
    document.getElementById('editPhotoUploader').value = photo.uploader || '';
    document.getElementById('editPhotoDatetime').value = photo.datetime || '';
    document.getElementById('editPhotoLat').value = photo.lat || '';
    document.getElementById('editPhotoLon').value = photo.lon || '';
    document.getElementById('editPhotoDeviceType').value = photo.device_type || '';
    document.getElementById('editPhotoTideInfo').value = photo.tide_info || '';
    document.getElementById('editPhotoProblemType').value = photo.problem_type || '';
    document.getElementById('editPhotoModal').style.display = 'block';
}

function submitEditPhoto() {
    const id = document.getElementById('editPhotoId').value;
    const data = {
        datetime: document.getElementById('editPhotoDatetime').value,
        lat: parseFloat(document.getElementById('editPhotoLat').value) || null,
        lon: parseFloat(document.getElementById('editPhotoLon').value) || null,
        device_type: document.getElementById('editPhotoDeviceType').value,
        tide_info: document.getElementById('editPhotoTideInfo').value,
        problem_type: document.getElementById('editPhotoProblemType').value
    };
    
    fetch(`${API_BASE_URL}/api/photos/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
    })
    .then(response => {
        if (response.ok) {
            showMessage('照片信息更新成功', 'success');
            closeModal('editPhotoModal');
            loadPhotos(currentPage);
        } else {
            response.json().then(data => {
                showMessage('更新失败: ' + (data.detail || '未知错误'), 'error');
            });
        }
    })
    .catch(error => {
        showMessage('更新失败: ' + error.message, 'error');
    });
}

function deletePhoto(photoId) {
    if (confirm('确定要删除这张照片吗？')) {
        fetch(`${API_BASE_URL}/api/photos/${photoId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        })
        .then(response => {
            if (response.ok) {
                showMessage('照片删除成功', 'success');
                loadPhotos(currentPage);
            } else {
                response.json().then(data => {
                    showMessage('删除失败: ' + (data.detail || '未知错误'), 'error');
                });
            }
        })
        .catch(error => {
            showMessage('删除失败: ' + error.message, 'error');
        });
    }
}

function exportGeoJson() {
    fetch(`${API_BASE_URL}/api/export/photos/points`, {
        headers: getAuthHeaders()
    })
    .then(response => response.json())
    .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'photos.geojson';
        link.click();
    })
    .catch(error => {
        showMessage('导出失败: ' + error.message, 'error');
    });
}

function exportPhotosCSV() {
    fetch(`${API_BASE_URL}/api/export/photos/csv`, {
        headers: getAuthHeaders()
    })
    .then(response => response.text())
    .then(csvContent => {
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'photos.csv';
        link.click();
    })
    .catch(error => {
        showMessage('导出失败: ' + error.message, 'error');
    });
}

function deleteSelectedPhotos() {
    const selectedIds = [];
    document.querySelectorAll('.photo-checkbox:checked').forEach(checkbox => {
        selectedIds.push(checkbox.value);
    });
    
    if (selectedIds.length === 0) {
        showMessage('请选择要删除的照片', 'error');
        return;
    }
    
    if (confirm(`确定要删除选中的 ${selectedIds.length} 张照片吗？`)) {
        fetch(`${API_BASE_URL}/api/photos/batch-delete`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ids: selectedIds })
        })
        .then(response => {
            if (response.ok) {
                showMessage(`成功删除 ${selectedIds.length} 张照片`, 'success');
                loadPhotos(currentPage);
            } else {
                response.json().then(data => {
                    showMessage('删除失败: ' + (data.detail || '未知错误'), 'error');
                });
            }
        })
        .catch(error => {
            showMessage('删除失败: ' + error.message, 'error');
        });
    }
}

function toggleSelectAllPhotos() {
    const selectAll = document.getElementById('selectAllPhotos');
    document.querySelectorAll('.photo-checkbox').forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
}

function searchPhotos() {
    const searchInput = document.getElementById('photoSearchInput').value.toLowerCase();
    const filtered = allPhotos.filter(photo => 
        photo.filename.toLowerCase().includes(searchInput) ||
        photo.uploader.toLowerCase().includes(searchInput)
    );
    
    renderPhotos(filtered);
    totalPages = Math.ceil(filtered.length / pageSize);
    currentPage = 1;
    updatePagination();
}
