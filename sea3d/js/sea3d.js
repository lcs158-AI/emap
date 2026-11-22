/*
 * 跬步 · 三维用海（Three.js 版）
 * 独立页面：不引用 OpenLayers / Cesium / AIsea 状态，仅共享 ../js/sea_use_data.js。
 * 坐标约定：以数据范围中心为原点，x 东、z 南（屏幕上方为北）、y 高程（米）。
 */
import * as THREE from '../lib/three.module.js';
import { OrbitControls } from '../lib/OrbitControls.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { createEnvironment } from './sea3d_env.js';

const SeaUseData = window.SeaUseData;
const DEMO_URL = '../data/sea_use/demo.geojson';
const EARTH_RADIUS = 6378137;
const MAX_LABELS = 200;
const SKY_COLOR = 0x6fb6dc;

const dom = {
    viewport: document.getElementById('viewport'),
    labels: document.getElementById('labels'),
    datasetName: document.getElementById('datasetName'),
    infoPanel: document.getElementById('infoPanel'),
    infoBody: document.getElementById('infoBody'),
    summary: document.getElementById('summary'),
    warningBox: document.getElementById('warningBox'),
    warningCount: document.getElementById('warningCount'),
    warningList: document.getElementById('warningList'),
    controlPanel: document.getElementById('controlPanel'),
    compassDial: document.getElementById('compassDial'),
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loadingText'),
    toast: document.getElementById('toast'),
    fileInput: document.getElementById('fileInput'),
    layers: {
        prisms: document.getElementById('layerPrisms'),
        pipelines: document.getElementById('layerPipelines'),
        nodes: document.getElementById('layerNodes'),
        labels: document.getElementById('layerLabels'),
        land: document.getElementById('layerLand'),
        seabed: document.getElementById('layerSeabed'),
        waterBody: document.getElementById('layerWaterBody'),
        surface: document.getElementById('layerSurface')
    }
};

const isMobile = window.matchMedia('(max-width: 760px)');

if (!SeaUseData) {
    fatal('共享数据层 js/sea_use_data.js 加载失败');
}

let renderer;
try {
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
} catch (err) {
    fatal('当前浏览器无法创建 WebGL 环境，请更换浏览器后重试');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
dom.viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 800, 3000);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 100000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.65;
controls.panSpeed = 0.8;
controls.zoomSpeed = 0.9;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI * 0.95;

const hemiLight = new THREE.HemisphereLight(0xd0f0ff, 0x0d2a3a, 0.9);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xfff4da, 2.0);
sunLight.position.set(-1, 1.6, 0.7).normalize().multiplyScalar(500);
scene.add(sunLight);

const root = new THREE.Group();
root.scale.y = 1;
scene.add(root);

const groupPrisms = new THREE.Group();
const groupPipelines = new THREE.Group();
const groupNodes = new THREE.Group();
root.add(groupPrisms, groupPipelines, groupNodes);

const state = {
    model: null,
    env: null,
    span: 100,
    seabedY: -20,
    exaggeration: 1,
    sourceName: '示例数据（非真实用海项目）',
    labelDistance: 500,
    pickables: [],
    prismMeshes: new Map(),
    labelItems: [],
    nodeMeta: [],
    nodesMesh: null,
    selected: null,
    highlight: null,
    tween: null,
    frame: 0,
    paused: false
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tmpVec = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

let pointerStart = null;

// ---------- 基础工具 ----------

function fatal(message) {
    if (dom.loading) {
        dom.loading.hidden = false;
        dom.loadingText.textContent = message;
    }
    throw new Error(message);
}

function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

function fmt(value, digits = 1) {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    const fixed = Number(value).toFixed(digits);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

let toastTimer = 0;
function showToast(message, isError) {
    dom.toast.textContent = message;
    dom.toast.classList.toggle('is-error', !!isError);
    dom.toast.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('is-show'), isError ? 5200 : 2600);
}

function setLoading(show, text) {
    dom.loading.hidden = !show;
    if (text) dom.loadingText.textContent = text;
}

// ---------- 坐标投影 ----------

function computeMetrics(model) {
    const ext = model.extent;
    const centerLon = (ext.west + ext.east) / 2;
    const centerLat = (ext.south + ext.north) / 2;
    const mPerLon = Math.PI / 180 * EARTH_RADIUS * Math.cos(centerLat * Math.PI / 180);
    const mPerLat = Math.PI / 180 * EARTH_RADIUS;

    const proj = {
        centerLon,
        centerLat,
        mPerLon,
        mPerLat,
        toXZ(lon, lat) {
            // z 取负：北向为 -z，保证默认视角“上北下南、东右西左”
            return [(lon - centerLon) * mPerLon, -(lat - centerLat) * mPerLat];
        }
    };

    const width = Math.abs(ext.east - ext.west) * mPerLon;
    const depth = Math.abs(ext.north - ext.south) * mPerLat;
    const span = Math.max(width, depth, 30);

    return { proj, width, depth, span };
}

// ---------- 场景清理 ----------

function disposeGroup(group) {
    group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((material) => material.dispose());
        }
    });
    group.clear();
}

function clearModel() {
    clearHighlight();
    disposeGroup(groupPrisms);
    disposeGroup(groupPipelines);
    disposeGroup(groupNodes);
    if (state.env) {
        scene.remove(state.env.group);
        state.env.dispose();
        state.env = null;
    }
    state.pickables = [];
    state.prismMeshes.clear();
    state.labelItems = [];
    state.nodeMeta = [];
    state.nodesMesh = null;
    state.selected = null;
    state.model = null;
    dom.labels.innerHTML = '';
    renderInfo(null);
}

// ---------- 棱体 ----------

function buildPrismGeometry(prism, proj) {
    const points = [];
    prism.points.forEach((point) => {
        const xz = proj.toXZ(point[0], point[1]);
        const vector = new THREE.Vector2(xz[0], xz[1]);
        const last = points[points.length - 1];
        if (!last || Math.hypot(last.x - vector.x, last.y - vector.y) > 1e-4) {
            points.push(vector);
        }
    });
    if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-4) points.pop();
    }
    if (points.length < 3) return null;

    const faces = THREE.ShapeUtils.triangulateShape(points, []);
    if (!faces.length) return null;

    const bottom = points.map((point) => new THREE.Vector3(point.x, prism.bottom, point.y));
    const top = points.map((point) => new THREE.Vector3(point.x, prism.top, point.y));
    const positions = [];

    const push = (vector) => positions.push(vector.x, vector.y, vector.z);

    // 顶面
    faces.forEach((face) => {
        push(top[face[0]]);
        push(top[face[1]]);
        push(top[face[2]]);
    });
    // 底面（反向）
    faces.forEach((face) => {
        push(bottom[face[2]]);
        push(bottom[face[1]]);
        push(bottom[face[0]]);
    });
    // 侧面
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        push(top[i]);
        push(bottom[i]);
        push(top[j]);
        push(top[j]);
        push(bottom[i]);
        push(bottom[j]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
}

function addPrism(prism, proj) {
    const geometry = buildPrismGeometry(prism, proj);
    if (!geometry) return;

    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(prism.color),
        transparent: true,
        opacity: 0.72,
        roughness: 0.42,
        metalness: 0.08,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.kind = 'prism';
    mesh.userData.data = prism;

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 30),
        new THREE.LineBasicMaterial({ color: 0xa9ddfa, transparent: true, opacity: 0.5 })
    );

    const group = new THREE.Group();
    group.add(mesh, edges);
    groupPrisms.add(group);

    state.pickables.push(mesh);
    state.prismMeshes.set(prism.id, mesh);

    let cx = 0;
    let cz = 0;
    prism.points.forEach((point) => {
        const xz = proj.toXZ(point[0], point[1]);
        cx += xz[0];
        cz += xz[1];
    });
    cx /= prism.points.length;
    cz /= prism.points.length;

    addLabel(prism.name, `底 ${fmt(prism.bottom)} / 顶 ${fmt(prism.top)} 米`, cx, (prism.bottom + prism.top) / 2, cz, 'prism');
}

// ---------- 管线与节点 ----------

function addPipeline(pipe, proj, nodeList) {
    const points = pipe.nodes.map((node) => {
        const xz = proj.toXZ(node.lon, node.lat);
        return new THREE.Vector3(xz[0], node.z, xz[1]);
    });

    const radius = Math.max(0.35, (pipe.width || 4) / 2);
    const parts = [];
    for (let i = 0; i < points.length - 1; i++) {
        const from = points[i];
        const to = points[i + 1];
        const length = from.distanceTo(to);
        if (length < 1e-3) continue;
        const segments = Math.max(1, Math.min(32, Math.ceil(length / Math.max(radius * 4, 1))));
        parts.push(new THREE.TubeGeometry(new THREE.LineCurve3(from, to), segments, radius, 8, false));
    }
    if (!parts.length) return;

    const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    parts.forEach((part) => {
        if (part !== geometry) part.dispose();
    });

    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(pipe.color),
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.kind = 'pipeline';
    mesh.userData.data = pipe;
    groupPipelines.add(mesh);
    state.pickables.push(mesh);

    const nodeRadius = Math.max(1, radius * 1.35);
    pipe.nodes.forEach((node, index) => {
        const point = points[index];
        nodeList.push({
            pipeline: pipe,
            index,
            node,
            x: point.x,
            y: point.y,
            z: point.z,
            radius: nodeRadius
        });
    });

    const middle = pipe.nodes[Math.floor(pipe.nodes.length / 2)];
    const middlePoint = points[Math.floor(points.length / 2)];
    addLabel(
        pipe.name,
        `${pipe.nodes.length} 节点 · 高程 ${fmt(Math.min(...pipe.nodes.map((n) => n.z)))} ~ ${fmt(Math.max(...pipe.nodes.map((n) => n.z)))} 米`,
        middlePoint.x,
        middle.z,
        middlePoint.z,
        'pipe'
    );
}

function buildNodes(nodeList) {
    if (!nodeList.length) return;

    const geometry = new THREE.SphereGeometry(1, 12, 10);
    const material = new THREE.MeshStandardMaterial({
        color: 0xdff2ff,
        emissive: new THREE.Color(0x1b4763),
        emissiveIntensity: 0.7,
        roughness: 0.4
    });
    const mesh = new THREE.InstancedMesh(geometry, material, nodeList.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.kind = 'node';

    state.nodeMeta = nodeList;
    state.nodesMesh = mesh;
    groupNodes.add(mesh);
    state.pickables.push(mesh);

    updateNodeMatrices();
}

function updateNodeMatrices() {
    const mesh = state.nodesMesh;
    if (!mesh) return;
    const exaggeration = state.exaggeration;
    state.nodeMeta.forEach((meta, index) => {
        tmpPos.set(meta.x, meta.y, meta.z);
        tmpScale.set(meta.radius, meta.radius / exaggeration, meta.radius);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        mesh.setMatrixAt(index, tmpMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
}

// ---------- 标签 ----------

function addLabel(name, meta, x, y, z, kind) {
    if (state.labelItems.length >= MAX_LABELS) return;
    const el = document.createElement('div');
    el.className = 'label is-' + kind;
    const nameEl = document.createElement('span');
    nameEl.className = 'label-name';
    nameEl.textContent = name;
    const metaEl = document.createElement('span');
    metaEl.className = 'label-meta';
    metaEl.textContent = meta;
    el.appendChild(nameEl);
    el.appendChild(metaEl);
    el.style.display = 'none';
    dom.labels.appendChild(el);
    state.labelItems.push({ el, x, y, z });
}

function updateLabels() {
    const items = state.labelItems;
    if (!items.length) return;

    const width = dom.viewport.clientWidth || window.innerWidth;
    const height = dom.viewport.clientHeight || window.innerHeight;
    const exaggeration = state.exaggeration;
    const show = dom.layers.labels.checked;
    const cameraPosition = camera.position;

    items.forEach((item) => {
        if (!show) {
            item.el.style.display = 'none';
            return;
        }
        tmpVec.set(item.x, item.y * exaggeration, item.z);
        if (cameraPosition.distanceTo(tmpVec) > state.labelDistance) {
            item.el.style.display = 'none';
            return;
        }
        tmpVec.project(camera);
        if (tmpVec.z < -1 || tmpVec.z > 1) {
            item.el.style.display = 'none';
            return;
        }
        const x = (tmpVec.x * 0.5 + 0.5) * width;
        const y = (-tmpVec.y * 0.5 + 0.5) * height;
        if (x < -60 || x > width + 60 || y < -30 || y > height + 30) {
            item.el.style.display = 'none';
            return;
        }
        item.el.style.display = '';
        item.el.style.left = x + 'px';
        item.el.style.top = y + 'px';
    });
}

// ---------- 视角 ----------

function flyTo(position, target, duration = 700) {
    state.tween = {
        start: performance.now(),
        duration,
        fromPosition: camera.position.clone(),
        toPosition: position.clone(),
        fromTarget: controls.target.clone(),
        toTarget: target.clone()
    };
}

function viewPreset(name, animate = true) {
    if (!state.model) return;
    const span = state.span;
    const minHeight = state.model.extent.minHeight;
    let position;
    let target;

    if (name === 'top') {
        position = new THREE.Vector3(span * 0.001, span * 1.7, 0.001);
        target = new THREE.Vector3(0, 0, 0);
    } else if (name === 'side') {
        position = new THREE.Vector3(span * 1.55, Math.max(span * 0.1, 4), 0);
        target = new THREE.Vector3(0, 0, 0);
    } else if (name === 'underwater') {
        const underwaterY = Math.min(-1.5, Math.max(state.seabedY + Math.max(3, span * 0.04), minHeight * 0.55));
        position = new THREE.Vector3(span * 0.55, underwaterY, span * 0.75);
        target = new THREE.Vector3(0, -2, 0);
    } else {
        position = new THREE.Vector3(span * 0.82, span * 0.78, span * 1.0);
        target = new THREE.Vector3(0, 0, 0);
    }

    if (animate) {
        flyTo(position, target);
    } else {
        camera.position.copy(position);
        controls.target.copy(target);
        controls.update();
    }
}

// ---------- 构建 ----------

function buildModel(model, sourceName) {
    if (!model || !model.extent) throw new Error('没有可显示的用海数据');

    clearModel();
    state.model = model;
    state.sourceName = sourceName || '本地数据';

    const metrics = computeMetrics(model);
    state.span = metrics.span;
    state.labelDistance = metrics.span * 5;

    model.prisms.forEach((prism) => addPrism(prism, metrics.proj));

    const nodeList = [];
    model.pipelines.forEach((pipe) => addPipeline(pipe, metrics.proj, nodeList));
    buildNodes(nodeList);

    state.env = createEnvironment({ span: metrics.span });
    scene.add(state.env.group);
    state.seabedY = state.env.seabedMin;

    root.scale.y = state.exaggeration;
    updateNodeMatrices();

    controls.minDistance = Math.max(metrics.span * 0.08, 5);
    controls.maxDistance = metrics.span * 7;
    camera.near = Math.max(0.2, metrics.span * 0.002);
    camera.far = metrics.span * 40;
    camera.updateProjectionMatrix();

    scene.fog = new THREE.Fog(SKY_COLOR, metrics.span * 1.4, metrics.span * 5.2);

    applyLayerVisibility();
    updateSummary(model);
    renderWarnings(model.warnings);
    dom.datasetName.textContent = state.sourceName;

    viewPreset('oblique', false);
}

function applyLayerVisibility() {
    groupPrisms.visible = dom.layers.prisms.checked;
    groupPipelines.visible = dom.layers.pipelines.checked;
    groupNodes.visible = dom.layers.nodes.checked;
    if (state.env) {
        state.env.land.visible = dom.layers.land.checked;
        state.env.seabed.visible = dom.layers.seabed.checked;
        state.env.waterBody.visible = dom.layers.waterBody.checked;
        state.env.water.visible = dom.layers.surface.checked;
    }
    if (!dom.layers.labels.checked) {
        state.labelItems.forEach((item) => { item.el.style.display = 'none'; });
    }
}

// ---------- 摘要与告警 ----------

function summaryRow(label, value) {
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function updateSummary(model) {
    const ext = model.extent;
    const nodeCount = model.pipelines.reduce((sum, pipe) => sum + pipe.nodes.length, 0);
    dom.summary.innerHTML = [
        summaryRow('棱体', model.prisms.length + ' 个'),
        summaryRow('管线', model.pipelines.length + ' 条'),
        summaryRow('节点', nodeCount + ' 个'),
        summaryRow('经度', fmt(ext.west, 5) + ' ~ ' + fmt(ext.east, 5)),
        summaryRow('纬度', fmt(ext.south, 5) + ' ~ ' + fmt(ext.north, 5)),
        summaryRow('高程', fmt(ext.minHeight) + ' ~ ' + fmt(ext.maxHeight) + ' 米')
    ].join('');
}

function renderWarnings(warnings) {
    const list = Array.isArray(warnings) ? warnings : [];
    dom.warningCount.textContent = list.length;
    if (!list.length) {
        dom.warningList.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = '无告警';
        li.style.color = '#8ba7bb';
        dom.warningList.appendChild(li);
        dom.warningBox.open = false;
        return;
    }
    dom.warningList.innerHTML = list.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    dom.warningBox.open = false;
}

// ---------- 拾取与信息 ----------

function clearHighlight() {
    const highlight = state.highlight;
    if (!highlight) return;
    if (highlight.material.emissive) {
        highlight.material.emissive.setHex(highlight.emissive);
        highlight.material.emissiveIntensity = highlight.intensity;
    }
    state.highlight = null;
}

function highlightMaterial(material) {
    clearHighlight();
    if (!material || !material.emissive) return;
    state.highlight = {
        material,
        emissive: material.emissive.getHex(),
        intensity: material.emissiveIntensity
    };
    material.emissive.setHex(0x2f7fbf);
    material.emissiveIntensity = 1.1;
}

function renderInfo(hit) {
    if (!hit) {
        dom.infoBody.className = 'info-body is-empty';
        dom.infoBody.textContent = '点击棱体、管线或节点查看属性';
        dom.infoPanel.classList.remove('has-selection');
        return;
    }

    let html = '';
    if (hit.kind === 'prism') {
        const prism = hit.data;
        html += `<h3 class="info-title">${escapeHtml(prism.name)}</h3>`;
        html += '<span class="info-type">棱体</span>';
        html += infoRow('底高', fmt(prism.bottom) + ' 米');
        html += infoRow('顶高', fmt(prism.top) + ' 米');
        html += infoRow('厚度', fmt(prism.top - prism.bottom) + ' 米');
        html += infoRow('顶点数', prism.points.length + ' 个');
        html += infoRow('配色', `<span class="color-chip" style="background:${escapeHtml(prism.color)}"></span>${escapeHtml(prism.color)}`);
    } else if (hit.kind === 'pipeline') {
        const pipe = hit.data;
        const heights = pipe.nodes.map((node) => node.z);
        html += `<h3 class="info-title">${escapeHtml(pipe.name)}</h3>`;
        html += '<span class="info-type">管线</span>';
        html += infoRow('节点数', pipe.nodes.length + ' 个');
        html += infoRow('线宽', fmt(pipe.width) + ' 米');
        html += infoRow('起点高程', fmt(pipe.nodes[0].z) + ' 米');
        html += infoRow('终点高程', fmt(pipe.nodes[pipe.nodes.length - 1].z) + ' 米');
        html += infoRow('高程范围', fmt(Math.min(...heights)) + ' ~ ' + fmt(Math.max(...heights)) + ' 米');
    } else if (hit.kind === 'node') {
        const meta = hit.meta;
        html += `<h3 class="info-title">${escapeHtml(meta.pipeline.name)} · 节点 ${meta.index + 1}</h3>`;
        html += '<span class="info-type">管线节点</span>';
        html += infoRow('经度', fmt(meta.node.lon, 6));
        html += infoRow('纬度', fmt(meta.node.lat, 6));
        html += infoRow('高程', fmt(meta.node.z) + ' 米');
    }

    dom.infoBody.className = 'info-body';
    dom.infoBody.innerHTML = html;
    dom.infoPanel.classList.add('has-selection');
}

function infoRow(label, value) {
    return `<div class="info-row"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
}

function selectHit(hit) {
    clearHighlight();
    if (hit.kind !== 'node' && hit.mesh) {
        highlightMaterial(hit.mesh.material);
    }
    state.selected = hit;
    renderInfo(hit);
    if (isMobile.matches) dom.controlPanel.hidden = true;
}

function pickAt(clientX, clientY) {
    if (!state.pickables.length) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(state.pickables, false);
    for (let i = 0; i < hits.length; i++) {
        const object = hits[i].object;
        if (object.userData.kind === 'node') {
            const meta = state.nodeMeta[hits[i].instanceId];
            if (meta) {
                selectHit({ kind: 'node', meta });
                return;
            }
        } else if (object.userData.kind === 'prism' || object.userData.kind === 'pipeline') {
            selectHit({ kind: object.userData.kind, data: object.userData.data, mesh: object });
            return;
        }
    }

    clearHighlight();
    state.selected = null;
    renderInfo(null);
}

// ---------- 高程夸张 ----------

function setExaggeration(value) {
    state.exaggeration = value;
    root.scale.y = value;
    updateNodeMatrices();
    document.querySelectorAll('#exagGroup button').forEach((button) => {
        button.classList.toggle('active', Number(button.dataset.exag) === value);
    });
}

// ---------- 渲染循环 ----------

function resize() {
    const width = dom.viewport.clientWidth || window.innerWidth;
    const height = dom.viewport.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
}

function updateCompass() {
    camera.getWorldDirection(tmpDir);
    const heading = Math.atan2(tmpDir.x, -tmpDir.z);
    dom.compassDial.style.transform = `rotate(${-heading * 180 / Math.PI}deg)`;
}

function animate(now) {
    requestAnimationFrame(animate);
    if (state.paused) return;

    if (state.tween) {
        const tween = state.tween;
        const progress = Math.min(1, (now - tween.start) / tween.duration);
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
        if (progress >= 1) state.tween = null;
    }

    controls.update();
    if (state.env) state.env.update(now / 1000, state.frame);
    renderer.render(scene, camera);

    state.frame++;
    if (state.frame % 2 === 0) {
        updateLabels();
        updateCompass();
    }
}

// ---------- 数据加载 ----------

async function loadDemo(showMessage = true) {
    setLoading(true, '正在加载示例数据…');
    try {
        const model = await SeaUseData.loadDemo(DEMO_URL);
        buildModel(model, '示例数据（非真实用海项目）');
        if (showMessage) {
            showToast(`示例数据：${model.prisms.length} 个棱体 / ${model.pipelines.length} 条管线`);
        }
    } catch (err) {
        showToast('示例数据加载失败：' + (err && err.message ? err.message : err), true);
    } finally {
        setLoading(false);
    }
}

async function importFile(file) {
    if (!file) return;
    setLoading(true, `正在解析 ${file.name}…`);
    try {
        const model = await SeaUseData.loadFile(file);
        buildModel(model, file.name);
        showToast(`已导入 ${file.name}：${model.prisms.length} 个棱体 / ${model.pipelines.length} 条管线`);
    } catch (err) {
        showToast('数据解析失败：' + (err && err.message ? err.message : err), true);
    } finally {
        setLoading(false);
        dom.fileInput.value = '';
    }
}

// ---------- 交互绑定 ----------

function bindUI() {
    document.getElementById('btnDemo').addEventListener('click', () => loadDemo(true));
    document.getElementById('btnImport').addEventListener('click', () => dom.fileInput.click());
    document.getElementById('btnReset').addEventListener('click', () => viewPreset('oblique'));
    dom.fileInput.addEventListener('change', (event) => importFile(event.target.files && event.target.files[0]));

    document.getElementById('btnPanel').addEventListener('click', () => {
        dom.controlPanel.hidden = !dom.controlPanel.hidden;
        if (isMobile.matches && !dom.controlPanel.hidden) {
            dom.infoPanel.classList.remove('has-selection');
        }
    });

    Object.keys(dom.layers).forEach((key) => {
        dom.layers[key].addEventListener('change', applyLayerVisibility);
    });

    document.querySelectorAll('#exagGroup button').forEach((button) => {
        button.addEventListener('click', () => setExaggeration(Number(button.dataset.exag)));
    });

    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => viewPreset(button.dataset.view));
    });

    renderer.domElement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
    });

    renderer.domElement.addEventListener('pointerup', (event) => {
        if (!pointerStart || event.button !== 0) {
            pointerStart = null;
            return;
        }
        const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        const elapsed = performance.now() - pointerStart.time;
        pointerStart = null;
        if (moved > 6 || elapsed > 700) return;
        pickAt(event.clientX, event.clientY);
    });

    document.addEventListener('visibilitychange', () => {
        state.paused = document.hidden;
    });

    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
        new ResizeObserver(resize).observe(dom.viewport);
    }
}

// ---------- 启动 ----------

function bootstrap() {
    resize();
    bindUI();
    if (isMobile.matches) dom.controlPanel.hidden = true;

    document.querySelectorAll('#exagGroup button').forEach((button) => {
        button.classList.toggle('active', Number(button.dataset.exag) === state.exaggeration);
    });

    requestAnimationFrame(animate);
    loadDemo(false);
}

bootstrap();
