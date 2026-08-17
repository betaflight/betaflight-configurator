<template>
    <UiBox :title="$t('autotuneGainTitle')" type="neutral" collapsible>
        <div v-if="visibleAxisList.length" class="overflow-x-auto mb-3">
            <table class="autotune-table w-full">
                <!-- Axis group headers -->
                <thead>
                    <tr>
                        <th scope="col"></th>
                        <th scope="col"></th>
                        <th
                            v-for="axis in visibleAxisList"
                            :key="axis.key"
                            scope="col"
                            :style="{ color: axis.color }"
                            class="!text-[13px] !border-b-2 !border-[var(--surface-300)]"
                        >
                            {{ $t(axis.labelKey) }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="(row, index) in tableRows" :key="row.key">
                        <!-- Empty-row gap before each new section (except the first) -->
                        <tr v-if="row.sectionTitleKey && index > 0">
                            <td :colspan="2 + visibleAxisList.length" class="!h-3 !p-0 !border-none"></td>
                        </tr>
                        <tr v-if="row.columnHeaders" class="column-header-row">
                            <th scope="col"></th>
                            <th scope="col">{{ $t("autotuneCurrent") }}</th>
                            <th v-for="axis in visibleAxisList" :key="axis.key" scope="col">
                                {{ $t("autotuneProposed") }}
                            </th>
                        </tr>
                        <tr v-if="row.sectionTitleKey" class="section-title-row">
                            <td :colspan="2 + visibleAxisList.length">{{ $t(row.sectionTitleKey) }}</td>
                        </tr>
                        <tr>
                            <td class="font-bold text-dimmed">
                                {{ row.labelKey ? $t(row.labelKey) : row.label }}
                            </td>
                            <td class="text-dimmed">{{ row.current }}</td>
                            <td
                                v-for="axis in visibleAxisList"
                                :key="axis.key"
                                :class="changeClass(row.axes[axis.key]?.changePct)"
                            >
                                <template v-if="row.axes[axis.key]">
                                    {{ row.axes[axis.key].value }}
                                    <span v-if="row.axes[axis.key].changePct != null" class="text-[10px] opacity-80">
                                        ({{ formatChangePct(row.axes[axis.key].changePct) }})
                                    </span>
                                </template>
                                <template v-else>--</template>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>

        <!-- Tuning target + Axis selector + Apply Button -->
        <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-2 text-sm">
                <span class="text-dimmed">{{ $t("autotuneTargetMargin") }}</span>
                <USelect v-model="targetPhaseMargin" :items="marginOptions" size="xs" class="min-w-40" />
            </label>
            <label v-if="visibleAxisList.length > 1" class="flex items-center gap-2 text-sm">
                <span class="text-dimmed">{{ $t("autotuneApplyFromAxis") }}</span>
                <USelect v-model="selectedAxisKey" :items="axisOptions" size="xs" class="min-w-28" />
            </label>
            <UButton @click="onApply" size="xs" :disabled="!isConnected || !selectedAxisKey || applying">
                {{ $t("autotuneApplyGains") }}
            </UButton>
            <span v-if="!isConnected" class="text-sm text-dimmed" v-html="$t('autotuneConnectRequired')"></span>
            <span v-if="applied" class="text-sm text-green-500 font-bold" v-html="$t('autotuneApplied')"></span>
            <span v-if="applyError" class="text-sm text-red-500 font-bold">{{ applyError }}</span>
        </div>

        <!-- Notes on any axis where the recommendation is not simply the margin
             target met in full: the craft's phase peak caps the reachable
             margin, the per-pass clamp cuts the change short, or robustness
             rather than margin set the gain. -->
        <p v-for="note in recommendationNotes" :key="note.key" class="text-sm text-dimmed">{{ note.text }}</p>
    </UiBox>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useAutotuneStore } from "@/stores/autotune";
import { useConnectionStore } from "@/stores/connection";
import { useAutotune } from "@/composables/useAutotune";
import { PHASE_MARGIN_PRESETS } from "@/js/blackbox/spectral_analysis";
import { i18n } from "@/js/localization";
import UiBox from "../../elements/UiBox.vue";

const store = useAutotuneStore();
const connectionStore = useConnectionStore();
const { applyGains, recomputeGains } = useAutotune();

const applied = ref(false);
const applying = ref(false);
const applyError = ref("");
const selectedAxisKey = ref(null);

const isConnected = computed(() => connectionStore.connectionValid);

const MARGIN_OPTIONS = [
    { value: PHASE_MARGIN_PRESETS.AGGRESSIVE, labelKey: "autotuneMarginAggressive" },
    { value: PHASE_MARGIN_PRESETS.NORMAL, labelKey: "autotuneMarginNormal" },
    { value: PHASE_MARGIN_PRESETS.CONSERVATIVE, labelKey: "autotuneMarginConservative" },
];

const marginOptions = computed(() =>
    MARGIN_OPTIONS.map((opt) => ({
        label: `${i18n.getMessage(opt.labelKey)} (${opt.value}°)`,
        value: opt.value,
    })),
);

const axisOptions = computed(() =>
    visibleAxisList.value.map((axis) => ({ label: i18n.getMessage(axis.labelKey), value: axis.key })),
);

const targetPhaseMargin = computed({
    get: () => store.targetPhaseMarginDeg,
    set: (v) => {
        store.targetPhaseMarginDeg = v;
    },
});

// Changing the target only re-derives gains from the stored transfer functions,
// so there is no need to re-import the log. Watching the store rather than
// acting in the setter also covers writes from elsewhere, such as reset().
watch(
    () => store.targetPhaseMarginDeg,
    (target) => {
        recomputeGains(target);
        applied.value = false;
        applyError.value = "";
    },
);

// Axes whose phase never reaches the requested margin, so their gain is held.
const unreachableAxisDefs = computed(() =>
    visibleAxisList.value.filter((axis) => {
        const g = store.analysisResult?.axes?.[axis.key]?.gains;
        return g && !Number.isFinite(g.targetCrossover);
    }),
);

const unreachableAxes = computed(() => unreachableAxisDefs.value.map((axis) => i18n.getMessage(axis.labelKey)));

// Scoped to the axes actually named in the message, so the limit reported is
// theirs — a reachable axis with a lower ceiling must not be quoted here.
const maxReachableMargin = computed(() => {
    const values = unreachableAxisDefs.value
        .map((axis) => store.analysisResult?.axes?.[axis.key]?.gains?.maxPhaseMargin)
        .filter((v) => Number.isFinite(v));
    return values.length ? Math.min(...values) : Number.NaN;
});

const unreachableMessage = computed(() =>
    i18n.getMessage("autotuneTargetUnreachable", [
        unreachableAxes.value.join(", "),
        targetPhaseMargin.value,
        formatDeg(maxReachableMargin.value),
    ]),
);

// Axes carrying a given flag on their recommendation, named for a message.
function axesFlagged(flag) {
    return visibleAxisList.value
        .filter((axis) => store.analysisResult?.axes?.[axis.key]?.gains?.[flag])
        .map((axis) => i18n.getMessage(axis.labelKey));
}

// Every way the recommendation can be something other than the margin target
// met in full. Without these the table shows a crossover limit and a proposed
// gain with no indication that the second does not reach the first.
const recommendationNotes = computed(() => {
    const notes = [];

    if (unreachableAxes.value.length) {
        notes.push({ key: "unreachable", text: unreachableMessage.value });
    }

    const clamped = axesFlagged("gainClamped");
    if (clamped.length) {
        const requested = Math.max(
            ...visibleAxisList.value
                .map((axis) => store.analysisResult?.axes?.[axis.key]?.gains)
                .filter((g) => g?.gainClamped)
                .map((g) => g.requestedGain),
        );
        notes.push({
            key: "clamped",
            text: i18n.getMessage("autotuneGainClamped", [clamped.join(", "), requested.toFixed(1)]),
        });
    }

    const fragile = axesFlagged("sensitivityUnreachable");
    if (fragile.length) {
        notes.push({
            key: "fragile",
            text: i18n.getMessage("autotuneSensitivityUnreachable", [fragile.join(", ")]),
        });
    }

    // Suppressed where the stronger message above already covers the axis.
    const binds = axesFlagged("sensitivityBinds").filter((name) => !fragile.includes(name));
    if (binds.length) {
        notes.push({ key: "binds", text: i18n.getMessage("autotuneSensitivityBinds", [binds.join(", ")]) });
    }

    return notes;
});

const AXIS_DEFS = [
    { key: "roll", labelKey: "autotuneAxisRoll", color: "#e24761", pidKey: "rollPID" },
    { key: "pitch", labelKey: "autotuneAxisPitch", color: "#49c747", pidKey: "pitchPID" },
    { key: "yaw", labelKey: "autotuneAxisYaw", color: "#477ac7", pidKey: "yawPID" },
];

const PID_ROWS = [
    { key: "P", index: 0, label: "P" },
    { key: "I", index: 1, label: "I" },
    { key: "D", index: 2, label: "D" },
];

const ANALYSIS_FIELDS = [
    { key: "bandwidth", labelKey: "autotuneBandwidth", format: formatHz },
    { key: "crossover", labelKey: "autotuneCrossover", format: formatHz },
    { key: "phaseMargin", labelKey: "autotunePhaseMargin", format: formatDeg },
    { key: "targetCrossover", labelKey: "autotuneTargetCrossover", format: formatHz },
    { key: "maxPhaseMargin", labelKey: "autotuneMaxPhaseMargin", format: formatDeg },
    { key: "loopDelay", labelKey: "autotuneLoopDelay", format: formatMs },
    { key: "resonantPeak", labelKey: "autotuneResonantPeak", format: formatDb },
    { key: "sensitivityPeak", labelKey: "autotuneSensitivityPeak", format: formatDb },
    { key: "predictedSensitivityPeak", labelKey: "autotunePredictedSensitivity", format: formatDb },
    { key: "overshoot", labelKey: "autotuneOvershoot", format: formatPct },
    { key: "riseTime", labelKey: "autotuneRiseTime", format: formatMs },
    { key: "settlingTime", labelKey: "autotuneSettlingTime", format: formatMs },
    { key: "coherencePct", labelKey: "autotuneCoherence", format: formatPct },
];

const SLIDER_FIELDS = [
    {
        key: "slider_master_multiplier",
        configKey: "simplified_master_multiplier",
        labelKey: "autotuneSliderMasterMultiplier",
    },
    { key: "slider_pi_gain", configKey: "simplified_pi_gain", labelKey: "autotuneSliderPIGain" },
    { key: "slider_i_gain", configKey: "simplified_i_gain", labelKey: "autotuneSliderIGain" },
    { key: "slider_d_gain", configKey: "simplified_d_gain", labelKey: "autotuneSliderDGain" },
    { key: "slider_feedforward_gain", configKey: "simplified_feedforward_gain", labelKey: "autotuneSliderFeedforward" },
    {
        key: "slider_dterm_filter_multiplier",
        configKey: "simplified_dterm_filter_multiplier",
        labelKey: "autotuneSliderDTermFilter",
    },
];

const visibleAxisList = computed(() => {
    const axes = store.analysisResult?.axes;
    if (!axes) {
        return [];
    }
    return AXIS_DEFS.filter((a) => axes[a.key] && store.visibleAxes[a.key]);
});

// Reset the "applied" indicator and select a default axis each time a new
// analysis result is loaded.
watch(
    () => store.analysisResult,
    (result) => {
        applied.value = false;
        applyError.value = "";
        if (!result) {
            selectedAxisKey.value = null;
            return;
        }
        const first = visibleAxisList.value[0];
        selectedAxisKey.value = first ? first.key : null;
    },
    { immediate: true },
);

// If the currently selected axis gets hidden (or disappears), fall back to the
// first still-visible axis so Apply Gains never targets a hidden axis.
watch(visibleAxisList, (list) => {
    if (!list.some((a) => a.key === selectedAxisKey.value)) {
        selectedAxisKey.value = list[0]?.key ?? null;
    }
});

// Reset the apply status when the user switches axis so the previous
// success/error indicator can't be misread as applying to the new axis.
watch(selectedAxisKey, () => {
    applied.value = false;
    applyError.value = "";
});

function buildCurrentPidRow(row, sc, isFirst) {
    const perAxis = {};
    for (const a of visibleAxisList.value) {
        const pid = sc[a.pidKey];
        if (pid) {
            perAxis[a.key] = { value: pid[row.index], changePct: null };
        }
    }
    return {
        key: `current-pid-${row.key}`,
        label: row.label,
        current: "",
        axes: perAxis,
        sectionTitleKey: isFirst ? "autotuneSectionCurrentPids" : null,
    };
}

function buildAnalysisRow(field, axes, isFirst) {
    const perAxis = {};
    for (const a of visibleAxisList.value) {
        const val = axes[a.key]?.gains?.[field.key];
        if (val != null) {
            perAxis[a.key] = { value: field.format(val), changePct: null };
        }
    }
    return {
        key: `analysis-${field.key}`,
        labelKey: field.labelKey,
        current: "",
        axes: perAxis,
        sectionTitleKey: isFirst ? "autotuneSectionAnalysis" : null,
    };
}

function buildSliderRow(field, axes, sc, isFirst) {
    const current = sc[field.configKey] ?? 100;
    const perAxis = {};
    for (const a of visibleAxisList.value) {
        const proposed = axes[a.key]?.gains?.proposed?.[field.key];
        if (proposed != null) {
            const changePct = current === 0 ? 0 : ((proposed - current) / current) * 100;
            perAxis[a.key] = { value: proposed, changePct };
        }
    }
    return {
        key: `slider-${field.key}`,
        labelKey: field.labelKey,
        current,
        axes: perAxis,
        sectionTitleKey: isFirst ? "autotuneSectionProposedSliders" : null,
        columnHeaders: isFirst,
    };
}

const tableRows = computed(() => {
    const axes = store.analysisResult?.axes;
    const sc = store.analysisResult?.sysConfig;
    if (!axes || !sc) {
        return [];
    }

    return [
        ...PID_ROWS.map((r, i) => buildCurrentPidRow(r, sc, i === 0)),
        ...ANALYSIS_FIELDS.map((f, i) => buildAnalysisRow(f, axes, i === 0)),
        ...SLIDER_FIELDS.map((f, i) => buildSliderRow(f, axes, sc, i === 0)),
    ];
});

function changeClass(pct) {
    if (pct == null) {
        return "";
    }
    if (pct > 5) {
        return "text-green-500 font-bold";
    }
    if (pct < -5) {
        return "text-red-500 font-bold";
    }
    return "text-dimmed";
}

// Metrics are NaN when the measurement gives no basis for them \u2014 for example a
// craft whose open-loop phase never reaches the margin limit inside the
// coherent band. Render those as "--" rather than "NaN".
function formatHz(v) {
    return Number.isFinite(v) ? `${v.toFixed(1)} Hz` : "--";
}
function formatDeg(v) {
    return Number.isFinite(v) ? `${v.toFixed(1)}\u00B0` : "--";
}
function formatDb(v) {
    return Number.isFinite(v) ? `${v.toFixed(1)} dB` : "--";
}
function formatPct(v) {
    return Number.isFinite(v) ? `${v.toFixed(0)}%` : "--";
}
function formatMs(v) {
    return Number.isFinite(v) ? `${v.toFixed(1)} ms` : "--";
}

function formatChangePct(v) {
    if (v == null || v === 0) {
        return "--";
    }
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(0)}%`;
}

async function onApply() {
    if (!isConnected.value || !selectedAxisKey.value) {
        return;
    }
    const proposed = store.analysisResult?.axes?.[selectedAxisKey.value]?.gains?.proposed;
    if (!proposed) {
        return;
    }

    applyError.value = "";
    applied.value = false;
    applying.value = true;
    try {
        await applyGains(proposed);
        applied.value = true;
    } catch (err) {
        applyError.value = `${i18n.getMessage("autotuneApplyFailed")}: ${err?.message || err}`;
    } finally {
        applying.value = false;
    }
}
</script>

<style>
.autotune-table {
    border-collapse: collapse;

    th,
    td {
        padding: 5px 10px;
        text-align: left;
        border-bottom: 1px solid var(--surface-200);
        font-size: 12px;
    }

    th {
        font-weight: bold;
    }
}

.column-header-row th {
    font-size: 11px;
    padding-top: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--surface-300);
}

.section-title-row td {
    font-weight: bold;
    font-size: 11px;
    color: var(--surface-500);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-top: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--surface-300);
}
</style>
