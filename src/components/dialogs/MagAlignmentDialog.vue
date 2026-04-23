<template>
    <Dialog v-model="isOpen" :title="$t('magAlignmentTitle')" :closeable="phase !== 'collecting'" @close="onClose">
        <!-- Idle: instructions -->
        <div v-if="phase === 'idle'" class="mag-align-idle">
            <p>{{ $t("magAlignmentIdle") }}</p>
        </div>

        <!-- Collecting samples -->
        <div v-else-if="phase === 'collecting'" class="mag-align-collecting">
            <p class="mag-align-instruction">{{ $t("magAlignmentCollecting") }}</p>
            <div class="mag-align-progress-bar">
                <div class="mag-align-progress-fill" :style="{ width: progress + '%' }"></div>
            </div>
            <p class="mag-align-sample-count">
                {{ $t("magAlignmentSampleCount", { count: sampleCount }) }}
            </p>
        </div>

        <!-- Result -->
        <div v-else-if="phase === 'result'" class="mag-align-result">
            <dl class="mag-align-stats">
                <dt>{{ $t("magAlignmentDetected") }}</dt>
                <dd class="mag-align-detected-value">{{ result.label }}</dd>

                <dt>{{ $t("magAlignmentConfidence") }}</dt>
                <dd>
                    <span :class="'confidence-' + confidenceLevel">{{ confidenceText }}</span>
                </dd>

                <dt>{{ $t("magAlignmentSamples") }}</dt>
                <dd>{{ sampleCount }}</dd>
            </dl>

            <p v-if="!result.reliable" class="mag-align-warning">
                {{ $t("magAlignmentLowConfidence") }}
            </p>
        </div>

        <!-- Error -->
        <div v-else-if="phase === 'error'" class="mag-align-idle">
            <p class="mag-align-error-msg">{{ $t(errorMessage || "magAlignmentError") }}</p>
        </div>

        <template #footer>
            <div class="mag-align-footer">
                <UButton v-if="phase === 'idle'" :label="$t('magAlignmentStart')" @click="startDetection()" />
                <UButton
                    v-if="phase === 'collecting'"
                    variant="outline"
                    :label="$t('magCalibrationCancel')"
                    @click="cancelDetection()"
                />
                <UButton v-if="phase === 'result' && result" :label="$t('magAlignmentApply')" @click="applyResult()" />
                <UButton
                    v-if="phase === 'result' || phase === 'error'"
                    variant="outline"
                    :label="$t('magCalibrationRetry')"
                    @click="retryDetection()"
                />
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from "vue";
import Dialog from "../elements/Dialog.vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useFlightControllerStore } from "../../stores/fc";
import { detectAlignment } from "../../js/utils/magAlignment";

const POLL_INTERVAL_MS = 100;
const TARGET_SAMPLES = 150;
const NO_MOVEMENT_TIMEOUT_MS = 15000;
const MOVEMENT_THRESHOLD = 5;

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false,
    },
    currentAlignment: {
        type: Number,
        default: 0,
    },
    customAngles: {
        type: Object,
        default: null,
    },
});

const emit = defineEmits(["update:modelValue", "apply"]);

const fcStore = useFlightControllerStore();

const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit("update:modelValue", val),
});

const phase = ref("idle"); // 'idle' | 'collecting' | 'result' | 'error'
const progress = ref(0);
const sampleCount = ref(0);
const result = ref(null);
const errorMessage = ref("");

let samples = [];
let dataInterval = null;
let attitudeInterval = null;
let lastMag = null;
let lastMovementTime = 0;
let movementCheckInterval = null;
let currentRoll = 0;
let currentPitch = 0;

const confidenceLevel = computed(() => {
    if (!result.value) {
        return "none";
    }
    if (result.value.confidence >= 5) {
        return "high";
    }
    if (result.value.confidence >= 2) {
        return "medium";
    }
    return "low";
});

const confidenceText = computed(() => {
    if (!result.value) {
        return "";
    }
    const c = result.value.confidence;
    if (c >= 5) {
        return `${c}x (high)`;
    }
    if (c >= 2) {
        return `${c}x (medium)`;
    }
    return `${c}x (low)`;
});

function startDetection() {
    samples = [];
    sampleCount.value = 0;
    progress.value = 0;
    result.value = null;
    errorMessage.value = "";
    lastMag = null;
    lastMovementTime = Date.now();
    currentRoll = 0;
    currentPitch = 0;
    phase.value = "collecting";

    // Poll attitude for roll/pitch
    attitudeInterval = setInterval(() => {
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {
            currentRoll = fcStore.sensorData.kinematics[0];
            currentPitch = fcStore.sensorData.kinematics[1];
        });
    }, POLL_INTERVAL_MS);

    // Poll raw IMU for mag data
    dataInterval = setInterval(() => {
        MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, onImuData);
    }, POLL_INTERVAL_MS);

    // Movement timeout check
    movementCheckInterval = setInterval(() => {
        if (Date.now() - lastMovementTime > NO_MOVEMENT_TIMEOUT_MS) {
            cleanup();
            phase.value = "error";
            errorMessage.value = "magAlignmentNoMovement";
        }
    }, 1000);
}

function onImuData() {
    const mx = fcStore.sensorData.magnetometer[0];
    const my = fcStore.sensorData.magnetometer[1];
    const mz = fcStore.sensorData.magnetometer[2];

    if (mx === 0 && my === 0 && mz === 0) {
        return;
    }

    // Track movement
    if (
        lastMag === null ||
        Math.abs(mx - lastMag[0]) > MOVEMENT_THRESHOLD ||
        Math.abs(my - lastMag[1]) > MOVEMENT_THRESHOLD ||
        Math.abs(mz - lastMag[2]) > MOVEMENT_THRESHOLD
    ) {
        lastMovementTime = Date.now();
    }
    lastMag = [mx, my, mz];

    samples.push({
        mag: [mx, my, mz],
        roll: currentRoll,
        pitch: currentPitch,
    });
    sampleCount.value = samples.length;
    progress.value = Math.min(100, Math.round((samples.length / TARGET_SAMPLES) * 100));

    if (samples.length >= TARGET_SAMPLES) {
        finishDetection();
    }
}

function finishDetection() {
    cleanup();

    const detection = detectAlignment(samples, props.currentAlignment, props.customAngles);
    if (!detection) {
        phase.value = "error";
        errorMessage.value = "magAlignmentNotEnoughData";
        return;
    }

    result.value = detection;
    phase.value = "result";
}

function cancelDetection() {
    cleanup();
    phase.value = "idle";
}

function retryDetection() {
    phase.value = "idle";
    result.value = null;
    errorMessage.value = "";
    progress.value = 0;
    sampleCount.value = 0;
}

function applyResult() {
    if (result.value) {
        emit("apply", result.value.alignment);
        retryDetection();
        emit("update:modelValue", false);
    }
}

function cleanup() {
    if (dataInterval !== null) {
        clearInterval(dataInterval);
        dataInterval = null;
    }
    if (attitudeInterval !== null) {
        clearInterval(attitudeInterval);
        attitudeInterval = null;
    }
    if (movementCheckInterval !== null) {
        clearInterval(movementCheckInterval);
        movementCheckInterval = null;
    }
}

onBeforeUnmount(cleanup);

function onClose() {
    cleanup();
    retryDetection();
}
</script>

<style scoped>
:deep(.dialog-modal) {
    width: 480px;
}

.mag-align-idle {
    padding: 32px 16px;
    text-align: center;
    font-size: 0.95em;
    color: var(--surface-600);
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mag-align-collecting {
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.mag-align-instruction {
    font-size: 0.95em;
    color: var(--surface-600);
    text-align: center;
}

.mag-align-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--surface-300);
    border-radius: 3px;
    overflow: hidden;
}

.mag-align-progress-fill {
    height: 100%;
    background: var(--primary-500);
    border-radius: 3px;
    transition: width 0.3s ease;
}

.mag-align-sample-count {
    font-size: 0.82em;
    color: var(--surface-500);
}

.mag-align-result {
    padding: 24px 16px;
}

.mag-align-stats {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
    font-size: 0.9em;
}

.mag-align-stats dt {
    color: var(--surface-500);
    font-weight: 500;
}

.mag-align-stats dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
}

.mag-align-detected-value {
    font-size: 1.1em;
    color: var(--primary-500);
}

.mag-align-warning {
    margin-top: 16px;
    padding: 8px 12px;
    background: #fef3c7;
    border-radius: 6px;
    font-size: 0.85em;
    color: #92400e;
}

.mag-align-error-msg {
    color: #ef4444;
    font-weight: 600;
}

.confidence-high {
    color: #22c55e;
}
.confidence-medium {
    color: #eab308;
}
.confidence-low {
    color: #ef4444;
}
.confidence-none {
    color: var(--surface-500);
}

.mag-align-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}
</style>
