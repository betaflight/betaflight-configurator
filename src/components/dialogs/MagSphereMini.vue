<template>
    <div class="mag-mini" ref="containerRef">
        <canvas ref="canvasRef" class="mag-mini-canvas"></canvas>
        <span class="mag-mini-label-n">N</span>
        <span class="mag-mini-label-e">E</span>
        <span class="mag-mini-label-s">S</span>
        <span class="mag-mini-label-w">W</span>
        <span v-if="errorDeg !== null" class="mag-mini-error" :class="errorClass">
            {{ errorDeg.toFixed(0) }}&deg; {{ errorDeg < 10 ? "✓" : "✗" }}
        </span>
    </div>
</template>

<script setup>
/**
 * MagSphereMini — lightweight MagSphereView-style 3D render for the replay.
 *
 * Accepts computed props (no MSP/FC dependency) and renders a simplified
 * MagSphereView: compass ring, X-frame drone icon at the given attitude,
 * and mag vector cylinders.  Small enough for 2 side-by-side instances.
 *
 * Props:
 *   mag       — [x, y, z] raw body-frame mag vector
 *   roll      — degrees, drone roll attitude
 *   pitch     — degrees, drone pitch attitude
 *   heading   — degrees, computed heading (from leveled mag direction)
 *   expectedHeading — degrees, the heading the drone SHOULD read (from compass ref)
 *   fieldStrength  — total field magnitude for scaling
 */
import { ref, watch, onMounted, onScopeDispose, nextTick, computed } from "vue";
import * as THREE from "three";

const DEG = Math.PI / 180;

const props = defineProps({
    mag: { type: Array, default: () => [0, 0, 0] },
    roll: { type: Number, default: 0 },
    pitch: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    expectedHeading: { type: Number, default: null },
    fieldStrength: { type: Number, default: 1000 },
});

const errorDeg = computed(() => {
    if (props.expectedHeading === null || props.expectedHeading === undefined) {
        return null;
    }
    let diff = props.heading - props.expectedHeading;
    while (diff > 180) {
        diff -= 360;
    }
    while (diff < -180) {
        diff += 360;
    }
    return Math.abs(diff);
});

const errorClass = computed(() => {
    if (errorDeg.value === null) {
        return "";
    }
    if (errorDeg.value < 5) {
        return "good";
    }
    if (errorDeg.value < 15) {
        return "warn";
    }
    return "bad";
});

const containerRef = ref(null);
const canvasRef = ref(null);

// Three.js
let renderer = null;
let scene = null;
let camera = null;
let headingGroup = null;
let quadGroup = null;
let magCylinders = null;
let animId = null;
let targetQuadRot = new THREE.Euler(0, 0, 0, "XYZ");

const MAG_SCALE = 0.15; // scale raw mag counts to world units

function initScene() {
    if (!canvasRef.value || !containerRef.value) {
        return;
    }
    const w = containerRef.value.clientWidth || 200;
    const h = containerRef.value.clientHeight || 200;

    renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();

    // Camera: top-down, same perspective as the main wizard 3D model
    // Screen up = world +Z = North, camera looking straight down
    camera = new THREE.PerspectiveCamera(35, w / Math.max(h, 1), 1, 1000);
    camera.position.set(0, 160, 0);
    camera.up.set(0, 0, -1); // screen up = world +Z
    camera.lookAt(0, 0, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0x888888));
    const d = new THREE.DirectionalLight(0xffffff, 0.8);
    d.position.set(0, 0.5, 1);
    scene.add(d);

    // Compass ring in XZ plane (horizontal, for top-down view)
    const ringGeo = new THREE.TorusGeometry(70, 1.2, 16, 64);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x446688, transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; // XY → XZ plane
    scene.add(ring);

    // Tick marks at N/E/S/W in XZ plane
    const tickGeo = new THREE.BoxGeometry(2, 1, 8);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x6688aa });
    const tickPositions = [
        [0, 0, 68],  // N (screen top = world +Z)
        [68, 0, 0],  // E (world +X)
        [0, 0, -68], // S
        [-68, 0, 0], // W
    ];
    for (const [x, y, z] of tickPositions) {
        const tick = new THREE.Mesh(tickGeo, tickMat);
        tick.position.set(x, y, z);
        scene.add(tick);
    }

    // Heading group — rotates around world Y (matches main wizard convention)
    // rotation.y = 0 → nose at world +Z = screen top = North
    headingGroup = new THREE.Object3D();
    scene.add(headingGroup);

    // Drone group (child of headingGroup) — pitch around X, roll around Z
    quadGroup = new THREE.Object3D();
    headingGroup.add(quadGroup);

    // Drone body: central bar along Z = forward (nose direction)
    const bodyGeo = new THREE.BoxGeometry(4, 4, 28);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x888888 }));
    quadGroup.add(body);

    // Nose arrow — bright green cone at +Z, pointing forward
    const noseGeo = new THREE.ConeGeometry(4, 8, 6);
    const noseArrow = new THREE.Mesh(noseGeo, new THREE.MeshBasicMaterial({ color: 0x44ff44 }));
    noseArrow.position.set(0, 3, 18);
    noseArrow.rotation.x = -Math.PI / 2;
    quadGroup.add(noseArrow);

    // Tail dot — small red sphere at -Z
    const tailGeo = new THREE.SphereGeometry(3, 6, 6);
    const tailDot = new THREE.Mesh(tailGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    tailDot.position.set(0, 0, -16);
    quadGroup.add(tailDot);

    // Front motors (green, at +Z end)
    const motorGeo = new THREE.CylinderGeometry(2.5, 2.5, 2, 8);
    const frontMotor = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0x44cc44 }));
    frontMotor.position.set(22, 0, 12);
    quadGroup.add(frontMotor);
    const frontMotor2 = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0x44cc44 }));
    frontMotor2.position.set(-22, 0, 12);
    quadGroup.add(frontMotor2);

    // Rear motors (red, at -Z end)
    const rearMotor = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0xcc4444 }));
    rearMotor.position.set(22, 0, -12);
    quadGroup.add(rearMotor);
    const rearMotor2 = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0xcc4444 }));
    rearMotor2.position.set(-22, 0, -12);
    quadGroup.add(rearMotor2);

    // Arms
    const armGeo = new THREE.CylinderGeometry(1.2, 1.2, 44, 6);
    const arm1 = new THREE.Mesh(armGeo, new THREE.MeshBasicMaterial({ color: 0x666666 }));
    arm1.rotation.y = Math.PI / 4;
    arm1.position.set(0, 0, 0);
    quadGroup.add(arm1);
    const arm2 = new THREE.Mesh(armGeo, new THREE.MeshBasicMaterial({ color: 0x666666 }));
    arm2.rotation.y = -Math.PI / 4;
    arm2.rotation.y = -Math.PI / 4;
    arm2.position.set(0, 0, 0);
    quadGroup.add(arm2);

    // Mag vector cylinders group (child of quadGroup — moves with drone)
    magCylinders = new THREE.Object3D();
    quadGroup.add(magCylinders);

    // State for smooth animation
    let curHeadingY = 0;   // headingGroup.rotation.y
    let curPitchX = 0;     // quadGroup.rotation.x
    let curRollZ = 0;      // quadGroup.rotation.z

    function animate() {
        animId = requestAnimationFrame(animate);
        if (!renderer || !scene || !camera) { return; }

        const lf = 0.15;
        curHeadingY += (targetQuadRot.y - curHeadingY) * lf;
        curPitchX += (targetQuadRot.x - curPitchX) * lf;
        curRollZ += (targetQuadRot.z - curRollZ) * lf;

        if (headingGroup) { headingGroup.rotation.y = curHeadingY; }
        if (quadGroup) {
            quadGroup.rotation.x = curPitchX;
            quadGroup.rotation.z = curRollZ;
        }

        renderer.render(scene, camera);
    }
    animate();
}

function updateAttitude() {
    // Top-down view, matching main wizard convention:
    // headingGroup.rotation.y rotates around world Y for cardinal direction
    // quadGroup.rotation.x = pitch (positive = nose up)
    // quadGroup.rotation.z = -roll (negative = right side up)
    targetQuadRot.set(
        props.pitch * DEG,           // X: pitch
        (props.heading - 90) * DEG,  // Y: heading, offset -90° so 0°=nose to world+Z=North
        -props.roll * DEG,           // Z: roll (negated, matching wizard convention)
    );
}

function updateMagCylinders() {
    if (!magCylinders) {
        return;
    }
    // Clear old cylinders
    while (magCylinders.children.length > 0) {
        magCylinders.remove(magCylinders.children[0]);
    }

    const [mx, my, mz] = props.mag || [0, 0, 0];
    const scale = MAG_SCALE;

    // Draw cylinders along world axes (body frame: X=right, Z=fwd, Y=up)
    const colors = [[1, 0.3, 0.3], [0.3, 1, 0.3], [0.3, 0.3, 1]];
    const comps = [mx, my, mz];

    for (let i = 0; i < 3; i++) {
        const val = comps[i] * scale;
        if (Math.abs(val) < 1) { continue; }
        const len = Math.abs(val);
        const geo = new THREE.CylinderGeometry(0.8, 0.8, len, 6);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i][0], colors[i][1], colors[i][2]), transparent: true, opacity: 0.7 });
        const cyl = new THREE.Mesh(geo, mat);
        if (i === 0) { cyl.position.set(val / 2, 0, 0); cyl.rotation.z = Math.PI / 2; }        // X
        else if (i === 1) { cyl.position.set(0, val / 2, 0); }                                // Y (up)
        else { cyl.position.set(0, 0, val / 2); cyl.rotation.x = Math.PI / 2; }              // Z (fwd)

        magCylinders.add(cyl);

        const tipGeo = new THREE.SphereGeometry(1.2, 6, 6);
        const tip = new THREE.Mesh(tipGeo, mat);
        if (i === 0) { tip.position.set(val, 0, 0); }
        else if (i === 1) { tip.position.set(0, val, 0); }
        else { tip.position.set(0, 0, val); }
        magCylinders.add(tip);
    }
}

watch(
    () => [props.mag, props.roll, props.pitch, props.heading, props.fieldStrength],
    () => {
        updateAttitude();
        updateMagCylinders();
    },
    { deep: true, immediate: true },
);

onMounted(() => {
    nextTick(() => {
        initScene();
        updateAttitude();
        updateMagCylinders();
    });
});

onScopeDispose(() => {
    if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
});
</script>

<style scoped>
.mag-mini {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 220px;
    background: #0d0d1a;
    border-radius: 6px;
    overflow: hidden;
}
.mag-mini-canvas {
    width: 100%;
    height: 100%;
    display: block;
}
.mag-mini-label-n,
.mag-mini-label-e,
.mag-mini-label-s,
.mag-mini-label-w {
    position: absolute;
    font-size: 12px;
    font-weight: 700;
    color: #ccc;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    z-index: 2;
}
.mag-mini-label-n {
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    color: #ff6666;
}
.mag-mini-label-s {
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
}
.mag-mini-label-e {
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
}
.mag-mini-label-w {
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
}
.mag-mini-error {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
    z-index: 2;
}
.mag-mini-error.good {
    color: #4ec97e;
    background: rgba(30, 80, 30, 0.6);
}
.mag-mini-error.warn {
    color: #eebb44;
    background: rgba(80, 60, 20, 0.6);
}
.mag-mini-error.bad {
    color: #ee4444;
    background: rgba(80, 20, 20, 0.6);
}
</style>
