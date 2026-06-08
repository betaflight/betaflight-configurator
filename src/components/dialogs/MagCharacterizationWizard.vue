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
            <div v-if="phase !== 'intro' && phase !== 'complete' && phase !== 'replay'" class="mag-char-wizard-body">
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

            <!-- Replay phase — 3-way split validation -->
            <div v-if="phase === 'replay'" class="mag-char-wizard-body">
                <div class="mag-char-replay-container">
                    <div class="mag-char-replay-controls">
                        <span class="mag-char-replay-pose-label">
                            Pose {{ replayIndex + 1 }}/{{ replayData.length }} — {{ currentReplayPose?.poseLabel }}
                        </span>
                        <span class="mag-char-replay-dir-label">{{ currentReplayPose?.dirLabel }}</span>
                        <span class="mag-char-replay-spacer"></span>
                        <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="replayPrev">
                            &larr;
                        </button>
                        <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="toggleAutoPlay">
                            {{ isAutoPlaying ? "⏸ Pause" : "▶ Play" }}
                        </button>
                        <button type="button" class="mag-char-btn mag-char-btn-cancel" @click="replayNext">
                            &rarr;
                        </button>
                        <button type="button" class="mag-char-btn mag-char-btn-primary" @click="finishReplay">
                            View Results
                        </button>
                    </div>
                    <div class="mag-char-replay-views">
                        <div class="mag-char-replay-view">
                            <span class="mag-char-replay-view-label">Drone Attitude</span>
                            <div class="mag-char-replay-drone">
                                <div class="mag-char-replay-drone-info">
                                    <div>Roll: {{ currentReplayPose?.roll?.toFixed(1) || "—" }}&deg;</div>
                                    <div>Pitch: {{ currentReplayPose?.pitch?.toFixed(1) || "—" }}&deg;</div>
                                    <div>
                                        Expected: {{ currentReplayPose?.expectedHeading?.toFixed(0) || "—" }}&deg;
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mag-char-replay-view">
                            <span class="mag-char-replay-view-label">Mag NOW (current align)</span>
                            <MagSphereMini
                                v-if="currentReplayPose"
                                :mag="currentReplayPose.currentMag"
                                :roll="currentReplayPose.roll"
                                :pitch="currentReplayPose.pitch"
                                :heading="currentReplayPose.currentHeading"
                                :expected-heading="currentReplayPose.expectedHeading"
                                :field-strength="1000"
                            />
                        </div>
                        <div class="mag-char-replay-view">
                            <span class="mag-char-replay-view-label">Mag NEW (proposed align)</span>
                            <MagSphereMini
                                v-if="currentReplayPose"
                                :mag="currentReplayPose.newMag"
                                :roll="currentReplayPose.roll"
                                :pitch="currentReplayPose.pitch"
                                :heading="currentReplayPose.newHeading"
                                :expected-heading="currentReplayPose.expectedHeading"
                                :field-strength="1000"
                            />
                        </div>
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
                            <div v-if="calibrationOffsets" class="mag-char-solver-row">
                                <span class="mag-char-stat-label" style="color: #eebb44">Suggested Calibration</span>
                                <span class="mag-char-stat-value" style="color: #eebb44">
                                    mag_calibration = {{ calibrationOffsets.x }}, {{ calibrationOffsets.y }},
                                    {{ calibrationOffsets.z }}
                                    <span v-if="geoReference" class="mag-char-cal-note">
                                        (based on {{ geoReference.inclination.toFixed(0) }}&deg; incl,
                                        {{ geoReference.declination.toFixed(0) }}&deg; decl,
                                        {{ geoReference.fieldStrength }} nT)
                                    </span>
                                </span>
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
                    <button
                        type="button"
                        class="mag-char-btn mag-char-btn-cancel"
                        :disabled="isFetchingGeo"
                        @click="refreshGeoReference"
                    >
                        {{ isFetchingGeo ? "Fetching GPS..." : "Refresh GPS" }}
                    </button>
                    <button
                        v-if="solverResult && !solverResult.error"
                        type="button"
                        class="mag-char-btn mag-char-btn-primary"
                        style="background: #eebb44; border-color: #eebb44"
                        @click="doApplyAndReboot"
                    >
                        Apply Alignment &amp; Reboot
                    </button>
                </div>
                <p v-if="!geoReference" class="mag-char-geo-hint">
                    No GPS reference available. Click "Refresh GPS" for declination + calibration, or set declination
                    manually in the Sensors tab after applying.
                </p>
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

                <!-- Replay footer -->
                <div v-if="phase === 'replay'" class="mag-char-readout-bar">
                    <span class="mag-char-readout-item">Auto-playing {{ replayData.length }} poses</span>
                    <span class="mag-char-readout-spacer"></span>
                    <button type="button" class="mag-char-btn mag-char-btn-primary" @click="finishReplay">
                        Skip to Results
                    </button>
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
/**
 * MagCharacterizationWizard — Full pose wizard with 3D visual aid.
 *
 * UI shell consuming useMagCharacterization.js composable.
 * The composable owns all state, the dialog owns the template + 3D model.
 *
 * 3D VISUAL: Top-down Three.js camera. headingGroup rotates for cardinal
 * direction, droneModel for pitch/roll. N/E/S/W labels CSS-overlaid.
 */
import { ref, computed, watch, onScopeDispose, onMounted, nextTick } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useMagCharacterization } from "../../composables/useMagCharacterization.js";
import MagSphereMini from "./MagSphereMini.vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";

const DEG_TO_RAD = Math.PI / 180;

// ── Composable (all state + logic) ─────────────────────────────────────
const mag = useMagCharacterization();

// Template helper — checks whether a pose at (dirIdx, poseIdx) has been captured
function isPoseDone(di, pi) {
    return captureData.value[di]?.[pi] !== undefined;
}

const {
    directions,
    phase,
    currentDirectionIndex,
    currentSubPoseIndex,
    isStable,
    lastRoll,
    lastPitch,
    lastMag,
    lastFieldStrength,
    gyroRms,
    captureSamples,
    captureData,
    solverResult,
    currentDirection,
    currentPoseDef,
    completedPoseCount,
    startWizard,
    cancelWizard: cancelWizardInner,
    skipPose,
    onKeyDown,
    reset,
    downloadSamplesJSON,
    finishReplay,
    replayData,
    calibrationOffsets,
    geoReference,
    isFetchingGeo,
    refreshGeoReference,
    applyAndReboot,
} = mag;

// ── Replay controls ───────────────────────────────────────────────────
const replayIndex = ref(0);
const isAutoPlaying = ref(true);
let autoPlayTimer = null;

const currentReplayPose = computed(() => replayData.value[replayIndex.value] || null);

function replayPrev() {
    isAutoPlaying.value = false;
    if (replayIndex.value > 0) {
        replayIndex.value--;
    }
}
function replayNext() {
    isAutoPlaying.value = false;
    if (replayIndex.value < replayData.value.length - 1) {
        replayIndex.value++;
    }
}
function toggleAutoPlay() {
    isAutoPlaying.value = !isAutoPlaying.value;
    if (isAutoPlaying.value) {
        startAutoPlay();
    } else {
        stopAutoPlay();
    }
}
function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
        if (!isAutoPlaying.value || replayData.value.length === 0) {
            return;
        }
        if (replayIndex.value >= replayData.value.length - 1) {
            replayIndex.value = 0;
        } else {
            replayIndex.value++;
        }
    }, 1200);
}
function stopAutoPlay() {
    if (autoPlayTimer !== null) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
    }
}

// Watch for replay phase entry — start auto-play
watch(
    () => mag.phase.value,
    (p) => {
        if (p === "replay") {
            replayIndex.value = 0;
            isAutoPlaying.value = true;
            startAutoPlay();
        } else {
            stopAutoPlay();
        }
    },
);

// ── Dialog refs ────────────────────────────────────────────────────────
const dialogRef = ref(null);
const threeCanvas = ref(null);
let resizeObserver = null;

// ── Three.js ───────────────────────────────────────────────────────────
let renderer = null;
let scene = null;
let camera = null;
let headingGroup = null;
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
    camera = new THREE.PerspectiveCamera(40, w / Math.max(h, 1), 1, 500);
    camera.position.set(0, 120, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x808080));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.0);
    d1.position.set(0.5, 1, 0.5);
    scene.add(d1);

    headingGroup = new THREE.Object3D();
    scene.add(headingGroup);

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

function refreshModelTarget() {
    const dir = directions[currentDirectionIndex.value];
    const pose = dir?.poses[currentSubPoseIndex.value];
    if (dir && pose) {
        updateModelTarget(dir.heading, pose.rotX, pose.rotZ);
    }
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

// ── Wire composable callbacks ──────────────────────────────────────────
mag.setCallbacks({
    onWizardStarted: () => {
        initThreeScene();
        refreshModelTarget();
    },
    onPoseAdvanced: refreshModelTarget,
    onSolverAboutToRun: disposeThreeScene,
});

// ── Dialog controls ────────────────────────────────────────────────────
let spacebarHandler = null;

function show() {
    reset();
    nextTick(() => {
        dialogRef.value?.showModal();
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

function cancelWizard() {
    cancelWizardInner();
    close();
}

function close() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    dialogRef.value?.close();
}

async function doApplyAndReboot() {
    if (!applyAndReboot()) {
        return;
    }

    // Confirm reboot
    if (
        !confirm(
            "Apply alignment and reboot the flight controller?\\n\\nThe FC will disconnect and you\\'ll need to reconnect.",
        )
    ) {
        return;
    }

    try {
        // Write MSP commands (same pattern as SensorsTab.saveConfig)
        const mspHelper = MSP;
        await MSP.promise(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT));

        // Write calibration if available
        if (window.__magCharApplyCmd) {
            // Calibration needs CLI — deferred for now
            console.log("Apply calibration (requires CLI):", window.__magCharApplyCmd);
        }

        // Write declination if available
        if (window.__magCharDeclination !== undefined) {
            // Declination is set via MSP_COMPASS_CONFIG — deferred for now
            console.log("Apply declination:", window.__magCharDeclination);
        }

        // Save and reboot
        await new Promise((resolve) => {
            mspHelper.writeConfiguration(false, () => {
                close();
                resolve();
            });
        });
    } catch (e) {
        console.error("Failed to apply alignment", e);
        alert(`Failed to apply: ${e.message || e}`);
    }
}

onMounted(() => {
    spacebarHandler = onKeyDown;
    window.addEventListener("keydown", spacebarHandler);
});

onScopeDispose(() => {
    mag.cleanupTimer();
    disposeThreeScene();
    stopAutoPlay();
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

/* Replay phase */
.mag-char-replay-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 12px;
}
.mag-char-replay-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    font-size: 12px;
    border-bottom: 1px solid #2a2a4a;
    margin-bottom: 10px;
    flex-shrink: 0;
}
.mag-char-replay-pose-label {
    color: #c0c0c0;
    font-weight: 600;
}
.mag-char-replay-dir-label {
    color: #7eb8ff;
}
.mag-char-replay-spacer {
    flex: 1;
}
.mag-char-replay-views {
    display: flex;
    gap: 8px;
    flex: 1;
    min-height: 0;
}
.mag-char-replay-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.mag-char-replay-view-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #777;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    text-align: center;
}
.mag-char-replay-drone {
    flex: 1;
    min-height: 180px;
    background: #0d0d1a;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.mag-char-replay-drone-info {
    text-align: center;
    font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
    font-size: 14px;
    color: #7eb8ff;
    line-height: 1.8;
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
    flex-wrap: wrap;
}
.mag-char-geo-hint {
    font-size: 11px;
    color: #888;
    margin-top: 8px;
    font-style: italic;
}
.mag-char-cal-note {
    font-size: 10px;
    color: #888;
    display: block;
    margin-top: 2px;
}
</style>
