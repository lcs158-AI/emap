// 配置相关的代码

// 动态设置API_BASE_URL
window.API_BASE_URL = (function() {
    // 检测当前环境
    const hostname = window.location.hostname;
    // 如果是本地开发环境
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8086'; // 本地开发测试
    } else {
        // 部署到Render的环境
        return 'https://lzy-fastapi.onrender.com'; // Render部署
    }
})();
console.log('API_BASE_URL:', window.API_BASE_URL);