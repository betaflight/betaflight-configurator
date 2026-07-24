<template>
    <UiBox :title="$t('autotuneGainTitle')">
        <div v-if="visibleAxisList.length" class="overflow-x-auto mb-3">
            <table class="autotune-table w-full">
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
                        <tr v-if="row.sectionTitleKey && index > 0">
                            <td :colspan="2 + visibleAxisList.length" class="!h-3 !p-0 !border-none"></td>
                        </tr>
                        <tr v-if="row.columnHeaders" class="column-header-row">
                            <th scope="col"></th>
                            <th scope="col">
                                {{ row.currentHeader === "" ? "" : row.currentHeader || $t("autotuneCurrent") }}
                            </th>
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

        <!-- Profile selector + Apply Button -->
        <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-2 text-sm">
                <span class="text-dimmed">{{ $t("autotuneApplyToProfile") }}</span>
                <select
                    v-model="selectedProfile"
                    :disabled="!isConnected || store.profileOperationInFlight"
                    class="bg-transparent border border-[var(--surface-300)] rounded px-2 py-1"
                >
                    <option value="logged">{{ $t("autotuneLoggedPids") }}</option>
                    <option v-for="p in profileOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
                </select>
            </label>
            <UButton @click="onApply" size="sm" :disabled="!canApply">
                {{ $t("autotuneApplyGains") }}
            </UButton>
            <span v-if="!isConnected" class="text-sm text-dimmed" v-html="$t('autotuneConnectRequired')"></span>
            <span v-else-if="isLogged" class="text-sm text-dimmed">{{ $t("autotuneSelectProfileToApply") }}</span>
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
const { applyGains, getProfileOptions, loadComparisonProfile } = useAutotune();

// This component is destroyed and recreated on every tab switch (no <KeepAlive>), while
// store.profileCache outlives that as app-level state. The FC.CONFIG.profile watcher in
// the store only catches profile *switches* made elsewhere (e.g. PID Tuning tab), not
// edits saved to the profile that stayed active the whole time — the common case. Clear
// the cache on every fresh mount so returning to this tab always re-fetches.
store.clearProfileCache();

const applied = ref(false);
const applying = ref(false);
const applyError = ref("");
const comparisonData = ref(null);

const isConnected = computed(() => connectionStore.connectionValid);
const isLogged = computed(() => store.comparisonProfile === "logged");
const canApply = computed(
    () =>
        isConnected.value &&
        !isLogged.value &&
        !applying.value &&
        !store.profileOperationInFlight &&
        store.analysisResult != null,
);

const selectedProfile = computed({
    get: () => store.comparisonProfile,
    set: (value) => store.setComparisonProfile(value),
});

const profileOptions = computed(() => (isConnected.value ? getProfileOptions() : []));

const AXIS_DEFS = [
    { key: "roll", labelKey: "autotuneAxisRoll", color: "#e24761", pidKey: "rollPID" },
    { key: "pitch", labelKey: "autotuneAxisPitch", color: "#49c747", pidKey: "pitchPID" },
    { key: "yaw", labelKey: "autotuneAxisYaw", color: "#477ac7", pidKey: "yawPID" },
];

const PID_NUMBER_ROWS = [
    { key: "P", label: "P", get: (nums) => nums?.P },
    { key: "I", label: "I", get: (nums) => nums?.I },
    { key: "D", label: "D", get: (nums) => nums?.D },
    { key: "F", label: "F", get: (nums) => nums?.F },
    { key: "dMax", label: "D-max", get: (nums) => nums?.dMax },
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

const visibleAxisList = computed(() => {
    const axes = store.analysisResult?.axes;
    if (!axes) {
        return [];
    }
    return AXIS_DEFS.filter((a) => axes[a.key] && store.visibleAxes[a.key]);
});

watch(
    () => [store.comparisonProfile, store.analysisResult, connectionStore.connectionValid],
    async () => {
        if (!store.analysisResult) {
            comparisonData.value = null;
            return;
        }
        if (!isConnected.value && store.comparisonProfile !== "logged") {
            store.setComparisonProfile("logged");
            return;
        }
        try {
            comparisonData.value = await loadComparisonProfile(store.comparisonProfile);
        } catch (err) {
            console.error("Failed to load comparison profile:", err);
            comparisonData.value = null;
        }
    },
    { immediate: true },
);

watch(selectedProfile, () => {
    applied.value = false;
    applyError.value = "";
});

function getCurrentPidValue(profileData, axis, row) {
    if (!profileData) {
        return null;
    }
    if (row.key === "F") {
        const key = FEEDFORWARD_KEY(axis);
        return profileData.advanced?.[key] ?? null;
    }
    if (row.key === "dMax") {
        const key = DMAX_KEY(axis);
        return profileData.advanced?.[key] ?? null;
    }
    return profileData.pids?.[axis]?.[row.key] ?? null;
}

function FEEDFORWARD_KEY(axis) {
    return ["feedforwardRoll", "feedforwardPitch", "feedforwardYaw"][axis];
}

function DMAX_KEY(axis) {
    return ["dMaxRoll", "dMaxPitch", "dMaxYaw"][axis];
}

function buildCurrentPidRow(row, profileData, isFirst) {
    const perAxis = {};
    for (const a of visibleAxisList.value) {
        const value = getCurrentPidValue(profileData, AXIS_DEFS.indexOf(a), row);
        if (value != null) {
            perAxis[a.key] = { value, changePct: null };
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

function buildProposedPidRow(row, axes, profileData, isFirst) {
    const perAxis = {};
    for (const a of visibleAxisList.value) {
        const nums = axes[a.key]?.gains?.proposedNumbers;
        const proposed = nums ? row.get(nums) : null;
        if (proposed != null) {
            const current = getCurrentPidValue(profileData, AXIS_DEFS.indexOf(a), row);
            const changePct = current != null && current !== 0 ? ((proposed - current) / current) * 100 : null;
            perAxis[a.key] = { value: proposed, changePct };
        }
    }
    return {
        key: `proposed-pid-${row.key}`,
        label: row.label,
        current: "",
        currentHeader: "",
        axes: perAxis,
        sectionTitleKey: isFirst ? "autotuneSectionProposedPids" : null,
        columnHeaders: isFirst,
    };
}

function buildDtermRows(axes, profileData) {
    const currentMultiplier = profileData?.dtermFilterMultiplier ?? 100;

    const perAxisProposed = {};
    for (const a of visibleAxisList.value) {
        const proposed = axes[a.key]?.gains?.proposedDtermMultiplier;
        if (proposed != null) {
            const changePct = currentMultiplier === 0 ? 0 : ((proposed - currentMultiplier) / currentMultiplier) * 100;
            perAxisProposed[a.key] = { value: proposed, changePct };
        }
    }

    const globalProposed = Object.values(axes)
        .map((a) => a.gains.proposedDtermMultiplier)
        .filter((v) => v != null);
    const globalFloor = globalProposed.length > 0 ? Math.min(...globalProposed) : null;

    const floorPerAxis = {};
    for (const a of visibleAxisList.value) {
        if (globalFloor != null) {
            const changePct =
                currentMultiplier === 0 ? 0 : ((globalFloor - currentMultiplier) / currentMultiplier) * 100;
            floorPerAxis[a.key] = { value: globalFloor, changePct };
        }
    }

    return [
        {
            key: "dterm-proposed-per-axis",
            labelKey: "autotuneDtermPerAxis",
            current: currentMultiplier,
            axes: perAxisProposed,
            sectionTitleKey: "autotuneSectionDtermFilter",
            columnHeaders: true,
        },
        {
            key: "dterm-applied-floor",
            labelKey: "autotuneDtermAppliedFloor",
            current: currentMultiplier,
            axes: floorPerAxis,
            sectionTitleKey: null,
        },
    ];
}

const tableRows = computed(() => {
    const axes = store.analysisResult?.axes;
    if (!axes) {
        return [];
    }

    const profileData = comparisonData.value;

    return [
        ...PID_NUMBER_ROWS.map((r, i) => buildCurrentPidRow(r, profileData, i === 0)),
        ...ANALYSIS_FIELDS.map((f, i) => buildAnalysisRow(f, axes, i === 0)),
        ...PID_NUMBER_ROWS.map((r, i) => buildProposedPidRow(r, axes, profileData, i === 0)),
        ...buildDtermRows(axes, profileData),
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
    if (!canApply.value) {
        return;
    }

    applyError.value = "";
    applied.value = false;
    applying.value = true;
    try {
        await applyGains(store.comparisonProfile, store.analysisResult);
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
