/*
 * 跬步 · 三维用海环境（模拟地形）
 * 参考 games 海战场景：浅蓝天空、西北陆地、东南开海，海洋拆为海床 / 水体 / 海面。
 * 当前用高度场模拟；接入实测「海域面 / 陆地面 / 水深点」时只需替换 heightAt 数据来源。
 */
import * as THREE from '../lib/three.module.js';

const TERRAIN_SEGMENTS = 120;
const WATER_SEGMENTS = 72;

// ---------- 噪声与插值 ----------

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
    const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * (3 - 2 * x);
}

function hash2(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return value - Math.floor(value);
}

function valueNoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y) {
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let i = 0; i < 4; i++) {
        sum += amplitude * valueNoise(x * frequency, y * frequency);
        frequency *= 2.03;
        amplitude *= 0.5;
    }
    return sum;
}

// ---------- 高度场：西北陆地、东南开海 ----------

function createHeightField(span) {
    return function heightAt(x, z) {
        const nx = x / span;
        const nz = z / span;

        // 西北为正：海岸线大致由东北角斜向西南角
        const shore = -0.55 * nx - 0.75 * nz;
        const coast = 0.78 +
            0.16 * Math.sin(nx * 2.2 + 1.3) +
            0.1 * Math.sin(nz * 2.7 - 0.6) +
            (fbm(nx * 1.7 + 5.2, nz * 1.7 - 1.4) - 0.5) * 0.22;
        const distance = shore - coast;
        const detail = fbm(nx * 6 + 11, nz * 6 - 7) - 0.5;

        if (distance >= 0) {
            const inland = smoothstep(0, 0.55, distance);
            const hills = fbm(nx * 2.6 + 3, nz * 2.6 + 8);
            return 0.6 + inland * (4.5 + hills * 12) + detail * 1.6 * inland;
        }

        const shelf = smoothstep(0, 0.45, -distance);
        const offshore = Math.min(1, -distance / 3.0);
        return -(0.25 + shelf * 16.5 + offshore * 7 + detail * 2.4 * shelf);
    };
}

// ---------- 颜色 ----------

function prepareColorStops(stops) {
    return stops.map(([height, hex]) => {
        const color = new THREE.Color(hex);
        return [height, color.r, color.g, color.b];
    });
}

const BED_STOPS = prepareColorStops([
    [-26, 0x24424f],
    [-16, 0x365a60],
    [-8, 0x5d7a6d],
    [-2.5, 0x9aa27c],
    [0, 0xc7b98c]
]);

const LAND_STOPS = prepareColorStops([
    [0, 0xd8c9a2],
    [1.6, 0xc2b183],
    [3.2, 0x7c9450],
    [7, 0x63793f],
    [11, 0x7f7f5c],
    [16, 0x9a978f],
    [24, 0xb3b2ac]
]);

function sampleStops(stops, height) {
    if (height <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
    for (let i = 1; i < stops.length; i++) {
        if (height <= stops[i][0]) {
            const previous = stops[i - 1];
            const current = stops[i];
            const t = (height - previous[0]) / (current[0] - previous[0]);
            return [
                previous[1] + (current[1] - previous[1]) * t,
                previous[2] + (current[2] - previous[2]) * t,
                previous[3] + (current[3] - previous[3]) * t
            ];
        }
    }
    const last = stops[stops.length - 1];
    return [last[1], last[2], last[3]];
}

// ---------- 主入口 ----------

export function createEnvironment({ span }) {
    const group = new THREE.Group();
    const size = span * 6;
    const half = size / 2;
    const step = size / TERRAIN_SEGMENTS;
    const heightAt = createHeightField(span);

    const gridHeights = new Float32Array((TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
    let seabedMin = Infinity;

    for (let iz = 0; iz <= TERRAIN_SEGMENTS; iz++) {
        for (let ix = 0; ix <= TERRAIN_SEGMENTS; ix++) {
            const height = heightAt(-half + ix * step, -half + iz * step);
            gridHeights[iz * (TERRAIN_SEGMENTS + 1) + ix] = height;
            if (height < seabedMin) seabedMin = height;
        }
    }

    const landPositions = [];
    const landColors = [];
    const landNormals = [];
    const bedPositions = [];
    const bedColors = [];
    const bedNormals = [];

    const gradientEpsilon = step * 0.5;

    function pushVertex(positions, colors, normals, x, height, z, land) {
        const left = heightAt(x - gradientEpsilon, z);
        const right = heightAt(x + gradientEpsilon, z);
        const back = heightAt(x, z - gradientEpsilon);
        const front = heightAt(x, z + gradientEpsilon);
        const dx = (right - left) / (2 * gradientEpsilon);
        const dz = (front - back) / (2 * gradientEpsilon);
        const length = Math.hypot(dx, 1, dz);

        positions.push(x, height, z);
        normals.push(-dx / length, 1 / length, -dz / length);

        const color = land ? sampleStops(LAND_STOPS, height) : sampleStops(BED_STOPS, height);
        const shade = 0.94 + fbm(x * 0.05, z * 0.05) * 0.12;
        colors.push(
            clamp(color[0] * shade, 0, 1),
            clamp(color[1] * shade, 0, 1),
            clamp(color[2] * shade, 0, 1)
        );
    }

    for (let iz = 0; iz < TERRAIN_SEGMENTS; iz++) {
        for (let ix = 0; ix < TERRAIN_SEGMENTS; ix++) {
            const index = iz * (TERRAIN_SEGMENTS + 1) + ix;
            const stride = TERRAIN_SEGMENTS + 1;
            const h00 = gridHeights[index];
            const h10 = gridHeights[index + 1];
            const h01 = gridHeights[index + stride];
            const h11 = gridHeights[index + stride + 1];

            const x0 = -half + ix * step;
            const z0 = -half + iz * step;
            const x1 = x0 + step;
            const z1 = z0 + step;

            // 两个三角形顺序保证法线朝上
            const triangles = [
                [[x0, h00, z0], [x0, h01, z1], [x1, h10, z0]],
                [[x1, h10, z0], [x0, h01, z1], [x1, h11, z1]]
            ];

            triangles.forEach((triangle) => {
                const average = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3;
                const land = average >= 0;
                const positions = land ? landPositions : bedPositions;
                const colors = land ? landColors : bedColors;
                const normals = land ? landNormals : bedNormals;
                triangle.forEach(([x, height, z]) => {
                    pushVertex(positions, colors, normals, x, height, z, land);
                });
            });
        }
    }

    function buildTerrain(positions, colors, normals) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.computeBoundingSphere();
        return geometry;
    }

    const terrainMaterialOptions = { vertexColors: true, roughness: 0.95, metalness: 0 };

    // 海床半透明：默认就能看到埋设管线、桥梁下部与疏浚区
    const seabed = new THREE.Mesh(
        buildTerrain(bedPositions, bedColors, bedNormals),
        new THREE.MeshStandardMaterial({
            ...terrainMaterialOptions,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        })
    );
    seabed.renderOrder = -1;
    const land = new THREE.Mesh(
        buildTerrain(landPositions, landColors, landNormals),
        new THREE.MeshStandardMaterial(terrainMaterialOptions)
    );
    seabed.name = 'seabed';
    land.name = 'land';
    group.add(seabed, land);

    // 水体：四周半透明侧壁，便于观察水层范围
    const waterBottom = seabedMin - 1;
    const wallPositions = [];
    const wallColors = [];
    const topColor = new THREE.Color(0x8fd8f0);
    const bottomColor = new THREE.Color(0x16506b);

    function pushWall(a, b) {
        const corners = [
            [a, 0, topColor],
            [b, 0, topColor],
            [b, waterBottom, bottomColor],
            [a, waterBottom, bottomColor]
        ];
        const order = [0, 2, 1, 0, 3, 2];
        order.forEach((index) => {
            wallPositions.push(corners[index][0][0], corners[index][1], corners[index][0][1]);
            const color = corners[index][2];
            wallColors.push(color.r, color.g, color.b);
        });
    }

    pushWall([-half, -half], [half, -half]);
    pushWall([half, -half], [half, half]);
    pushWall([half, half], [-half, half]);
    pushWall([-half, half], [-half, -half]);

    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
    wallGeometry.setAttribute('color', new THREE.Float32BufferAttribute(wallColors, 3));
    wallGeometry.computeVertexNormals();

    const waterBody = new THREE.Mesh(
        wallGeometry,
        new THREE.MeshStandardMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.22,
            roughness: 0.55,
            metalness: 0.05,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    waterBody.renderOrder = 1;
    waterBody.name = 'waterBody';
    group.add(waterBody);

    // 海面：动态波浪平面
    const waterGeometry = new THREE.PlaneGeometry(size, size, WATER_SEGMENTS, WATER_SEGMENTS);
    const basePositions = Float32Array.from(waterGeometry.attributes.position.array);
    const water = new THREE.Mesh(
        waterGeometry,
        new THREE.MeshStandardMaterial({
            color: 0x2e8fb8,
            transparent: true,
            opacity: 0.55,
            roughness: 0.3,
            metalness: 0.3,
            emissive: new THREE.Color(0x0b3550),
            emissiveIntensity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.renderOrder = 2;
    water.name = 'water';
    group.add(water);

    const amplitude = span * 0.0035;
    const waveA = (Math.PI * 2) / (span * 0.36);
    const waveB = (Math.PI * 2) / (span * 0.19);

    function update(time, frame) {
        const positions = waterGeometry.attributes.position;
        const array = positions.array;
        for (let i = 0; i < array.length; i += 3) {
            const x = basePositions[i];
            const y = basePositions[i + 1];
            array[i + 2] = amplitude * (
                Math.sin(x * waveA + time * 1.15) * 0.6 +
                Math.sin(y * waveB - time * 1.7) * 0.45 +
                Math.sin((x + y) * waveA * 1.9 + time * 0.8) * 0.25
            );
        }
        positions.needsUpdate = true;
        if (frame % 3 === 0) waterGeometry.computeVertexNormals();
    }

    function dispose() {
        group.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => material.dispose());
            }
        });
        group.clear();
    }

    return {
        group,
        land,
        seabed,
        water,
        waterBody,
        seabedMin,
        size,
        update,
        dispose
    };
}
