<template>
    <Dialog v-model="isOpen" :title="$t('magCalibrationTitle')" :closeable="!isCalibrating" @close="onClose">
        <!-- Idle: intro screen -->
        <div v-if="cal.phase === 'idle'" class="mag-cal-idle">
            <p>{{ $t("magCalibrationIdle") }}</p>
        </div>

        <!-- Calibrating: step-by-step wizard -->
        <div v-else-if="isCalibrating" class="mag-cal-layout">
            <div class="mag-cal-step-panel">
                <div class="mag-cal-step-counter">
                    {{ $t("magCalibrationStepOf", { current: currentStep + 1, total: TOTAL_STEPS }) }}
                </div>
                <MagOrientationDiagram :step="currentStep" />
                <div class="mag-cal-step-instruction">
                    {{ $t(orientationSteps[currentStep].i18n) }}
                </div>
                <div class="mag-cal-progress-bar">
                    <div class="mag-cal-progress-fill" :style="{ width: cal.progress + '%' }"></div>
                </div>
            </div>

            <div class="mag-cal-right">
                <div class="mag-cal-sphere">
                    <MagSphereView :samples="cal.samples" :sphere-fit="cal.sphereFitResult" :active="true" />
                </div>
                <dl class="mag-cal-stats">
                    <dt>{{ $t("magCalibrationSamples") }}</dt>
                    <dd>{{ cal.sampleCount }}</dd>
                    <dt>{{ $t("magCalibrationOffsets") }}</dt>
                    <dd>{{ offsetsText }}</dd>
                </dl>
            </div>
        </div>

        <!-- Complete: results -->
        <div v-else-if="cal.phase === 'complete'" class="mag-cal-layout">
            <div class="mag-cal-results">
                <p class="mag-cal-complete-msg">{{ $t("magCalibrationComplete") }}</p>
                <dl class="mag-cal-stats-full">
                    <dt>{{ $t("magCalibrationSamples") }}</dt>
                    <dd>{{ cal.sampleCount }}</dd>
                    <dt>{{ $t("magCalibrationOffsets") }}</dt>
                    <dd>{{ offsetsText }}</dd>
                    <dt>{{ $t("magCalibrationResidual") }}</dt>
                    <dd>{{ residualText }}</dd>
                    <dt>{{ $t("magCalibrationQuality") }}</dt>
                    <dd>
                        <span v-if="qualityText" :class="'quality-' + cal.quality">{{ $t(qualityText) }}</span>
                        <span v-else class="quality-none">&mdash;</span>
                    </dd>
                </dl>
            </div>
            <div class="mag-cal-sphere">
                <MagSphereView :samples="cal.samples" :sphere-fit="cal.sphereFitResult" :active="false" />
            </div>
        </div>

        <!-- Error -->
        <div v-else-if="cal.phase === 'error'" class="mag-cal-idle">
            <p class="mag-cal-error-msg">{{ $t(cal.statusMessage || "magCalibrationError") }}</p>
        </div>

        <template #footer>
            <div class="mag-cal-footer">
                <UButton v-if="cal.phase === 'idle'" :label="$t('magCalibrationStart')" @click="startCal()" />
                <UButton
                    v-if="isCalibrating"
                    variant="outline"
                    :label="$t('magCalibrationCancel')"
                    @click="cancelCal()"
                />
                <UButton
                    v-if="isCalibrating && currentStep < TOTAL_STEPS - 1"
                    :label="$t('magCalibrationNextStep')"
                    @click="nextStep()"
                />
                <UButton
                    v-if="isCalibrating && currentStep === TOTAL_STEPS - 1"
                    :label="$t('magCalibrationFinish')"
                    @click="finishCal()"
                />
                <UButton v-if="cal.phase === 'complete'" :label="$t('magCalibrationAccept')" @click="accept()" />
                <UButton
                    v-if="cal.phase === 'complete' || cal.phase === 'error'"
                    variant="outline"
                    :label="$t('magCalibrationRetry')"
                    @click="retryCal()"
                />
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { ref, computed, reactive } from "vue";
import Dialog from "../elements/Dialog.vue";
import MagSphereView from "./mag-calibration/MagSphereView.vue";
import MagOrientationDiagram from "./mag-calibration/MagOrientationDiagram.vue";
import { useMagCalibration } from "../../composables/useMagCalibration";

const TOTAL_STEPS = 6;

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(["update:modelValue", "complete"]);

const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit("update:modelValue", val),
});

const cal = reactive(useMagCalibration());
const currentStep = ref(0);

const orientationSteps = [
    { i18n: "magCalibrationStep1" },
    { i18n: "magCalibrationStep2" },
    { i18n: "magCalibrationStep3" },
    { i18n: "magCalibrationStep4" },
    { i18n: "magCalibrationStep5" },
    { i18n: "magCalibrationStep6" },
];

const isCalibrating = computed(() => cal.phase === "waiting" || cal.phase === "collecting");

const offsetsText = computed(() => {
    const fit = cal.sphereFitResult;
    if (!fit) {
        return "\u2014";
    }
    return `${fit.center.x.toFixed(0)}, ${fit.center.y.toFixed(0)}, ${fit.center.z.toFixed(0)}`;
});

const residualText = computed(() => {
    const fit = cal.sphereFitResult;
    if (!fit) {
        return "\u2014";
    }
    return fit.residual.toFixed(1);
});

const qualityKey = {
    good: "magCalibrationQualityGood",
    fair: "magCalibrationQualityFair",
    poor: "magCalibrationQualityPoor",
};
const qualityText = computed(() => qualityKey[cal.quality] || null);

function startCal() {
    currentStep.value = 0;
    cal.startCalibration();
}

function nextStep() {
    if (currentStep.value < TOTAL_STEPS - 1) {
        currentStep.value++;
    }
}

function finishCal() {
    cal.completeCalibration();
}

function cancelCal() {
    cal.cancelCalibration();
    currentStep.value = 0;
}

function accept() {
    emit("complete", {
        sphereFit: cal.sphereFitResult,
        coverage: cal.coverage,
        quality: cal.quality,
    });
    emit("update:modelValue", false);
}

function retryCal() {
    cal.retry();
    currentStep.value = 0;
}

function onClose() {
    cal.cleanup();
    cal.retry();
    currentStep.value = 0;
}
</script>

<style scoped>
:deep(.dialog-modal) {
    width: 860px;
}

/* Idle / Error screens */
.mag-cal-idle {
    padding: 32px 16px;
    text-align: center;
    font-size: 0.95em;
    color: var(--surface-600);
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mag-cal-error-msg {
    color: #ef4444;
    font-weight: 600;
}

.mag-cal-complete-msg {
    font-weight: 600;
    font-size: 1.1em;
    color: #22c55e;
    margin-bottom: 16px;
}

/* Main layout: step panel + sphere */
.mag-cal-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    align-items: start;
}

/* Step panel (left) */
.mag-cal-step-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}

.mag-cal-step-counter {
    font-size: 0.8em;
    font-weight: 600;
    color: var(--surface-500);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.mag-cal-step-instruction {
    font-size: 1em;
    font-weight: 600;
    text-align: center;
    color: var(--surface-900);
}

/* Right column */
.mag-cal-right {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* Sphere */
.mag-cal-sphere {
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: #1a1a2e;
}

/* Progress bar */
.mag-cal-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--surface-300);
    border-radius: 3px;
    overflow: hidden;
}

.mag-cal-progress-fill {
    height: 100%;
    background: var(--primary-500);
    border-radius: 3px;
    transition: width 0.3s ease;
}

/* Stats (inline during calibration) */
.mag-cal-stats {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    font-size: 0.82em;
}

.mag-cal-stats dt {
    color: var(--surface-500);
    font-weight: 500;
}

.mag-cal-stats dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
}

/* Results stats (complete screen) */
.mag-cal-results {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 16px 0;
}

.mag-cal-stats-full {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    font-size: 0.9em;
}

.mag-cal-stats-full dt {
    color: var(--surface-500);
    font-weight: 500;
}

.mag-cal-stats-full dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
}

.quality-good {
    color: #22c55e;
}
.quality-fair {
    color: #eab308;
}
.quality-poor {
    color: #ef4444;
}
.quality-none {
    color: var(--surface-500);
}

/* Footer */
.mag-cal-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}
</style>
