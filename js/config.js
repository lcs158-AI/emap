// 配置相关的代码

// 动态设置API_BASE_URL
window.API_BASE_URL = (function() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    
    console.log('[Config] Hostname:', hostname, 'Protocol:', protocol, 'Port:', port);
    
    // 如果是本地开发环境（localhost 或 127.0.0.1）
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('[Config] Using local API');
        return 'http://localhost:8082';
    }
    
    // 如果是通过我们自己的 FastAPI 服务器访问的（端口 8082）
    if (port === '8082') {
        console.log('[Config] Using same-origin API');
        return `${protocol}//${hostname}:${port}`;
    }
    
    // 否则使用生产环境 API
    console.log('[Config] Using production API');
    return 'https://lzy-fastapi.onrender.com';
})();

console.log('[Config] API_BASE_URL:', window.API_BASE_URL);
