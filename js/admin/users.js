let allUsers = [];

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error('Failed to load users');
        }
        const data = await response.json();
        allUsers = data.users || [];
        renderUsers(allUsers);
    } catch (error) {
        console.error('Error loading users:', error);
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
    const id = document.getElementById('editUserId').value;
    const status = document.getElementById('editStatus').value;
    const role = document.getElementById('editRole').value;
    
    fetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            status: status,
            is_admin: role === 'admin'
        })
    })
    .then(response => {
        if (response.ok) {
            showMessage('用户信息更新成功', 'success');
            closeModal('editUserModal');
            loadUsers();
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
    if (confirm('确定要删除这个用户吗？')) {
        fetch(`${API_BASE_URL}/api/users/${username}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        })
        .then(response => {
            if (response.ok) {
                showMessage('用户删除成功', 'success');
                loadUsers();
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
