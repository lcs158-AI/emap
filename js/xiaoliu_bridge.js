(function () {
    'use strict';

    const bridgeLayers = new Map();
    const localLayers = window.localGeoJsonLayers;

    function errorResult(error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    function normalizeId(id) {
        if (id === undefined || id === null || String(id).trim() === '') {
            throw new Error('图层 id 不能为空');
        }
        return String(id);
    }

    function getEntry(id) {
        const entry = bridgeLayers.get(id);
        if (!entry) return null;
        const item = localLayers.find(localItem => localItem.layer === entry.layer);
        if (!item) {
            bridgeLayers.delete(id);
            return null;
        }
        entry.item = item;
        return entry;
    }

    function requireEntry(id) {
        const entry = getEntry(id);
        if (!entry) throw new Error('小刘图层不存在: ' + id);
        return entry;
    }

    function refreshLayerPanel() {
        if (typeof window.createLayerControl === 'function') {
            window.createLayerControl();
        }
    }

    function removeEntry(id, refresh) {
        const entry = getEntry(id);
        if (!entry) return false;
        window.map.removeLayer(entry.layer);
        const index = localLayers.findIndex(item => item.layer === entry.layer);
        if (index !== -1) localLayers.splice(index, 1);
        bridgeLayers.delete(id);
        if (refresh) refreshLayerPanel();
        return true;
    }

    function normalizeColor(color) {
        if (typeof color !== 'string' || !color.trim()) {
            throw new Error('图层颜色不能为空');
        }
        const value = color.trim();
        try {
            const rgba = window.ol.color.asArray(value);
            return '#' + rgba.slice(0, 3).map(channel => {
                return Math.round(channel).toString(16).padStart(2, '0');
            }).join('');
        } catch (error) {
            throw new Error('无效的图层颜色: ' + value);
        }
    }

    function updateColor(entry, color) {
        const normalized = normalizeColor(color);
        const style = entry.item.style || (entry.item.style = {});
        style.pointColor = normalized;
        style.lineColor = normalized;
        style.fillColor = normalized;
        style.strokeColor = normalized;
        entry.item.color = normalized;
        entry.layer.set('color', normalized);
        window.applyLayerStyle(entry.layer, style);
        return normalized;
    }

    function updateLabelField(entry, field) {
        const labelField = field === undefined || field === null ? '' : String(field);
        const style = entry.item.style || (entry.item.style = {});
        entry.item.labelField = labelField;
        entry.layer.set('labelField', labelField);
        style.labelField = labelField;
        style.labelVisible = labelField !== '';
        entry.layer.getSource().getFeatures().forEach(feature => {
            const layerInfo = feature.get('layer') || {};
            feature.set('layer', Object.assign({}, layerInfo, { labelField: labelField }));
        });
        window.applyLayerStyle(entry.layer, style);
        return labelField;
    }

    function addLayer(options) {
        let id;
        try {
            if (!options || typeof options !== 'object') {
                throw new Error('addLayer 参数不能为空');
            }
            id = normalizeId(options.id);
            removeEntry(id, false);

            const geojson = typeof options.geojson === 'string'
                ? JSON.parse(options.geojson)
                : options.geojson;
            if (!geojson) throw new Error('geojson 不能为空');

            const name = options.name === undefined || options.name === null || options.name === ''
                ? id
                : String(options.name);
            const layer = window.loadLocalGeoJSON(geojson, name, {
                fileName: name + '.geojson',
                format: 'geojson',
                autoFit: options.fit !== false
            });
            const item = localLayers.find(localItem => localItem.layer === layer);
            if (!item) throw new Error('本地图层登记失败');

            item.id = id;
            item.xiaoliuLayer = true;
            layer.set('id', id);
            layer.set('xiaoliuLayer', true);
            const entry = { id: id, layer: layer, item: item };
            bridgeLayers.set(id, entry);

            if (options.color !== undefined && options.color !== null && options.color !== '') {
                updateColor(entry, options.color);
            }
            if (options.labelField !== undefined && options.labelField !== null && options.labelField !== '') {
                updateLabelField(entry, options.labelField);
            }
            refreshLayerPanel();
            return { ok: true, id: id, count: layer.getSource().getFeatures().length };
        } catch (error) {
            if (id && bridgeLayers.has(id)) removeEntry(id, true);
            return errorResult(error);
        }
    }

    function removeLayer(id) {
        try {
            const normalizedId = normalizeId(id);
            if (!removeEntry(normalizedId, true)) {
                throw new Error('小刘图层不存在: ' + normalizedId);
            }
            return { ok: true, id: normalizedId };
        } catch (error) {
            return errorResult(error);
        }
    }

    function toggleLayer(id, visible) {
        try {
            const normalizedId = normalizeId(id);
            const entry = requireEntry(normalizedId);
            const nextVisible = visible === undefined ? !entry.layer.getVisible() : Boolean(visible);
            entry.layer.setVisible(nextVisible);
            entry.item.visible = nextVisible;
            refreshLayerPanel();
            return { ok: true, id: normalizedId, visible: nextVisible };
        } catch (error) {
            return errorResult(error);
        }
    }

    function setLayerColor(id, color) {
        try {
            const normalizedId = normalizeId(id);
            const entry = requireEntry(normalizedId);
            const normalizedColor = updateColor(entry, color);
            refreshLayerPanel();
            return { ok: true, id: normalizedId, color: normalizedColor };
        } catch (error) {
            return errorResult(error);
        }
    }

    function setLabelField(id, field) {
        try {
            const normalizedId = normalizeId(id);
            const entry = requireEntry(normalizedId);
            const labelField = updateLabelField(entry, field);
            refreshLayerPanel();
            return { ok: true, id: normalizedId, labelField: labelField };
        } catch (error) {
            return errorResult(error);
        }
    }

    function setLabelVisible(id, visible) {
        try {
            const normalizedId = normalizeId(id);
            const entry = requireEntry(normalizedId);
            const labelField = entry.item.labelField || entry.layer.get('labelField') || '';
            if (!labelField) {
                throw new Error('请先设置标签字段');
            }
            const style = entry.item.style || (entry.item.style = {});
            style.labelField = labelField;
            style.labelVisible = Boolean(visible);
            window.applyLayerStyle(entry.layer, style);
            refreshLayerPanel();
            return { ok: true, id: normalizedId, labelVisible: style.labelVisible };
        } catch (error) {
            return errorResult(error);
        }
    }

    function fit(id) {
        try {
            if (id !== undefined && id !== null) {
                const normalizedId = normalizeId(id);
                const entry = requireEntry(normalizedId);
                if (!window.zoomToLayerExtent(entry.layer)) {
                    throw new Error('图层没有可定位的几何');
                }
                return { ok: true, id: normalizedId };
            }

            const extent = window.ol.extent.createEmpty();
            let hasLayer = false;
            Array.from(bridgeLayers.keys()).forEach(key => {
                const entry = getEntry(key);
                if (!entry) return;
                hasLayer = true;
                entry.layer.getSource().getFeatures().forEach(feature => {
                    const geometry = feature.getGeometry();
                    if (geometry) window.ol.extent.extend(extent, geometry.getExtent());
                });
            });
            if (!hasLayer) throw new Error('没有小刘图层');
            if (window.ol.extent.isEmpty(extent)) throw new Error('图层没有可定位的几何');

            const width = window.ol.extent.getWidth(extent);
            const height = window.ol.extent.getHeight(extent);
            const fitExtent = width > 0 && height > 0
                ? window.ol.extent.buffer(extent, width * 0.1)
                : extent;
            window.map.getView().fit(fitExtent, {
                padding: [50, 50, 50, 50],
                duration: 500,
                maxZoom: 18
            });
            return { ok: true, id: null };
        } catch (error) {
            return errorResult(error);
        }
    }

    function clear() {
        let count = 0;
        Array.from(bridgeLayers.keys()).forEach(id => {
            if (removeEntry(id, false)) count++;
        });
        refreshLayerPanel();
        return { ok: true, count: count };
    }

    function listLayers() {
        const result = [];
        Array.from(bridgeLayers.keys()).forEach(id => {
            const entry = getEntry(id);
            if (!entry) return;
            result.push({
                id: id,
                name: entry.item.name,
                visible: entry.layer.getVisible(),
                count: entry.layer.getSource().getFeatures().length,
                color: entry.item.color || entry.layer.get('color') || null,
                labelField: entry.item.labelField || entry.layer.get('labelField') || ''
            });
        });
        return result;
    }

    window.XiaoLiuMap = {
        addLayer: addLayer,
        removeLayer: removeLayer,
        toggleLayer: toggleLayer,
        setLayerColor: setLayerColor,
        setLabelField: setLabelField,
        setLabelVisible: setLabelVisible,
        fit: fit,
        clear: clear,
        listLayers: listLayers
    };
    window.XiaoLiuMapReady = true;
    window.dispatchEvent(new CustomEvent('xiaoliu-map-ready'));
})();
