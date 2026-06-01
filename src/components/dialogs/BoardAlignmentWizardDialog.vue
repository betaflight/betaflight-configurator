<template>
    <dialog ref="dialogRef" class="boardAlignmentWizard-dialog" @cancel="handleCancel">
        <div class="wizard-container">
            <header class="wizard-header">
                <h3 v-html="i18nMessage('boardAlignmentWizard-DialogTitle')"></h3>
                <button class="wizard-close" type="button" @click.prevent="onCancel" aria-label="Close">×</button>
            </header>

            <div class="wizard-body">
                <!-- Left column: instructions, progress, controls -->
                <div class="wizard-instructions">
                    <!-- Intro -->
                    <div v-if="phase === 'intro'">
                        <p v-html="i18nMessage('boardAlignmentWizard-Intro')"></p>
                        <ol class="wizard-steps">
                            <li v-html="i18nMessage('boardAlignmentWizard-StepFlat')"></li>
                            <li v-html="i18nMessage('boardAlignmentWizard-StepPitchUp')"></li>
                            <li v-html="i18nMessage('boardAlignmentWizard-StepRollRight')"></li>
                            <li v-html="i18nMessage('boardAlignmentWizard-StepYawCW')"></li>
                        </ol>
                        <div v-if="!hasAccSensor" class="wizard-warning">
                            {{ i18nMessage("boardAlignmentWizard-NoAccelerometer") }}
                        </div>
                        <div v-else-if="accNeedsCalibration" class="wizard-warning">
                            {{ i18nMessage("boardAlignmentWizard-AccNeedsCalibration") }}
                        </div>
                    </div>

                    <!-- Collecting phases share the same hint+capture layout -->
                    <div v-else-if="isCollectingPhase">
                        <h4 v-html="phaseHintText"></h4>
                        <p class="wizard-substep">{{ phaseProgressText }}</p>
                        <div v-if="phaseDetail" class="wizard-detail">{{ phaseDetail }}</div>
                    </div>

                    <!-- Computing -->
                    <div v-else-if="phase === 'computing'">
                        <h4 v-html="i18nMessage('boardAlignmentWizard-Computing')"></h4>
                    </div>

                    <!-- Result: no change -->
                    <div v-else-if="phase === 'result_nochange'">
                        <h4 v-html="i18nMessage('boardAlignmentWizard-ResultNoChange')"></h4>
                        <div class="wizard-detail">
                            {{ i18nMessage("boardAlignmentWizard-ResultCurrent") }}: {{ props.currentAlignment.roll }}°
                            / {{ props.currentAlignment.pitch }}° / {{ props.currentAlignment.yaw }}°
                        </div>
                    </div>

                    <!-- Result -->
                    <div v-else-if="phase === 'result'">
                        <h4 v-html="i18nMessage('boardAlignmentWizard-ResultTitle')"></h4>
                        <table class="wizard-result-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>{{ i18nMessage("configurationBoardAlignmentRoll") }}</th>
                                    <th>{{ i18nMessage("configurationBoardAlignmentPitch") }}</th>
                                    <th>{{ i18nMessage("configurationBoardAlignmentYaw") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{{ i18nMessage("boardAlignmentWizard-ResultCurrent") }}</td>
                                    <td>{{ props.currentAlignment.roll }}°</td>
                                    <td>{{ props.currentAlignment.pitch }}°</td>
                                    <td>{{ props.currentAlignment.yaw }}°</td>
                                </tr>
                                <tr class="wizard-result-detected">
                                    <td>{{ i18nMessage("boardAlignmentWizard-ResultDetected") }}</td>
                                    <td>{{ detected.roll }}°</td>
                                    <td>{{ detected.pitch }}°</td>
                                    <td>{{ detected.yaw }}°</td>
                                </tr>
                            </tbody>
                        </table>
                        <div v-if="confidence !== 'high'" class="wizard-warning">
                            {{ i18nMessage("boardAlignmentWizard-LowConfidence") }}
                        </div>
                    </div>

                    <!-- Test phase: live attitude -->
                    <div v-else-if="phase === 'test'">
                        <h4 v-html="i18nMessage('boardAlignmentWizard-Test')"></h4>
                        <div class="wizard-detail">
                            {{ i18nMessage("boardAlignmentWizard-ResultDetected") }}: {{ detected.roll }}° /
                            {{ detected.pitch }}° / {{ detected.yaw }}°
                        </div>
                    </div>

                    <!-- Error -->
                    <div v-else-if="phase === 'error'">
                        <h4 class="wizard-warning">{{ errorMessage }}</h4>
                    </div>

                    <div class="wizard-buttons">
                        <button
                            v-if="phase === 'intro'"
                            class="regular-button primary"
                            :disabled="!canStartWizard"
                            @click.prevent="startWizard"
                        >
                            {{ i18nMessage("boardAlignmentWizard-Start") }}
                        </button>
                        <button v-if="phase === 'result'" class="regular-button" @click.prevent="enterTestPhase">
                            {{ i18nMessage("boardAlignmentWizard-Test") }}
                        </button>
                        <button v-if="phase === 'test'" class="regular-button" @click.prevent="phase = 'result'">
                            {{ i18nMessage("boardAlignmentWizard-Back") }}
                        </button>
                        <button
                            v-if="phase === 'result' || phase === 'test'"
                            class="regular-button primary"
                            @click.prevent="onApply"
                        >
                            {{ i18nMessage("boardAlignmentWizard-Apply") }}
                        </button>
                        <button
                            v-if="phase === 'result_nochange'"
                            class="regular-button primary"
                            @click.prevent="onCancel"
                        >
                            {{ i18nMessage("close") }}
                        </button>
                        <button v-if="phase === 'error'" class="regular-button" @click.prevent="resetToIntro">
                            {{ i18nMessage("boardAlignmentWizard-Retry") }}
                        </button>
                        <button
                            v-if="phase !== 'intro' && phase !== 'result_nochange'"
                            class="regular-button"
                            @click.prevent="onCancel"
                        >
                            {{ i18nMessage("boardAlignmentWizard-Cancel") }}
                        </button>
                    </div>
                </div>

                <!-- Right column: 3D model -->
                <div class="wizard-model">
                    <div ref="modelWrapper" class="wizard-model-canvas-wrapper background_paper">
                        <canvas
                            ref="modelCanvas"
                            :aria-label="i18nMessage('boardAlignmentWizard-DialogTitle')"
                        ></canvas>
                    </div>
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import Model from "@/js/model";
import { i18n } from "@/js/localization";
import { have_sensor } from "@/js/sensor_helpers";
import { bit_check } from "@/js/bit";
import { detectBoardAlignment, meanVec3, tiltAngleDeg } from "@/js/utils/boardAlignment";

const ACC_NEEDS_CALIBRATION_BIT = 0;

const props = defineProps({
    currentAlignment: {
        type: Object,
        required: true,
    },
});

const emit = defineEmits(["apply", "close"]);

const fcStore = useFlightControllerStore();
const dialogRef = ref(null);
const modelWrapper = ref(null);
const modelCanvas = ref(null);

// --- Constants ---
const POLL_MS = 50;
const SAMPLE_BUFFER_LEN = 6;
const DEG_TO_RAD = Math.PI / 180;
const ANIMATION_PERIOD_MS = 2400;

// Flat capture: require the accel direction to stop wandering and the gyro to be
// reasonably calm, then hold for ~1.5 s. Thresholds are deliberately loose so that
// hand-held capture and slightly vibrating surfaces still settle.
const FLAT_GYRO_THRESHOLD_DPS = 30;
const FLAT_DRIFT_DEG = 10;
const FLAT_HOLD_MS = 1500;

// Tilt capture: drone is held in the air. Gyro will jitter from hand tremor, so we
// ignore gyro entirely and use *accel-direction stability* instead — the user just has
// to hold the pose roughly steady for ~400 ms.
const TILT_DETECT_DEG = 22;
const TILT_STABILITY_RANGE_DEG = 8;
const TILT_HOLD_MS = 400;

// Returning to level: be lenient on both tilt threshold and stability so the user can
// quickly proceed to the next gesture.
const LEVEL_RETURN_DEG = 12;
const LEVEL_HOLD_MS = 400;

const YAW_DETECT_DEG = 25;

const COLLECTING_PHASES = new Set([
    "await_flat",
    "await_pitch",
    "await_level_1",
    "await_roll",
    "await_level_2",
    "await_yaw",
]);

// --- State ---
const phase = ref("intro");
const errorMessage = ref("");
const detected = reactive({ roll: 0, pitch: 0, yaw: 0 });
const confidence = ref("high");

const i18nMessage = (key) => i18n.getMessage(key);

const hasAccSensor = computed(() => {
    const sensors = fcStore.config?.activeSensors;
    if (sensors === undefined) {
        return true; // Permissive: allow opening if we can't read sensor state yet.
    }
    return have_sensor(sensors, "acc");
});

const accNeedsCalibration = computed(() => {
    const flags = fcStore.config?.configurationProblems;
    if (flags === undefined) {
        return false;
    }
    return bit_check(flags, ACC_NEEDS_CALIBRATION_BIT);
});

const canStartWizard = computed(() => hasAccSensor.value && !accNeedsCalibration.value);

const isCollectingPhase = computed(() => COLLECTING_PHASES.has(phase.value));

const phaseHintText = computed(() => {
    switch (phase.value) {
        case "await_flat":
            return i18nMessage("boardAlignmentWizard-HintFlat");
        case "await_pitch":
            return i18nMessage("boardAlignmentWizard-HintPitchUp");
        case "await_level_1":
        case "await_level_2":
            return i18nMessage("boardAlignmentWizard-HintLevel");
        case "await_roll":
            return i18nMessage("boardAlignmentWizard-HintRollRight");
        case "await_yaw":
            return i18nMessage("boardAlignmentWizard-HintYawCW");
        default:
            return "";
    }
});

const phaseProgressText = computed(() => {
    const step = phaseStepNumber.value;
    if (step <= 0) return "";
    return `${i18nMessage("boardAlignmentWizard-Step")} ${step} / 4`;
});

const phaseDetail = ref("");

const phaseStepNumber = computed(() => {
    switch (phase.value) {
        case "await_flat":
            return 1;
        case "await_pitch":
        case "await_level_1":
            return 2;
        case "await_roll":
        case "await_level_2":
            return 3;
        case "await_yaw":
            return 4;
        default:
            return 0;
    }
});

// --- Sample buffers ---
let accelBuf = []; // rolling buffer of recent accel vectors
let gyroBuf = []; // rolling buffer of recent gyro vectors
let pollTimer = null;
let isPolling = false;

// Captured pose averages
const captured = {
    flatAccel: null,
    pitchAccel: null,
    rollAccel: null,
    upAxis: null,
    yawIntegralDeg: 0,
};

// --- Model & animation ---
let modelInstance = null;
let animationFrameId = null;
let animationStartTime = 0;
let boundResize = null;

function initModel() {
    if (!modelWrapper.value || !modelCanvas.value) {
        return;
    }
    try {
        modelInstance = new Model(modelWrapper.value, modelCanvas.value);
        boundResize = modelInstance.resize.bind(modelInstance);
        window.addEventListener("resize", boundResize);
    } catch (e) {
        console.error("Failed to init wizard 3D model", e);
    }
}

function disposeModel() {
    stopAnimation();
    if (modelInstance) {
        if (boundResize) {
            window.removeEventListener("resize", boundResize);
            boundResize = null;
        }
        if (typeof modelInstance.dispose === "function") {
            modelInstance.dispose();
        }
        modelInstance = null;
    }
}

// No base yaw offset — the model's native orientation has the nose pointing away from
// the user, which matches the physical setup the wizard expects.
const MODEL_BASE_YAW_RAD = 0;

function setModelRotation(rollDeg, pitchDeg, yawDeg) {
    if (!modelInstance) return;
    const x = pitchDeg * -DEG_TO_RAD;
    const y = yawDeg * DEG_TO_RAD + MODEL_BASE_YAW_RAD;
    const z = rollDeg * -DEG_TO_RAD;
    modelInstance.rotateTo(x, y, z);
}

/**
 * Tilt the modelWrapper to give a top-down view of the drone. rotateTo() does not
 * touch wrapper.rotation.x, so setting it here persists across the yaw animation.
 */
function setTopDownView(enabled) {
    if (!modelInstance?.modelWrapper) return;
    modelInstance.modelWrapper.rotation.x = enabled ? Math.PI / 2 : 0;
}

function stopAnimation() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

/**
 * Drive the 3D model with a phase-specific looped animation showing the target
 * gesture. Pitch up = oscillate pitch 0 → 45 → 0; roll right = roll 0 → 45 → 0;
 * yaw CW = yaw 0 → -45 → 0.
 */
function startPhaseAnimation() {
    stopAnimation();
    animationStartTime = performance.now();
    setTopDownView(phase.value === "await_yaw");

    const targetAngle = 45;
    const tick = () => {
        const t = ((performance.now() - animationStartTime) % ANIMATION_PERIOD_MS) / ANIMATION_PERIOD_MS;
        // Two-phase wave: 0 → 1 → 0 across the period.
        const wave = t < 0.5 ? t * 2 : (1 - t) * 2;

        let r = 0;
        let p = 0;
        let y = 0;
        switch (phase.value) {
            case "await_pitch":
                p = targetAngle * wave;
                break;
            case "await_roll":
                r = targetAngle * wave;
                break;
            case "await_yaw":
                y = -targetAngle * wave;
                break;
            default:
                break;
        }
        setModelRotation(r, p, y);
        animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
}

function startLiveAttitudeRender() {
    stopAnimation();
    const tick = () => {
        const k = fcStore.sensorData?.kinematics;
        if (k) {
            setModelRotation(k[0], k[1], 0); // ignore heading for the test view
        }
        animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
}

// --- Polling ---

function startPolling() {
    if (isPolling) return;
    isPolling = true;
    pollLoop();
}

function stopPolling() {
    isPolling = false;
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function pollLoop() {
    if (!isPolling) return;
    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, () => {
        if (!isPolling) return;
        onImuSample();
        pollTimer = setTimeout(pollLoop, POLL_MS);
    });
}

// Rolling tilt history (one number per IMU sample) used for accel-direction stability.
let tiltHistory = [];
let phaseEnteredAt = 0;

function onImuSample() {
    const accel = [
        fcStore.sensorData.accelerometer[0],
        fcStore.sensorData.accelerometer[1],
        fcStore.sensorData.accelerometer[2],
    ];
    const gyro = [fcStore.sensorData.gyroscope[0], fcStore.sensorData.gyroscope[1], fcStore.sensorData.gyroscope[2]];

    accelBuf.push(accel);
    gyroBuf.push(gyro);
    if (accelBuf.length > SAMPLE_BUFFER_LEN) {
        accelBuf.shift();
        gyroBuf.shift();
    }

    if (accelBuf.length < SAMPLE_BUFFER_LEN) return;

    const meanAccel = meanVec3(accelBuf);
    const gyroMag = Math.hypot(gyro[0], gyro[1], gyro[2]);
    const dwellMs = Date.now() - phaseEnteredAt;

    if (phase.value === "await_yaw" && captured.upAxis) {
        captured.yawIntegralDeg += dot(gyro, captured.upAxis) * (POLL_MS / 1000);
    }

    switch (phase.value) {
        case "await_flat":
            handleFlat(meanAccel, gyroMag, dwellMs);
            break;
        case "await_pitch":
            handleTilt(meanAccel, dwellMs, "pitch");
            break;
        case "await_level_1":
        case "await_level_2":
            handleLevel(meanAccel, dwellMs);
            break;
        case "await_roll":
            handleTilt(meanAccel, dwellMs, "roll");
            break;
        case "await_yaw":
            handleYaw();
            break;
        default:
            break;
    }
}

function handleFlat(meanAccel, gyroMag, dwellMs) {
    // Require BOTH: very low gyro AND accel direction drifting < FLAT_DRIFT_DEG over
    // the rolling buffer. Both must hold continuously for FLAT_HOLD_MS — which also
    // gives the user time to read the instruction before the wizard auto-advances.
    const drift = accelDriftDeg(accelBuf);

    if (gyroMag > FLAT_GYRO_THRESHOLD_DPS || drift > FLAT_DRIFT_DEG) {
        flatStableSince = 0;
        phaseDetail.value = i18nMessage("boardAlignmentWizard-HoldSteady");
        return;
    }
    if (flatStableSince === 0) {
        flatStableSince = Date.now();
    }
    const stableMs = Date.now() - flatStableSince;
    const remainingMs = Math.max(0, FLAT_HOLD_MS - stableMs);
    phaseDetail.value =
        remainingMs > 0 ? `${i18nMessage("boardAlignmentWizard-Settling")} (${(remainingMs / 1000).toFixed(1)}s)` : "";

    if (stableMs >= FLAT_HOLD_MS && dwellMs >= FLAT_HOLD_MS) {
        captured.flatAccel = meanAccel;
        captured.upAxis = normalize(meanAccel);
        advanceTo("await_pitch");
    }
}

function handleTilt(meanAccel, dwellMs, kind) {
    if (!captured.upAxis) return;

    const tilt = tiltAngleDeg(meanAccel, captured.upAxis);
    tiltHistory.push(tilt);
    const historyLen = Math.ceil(TILT_HOLD_MS / POLL_MS);
    if (tiltHistory.length > historyLen) tiltHistory.shift();

    if (tilt < TILT_DETECT_DEG) {
        phaseDetail.value = tilt > 5 ? `${i18nMessage("boardAlignmentWizard-Tilting")} (${tilt.toFixed(0)}°)` : "";
        return;
    }

    // The user has tilted far enough. Wait until the accel direction (= tilt angle)
    // has stayed within TILT_STABILITY_RANGE_DEG for the full hold window. This
    // ignores gyro entirely, so hand tremor does not block detection.
    if (tiltHistory.length < historyLen) {
        phaseDetail.value = `${i18nMessage("boardAlignmentWizard-AxisDetected")} (${tilt.toFixed(0)}°)`;
        return;
    }
    const minTilt = Math.min(...tiltHistory);
    const maxTilt = Math.max(...tiltHistory);
    if (maxTilt - minTilt > TILT_STABILITY_RANGE_DEG) {
        phaseDetail.value = `${i18nMessage("boardAlignmentWizard-HoldSteady")} (${tilt.toFixed(0)}°)`;
        return;
    }

    if (dwellMs < TILT_HOLD_MS) return;

    if (kind === "pitch") {
        captured.pitchAccel = meanAccel;
        advanceTo("await_level_1");
    } else {
        captured.rollAccel = meanAccel;
        advanceTo("await_level_2");
    }
}

function handleLevel(meanAccel, dwellMs) {
    if (!captured.upAxis) return;

    const tilt = tiltAngleDeg(meanAccel, captured.upAxis);
    tiltHistory.push(tilt);
    const historyLen = Math.ceil(LEVEL_HOLD_MS / POLL_MS);
    if (tiltHistory.length > historyLen) tiltHistory.shift();

    if (tilt > LEVEL_RETURN_DEG) {
        phaseDetail.value = `${i18nMessage("boardAlignmentWizard-LevelOut")} (${tilt.toFixed(0)}°)`;
        return;
    }

    if (tiltHistory.length < historyLen) return;
    const maxTilt = Math.max(...tiltHistory);
    if (maxTilt > LEVEL_RETURN_DEG) return;
    if (dwellMs < LEVEL_HOLD_MS) return;

    const next = phase.value === "await_level_1" ? "await_roll" : "await_yaw";
    advanceTo(next);
}

function handleYaw() {
    const mag = Math.abs(captured.yawIntegralDeg);
    phaseDetail.value = `${i18nMessage("boardAlignmentWizard-YawProgress")}: ${mag.toFixed(0)}°`;
    if (mag >= YAW_DETECT_DEG) {
        finishCollecting();
    }
}

/**
 * Largest angular deviation (degrees) of any normalized accel sample from the buffer's
 * mean direction. Using the mean (rather than the oldest sample) keeps noise that
 * symmetrically bounces around an axis from looking like drift.
 */
function accelDriftDeg(buf) {
    if (buf.length < 2) return 0;
    const dirs = buf.map(normalize);
    const mean = normalize(meanVec3(dirs));
    let maxAngle = 0;
    for (const d of dirs) {
        const c = Math.max(-1, Math.min(1, dot(mean, d)));
        const ang = Math.acos(c) * (180 / Math.PI);
        if (ang > maxAngle) maxAngle = ang;
    }
    return maxAngle;
}

// --- Stability tracking ---
let flatStableSince = 0;

function advanceTo(nextPhase) {
    accelBuf = [];
    gyroBuf = [];
    tiltHistory = [];
    flatStableSince = 0;
    phaseEnteredAt = Date.now();
    phaseDetail.value = "";
    phase.value = nextPhase;
    if (COLLECTING_PHASES.has(nextPhase)) {
        startPhaseAnimation();
    }
}

function finishCollecting() {
    stopPolling();
    phase.value = "computing";
    stopAnimation();
    // Defer slightly so the "computing" frame can paint.
    nextTick(() => {
        const result = detectBoardAlignment({
            flatAccel: captured.flatAccel,
            pitchAccel: captured.pitchAccel,
            rollAccel: captured.rollAccel,
            yawIntegral: captured.yawIntegralDeg,
            currentAlignment: props.currentAlignment,
        });
        if (result.error) {
            errorMessage.value = i18nMessage(`boardAlignmentWizard-Error-${result.error}`) || result.error;
            phase.value = "error";
            return;
        }
        detected.roll = result.roll;
        detected.pitch = result.pitch;
        detected.yaw = result.yaw;
        confidence.value = result.confidence;

        const current = props.currentAlignment;
        if (result.roll === current.roll && result.pitch === current.pitch && result.yaw === current.yaw) {
            phase.value = "result_nochange";
        } else {
            phase.value = "result";
        }
        setModelRotation(0, 0, 0);
    });
}

// --- Controls ---

function startWizard() {
    if (!canStartWizard.value) return;
    resetCaptured();
    phaseEnteredAt = Date.now();
    phase.value = "await_flat";
    setModelRotation(0, 0, 0);
    startPolling();
}

function enterTestPhase() {
    phase.value = "test";
    startLiveAttitudeRender();
    // Poll attitude to keep kinematics fresh.
    startAttitudePolling();
}

let attitudePollTimer = null;
let attitudePolling = false;
function startAttitudePolling() {
    if (attitudePolling) return;
    attitudePolling = true;
    const loop = () => {
        if (!attitudePolling) return;
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {
            if (!attitudePolling) return;
            attitudePollTimer = setTimeout(loop, POLL_MS);
        });
    };
    loop();
}
function stopAttitudePolling() {
    attitudePolling = false;
    if (attitudePollTimer !== null) {
        clearTimeout(attitudePollTimer);
        attitudePollTimer = null;
    }
}

function onApply() {
    cleanup();
    emit("apply", { roll: detected.roll, pitch: detected.pitch, yaw: detected.yaw });
    closeDialog();
    emit("close");
}

function onCancel() {
    cleanup();
    closeDialog();
    emit("close");
}

function handleCancel() {
    onCancel();
}

function resetToIntro() {
    stopPolling();
    stopAttitudePolling();
    stopAnimation();
    resetCaptured();
    phase.value = "intro";
    errorMessage.value = "";
    setModelRotation(0, 0, 0);
}

function resetCaptured() {
    captured.flatAccel = null;
    captured.pitchAccel = null;
    captured.rollAccel = null;
    captured.upAxis = null;
    captured.yawIntegralDeg = 0;
    accelBuf = [];
    gyroBuf = [];
    tiltHistory = [];
    flatStableSince = 0;
    phaseEnteredAt = 0;
    phaseDetail.value = "";
}

function cleanup() {
    stopPolling();
    stopAttitudePolling();
    stopAnimation();
}

function closeDialog() {
    if (dialogRef.value && dialogRef.value.open) {
        dialogRef.value.close();
    }
}

// --- Helpers ---
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v) {
    const m = Math.hypot(v[0], v[1], v[2]);
    return m > 1e-9 ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 0];
}

// --- Lifecycle ---
const show = () => {
    if (dialogRef.value && !dialogRef.value.open) {
        dialogRef.value.showModal();
    }
};

const close = () => {
    cleanup();
    closeDialog();
};

onMounted(async () => {
    await nextTick();
    initModel();
});

onUnmounted(() => {
    cleanup();
    disposeModel();
});

watch(phase, (newPhase) => {
    if (COLLECTING_PHASES.has(newPhase)) {
        startPhaseAnimation();
    } else if (
        newPhase === "intro" ||
        newPhase === "computing" ||
        newPhase === "result" ||
        newPhase === "result_nochange" ||
        newPhase === "error"
    ) {
        stopAnimation();
        setTopDownView(false);
        setModelRotation(0, 0, 0);
    } else if (newPhase === "test") {
        setTopDownView(false);
    }
});

defineExpose({ show, close });
</script>

<style scoped>
.boardAlignmentWizard-dialog {
    width: 90%;
    max-width: 760px;
    border: 2px solid var(--surface-600);
    border-radius: 4px;
    background-color: var(--surface-100);
    color: var(--text);
    padding: 0;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.45);
    font-size: 14px;
    line-height: 1.5;
}

.boardAlignmentWizard-dialog p {
    font-size: 14px;
    line-height: 1.5;
    margin: 0;
}

.boardAlignmentWizard-dialog h4 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 4px 0;
}

.boardAlignmentWizard-dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
}

.wizard-container {
    display: flex;
    flex-direction: column;
}

.wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--surface-300);
}

.wizard-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}

.wizard-close {
    background: none;
    border: none;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    color: var(--text);
    padding: 0 6px;
}

.wizard-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 16px;
}

.wizard-instructions {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.wizard-steps {
    margin: 6px 0 6px 18px;
    padding: 0;
    line-height: 1.6;
    font-size: 14px;
}

.wizard-substep {
    font-size: 13px;
    color: var(--text-secondary, var(--text));
    opacity: 0.75;
    margin: 0;
}

.wizard-detail {
    font-size: 13px;
    color: var(--text);
    opacity: 0.85;
}

.wizard-warning {
    background: var(--warning-500-15, rgba(255, 187, 0, 0.15));
    border-left: 3px solid var(--warning-500, #f0b400);
    padding: 8px 12px;
    font-size: 13px;
    border-radius: 2px;
}

.wizard-result-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 8px;
}

.wizard-result-table th,
.wizard-result-table td {
    padding: 4px 8px;
    text-align: center;
    border: 1px solid var(--surface-300);
}

.wizard-result-table th:first-child,
.wizard-result-table td:first-child {
    text-align: left;
}

.wizard-result-detected td {
    font-weight: 600;
    background: var(--surface-200);
}

.wizard-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
    padding-top: 12px;
}

.regular-button {
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
}

.regular-button.primary {
    font-weight: 600;
}

.regular-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.wizard-model {
    display: flex;
    align-items: center;
    justify-content: center;
}

.wizard-model-canvas-wrapper {
    width: 100%;
    height: 260px;
    position: relative;
    background: var(--surface-50, var(--surface-100));
    border-radius: 4px;
    overflow: hidden;
}

.wizard-model-canvas-wrapper canvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
}
</style>
