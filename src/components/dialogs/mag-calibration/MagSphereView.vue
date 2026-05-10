<template>
    <div ref="containerRef" class="mag-sphere-container">
        <canvas ref="canvasRef"></canvas>
        <canvas
            v-show="vizMode === 'projection' || vizMode === 'polar'"
            ref="projCanvasRef"
            class="mag-sphere-proj-canvas"
        ></canvas>
        <div class="mag-sphere-axis-legend">
            <span class="axis-x">X</span>
            <span class="axis-y">Y</span>
            <span class="axis-z">Z</span>
            <span class="axis-field">Field</span>
        </div>
        <div v-if="showLegend" class="mag-sphere-legend">
            {{ legend }}
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEG_TO_RAD = Math.PI / 180;

const props = defineProps({
    samples: {
        type: Array,
        default: () => [],
    },
    sphereFit: {
        type: Object,
        default: null,
    },
    active: {
        type: Boolean,
        default: false,
    },
    showLegend: {
        type: Boolean,
        default: false,
    },
    legend: {
        type: String,
        default: "",
    },
    liveMag: {
        type: Object,
        default: null,
    },
    inclination: {
        type: Number,
        default: null,
    },
    coverage: {
        type: Object,
        default: null,
    },
    attitude: {
        type: Object,
        default: null, // { roll, pitch, heading } in degrees
    },
    vizMode: {
        type: String,
        default: "pointcloud",
    },
});

const containerRef = ref(null);
const canvasRef = ref(null);
const projCanvasRef = ref(null);

const MAX_POINTS = 5000;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let animationId = null;
let resizeObserver = null;

// Point cloud
let pointGeometry = null;
let pointMaterial = null;
let pointMesh = null;
let positionAttr = null;
let colorAttr = null;

// Wireframe sphere
let wireframeMesh = null;

// Center marker
let centerMarker = null;

// Quad icon at origin reflecting real-time attitude
let quadIcon = null;

// Reference ghost sphere (shown before calibration data arrives)
let ghostGroup = null;

// Live mag visualization
let liveMarker = null;
let vectorLines = null; // [xLine, yLine, zLine] — cylinder-based thick axis lines
let totalVectorLine = null; // orange line from origin to live mag position

// Expected field direction reference
let fieldRefGroup = null; // group containing shaft cylinder + cone arrowhead

// Reusable color for HSL→RGB in updatePoints loop
const _tempColor = new THREE.Color();

// Coverage zone indicators
let zoneMeshes = null;
const ZONE_KEYS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
// Display frame: X=forward, Y=left, Z=up  (BF Y negated, BF Z negated)
const ZONE_DIRS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, -1, 0], // BF +Y (right) → display -Y
    [0, 1, 0], // BF -Y (left) → display +Y
    [0, 0, -1], // BF +Z (down) → display -Z
    [0, 0, 1], // BF -Z (up) → display +Z
];

// Voxel heatmap — geodesic sphere with per-face coloring
let heatmapMesh = null;
let heatmapFaceDirs = null; // unit direction per face (center of each triangle)
let heatmapFaceCounts = null; // sample count per face

// Coordinate transform: Betaflight sensor frame → display frame
// BF: X=forward, Y=right, Z=down  →  Display: X=forward, Y=left, Z=up
function bfToScene(x, y, z) {
    return [x, -y, -z];
}

function initScene() {
    const container = containerRef.value;
    const canvas = canvasRef.value;
    if (!container || !canvas) {
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x1a1a2e, 1);

    // Scene
    scene = new THREE.Scene();

    // Camera — Z-up convention, pulled back for isometric overview
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50000);
    camera.up.set(0, 0, 1);
    camera.position.set(900, 700, 500);
    camera.lookAt(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));

    // Axis lines — sized to frame typical mag readings (200-500 range)
    const axisLength = 700;
    addAxisLine(scene, new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0), 0xff4444);
    addAxisLine(scene, new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0), 0x44ff44);
    addAxisLine(scene, new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, axisLength), 0x4444ff);

    // Axis labels
    addAxisLabel(scene, "X", new THREE.Vector3(axisLength + 40, 0, 0), 0xff4444);
    addAxisLabel(scene, "Y", new THREE.Vector3(0, axisLength + 40, 0), 0x44ff44);
    addAxisLabel(scene, "Z", new THREE.Vector3(0, 0, axisLength + 40), 0x4444ff);

    // Ghost reference sphere — gives visual context before data arrives
    ghostGroup = createGhostSphere(400);
    scene.add(ghostGroup);

    // Quad icon at origin — shows real-time attitude during calibration
    quadIcon = createQuadIcon(120);
    scene.add(quadIcon);

    // Point cloud (pre-allocated)
    pointGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3);
    const colors = new Float32Array(MAX_POINTS * 3);
    positionAttr = new THREE.BufferAttribute(positions, 3);
    colorAttr = new THREE.BufferAttribute(colors, 3);
    pointGeometry.setAttribute("position", positionAttr);
    pointGeometry.setAttribute("color", colorAttr);
    pointGeometry.setDrawRange(0, 0);

    pointMaterial = new THREE.PointsMaterial({
        size: 4,
        vertexColors: true,
        sizeAttenuation: true,
    });
    pointMesh = new THREE.Points(pointGeometry, pointMaterial);
    scene.add(pointMesh);

    // Live mag marker (white dot at current reading)
    const liveGeo = new THREE.SphereGeometry(10, 8, 8);
    const liveMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    liveMarker = new THREE.Mesh(liveGeo, liveMat);
    liveMarker.visible = false;
    scene.add(liveMarker);

    // XYZ thick vector lines (cylinders from origin along each axis to component value)
    const VECTOR_COLORS = [0xff4444, 0x44ff44, 0x4444ff];
    vectorLines = VECTOR_COLORS.map((color) => {
        const geo = new THREE.CylinderGeometry(3, 3, 1, 6);
        geo.translate(0, 0.5, 0); // pivot at bottom so scaling works from origin
        const mat = new THREE.MeshBasicMaterial({ color, opacity: 0.85, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
    });

    // Orange total measured field vector (origin → live mag position)
    const totalGeo = new THREE.CylinderGeometry(2, 2, 1, 6);
    totalGeo.translate(0, 0.5, 0);
    const totalMat = new THREE.MeshBasicMaterial({ color: 0xff8800, opacity: 0.9, transparent: true });
    totalVectorLine = new THREE.Mesh(totalGeo, totalMat);
    totalVectorLine.visible = false;
    scene.add(totalVectorLine);

    // Expected field direction arrow (orange shaft + cone arrowhead)
    fieldRefGroup = new THREE.Group();
    fieldRefGroup.visible = false;
    const shaftGeo = new THREE.CylinderGeometry(3, 3, 1, 8);
    shaftGeo.translate(0, 0.5, 0);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xff8800, opacity: 0.7, transparent: true });
    fieldRefGroup.userData.shaft = new THREE.Mesh(shaftGeo, shaftMat);
    fieldRefGroup.add(fieldRefGroup.userData.shaft);
    const coneGeo = new THREE.ConeGeometry(8, 24, 8);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    fieldRefGroup.userData.cone = new THREE.Mesh(coneGeo, coneMat);
    fieldRefGroup.add(fieldRefGroup.userData.cone);
    scene.add(fieldRefGroup);

    // Coverage zone indicators (6 discs at sphere poles, colored by sample density)
    zoneMeshes = ZONE_DIRS.map(() => {
        const geo = new THREE.CircleGeometry(1, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
    });

    // Voxel heatmap sphere (unit radius, scaled at render time)
    createHeatmapSphere(1);

    // OrbitControls
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.minDistance = 200;
    controls.maxDistance = 5000;

    // Resize observer
    resizeObserver = new ResizeObserver(() => {
        onResize();
    });
    resizeObserver.observe(container);

    // Start render loop
    animate();
}

function updateGhostSphere() {
    if (!ghostGroup) {
        return;
    }
    const targetOpacity = props.sphereFit ? 0 : 0.12;
    ghostGroup.traverse((child) => {
        if (child.material) {
            child.material.opacity += (targetOpacity - child.material.opacity) * 0.05;
        }
    });
    ghostGroup.visible = !props.sphereFit || ghostGroup.children[0]?.material?.opacity > 0.01;
}

function updateQuadAttitude() {
    if (!quadIcon || !props.attitude) {
        return;
    }
    // Display frame: X=forward, Y=left, Z=up
    // BF roll rotates around X → display roll around X (but Y/Z flipped, so negate)
    // BF pitch rotates around Y → display pitch around -Y
    // BF heading rotates around Z → display heading around -Z
    const { roll, pitch, heading } = props.attitude;
    const r = roll * DEG_TO_RAD;
    const p = pitch * DEG_TO_RAD;
    const h = heading * DEG_TO_RAD;
    quadIcon.rotation.set(r, p, h, "ZXY");
}

// Quaternion helpers for orienting cylinders along arbitrary axes
const _UP = new THREE.Vector3(0, 1, 0);
const _orientVec = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();

function orientCylinder(mesh, axis, length) {
    _orientVec.copy(axis).normalize();
    _tmpQuat.setFromUnitVectors(_UP, _orientVec);
    mesh.quaternion.copy(_tmpQuat);
    mesh.scale.set(1, Math.abs(length), 1);
}

function updateLiveMagOverlay() {
    if (props.vizMode !== "pointcloud") {
        return;
    }
    const mag = props.liveMag;
    const showLive = props.active && mag && (mag.x !== 0 || mag.y !== 0 || mag.z !== 0);
    const [mx, my, mz] = showLive ? bfToScene(mag.x, mag.y, mag.z) : [0, 0, 0];
    if (liveMarker) {
        liveMarker.visible = showLive;
        if (showLive) {
            liveMarker.position.set(mx, my, mz);
        }
    }
    // XYZ component cylinders along each axis (in display frame)
    if (vectorLines) {
        const vals = [mx, my, mz];
        for (let i = 0; i < 3; i++) {
            vectorLines[i].visible = showLive && Math.abs(vals[i]) > 1;
            if (vectorLines[i].visible) {
                _tmpVec.set(0, 0, 0).setComponent(i, Math.sign(vals[i]));
                orientCylinder(vectorLines[i], _tmpVec, vals[i]);
                vectorLines[i].position.set(0, 0, 0);
            }
        }
    }
    // Orange total field vector (origin → live position)
    if (totalVectorLine) {
        totalVectorLine.visible = showLive;
        if (showLive) {
            const len = Math.hypot(mx, my, mz);
            if (len > 1) {
                _tmpVec.set(mx, my, mz);
                orientCylinder(totalVectorLine, _tmpVec, len);
                totalVectorLine.position.set(0, 0, 0);
            } else {
                totalVectorLine.visible = false;
            }
        }
    }
}

function updateFieldReferenceArrow() {
    if (!fieldRefGroup) {
        return;
    }
    const use3D = props.vizMode === "pointcloud" || props.vizMode === "heatmap";
    const showRef = use3D && props.inclination !== null && props.sphereFit;
    fieldRefGroup.visible = showRef;
    if (!showRef) {
        return;
    }

    const incl = (props.inclination * Math.PI) / 180;
    const { center, radius } = props.sphereFit;
    // Field direction in BF frame: horizontal along X (north), vertical along Z (down)
    // In display frame: X stays, Z negated (up = +Z)
    const fdx = Math.cos(incl) * radius;
    const fdz = -Math.sin(incl) * radius; // BF Z-down → display Z-up

    // Position the group at the sphere center (remapped)
    const [scx, scy, scz] = bfToScene(center.x, center.y, center.z);
    fieldRefGroup.position.set(scx, scy, scz);

    // Orient the shaft cylinder from center toward the field direction
    const shaft = fieldRefGroup.userData.shaft;
    const cone = fieldRefGroup.userData.cone;
    _tmpVec.set(fdx, 0, fdz);
    const len = _tmpVec.length();
    if (len > 1) {
        orientCylinder(shaft, _tmpVec, len);
        shaft.position.set(0, 0, 0);

        // Place cone at the tip of the arrow
        cone.position.set(fdx, 0, fdz);
        _tmpQuat.setFromUnitVectors(_UP, _tmpVec.normalize());
        cone.quaternion.copy(_tmpQuat);
    }
}

function updateCoverageZones() {
    if (!zoneMeshes) {
        return;
    }
    if (props.vizMode !== "pointcloud") {
        for (const mesh of zoneMeshes) {
            mesh.visible = false;
        }
        return;
    }
    if (props.coverage && props.sphereFit) {
        const { center, radius } = props.sphereFit;
        const [scx, scy, scz] = bfToScene(center.x, center.y, center.z);
        const target = Math.max(props.coverage.total / 6, 1);
        const discRadius = radius * 0.15;

        const zones = props.coverage.zones || {};
        for (let i = 0; i < 6; i++) {
            const count = zones[ZONE_KEYS[i]] || 0;
            const ratio = Math.min(count / target, 1);
            zoneMeshes[i].material.color.setHSL(ratio * 0.33, 1, 0.5);
            zoneMeshes[i].scale.setScalar(discRadius);
            const d = ZONE_DIRS[i];
            zoneMeshes[i].position.set(scx + d[0] * radius, scy + d[1] * radius, scz + d[2] * radius);
            zoneMeshes[i].lookAt(scx + d[0] * radius * 2, scy + d[1] * radius * 2, scz + d[2] * radius * 2);
            zoneMeshes[i].visible = true;
        }
    } else {
        for (const mesh of zoneMeshes) {
            mesh.visible = false;
        }
    }
}

// --- Voxel Heatmap ---
const HEATMAP_DETAIL = 2; // icosahedron subdivision level → 320 faces

function createHeatmapSphere(radius) {
    const ico = new THREE.IcosahedronGeometry(radius, HEATMAP_DETAIL);
    // Convert indexed → non-indexed so each face gets its own color
    const geo = ico.toNonIndexed();
    ico.dispose();

    const posArr = geo.attributes.position.array;
    const faceCount = posArr.length / 9;
    heatmapFaceDirs = new Array(faceCount);
    heatmapFaceCounts = new Float32Array(faceCount);
    const colors = new Float32Array(posArr.length); // 3 verts × 3 comps per face

    for (let f = 0; f < faceCount; f++) {
        const i = f * 9;
        // Face center direction (average of 3 vertices, normalized)
        const cx = (posArr[i] + posArr[i + 3] + posArr[i + 6]) / 3;
        const cy = (posArr[i + 1] + posArr[i + 4] + posArr[i + 7]) / 3;
        const cz = (posArr[i + 2] + posArr[i + 5] + posArr[i + 8]) / 3;
        const len = Math.hypot(cx, cy, cz) || 1;
        heatmapFaceDirs[f] = [cx / len, cy / len, cz / len];
        // Initial color: dark blue-grey
        for (let v = 0; v < 3; v++) {
            colors[f * 9 + v * 3] = 0.1;
            colors[f * 9 + v * 3 + 1] = 0.1;
            colors[f * 9 + v * 3 + 2] = 0.15;
        }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        opacity: 0.85,
        transparent: true,
        side: THREE.DoubleSide,
    });
    heatmapMesh = new THREE.Mesh(geo, mat);
    heatmapMesh.visible = false;
    scene.add(heatmapMesh);
}

function updateHeatmap(sampleList) {
    if (!heatmapMesh || !heatmapFaceDirs) {
        return;
    }
    if (!sampleList || sampleList.length === 0 || !props.sphereFit) {
        heatmapMesh.visible = props.vizMode === "heatmap";
        return;
    }

    const { center, radius } = props.sphereFit;
    const [scx, scy, scz] = bfToScene(center.x, center.y, center.z);

    // Resize heatmap sphere to match fitted sphere
    heatmapMesh.position.set(scx, scy, scz);
    heatmapMesh.scale.setScalar(radius / 1); // IcosahedronGeometry default radius = 1

    // Reset counts
    heatmapFaceCounts.fill(0);

    // Classify each sample into nearest face
    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - MAX_POINTS);
    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const [sx, sy, sz] = bfToScene(s.x, s.y, s.z);
        // Direction from sphere center to sample
        const dx = sx - scx;
        const dy = sy - scy;
        const dz = sz - scz;
        const len = Math.hypot(dx, dy, dz) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;

        // Find closest face by dot product
        let bestFace = 0;
        let bestDot = -2;
        for (let f = 0; f < heatmapFaceDirs.length; f++) {
            const d = heatmapFaceDirs[f];
            const dot = nx * d[0] + ny * d[1] + nz * d[2];
            if (dot > bestDot) {
                bestDot = dot;
                bestFace = f;
            }
        }
        heatmapFaceCounts[bestFace]++;
    }

    // Color faces by density: dark → red → yellow → green
    const colorArr = heatmapMesh.geometry.attributes.color.array;
    const maxCount = Math.max(1, ...heatmapFaceCounts);
    for (let f = 0; f < heatmapFaceDirs.length; f++) {
        const n = heatmapFaceCounts[f];
        const ratio = Math.min(n / Math.max(maxCount * 0.3, 1), 1);
        if (n === 0) {
            _tempColor.setRGB(0.1, 0.1, 0.15);
        } else {
            // HSL: 0 (red) → 0.33 (green) as ratio increases
            _tempColor.setHSL(ratio * 0.33, 0.9, 0.35 + ratio * 0.2);
        }
        for (let v = 0; v < 3; v++) {
            colorArr[f * 9 + v * 3] = _tempColor.r;
            colorArr[f * 9 + v * 3 + 1] = _tempColor.g;
            colorArr[f * 9 + v * 3 + 2] = _tempColor.b;
        }
    }
    heatmapMesh.geometry.attributes.color.needsUpdate = true;
    heatmapMesh.visible = props.vizMode === "heatmap";
}

// --- Triple Projection (2D canvas) ---
const PROJ_PLANES = [
    { label: "XY", a: 0, b: 1, aLabel: "X", bLabel: "Y", aColor: "#ff4444", bColor: "#44ff44" },
    { label: "XZ", a: 0, b: 2, aLabel: "X", bLabel: "Z", aColor: "#ff4444", bColor: "#4444ff" },
    { label: "YZ", a: 1, b: 2, aLabel: "Y", bLabel: "Z", aColor: "#44ff44", bColor: "#4444ff" },
];

function drawProjection(sampleList) {
    const canvas = projCanvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) {
        return;
    }

    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (!sampleList || sampleList.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for data…", w / 2, h / 2);
        return;
    }

    // Transform samples to display frame
    const pts = [];
    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - MAX_POINTS);
    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const [sx, sy, sz] = bfToScene(s.x, s.y, s.z);
        pts.push([sx, sy, sz]);
    }

    // Sphere fit center and radius in display frame
    const fit = props.sphereFit;
    let cx = 0,
        cy = 0,
        cz = 0,
        radius = 300;
    if (fit) {
        [cx, cy, cz] = bfToScene(fit.center.x, fit.center.y, fit.center.z);
        radius = fit.radius;
    }

    // Layout: 3 circles in a row
    const gap = 8;
    const cellW = (w - gap * 4) / 3;
    const cellH = h - gap * 2;
    const cellSize = Math.min(cellW, cellH);
    const plotR = cellSize / 2 - 16; // leave room for labels
    const totalW = cellSize * 3 + gap * 2;
    const offsetX = (w - totalW) / 2;

    for (let p = 0; p < 3; p++) {
        const plane = PROJ_PLANES[p];
        const px = offsetX + p * (cellSize + gap) + cellSize / 2;
        const py = h / 2;

        const centerArr = [cx, cy, cz];
        const cA = centerArr[plane.a];
        const cB = centerArr[plane.b];

        // Draw ideal circle (from sphere fit)
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, plotR, 0, Math.PI * 2);
        ctx.stroke();

        // Scale: map sphere radius to plotR
        const scale = plotR / (radius * 1.3);

        // Draw fitted circle
        if (fit) {
            ctx.strokeStyle = "rgba(255,255,255,0.4)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(px + cA * scale, py - cB * scale, radius * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw center cross
            const ccx = px + cA * scale;
            const ccy = py - cB * scale;
            ctx.strokeStyle = "#ffff00";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ccx - 4, ccy);
            ctx.lineTo(ccx + 4, ccy);
            ctx.moveTo(ccx, ccy - 4);
            ctx.lineTo(ccx, ccy + 4);
            ctx.stroke();
        }

        // Draw data points
        for (let i = 0; i < pts.length; i++) {
            const screenX = px + pts[i][plane.a] * scale;
            const screenY = py - pts[i][plane.b] * scale;
            const t = pts.length > 1 ? i / (pts.length - 1) : 0;
            _tempColor.setHSL(t * 0.33, 1, 0.5);
            ctx.fillStyle = `rgb(${Math.round(_tempColor.r * 255)},${Math.round(_tempColor.g * 255)},${Math.round(_tempColor.b * 255)})`;
            ctx.fillRect(screenX - 1, screenY - 1, 2, 2);
        }

        // Axis labels
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        // Horizontal axis label
        ctx.fillStyle = plane.aColor;
        ctx.fillText(plane.aLabel, px, py + plotR + 14);
        // Vertical axis label
        ctx.fillStyle = plane.bColor;
        ctx.save();
        ctx.translate(px - plotR - 10, py);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(plane.bLabel, 0, 0);
        ctx.restore();

        // Plane label
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "11px sans-serif";
        ctx.fillText(plane.label, px, py - plotR - 6);
    }
}

// --- Polar Density Map (2D canvas) ---
const POLAR_SECTORS = 36; // 10° per sector
const POLAR_RINGS = 6; // elevation bands from pole to pole

function drawPolarDensity(sampleList) {
    const canvas = projCanvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) {
        return;
    }

    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h / 2;
    const maxR = Math.min(w, h) / 2 - 30;

    if (!sampleList || sampleList.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for data…", centerX, centerY);
        return;
    }

    // Build density grid: sectors (azimuth) × rings (elevation)
    const density = new Float32Array(POLAR_SECTORS * POLAR_RINGS);
    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - MAX_POINTS);

    // Get sphere center in display frame
    let cx = 0,
        cy = 0,
        cz = 0;
    if (props.sphereFit) {
        [cx, cy, cz] = bfToScene(props.sphereFit.center.x, props.sphereFit.center.y, props.sphereFit.center.z);
    }

    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const [sx, sy, sz] = bfToScene(s.x, s.y, s.z);
        const dx = sx - cx;
        const dy = sy - cy;
        const dz = sz - cz;

        // Azimuth: atan2(Y, X) → [0, 2π]
        let azimuth = Math.atan2(dy, dx);
        if (azimuth < 0) {
            azimuth += Math.PI * 2;
        }
        // Elevation: asin(Z / r) → [-π/2, π/2] → map to [0, POLAR_RINGS-1]
        const r = Math.hypot(dx, dy, dz) || 1;
        const elevation = Math.asin(Math.max(-1, Math.min(1, dz / r)));

        const sector = Math.floor((azimuth / (Math.PI * 2)) * POLAR_SECTORS) % POLAR_SECTORS;
        const ring = Math.floor(((elevation + Math.PI / 2) / Math.PI) * POLAR_RINGS);
        const clampedRing = Math.max(0, Math.min(POLAR_RINGS - 1, ring));
        density[clampedRing * POLAR_SECTORS + sector]++;
    }

    const maxDensity = Math.max(1, ...density);

    // Draw polar grid segments
    const sectorAngle = (Math.PI * 2) / POLAR_SECTORS;
    const ringWidth = maxR / POLAR_RINGS;

    for (let ring = 0; ring < POLAR_RINGS; ring++) {
        const innerR = ring * ringWidth;
        const outerR = (ring + 1) * ringWidth;
        for (let sector = 0; sector < POLAR_SECTORS; sector++) {
            const n = density[ring * POLAR_SECTORS + sector];
            const ratio = n / maxDensity;
            const startAngle = sector * sectorAngle - Math.PI / 2;
            const endAngle = startAngle + sectorAngle;

            if (n === 0) {
                _tempColor.setRGB(0.12, 0.12, 0.18);
            } else {
                _tempColor.setHSL(ratio * 0.33, 0.85, 0.25 + ratio * 0.3);
            }

            ctx.fillStyle = `rgb(${Math.round(_tempColor.r * 255)},${Math.round(_tempColor.g * 255)},${Math.round(_tempColor.b * 255)})`;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
            ctx.arc(centerX, centerY, innerR, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    for (let ring = 1; ring <= POLAR_RINGS; ring++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, ring * ringWidth, 0, Math.PI * 2);
        ctx.stroke();
    }
    for (let sector = 0; sector < POLAR_SECTORS; sector++) {
        const angle = sector * sectorAngle - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(angle) * maxR, centerY + Math.sin(angle) * maxR);
        ctx.stroke();
    }

    // Cardinal direction labels
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labels = [
        ["X+", -Math.PI / 2],
        ["Y+", 0],
        ["X-", Math.PI / 2],
        ["Y-", Math.PI],
    ];
    const labelColors = ["#ff4444", "#44ff44", "#ff4444", "#44ff44"];
    for (let i = 0; i < labels.length; i++) {
        const [text, angle] = labels[i];
        ctx.fillStyle = labelColors[i];
        ctx.fillText(text, centerX + Math.cos(angle) * (maxR + 16), centerY + Math.sin(angle) * (maxR + 16));
    }

    // Ring labels (elevation)
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    for (let ring = 0; ring < POLAR_RINGS; ring++) {
        const elev = Math.round(-90 + (ring + 0.5) * (180 / POLAR_RINGS));
        ctx.fillText(`${elev}°`, centerX + 3, centerY - (ring + 0.5) * ringWidth);
    }
}

function animate() {
    animationId = requestAnimationFrame(animate);

    if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = props.active ? 1.5 : 0.5;
        controls.update();
    }

    updateGhostSphere();
    updateQuadAttitude();
    updateLiveMagOverlay();
    updateFieldReferenceArrow();
    updateCoverageZones();

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function onResize() {
    const container = containerRef.value;
    if (!container || !renderer || !camera) {
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
        return;
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);

    updateActiveViz(props.samples);
}

function addAxisLine(targetScene, from, to, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color, opacity: 0.5, transparent: true });
    targetScene.add(new THREE.Line(geometry, material));
}

function addAxisLabel(targetScene, text, position, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(position);
    sprite.scale.set(80, 80, 1);
    targetScene.add(sprite);
}

function createQuadIcon(size) {
    const group = new THREE.Group();
    const armMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    const motorFrontMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const motorRearMat = new THREE.MeshBasicMaterial({ color: 0x444444 });

    // Two crossed arms (X shape in XY plane, Z=up)
    const armLen = size * 1.4;
    const armThick = size * 0.12;
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const geo = new THREE.BoxGeometry(armLen, armThick, armThick * 0.5);
        const mesh = new THREE.Mesh(geo, armMat);
        mesh.rotation.z = angle;
        group.add(mesh);
    }

    // Center body (elongated along X = forward)
    const bodyGeo = new THREE.BoxGeometry(size * 0.5, size * 0.4, size * 0.15);
    group.add(new THREE.Mesh(bodyGeo, armMat));

    // 4 motors at arm tips — front (+X) two red, rear (-X) two dark
    const half = (armLen / 2) * 0.7;
    const motorGeo = new THREE.CylinderGeometry(size * 0.18, size * 0.18, size * 0.1, 8);
    motorGeo.rotateX(Math.PI / 2); // align cylinder axis with Z
    const motorPositions = [
        { x: half, y: half, front: true },
        { x: half, y: -half, front: true },
        { x: -half, y: half, front: false },
        { x: -half, y: -half, front: false },
    ];
    for (const mp of motorPositions) {
        const motor = new THREE.Mesh(motorGeo, mp.front ? motorFrontMat : motorRearMat);
        motor.position.set(mp.x, mp.y, size * 0.1);
        group.add(motor);
    }

    // Forward direction indicator (small triangle pointing +X — BF forward axis)
    const triShape = new THREE.BufferGeometry();
    const s = size * 0.15;
    triShape.setAttribute(
        "position",
        new THREE.BufferAttribute(
            new Float32Array([size * 0.35, 0, size * 0.12, size * 0.2, -s, size * 0.12, size * 0.2, s, size * 0.12]),
            3,
        ),
    );
    triShape.setIndex([0, 1, 2]);
    triShape.computeVertexNormals();
    group.add(new THREE.Mesh(triShape, motorFrontMat));

    return group;
}

function createGhostSphere(radius) {
    const group = new THREE.Group();
    const ringMat = new THREE.LineBasicMaterial({
        color: 0x4488aa,
        opacity: 0.12,
        transparent: true,
    });

    // Three great-circle rings (XY, XZ, YZ planes)
    const segments = 64;
    for (const [aIdx, bIdx] of [
        [0, 1],
        [0, 2],
        [1, 2],
    ]) {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const v = new THREE.Vector3();
            v.setComponent(aIdx, Math.cos(angle) * radius);
            v.setComponent(bIdx, Math.sin(angle) * radius);
            points.push(v);
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.Line(geo, ringMat.clone()));
    }

    // Latitude rings at ±45° for more visual depth (Z=up)
    for (const lat of [-Math.PI / 4, Math.PI / 4]) {
        const r = radius * Math.cos(lat);
        const z = radius * Math.sin(lat);
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.Line(geo, ringMat.clone()));
    }

    return group;
}

function updatePoints(sampleList) {
    if (!positionAttr || !colorAttr) {
        return;
    }

    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - count);
    const positions = positionAttr.array;
    const colors = colorAttr.array;

    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const idx = i * 3;
        const [sx, sy, sz] = bfToScene(s.x, s.y, s.z);
        positions[idx] = sx;
        positions[idx + 1] = sy;
        positions[idx + 2] = sz;

        // Color gradient: blue (old) → cyan → green → yellow → red (new)
        const t = count > 1 ? i / (count - 1) : 0;
        const hue = (1 - t) * 0.65; // 0.65=blue → 0=red
        _tempColor.setHSL(hue, 1, 0.5);
        colors[idx] = _tempColor.r;
        colors[idx + 1] = _tempColor.g;
        colors[idx + 2] = _tempColor.b;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    pointGeometry.setDrawRange(0, count);
    pointGeometry.computeBoundingSphere();
}

function removeAndDispose(mesh) {
    if (!mesh) {
        return;
    }
    scene?.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
}

function updateWireframe(fit) {
    removeAndDispose(wireframeMesh);
    wireframeMesh = null;
    removeAndDispose(centerMarker);
    centerMarker = null;

    if (!fit || !scene) {
        return;
    }

    // Wireframe sphere at fitted center/radius
    const sphereGeo = new THREE.SphereGeometry(fit.radius, 24, 16);
    const wireGeo = new THREE.WireframeGeometry(sphereGeo);
    const wireMat = new THREE.LineBasicMaterial({
        color: 0x44aaff,
        opacity: 0.25,
        transparent: true,
    });
    wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
    const [cx, cy, cz] = bfToScene(fit.center.x, fit.center.y, fit.center.z);
    wireframeMesh.position.set(cx, cy, cz);
    scene.add(wireframeMesh);
    sphereGeo.dispose();

    // Center marker (small sphere)
    const markerGeo = new THREE.SphereGeometry(fit.radius * 0.03, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    centerMarker = new THREE.Mesh(markerGeo, markerMat);
    centerMarker.position.set(cx, cy, cz);
    scene.add(centerMarker);
}

function disposeMesh(mesh) {
    if (!mesh) {
        return;
    }
    mesh.geometry?.dispose();
    mesh.material?.dispose();
}

function disposeScene() {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    if (controls) {
        controls.dispose();
        controls = null;
    }

    if (fieldRefGroup) {
        fieldRefGroup.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                child.material.dispose();
            }
        });
        scene?.remove(fieldRefGroup);
        fieldRefGroup = null;
    }

    disposeMesh(totalVectorLine);
    totalVectorLine = null;

    if (zoneMeshes) {
        zoneMeshes.forEach(disposeMesh);
        zoneMeshes = null;
    }

    disposeMesh(wireframeMesh);
    wireframeMesh = null;
    disposeMesh(centerMarker);
    centerMarker = null;
    disposeMesh(liveMarker);
    liveMarker = null;

    if (vectorLines) {
        vectorLines.forEach(disposeMesh);
        vectorLines = null;
    }

    if (quadIcon) {
        quadIcon.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                child.material.dispose();
            }
        });
        scene?.remove(quadIcon);
        quadIcon = null;
    }

    if (ghostGroup) {
        ghostGroup.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                child.material.dispose();
            }
        });
        scene?.remove(ghostGroup);
        ghostGroup = null;
    }

    if (pointMesh) {
        pointGeometry.dispose();
        pointMaterial.dispose();
        pointMesh = null;
        pointGeometry = null;
        pointMaterial = null;
    }

    disposeMesh(heatmapMesh);
    heatmapMesh = null;
    heatmapFaceDirs = null;
    heatmapFaceCounts = null;

    // Dispose remaining scene resources (axis lines, labels, sprites)
    if (scene) {
        scene.traverse((obj) => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const m of mats) {
                    if (m.map) {
                        m.map.dispose();
                    }
                    m.dispose();
                }
            }
        });
    }

    if (renderer) {
        renderer.dispose();
        renderer = null;
    }

    scene = null;
    camera = null;
}

function applyVizMode(mode) {
    const pc = mode === "pointcloud";
    const hm = mode === "heatmap";
    const use3D = pc || hm;

    // Hide 3D canvas for 2D modes
    if (canvasRef.value) {
        canvasRef.value.style.display = use3D ? "block" : "none";
    }

    if (pointMesh) {
        pointMesh.visible = pc;
    }
    if (wireframeMesh) {
        wireframeMesh.visible = pc || hm;
    }
    if (centerMarker) {
        centerMarker.visible = pc || hm;
    }
    if (liveMarker) {
        liveMarker.visible = pc && props.active;
    }
    if (vectorLines) {
        for (const v of vectorLines) {
            v.visible = pc && props.active;
        }
    }
    if (totalVectorLine) {
        totalVectorLine.visible = pc && props.active;
    }
    if (fieldRefGroup) {
        fieldRefGroup.visible = pc || hm;
    }
    if (zoneMeshes) {
        for (const z of zoneMeshes) {
            z.visible = pc;
        }
    }
    if (heatmapMesh) {
        heatmapMesh.visible = hm;
    }
    updateActiveViz(props.samples);
}

function updateActiveViz(sampleList) {
    if (props.vizMode === "heatmap") {
        updateHeatmap(sampleList);
    } else if (props.vizMode === "projection") {
        drawProjection(sampleList);
    } else if (props.vizMode === "polar") {
        drawPolarDensity(sampleList);
    }
}

// Watchers
watch(
    () => props.samples,
    (val) => {
        updatePoints(val);
        updateActiveViz(val);
    },
);

watch(
    () => props.sphereFit,
    (val) => {
        updateWireframe(val);
        updateActiveViz(props.samples);
    },
);

watch(
    () => props.vizMode,
    (mode) => applyVizMode(mode),
);

onMounted(() => {
    initScene();
    // Hydrate scene from current props — the results-screen instance mounts
    // with precomputed data that won't trigger the watchers.
    updatePoints(props.samples);
    updateWireframe(props.sphereFit);
});

onBeforeUnmount(() => {
    disposeScene();
});
</script>

<style scoped>
.mag-sphere-container {
    width: 100%;
    height: 100%;
    min-height: 300px;
    position: relative;
}

.mag-sphere-container canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
}

.mag-sphere-proj-canvas {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
}

.mag-sphere-axis-legend {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 8px;
    font-size: 0.75em;
    font-weight: bold;
    pointer-events: none;
}

.mag-sphere-axis-legend .axis-x {
    color: #ff4444;
}

.mag-sphere-axis-legend .axis-y {
    color: #44ff44;
}

.mag-sphere-axis-legend .axis-z {
    color: #4444ff;
}

.mag-sphere-axis-legend .axis-field {
    color: #ff8800;
}

.mag-sphere-legend {
    position: absolute;
    bottom: 6px;
    left: 6px;
    right: 6px;
    font-size: 0.7em;
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
    line-height: 1.3;
}
</style>
