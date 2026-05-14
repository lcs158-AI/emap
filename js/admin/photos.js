let allPhotos = [];
let currentPage = 1;
let totalPages = 1;
const pageSize = 10;

async function loadPhotos(page = 1) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/photos/all?page=${page}&size=${pageSize}`);
        if (!response.ok) {
            throw new Error('Failed to load photos');
        }
        const data = await response.json();
        allPhotos = data.photos || [];
        currentPage = data.page || 1;
        totalPages = data.total_pages || 1;
        
        renderPhotos(allPhotos);
        updatePagination();
    } catch (error) {
        console.error('Error loading photos:', error);
        showMessage('加载照片数据失败: ' + error.message, 'error');
    }
}

function renderPhotos(photos) {
    const tableBody = document.querySelector('#photos-table tbody');
    tableBody.innerHTML = '';
    
    photos.forEach(photo => {
        const row = document.createElement('tr');
        
        const filenameCell = document.createElement('td');
        filenameCell.innerHTML = `<a href="${API_BASE_URL}/api/photos/${photo.filename}" target="_blank">${photo.filename}</a>`;
        row.appendChild(filenameCell);
        
        const uploaderCell = document.createElement('td');
        uploaderCell.textContent = photo.uploader || '-';
        row.appendChild(uploaderCell);
        
        const datetimeCell = document.createElement('td');
        datetimeCell.textContent = photo.datetime || '-';
        row.appendChild(datetimeCell);
        
        const locationCell = document.createElement('td');
        if (photo.lat && photo.lon) {
            locationCell.textContent = `${photo.lat.toFixed(4)}, ${photo.lon.toFixed(4)}`;
        } else {
            locationCell.textContent = '-';
        }
        row.appendChild(locationCell);
        
        const deviceCell = document.createElement('td');
        deviceCell.textContent = photo.device_type || '-';
        row.appendChild(deviceCell);
        
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
    document.getElementById('editPhotoDateTime').value = photo.datetime || '';
    document.getElementById('editPhotoDeviceType').value = photo.device_type || '';
    document.getElementById('editPhotoProblemType').value = photo.problem_type || '';
    document.getElementById('editPhotoModal').style.display = 'block';
}

function submitEditPhoto() {
    const id = document.getElementById('editPhotoId').value;
    const data = {
        uploader: document.getElementById('editPhotoUploader').value,
        datetime: document.getElementById('editPhotoDateTime').value,
        device_type: document.getElementById('editPhotoDeviceType').value,
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
    fetch(`${API_BASE_URL}/api/photos/geojson`, {
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
    fetch(`${API_BASE_URL}/api/photos/export`, {
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
    
    const tableBody = document.querySelector('#photos-table tbody');
    tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">没有找到匹配的照片</td></tr>';
        return;
    }
    
    filtered.forEach(photo => {
        const row = document.createElement('tr');
        
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'photo-checkbox';
        checkbox.value = photo.id;
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);
        
        const filenameCell = document.createElement('td');
        filenameCell.innerHTML = `<a href="${API_BASE_URL}/api/photos/${photo.filename}" target="_blank">${photo.filename}</a>`;
        row.appendChild(filenameCell);
        
        const uploaderCell = document.createElement('td');
        uploaderCell.textContent = photo.uploader || '-';
        row.appendChild(uploaderCell);
        
        const datetimeCell = document.createElement('td');
        datetimeCell.textContent = photo.datetime || '-';
        row.appendChild(datetimeCell);
        
        const locationCell = document.createElement('td');
        if (photo.lat && photo.lon) {
            locationCell.textContent = `${photo.lat.toFixed(4)}, ${photo.lon.toFixed(4)}`;
        } else {
            locationCell.textContent = '-';
        }
        row.appendChild(locationCell);
        
        const deviceCell = document.createElement('td');
        deviceCell.textContent = photo.device_type || '-';
        row.appendChild(deviceCell);
        
        tableBody.appendChild(row);
    });
}
