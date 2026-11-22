/*
 * 跬步 · 三维用海共享数据层
 * 由 Cesium 版（global/sea_use.js）与 Three.js 版（sea3d/js/sea3d.js）共同使用。
 * 约定：bottom / top / z 均为高程（米），负值表示水下；不换算水深。
 */
(function (global) {
    'use strict';

    var DEFAULT_DEMO_URL = '../data/sea_use/demo.geojson';
    var DEFAULT_PRISM_BOTTOM = -10;
    var DEFAULT_PRISM_TOP = 0;
    var DEFAULT_PIPE_WIDTH = 4;

    var PALETTE = [
        '#2e7dd1', '#1fae8a', '#f0a53e', '#c45ad0',
        '#5aa9e6', '#e2685c', '#7bc86c', '#d4b04c'
    ];

    // ---------- 基础工具 ----------

    function toNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return isFinite(value) ? value : null;
        if (typeof value === 'string') {
            var text = value.trim().replace(/,/g, '');
            if (!text) return null;
            var num = Number(text);
            return isFinite(num) ? num : null;
        }
        return null;
    }

    function firstNumber(props, keys) {
        for (var i = 0; i < keys.length; i++) {
            var value = toNumber(props[keys[i]]);
            if (value !== null) return value;
        }
        return null;
    }

    function firstText(props, keys) {
        for (var i = 0; i < keys.length; i++) {
            var value = props[keys[i]];
            if (value === null || value === undefined) continue;
            var text = String(value).trim();
            if (text) return text;
        }
        return '';
    }

    function isHexColor(text) {
        return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text);
    }

    // KML 常见 aabbggrr 颜色（8 位），转换后按 #rrggbb 使用
    function fromKmlHex(text) {
        if (!/^[0-9a-f]{8}$/i.test(text)) return null;
        var bb = text.slice(2, 4);
        var gg = text.slice(4, 6);
        var rr = text.slice(6, 8);
        return '#' + rr + gg + bb;
    }

    function isCssColor(text) {
        if (/^(rgb|rgba|hsl|hsla)\(/i.test(text)) return true;
        if (/^[a-z]{3,20}$/i.test(text)) return true;
        if (global.CSS && typeof global.CSS.supports === 'function') {
            try { return global.CSS.supports('color', text); } catch (err) { return false; }
        }
        return false;
    }

    function pickColor(value, index, label, warnings) {
        var text = value === null || value === undefined ? '' : String(value).trim();
        if (text) {
            var kmlHex = fromKmlHex(text);
            if (kmlHex) return kmlHex;
            if (isHexColor(text)) return text;
            if (isCssColor(text)) return text;
            warnings.push(label + ' 颜色「' + text + '」无法识别，已使用默认配色');
        }
        return PALETTE[index % PALETTE.length];
    }

    function isLonLat(lon, lat) {
        return lon !== null && lat !== null &&
            lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
    }

    function samePoint(a, b) {
        return a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    }

    function readProps(props) {
        props = props || {};
        return {
            name: firstText(props, ['name', '名称', 'NAME', 'Name']),
            bottom: firstNumber(props, ['bottom', 'bottomHeight', '底高']),
            top: firstNumber(props, ['top', 'topHeight', '顶高']),
            elevation: firstNumber(props, ['elevation', 'height', '高程']),
            color: firstText(props, ['color', 'fill', 'stroke', '颜色']),
            width: firstNumber(props, ['width', '线宽'])
        };
    }

    // ---------- 模型构建 ----------

    function buildPrism(info, points, coordHeight, index, label, warnings) {
        var bottom = info.bottom;
        var top = info.top;

        if (top === null && info.elevation !== null) top = info.elevation;

        if (bottom === null && top === null) {
            if (coordHeight !== null) {
                top = coordHeight;
                bottom = 0;
            } else {
                bottom = DEFAULT_PRISM_BOTTOM;
                top = DEFAULT_PRISM_TOP;
                warnings.push(label + ' 缺少高程，已按底高 ' + bottom + ' 米 / 顶高 ' + top + ' 米显示');
            }
        } else if (bottom === null) {
            bottom = 0;
        } else if (top === null) {
            top = coordHeight !== null ? coordHeight : 0;
        }

        if (top < bottom) {
            warnings.push(label + ' 顶高 ' + top + ' 米小于底高 ' + bottom + ' 米，已自动交换');
            var swap = top;
            top = bottom;
            bottom = swap;
        }

        return {
            id: 'prism-' + (index + 1),
            name: info.name || (label + ' ' + (index + 1)),
            points: points,
            bottom: bottom,
            top: top,
            color: info.color
        };
    }

    function buildPipeline(info, nodes, index, label, warnings) {
        var width = info.width === null ? DEFAULT_PIPE_WIDTH : Math.max(0.5, info.width);
        return {
            id: 'pipe-' + (index + 1),
            name: info.name || (label + ' ' + (index + 1)),
            nodes: nodes,
            color: info.color,
            width: width
        };
    }

    function computeExtent(prisms, pipelines) {
        var west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
        var minHeight = Infinity, maxHeight = -Infinity;

        function addPoint(lon, lat) {
            if (lon < west) west = lon;
            if (lon > east) east = lon;
            if (lat < south) south = lat;
            if (lat > north) north = lat;
        }

        prisms.forEach(function (prism) {
            prism.points.forEach(function (point) { addPoint(point[0], point[1]); });
            if (prism.bottom < minHeight) minHeight = prism.bottom;
            if (prism.top > maxHeight) maxHeight = prism.top;
        });

        pipelines.forEach(function (pipe) {
            pipe.nodes.forEach(function (node) {
                addPoint(node.lon, node.lat);
                if (node.z < minHeight) minHeight = node.z;
                if (node.z > maxHeight) maxHeight = node.z;
            });
        });

        if (!isFinite(west)) return null;
        if (!isFinite(minHeight)) minHeight = 0;
        if (!isFinite(maxHeight)) maxHeight = 0;

        return {
            west: west, south: south, east: east, north: north,
            minHeight: minHeight, maxHeight: maxHeight
        };
    }

    // ---------- GeoJSON ----------

    function parseGeoJSON(input) {
        var warnings = [];
        var obj = input;

        if (typeof input === 'string') {
            try {
                obj = JSON.parse(input);
            } catch (err) {
                throw new Error('GeoJSON 解析失败：内容不是合法的 JSON');
            }
        }
        if (!obj || typeof obj !== 'object') {
            throw new Error('GeoJSON 解析失败：内容为空或格式不正确');
        }

        var prisms = [];
        var pipelines = [];

        function handleGeometry(geometry, props, labelPrefix) {
            if (!geometry || typeof geometry !== 'object') return;
            var type = geometry.type;
            var coords = geometry.coordinates;

            if (type === 'GeometryCollection') {
                (geometry.geometries || []).forEach(function (child) {
                    handleGeometry(child, props, labelPrefix);
                });
                return;
            }

            if (type === 'Polygon' || type === 'MultiPolygon') {
                var polygons = type === 'Polygon' ? [coords] : coords;
                if (!Array.isArray(polygons) || !polygons.length) {
                    warnings.push(labelPrefix + ' 多边形坐标为空，已跳过');
                    return;
                }
                polygons.forEach(function (rings) {
                    if (!Array.isArray(rings) || !rings.length) {
                        warnings.push(labelPrefix + ' 多边形坐标为空，已跳过');
                        return;
                    }
                    var info = readProps(props);
                    var ring = rings[0];
                    var points = [];
                    var coordHeight = null;

                    ring.forEach(function (coord) {
                        if (!Array.isArray(coord) || coord.length < 2) return;
                        var lon = toNumber(coord[0]);
                        var lat = toNumber(coord[1]);
                        if (!isLonLat(lon, lat)) return;
                        points.push([lon, lat]);
                        if (coordHeight === null) {
                            var z = toNumber(coord[2]);
                            if (z !== null) coordHeight = z;
                        }
                    });

                    if (points.length > 1 && samePoint(points[0], points[points.length - 1])) {
                        points.pop();
                    }
                    if (points.length < 3) {
                        warnings.push(labelPrefix + ' 有效顶点少于 3 个，已跳过该多边形');
                        return;
                    }
                    if (rings.length > 1) {
                        warnings.push(labelPrefix + ' 多边形含空洞，空洞已忽略');
                    }

                    info.color = pickColor(info.color, prisms.length, info.name || labelPrefix, warnings);
                    prisms.push(buildPrism(info, points, coordHeight, prisms.length, '棱体', warnings));
                });
                return;
            }

            if (type === 'LineString' || type === 'MultiLineString') {
                var lines = type === 'LineString' ? [coords] : coords;
                if (!Array.isArray(lines) || !lines.length) {
                    warnings.push(labelPrefix + ' 线坐标为空，已跳过');
                    return;
                }
                lines.forEach(function (line) {
                    if (!Array.isArray(line)) return;
                    var info = readProps(props);
                    var nodes = [];
                    var missingHeight = false;

                    line.forEach(function (coord) {
                        if (!Array.isArray(coord) || coord.length < 2) return;
                        var lon = toNumber(coord[0]);
                        var lat = toNumber(coord[1]);
                        if (!isLonLat(lon, lat)) return;
                        var z = toNumber(coord[2]);
                        if (z === null && info.elevation !== null) z = info.elevation;
                        if (z === null) {
                            z = 0;
                            missingHeight = true;
                        }
                        nodes.push({ lon: lon, lat: lat, z: z });
                    });

                    if (nodes.length < 2) {
                        warnings.push(labelPrefix + ' 管线有效节点少于 2 个，已跳过');
                        return;
                    }
                    if (missingHeight) {
                        warnings.push((info.name || labelPrefix) + ' 部分节点缺少高程，已按 0 米显示');
                    }

                    info.color = pickColor(info.color, pipelines.length + prisms.length, info.name || labelPrefix, warnings);
                    pipelines.push(buildPipeline(info, nodes, pipelines.length, '管线', warnings));
                });
                return;
            }

            warnings.push(labelPrefix + ' 不支持的地理类型「' + type + '」，已跳过');
        }

        function handleFeature(feature) {
            if (!feature || typeof feature !== 'object') return;
            var type = feature.type;
            var props = feature.properties || {};

            if (type === 'FeatureCollection') {
                (feature.features || []).forEach(handleFeature);
                return;
            }
            if (type === 'Feature') {
                var label = firstText(props, ['name', '名称']) || '要素';
                if (feature.geometry) handleGeometry(feature.geometry, props, label);
                return;
            }
            if (type === 'GeometryCollection' || feature.coordinates) {
                handleGeometry(feature, {}, '要素');
                return;
            }
            warnings.push('无法识别的 GeoJSON 对象，已跳过');
        }

        handleFeature(obj);

        return normalize({ prisms: prisms, pipelines: pipelines, warnings: warnings });
    }

    // ---------- KML ----------

    function walkElements(node, localName, out) {
        out = out || [];
        var children = node && node.childNodes ? node.childNodes : [];
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.nodeType !== 1) continue;
            var name = child.localName || String(child.nodeName).replace(/^.*:/, '');
            if (name === localName) out.push(child);
            walkElements(child, localName, out);
        }
        return out;
    }

    function directChild(node, localName) {
        var children = node && node.childNodes ? node.childNodes : [];
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.nodeType !== 1) continue;
            var name = child.localName || String(child.nodeName).replace(/^.*:/, '');
            if (name === localName) return child;
        }
        return null;
    }

    function parseKmlCoordinates(text) {
        var coords = [];
        String(text || '').trim().split(/\s+/).forEach(function (part) {
            if (!part) return;
            var pieces = part.split(',');
            if (pieces.length < 2) return;
            coords.push([Number(pieces[0]), Number(pieces[1]), pieces.length > 2 ? Number(pieces[2]) : null]);
        });
        return coords;
    }

    function readKmlProps(placemark) {
        var props = {};
        var dataNodes = walkElements(placemark, 'Data', []);
        dataNodes.forEach(function (data) {
            var key = data.getAttribute('name');
            if (!key) return;
            var valueNode = walkElements(data, 'value', [])[0];
            if (valueNode) props[key] = String(valueNode.textContent || '').trim();
        });
        walkElements(placemark, 'SimpleData', []).forEach(function (data) {
            var key = data.getAttribute('name');
            if (key) props[key] = String(data.textContent || '').trim();
        });
        var nameNode = directChild(placemark, 'name');
        if (nameNode) props.name = String(nameNode.textContent || '').trim();
        return props;
    }

    function parseKML(text) {
        var warnings = [];
        if (!global.DOMParser) throw new Error('当前浏览器不支持 KML 解析');

        var doc = new global.DOMParser().parseFromString(String(text || ''), 'text/xml');
        var parseError = walkElements(doc, 'parsererror', [])[0];
        if (parseError) throw new Error('KML 解析失败：XML 格式不正确');

        var prisms = [];
        var pipelines = [];
        var placemarks = walkElements(doc, 'Placemark', []);

        placemarks.forEach(function (placemark) {
            var props = readKmlProps(placemark);
            var label = firstText(props, ['name', '名称']) || '要素';
            var info = readProps(props);

            var polygons = walkElements(placemark, 'Polygon', []);
            polygons.forEach(function (polygon) {
                var rings = walkElements(polygon, 'LinearRing', []);
                if (!rings.length) {
                    warnings.push(label + ' 缺少多边形边界，已跳过');
                    return;
                }
                var coordNode = walkElements(rings[0], 'coordinates', [])[0];
                var coords = coordNode ? parseKmlCoordinates(coordNode.textContent) : [];
                var points = [];
                var coordHeight = null;

                coords.forEach(function (coord) {
                    var lon = toNumber(coord[0]);
                    var lat = toNumber(coord[1]);
                    if (!isLonLat(lon, lat)) return;
                    points.push([lon, lat]);
                    if (coordHeight === null) {
                        var z = toNumber(coord[2]);
                        if (z !== null) coordHeight = z;
                    }
                });

                if (points.length > 1 && samePoint(points[0], points[points.length - 1])) {
                    points.pop();
                }
                if (points.length < 3) {
                    warnings.push(label + ' 有效顶点少于 3 个，已跳过');
                    return;
                }
                if (rings.length > 1) {
                    warnings.push(label + ' 多边形含空洞，空洞已忽略');
                }

                var prismInfo = {
                    name: info.name,
                    bottom: info.bottom,
                    top: info.top,
                    elevation: info.elevation,
                    color: pickColor(info.color, prisms.length, label, warnings)
                };
                prisms.push(buildPrism(prismInfo, points, coordHeight, prisms.length, '棱体', warnings));
            });

            var lines = walkElements(placemark, 'LineString', []);
            lines.forEach(function (line) {
                var coordNode = walkElements(line, 'coordinates', [])[0];
                var coords = coordNode ? parseKmlCoordinates(coordNode.textContent) : [];
                var nodes = [];
                var missingHeight = false;

                coords.forEach(function (coord) {
                    var lon = toNumber(coord[0]);
                    var lat = toNumber(coord[1]);
                    if (!isLonLat(lon, lat)) return;
                    var z = toNumber(coord[2]);
                    if (z === null && info.elevation !== null) z = info.elevation;
                    if (z === null) {
                        z = 0;
                        missingHeight = true;
                    }
                    nodes.push({ lon: lon, lat: lat, z: z });
                });

                if (nodes.length < 2) {
                    warnings.push(label + ' 管线有效节点少于 2 个，已跳过');
                    return;
                }
                if (missingHeight) {
                    warnings.push(label + ' 部分节点缺少高程，已按 0 米显示');
                }

                var pipeInfo = {
                    name: info.name,
                    color: pickColor(info.color, pipelines.length + prisms.length, label, warnings),
                    width: info.width
                };
                pipelines.push(buildPipeline(pipeInfo, nodes, pipelines.length, '管线', warnings));
            });
        });

        return normalize({ prisms: prisms, pipelines: pipelines, warnings: warnings });
    }

    // ---------- 规范化 ----------

    function normalize(model) {
        var warnings = Array.isArray(model && model.warnings) ? model.warnings.slice() : [];
        var prisms = [];
        var pipelines = [];

        ((model && model.prisms) || []).forEach(function (prism) {
            if (!prism || !Array.isArray(prism.points) || prism.points.length < 3) {
                warnings.push('发现无效棱体，已跳过');
                return;
            }
            var bottom = toNumber(prism.bottom);
            var top = toNumber(prism.top);
            if (bottom === null || top === null) {
                warnings.push('棱体「' + (prism.name || prism.id) + '」底高/顶高无法解析，已跳过');
                return;
            }
            if (top < bottom) {
                warnings.push('棱体「' + (prism.name || prism.id) + '」顶高小于底高，已自动交换');
                var swap = top;
                top = bottom;
                bottom = swap;
            }
            var points = prism.points
                .map(function (point) {
                    var lon = toNumber(point[0]);
                    var lat = toNumber(point[1]);
                    return isLonLat(lon, lat) ? [lon, lat] : null;
                })
                .filter(Boolean);

            if (points.length < 3) {
                warnings.push('棱体「' + (prism.name || prism.id) + '」有效顶点少于 3 个，已跳过');
                return;
            }

            prisms.push({
                id: prism.id || ('prism-' + (prisms.length + 1)),
                name: String(prism.name || ('棱体 ' + (prisms.length + 1))),
                points: points,
                bottom: bottom,
                top: top,
                color: pickColor(prism.color, prisms.length, prism.name || '棱体', warnings)
            });
        });

        ((model && model.pipelines) || []).forEach(function (pipe) {
            if (!pipe || !Array.isArray(pipe.nodes) || pipe.nodes.length < 2) {
                warnings.push('发现节点不足 2 个的管线，已跳过');
                return;
            }
            var nodes = [];
            var missingHeight = false;

            pipe.nodes.forEach(function (node) {
                if (!node) return;
                var lon = toNumber(node.lon);
                var lat = toNumber(node.lat);
                if (!isLonLat(lon, lat)) return;
                var z = toNumber(node.z);
                if (z === null) {
                    z = 0;
                    missingHeight = true;
                }
                nodes.push({ lon: lon, lat: lat, z: z });
            });

            if (nodes.length < 2) {
                warnings.push('管线「' + (pipe.name || pipe.id) + '」有效节点少于 2 个，已跳过');
                return;
            }
            if (missingHeight) {
                warnings.push('管线「' + (pipe.name || pipe.id) + '」部分节点缺少高程，已按 0 米显示');
            }

            var width = toNumber(pipe.width);
            pipelines.push({
                id: pipe.id || ('pipe-' + (pipelines.length + 1)),
                name: String(pipe.name || ('管线 ' + (pipelines.length + 1))),
                nodes: nodes,
                color: pickColor(pipe.color, pipelines.length + prisms.length, pipe.name || '管线', warnings),
                width: width === null ? DEFAULT_PIPE_WIDTH : Math.max(0.5, width)
            });
        });

        return {
            prisms: prisms,
            pipelines: pipelines,
            extent: computeExtent(prisms, pipelines),
            warnings: warnings
        };
    }

    // ---------- 对外接口 ----------

    function parseText(text, fileName) {
        var name = String(fileName || '').toLowerCase();
        var content = String(text || '').trim();
        if (!content) throw new Error('文件内容为空');

        if (/\.kml$/.test(name) || content.charAt(0) === '<') {
            return parseKML(content);
        }
        return parseGeoJSON(content);
    }

    function loadFile(file) {
        if (!file) return Promise.reject(new Error('未选择文件'));
        if (typeof file.text === 'function') {
            return file.text().then(function (text) {
                return parseText(text, file.name);
            });
        }
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    resolve(parseText(reader.result, file.name));
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function () { reject(new Error('读取文件失败')); };
            reader.readAsText(file);
        });
    }

    function loadDemo(url) {
        return fetch(url || DEFAULT_DEMO_URL).then(function (response) {
            if (!response.ok) throw new Error('示例数据加载失败（HTTP ' + response.status + '）');
            return response.text();
        }).then(function (text) {
            return parseText(text, 'demo.geojson');
        });
    }

    global.SeaUseData = {
        PALETTE: PALETTE,
        DEFAULT_DEMO_URL: DEFAULT_DEMO_URL,
        parseText: parseText,
        parseGeoJSON: parseGeoJSON,
        parseKML: parseKML,
        normalize: normalize,
        loadFile: loadFile,
        loadDemo: loadDemo
    };
})(window);
