<template>
    <div class="mag-char-dialog">
        <div class="mag-char-container">
            <div class="mag-char-header">
                <h3>{{ $t("improvedTumbleTitle") }}</h3>
                <button class="mag-char-close" @click="handleClose">&times;</button>
            </div>

            <!-- INTRO phase -->
            <div v-if="phase === 'intro'" class="mag-char-body">
                <h4>{{ $t("improvedTumbleIntroHeadline") }}</h4>
                <p>{{ $t("improvedTumbleIntroDesc") }}</p>
                <ul>
                    <li>{{ $t("improvedTumbleIntroStep1") }}</li>
                    <li>{{ $t("improvedTumbleIntroStep2") }}</li>
                    <li>{{ $t("improvedTumbleIntroStep3") }}</li>
                </ul>
                <p>{{ $t("improvedTumbleIntroTimeEstimate") }}</p>
                <button class="mag-char-btn mag-char-btn-primary" @click="startTumble">
                    {{ $t("improvedTumbleStart") }}
                </button>
            </div>

            <!-- TUMBLE phase -->
            <div v-if="phase === 'calibrate'" class="mag-char-body">
                <h4>{{ $t("improvedTumbleTumbling") }}</h4>
                <MagSphereView
                    :samples="calibrationSamples"
                    :sample-count="calibrationSampleCount"
                    :sphere-fit="calibrationSphereFit"
                    :coverage="calibrationCoverage"
                    :attitude="attitudeRaw"
                    :quaternion="attitudeQuaternion"
                    :active="true"
                    :live-mag="calLiveMag"
                    viz-mode="pointcloud"
                />
                <div v-if="calibrationCoverage" class="coverage-bar">
                    <div class="coverage-fill" :style="{ width: calibrationCoverage.fraction * 100 + '%' }"></div>
                    <span
                        >{{ (calibrationCoverage.fraction * 100).toFixed(0) }}% — {{ calibrationCoverage.covered }}/{{
                            calibrationCoverage.totalFaces
                        }}
                        zones</span
                    >
                </div>
                <p style="color: #7eb8ff; font-size: 13px">{{ $t(currentTumblePrompt) }}</p>
                <div class="mag-char-complete-actions">
                    <button class="mag-char-btn mag-char-btn-primary" @click="computeResults" :disabled="!canCompute">
                        {{ $t("improvedTumbleDone") }}
                    </button>
                    <button class="mag-char-btn mag-char-btn-cancel" @click="handleClose">
                        {{ $t("magCharFooterCancel") }}
                    </button>
                </div>
            </div>

            <!-- RESULTS phase -->
            <div v-if="phase === 'complete'" class="mag-char-body">
                <h4>{{ $t("improvedTumbleResultsTitle") }}</h4>

                <!-- Summary card -->
                <div class="mag-char-summary-card">
                    <!-- Quality verdict -->
                    <div v-if="qualityVerdict" class="mag-char-verdict" :class="qualityVerdictClass">
                        {{ $t(qualityVerdict) }}
                    </div>

                    <!-- Alignment result -->
                    <div class="mag-char-solver-row">
                        <span class="mag-char-stat-label">{{ $t("improvedTumbleAlignment") }}</span>
                        <span class="mag-char-stat-value">
                            {{ solverResult?.label || "—" }}
                            <template v-if="solverResult?.preset === 9">
                                {{
                                    $t("improvedTumbleCustomAngles", {
                                        roll: solverResult.euler_zyx_deg.roll.toFixed(1),
                                        pitch: solverResult.euler_zyx_deg.pitch.toFixed(1),
                                        yaw: solverResult.euler_zyx_deg.yaw.toFixed(1),
                                    })
                                }}
                            </template>
                        </span>
                    </div>

                    <!-- Quality score -->
                    <div class="mag-char-solver-row">
                        <span class="mag-char-stat-label">{{ $t("improvedTumbleQuality") }}</span>
                        <span class="mag-char-stat-value">
                            {{
                                $t("improvedTumbleResidualDeg", {
                                    deg: solverResult?.quality?.meanResidualDeg ?? "?",
                                })
                            }}
                        </span>
                    </div>

                    <!-- Ellipsoid params -->
                    <div v-if="ellipsoidParams" class="mag-char-solver-row">
                        <span class="mag-char-stat-label">{{ $t("improvedTumbleSoftIron") }}</span>
                        <span class="mag-char-stat-value">
                            {{
                                $t("improvedTumbleSoftIronAnisotropy", {
                                    val: ellipsoidDiag?.conditionNumber?.toFixed(2) ?? "?",
                                })
                            }}
                        </span>
                    </div>

                    <!-- Calibration offsets -->
                    <div v-if="calibrationOffsets" class="mag-char-solver-row">
                        <span class="mag-char-stat-label">{{ $t("improvedTumbleCalibration") }}</span>
                        <span class="mag-char-stat-value" style="color: #eebb44">
                            mag_calibration = {{ calibrationOffsets.x }}, {{ calibrationOffsets.y }},
                            {{ calibrationOffsets.z }}
                        </span>
                    </div>

                    <!-- WMM geo -->
                    <div v-if="geoReference" class="mag-char-solver-row">
                        <span class="mag-char-stat-label">{{ $t("improvedTumbleGeo") }}</span>
                        <span class="mag-char-stat-value">
                            decl {{ geoReference.declination.toFixed(1) }}° · incl
                            {{ geoReference.inclination.toFixed(1) }}° · |B| {{ geoReference.fieldStrength }} nT
                        </span>
                    </div>

                    <!-- Coverage -->
                    <div class="mag-char-solver-row">
                        <span class="mag-char-stat-label">{{ $t("improvedTumbleCoverage") }}</span>
                        <span class="mag-char-stat-value">
                            {{ calibrationSamples.length }} samples ·
                            {{ calibrationCoverage ? (calibrationCoverage.fraction * 100).toFixed(0) + "%" : "—" }}
                        </span>
                    </div>
                </div>

                <!-- CLI commands -->
                <div v-if="cliCommands.length" class="mag-char-cli-block">
                    <div class="mag-char-cli-header">
                        <span>{{ $t("magCharCliCommands") }}</span>
                        <button
                            class="mag-char-btn mag-char-btn-cancel"
                            style="font-size: 10px; padding: 2px 8px"
                            @click="copyCliCommands"
                        >
                            {{ $t("magCharCliCopy") }}
                        </button>
                    </div>
                    <pre class="mag-char-cli-pre">{{ cliCommands.join("\n") }}</pre>
                </div>

                <!-- Actions -->
                <div class="mag-char-complete-actions">
                    <button class="mag-char-btn mag-char-btn-primary" @click="exportCharacterizationData">
                        {{ $t("improvedTumbleExportModel") }}
                    </button>
                    <button
                        class="mag-char-btn mag-char-btn-cancel"
                        :disabled="isFetchingGeo"
                        @click="fetchGeoReference"
                    >
                        {{ $t("magCharCompleteRefreshGps") }}
                    </button>
                    <button
                        class="mag-char-btn mag-char-btn-primary"
                        style="background: #eebb44; border-color: #eebb44"
                        @click="doApplyAndReboot"
                        :disabled="!canApply"
                    >
                        {{ $t("magCharCompleteApplyReboot") }}
                    </button>
                </div>

                <!-- No geo warning -->
                <p v-if="!geoReference" class="mag-char-geo-hint">
                    {{ $t("magCharCompleteNoGeo") }}
                </p>

                <button class="mag-char-btn mag-char-btn-primary" @click="handleClose" style="margin-top: 12px">
                    {{ $t("magCharClose") }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onScopeDispose } from "vue";
import { useTranslation } from "i18next-vue";
import { useFlightControllerStore } from "../../stores/fc";
import { useMagCharacterization } from "../../composables/useMagCharacterization.js";
import MagSphereView from "./mag-calibration/MagSphereView.vue";
import { send as cliSend, saveAndReconnect, isMspCliSupported } from "../../composables/useMspCliSession.js";
import {
    MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN,
    isFirmwareCustomMagAlignCapable,
} from "../../js/utils/magCharacterizationCompute.js";

const emit = defineEmits(["close"]);

const fcStore = useFlightControllerStore();
useTranslation(); // registers i18n; $t() directive is used in the template

const mag = useMagCharacterization();

const {
    phase,
    calibrationSamples,
    calibrationSampleCount,
    calibrationCoverage,
    calibrationSphereFit,
    solverResult,
    ellipsoidParams,
    ellipsoidDiag,
    calibrationOffsets,
    geoReference,
    isFetchingGeo,
    startTumble,
    computeResults,
    exportCharacterizationData,
    fetchGeoReference,
    close,
} = mag;

const attitudeRaw = reactive({ roll: 0, pitch: 0, heading: 0 });
const attitudeQuaternion = ref(null);

const calLiveMag = computed(() => {
    const m = fcStore.sensorData.magnetometer;
    return m && m.length === 3 ? { x: m[0], y: m[1], z: m[2] } : null;
});

const tumblePromptIndex = ref(0);
const TUMBLE_PROMPTS = [
    "improvedTumblePrompt1",
    "improvedTumblePrompt2",
    "improvedTumblePrompt3",
    "improvedTumblePrompt4",
];
const currentTumblePrompt = computed(() => TUMBLE_PROMPTS[tumblePromptIndex.value]);
let promptTimer = null;

watch(
    () => phase.value,
    (p) => {
        if (p === "calibrate") {
            promptTimer = setInterval(() => {
                tumblePromptIndex.value = (tumblePromptIndex.value + 1) % TUMBLE_PROMPTS.length;
            }, 10000);
            startAttitudePolling();
        } else {
            if (promptTimer) {
                clearInterval(promptTimer);
                promptTimer = null;
            }
            stopAttitudePolling();
        }
    },
);

let attitudeTimer = null;
function startAttitudePolling() {
    attitudeTimer = setInterval(() => {
        const k = fcStore.sensorData.kinematics;
        attitudeRaw.roll = k[0] || 0;
        attitudeRaw.pitch = k[1] || 0;
        attitudeRaw.heading = k[2] || 0;
        attitudeQuaternion.value = fcStore.sensorData.quaternion || null;
        const m = fcStore.sensorData.magnetometer;
        if (m) lastMag.value = [m[0] || 0, m[1] || 0, m[2] || 0];
    }, 80);
}
function stopAttitudePolling() {
    if (attitudeTimer) {
        clearInterval(attitudeTimer);
        attitudeTimer = null;
    }
}

const lastMag = ref([0, 0, 0]);

const canCompute = computed(() => calibrationSampleCount.value >= 40);

const canApply = computed(
    () => solverResult.value !== null && !solverResult.value?.error && cliCommands.value.length > 0,
);

const qualityVerdict = computed(() => {
    if (!solverResult.value) return null;
    const residual = solverResult.value.quality?.meanResidualDeg;
    if (residual == null) return null;
    if (residual > 10) return "improvedTumbleQualityPoor";
    if (residual > 5) return "improvedTumbleQualityFair";
    return "improvedTumbleQualityGood";
});
const qualityVerdictClass = computed(() => {
    const residual = solverResult.value?.quality?.meanResidualDeg;
    if (residual == null || residual > 5) return "mag-char-verdict-warn";
    return "mag-char-verdict-good";
});

function isCustomMagAlignSupported() {
    return isFirmwareCustomMagAlignCapable(fcStore.config?.flightControllerVersion);
}

const cliCommands = computed(() => {
    const lines = [];
    const r = solverResult.value;
    if (!r || r.error) return lines;

    if (r.preset === 9) {
        if (!isCustomMagAlignSupported()) {
            lines.push(
                `# WARNING: firmware ${fcStore.config?.flightControllerVersion || "?"} predates betaflight#14849 (${MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN}+): it would apply the INVERSE of these angles. Update the firmware before using CUSTOM alignment.`,
            );
        }
        lines.push("set align_mag = CUSTOM");
        lines.push(`set mag_align_roll = ${Math.round(r.euler_zyx_deg.roll * 10)}`);
        lines.push(`set mag_align_pitch = ${Math.round(r.euler_zyx_deg.pitch * 10)}`);
        lines.push(`set mag_align_yaw = ${Math.round(r.euler_zyx_deg.yaw * 10)}`);
    } else if (r.preset >= 1 && r.preset <= 8) {
        const names = ["", "CW0", "CW90", "CW180", "CW270", "CW0FLIP", "CW90FLIP", "CW180FLIP", "CW270FLIP"];
        lines.push(`set align_mag = ${names[r.preset]}`);
    }

    if (calibrationOffsets.value) {
        lines.push(
            `set mag_calibration = ${calibrationOffsets.value.x},${calibrationOffsets.value.y},${calibrationOffsets.value.z}`,
        );
    }

    if (geoReference.value) {
        lines.push(`set mag_declination = ${Math.round(geoReference.value.declination * 10)}`);
    }

    lines.push("save");
    return lines;
});

function copyCliCommands() {
    const text = cliCommands.value.join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
}

function handleClose() {
    close();
    emit("close");
}

async function doApplyAndReboot() {
    const cmds = cliCommands.value;
    if (!cmds.length || !isMspCliSupported()) return;

    try {
        for (const cmd of cmds) {
            if (cmd.startsWith("#") || cmd.startsWith("save")) continue;
            await cliSend(cmd);
        }
        await saveAndReconnect();
        handleClose();
    } catch (e) {
        console.error("Failed to apply mag calibration:", e);
    }
}

onMounted(() => {
    startAttitudePolling();
});

onScopeDispose(() => {
    stopAttitudePolling();
    if (promptTimer) clearInterval(promptTimer);
});
</script>

<style scoped>
/* Reuse the existing mag-char-* CSS classes already defined elsewhere.
   The dialog inherits styles from the global stylesheet. */
</style>
