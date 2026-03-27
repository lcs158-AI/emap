// ==================== 通用工具函数 ====================
// 格式化长度显示
function formatLength(length) {
    return length >= 1000 ? (length/1000).toFixed(2) + ' 千米' : length.toFixed(1) + ' 米';
}

// 格式化面积显示
function formatArea(area) {
    if (area >= 1000000) return (area/1000000).toFixed(2) + ' 平方公里';
    if (area >= 10000) return (area/10000).toFixed(2) + ' 公顷';
    return area.toFixed(1) + ' 平方米';
}

// 获取本地日期的 YYYYMMDD 格式（避免 UTC 偏差）
function getLocalDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

