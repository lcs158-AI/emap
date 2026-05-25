let allUsers = [];

async function loadUsers() {
    console.log('[DEBUG] loadUsers called');
    console.log('[DEBUG] API_BASE_URL:', API_BASE_URL);
    console.log('[DEBUG] Auth headers:', getAuthHeaders());
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            headers: getAuthHeaders()
        });
        
        console.log('[DEBUG] Users API response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('[DEBUG] Users API error:', response.status, errorData);
            throw new Error(`Failed to load users (${response.status})`);
        }
        
        const data = await response.json();
        console.log('[DEBUG] Users data received:', data);
        
        allUsers = data.users || [];
        console.log('[DEBUG] Users count:', allUsers.length);
        
        renderUsers(allUsers);
    } catch (error) {
        console.error('[DEBUG] Error loading users:', error);
        showMessage('加载用户数据失败: ' + error.message, 'error');
    }
}

function renderUsers(users) {
    const tableBody = document.querySelector('#users-table tbody');
    tableBody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        
        const usernameCell = document.createElement('td');
        usernameCell.textContent = user.username;
        row.appendChild(usernameCell);
        
        const statusCell = document.createElement('td');
        statusCell.textContent = user.status || 'pending';
        row.appendChild(statusCell);
        
        const roleCell = document.createElement('td');
        roleCell.textContent = user.is_admin ? '管理员' : '普通用户';
        row.appendChild(roleCell);
        
        const actionCell = document.createElement('td');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const editButton = document.createElement('button');
        editButton.className = 'btn btn-primary';
        editButton.textContent = '编辑';
        editButton.onclick = () => editUser(user);
        actionButtons.appendChild(editButton);
        
        const resetButton = document.createElement('button');
        resetButton.className = 'btn btn-warning';
        resetButton.textContent = '重置密码';
        resetButton.onclick = () => resetPassword(user);
        actionButtons.appendChild(resetButton);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-danger';
        deleteButton.textContent = '删除';
        deleteButton.onclick = () => deleteUser(user.username);
        actionButtons.appendChild(deleteButton);
        
        actionCell.appendChild(actionButtons);
        row.appendChild(actionCell);
        
        tableBody.appendChild(row);
    });
}

function editUser(user) {
    document.getElementById('editUserId').value = user.username;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editStatus').value = user.status || 'pending';
    document.getElementById('editRole').value = user.is_admin ? 'admin' : 'user';
    document.getElementById('editUserModal').style.display = 'block';
}

function submitEditUser() {
    console.log('[DEBUG] submitEditUser called');
    
    const id = document.getElementById('editUserId').value;
    const status = document.getElementById('editStatus').value;
    const role = document.getElementById('editRole').value;
    
    console.log('[DEBUG] editUserId:', id);
    console.log('[DEBUG] editStatus:', status);
    console.log('[DEBUG] editRole:', role);
    
    const authHeaders = getAuthHeaders();
    console.log('[DEBUG] Auth headers:', authHeaders);
    console.log('[DEBUG] Token present:', !!authHeaders['Authorization']);
    
    const bodyData = {
        status: status,
        is_admin: role === 'admin'
    };
    console.log('[DEBUG] Request body:', bodyData);
    
    const url = `${API_BASE_URL}/api/users/${id}`;
    console.log('[DEBUG] Request URL:', url);
    console.log('[DEBUG] Request method:', 'PUT');
    
    fetch(url, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(bodyData)
    })
    .then(response => {
        console.log('[DEBUG] Response status:', response.status);
        console.log('[DEBUG] Response ok:', response.ok);
        console.log('[DEBUG] Response headers:', response.headers);
        
        if (response.ok) {
            console.log('[DEBUG] User update successful');
            showMessage('用户信息更新成功', 'success');
            closeModal('editUserModal');
            loadUsers();
        } else {
            response.json().then(data => {
                console.error('[DEBUG] Update error response:', data);
                showMessage('更新失败: ' + (data.detail || '未知错误'), 'error');
            }).catch(err => {
                console.error('[DEBUG] Failed to parse error response:', err);
                showMessage('更新失败: 无法解析错误信息', 'error');
            });
        }
    })
    .catch(error => {
        console.error('[DEBUG] Fetch error:', error);
        console.error('[DEBUG] Error message:', error.message);
        console.error('[DEBUG] Error stack:', error.stack);
        showMessage('更新失败: ' + error.message, 'error');
    });
}

function resetPassword(user) {
    document.getElementById('resetUserId').value = user.username;
    document.getElementById('resetUsername').value = user.username;
    document.getElementById('resetPasswordModal').style.display = 'block';
}

function submitResetPassword() {
    const id = document.getElementById('resetUserId').value;
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        showMessage('两次输入的密码不一致', 'error');
        return;
    }
    
    fetch(`${API_BASE_URL}/api/users/${id}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ new_password: newPassword })
    })
    .then(response => {
        if (response.ok) {
            showMessage('密码重置成功', 'success');
            closeModal('resetPasswordModal');
            document.getElementById('resetNewPassword').value = '';
            document.getElementById('resetConfirmPassword').value = '';
        } else {
            response.json().then(data => {
                showMessage('重置失败: ' + (data.detail || '未知错误'), 'error');
            });
        }
    })
    .catch(error => {
        showMessage('重置失败: ' + error.message, 'error');
    });
}

function deleteUser(username) {
    console.log('[DEBUG] deleteUser called with username:', username);
    
    if (confirm('确定要删除这个用户吗？')) {
        const authHeaders = getAuthHeaders();
        console.log('[DEBUG] Auth headers:', authHeaders);
        console.log('[DEBUG] Token present:', !!authHeaders['Authorization']);
        
        const url = `${API_BASE_URL}/api/users/${username}`;
        console.log('[DEBUG] Delete URL:', url);
        
        fetch(url, {
            method: 'DELETE',
            headers: authHeaders
        })
        .then(response => {
            console.log('[DEBUG] Delete response status:', response.status);
            console.log('[DEBUG] Delete response ok:', response.ok);
            
            if (response.ok) {
                console.log('[DEBUG] User delete successful');
                showMessage('用户删除成功', 'success');
                loadUsers();
            } else {
                response.json().then(data => {
                    console.error('[DEBUG] Delete error response:', data);
                    showMessage('删除失败: ' + (data.detail || '未知错误'), 'error');
                }).catch(err => {
                    console.error('[DEBUG] Failed to parse delete error:', err);
                    showMessage('删除失败: 无法解析错误信息', 'error');
                });
            }
        })
        .catch(error => {
            console.error('[DEBUG] Delete fetch error:', error);
            console.error('[DEBUG] Delete error message:', error.message);
            console.error('[DEBUG] Delete error stack:', error.stack);
            showMessage('删除失败: ' + error.message, 'error');
        });
    } else {
        console.log('[DEBUG] Delete cancelled by user');
    }
}

function searchUsers() {
    const searchInput = document.getElementById('userSearchInput').value.toLowerCase();
    const filtered = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchInput)
    );
    renderUsers(filtered);
}

function exportUsers() {
    const headers = ['用户名', '状态', '角色', '创建时间'];
    const rows = allUsers.map(user => [
        user.username,
        user.status || 'pending',
        user.is_admin ? '管理员' : '普通用户',
        user.created_at || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'users.csv';
    link.click();
}

function changePassword() {
    const oldPassword = document.getElementById('changeOldPassword').value;
    const newPassword = document.getElementById('changeNewPassword').value;
    const confirmPassword = document.getElementById('changeConfirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        showMessage('两次输入的密码不一致', 'error');
        return;
    }
    
    fetch(`${API_BASE_URL}/api/users/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            username: currentUser,
            old_password: oldPassword,
            new_password: newPassword
        })
    })
    .then(response => {
        if (response.ok) {
            showMessage('密码修改成功', 'success');
            closeModal('changePasswordModal');
            document.getElementById('changeOldPassword').value = '';
            document.getElementById('changeNewPassword').value = '';
            document.getElementById('changeConfirmPassword').value = '';
        } else {
            response.json().then(data => {
                showMessage('修改失败: ' + (data.detail || '未知错误'), 'error');
            });
        }
    })
    .catch(error => {
        showMessage('修改失败: ' + error.message, 'error');
    });
}
