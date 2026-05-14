const API_BASE_URL = (function() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8082';
    } else if (hostname.includes('lzywhy')) {
        return 'https://lzy-fastapi.onrender.com';
    } else {
        return 'https://lzy-fastapi.onrender.com';
    }
})();
console.log('API_BASE_URL:', API_BASE_URL);

let currentUser = null;

function switchTab(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    if (event) {
        event.target.classList.add('active');
    }
    
    if (tabId === 'users-tab') {
        loadUsers();
    } else if (tabId === 'photos-tab') {
        loadPhotos();
    } else if (tabId === 'thematic-tab') {
        loadThematicTables();
    }
}

function showMessage(message, type) {
    const messageElement = document.getElementById('message');
    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
    messageElement.style.display = 'block';
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 3000);
}

function getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function handleAuthError(response) {
    if (response.status === 401) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('username');
        showLoginForm();
        showMessage('登录已过期，请重新登录', 'error');
        return true;
    }
    return false;
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showUserInfo(username) {
    const userInfo = document.getElementById('userInfo');
    userInfo.innerHTML = `
        <p>当前用户: ${username}</p>
        <button class="btn btn-danger" onclick="logout()">退出登录</button>
    `;
    userInfo.style.display = 'block';
}

function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('username');
    currentUser = null;
    showLoginForm();
    showMessage('已退出登录', 'success');
}

function showLoginForm() {
    document.getElementById('adminSetupForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('navTabs').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
}

function showAdminPanel() {
    document.getElementById('adminSetupForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('navTabs').style.display = 'flex';
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('users-tab').classList.add('active');
    document.getElementById('photos-tab').classList.remove('active');
    document.getElementById('thematic-tab').classList.remove('active');
    
    requestAnimationFrame(() => {
        setTimeout(() => {
            loadUsers();
        }, 100);
    });
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const loginMsg = document.getElementById('loginMsg');
    
    if (!username || !password) {
        loginMsg.innerText = '请输入用户名和密码';
        loginMsg.style.color = 'red';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/login/json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            if (!data.is_admin) {
                loginMsg.innerText = '只有管理员可以登录此页面';
                loginMsg.style.color = 'red';
                return;
            }
            
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('username', username);
            currentUser = username;
            loginMsg.innerText = '登录成功';
            loginMsg.style.color = 'green';
            
            setTimeout(() => {
                showUserInfo(username);
                showAdminPanel();
            }, 1000);
        } else {
            loginMsg.innerText = data.detail || '登录失败';
            loginMsg.style.color = 'red';
        }
    } catch (error) {
        console.error('登录错误:', error);
        loginMsg.innerText = '网络错误: ' + error.message;
        loginMsg.style.color = 'red';
    }
}

async function checkUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/count`);
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        return data.count > 0;
    } catch (error) {
        throw error;
    }
}

async function validateAdminAccess(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${username}`);
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        return data.is_admin;
    } catch (error) {
        return false;
    }
}

async function createAdminAccount() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    if (!username || !password) {
        showMessage('请输入用户名和密码', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password,
                is_admin: true
            })
        });
        
        if (response.ok) {
            showMessage('管理员账号创建成功，请登录', 'success');
            document.getElementById('adminSetupForm').style.display = 'none';
            document.getElementById('loginForm').style.display = 'block';
        } else {
            const data = await response.json();
            showMessage('创建失败: ' + (data.detail || '未知错误'), 'error');
        }
    } catch (error) {
        showMessage('创建管理员账号失败: ' + error.message, 'error');
    }
}

async function loadDeviceTypes() {
    try {
        const response = await fetch('device.json');
        const data = await response.json();
        const selects = document.querySelectorAll('[id$="DeviceType"]');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">请选择</option>';
            data.devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = device.name;
                if (option.value === currentValue) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('加载设备类型失败:', error);
    }
}

async function loadProblemTypes() {
    try {
        const response = await fetch('problems.json');
        const data = await response.json();
        const selects = document.querySelectorAll('[id$="ProblemType"]');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">请选择</option>';
            data.problems.forEach(problem => {
                const option = document.createElement('option');
                option.value = problem.id;
                option.textContent = problem.name;
                if (option.value === currentValue) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('加载问题类型失败:', error);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadDeviceTypes();
    await loadProblemTypes();
    
    let hasUsers = false;
    let apiError = false;
    
    try {
        hasUsers = await checkUsers();
    } catch (error) {
        console.error('Error checking users:', error);
        apiError = true;
    }
    
    if (apiError) {
        showMessage('无法连接到服务器，请检查网络连接', 'error');
        showLoginForm();
    } else if (!hasUsers) {
        document.getElementById('adminSetupForm').style.display = 'block';
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('navTabs').style.display = 'none';
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
    } else {
        const token = localStorage.getItem('access_token');
        const username = localStorage.getItem('username');
        
        if (token && username) {
            let isAdmin = false;
            try {
                isAdmin = await validateAdminAccess(username);
            } catch (error) {
                console.error('Error validating admin:', error);
            }
            
            if (isAdmin) {
                currentUser = username;
                showUserInfo(username);
                showAdminPanel();
            } else {
                showLoginForm();
            }
        } else {
            showLoginForm();
        }
    }
});

window.addEventListener('click', (event) => {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});
