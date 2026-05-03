<template>
    <UiBox :title="$t('autotuneGainTitle')">
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

        <!-- Axis selector + Apply Button -->
        <div class="flex flex-wrap items-center gap-4">
            <label v-if="visibleAxisList.length > 1" class="flex items-center gap-2 text-sm">
                <span class="text-dimmed">{{ $t("autotuneApplyFromAxis") }}</span>
                <select
                    v-model="selectedAxisKey"
                    class="bg-transparent border border-[var(--surface-300)] rounded px-2 py-1"
                >
                    <option v-for="axis in visibleAxisList" :key="axis.key" :value="axis.key">
                        {{ $t(axis.labelKey) }}
                    </option>
                </select>
            </label>
            <UButton @click="onApply" size="sm" :disabled="!isConnected || !selectedAxisKey || applying">
                {{ $t("autotuneApplyGains") }}
            </UButton>
            <span v-if="!isConnected" class="text-sm text-dimmed" v-html="$t('autotuneConnectRequired')"></span>
            <span v-if="applied" class="text-sm text-green-500 font-bold" v-html="$t('autotuneApplied')"></span>
            <span v-if="applyError" class="text-sm text-red-500 font-bold">{{ applyError }}</span>
        </div>
    </UiBox>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useAutotuneStore } from "@/stores/autotune";
import { useConnectionStore } from "@/stores/connection";
import { useAutotune } from "@/composables/useAutotune";
import { i18n } from "@/js/localization";
import UiBox from "../../elements/UiBox.vue";

const store = useAutotuneStore();
const connectionStore = useConnectionStore();
const { applyGains } = useAutotune();

const applied = ref(false);
const applying = ref(false);
const applyError = ref("");
const selectedAxisKey = ref(null);

const isConnected = computed(() => connectionStore.connectionValid);

const AXIS_DEFS = [
    { key: "roll", labelKey: "autotuneAxisRoll", color: "#e74c3c", pidKey: "rollPID" },
    { key: "pitch", labelKey: "autotuneAxisPitch", color: "#2ecc71", pidKey: "pitchPID" },
    { key: "yaw", labelKey: "autotuneAxisYaw", color: "#3498db", pidKey: "yawPID" },
];

const PID_ROWS = [
    { key: "P", index: 0, label: "P" },
    { key: "I", index: 1, label: "I" },
    { key: "D", index: 2, label: "D" },
];

const ANALYSIS_FIELDS = [
    { key: "bandwidth", labelKey: "autotuneBandwidth", format: formatHz },
    { key: "phaseMargin", labelKey: "autotunePhaseMargin", format: formatDeg },
    { key: "resonantPeak", labelKey: "autotuneResonantPeak", format: formatDb },
    { key: "sensitivityPeak", labelKey: "autotuneSensitivityPeak", format: formatDb },
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

function formatHz(v) {
    return v == null ? "--" : `${v.toFixed(1)} Hz`;
}
function formatDeg(v) {
    return v == null ? "--" : `${v.toFixed(1)}\u00B0`;
}
function formatDb(v) {
    return v == null ? "--" : `${v.toFixed(1)} dB`;
}
function formatPct(v) {
    return v == null ? "--" : `${v.toFixed(0)}%`;
}
function formatMs(v) {
    return v == null ? "--" : `${v.toFixed(1)} ms`;
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
