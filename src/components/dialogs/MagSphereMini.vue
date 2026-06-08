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
let quadGroup = null; // rotates with attitude
let magCylinders = null;
let animId = null;
let targetQuadRot = new THREE.Euler(0, 0, 0, "ZYX");
let currentQuadRot = new THREE.Euler(0, 0, 0, "ZYX");

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

    // Camera: looking slightly down at the compass plane (Z-up like MagSphereView)
    camera = new THREE.PerspectiveCamera(35, w / Math.max(h, 1), 1, 1000);
    camera.position.set(0, -60, 120);
    camera.lookAt(0, 0, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0x888888));
    const d = new THREE.DirectionalLight(0xffffff, 0.8);
    d.position.set(0, 0.5, 1);
    scene.add(d);

    // Compass ring (thin circle at Z=0 in the horizontal plane)
    const ringGeo = new THREE.TorusGeometry(70, 1.2, 16, 64);
    const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0x446688, transparent: true, opacity: 0.6 }),
    );
    scene.add(ring);

    // Tick marks at N/E/S/W
    const tickGeo = new THREE.BoxGeometry(2, 8, 1);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x6688aa });
    const positions = [
        [0, 68, 0], // N (top in Z-up = world +Y)
        [68, 0, 0], // E (right = world +X)
        [0, -68, 0], // S
        [-68, 0, 0], // W
    ];
    for (const [x, y, z] of positions) {
        const tick = new THREE.Mesh(tickGeo, tickMat);
        tick.position.set(x, y, z);
        scene.add(tick);
    }

    // Quad group — rotates with attitude (ZYX Euler order)
    quadGroup = new THREE.Object3D();
    scene.add(quadGroup);

    // Drone body (central bar along X = forward)
    const bodyGeo = new THREE.BoxGeometry(30, 4, 4);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x888888 }));
    quadGroup.add(body);

    // Front motors (green, at +X end)
    const motorGeo = new THREE.CylinderGeometry(3, 3, 2, 8);
    const frontMotor = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0x44cc44 }));
    frontMotor.position.set(14, 22, 0);
    quadGroup.add(frontMotor);
    const frontMotor2 = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0x44cc44 }));
    frontMotor2.position.set(14, -22, 0);
    quadGroup.add(frontMotor2);

    // Rear motors (red, at -X end)
    const rearMotor = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0xcc4444 }));
    rearMotor.position.set(-14, 22, 0);
    quadGroup.add(rearMotor);
    const rearMotor2 = new THREE.Mesh(motorGeo, new THREE.MeshBasicMaterial({ color: 0xcc4444 }));
    rearMotor2.position.set(-14, -22, 0);
    quadGroup.add(rearMotor2);

    // Arms (thin cylinders)
    const armGeo = new THREE.CylinderGeometry(1.2, 1.2, 44, 6);
    const arm1 = new THREE.Mesh(armGeo, new THREE.MeshBasicMaterial({ color: 0x666666 }));
    arm1.rotation.z = Math.PI / 4;
    arm1.position.set(0, 0, 0);
    quadGroup.add(arm1);
    const arm2 = new THREE.Mesh(armGeo, new THREE.MeshBasicMaterial({ color: 0x666666 }));
    arm2.rotation.z = -Math.PI / 4;
    arm2.position.set(0, 0, 0);
    quadGroup.add(arm2);

    // Mag vector cylinders group
    magCylinders = new THREE.Object3D();
    quadGroup.add(magCylinders);

    function animate() {
        animId = requestAnimationFrame(animate);
        if (!renderer || !scene || !camera) {
            return;
        }

        // Smooth lerp to target attitude
        const lf = 0.15;
        currentQuadRot.x += (targetQuadRot.x - currentQuadRot.x) * lf;
        currentQuadRot.y += (targetQuadRot.y - currentQuadRot.y) * lf;
        currentQuadRot.z += (targetQuadRot.z - currentQuadRot.z) * lf;
        quadGroup.rotation.copy(currentQuadRot);

        renderer.render(scene, camera);
    }
    animate();
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

    // Draw a cylinder from origin to scaled mag vector
    const colors = [
        [1, 0.3, 0.3],
        [0.3, 1, 0.3],
        [0.3, 0.3, 1],
    ];
    const comps = [mx, my, mz];

    for (let i = 0; i < 3; i++) {
        const val = comps[i] * scale;
        if (Math.abs(val) < 1) {
            continue;
        }
        const len = Math.abs(val);
        const geo = new THREE.CylinderGeometry(0.8, 0.8, len, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(colors[i][0], colors[i][1], colors[i][2]),
            transparent: true,
            opacity: 0.7,
        });
        const cyl = new THREE.Mesh(geo, mat);
        // Position cylinder halfway along the axis
        if (i === 0) {
            cyl.position.set(val / 2, 0, 0);
            cyl.rotation.z = Math.PI / 2;
        } else if (i === 1) {
            cyl.position.set(0, val / 2, 0);
            cyl.rotation.x = Math.PI / 2;
        } else {
            cyl.position.set(0, 0, val / 2);
        }
        magCylinders.add(cyl);

        // Small sphere at the tip
        const tipGeo = new THREE.SphereGeometry(1.2, 6, 6);
        const tip = new THREE.Mesh(tipGeo, mat);
        if (i === 0) {
            tip.position.set(val, 0, 0);
        } else if (i === 1) {
            tip.position.set(0, val, 0);
        } else {
            tip.position.set(0, 0, val);
        }
        magCylinders.add(tip);
    }
}

function updateAttitude() {
    // In MagSphereView Z-up display frame:
    // Rotation is applied to the quad group.
    // The drone faces +X in its local frame (nose forward).
    // We need to orient the quad so:
    //   pitch rotates around Y (body right axis)
    //   roll rotates around X (body forward axis)
    //   heading rotates around Z (body up axis, after roll/pitch)
    //
    // In the Z-up display, the camera looks from (0, -60, 120) at origin.
    // The quad's local +X (nose) should point toward screen-top (the N label).
    //
    // We start with the quad at identity (nose = +X = right on screen).
    // Rotate by -heading around Z to point nose toward the N label.
    // Then apply pitch (around quad's Y after heading rot) and roll (around X).
    targetQuadRot.set(
        props.pitch * DEG,
        -props.heading * DEG + Math.PI / 2, // -heading rotates nose to N; +90° aligns local X to world Y (screen up)
        -props.roll * DEG,
    );
    // Use ZYX order: Z first (roll), then Y (heading), then X (pitch)
    targetQuadRot.order = "ZYX";
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
