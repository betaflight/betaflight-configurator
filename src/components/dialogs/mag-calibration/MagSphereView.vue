<template>
    <div ref="containerRef" class="mag-sphere-container">
        <canvas ref="canvasRef"></canvas>
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

function animate() {
    animationId = requestAnimationFrame(animate);

    if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = props.active ? 1.5 : 0.5;
        controls.update();
    }

    // Fade out ghost sphere once real data arrives
    if (ghostGroup) {
        const targetOpacity = props.sphereFit ? 0 : 0.12;
        ghostGroup.traverse((child) => {
            if (child.material) {
                child.material.opacity += (targetOpacity - child.material.opacity) * 0.05;
            }
        });
        ghostGroup.visible = !props.sphereFit || ghostGroup.children[0]?.material?.opacity > 0.01;
    }

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
        const rgb = hslToRgb(hue, 1, 0.5);
        colors[idx] = rgb[0];
        colors[idx + 1] = rgb[1];
        colors[idx + 2] = rgb[2];
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    pointGeometry.setDrawRange(0, count);
    pointGeometry.computeBoundingSphere();
}

function updateWireframe(fit) {
    // Remove old wireframe
    if (wireframeMesh) {
        scene.remove(wireframeMesh);
        wireframeMesh.geometry.dispose();
        wireframeMesh.material.dispose();
        wireframeMesh = null;
    }

    // Remove old center marker
    if (centerMarker) {
        scene.remove(centerMarker);
        centerMarker.geometry.dispose();
        centerMarker.material.dispose();
        centerMarker = null;
    }

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

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hueToRgb(p, q, h + 1 / 3);
        g = hueToRgb(p, q, h);
        b = hueToRgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

function hueToRgb(p, q, t) {
    if (t < 0) {
        t += 1;
    }
    if (t > 1) {
        t -= 1;
    }
    if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
        return q;
    }
    if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
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

    if (wireframeMesh) {
        wireframeMesh.geometry.dispose();
        wireframeMesh.material.dispose();
        wireframeMesh = null;
    }

    if (centerMarker) {
        centerMarker.geometry.dispose();
        centerMarker.material.dispose();
        centerMarker = null;
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
</style>
