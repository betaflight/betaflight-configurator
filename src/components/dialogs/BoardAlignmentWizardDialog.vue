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
                        <div v-if="!hasAccSensor" class="wizard-warning">
                            {{ i18nMessage("boardAlignmentWizard-NoAccelerometer") }}
                        </div>
                        <div v-else-if="accNeedsCalibration" class="wizard-warning">
                            {{ i18nMessage("boardAlignmentWizard-AccNeedsCalibration") }}
                        </div>
                    </div>

                    <!-- Step timeline — visible during all data collection phases -->
                    <template v-else-if="showTimeline">
                        <div class="wizard-timeline">
                            <div
                                v-for="(step, i) in timelineData"
                                :key="step.key"
                                class="wizard-timeline-step"
                                :class="timelineStepStates[i]"
                            >
                                <div class="step-node">
                                    <span
                                        v-if="timelineStepStates[i] === 'done' || timelineStepStates[i] === 'confirmed'"
                                        >✓</span
                                    >
                                    <span v-else>{{ i + 1 }}</span>
                                </div>
                                <div class="step-label">{{ i18nMessage(step.labelKey) }}</div>
                            </div>
                        </div>

                        <!-- Collecting: hint + live detail -->
                        <div v-if="isCollectingPhase">
                            <h4 v-html="phaseHintText"></h4>
                            <div v-if="phaseDetail" class="wizard-detail">{{ phaseDetail }}</div>
                        </div>

                        <!-- Confirmed: brief green flash before auto-advancing -->
                        <div v-else-if="isConfirmedPhase" class="wizard-confirmed">
                            <h4 v-html="phaseHintText"></h4>
                            <div class="wizard-confirmed-badge">
                                {{ i18nMessage("boardAlignmentWizard-Confirmed") }}
                            </div>
                        </div>
                    </template>

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

                    <!-- Test phase: live attitude with detected alignment applied -->
                    <div v-else-if="phase === 'test'">
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

                    <!-- Error -->
                    <div v-else-if="phase === 'error'">
                        <h4 class="wizard-warning">{{ errorMessage }}</h4>
                    </div>

                    <div class="wizard-buttons">
                        <UButton
                            v-if="phase === 'intro'"
                            :label="i18nMessage('boardAlignmentWizard-Start')"
                            :disabled="!canStartWizard"
                            size="sm"
                            @click.prevent="startWizard"
                        />
                        <UButton
                            v-if="phase === 'test'"
                            :label="i18nMessage('boardAlignmentWizard-Apply')"
                            size="sm"
                            @click.prevent="onApply"
                        />
                        <UButton
                            v-if="phase === 'result_nochange'"
                            :label="i18nMessage('close')"
                            size="sm"
                            @click.prevent="onCancel"
                        />
                        <UButton
                            v-if="phase === 'error'"
                            :label="i18nMessage('boardAlignmentWizard-Retry')"
                            color="neutral"
                            variant="outline"
                            size="sm"
                            @click.prevent="resetToIntro"
                        />
                        <UButton
                            v-if="phase !== 'intro' && phase !== 'result_nochange'"
                            :label="i18nMessage('boardAlignmentWizard-Cancel')"
                            color="neutral"
                            variant="outline"
                            size="sm"
                            @click.prevent="onCancel"
                        />
                    </div>
                </div>

                <!-- Right column: 3D model -->
                <div class="wizard-model">
                    <div ref="modelWrapper" class="wizard-model-canvas-wrapper background_paper">
                        <canvas
                            ref="modelCanvas"
                            :aria-label="i18nMessage('boardAlignmentWizard-DialogTitle')"
                        ></canvas>
                        <div v-if="phase === 'test'" class="attitude-overlay">
                            <dl>
                                <dt>{{ i18nMessage("configurationBoardAlignmentRoll") }}</dt>
                                <dd>{{ liveAttitude.roll }}</dd>
                                <dt>{{ i18nMessage("configurationBoardAlignmentPitch") }}</dt>
                                <dd>{{ liveAttitude.pitch }}</dd>
                                <dt>{{ i18nMessage("configurationBoardAlignmentYaw") }}</dt>
                                <dd>{{ liveAttitude.yaw }}</dd>
                            </dl>
                        </div>
                        <div v-if="phase === 'test'" class="yaw-reset-btn">
                            <UButton
                                :label="yawResetLabel"
                                color="neutral"
                                variant="subtle"
                                size="xs"
                                @click="resetYaw"
                            />
                        </div>
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
import { detectBoardAlignment, meanVec3, tiltAngleDeg, matrixToEuler } from "@/js/utils/boardAlignment";
import { eulerToMatrix } from "@/js/utils/magAlignment";

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
// reasonably calm, then hold for ~1.5 s.
// Note: gyro values from MSP_RAW_IMU are in raw scaled units (not deg/s). ~500 raw ≈ 125 deg/s,
// which is only triggered by fast active rotation, not by normal placement vibrations.
const FLAT_GYRO_THRESHOLD_DPS = 500;
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
const CONFIRM_HOLD_MS = 800;

const COLLECTING_PHASES = new Set([
    "await_flat",
    "await_pitch",
    "await_level_1",
    "await_roll",
    "await_level_2",
    "await_yaw",
]);

const CONFIRMED_PHASES = new Set(["confirmed_flat", "confirmed_pitch", "confirmed_roll", "confirmed_yaw"]);

// Maps each confirmed phase → the next collecting phase (or '__compute__').
const CONFIRMED_NEXT = {
    confirmed_flat: "await_pitch",
    confirmed_pitch: "await_roll",
    confirmed_roll: "await_yaw",
    confirmed_yaw: "__compute__",
};

// Metadata for the step timeline.
const timelineData = [
    { key: "flat", labelKey: "boardAlignmentWizard-StepFlat" },
    { key: "pitch", labelKey: "boardAlignmentWizard-StepPitch" },
    { key: "roll", labelKey: "boardAlignmentWizard-StepRoll" },
    { key: "yaw", labelKey: "boardAlignmentWizard-StepYaw" },
];

// --- State ---
const phase = ref("intro");
const errorMessage = ref("");
const detected = reactive({ roll: 0, pitch: 0, yaw: 0 });
const confidence = ref("high");

const i18nMessage = (key) => i18n.getMessage(key);
const yawResetLabel = computed(() => i18n.getMessage("initialSetupButtonResetZaxisValue", [yawFix.value.toFixed(1)]));

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
const isConfirmedPhase = computed(() => CONFIRMED_PHASES.has(phase.value));
const showTimeline = computed(() => isCollectingPhase.value || isConfirmedPhase.value);

// Visual state of each timeline step: 'pending' | 'active' | 'confirmed' | 'done'.
const PHASE_STEP_STATES = {
    await_flat: ["active", "pending", "pending", "pending"],
    confirmed_flat: ["confirmed", "pending", "pending", "pending"],
    await_pitch: ["done", "active", "pending", "pending"],
    await_level_1: ["done", "confirmed", "pending", "pending"], // tilt captured, returning to level
    confirmed_pitch: ["done", "confirmed", "pending", "pending"],
    await_roll: ["done", "done", "active", "pending"],
    await_level_2: ["done", "done", "confirmed", "pending"], // tilt captured, returning to level
    confirmed_roll: ["done", "done", "confirmed", "pending"],
    await_yaw: ["done", "done", "done", "active"],
    confirmed_yaw: ["done", "done", "done", "confirmed"],
};
const timelineStepStates = computed(
    () => PHASE_STEP_STATES[phase.value] ?? ["pending", "pending", "pending", "pending"],
);

const phaseHintText = computed(() => {
    switch (phase.value) {
        case "await_flat":
        case "confirmed_flat":
            return i18nMessage("boardAlignmentWizard-HintFlat");
        case "await_pitch":
        case "await_level_1":
        case "confirmed_pitch":
            return i18nMessage("boardAlignmentWizard-HintPitchUp");
        case "await_roll":
        case "await_level_2":
        case "confirmed_roll":
            return i18nMessage("boardAlignmentWizard-HintRollRight");
        case "await_yaw":
        case "confirmed_yaw":
            return i18nMessage("boardAlignmentWizard-HintYawCW");
        default:
            return "";
    }
});

const phaseDetail = ref("");

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
let confirmTimer = null;

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

// Correction matrix pre-computed when entering the test phase:
// R_new · R_old^T — transforms the old-alignment attitude into what the FC
// would report with the new alignment applied.
let testCorrectionMatrix = null;

// Yaw reference offset so the model starts at a neutral heading in the test phase.
const yawFix = ref(0);
const liveAttitude = reactive({ roll: "0.0", pitch: "0.0", yaw: "0.0" });

function resetYaw() {
    const k = fcStore.sensorData?.kinematics;
    if (!k || !testCorrectionMatrix) return;
    // k[2] is CW-positive (compass heading); negate to convert to CCW-positive for math.
    const rAtt = eulerToMatrix(k[0], k[1], -k[2]);
    yawFix.value = matrixToEuler(mat3Mul(rAtt, mat3Transpose(testCorrectionMatrix))).yaw;
}

function startLiveAttitudeRender() {
    stopAnimation();
    const tick = () => {
        const k = fcStore.sensorData?.kinematics;
        if (k) {
            let roll, pitch, yaw;
            if (testCorrectionMatrix) {
                // The corrected attitude matrix is: R_att_new = R_att_old · R_correction^T
                // (R_correction applied from the right, not the left).
                // k[2] is CW-positive; negate to convert to CCW-positive for eulerToMatrix.
                const rAtt = eulerToMatrix(k[0], k[1], -k[2]);
                const rDisplay = mat3Mul(rAtt, mat3Transpose(testCorrectionMatrix));
                ({ roll, pitch, yaw } = matrixToEuler(rDisplay));
            } else {
                roll = k[0];
                pitch = k[1];
                yaw = -k[2]; // same negation for consistency
            }
            liveAttitude.roll = roll.toFixed(1);
            liveAttitude.pitch = pitch.toFixed(1);
            liveAttitude.yaw = yaw.toFixed(1);
            setModelRotation(roll, pitch, yaw - yawFix.value);
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

    // Guard: if the gravity signal is near-zero the accelerometer isn't sending data.
    // Show the raw values so we can diagnose scale/unit issues.
    const gravity = Math.hypot(meanAccel[0], meanAccel[1], meanAccel[2]);
    if (gravity < 0.001) {
        flatStableSince = 0;
        phaseDetail.value = `No accel signal (${meanAccel.map((v) => v.toFixed(4)).join(", ")}) — acc disabled?`;
        return;
    }

    const drift = accelDriftDeg(accelBuf);

    if (gyroMag > FLAT_GYRO_THRESHOLD_DPS || drift > FLAT_DRIFT_DEG) {
        flatStableSince = 0;
        const why =
            gyroMag > FLAT_GYRO_THRESHOLD_DPS
                ? `gyro ${gyroMag.toFixed(1)} > ${FLAT_GYRO_THRESHOLD_DPS}`
                : `drift ${drift.toFixed(1)}° > ${FLAT_DRIFT_DEG}°`;
        phaseDetail.value = `${i18nMessage("boardAlignmentWizard-HoldSteady")} (${why})`;
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
        advanceTo("confirmed_flat");
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
        advanceTo("await_level_1"); // return-to-level then confirmed_pitch
    } else {
        captured.rollAccel = meanAccel;
        advanceTo("await_level_2"); // return-to-level then confirmed_roll
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

    // Confirm the preceding pitch/roll gesture before advancing.
    const next = phase.value === "await_level_1" ? "confirmed_pitch" : "confirmed_roll";
    advanceTo(next);
}

function handleYaw() {
    const mag = Math.abs(captured.yawIntegralDeg);
    phaseDetail.value = `${i18nMessage("boardAlignmentWizard-YawProgress")}: ${mag.toFixed(0)}°`;
    if (mag >= YAW_DETECT_DEG) {
        stopPolling();
        advanceTo("confirmed_yaw");
    }
}

/**
 * Largest angular deviation (degrees) of any normalized accel sample from the buffer's
 * mean direction. Zero-magnitude samples (e.g. uninitialized sensor data) are skipped;
 * if fewer than 2 valid samples remain, returns 0 so the gravity-magnitude guard in
 * handleFlat catches the bad-data case instead.
 */
function accelDriftDeg(buf) {
    if (buf.length < 2) return 0;
    const valid = buf.filter((s) => Math.hypot(s[0], s[1], s[2]) > 0.01);
    if (valid.length < 2) return 0;
    const dirs = valid.map(normalize);
    const mean = normalize(meanVec3(dirs));
    if (Math.hypot(mean[0], mean[1], mean[2]) < 0.5) return 0;
    let maxAngle = 0;
    for (const d of dirs) {
        const c = Math.max(-1, Math.min(1, dot(mean, d)));
        maxAngle = Math.max(maxAngle, Math.acos(c) * (180 / Math.PI));
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

    if (CONFIRMED_PHASES.has(nextPhase)) {
        // Freeze the model at its current position (don't snap to a new pose — the model
        // is already at level after the return-to-level phase, which is the natural state
        // to show during the confirmation flash).
        stopAnimation();
        confirmTimer = setTimeout(() => {
            confirmTimer = null;
            const next = CONFIRMED_NEXT[nextPhase];
            if (next === "__compute__") {
                runComputation();
            } else {
                advanceTo(next);
            }
        }, CONFIRM_HOLD_MS);
    } else if (COLLECTING_PHASES.has(nextPhase)) {
        startPhaseAnimation();
    }
}

function runComputation() {
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
            enterTestPhase();
        }
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
    // Yaw values are in Betaflight's CW-positive convention; negate before eulerToMatrix
    // (which uses standard CCW-positive) to get the correct rotation matrices.
    const rOld = eulerToMatrix(
        props.currentAlignment.roll || 0,
        props.currentAlignment.pitch || 0,
        -(props.currentAlignment.yaw || 0),
    );
    const rNew = eulerToMatrix(detected.roll, detected.pitch, -detected.yaw);
    testCorrectionMatrix = mat3Mul(rNew, mat3Transpose(rOld));
    yawFix.value = 0; // will be set to first real sample in startLiveAttitudeRender
    phase.value = "test";
    startAttitudePolling();
    // Poll one frame then auto-reset yaw so the model starts at a neutral heading.
    const autoReset = () => {
        if (phase.value !== "test") {
            return;
        }
        if (fcStore.sensorData?.kinematics) {
            resetYaw();
        } else {
            requestAnimationFrame(autoReset);
        }
    };
    requestAnimationFrame(autoReset);
    startLiveAttitudeRender();
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
    clearConfirmTimer();
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

function clearConfirmTimer() {
    if (confirmTimer !== null) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
    }
}

function cleanup() {
    stopPolling();
    stopAttitudePolling();
    stopAnimation();
    clearConfirmTimer();
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
function mat3Transpose(m) {
    return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ];
}
function mat3Mul(a, b) {
    const r = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    return r;
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

/* ---- Step timeline ---- */
.wizard-timeline {
    display: flex;
    align-items: flex-start;
    margin-bottom: 10px;
}

.wizard-timeline-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
}

/* Connector line between steps */
.wizard-timeline-step:not(:first-child)::before {
    content: "";
    position: absolute;
    left: -50%;
    right: 50%;
    top: 11px;
    height: 2px;
    background: var(--surface-300);
    z-index: 0;
}

.wizard-timeline-step.done:not(:first-child)::before,
.wizard-timeline-step.confirmed:not(:first-child)::before,
.wizard-timeline-step.active:not(:first-child)::before {
    background: var(--primary-500);
}

.step-node {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    border: 2px solid var(--surface-400);
    background: var(--surface-100);
    color: var(--surface-500);
    position: relative;
    z-index: 1;
    transition:
        background 0.2s,
        border-color 0.2s;
}

.wizard-timeline-step.active .step-node {
    border-color: var(--primary-500);
    background: var(--primary-500);
    color: #fff;
}

.wizard-timeline-step.confirmed .step-node {
    border-color: #22c55e;
    background: #22c55e;
    color: #fff;
    animation: pulse-confirm 0.4s ease-out;
}

.wizard-timeline-step.done .step-node {
    border-color: #22c55e;
    background: #22c55e;
    color: #fff;
}

.step-label {
    font-size: 10px;
    margin-top: 3px;
    color: var(--surface-500);
    text-align: center;
}

.wizard-timeline-step.active .step-label,
.wizard-timeline-step.confirmed .step-label,
.wizard-timeline-step.done .step-label {
    color: var(--text);
    font-weight: 600;
}

@keyframes pulse-confirm {
    0% {
        transform: scale(1);
    }

    50% {
        transform: scale(1.25);
    }

    100% {
        transform: scale(1);
    }
}

/* ---- Confirmed-phase flash ---- */
.wizard-confirmed-badge {
    display: inline-block;
    margin-top: 6px;
    padding: 2px 10px;
    background: #22c55e22;
    border: 1px solid #22c55e;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 600;
    color: #16a34a;
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
    border-radius: 4px;
    overflow: hidden;
}

.wizard-model-canvas-wrapper canvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
}

.attitude-overlay {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    font-size: 0.75rem;
    color: var(--surface-950);
    pointer-events: none;

    dl {
        display: grid;
        grid-template-columns: auto auto;
        gap: 0 0.4rem;
        margin: 0;
    }

    dd {
        white-space: pre;
        margin: 0;
        font-variant-numeric: tabular-nums;
    }
}

.yaw-reset-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
}
</style>
