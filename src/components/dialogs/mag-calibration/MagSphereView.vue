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
            <span class="axis-field">{{ $t("magVizAxisField") }}</span>
            <span v-if="inclination !== null" class="axis-incl"
                >{{ inclination >= 0 ? "↘" : "↗" }}{{ Math.round(inclination) }}°</span
            >
        </div>
        <div v-if="sampleCount > 0" class="mag-sphere-age-legend">
            <span>{{ $t("magVizAgeLegendOld") }}</span>
            <span class="age-gradient"></span>
            <span>{{ $t("magVizAgeLegendNew") }}</span>
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
import { i18n } from "../../../js/localization";

const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_SPHERE_RADIUS = 400;

const props = defineProps({
    samples: {
        type: Array,
        default: () => [],
    },
    sampleCount: {
        type: Number,
        default: 0,
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
    quaternion: {
        type: Object,
        default: null, // { w, x, y, z } unit quaternion from MSP_ATTITUDE_QUATERNION
    },
    vizMode: {
        type: String,
        default: "pointcloud",
    },
    calOffsets: {
        type: Object,
        default: null, // { x, y, z } — current firmware mag calibration offsets
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

// Quad icon at origin reflecting real-time attitude
let quadIcon = null;
const ATTITUDE_SMOOTH = 0.12;
const _smoothQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
// 180° about X (forward axis): the Betaflight→scene frame adapter.
// Derivation lives in updateQuadAttitude() — the one genuinely subtle spot.
const _BASE_180_X = new THREE.Quaternion(1, 0, 0, 0);
const _tmpEuler = new THREE.Euler();
let smoothQuatInitialized = false;

// Reference ghost sphere (shown before calibration data arrives)
let ghostGroup = null;

// Live mag visualization (children of quadIcon — body frame)
let liveMarker = null;
let noseLine = null;
let vectorLines = null; // [xPos, xNeg, yPos, yNeg, zPos, zNeg] — bold/thin axis pairs

// Sphere center marker (grey dot at fitted sphere center)
let sphereCenterMarker = null;

// Cal offset marker (green dot showing current firmware calibration offset)
let calOffsetMarker = null;

// Expected field direction reference
let fieldRefGroup = null; // group containing shaft cylinder + cone arrowhead

// Reusable color for HSL→RGB in updatePoints loop
const _tempColor = new THREE.Color();

// Compass ring — earth-frame N/S/E/W labels on the horizontal plane
let compassGroup = null;

// Auto-scaling: use average field strength so outliers go outside the sphere
// while the majority of dots sit on the sphere surface
let maxFieldStrength = 0;
let fieldStrengthSum = 0;
let fieldStrengthCount = 0;

function magScale() {
    const avg = fieldStrengthCount > 0 ? fieldStrengthSum / fieldStrengthCount : 0;
    return avg > 0 ? DEFAULT_SPHERE_RADIUS / avg : 1;
}

function repositionCalOffsetMarker() {
    if (!calOffsetMarker || maxFieldStrength <= 0) {
        return;
    }
    const offsets = props.calOffsets;
    if (offsets && (offsets.x !== 0 || offsets.y !== 0 || offsets.z !== 0)) {
        const s = magScale();
        calOffsetMarker.position.set(offsets.x * s, -offsets.y * s, offsets.z * s);
        calOffsetMarker.visible = true;
    }
}

// Voxel heatmap — geodesic sphere with per-face coloring
let heatmapMesh = null;
let heatmapFaceDirs = null; // unit direction per face (center of each triangle)
let heatmapFaceCounts = null; // sample count per face

// World-space nose direction captured from liveMarker each frame.
// Stored as unit vectors (nx, ny, nz) per sample — multiplied by
// totalField * magScale() in updatePoints so dots rescale correctly.
let noseDirections = [];
const _worldPosVec = new THREE.Vector3();

function sampleToScene(s, sampleIndex) {
    const totalField = Math.hypot(s.x, s.y, s.z);
    const r = totalField * magScale();
    const dIdx = sampleIndex * 3;
    if (dIdx + 2 < noseDirections.length) {
        return [noseDirections[dIdx] * r, noseDirections[dIdx + 1] * r, noseDirections[dIdx + 2] * r];
    }
    return [0, 0, 0];
}

// Shared 2D canvas init: size, DPR, clear, background, empty-state text
function initCanvas2D(sampleList) {
    const canvas = projCanvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) {
        return null;
    }

    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (!sampleList || sampleList.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(i18n.getMessage("magVizWaitingForData"), w / 2, h / 2);
        return null;
    }

    return { ctx, w, h };
}

// Convert _tempColor (THREE.Color) to CSS rgb() string
function tempColorCSS() {
    return `rgb(${Math.round(_tempColor.r * 255)},${Math.round(_tempColor.g * 255)},${Math.round(_tempColor.b * 255)})`;
}

// Dispose a THREE.Group: traverse children, dispose geometry/material, remove from scene
function disposeGroup(group) {
    if (!group) {
        return;
    }
    group.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        if (child.material) {
            child.material.map?.dispose();
            child.material.dispose();
        }
    });
    scene?.remove(group);
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
    maxFieldStrength = 0;
    fieldStrengthSum = 0;
    fieldStrengthCount = 0;
    smoothQuatInitialized = false;
    noseDirections = [];

    // Scene is NED: +Z is down, so visual "up" is -Z. Camera sits north-east and
    // above the origin (+X north, +Y east, -Z up) for an isometric overview.
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50000);
    camera.up.set(0, 0, -1);
    camera.position.set(700, 560, -420);
    camera.lookAt(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));

    // Axis lines — thin lines connecting opposite cardinal points through origin
    const axisLength = DEFAULT_SPHERE_RADIUS;
    // Red: N–S in horizontal plane (full span)
    addAxisLine(scene, new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0), 0xff4444, 0.35);
    // Green: W–E in horizontal plane (full span)
    addAxisLine(scene, new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0), 0x44ff44, 0.35);
    // Blue: vertical axis — bold upward, faded downward
    addAxisLine(scene, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLength), 0x4444ff, 1);
    addAxisLine(scene, new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, 0), 0x4444ff, 0.15);

    // Ghost reference sphere — gives visual context before data arrives
    ghostGroup = createGhostSphere(DEFAULT_SPHERE_RADIUS);
    scene.add(ghostGroup);

    // Compass ring — earth-frame N/S/E/W at the equatorial plane
    compassGroup = createCompassRing(DEFAULT_SPHERE_RADIUS);
    scene.add(compassGroup);

    // Quad icon at origin — shows real-time attitude during calibration
    quadIcon = createQuadIcon(120);
    quadIcon.traverse((child) => {
        child.renderOrder = 10;
    });
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
        sizeAttenuation: false,
        depthWrite: false,
    });
    pointMesh = new THREE.Points(pointGeometry, pointMaterial);
    pointMesh.frustumCulled = false;
    pointMesh.renderOrder = 5;
    scene.add(pointMesh);

    // Live mag marker (white dot on +X axis at total field distance — body frame)
    const liveGeo = new THREE.SphereGeometry(10, 8, 8);
    const liveMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    liveMarker = new THREE.Mesh(liveGeo, liveMat);
    liveMarker.visible = false;
    liveMarker.renderOrder = 10;
    quadIcon.add(liveMarker);

    // White nose-direction line from quad center to live marker
    const noseGeo = new THREE.CylinderGeometry(1.5, 1.5, 1, 6);
    noseGeo.translate(0, 0.5, 0);
    const noseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true });
    noseLine = new THREE.Mesh(noseGeo, noseMat);
    noseLine.visible = false;
    noseLine.renderOrder = 9;
    quadIcon.add(noseLine);

    // XYZ vector lines — body frame (children of quadIcon, move with quad)
    // 6 meshes: [xPos, xNeg, yPos, yNeg, zPos, zNeg]
    // Positive halves are always bold, negative halves always thin
    const VECTOR_COLORS = [0xff4444, 0x44ff44, 0x4444ff];
    vectorLines = [];
    for (const color of VECTOR_COLORS) {
        for (const positive of [true, false]) {
            const geo = new THREE.CylinderGeometry(3, 3, 1, 6);
            geo.translate(0, 0.5, 0);
            const mat = new THREE.MeshBasicMaterial({
                color,
                opacity: positive ? 0.9 : 0.35,
                transparent: true,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.renderOrder = 10;
            quadIcon.add(mesh);
            vectorLines.push(mesh);
        }
    }

    // Sphere center marker (grey dot at fitted sphere center — scene frame)
    const centerGeo = new THREE.SphereGeometry(8, 8, 8);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    sphereCenterMarker = new THREE.Mesh(centerGeo, centerMat);
    sphereCenterMarker.visible = false;
    sphereCenterMarker.renderOrder = 10;
    scene.add(sphereCenterMarker);

    // Cal offset marker (green dot at current firmware calibration offset)
    const calGeo = new THREE.SphereGeometry(10, 10, 10);
    const calMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, opacity: 0.8, transparent: true });
    calOffsetMarker = new THREE.Mesh(calGeo, calMat);
    calOffsetMarker.visible = false;
    calOffsetMarker.renderOrder = 10;
    scene.add(calOffsetMarker);

    // Expected field direction arrow (orange shaft + cone arrowhead + inclination arc)
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

    // South-pole shaft (orange, thinner — same color as north, differentiated by thickness)
    const southShaftGeo = new THREE.CylinderGeometry(3, 3, 1, 8);
    southShaftGeo.translate(0, 0.5, 0);
    const southShaftMat = new THREE.MeshBasicMaterial({ color: 0xff8800, opacity: 0.7, transparent: true });
    fieldRefGroup.userData.southShaft = new THREE.Mesh(southShaftGeo, southShaftMat);
    fieldRefGroup.add(fieldRefGroup.userData.southShaft);

    // South-pole cone (orange, tip points outward along south pole)
    const southConeGeo = new THREE.ConeGeometry(8, 24, 8);
    const southConeMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    fieldRefGroup.userData.southCone = new THREE.Mesh(southConeGeo, southConeMat);
    fieldRefGroup.add(fieldRefGroup.userData.southCone);

    // Inclination arc (updated in rebuildFieldReference)
    fieldRefGroup.userData.arc = null;
    fieldRefGroup.userData.arcLabel = null;
    scene.add(fieldRefGroup);

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
    if (!quadIcon) {
        return;
    }

    // Frame adapter. Betaflight attitude is FLU/NWU; this scene is FRD/NED.
    // They differ by 180° about X (flip Y and Z), so the mesh gets Rx180·q.
    //
    // Done in two steps that look redundant but aren't — drop either and the
    // hemisphere bug returns (hidden near the equator, obvious at high latitude):
    //   1. set(x,-y,-z,w) is the conjugation p·q·p*   (p = _BASE_180_X = Rx180)
    //   2. the ·_BASE_180_X below cancels the trailing p* (p*·p = I), leaving
    //      net = p·q = Rx180·q — one proper rotation (det +1), independent of
    //      field direction and sensor, hence correct in both hemispheres.
    // Both input paths share this adapter so they can't diverge.
    if (props.quaternion) {
        const { w, x, y, z } = props.quaternion;
        _targetQuat.set(x, -y, -z, w);
    } else if (props.attitude) {
        // Euler fallback: build q from (roll, pitch, heading) in aerospace ZYX,
        // then the same adapter.
        const { roll, pitch, heading } = props.attitude;
        _tmpEuler.set(roll * DEG_TO_RAD, pitch * DEG_TO_RAD, heading * DEG_TO_RAD, "ZYX");
        _tmpQuat.setFromEuler(_tmpEuler);
        _targetQuat.set(_tmpQuat.x, -_tmpQuat.y, -_tmpQuat.z, _tmpQuat.w);
    } else {
        return;
    }

    // Ease in (slerp is right-equivariant, so smoothing before the ·_BASE_180_X
    // gives the same net Rx180·q).
    if (!smoothQuatInitialized) {
        _smoothQuat.copy(_targetQuat);
        smoothQuatInitialized = true;
    } else {
        _smoothQuat.slerp(_targetQuat, ATTITUDE_SMOOTH);
    }
    // Step 2: cancels the conjugation's p* → net Rx180·q. Dots and live-mag
    // vectors are children of quadIcon, so they inherit it automatically.
    quadIcon.quaternion.copy(_smoothQuat).multiply(_BASE_180_X);
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

function updateAxisCylinders(showLive, mx, my, mz) {
    const comps = [mx, my, mz];
    const s = magScale();
    for (let axis = 0; axis < 3; axis++) {
        const len = Math.abs(comps[axis]) * s;
        const vis = showLive && len > 1;
        const posIdx = axis * 2;
        const negIdx = axis * 2 + 1;
        vectorLines[posIdx].visible = vis;
        vectorLines[negIdx].visible = vis;
        if (vis) {
            // Positive half: always bold, points in +axis direction
            _tmpVec.set(0, 0, 0).setComponent(axis, 1);
            orientCylinder(vectorLines[posIdx], _tmpVec, len);
            vectorLines[posIdx].position.set(0, 0, 0);
            vectorLines[posIdx].scale.x = 1.5;
            vectorLines[posIdx].scale.z = 1.5;
            // Negative half: always thin, points in -axis direction
            _tmpVec.set(0, 0, 0).setComponent(axis, -1);
            orientCylinder(vectorLines[negIdx], _tmpVec, len);
            vectorLines[negIdx].position.set(0, 0, 0);
        }
    }
}

function updateLiveMagOverlay() {
    if (props.vizMode !== "pointcloud") {
        return;
    }
    const mag = props.liveMag;
    const showLive = props.active && mag && (mag.x !== 0 || mag.y !== 0 || mag.z !== 0);
    // Body-frame components for vector lines in quad's local display frame.
    // BF mag convention: X=fwd, Y=right, Z=up (Z is positive upward, opposite to gyro/accel Z=down).
    // Display local frame: X=fwd, Y=left, Z=up → negate only Y.
    const bx = showLive ? mag.x : 0;
    const by = showLive ? -mag.y : 0;
    const bz = showLive ? mag.z : 0;
    if (liveMarker) {
        liveMarker.visible = showLive;
        if (noseLine) {
            noseLine.visible = showLive;
        }
        if (showLive) {
            const totalField = Math.hypot(mag.x, mag.y, mag.z);
            if (totalField > maxFieldStrength * 1.02 || maxFieldStrength === 0) {
                maxFieldStrength = totalField;
                repositionCalOffsetMarker();
            }
            liveMarker.position.set(totalField * magScale(), 0, 0);

            if (noseLine) {
                noseLine.visible = true;
                _tmpVec.set(1, 0, 0);
                orientCylinder(noseLine, _tmpVec, totalField * magScale());
                noseLine.position.set(0, 0, 0);
            }

            // Capture nose direction for dot placement — uses the same
            // transform chain as the liveMarker so dots always match.
            quadIcon.updateWorldMatrix(true, false);
            liveMarker.getWorldPosition(_worldPosVec);
            const r = totalField * magScale();
            if (r > 0) {
                const invR = 1 / r;
                const nx = _worldPosVec.x * invR;
                const ny = _worldPosVec.y * invR;
                const nz = _worldPosVec.z * invR;
                const target = props.sampleCount;
                const have = noseDirections.length / 3;
                for (let i = have; i < target; i++) {
                    noseDirections.push(nx, ny, nz);
                }
            }
        }
    }
    if (vectorLines) {
        updateAxisCylinders(showLive, bx, by, bz);
    }
}

// Per-frame: just toggle visibility
function updateFieldReferenceArrow() {
    if (!fieldRefGroup) {
        return;
    }
    const use3D = props.vizMode === "pointcloud" || props.vizMode === "heatmap";
    fieldRefGroup.visible = use3D && props.inclination !== null;
}

// Called from watchers when sphereFit or inclination changes
function rebuildFieldReference() {
    if (!fieldRefGroup || props.inclination === null) {
        return;
    }

    const incl = (props.inclination * Math.PI) / 180;
    const radius = DEFAULT_SPHERE_RADIUS;
    // Field direction: horizontal along +X (magnetic north), vertical along Z.
    // Scene is NED (Z-down, set in initScene): the downward field component is
    // +sin(incl)·Z. Northern inclination (>0) dips toward +Z (down); southern
    // (<0) toward -Z (up). (The camera flip in the NED conversion inverted this;
    // the sign here was left in the old Z-up convention.)
    const fdx = Math.cos(incl) * radius;
    const fdz = Math.sin(incl) * radius;

    // Always positioned at origin — the field line passes through 0,0,0
    fieldRefGroup.position.set(0, 0, 0);

    // Orient shaft + cone — pull cone inward so its tip sits at the sphere surface
    const shaft = fieldRefGroup.userData.shaft;
    const cone = fieldRefGroup.userData.cone;
    _tmpVec.set(fdx, 0, fdz);
    const len = _tmpVec.length();
    const coneHalfH = 12;
    if (len > 1) {
        orientCylinder(shaft, _tmpVec, len - coneHalfH);
        shaft.position.set(0, 0, 0);
        const dir = _tmpVec.clone().normalize();
        cone.position.copy(dir.clone().multiplyScalar(len - coneHalfH));
        _tmpQuat.setFromUnitVectors(_UP, dir);
        cone.quaternion.copy(_tmpQuat);

        // South pole: negate the field direction
        const southShaft = fieldRefGroup.userData.southShaft;
        const southCone = fieldRefGroup.userData.southCone;
        const sDir = dir.clone().negate();
        _tmpVec.set(-fdx, 0, -fdz);
        orientCylinder(southShaft, _tmpVec, len - coneHalfH);
        southShaft.position.set(0, 0, 0);
        southCone.position.copy(sDir.clone().multiplyScalar(len - coneHalfH));
        _tmpQuat.setFromUnitVectors(_UP, sDir);
        southCone.quaternion.copy(_tmpQuat);

        // Hemisphere-aware thickness: dominant pole gets thicker shaft + larger cone
        // Must run after orientCylinder() which resets scale.x/z to 1
        const dominantNorth = props.inclination > 0;
        const dominantSouth = props.inclination < 0;
        const THICK = 5 / 3;
        const northScale = dominantNorth ? THICK : 1;
        const southScale = dominantSouth ? THICK : 1;
        shaft.scale.x = northScale;
        shaft.scale.z = northScale;
        cone.scale.setScalar(dominantNorth ? 1.3 : 1);
        southShaft.scale.x = southScale;
        southShaft.scale.z = southScale;
        southCone.scale.setScalar(dominantSouth ? 1.3 : 1);
    }

    // Dispose old arc + labels
    for (const key of ["arc", "arcLabel", "magNorthLabel", "magSouthLabel", "inclLabel"]) {
        const obj = fieldRefGroup.userData[key];
        if (!obj) {
            continue;
        }
        fieldRefGroup.remove(obj);
        obj.geometry?.dispose();
        obj.material?.map?.dispose();
        obj.material?.dispose();
        fieldRefGroup.userData[key] = null;
    }

    // Inclination arc: curved line from horizontal (+X) down to field direction
    const arcRadius = radius * 0.35;
    const arcPoints = [];
    for (let i = 0; i <= 24; i++) {
        const a = (-incl * i) / 24;
        arcPoints.push(new THREE.Vector3(Math.cos(a) * arcRadius, 0, -Math.sin(a) * arcRadius));
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const arcMat = new THREE.LineBasicMaterial({ color: 0xff8800, opacity: 0.6, transparent: true });
    fieldRefGroup.userData.arc = new THREE.Line(arcGeo, arcMat);
    fieldRefGroup.add(fieldRefGroup.userData.arc);

    // Angle label at arc midpoint
    const midAngle = -incl / 2;
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 128;
    labelCanvas.height = 48;
    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "#ff8800";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(props.inclination)}°`, 64, 24);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.position.set(Math.cos(midAngle) * arcRadius * 1.4, 0, -Math.sin(midAngle) * arcRadius * 1.4);
    labelSprite.scale.set(80, 30, 1);
    fieldRefGroup.userData.arcLabel = labelSprite;
    fieldRefGroup.add(labelSprite);

    // Helper: small orange sprite label
    function makeFieldLabel(text, x, z, size = 60) {
        const cv = document.createElement("canvas");
        cv.width = 128;
        cv.height = 64;
        const c = cv.getContext("2d");
        c.fillStyle = "#ff8800";
        c.font = "bold 48px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, 64, 32);
        const tex = new THREE.CanvasTexture(cv);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const s = new THREE.Sprite(mat);
        s.position.set(x, 0, z);
        s.scale.set(size, size * 0.5, 1);
        fieldRefGroup.add(s);
        return s;
    }

    // Magnetic N/S labels just past the arrow tips
    // North pole = positive inclination end, South = negative
    const tipOffset = 1.15;
    fieldRefGroup.userData.magNorthLabel = makeFieldLabel("N", fdx * tipOffset, fdz * tipOffset);
    fieldRefGroup.userData.magSouthLabel = makeFieldLabel("S", -fdx * tipOffset, -fdz * tipOffset);

    // Inclination angle at the dominant pole end (just outside the sphere)
    const sign = props.inclination >= 0 ? "+" : "";
    const inclText = `${sign}${Math.round(props.inclination)}°`;
    const inclPos = props.inclination >= 0 ? 1.25 : -1.25;
    fieldRefGroup.userData.inclLabel = makeFieldLabel(inclText, fdx * inclPos, fdz * inclPos, 80);
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
        heatmapMesh.visible = false;
        return;
    }

    // In attitude-based view, sphere is centered at origin
    const scx = 0,
        scy = 0,
        scz = 0;
    heatmapMesh.position.set(0, 0, 0);
    heatmapMesh.scale.setScalar(DEFAULT_SPHERE_RADIUS);

    // Reset counts
    heatmapFaceCounts.fill(0);

    // Classify each sample into nearest face
    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - MAX_POINTS);
    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const [sx, sy, sz] = sampleToScene(s, start + i);
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
    const result = initCanvas2D(sampleList);
    if (!result) {
        return;
    }
    const { ctx, w, h } = result;

    // Transform samples to display frame
    const pts = [];
    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - MAX_POINTS);
    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        pts.push(sampleToScene(s, start + i));
    }

    // In attitude-based view, sphere is centered at origin
    const fit = props.sphereFit;
    const cx = 0,
        cy = 0,
        cz = 0;
    const radius = DEFAULT_SPHERE_RADIUS;

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
            const hue = (1 - t) * 0.65; // blue (old) → red (new), matches 3D point cloud
            _tempColor.setHSL(hue, 1, 0.5);
            ctx.fillStyle = tempColorCSS();
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

function computePolarDensity(sampleList) {
    const density = new Float32Array(POLAR_SECTORS * POLAR_RINGS);
    const count = Math.min(sampleList.length, MAX_POINTS);
    const start = Math.max(0, sampleList.length - MAX_POINTS);

    // In attitude-based view, sphere is centered at origin
    const cx = 0,
        cy = 0,
        cz = 0;

    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const [sx, sy, sz] = sampleToScene(s, start + i);
        const dx = sx - cx;
        const dy = sy - cy;
        const dz = sz - cz;

        let azimuth = Math.atan2(dy, dx);
        if (azimuth < 0) {
            azimuth += Math.PI * 2;
        }
        const r = Math.hypot(dx, dy, dz) || 1;
        const elevation = Math.asin(Math.max(-1, Math.min(1, dz / r)));

        const sector = Math.floor((azimuth / (Math.PI * 2)) * POLAR_SECTORS) % POLAR_SECTORS;
        const ring = Math.floor(((elevation + Math.PI / 2) / Math.PI) * POLAR_RINGS);
        const clampedRing = Math.max(0, Math.min(POLAR_RINGS - 1, ring));
        density[clampedRing * POLAR_SECTORS + sector]++;
    }

    return { density, maxDensity: Math.max(1, ...density) };
}

function drawPolarDensity(sampleList) {
    const result = initCanvas2D(sampleList);
    if (!result) {
        return;
    }
    const { ctx, w, h } = result;

    const centerX = w / 2;
    const centerY = h / 2;
    const maxR = Math.min(w, h) / 2 - 30;

    const { density, maxDensity } = computePolarDensity(sampleList);

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

            ctx.fillStyle = tempColorCSS();
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

    // Skip 3D updates when canvas is hidden (projection/polar modes)
    const use3D = props.vizMode === "pointcloud" || props.vizMode === "heatmap";
    if (!use3D) {
        return;
    }

    if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = props.active ? 1.5 : 0.5;
        controls.update();
    }

    updateGhostSphere();
    updateQuadAttitude();
    updateLiveMagOverlay();
    updateFieldReferenceArrow();

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

function addAxisLine(targetScene, from, to, color, opacity = 0.5) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1, depthTest: false });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 1;
    targetScene.add(line);
}

function createQuadIcon(size) {
    const group = new THREE.Group();
    const armMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    const motorFrontMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
    const motorRearMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

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

// Compass ring: thin equatorial circle + N/S/E/W sprites in the horizontal (Z=0) plane.
// North = +X (display) — the horizontal projection of Earth's magnetic field.
// East  = -Y (display) — BF +Y (right of quad when facing North).
// Cardinal markers represent magnetic north, not geographic north.
// The compass ring is not rotated by declination.
function createCompassRing(radius) {
    const group = new THREE.Group();

    // Thin equatorial circle at Z=0
    const segments = 72;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const ringMat = new THREE.LineBasicMaterial({ color: 0x446688, opacity: 0.35, transparent: true });
    group.add(new THREE.Line(ringGeo, ringMat));

    // Helper: canvas-texture sprite for a compass label
    const makeLabel = (text, color) => {
        const cv = document.createElement("canvas");
        cv.width = 128;
        cv.height = 128;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = color;
        ctx.font = "bold 96px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 64, 64);
        const tex = new THREE.CanvasTexture(cv);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(140, 140, 1);
        group.add(sprite);
        return sprite;
    };

    // Place labels just outside the sphere surface (5% past edge)
    const r = radius * 1.05;
    // Compass markers in the scene's NED frame: North=+X, East=+Y.
    // N/S are on ±X — the fixed axis of the Rx180 adapter — so unchanged.
    makeLabel("N", "#ff4444").position.set(r, 0, 0);
    makeLabel("S", "#aabbcc").position.set(-r, 0, 0);
    // E/W are on ±Y, which the Rx180 adapter negates; with it in place East is +Y.
    makeLabel("E", "#aabbcc").position.set(0, r, 0);
    makeLabel("W", "#aabbcc").position.set(0, -r, 0);

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

    // Recompute average and max field strength from all visible samples
    let newMax = 0;
    let sum = 0;
    for (let i = 0; i < count; i++) {
        const s = sampleList[start + i];
        const f = Math.hypot(s.x, s.y, s.z);
        sum += f;
        if (f > newMax) {
            newMax = f;
        }
    }
    fieldStrengthSum = sum;
    fieldStrengthCount = count;
    if (newMax > maxFieldStrength * 1.02 || maxFieldStrength === 0) {
        maxFieldStrength = newMax;
    }
    repositionCalOffsetMarker();

    // Only render dots that have captured nose directions
    const dirCount = Math.floor(noseDirections.length / 3);
    const renderCount = Math.min(count, Math.max(0, dirCount - start));

    for (let i = 0; i < renderCount; i++) {
        const s = sampleList[start + i];
        const idx = i * 3;
        const dIdx = (start + i) * 3;
        const totalField = Math.hypot(s.x, s.y, s.z);
        const r = totalField * magScale();
        positions[idx] = noseDirections[dIdx] * r;
        positions[idx + 1] = noseDirections[dIdx + 1] * r;
        positions[idx + 2] = noseDirections[dIdx + 2] * r;

        // Color gradient: blue (old) → cyan → green → yellow → red (new)
        const t = renderCount > 1 ? i / (renderCount - 1) : 0;
        const hue = (1 - t) * 0.65; // 0.65=blue → 0=red
        _tempColor.setHSL(hue, 1, 0.5);
        colors[idx] = _tempColor.r;
        colors[idx + 1] = _tempColor.g;
        colors[idx + 2] = _tempColor.b;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    pointGeometry.setDrawRange(0, renderCount);
    pointGeometry.computeBoundingSphere();
}

function disposeMesh(mesh, removeFromScene = false) {
    if (!mesh) {
        return;
    }
    if (removeFromScene) {
        scene?.remove(mesh);
    }
    mesh.geometry?.dispose();
    mesh.material?.dispose();
}

function ensureWireframe() {
    if (wireframeMesh || !scene) {
        return;
    }

    const sphereGeo = new THREE.SphereGeometry(DEFAULT_SPHERE_RADIUS, 24, 16);
    const wireGeo = new THREE.WireframeGeometry(sphereGeo);
    const wireMat = new THREE.LineBasicMaterial({
        color: 0x44aaff,
        opacity: 0.25,
        transparent: true,
    });
    wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireframeMesh.position.set(0, 0, 0);
    scene.add(wireframeMesh);
    sphereGeo.dispose();
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

    disposeGroup(fieldRefGroup);
    fieldRefGroup = null;

    disposeMesh(wireframeMesh);
    wireframeMesh = null;

    disposeMesh(sphereCenterMarker);
    sphereCenterMarker = null;

    disposeMesh(calOffsetMarker);
    calOffsetMarker = null;

    // liveMarker and vectorLines are children of quadIcon — disposed by disposeGroup
    disposeGroup(quadIcon);
    quadIcon = null;
    liveMarker = null;
    vectorLines = null;
    smoothQuatInitialized = false;
    noseDirections = [];

    disposeGroup(ghostGroup);
    ghostGroup = null;

    disposeGroup(compassGroup);
    compassGroup = null;

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

function setVisible(obj, visible) {
    if (obj) {
        obj.visible = visible;
    }
}

function setSceneObjectVisibility(pc, hm) {
    setVisible(pointMesh, pc);
    setVisible(wireframeMesh, pc || hm);
    setVisible(liveMarker, pc && props.active);
    setVisible(noseLine, pc && props.active);
    vectorLines?.forEach((v) => {
        v.visible = pc && props.active;
    });
    setVisible(sphereCenterMarker, (pc || hm) && !!props.sphereFit);
    const hasNonZeroCalOffsets =
        !!props.calOffsets && (props.calOffsets.x !== 0 || props.calOffsets.y !== 0 || props.calOffsets.z !== 0);
    setVisible(calOffsetMarker, (pc || hm) && hasNonZeroCalOffsets);
    setVisible(fieldRefGroup, (pc || hm) && props.inclination !== null);
    setVisible(heatmapMesh, hm);
    setVisible(compassGroup, pc || hm);
}

function applyVizMode(mode) {
    const pc = mode === "pointcloud";
    const hm = mode === "heatmap";

    if (canvasRef.value) {
        canvasRef.value.style.display = pc || hm ? "block" : "none";
    }
    setSceneObjectVisibility(pc, hm);
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
// sampleCount is a primitive prop (number) so Vue detects changes reliably,
// unlike samples.length which doesn't update when the array is mutated in place.
watch(
    () => props.sampleCount,
    (count) => {
        if (count === 0) {
            maxFieldStrength = 0;
            fieldStrengthSum = 0;
            fieldStrengthCount = 0;
            noseDirections = [];
        }
        ensureWireframe();
        updatePoints(props.samples);
        updateActiveViz(props.samples);
    },
);

watch(
    () => props.sphereFit,
    (val) => {
        ensureWireframe();
        rebuildFieldReference();
        updateActiveViz(props.samples);
        if (sphereCenterMarker) {
            sphereCenterMarker.position.set(0, 0, 0);
            sphereCenterMarker.visible = !!val;
        }
    },
);

watch(
    () => props.calOffsets,
    (offsets) => {
        if (!calOffsetMarker) {
            return;
        }
        if (offsets && (offsets.x !== 0 || offsets.y !== 0 || offsets.z !== 0) && maxFieldStrength > 0) {
            repositionCalOffsetMarker();
        } else {
            calOffsetMarker.visible = false;
        }
    },
    { immediate: true },
);

watch(
    () => props.inclination,
    () => rebuildFieldReference(),
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
    ensureWireframe();
    rebuildFieldReference();
    applyVizMode(props.vizMode);
    // Hydrate calOffsetMarker — the immediate watcher ran before initScene created it
    if (calOffsetMarker && props.calOffsets) {
        const offsets = props.calOffsets;
        if (offsets.x !== 0 || offsets.y !== 0 || offsets.z !== 0) {
            const s = magScale();
            calOffsetMarker.position.set(offsets.x * s, -offsets.y * s, offsets.z * s);
            calOffsetMarker.visible = true;
        }
    }
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

.mag-sphere-axis-legend .axis-incl {
    color: #ff8800;
    opacity: 0.7;
}

.mag-sphere-age-legend {
    position: absolute;
    top: 26px;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.65em;
    color: rgba(255, 255, 255, 0.6);
    pointer-events: none;
}

.mag-sphere-age-legend .age-gradient {
    display: inline-block;
    width: 48px;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
        to right,
        hsl(234, 100%, 50%),
        hsl(180, 100%, 50%),
        hsl(120, 100%, 50%),
        hsl(60, 100%, 50%),
        hsl(0, 100%, 50%)
    );
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
