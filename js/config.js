// 配置相关的代码

// 强制使用本地 API 进行开发（取消下面这行的注释来强制使用本地 API）
window.FORCE_LOCAL_API = true;

// 动态设置API_BASE_URL
window.API_BASE_URL = (function() {
    if (window.FORCE_LOCAL_API) {
        console.log('[Config] Forcing local API');
        return 'http://localhost:8082';
    }
    
    const hostname = window.location.hostname;
    console.log('[Config] Hostname:', hostname);
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('[Config] Using local API');
        return 'http://localhost:8082';
    } else {
        console.log('[Config] Using production API');
        return 'https://lzy-fastapi.onrender.com';
    }
})();

console.log('[Config] API_BASE_URL:', window.API_BASE_URL);
