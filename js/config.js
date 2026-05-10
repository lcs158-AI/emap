// 配置相关的代码

// 动态设置API_BASE_URL
window.API_BASE_URL = (function() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8086';
    } else {
        return 'https://lzy-fastapi.onrender.com';
    }
})();