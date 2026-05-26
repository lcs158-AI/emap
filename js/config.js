// 配置相关的代码

// 动态设置API_BASE_URL
window.API_BASE_URL = (function() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    
    console.log('[Config] Hostname:', hostname, 'Protocol:', protocol, 'Port:', port);
    
    // 如果是 file:// 协议（直接打开本地文件），使用本地API
    if (protocol === 'file:') {
        console.log('[Config] File protocol detected, using local API');
        return 'http://localhost:8001';
    }
    
    // 如果是本地开发环境（localhost 或 127.0.0.1）
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('[Config] Using local API');
        return 'http://localhost:8001';
    }
    
    // 否则使用生产环境 API
    console.log('[Config] Using production API');
    return 'https://lzy-fastapi.onrender.com';
})();

console.log('[Config] API_BASE_URL:', window.API_BASE_URL);

function getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    if (token) {
        return {
            'Authorization': `Bearer ${token}`
        };
    }
    return {};
}
