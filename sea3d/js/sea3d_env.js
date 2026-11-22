/*
 * 跬步 · 三维用海环境（模拟地形）
 * 参考 games 海战场景：浅蓝天空、西北陆地、东南开海，海洋拆为海床 / 水体 / 海面。
 * 当前用高度场模拟；接入实测「海域面 / 陆地面 / 水深点」时只需替换 heightAt 数据来源。
 *
 * 视觉分层（边界清晰）：
 *   陆地（顶点色 + 海岸线泡沫带）
 *   海面 ↔ 空气（波纹法线贴图 + 高光，动态顶点波浪）
 *   海面（含水体，深度吸收让水下呈有色体积）
 *   海床（泥沙纹理 + 水下深度吸收，半透明以见埋设物）
 *   海床下底土（深色实体侧壁 + 底盖，形成海床的下边界）
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
    [-26, 0x2f261b],
    [-16, 0x463a29],
    [-8, 0x6a5638],
    [-2.5, 0x9c8a63],
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

// ---------- 程序化纹理（运行时 canvas 生成，镜像重复消除接缝） ----------

function createContext(size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas.getContext('2d');
}

function makeMirroredTexture(canvas, srgb) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

// 海床泥沙纹理：沙黄-灰绿底 + 深浅斑块 + 浅滩平行波纹
function paintSeabedTexture() {
    const S = 256;
    const ctx = createContext(S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const u = x / S;
            const v = y / S;
            let r = 148 + fbm(u * 6, v * 6) * 42;
            let g = 138 + fbm(u * 6 + 3, v * 6 + 3) * 42;
            let b = 102 + fbm(u * 6 + 7, v * 6 + 7) * 30;
            const patch = fbm(u * 3 + 1.5, v * 3 + 1.5) - 0.5;
            r += patch * 36;
            g += patch * 30;
            b += patch * 20;
            const ripple = Math.sin((u * 1.3 + v * 0.7) * 42 + fbm(u * 4, v * 4) * 6);
            const mask = smoothstep(0.35, 0.6, fbm(u * 2 + 9, v * 2 + 9));
            r += ripple * 16 * mask;
            g += ripple * 14 * mask;
            b += ripple * 9 * mask;
            const idx = (y * S + x) * 4;
            img.data[idx] = clamp(r, 0, 255);
            img.data[idx + 1] = clamp(g, 0, 255);
            img.data[idx + 2] = clamp(b, 0, 255);
            img.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return ctx.canvas;
}

// 海面波纹法线纹理：正弦波 + 噪声扰动 → 法线
function paintWaterNormalTexture() {
    const S = 256;
    const ctx = createContext(S);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const u = x / S;
            const v = y / S;
            let vh = 0;
            vh += Math.sin(u * 28 + v * 18) * 0.5;
            vh += Math.sin(u * 14 - v * 33 + 1.7) * 0.35;
            vh += Math.sin((u + v) * 22 + 0.5) * 0.3;
            vh += (fbm(u * 5, v * 5) - 0.5) * 0.6;
            h[y * S + x] = vh;
        }
    }
    const img = ctx.createImageData(S, S);
    const strength = 4.0;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const xm = (x - 1 + S) % S;
            const xp = (x + 1) % S;
            const ym = (y - 1 + S) % S;
            const yp = (y + 1) % S;
            const dx = (h[y * S + xp] - h[y * S + xm]) * 0.5;
            const dy = (h[yp * S + x] - h[ym * S + x]) * 0.5;
            const nx = -dx * strength;
            const ny = 1.0;
            const nz = -dy * strength;
            const len = Math.hypot(nx, ny, nz);
            const idx = (y * S + x) * 4;
            img.data[idx] = (clamp(nx / len, -1, 1) * 0.5 + 0.5) * 255;
            img.data[idx + 1] = (clamp(ny / len, -1, 1) * 0.5 + 0.5) * 255;
            img.data[idx + 2] = (clamp(nz / len, -1, 1) * 0.5 + 0.5) * 255;
            img.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return ctx.canvas;
}

// 用 marching squares 提取 height≈0 的海岸线，返回交叉点段列表 [[x0,z0],[x1,z1]]
function extractCoastline(gridHeights, stride, half, step) {
    const segments = [];
    const cross = (a, b, ha, hb) => {
        const t = ha / (ha - hb);
        return a + t * (b - a);
    };
    for (let iz = 0; iz < TERRAIN_SEGMENTS; iz++) {
        for (let ix = 0; ix < TERRAIN_SEGMENTS; ix++) {
            const index = iz * stride + ix;
            const h00 = gridHeights[index];
            const h10 = gridHeights[index + 1];
            const h01 = gridHeights[index + stride];
            const h11 = gridHeights[index + stride + 1];
            const x0 = -half + ix * step;
            const z0 = -half + iz * step;
            const x1 = x0 + step;
            const z1 = z0 + step;
            const points = [];
            // 下边 z0
            if ((h00 >= 0) !== (h10 >= 0)) points.push([cross(x0, x1, h00, h10), z0]);
            // 右边 x1
            if ((h10 >= 0) !== (h11 >= 0)) points.push([x1, cross(z0, z1, h10, h11)]);
            // 上边 z1
            if ((h11 >= 0) !== (h01 >= 0)) points.push([cross(x0, x1, h11, h01), z1]);
            // 左边 x0
            if ((h01 >= 0) !== (h00 >= 0)) points.push([x0, cross(z0, z1, h01, h00)]);
            // 每格最多 2 个交点 → 一条线段
            if (points.length >= 2) segments.push(points[0], points[1]);
        }
    }
    return segments;
}

// 把线段列表转成水平带状（ribbon）几何体，用于泡沫线
function buildRibbon(segments, y, halfWidth) {
    const positions = [];
    for (let i = 0; i < segments.length; i += 2) {
        const a = segments[i];
        const b = segments[i + 1];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;
        const px = -dz / len * halfWidth;
        const pz = dx / len * halfWidth;
        const a0 = [a[0] + px, y, a[1] + pz];
        const a1 = [a[0] - px, y, a[1] - pz];
        const b0 = [b[0] + px, y, b[1] + pz];
        const b1 = [b[0] - px, y, b[1] - pz];
        positions.push(
            a0[0], a0[1], a0[2], b0[0], b0[1], b0[2], b1[0], b1[1], b1[2],
            a0[0], a0[1], a0[2], b1[0], b1[1], b1[2], a1[0], a1[1], a1[2]
        );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
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
        // 纹理 UV：以世界 xz 归一化，再由 repeat 控制密度
        const uv = new Float32Array((positions.length / 3) * 2);
        for (let i = 0; i < positions.length; i += 3) {
            uv[(i / 3) * 2] = (positions[i] + half) / size;
            uv[(i / 3) * 2 + 1] = (positions[i + 2] + half) / size;
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.computeBoundingSphere();
        return geometry;
    }

    // 纹理
    const seabedTexture = makeMirroredTexture(paintSeabedTexture(), true);
    seabedTexture.repeat.set(size / (span * 0.6), size / (span * 0.6));
    const waterNormalTexture = makeMirroredTexture(paintWaterNormalTexture(), false);
    waterNormalTexture.repeat.set(size / (span * 0.2), size / (span * 0.2));

    const terrainMaterialOptions = { vertexColors: true, roughness: 0.95, metalness: 0 };

    // 海床：泥沙纹理 + 顶点色相乘；半透明以见埋设物
    // onBeforeCompile：水下深度吸收，越深越暗、越偏深蓝（让水体呈现有色体积，而非空气）
    const seabedMaterial = new THREE.MeshStandardMaterial({
        ...terrainMaterialOptions,
        map: seabedTexture,
        transparent: true,
        opacity: 0.88,
        depthWrite: false
    });
    seabedMaterial.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vTerrainY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainY = position.y;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vTerrainY;')
            .replace(
                '#include <dithering_fragment>',
                'float d = clamp(-vTerrainY / 22.0, 0.0, 1.0);\n' +
                'gl_FragColor.rgb *= mix(1.0, 0.55, d);\n' +
                'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.10, 0.09, 0.07), d * 0.45);\n' +
                '#include <dithering_fragment>'
            );
    };
    seabedMaterial.customProgramCacheKey = () => 'seabedDepthAbsorb';

    const seabed = new THREE.Mesh(buildTerrain(bedPositions, bedColors, bedNormals), seabedMaterial);
    seabed.renderOrder = -1;
    const land = new THREE.Mesh(
        buildTerrain(landPositions, landColors, landNormals),
        new THREE.MeshStandardMaterial(terrainMaterialOptions)
    );
    seabed.name = 'seabed';
    land.name = 'land';
    group.add(seabed, land);

    // ---------- 底土层：海床下的实体边界（深色泥沙侧壁 + 底盖） ----------
    // 作为 seabed 的子节点，随“海床”图层一起显隐
    const waterBottom = seabedMin - 1;
    const soil = new THREE.Group();
    seabed.add(soil);

    const soilWallPositions = [];
    const perimeter = [];
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) perimeter.push([-half + i * step, -half]);
    for (let i = 1; i <= TERRAIN_SEGMENTS; i++) perimeter.push([half, -half + i * step]);
    for (let i = 1; i <= TERRAIN_SEGMENTS; i++) perimeter.push([half - i * step, half]);
    for (let i = 1; i < TERRAIN_SEGMENTS; i++) perimeter.push([-half, half - i * step]);
    for (let i = 0; i < perimeter.length; i++) {
        const a = perimeter[i];
        const b = perimeter[(i + 1) % perimeter.length];
        const ha = heightAt(a[0], a[1]);
        const hb = heightAt(b[0], b[1]);
        // 陆地处压到水面以下，避免墙体露出地面
        const ta = Math.min(ha, -0.5);
        const tb = Math.min(hb, -0.5);
        soilWallPositions.push(
            a[0], ta, a[1], b[0], tb, b[1], b[0], waterBottom, b[1],
            a[0], ta, a[1], b[0], waterBottom, b[1], a[0], waterBottom, a[1]
        );
    }
    const soilWallGeometry = new THREE.BufferGeometry();
    soilWallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(soilWallPositions, 3));
    soilWallGeometry.computeVertexNormals();
    soilWallGeometry.computeBoundingSphere();
    const soilMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b4f34,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide
    });
    soil.add(new THREE.Mesh(soilWallGeometry, soilMaterial));

    const soilBottom = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshStandardMaterial({ color: 0x3a2b1d, roughness: 1, metalness: 0, side: THREE.DoubleSide })
    );
    soilBottom.rotation.x = -Math.PI / 2;
    soilBottom.position.y = waterBottom;
    soil.add(soilBottom);

    // ---------- 海岸线泡沫带：陆地 / 海面边界 ----------
    const coastSegments = extractCoastline(gridHeights, TERRAIN_SEGMENTS + 1, half, step);
    const foam = new THREE.Mesh(
        buildRibbon(coastSegments, 0.12, span * 0.012),
        new THREE.MeshStandardMaterial({
            color: 0xeaf6ff,
            emissive: new THREE.Color(0x8fd0ff),
            emissiveIntensity: 0.55,
            transparent: true,
            opacity: 0.85,
            roughness: 0.4,
            metalness: 0,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    foam.renderOrder = 3;
    foam.name = 'foam';
    group.add(foam);

    // ---------- 水体：四周半透明侧壁，便于观察水层范围 ----------
    const wallPositions = [];
    const wallColors = [];
    const topColor = new THREE.Color(0x9fe6f5);
    const bottomColor = new THREE.Color(0x0d4a63);

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
            opacity: 0.38,
            roughness: 0.55,
            metalness: 0.05,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    waterBody.renderOrder = 1;
    waterBody.name = 'waterBody';
    group.add(waterBody);

    // ---------- 海面：动态波浪顶点 + 波纹法线贴图 ----------
    const waterGeometry = new THREE.PlaneGeometry(size, size, WATER_SEGMENTS, WATER_SEGMENTS);
    const basePositions = Float32Array.from(waterGeometry.attributes.position.array);
    const water = new THREE.Mesh(
        waterGeometry,
        new THREE.MeshStandardMaterial({
            color: 0x1f8fb0,
            transparent: true,
            opacity: 0.5,
            roughness: 0.25,
            metalness: 0.35,
            emissive: new THREE.Color(0x0a3a4d),
            emissiveIntensity: 0.35,
            normalMap: waterNormalTexture,
            normalScale: new THREE.Vector2(1.3, 1.3),
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.renderOrder = 2;
    water.name = 'water';
    group.add(water);

    const amplitude = span * 0.005;
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
        seabedTexture.dispose();
        waterNormalTexture.dispose();
        group.clear();
    }

    return {
        group,
        land,
        seabed,
        water,
        waterBody,
        foam,
        seabedMin,
        size,
        update,
        dispose
    };
}
