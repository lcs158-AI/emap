// =====================================================
// 天地图地名搜索模块 (tianditu_search.js)
// 版本: v20261023
// API: https://api.tianditu.gov.cn/v2/search (POI 搜索)
// 数据覆盖: 中国地名 / 地标 / POI
// =====================================================
(function () {
    'use strict';

    // 获取天地图 key（从 HTML 全局变量）
    const TK = typeof TIANDITU_KEY !== 'undefined'
        ? TIANDITU_KEY
        : '4110bba1f23cd04ed33e43ab12a291fc';

    const RESULTS_MAX = 15;

    let searchTimer = null;      // 输入防抖
    let activeMarker = null;     // 当前选中的标记
    let activePopup = null;      // 当前选中的 popup

    // =====================================================
    // 1. 初始化入口
    // =====================================================
    function initTiandituSearch() {
        const panel = document.getElementById('tiandituSearchPanel');
        const input = document.getElementById('tiandituSearchInput');
        const results = document.getElementById('tiandituSearchResults');
        const closeBtn = document.getElementById('closeTiandituSearchBtn');
        const triggerBtn = document.getElementById('tiandituSearchBtn');

        if (!panel || !input || !results) {
            console.warn('tianditu_search: 面板元素未就绪');
            return false;
        }

        // 触发按钮（天气下拉里的 🗺️ 地名搜索）
        if (triggerBtn) {
            triggerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel(panel, input);
            });
        }

        // 关闭按钮
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
                clearActiveMarker();
            });
        }

        // 输入框 - 防抖搜索
        input.addEventListener('input', () => {
            const q = input.value.trim();
            if (searchTimer) clearTimeout(searchTimer);
            if (q.length < 1) {
                results.innerHTML = '';
                return;
            }
            searchTimer = setTimeout(() => doSearch(q, results), 350);
        });

        // 回车直接搜索
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const q = input.value.trim();
                if (q) doSearch(q, results);
            }
            if (e.key === 'Escape') {
                panel.style.display = 'none';
                clearActiveMarker();
            }
        });

        // 点击面板外部不关闭（不影响输入体验）
        console.log('✅ tianditu_search 已初始化');
        return true;
    }

    function togglePanel(panel, input) {
        if (panel.style.display === 'none' || !panel.style.display) {
            // 关闭其他可能打开的下拉
            document.querySelectorAll('#weatherDropdown, .dropdown-menu').forEach(d => {
                if (d !== panel) d.style.display = 'none';
            });
            panel.style.display = 'block';
            setTimeout(() => input && input.focus(), 50);
        } else {
            panel.style.display = 'none';
            clearActiveMarker();
        }
    }

    // =====================================================
    // 2. 调用天地图 POI 搜索 API
    // =====================================================
    async function doSearch(keyword, resultsEl) {
        if (!window.map) return;
        resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:#999;font-size:12px;">🔍 搜索中...</div>`;

        try {
            const postStr = JSON.stringify({
                keyWord: keyword,
                level: 12,
                queryType: 1,      // 1 = 普通搜索，返回城市/地名/POI
                count: RESULTS_MAX,
                start: 0
            });

            const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(postStr)}&type=queryPoi&tk=${TK}`;

            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();

            if (data.status === '0' && data.pois && data.pois.length > 0) {
                renderResults(data.pois, resultsEl);
            } else {
                resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:#999;font-size:12px;">😕 未找到 "${keyword}"<br>请换关键词试试</div>`;
            }
        } catch (err) {
            console.warn('天地图搜索失败:', err.message);
            // fallback: 地理编码接口
            try {
                await fallbackGeocoder(keyword, resultsEl);
            } catch (err2) {
                resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:#c00;font-size:12px;">❌ 搜索服务不可用<br>${err.message}</div>`;
            }
        }
    }

    // 备用：地理编码接口（比 v2/search 老，但有时更稳定）
    async function fallbackGeocoder(keyword, resultsEl) {
        resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:#999;font-size:12px;">🔄 尝试备用接口...</div>`;
        const url = `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(keyword)}&tk=${TK}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.status === '0' && data.result && data.result.location) {
            const loc = data.result.location;
            renderResults([{
                name: data.result.formatted_address || keyword,
                address: data.result.formatted_address || '',
                lonlat: `${loc.lon},${loc.lat}`,
                typeName: '地理编码'
            }], resultsEl);
        } else {
            throw new Error('geocoder no result');
        }
    }

    // =====================================================
    // 3. 渲染搜索结果
    // =====================================================
    function renderResults(pois, resultsEl) {
        if (!pois || pois.length === 0) {
            resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:#999;font-size:12px;">😕 未找到结果</div>`;
            return;
        }

        const frag = document.createDocumentFragment();
        pois.forEach((poi, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:8px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background 0.15s;';

            const type = poi.typeName || '';
            const address = poi.address || '';

            row.innerHTML = `
                <div style="font-size:13px;color:#333;font-weight:500;">${escapeHtml(poi.name)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">
                    ${address ? escapeHtml(address) : ''}
                    ${type ? `<span style="color:#bbb;margin-left:4px;">· ${escapeHtml(type.split('|')[0])}</span>` : ''}
                </div>
            `;

            row.addEventListener('mouseenter', () => { row.style.background = '#f0f7ff'; });
            row.addEventListener('mouseleave', () => { row.style.background = ''; });
            row.addEventListener('click', () => selectPoi(poi));

            frag.appendChild(row);
        });

        resultsEl.innerHTML = '';
        resultsEl.appendChild(frag);
    }

    // =====================================================
    // 4. 选中 POI → flyTo + 标记
    // =====================================================
    function selectPoi(poi) {
        if (!window.map) return;
        const parts = poi.lonlat.split(',');
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (isNaN(lon) || isNaN(lat)) return;

        // 清除旧标记
        clearActiveMarker();

        // 添加新标记
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            name: poi.name,
            address: poi.address || '',
            typeName: poi.typeName || ''
        });

        feature.setStyle(new ol.style.Style({
            image: new ol.style.Icon({
                src: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
                        <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#e74c3c" stroke="#fff" stroke-width="2"/>
                        <circle cx="14" cy="14" r="5" fill="#fff"/>
                    </svg>
                `),
                anchor: [0.5, 1],
                scale: 0.8
            })
        }));

        const vectorSrc = new ol.source.Vector({ features: [feature] });
        const layer = new ol.layer.Vector({
            source: vectorSrc,
            style: feature.getStyle(),
            zIndex: 9999
        });
        map.addLayer(layer);

        activeMarker = { layer, source: vectorSrc };

        // Popup 显示详情
        showPopup(poi, lon, lat);

        // flyTo
        const view = map.getView();
        const center = ol.proj.fromLonLat([lon, lat]);
        view.animate({
            center: center,
            zoom: Math.max(view.getZoom() || 10, 13),
            duration: 1000
        });

        // 搜索面板可以保留让用户继续搜，也可以收起
    }

    function showPopup(poi, lon, lat) {
        // 先移除旧的
        if (activePopup) {
            map.removeOverlay(activePopup);
            activePopup = null;
        }

        const el = document.createElement('div');
        el.style.cssText = 'background:white;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.2);padding:10px 14px;min-width:180px;max-width:260px;font-size:12px;';
        el.innerHTML = `
            <div style="font-size:14px;font-weight:bold;color:#c0392b;margin-bottom:4px;">📍 ${escapeHtml(poi.name)}</div>
            ${poi.address ? `<div style="color:#666;margin-bottom:2px;">${escapeHtml(poi.address)}</div>` : ''}
            <div style="color:#999;">经度: ${lon.toFixed(5)} / 纬度: ${lat.toFixed(5)}</div>
            <div style="margin-top:6px;text-align:right;">
                <button id="tiandituClosePopup" style="background:#f0f0f0;border:none;border-radius:3px;padding:3px 10px;font-size:11px;cursor:pointer;">关闭</button>
            </div>
        `;
        document.body.appendChild(el);

        const overlay = new ol.Overlay({
            element: el,
            positioning: 'bottom-center',
            offset: [0, -32],
            autoPan: true
        });
        overlay.setPosition(ol.proj.fromLonLat([lon, lat]));
        map.addOverlay(overlay);
        activePopup = overlay;

        // 关闭按钮
        setTimeout(() => {
            const close = document.getElementById('tiandituClosePopup');
            if (close) close.addEventListener('click', () => {
                map.removeOverlay(overlay);
                activePopup = null;
            });
        }, 10);

        // 自动 8 秒后淡出
        setTimeout(() => {
            if (activePopup === overlay) {
                map.removeOverlay(overlay);
                activePopup = null;
            }
        }, 8000);
    }

    function clearActiveMarker() {
        if (activeMarker && window.map) {
            map.removeLayer(activeMarker.layer);
            activeMarker = null;
        }
        if (activePopup && window.map) {
            map.removeOverlay(activePopup);
            activePopup = null;
        }
    }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // =====================================================
    // 5. 启动
    // =====================================================
    function boot() {
        // 等 map 就绪（OpenLayers 的 map 在 map.js 末尾初始化）
        if (!window.map) {
            setTimeout(boot, 200);
            return;
        }
        initTiandituSearch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
