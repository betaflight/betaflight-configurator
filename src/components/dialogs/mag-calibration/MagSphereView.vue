<template>
    <div ref="containerRef" class="mag-sphere-container">
        <canvas ref="canvasRef"></canvas>
        <div v-if="showLegend" class="mag-sphere-legend">
            {{ legend }}
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
});

const containerRef = ref(null);
const canvasRef = ref(null);

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
const ZONE_DIRS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
];

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

    // Camera — pulled back for a nice isometric overview
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50000);
    camera.position.set(700, 500, 900);
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
    const mag = props.liveMag;
    const showLive = props.active && mag && (mag.x !== 0 || mag.y !== 0 || mag.z !== 0);
    if (liveMarker) {
        liveMarker.visible = showLive;
        if (showLive) {
            liveMarker.position.set(mag.x, mag.y, mag.z);
        }
    }
    // XYZ component cylinders along each axis
    if (vectorLines) {
        const vals = showLive ? [mag.x, mag.y, mag.z] : [0, 0, 0];
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
            const len = Math.hypot(mag.x, mag.y, mag.z);
            if (len > 1) {
                _tmpVec.set(mag.x, mag.y, mag.z);
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
    const showRef = props.inclination !== null && props.sphereFit;
    fieldRefGroup.visible = showRef;
    if (!showRef) {
        return;
    }

    const incl = (props.inclination * Math.PI) / 180;
    const { center, radius } = props.sphereFit;
    // Field direction: horizontal component along X (forward/north), vertical along Z (down)
    const dx = Math.cos(incl) * radius;
    const dz = Math.sin(incl) * radius;

    // Position the group at the sphere center
    fieldRefGroup.position.set(center.x, center.y, center.z);

    // Orient the shaft cylinder from center toward the field direction
    const shaft = fieldRefGroup.userData.shaft;
    const cone = fieldRefGroup.userData.cone;
    _tmpVec.set(dx, 0, dz);
    const len = _tmpVec.length();
    if (len > 1) {
        orientCylinder(shaft, _tmpVec, len);
        shaft.position.set(0, 0, 0);

        // Place cone at the tip of the arrow
        cone.position.set(dx, 0, dz);
        _tmpQuat.setFromUnitVectors(_UP, _tmpVec.normalize());
        cone.quaternion.copy(_tmpQuat);
    }
}

function updateCoverageZones() {
    if (!zoneMeshes) {
        return;
    }
    if (props.coverage && props.sphereFit) {
        const { center, radius } = props.sphereFit;
        const target = Math.max(props.coverage.total / 6, 1);
        const discRadius = radius * 0.15;

        const zones = props.coverage.zones || {};
        for (let i = 0; i < 6; i++) {
            const count = zones[ZONE_KEYS[i]] || 0;
            const ratio = Math.min(count / target, 1);
            zoneMeshes[i].material.color.setHSL(ratio * 0.33, 1, 0.5);
            zoneMeshes[i].scale.setScalar(discRadius);
            const d = ZONE_DIRS[i];
            zoneMeshes[i].position.set(center.x + d[0] * radius, center.y + d[1] * radius, center.z + d[2] * radius);
            zoneMeshes[i].lookAt(
                center.x + d[0] * radius * 2,
                center.y + d[1] * radius * 2,
                center.z + d[2] * radius * 2,
            );
            zoneMeshes[i].visible = true;
        }
    } else {
        for (const mesh of zoneMeshes) {
            mesh.visible = false;
        }
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

    // Latitude rings at ±45° for more visual depth
    for (const lat of [-Math.PI / 4, Math.PI / 4]) {
        const r = radius * Math.cos(lat);
        const y = radius * Math.sin(lat);
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
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
        positions[idx] = s.x;
        positions[idx + 1] = s.y;
        positions[idx + 2] = s.z;

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
    wireframeMesh.position.set(fit.center.x, fit.center.y, fit.center.z);
    scene.add(wireframeMesh);
    sphereGeo.dispose();

    // Center marker (small sphere)
    const markerGeo = new THREE.SphereGeometry(fit.radius * 0.03, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    centerMarker = new THREE.Mesh(markerGeo, markerMat);
    centerMarker.position.set(fit.center.x, fit.center.y, fit.center.z);
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

    if (ghostGroup) {
        ghostGroup.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                child.material.dispose();
            }
        });
        ghostGroup = null;
    }

    if (pointMesh) {
        pointGeometry.dispose();
        pointMaterial.dispose();
        pointMesh = null;
        pointGeometry = null;
        pointMaterial = null;
    }

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

// Watchers
watch(
    () => props.samples,
    (val) => updatePoints(val),
);

watch(
    () => props.sphereFit,
    (val) => updateWireframe(val),
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
