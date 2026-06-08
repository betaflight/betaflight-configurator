<template>
    <dialog ref="dialogRef" class="mag-char-dialog" @cancel.prevent @close="onDialogClose">
        <div class="mag-char-container">
            <div class="mag-char-header">
                <h3 class="mag-char-title">Mag Super Calibration</h3>
                <button type="button" class="mag-char-close" @click="close">&times;</button>
            </div>

            <!-- Intro -->
            <div v-if="phase === 'intro'" class="mag-char-body">
                <div class="mag-char-setup-image">
                    <img src="../../images/drone_paper.jpg" alt="Drone on paper with compass rose" />
                </div>
                <h4>Magnetometer Alignment Wizard</h4>
                <p>
                    This tool determines the correct orientation of your magnetometer chip by comparing its readings
                    against a known physical reference.
                </p>
                <p><strong>You will need:</strong></p>
                <ul>
                    <li>A <strong>flat table</strong> with a large sheet of paper</li>
                    <li>A <strong>compass</strong> (or phone app) to draw N / E / S / W lines</li>
                    <li>A <strong>rigid support object</strong> &mdash; tissue box, book, battery pack</li>
                </ul>
                <p><strong>How it works:</strong></p>
                <ol>
                    <li>Draw cardinal lines (N / E / S / W) on the paper using a compass</li>
                    <li>The wizard guides you through 20 rest poses across 4 cardinal directions</li>
                    <li>At each pose, rest the drone and press SPACEBAR when stable</li>
                    <li>The solver recovers the correct sensor-to-body alignment</li>
                </ol>
            </div>

            <!-- Wizard body -->
            <div v-if="phase !== 'intro' && phase !== 'complete'" class="mag-char-wizard-body">
                <div class="mag-char-left">
                    <!-- Pose timeline grouped by direction -->
                    <div class="mag-char-pose-timeline">
                        <template v-for="(dir, di) in directions" :key="di">
                            <div class="mag-char-direction-header" :class="{ dimmed: di !== currentDirectionIndex }">
                                {{ dir.label }}
                            </div>
                            <div
                                v-for="(pose, pi) in dir.poses"
                                :key="di + '-' + pi"
                                class="mag-char-pose-step"
                                :class="{
                                    done: isPoseDone(di, pi),
                                    current: di === currentDirectionIndex && pi === currentSubPoseIndex,
                                    pending:
                                        !isPoseDone(di, pi) &&
                                        !(di === currentDirectionIndex && pi === currentSubPoseIndex),
                                }"
                            >
                                <span class="mag-char-pose-icon">
                                    {{ isPoseDone(di, pi) ? "✓" : "" }}
                                </span>
                                <span class="mag-char-pose-label">{{ pose.label }}</span>
                            </div>
                        </template>
                    </div>

                    <div v-if="currentPoseDef" class="mag-char-instructions">
                        <p class="mag-char-instruction-text">{{ currentPoseDef.instruction }}</p>
                        <p class="mag-char-instruction-hint">{{ currentDirection?.alignHint }}</p>
                    </div>
                </div>

                <div class="mag-char-right">
                    <div class="mag-char-visual">
                        <span class="mag-char-cardinal mag-char-cardinal-n">N</span>
                        <span class="mag-char-cardinal mag-char-cardinal-e">E</span>
                        <span class="mag-char-cardinal mag-char-cardinal-s">S</span>
                        <span class="mag-char-cardinal mag-char-cardinal-w">W</span>
                        <canvas ref="threeCanvas" class="mag-char-three-canvas"></canvas>
                    </div>
                </div>
            </div>

            <!-- Complete -->
            <div v-if="phase === 'complete'" class="mag-char-body">
                <div class="mag-char-summary-card">
                    <h4>Wizard Complete</h4>

                    <!-- Solver result -->
                    <div v-if="solverResult" class="mag-char-solver-result">
                        <div v-if="solverResult.error" class="mag-char-solver-error">
                            {{ solverResult.error }}
                        </div>
                        <template v-else>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Alignment</span>
                                <span class="mag-char-stat-value" style="color: #4ec97e; font-weight: 700">
                                    {{ solverResult.label }}
                                    <template v-if="solverResult.customAngles">
                                        ({{ solverResult.customAngles.roll.toFixed(0) }}°,
                                        {{ solverResult.customAngles.pitch.toFixed(0) }}°,
                                        {{ solverResult.customAngles.yaw.toFixed(0) }}°)
                                    </template>
                                </span>
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Quality</span>
                                <span class="mag-char-stat-value">{{ solverResult.qualityScore }}%</span>
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Residuals</span>
                                <span class="mag-char-stat-value">
                                    Z: {{ (solverResult.residuals.zRms * 100).toFixed(1) }}% | XY:
                                    {{ (solverResult.residuals.xyRms * 100).toFixed(1) }}%
                                </span>
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Field |B|</span>
                                <span class="mag-char-stat-value">
                                    {{ solverResult.fieldConsistency.mean }} nT
                                    <span v-if="solverResult.fieldConsistency.suspect" style="color: #ee4444">
                                        — suspicious (±{{ solverResult.fieldConsistency.maxDevPct }}%)</span
                                    >
                                    <span v-else style="color: #4ec97e">
                                        — consistent (±{{ solverResult.fieldConsistency.maxDevPct }}%)</span
                                    >
                                </span>
                            </div>
                            <div v-if="solverResult.chiralityFlag" class="mag-char-solver-row">
                                <span class="mag-char-stat-label" style="color: #ee4444">Chirality</span>
                                <span class="mag-char-stat-value" style="color: #ee4444"
                                    >Possible axis mirroring detected</span
                                >
                            </div>
                            <div class="mag-char-solver-row">
                                <span class="mag-char-stat-label">Yaw reference</span>
                                <span class="mag-char-stat-value">{{
                                    solverResult.yawAbsolute ? "Absolute (compass)" : "Relative (consistency only)"
                                }}</span>
                            </div>
                        </template>
                    </div>

                    <p style="margin-top: 12px">
                        {{ completedPoseCount }} poses captured across {{ directions.length }} directions.
                    </p>
                </div>

                <div class="mag-char-complete-actions">
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="downloadSamplesJSON">
                        Save Samples as JSON
                    </button>
                </div>
            </div>

            <!-- Footer -->
            <div class="mag-char-footer">
                <template v-if="phase === 'intro'">
                    <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="close">Cancel</button>
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="startWizard">
                        Begin Wizard
                    </button>
                </template>

                <div
                    v-if="phase === 'await' || phase === 'capturing' || phase === 'confirmed'"
                    class="mag-char-readout-lines"
                >
                    <div class="mag-char-readout-row">
                        <span class="mag-char-stability-dot" :class="{ stable: isStable && phase === 'await' }"></span>
                        <span
                            v-if="phase === 'await' && isStable"
                            class="mag-char-readout-item mag-char-spacebar-prompt"
                            >Press SPACEBAR to capture</span
                        >
                        <span v-else-if="phase === 'await'" class="mag-char-readout-item mag-char-unstable-text"
                            >Hold steady&hellip;</span
                        >
                        <span v-else-if="phase === 'capturing'" class="mag-char-readout-item mag-char-capturing-text"
                            >Capturing&hellip; {{ captureSamples }} samples</span
                        >
                        <span v-else class="mag-char-readout-item" style="color: #4ec97e"
                            >&#10003; Pose captured &mdash; advancing&hellip;</span
                        >
                        <span class="mag-char-readout-sep">|</span>
                        <span class="mag-char-readout-item">Gyro: {{ gyroRms.toFixed(1) }}&deg;/s</span>
                        <span class="mag-char-readout-item">R: {{ lastRoll.toFixed(1) }}&deg;</span>
                        <span class="mag-char-readout-item">P: {{ lastPitch.toFixed(1) }}&deg;</span>
                        <span class="mag-char-readout-spacer"></span>
                        <button
                            v-if="phase === 'await'"
                            type="button"
                            class="mag-char-btn mag-char-btn-cancel"
                            @click="skipPose"
                        >
                            Skip
                        </button>
                        <button
                            v-if="phase === 'await'"
                            type="button"
                            class="mag-char-btn mag-char-btn-cancel"
                            @click="cancelWizard"
                        >
                            Cancel
                        </button>
                    </div>
                    <div class="mag-char-readout-row mag-char-readout-row-secondary">
                        <span class="mag-char-readout-item">Mag X: {{ lastMag[0] }}</span>
                        <span class="mag-char-readout-item">Mag Y: {{ lastMag[1] }}</span>
                        <span class="mag-char-readout-item">Mag Z: {{ lastMag[2] }}</span>
                        <span class="mag-char-readout-sep">|</span>
                        <span class="mag-char-readout-item">|B|: {{ lastFieldStrength }}</span>
                    </div>
                </div>

                <button
                    v-if="phase === 'complete'"
                    type="button"
                    class="mag-char-btn mag-char-btn-primary"
                    @click="close"
                >
                    Close
                </button>
            </div>
        </div>
    </dialog>
</template>

<script setup>
/**
 * MagCharacterizationWizard — Full pose wizard with 3D visual aid.
 *
 * Poses: 4 cardinal directions × 5 poses = 20 total.
 * Each direction group: Flat, Nose Up (box under nose), Nose Down (box
 * under front), Box under left (Roll right), Box under right (Roll left).
 *
 * 3D VISUAL: Top-down Three.js camera (Y=80 looking at origin, screen-up=world+Z).
 * headingGroup rotates around world Y for cardinal direction (N/E/S/W).
 * droneModel rotates around local X (pitch) and Z (roll) for body pose.
 * Cardinal labels (N/E/S/W) are CSS overlays on the canvas.
 *
 * SENSOR READOUT: Passive sampling from fcStore (see implementation.md §9).
 */
import { ref, computed, onScopeDispose, onMounted, nextTick } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useFlightControllerStore } from "../../stores/fc";

const CAPTURE_DURATION_MS = 2000;
const POLL_MS = 80;
const STABILITY_THRESHOLD_DEG_S = 3;
const STABILITY_FRAMES = 10;
const CONFIRMED_DELAY_MS = 750;
const DEG_TO_RAD = Math.PI / 180;

const fcStore = useFlightControllerStore();
const dialogRef = ref(null);
const threeCanvas = ref(null);

// --- Pose definitions grouped by direction ---
const directions = [
    {
        label: "North (nose to N line)",
        alignHint: "Align drone nose with the N-S line, nose toward N.",
        heading: 0, // radians — expected heading when drone faces this cardinal line
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the N line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the N line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the N line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
    {
        label: "East (nose to E line)",
        alignHint: "Align drone nose with the E-W line, nose toward E.",
        heading: -Math.PI / 2,
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the E line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the E line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the E line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
    {
        label: "South (nose to S line)",
        alignHint: "Align drone nose with the N-S line, nose toward S.",
        heading: Math.PI,
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the S line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the S line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the S line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
    {
        label: "West (nose to W line)",
        alignHint: "Align drone nose with the E-W line, nose toward W.",
        heading: Math.PI / 2,
        poses: [
            {
                label: "Flat",
                instruction: "Rest the drone LEVEL on the paper. Nose pointing along the W line.",
                rotX: 0,
                rotZ: 0,
            },
            {
                label: "Nose Up (box under nose)",
                instruction: "Place box under FRONT arms. Nose tilts UP. Keep nose on the W line.",
                rotX: 35,
                rotZ: 0,
            },
            {
                label: "Nose Down (box under tail)",
                instruction: "Place box under REAR arms. Nose tilts DOWN. Keep nose on the W line.",
                rotX: -35,
                rotZ: 0,
            },
            {
                label: "Box under left (Roll right)",
                instruction: "Place box under LEFT side. Drone rolls RIGHT.",
                rotX: 0,
                rotZ: -25,
            },
            {
                label: "Box under right (Roll left)",
                instruction: "Place box under RIGHT side. Drone rolls LEFT.",
                rotX: 0,
                rotZ: 25,
            },
        ],
    },
];

// --- UI state ---
const phase = ref("intro");
const currentDirectionIndex = ref(0);
const currentSubPoseIndex = ref(0);
const isStable = ref(false);
const lastRoll = ref(0);
const lastPitch = ref(0);
const lastMag = ref([0, 0, 0]);
const lastFieldStrength = ref(0);
const gyroRms = ref(0);
const captureSamples = ref(0);
const captureData = ref([]); // [dirIdx][poseIdx] = { headingRef, samples[] } | null | undefined

function isPoseDone(di, pi) {
    return captureData.value[di]?.[pi] !== undefined;
}

const solverResult = ref(null);
const completedPoseCount = computed(() => {
    let c = 0;
    captureData.value.forEach((dc) => {
        if (dc) {
            dc.forEach((p) => {
                if (p) {
                    c++;
                }
            });
        }
    });
    return c;
});

// --- Three.js state ---
let renderer = null;
let scene = null;
let camera = null;
let headingGroup = null; // yaw rotation for cardinal direction (around world Y)
let droneModel = null;
let animFrameId = null;
let targetRotX = 0;
let targetRotZ = 0;
let targetHeading = 0;

function initThreeScene() {
    if (!threeCanvas.value) {
        return;
    }
    const parent = threeCanvas.value.parentElement;
    const w = parent.clientWidth || 300;
    const h = parent.clientHeight || 300;

    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas.value, alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();

    // Top-down camera: looking straight down at the drone on the "paper"
    camera = new THREE.PerspectiveCamera(40, w / Math.max(h, 1), 1, 500);
    camera.position.set(0, 120, 0);
    camera.up.set(0, 0, -1); // screen up = world +Z
    camera.lookAt(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0x808080));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.0);
    d1.position.set(0.5, 1, 0.5);
    scene.add(d1);

    // Heading group: rotates around world Y to point nose at N/E/S/W
    headingGroup = new THREE.Object3D();
    scene.add(headingGroup);

    // Load model
    const loader = new GLTFLoader();
    loader.load(
        "./resources/models/quad_x.gltf",
        (gltf) => {
            droneModel = gltf.scene;
            droneModel.scale.set(7, 7, 7);
            headingGroup.add(droneModel);
        },
        undefined,
        (err) => {
            console.warn("MagCharacterization: model load failed", err);
        },
    );

    function animate() {
        animFrameId = requestAnimationFrame(animate);

        if (!renderer || !scene || !camera) {
            return;
        }

        if (droneModel) {
            const lf = 0.1;
            droneModel.rotation.x += (targetRotX * DEG_TO_RAD - droneModel.rotation.x) * lf;
            droneModel.rotation.z += (targetRotZ * DEG_TO_RAD - droneModel.rotation.z) * lf;
        }
        if (headingGroup) {
            const lf = 0.08;
            headingGroup.rotation.y += (targetHeading - headingGroup.rotation.y) * lf;
        }

        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
    animate();
}

function updateModelTarget(dirHeading, poseRotX, poseRotZ) {
    targetHeading = dirHeading;
    targetRotX = poseRotX;
    targetRotZ = poseRotZ;
}

function disposeThreeScene() {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    scene = null;
    camera = null;
    headingGroup = null;
    droneModel = null;
}

// --- Sensor polling ---
let sampleTimer = null;
let gyroWindow = [];
let stableCount = 0;
let spacebarHandler = null;

function tick() {
    if (phase.value !== "await") {
        return;
    }

    const gx = fcStore.sensorData.gyroscope[0];
    const gy = fcStore.sensorData.gyroscope[1];
    const gz = fcStore.sensorData.gyroscope[2];
    const roll = fcStore.sensorData.kinematics[0];
    const pitch = fcStore.sensorData.kinematics[1];
    const mx = fcStore.sensorData.magnetometer[0];
    const my = fcStore.sensorData.magnetometer[1];
    const mz = fcStore.sensorData.magnetometer[2];

    lastRoll.value = roll;
    lastPitch.value = pitch;
    lastMag.value = [mx, my, mz];
    lastFieldStrength.value = Math.round(Math.hypot(mx, my, mz));

    const gyroMag = Math.hypot(gx, gy, gz);
    gyroWindow.push(gyroMag);
    if (gyroWindow.length > 6) {
        gyroWindow.shift();
    }
    if (gyroWindow.length > 0) {
        gyroRms.value = Math.sqrt(gyroWindow.reduce((s, v) => s + v * v, 0) / gyroWindow.length);
    }

    stableCount = gyroRms.value < STABILITY_THRESHOLD_DEG_S ? stableCount + 1 : 0;
    isStable.value = stableCount >= STABILITY_FRAMES;

    if (phase.value === "await") {
        sampleTimer = setTimeout(tick, POLL_MS);
    }
}

function onKeyDown(e) {
    if (e.code === "Space" && phase.value === "await" && isStable.value) {
        e.preventDefault();
        startCapture();
    }
}

// --- Phase transitions ---
function startWizard() {
    currentDirectionIndex.value = 0;
    currentSubPoseIndex.value = 0;
    captureData.value = directions.map(() => []);
    solverResult.value = null;
    gyroWindow = [];
    stableCount = 0;
    isStable.value = false;
    phase.value = "await";

    nextTick(() => {
        initThreeScene();
        refreshModelTarget();
        tick();
    });
}

function refreshModelTarget() {
    const dir = directions[currentDirectionIndex.value];
    const pose = dir?.poses[currentSubPoseIndex.value];
    if (dir && pose) {
        updateModelTarget(dir.heading, pose.rotX, pose.rotZ);
    }
}

function startCapture() {
    cleanup();
    phase.value = "capturing";
    captureSamples.value = 0;

    const poseSamples = [];
    const dirIdx = currentDirectionIndex.value;
    const poseIdx = currentSubPoseIndex.value;
    // headingRef is the expected heading (degrees) based on which cardinal line the nose faces
    const headingRefDeg = directions[dirIdx].heading * (180 / Math.PI);
    const captureStart = Date.now();

    // Real capture: read fcStore on a timer for CAPTURE_DURATION_MS
    function captureTick() {
        if (phase.value !== "capturing") {
            return;
        }
        const mx = fcStore.sensorData.magnetometer[0];
        const my = fcStore.sensorData.magnetometer[1];
        const mz = fcStore.sensorData.magnetometer[2];
        const roll = fcStore.sensorData.kinematics[0];
        const pitch = fcStore.sensorData.kinematics[1];
        const gx = fcStore.sensorData.gyroscope[0];
        const gy = fcStore.sensorData.gyroscope[1];
        const gz = fcStore.sensorData.gyroscope[2];
        const gyroMag = Math.hypot(gx, gy, gz);

        const elapsed = (Date.now() - captureStart) / 1000;
        poseSamples.push({
            mag: [mx, my, mz],
            roll,
            pitch,
            headingRef: headingRefDeg,
            gyro: [gx, gy, gz],
            gyroRms: gyroMag,
            t: elapsed,
        });
        captureSamples.value = poseSamples.length;

        if (elapsed * 1000 >= CAPTURE_DURATION_MS) {
            // Stop the polling timer
            if (sampleTimer !== null) {
                clearTimeout(sampleTimer);
                sampleTimer = null;
            }
            // Store captured data
            if (!captureData.value[dirIdx]) {
                captureData.value[dirIdx] = [];
            }
            captureData.value[dirIdx][poseIdx] = {
                headingRef: headingRefDeg,
                samples: poseSamples,
            };
            phase.value = "confirmed";
            setTimeout(() => {
                if (phase.value === "confirmed") {
                    advancePose();
                }
            }, CONFIRMED_DELAY_MS);
            return;
        }
        sampleTimer = setTimeout(captureTick, POLL_MS);
    }
    captureTick();
}

function skipPose() {
    if (phase.value !== "await") {
        return;
    }
    if (!captureData.value[currentDirectionIndex.value]) {
        captureData.value[currentDirectionIndex.value] = [];
    }
    captureData.value[currentDirectionIndex.value][currentSubPoseIndex.value] = null;
    advancePose();
}

function advancePose() {
    const dir = directions[currentDirectionIndex.value];
    if (currentSubPoseIndex.value + 1 < dir.poses.length) {
        currentSubPoseIndex.value++;
    } else {
        currentSubPoseIndex.value = 0;
        if (currentDirectionIndex.value + 1 < directions.length) {
            currentDirectionIndex.value++;
        } else {
            runSolver();
            return;
        }
    }
    gyroWindow = [];
    stableCount = 0;
    isStable.value = false;
    refreshModelTarget();
    phase.value = "await";
    tick();
}

function runSolver() {
    disposeThreeScene();
    phase.value = "complete";

    const allSamples = [];
    for (let di = 0; di < directions.length; di++) {
        for (let pi = 0; pi < directions[di].poses.length; pi++) {
            const cap = captureData.value[di]?.[pi];
            if (cap && cap.samples) {
                for (const s of cap.samples) {
                    allSamples.push({
                        mag: s.mag,
                        roll: s.roll,
                        pitch: s.pitch,
                        headingRef: s.headingRef,
                    });
                }
            }
        }
    }

    if (allSamples.length < 30) {
        solverResult.value = { error: "Not enough data — need at least 30 samples across all poses." };
        return;
    }

    const currentAlign = fcStore.sensorAlignment.align_mag || 0;
    const customAngles =
        currentAlign === 9
            ? {
                roll: fcStore.sensorAlignment.mag_align_roll || 0,
                pitch: fcStore.sensorAlignment.mag_align_pitch || 0,
                yaw: fcStore.sensorAlignment.mag_align_yaw || 0,
            }
            : null;

    const result = characterizeAlignment(allSamples, currentAlign, customAngles, {
        headingMode: "absolute",
        headingWeight: 1.0,
    });

    solverResult.value = result;
    console.log("=== MAG CHARACTERIZATION RESULT ===", result);
}

function cancelWizard() {
    cleanup();
    disposeThreeScene();
    phase.value = "intro";
    currentDirectionIndex.value = 0;
    currentSubPoseIndex.value = 0;
    captureData.value = [];
    solverResult.value = null;
    close();
}

function cleanup() {
    if (sampleTimer !== null) {
        clearTimeout(sampleTimer);
        sampleTimer = null;
    }
}

function downloadSamplesJSON() {
    const exportData = {
        metadata: {
            exportedAt: new Date().toISOString(),
            configuratorVersion: "2026.6.0-alpha",
            currentAlignment: fcStore.sensorAlignment.align_mag || 0,
            customAngles:
                fcStore.sensorAlignment.align_mag === 9
                    ? {
                        roll: fcStore.sensorAlignment.mag_align_roll || 0,
                        pitch: fcStore.sensorAlignment.mag_align_pitch || 0,
                        yaw: fcStore.sensorAlignment.mag_align_yaw || 0,
                    }
                    : null,
            totalPoses: completedPoseCount.value,
            totalSamples: captureData.value.reduce(
                (s, d) => s + (d || []).reduce((ss, c) => ss + (c?.samples?.length || 0), 0),
                0,
            ),
        },
        directions: directions.map((dir, di) => ({
            label: dir.label,
            heading: dir.heading,
            poses: dir.poses.map((pose, pi) => {
                const cap = captureData.value[di]?.[pi];
                return {
                    label: pose.label,
                    captured: !!cap,
                    sampleCount: cap?.samples?.length || 0,
                    samples: cap?.samples || [],
                };
            }),
        })),
        solverResult: solverResult.value,
        // NOTE: to use this data in tests, copy the "directions" array to
        // test/fixtures/mag_samples.json. Then import in your test and call
        // characterizeAlignment(flattenedSamples, currentAlignment, customAngles).
        // The flattenedSamples array should combine all pose samples with their
        // headingRef values — see the runSolver() function below for the
        // flattening pattern.
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mag-characterization-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function onDialogClose() {
    cleanup();
    disposeThreeScene();
    phase.value = "intro";
    captureData.value = [];
    solverResult.value = null;
}

// --- Dialog controls ---
let resizeObserver = null;

function show() {
    phase.value = "intro";
    currentDirectionIndex.value = 0;
    currentSubPoseIndex.value = 0;
    captureData.value = [];
    solverResult.value = null;
    dialogRef.value?.showModal();

    nextTick(() => {
        if (threeCanvas.value?.parentElement && !resizeObserver) {
            resizeObserver = new ResizeObserver(() => {
                if (renderer && threeCanvas.value?.parentElement) {
                    const { clientWidth: w, clientHeight: h } = threeCanvas.value.parentElement;
                    renderer.setSize(w, h);
                    if (camera) {
                        camera.aspect = w / Math.max(h, 1);
                        camera.updateProjectionMatrix();
                    }
                }
            });
            resizeObserver.observe(threeCanvas.value.parentElement);
        }
    });
}
function close() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    dialogRef.value?.close();
}

onMounted(() => {
    spacebarHandler = onKeyDown;
    window.addEventListener("keydown", spacebarHandler);
});
onScopeDispose(() => {
    cleanup();
    disposeThreeScene();
    if (spacebarHandler) {
        window.removeEventListener("keydown", spacebarHandler);
    }
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
});

defineExpose({ show, close });
</script>

<style scoped>
.mag-char-dialog {
    border: 1px solid #333;
    border-radius: 8px;
    padding: 0;
    width: 740px;
    max-width: 97vw;
    background: #1a1a2e;
    color: #e0e0e0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.mag-char-dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
}
.mag-char-dialog:not([open]) {
    display: none;
}
.mag-char-container {
    display: flex;
    flex-direction: column;
    max-height: 88vh;
}

.mag-char-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid #2a2a4a;
    background: #16162a;
    border-radius: 8px 8px 0 0;
    flex-shrink: 0;
}
.mag-char-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #c0c0e0;
}
.mag-char-close {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: #888;
    padding: 0 4px;
    line-height: 1;
}
.mag-char-close:hover {
    color: #e0e0e0;
}

.mag-char-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
}
.mag-char-setup-image {
    text-align: center;
    margin-bottom: 16px;
}
.mag-char-setup-image img {
    max-width: 100%;
    max-height: 170px;
    border-radius: 6px;
    border: 1px solid #333;
}
.mag-char-body h4 {
    margin: 0 0 10px;
    font-size: 15px;
    color: #7eb8ff;
}
.mag-char-body p {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.55;
}
.mag-char-body ul,
.mag-char-body ol {
    margin: 0 0 10px;
    padding-left: 22px;
    font-size: 13px;
    line-height: 1.55;
}
.mag-char-body li {
    margin-bottom: 3px;
}

/* Wizard left/right */
.mag-char-wizard-body {
    display: flex;
    flex: 1;
    min-height: 320px;
}
.mag-char-left {
    flex: 1;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-right: 1px solid #2a2a4a;
    min-width: 0;
    overflow-y: auto;
}
.mag-char-right {
    flex: 1;
    padding: 0;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    min-width: 0;
    background: #12122a;
}

/* Pose timeline */
.mag-char-pose-timeline {
    display: flex;
    flex-direction: column;
}
.mag-char-direction-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #7eb8ff;
    padding: 6px 8px 2px;
    margin-top: 2px;
    border-bottom: 1px solid #2a2a4a;
}
.mag-char-direction-header.dimmed {
    color: #444;
}
.mag-char-pose-step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 16px;
    border-radius: 4px;
    font-size: 12px;
    transition: background 0.2s;
}
.mag-char-pose-step.current {
    background: #2a2a5a;
    color: #fff;
}
.mag-char-pose-step.done {
    color: #4ec97e;
}
.mag-char-pose-step.pending {
    color: #444;
}
.mag-char-pose-icon {
    width: 16px;
    height: 16px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
}
.mag-char-pose-step.current .mag-char-pose-icon {
    background: #4a6cf7;
    color: #fff;
}
.mag-char-pose-step.done .mag-char-pose-icon {
    color: #4ec97e;
}

.mag-char-instruction-text {
    font-size: 12px;
    line-height: 1.45;
    margin: 0 0 4px;
}
.mag-char-instruction-hint {
    color: #777;
    font-size: 11px;
    font-style: italic;
    margin: 0;
}

/* 3D visual */
.mag-char-visual {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 280px;
    overflow: hidden;
}
.mag-char-three-canvas {
    width: 100%;
    height: 100%;
    display: block;
}
.mag-char-cardinal {
    position: absolute;
    font-size: 14px;
    font-weight: 700;
    color: #ccc;
    z-index: 2;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    pointer-events: none;
}
.mag-char-cardinal-n {
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    color: #ff6666;
    font-size: 16px;
}
.mag-char-cardinal-s {
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 16px;
}
.mag-char-cardinal-e {
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
}
.mag-char-cardinal-w {
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
}

/* Complete */
.mag-char-summary-card {
    padding: 16px;
    background: #222240;
    border-radius: 6px;
}
.mag-char-summary-card h4 {
    margin: 0 0 8px;
    color: #4a6cf7;
    font-size: 15px;
}
.mag-char-summary-card p {
    margin: 0 0 6px;
    font-size: 13px;
}
.mag-char-stats {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.mag-char-stat-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.mag-char-stat-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #777;
    letter-spacing: 0.5px;
}
.mag-char-stat-value {
    font-size: 12px;
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    color: #c0c0c0;
}

/* Footer */
.mag-char-footer {
    padding: 8px 14px;
    border-top: 1px solid #2a2a4a;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: #16162a;
    border-radius: 0 0 8px 8px;
    flex-shrink: 0;
    align-items: center;
    min-height: 52px;
}
.mag-char-readout-lines {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
}
.mag-char-readout-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    color: #7eb8ff;
    flex-wrap: wrap;
}
.mag-char-readout-row-secondary {
    color: #6699cc;
    font-size: 10px;
}
.mag-char-readout-item {
    white-space: nowrap;
}
.mag-char-readout-sep {
    color: #444;
    margin: 0 2px;
}
.mag-char-readout-spacer {
    flex: 1;
}
.mag-char-stability-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ee4444;
    flex-shrink: 0;
    transition: background 0.3s;
}
.mag-char-stability-dot.stable {
    background: #4ec97e;
    box-shadow: 0 0 6px #4ec97e;
}
.mag-char-spacebar-prompt {
    color: #4ec97e;
    font-weight: 600;
}
.mag-char-unstable-text {
    color: #ee4444;
}
.mag-char-capturing-text {
    color: #ffaa44;
}

.mag-char-btn {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid #3a3a5a;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
}
.mag-char-btn-cancel {
    background: #2a2a3e;
    color: #c0c0c0;
}
.mag-char-btn-cancel:hover {
    background: #3a3a5a;
}
.mag-char-btn-primary {
    background: #4a6cf7;
    color: #fff;
    border-color: #4a6cf7;
}
.mag-char-btn-primary:hover {
    background: #5a7cff;
}

/* Solver result rows */
.mag-char-solver-result {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.mag-char-solver-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
}
.mag-char-solver-error {
    color: #ee4444;
    font-size: 13px;
    font-weight: 600;
}
.mag-char-complete-actions {
    margin-top: 14px;
    display: flex;
    gap: 8px;
}
</style>
