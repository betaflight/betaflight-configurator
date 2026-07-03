<template>
    <div
        v-show="open"
        class="fixed top-[135px] left-[15px] right-[15px] bottom-[80px] flex flex-col bg-default border border-default rounded-lg shadow-lg"
    >
        <div class="flex items-center gap-3 px-4 py-2 border-b border-default shrink-0">
            <div class="flex-1 min-w-0">
                <h4 class="font-semibold">{{ craftName }}</h4>
                <div v-if="revision || boardInfo" class="flex items-center gap-2 flex-wrap text-xs text-dimmed mt-0.5">
                    <span v-if="revision">{{ revision }}</span>
                    <span v-if="revision && boardInfo" class="opacity-30">|</span>
                    <span v-if="boardInfo">{{ boardInfo }}</span>
                </div>
            </div>
            <div class="flex items-center gap-0.5">
                <UIcon name="i-lucide-columns-3" class="size-4 text-dimmed mr-1" />
                <button
                    v-for="n in [2, 3, 4, 5, 6]"
                    :key="n"
                    class="size-5 rounded text-[11px] leading-none font-medium"
                    :class="
                        cols === n ? 'bg-primary text-black' : 'text-dimmed hover:text-highlighted hover:bg-elevated'
                    "
                    :title="`${n} columns`"
                    @click="cols = cols === n ? null : n"
                >
                    {{ n }}
                </button>
            </div>
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-clipboard-copy"
                size="xs"
                title="Copy all parameters to clipboard"
                @click="copyToClipboard"
            />
            <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-x"
                label="Close"
                size="xs"
                @click="open = false"
            />
        </div>

        <div class="overflow-y-auto flex-1 p-4 font-mono text-xs">
            <!-- Pane columns: one pane per group, sortable for reordering -->
            <div
                ref="gridEl"
                class="gap-4"
                :class="cols ? '' : 'columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6'"
                :style="cols ? { columns: cols } : {}"
            >
                <div v-for="group in visiblePanes" :key="group" :data-group="group" class="break-inside-avoid mb-4">
                    <UiBox :title="group">
                        <template #title>
                            <UIcon
                                name="i-lucide-grip-horizontal"
                                class="drag-handle size-3 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 ml-1"
                            />
                        </template>

                        <!-- PID Settings: single merged table -->
                        <PidTable v-if="group === 'PID Settings'" :rows="allPids" :showDMax="showDMax" />

                        <!-- Features / Disabled Fields -->
                        <FeatureTable v-else-if="group === 'Features'" :data="featuresList" />
                        <FeatureTable v-else-if="group === 'Disabled Fields'" :data="disabledFieldsList" />

                        <!-- Default: ParamTable -->
                        <ParamTable v-else :params="groupParamMap[group]" />
                    </UiBox>
                </div>
            </div>

            <!-- All Headers (full-width below panes) -->
            <div class="mt-4">
                <UiBox title="All Headers" collapsible collapsed>
                    <template #actions>
                        <div class="flex items-center gap-2">
                            <UInput
                                v-model="headerSearch"
                                icon="i-lucide-search"
                                size="xs"
                                placeholder="Filter..."
                                class="w-36"
                            />
                            <UButton
                                :icon="headerSortAlpha ? 'i-lucide-arrow-down-a-z' : 'i-lucide-list'"
                                size="xs"
                                :variant="headerSortAlpha ? 'solid' : 'ghost'"
                                :color="headerSortAlpha ? 'primary' : 'neutral'"
                                title="Sort fields alphabetically"
                                @click="headerSortAlpha = !headerSortAlpha"
                            />
                            <UButton
                                :icon="headerSortGroups ? 'i-lucide-arrow-down-a-z' : 'i-lucide-arrow-up-down'"
                                size="xs"
                                :variant="headerSortGroups ? 'solid' : 'ghost'"
                                :color="headerSortGroups ? 'primary' : 'neutral'"
                                title="Sort groups alphabetically"
                                @click="headerSortGroups = !headerSortGroups"
                            />
                            <UButton
                                :icon="allGroupsExpanded ? 'i-lucide-fold-vertical' : 'i-lucide-unfold-vertical'"
                                size="xs"
                                :variant="allGroupsExpanded ? 'solid' : 'ghost'"
                                :color="allGroupsExpanded ? 'primary' : 'neutral'"
                                :title="allGroupsExpanded ? 'Collapse all groups' : 'Expand all groups'"
                                @click="toggleAllGroups"
                            />
                        </div>
                    </template>
                    <div class="text-xs text-dimmed mb-1">
                        {{ totalHeaderCount }} headers in {{ groupedHeaders.length }} groups
                    </div>
                    <div v-for="group in groupedHeaders" :key="group.name">
                        <!-- Group header -->
                        <div
                            class="flex items-center gap-1 py-1 px-1 bg-elevated border-b border-default cursor-pointer select-none text-xs"
                            @click="toggleGroupExpand(group.name)"
                        >
                            <UIcon
                                :name="
                                    expandedHeaderGroups.has(group.name)
                                        ? 'i-lucide-chevron-down'
                                        : 'i-lucide-chevron-right'
                                "
                                class="size-3.5 text-dimmed"
                            />
                            <span class="font-semibold text-highlighted flex-1">
                                {{ group.name }}
                                <span class="text-dimmed font-normal ml-1">({{ group.fields.length }})</span>
                            </span>
                            <UButton
                                variant="ghost"
                                color="neutral"
                                size="2xs"
                                :icon="hiddenGroups.has(group.name) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                                :title="hiddenGroups.has(group.name) ? `Show ${group.name}` : `Hide ${group.name}`"
                                @click.stop="toggleGroupVisibility(group.name)"
                            />
                        </div>
                        <!-- Field rows -->
                        <UTable
                            v-if="expandedHeaderGroups.has(group.name)"
                            :data="group.fields"
                            :columns="headerFieldColumns"
                            :ui="{
                                thead: 'sr-only',
                                base: 'w-full',
                                td: 'py-0.5 px-1 text-xs',
                                tr: 'border-b border-default',
                            }"
                        >
                            <template #name-cell="{ row }">
                                <span
                                    class="text-dimmed whitespace-nowrap"
                                    :class="{ 'opacity-40': hiddenFields.has(row.original.name) }"
                                    >{{ row.original.name }}</span
                                >
                            </template>
                            <template #value-cell="{ row }">
                                <span
                                    class="font-medium"
                                    :class="{ 'opacity-40': hiddenFields.has(row.original.name) }"
                                    >{{ row.original.value }}</span
                                >
                            </template>
                            <template #toggle-cell="{ row }">
                                <UButton
                                    variant="ghost"
                                    color="neutral"
                                    size="2xs"
                                    :icon="hiddenFields.has(row.original.name) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                                    :title="
                                        hiddenFields.has(row.original.name)
                                            ? `Show ${row.original.name}`
                                            : `Hide ${row.original.name}`
                                    "
                                    :class="{ 'opacity-40': !hiddenFields.has(row.original.name) }"
                                    @click="toggleFieldVisibility(row.original.name)"
                                />
                            </template>
                        </UTable>
                    </div>
                </UiBox>
            </div>
        </div>
    </div>
</template>

<script setup>
import semver from "semver";
import Sortable from "sortablejs";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import UiBox from "./UiBox.vue";
import ParamTable from "./ParamTable.vue";
import PidTable from "./PidTable.vue";
import FeatureTable from "./FeatureTable.vue";
import {
    OFF_ON,
    FAST_PROTOCOL,
    MOTOR_SYNC,
    SERIALRX_PROVIDER,
    ANTI_GRAVITY_MODE,
    RC_SMOOTHING_TYPE,
    RC_SMOOTHING_MODE,
    RC_SMOOTHING_DEBUG_AXIS,
    FILTER_TYPE,
    GYRO_LPF,
    GYRO_HARDWARE_LPF,
    ACC_HARDWARE,
    BARO_HARDWARE,
    MAG_HARDWARE,
    ITERM_RELAX,
    ITERM_RELAX_TYPE,
    RATES_TYPE,
    GYRO_TO_USE,
    FF_AVERAGING,
    SIMPLIFIED_PIDS_MODE,
    THROTTLE_LIMIT_TYPE,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_INAV,
} from "../flightlog_fielddefs";
import { getDebugModes } from "../../js/utils/debugModes";

const open = defineModel("open", { type: Boolean, default: false });
const cols = ref(null);

const props = defineProps({
    sysConfig: { type: Object, default: null },
});

// --- Helpers ---

const sc = computed(() => props.sysConfig || {});
const filteredSc = computed(() => {
    if (hiddenFields.value.size === 0) {
        return sc.value;
    }
    const result = { ...sc.value };
    for (const key of hiddenFields.value) {
        delete result[key];
    }
    return result;
});
const fwType = computed(() => sc.value.firmwareType);
const fwVer = computed(() => sc.value.firmwareVersion || "0.0.0");
const isBF = computed(() => fwType.value === FIRMWARE_TYPE_BETAFLIGHT);
const isINAV = computed(() => fwType.value === FIRMWARE_TYPE_INAV);

function gte(ver) {
    return semver.gte(fwVer.value, ver);
}
function lt(ver) {
    return semver.lt(fwVer.value, ver);
}
function lte(ver) {
    return semver.lte(fwVer.value, ver);
}

function fmtVal(data, decimalPlaces) {
    if (data == null) {
        return null;
    }
    return (data / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
}

function fmtFloat(data, decimalPlaces) {
    if (data == null) {
        return null;
    }
    return data.toFixed(decimalPlaces);
}

function selectVal(data, list) {
    if (data == null || !list) {
        return null;
    }
    return list[data] ?? String(data);
}

function bitmaskVal(data, totalBits = 8) {
    if (data == null) {
        return null;
    }
    const bin = data.toString(2).padStart(totalBits, "0");
    return `${data} (${bin})`;
}

function param(name, value, opts = {}) {
    return { name, value: value ?? "-", missing: value == null, ...opts };
}

// --- Copy to clipboard ---

function formatParams(title, params) {
    if (!params.length) {
        return "";
    }
    const lines = params.map((p) => `  ${p.name}: ${p.value}`).join("\n");
    return `${title}\n${lines}\n`;
}

function copyToClipboard() {
    const sections = [
        formatParams(
            "PID Settings",
            allPids.value.map((r) => {
                const dMax = showDMax.value ? ` DMax=${r.dMax}` : "";
                return { name: r.label, value: `P=${r.p} I=${r.i} D=${r.d}${dMax} FF=${r.f}` };
            }),
        ),
        formatParams("PID Sliders", pidSliderParams.value),
        formatParams("PID Controller", pidControllerParams.value),
        formatParams("Feedforward", feedforwardParams.value),
        formatParams("Rates", rateParams.value),
        formatParams("Rate Limits", rateLimitParams.value),
        formatParams("Parameters", generalParams.value),
        formatParams("Motor / ESC", motorParams.value),
        formatParams("Gyro Filters", gyroFilterParams.value),
        formatParams("D-Term Filters", dtermFilterParams.value),
        formatParams("Dynamic Notch", dynNotchParams.value),
        formatParams("RPM Filter", rpmFilterParams.value),
        formatParams("RC Smoothing", rcSmoothingParams.value),
    ];
    const text = `${craftName.value}\n${revision.value}\n${boardInfo.value}\n\n${sections.filter(Boolean).join("\n")}`;
    navigator.clipboard.writeText(text);
}

// --- Header ---

const craftName = computed(() => (sc.value["Craft name"] ? ` ${sc.value["Craft name"]}` : "Flight Log Header"));
const revision = computed(() => {
    const rev = sc.value["Firmware revision"];
    const date = sc.value["Firmware date"];
    if (!rev && !date) {
        return "";
    }
    return `${rev || ""} - ${date || ""}`.trim();
});
const boardInfo = computed(() => (sc.value["Board information"] ? `Board: ${sc.value["Board information"]}` : ""));

// --- PID Tables ---

const showDMax = computed(() => isBF.value && gte("4.0.0"));
const allPids = computed(() => [...mainPids.value, ...baroPids.value, ...magPids.value, ...gpsPids.value]);

function pidRow(label, data) {
    if (!data) {
        return {
            label,
            p: null,
            i: null,
            d: null,
            dMax: null,
            f: null,
            missing: true,
        };
    }
    return {
        label,
        p: data[0] ?? null,
        i: data[1] ?? null,
        d: data[2] ?? null,
        dMax: data[3] ?? null,
        f: data[4] ?? null,
        missing: false,
    };
}

const mainPids = computed(() =>
    [
        pidRow("Roll", filteredSc.value.rollPID),
        pidRow("Pitch", filteredSc.value.pitchPID),
        pidRow("Yaw", filteredSc.value.yawPID),
        pidRow("Level", filteredSc.value.levelPID),
    ].filter((r) => !r.missing),
);

const baroPids = computed(() =>
    [pidRow("ALT", filteredSc.value.altPID), pidRow("VEL", filteredSc.value.velPID)].filter((r) => !r.missing),
);

const magPids = computed(() => [pidRow("MAG", filteredSc.value.magPID)].filter((r) => !r.missing));

const gpsPids = computed(() =>
    [
        pidRow("POS", filteredSc.value.posPID),
        pidRow("POSR", filteredSc.value.posrPID),
        pidRow("NAVR", filteredSc.value.navrPID),
    ].filter((r) => !r.missing),
);

// --- PID Sliders ---

const pidSliderParams = computed(() => {
    if (!isBF.value || !gte("4.3.0")) {
        return [];
    }
    const s = filteredSc.value;
    return [
        param("Status", selectVal(s.simplified_pids_mode, SIMPLIFIED_PIDS_MODE)),
        param("PI gain", fmtVal(s.simplified_pi_gain, 0)),
        param("I gain", fmtVal(s.simplified_i_gain, 0)),
        param("D gain", fmtVal(s.simplified_d_gain, 0)),
        param("D Max", fmtVal(s.simplified_d_max_gain, 0)),
        param("FF gain", fmtVal(s.simplified_feedforward_gain, 0)),
        param("Pitch:Roll", fmtVal(s.simplified_pitch_d_gain, 0)),
        param("Pitch Gain", fmtVal(s.simplified_pitch_pi_gain, 0)),
        param("Master Gain", fmtVal(s.simplified_master_multiplier, 0)),
    ].filter((p) => !p.missing);
});

// --- Feedforward ---

const feedforwardParams = computed(() => {
    const s = filteredSc.value;
    const result = [param("Transition", fmtVal(s.ff_transition, 2))];
    if (isBF.value && gte("4.3.0")) {
        result.push(
            param("Average", selectVal(s.ff_averaging, FF_AVERAGING)),
            param("Smoothing", fmtVal(s.ff_smooth_factor, 0)),
            param("Jitter", fmtVal(s.ff_jitter_factor, 0)),
            param("MaxRate", fmtVal(s.ff_max_rate_limit, 0)),
        );
    }
    result.push(param("Boost", fmtVal(s.ff_boost, 0)));
    return result.filter((p) => !p.missing);
});

// --- Rates ---

function rateValue(rates, index, rMul, rDec) {
    return fmtVal(rates?.[index] == null ? null : rates[index] * rMul, rDec);
}

const rateParams = computed(() => {
    const s = filteredSc.value;
    const isI = isINAV.value;
    const rMul = isI ? 10 : 1;
    const rDec = isI ? 0 : 2;
    return [
        param("Rates Type", selectVal(s.rates_type, RATES_TYPE)),
        param("RC Roll Rate", fmtVal(s.rc_rates?.[0], 2)),
        param("RC Roll Expo", fmtVal(s.rc_expo?.[0], 2)),
        param("Roll Rate", rateValue(s.rates, 0, rMul, rDec)),
        param("RC Pitch Rate", fmtVal(s.rc_rates?.[1], 2)),
        param("RC Pitch Expo", fmtVal(s.rc_expo?.[1], 2)),
        param("Pitch Rate", rateValue(s.rates, 1, rMul, rDec)),
        param("RC Yaw Rate", fmtVal(s.rc_rates?.[2], 2)),
        param("RC Yaw Expo", fmtVal(s.rc_expo?.[2], 2)),
        param("Yaw Rate", rateValue(s.rates, 2, rMul, rDec)),
    ].filter((p) => !p.missing);
});

// --- PID Controller ---

const pidControllerParams = computed(() => {
    const s = filteredSc.value;
    const gainDec = isBF.value && gte("3.1.0") && lte("4.3.9") ? 3 : 0;

    return [
        // D Max (BF 4.0+)
        ...(isBF.value && gte("4.0.0")
            ? [
                  param("D Max Roll", fmtVal(s.d_max?.[0], 0)),
                  param("D Max Pitch", fmtVal(s.d_max?.[1], 0)),
                  param("D Max Yaw", fmtVal(s.d_max?.[2], 0)),
                  param("D Max Gain", fmtVal(s.d_max_gain, 0)),
                  param("D Max Advance", fmtVal(s.d_max_advance, 0)),
              ]
            : []),
        // Anti Gravity, TPA, PID limits & modifiers
        param("AG Mode", selectVal(s.anti_gravity_mode, ANTI_GRAVITY_MODE)),
        param("AG Gain", fmtVal(s.anti_gravity_gain, gainDec)),
        param("AG Threshold", fmtVal(s.anti_gravity_threshold, 0)),
        param("AG P Gain", fmtVal(s.anti_gravity_p_gain, 0)),
        param("AG Cutoff Hz", fmtVal(s.anti_gravity_cutoff_hz, 0)),
        param("TPA Rate", fmtVal(s.tpa_rate, 2)),
        param("TPA Breakpoint", fmtVal(s.tpa_breakpoint, 0)),
        param("Thrust Linear", fmtVal(s.thrust_linear, 0)),
        param("PID Sum Limit", fmtVal(s.pidSumLimit, 0)),
        param("PID Sum Limit Yaw", fmtVal(s.pidSumLimitYaw, 0)),
        param("Vbat Sag Comp", fmtVal(s.vbat_sag_compensation, 0)),
        param("I-Term Relax", selectVal(s.iterm_relax, ITERM_RELAX)),
        param("I-Term Relax Type", selectVal(s.iterm_relax_type, ITERM_RELAX_TYPE)),
        param("I-Term Relax Cutoff", fmtVal(s.iterm_relax_cutoff, 0)),
        // abs_control_gain removed in BF 2026.6
        ...(isBF.value && lt("2026.6.0") ? [param("Abs Control Gain", fmtVal(s.abs_control_gain, 0))] : []),
        param("PID At Min Throttle", selectVal(s.pidAtMinThrottle, OFF_ON)),
        param("Use Integrated Yaw", selectVal(s.use_integrated_yaw, OFF_ON)),
    ].filter((p) => !p.missing);
});

// --- Rate Limits ---

const rateLimitParams = computed(() => {
    if (!isBF.value || !gte("4.0.0")) {
        return [];
    }
    const s = filteredSc.value;
    return [
        param("Roll", fmtVal(s.rate_limits?.[0], 0)),
        param("Pitch", fmtVal(s.rate_limits?.[1], 0)),
        param("Yaw", fmtVal(s.rate_limits?.[2], 0)),
    ].filter((p) => !p.missing);
});

// --- Parameters (merged General + Other) ---

const generalParams = computed(() => {
    const s = filteredSc.value;
    const vDec = isBF.value && gte("4.0.0") ? 2 : 1;
    const result = [
        param("Loop Time", fmtVal(s.looptime, 0)),
        param("Gyro Sync", fmtVal(s.gyro_sync_denom, 0)),
        param("PID Denom", fmtVal(s.pid_process_denom, 0)),
        param("Debug Mode", selectVal(s.debug_mode, getDebugModes(sc.value.apiVersion))),
        param("Deadband", fmtVal(s.deadband, 0)),
        param("Yaw Deadband", fmtVal(s.yaw_deadband, 0)),
        param("Vbat Scale", fmtVal(s.vbatscale, 0)),
        param("Vbat Ref", fmtVal(s.vbatref, 0)),
        param("Vbat Min Cell", fmtVal(s.vbatmincellvoltage, vDec)),
        param("Vbat Max Cell", fmtVal(s.vbatmaxcellvoltage, vDec)),
        param("Vbat Warning", fmtVal(s.vbatwarningcellvoltage, vDec)),
        param("Min Throttle", fmtVal(s.minthrottle, 0)),
        param("Max Throttle", fmtVal(s.maxthrottle, 0)),
        param("THR Mid", fmtVal(s.thrMid, 2)),
        param("THR Expo", fmtVal(s.thrExpo, 2)),
        param(
            "Yaw Rate Accel Limit",
            isBF.value && gte("3.1.0") ? fmtFloat(s.yawRateAccelLimit, 2) : fmtVal(s.yawRateAccelLimit, 1),
        ),
        param(
            "Rate Accel Limit",
            isBF.value && gte("3.1.0") ? fmtFloat(s.rateAccelLimit, 2) : fmtVal(s.rateAccelLimit, 1),
        ),
        param("Setpoint Relax Ratio", fmtVal(s.setpointRelaxRatio, 2)),
        // Hardware (was "Other")
        param("Acc Hardware", selectVal(s.acc_hardware, ACC_HARDWARE)),
        param("Baro Hardware", selectVal(s.baro_hardware, BARO_HARDWARE)),
        param("Mag Hardware", selectVal(s.mag_hardware, MAG_HARDWARE)),
        param("Current Offset", fmtVal(s.currentMeterOffset, 0)),
        param("Current Scale", fmtVal(s.currentMeterScale, 0)),
    ];
    // Gyro selection
    if (isBF.value && gte("2025.12.0")) {
        result.push(param("Gyro Bitmask", bitmaskVal(s.gyro_enabled_bitmask, 8)));
    } else if (isBF.value && gte("4.3.0")) {
        result.push(param("Gyro To Use", selectVal(s.gyro_to_use, GYRO_TO_USE)));
    }
    return result.filter((p) => !p.missing);
});

// --- Gyro Filters ---

const gyroFilterParams = computed(() => {
    const s = filteredSc.value;
    const lpfList = isBF.value && gte("3.4.0") ? GYRO_HARDWARE_LPF : GYRO_LPF;
    const result = [
        param("Hardware LPF", selectVal(s.gyro_lpf, lpfList)),
        param("LPF Type", selectVal(s.gyro_soft_type, FILTER_TYPE)),
        param("LPF Hz", fmtVal(s.gyro_lowpass_hz, 0)),
        param("LPF2 Type", selectVal(s.gyro_soft2_type, FILTER_TYPE)),
        param("LPF2 Hz", fmtVal(s.gyro_lowpass2_hz, 0)),
    ];

    // Dynamic gyro LPF
    if (
        isBF.value &&
        gte("4.0.0") &&
        s.gyro_lowpass_dyn_hz?.[0] > 0 &&
        s.gyro_lowpass_dyn_hz?.[1] > s.gyro_lowpass_dyn_hz?.[0]
    ) {
        result.push(
            param("Dyn LPF Type", selectVal(s.gyro_soft_type, FILTER_TYPE)),
            param("Dyn LPF Min", fmtVal(s.gyro_lowpass_dyn_hz[0], 0)),
            param("Dyn LPF Max", fmtVal(s.gyro_lowpass_dyn_hz[1], 0)),
        );
    }

    // Notch filters
    if (Array.isArray(s.gyro_notch_hz)) {
        result.push(
            param("Notch 1 Hz", fmtVal(s.gyro_notch_hz[0], 0)),
            param("Notch 1 Cutoff", fmtVal(s.gyro_notch_cutoff?.[0], 0)),
            param("Notch 2 Hz", fmtVal(s.gyro_notch_hz[1], 0)),
            param("Notch 2 Cutoff", fmtVal(s.gyro_notch_cutoff?.[1], 0)),
        );
    } else {
        result.push(
            param("Notch Hz", fmtVal(s.gyro_notch_hz, 0)),
            param("Notch Cutoff", fmtVal(s.gyro_notch_cutoff, 0)),
        );
    }

    // Simplified gyro filter
    if (isBF.value && gte("4.3.0")) {
        result.push(
            param("Simplified Filter", selectVal(s.simplified_gyro_filter, OFF_ON)),
            param("Simplified Multiplier", fmtVal(s.simplified_gyro_filter_multiplier, 0)),
        );
    }

    // Yaw + Acc LPF
    result.push(
        param("Yaw LPF Hz", fmtVal(s.yaw_lpf_hz, 0)),
        param("Acc LPF Hz", fmtVal(s.acc_lpf_hz, 2)),
        param("Acc Cut Hz", fmtVal(s.acc_cut_hz, 2)),
    );

    return result.filter((p) => !p.missing);
});

// --- D-Term Filters ---

const dtermFilterParams = computed(() => {
    const s = filteredSc.value;
    const result = [
        param("Filter Type", selectVal(s.dterm_filter_type, FILTER_TYPE)),
        param("LPF Hz", fmtVal(s.dterm_lpf_hz, 0)),
        param("Filter2 Type", selectVal(s.dterm_filter2_type, FILTER_TYPE)),
        param("LPF2 Hz", fmtVal(s.dterm_lpf2_hz, 0)),
        param("Notch Hz", fmtVal(s.dterm_notch_hz, 0)),
        param("Notch Cutoff", fmtVal(s.dterm_notch_cutoff, 0)),
        param("Cut Hz", fmtVal(s.dterm_cut_hz, 2)),
    ];

    // Dynamic D-term LPF
    if (
        isBF.value &&
        gte("4.0.0") &&
        s.dterm_lpf_dyn_hz?.[0] > 0 &&
        s.dterm_lpf_dyn_hz?.[1] > s.dterm_lpf_dyn_hz?.[0]
    ) {
        result.push(
            param("Dyn Type", selectVal(s.dterm_filter_type, FILTER_TYPE)),
            param("Dyn Min Hz", fmtVal(s.dterm_lpf_dyn_hz[0], 0)),
            param("Dyn Max Hz", fmtVal(s.dterm_lpf_dyn_hz[1], 0)),
        );
    }

    // Simplified D-term filter
    if (isBF.value && gte("4.3.0")) {
        result.push(
            param("Simplified Filter", selectVal(s.simplified_dterm_filter, OFF_ON)),
            param("Simplified Multiplier", fmtVal(s.simplified_dterm_filter_multiplier, 0)),
        );
    }

    return result.filter((p) => !p.missing);
});

// --- Dynamic Notch ---

const dynNotchParams = computed(() => {
    if (!isBF.value || !gte("4.1.0")) {
        return [];
    }
    const s = filteredSc.value;
    const countLabel = gte("4.3.0") ? "Count" : "Width %";
    const countVal = gte("4.3.0") ? s.dyn_notch_count : s.dyn_notch_width_percent;
    return [
        param(countLabel, fmtVal(countVal, 0)),
        param("Q", fmtVal(s.dyn_notch_q, 0)),
        param("Min Hz", fmtVal(s.dyn_notch_min_hz, 0)),
        param("Max Hz", fmtVal(s.dyn_notch_max_hz, 0)),
    ].filter((p) => !p.missing);
});

// --- RPM Filter ---

const rpmFilterParams = computed(() => {
    const s = filteredSc.value;
    if (s.gyro_rpm_notch_harmonics == null) {
        return [];
    }
    return [
        param("Harmonics", fmtVal(s.gyro_rpm_notch_harmonics, 0)),
        param("Q", fmtVal(s.gyro_rpm_notch_q, 0)),
        param("Min Hz", fmtVal(s.gyro_rpm_notch_min, 0)),
        param("Fade Range Hz", fmtVal(s.rpm_filter_fade_range_hz, 0)),
        param("Weights", s.rpm_filter_weights ? String(s.rpm_filter_weights) : null),
        param("Notch LPF", fmtVal(s.rpm_notch_lpf, 0)),
        param("D-Term Harmonics", fmtVal(s.dterm_rpm_notch_harmonics, 0)),
        param("D-Term Q", fmtVal(s.dterm_rpm_notch_q, 0)),
        param("D-Term Min Hz", fmtVal(s.dterm_rpm_notch_min, 0)),
    ].filter((p) => !p.missing);
});

// --- RC Smoothing ---

function buildRcSmoothing43(s) {
    const result = [
        param("Mode", selectVal(s.rc_smoothing_mode, RC_SMOOTHING_MODE)),
        param("Setpoint Hz", fmtVal(s.rc_smoothing_setpoint_hz, 0)),
        param("Auto Factor Setpoint", fmtVal(s.rc_smoothing_auto_factor_setpoint, 0)),
        param("Throttle Hz", fmtVal(s.rc_smoothing_throttle_hz, 0)),
        param("Auto Factor Throttle", fmtVal(s.rc_smoothing_auto_factor_throttle, 0)),
    ];

    if (!gte("2025.12.0")) {
        result.push(param("Feedforward Hz", fmtVal(s.rc_smoothing_feedforward_hz, 0)));
    }

    const ac = s.rc_smoothing_active_cutoffs_ff_sp_thr;
    if (ac) {
        if (gte("2025.12.0")) {
            result.push(param("Active Cutoff SP", fmtVal(ac[0], 0)), param("Active Cutoff THR", fmtVal(ac[1], 0)));
        } else {
            result.push(
                param("Active Cutoff FF", fmtVal(ac[0], 0)),
                param("Active Cutoff SP", fmtVal(ac[1], 0)),
                param("Active Cutoff THR", fmtVal(ac[2], 0)),
            );
        }
    }

    return result;
}

function buildRcSmoothing34(s) {
    const result = [param("Mode", selectVal(s.rc_smoothing_mode, RC_SMOOTHING_TYPE))];
    const cutoffs = s.rc_smoothing_cutoffs;
    if (cutoffs) {
        result.push(param("Feedforward Hz", fmtVal(cutoffs[0], 0)), param("Setpoint Hz", fmtVal(cutoffs[1], 0)));
    }
    result.push(param("Auto Factor Setpoint", fmtVal(s.rc_smoothing_auto_factor_setpoint, 0)));
    const ac = s.rc_smoothing_active_cutoffs;
    if (ac) {
        result.push(param("Active Cutoff FF", fmtVal(ac[0], 0)), param("Active Cutoff SP", fmtVal(ac[1], 0)));
    }
    return result;
}

const rcSmoothingParams = computed(() => {
    if (!isBF.value) {
        return [];
    }
    const s = filteredSc.value;
    let result;

    if (gte("4.3.0")) {
        result = buildRcSmoothing43(s);
    } else if (gte("3.4.0")) {
        result = buildRcSmoothing34(s);
    } else {
        result = [];
    }

    if (gte("4.5.0")) {
        result.push(param("Rx Smoothed", fmtVal(s.rc_smoothing_rx_smoothed, 0)));
    } else {
        result.push(param("Rx Average", fmtVal(s.rc_smoothing_rx_average, 3)));
    }

    result.push(
        param("Debug Axis", selectVal(s.rc_smoothing_debug_axis, RC_SMOOTHING_DEBUG_AXIS)),
        param("Serial Rx", selectVal(s.serialrx_provider, SERIALRX_PROVIDER)),
    );

    return result.filter((p) => !p.missing);
});

// --- Motor / ESC ---

const motorParams = computed(() => {
    const s = filteredSc.value;
    return [
        param("Unsynced Fast PWM", selectVal(s.unsynced_fast_pwm, MOTOR_SYNC)),
        param("Fast PWM Protocol", selectVal(s.fast_pwm_protocol, FAST_PROTOCOL)),
        param("Motor PWM Rate", fmtVal(s.motor_pwm_rate, 0)),
        param("DShot BiDir", selectVal(s.dshot_bidir, OFF_ON)),
        param("Motor Output Low", fmtVal(s.motorOutput?.[0], 0)),
        param("Motor Output High", fmtVal(s.motorOutput?.[1], 0)),
        param("Motor Idle", fmtVal(s.motor_idle, 2)),
        param("Digital Idle Offset", fmtVal(s.digitalIdleOffset, 2)),
        param("Motor Output Limit", fmtVal(s.motor_output_limit, 0)),
        param("Motor Poles", fmtVal(s.motor_poles, 0)),
        param("Throttle Limit Type", selectVal(s.throttle_limit_type, THROTTLE_LIMIT_TYPE)),
        param("Throttle Limit %", fmtVal(s.throttle_limit_percent, 0)),
        param("Throttle Boost", fmtVal(s.throttle_boost, 0)),
        param("Throttle Boost Cutoff", fmtVal(s.throttle_boost_cutoff, 0)),
        param("Dynamic Idle Min RPM", fmtVal(s.dynamic_idle_min_rpm, 0)),
        param("Dyn Idle P", fmtVal(s.dyn_idle_p_gain, 0)),
        param("Dyn Idle I", fmtVal(s.dyn_idle_i_gain, 0)),
        param("Dyn Idle D", fmtVal(s.dyn_idle_d_gain, 0)),
    ].filter((p) => !p.missing);
});

// --- Features ---

const featuresList = computed(() => {
    const s = filteredSc.value;
    if (s.features == null) {
        return [];
    }
    const value = s.features;

    const features = [
        { bit: 0, name: "RX_PPM", description: "PPM Receiver" },
        { bit: 2, name: "INFLIGHT_ACC_CAL", description: "In-flight level cal" },
        { bit: 3, name: "RX_SERIAL", description: "Serial Receiver" },
        { bit: 4, name: "MOTOR_STOP", description: "Motor stop on low throttle" },
        { bit: 5, name: "SERVO_TILT", description: "Servo gimbal" },
        { bit: 6, name: "SOFTSERIAL", description: "CPU serial port" },
        { bit: 7, name: "GPS", description: "GPS connected" },
        { bit: 9, name: "SONAR", description: "Sonar" },
        { bit: 10, name: "TELEMETRY", description: "Telemetry output" },
        { bit: 12, name: "3D", description: "3D mode" },
        { bit: 13, name: "RX_PARALLEL_PWM", description: "PWM receiver" },
        { bit: 14, name: "RX_MSP", description: "Controller over MSP" },
        { bit: 15, name: "RSSI_ADC", description: "ADC RSSI" },
        { bit: 16, name: "LED_STRIP", description: "LED strip" },
        { bit: 17, name: "DISPLAY", description: "OLED display" },
        {
            bit: 20,
            name: "CHANNEL_FORWARDING",
            description: "Forward aux channels",
        },
        { bit: 21, name: "TRANSPONDER", description: "Race transponder" },
    ];

    if (lte("3.2.0")) {
        features.push(
            { bit: 1, name: "VBAT", description: "Battery monitoring" },
            { bit: 11, name: "CURRENT_METER", description: "Current monitoring" },
            { bit: 8, name: "FAILSAFE", description: "Failsafe" },
            { bit: 19, name: "BLACKBOX", description: "Blackbox recorder" },
        );
    }
    if (gte("2.8.0")) {
        features.push({
            bit: 22,
            name: "AIRMODE",
            description: "Airmode always enabled",
        });
    }
    if (gte("2.8.0") && lt("3.0.0")) {
        features.push(
            { bit: 23, name: "SUPEREXPO_RATES", description: "Super expo" },
            { bit: 18, name: "ONESHOT125", description: "Oneshot 125" },
        );
    }
    if (gte("3.0.0")) {
        features.push({ bit: 18, name: "OSD", description: "On-screen display" });
    }
    if (gte("3.1.0")) {
        features.push(
            { bit: 27, name: "ESC_SENSOR", description: "KISS ESC telemetry" },
            { bit: 28, name: "ANTI_GRAVITY", description: "Anti-gravity boost" },
        );
        if (lt("4.3.0")) {
            features.push({
                bit: 29,
                name: "DYNAMIC_FILTER",
                description: "Dynamic gyro notch",
            });
        }
    }

    return features
        .sort((a, b) => a.bit - b.bit)
        .map((f) => ({
            name: f.name,
            description: f.description,
            enabled: !!(value & (1 << f.bit)),
        }))
        .filter((f) => f.enabled);
});

// --- Disabled Fields ---

const disabledFieldsList = computed(() => {
    const s = filteredSc.value;
    if (!isBF.value || !gte("4.3.0") || s.fields_disabled_mask == null) {
        return [];
    }
    const value = s.fields_disabled_mask;

    let fields;
    if (gte("2025.12.0")) {
        fields = [
            "PIDs",
            "RC Commands",
            "Setpoint",
            "Battery",
            "Magnetometer",
            "Altitude",
            "RSSI",
            "Filtered Gyroscope",
            "Attitude",
            "Accelerometer",
            "Debug",
            "Motors",
            "GPS",
            "RPM",
            "Unfiltered Gyroscope",
            "Servos",
        ];
    } else {
        fields = [
            "PIDs",
            "RC Commands",
            "Setpoint",
            "Battery",
            "Magnetometer",
            "Altitude",
            "RSSI",
            "Filtered Gyroscope",
            "Accelerometer",
            "Debug",
            "Motors",
            "GPS",
            "RPM",
            "Unfiltered Gyroscope",
        ];
    }

    return fields
        .map((name, i) => ({
            name,
            description: "",
            enabled: !!(value & (1 << i)),
        }))
        .filter((f) => f.enabled);
});

// --- All Headers ---

const headerFieldColumns = [
    { accessorKey: "name", header: "Name", meta: { class: { td: "whitespace-nowrap" } } },
    { accessorKey: "value", header: "Value", meta: { class: { td: "w-full" } } },
    { accessorKey: "toggle", header: "" },
];

const headerSearch = ref("");
const headerSortAlpha = ref(false);
const headerSortGroups = ref(false);
const expandedHeaderGroups = ref(new Set());
const hiddenGroups = ref(new Set());
const hiddenFields = ref(new Set());

// Persist hidden groups/fields
function loadHiddenPrefs() {
    try {
        const g = localStorage.getItem("bbv-hidden-groups");
        const f = localStorage.getItem("bbv-hidden-fields");
        if (g) {
            hiddenGroups.value = new Set(JSON.parse(g));
        }
        if (f) {
            hiddenFields.value = new Set(JSON.parse(f));
        }
    } catch {
        // ignore
    }
}
function saveHiddenPrefs() {
    try {
        localStorage.setItem("bbv-hidden-groups", JSON.stringify([...hiddenGroups.value]));
        localStorage.setItem("bbv-hidden-fields", JSON.stringify([...hiddenFields.value]));
    } catch {
        // ignore
    }
}
loadHiddenPrefs();

// Group order for display
const GROUP_ORDER = [
    "PID Settings",
    "PID Sliders",
    "PID Controller",
    "Feedforward",
    "Rates",
    "Rate Limits",
    "Parameters",
    "Motor / ESC",
    "Gyro Filters",
    "Dynamic Notch",
    "RPM Filter",
    "D-Term Filters",
    "RC Smoothing",
    "Features",
    "Disabled Fields",
];

// --- Pane ordering and drag-and-drop ---

const DEFAULT_PANE_ORDER = [...GROUP_ORDER];

const paneOrder = ref([...DEFAULT_PANE_ORDER]);

function loadPaneOrder() {
    try {
        const saved = localStorage.getItem("bbv-pane-order");
        if (saved) {
            const parsed = JSON.parse(saved);
            const order = parsed.filter((id) => DEFAULT_PANE_ORDER.includes(id));
            for (const id of DEFAULT_PANE_ORDER) {
                if (!order.includes(id)) {
                    order.push(id);
                }
            }
            paneOrder.value = order;
        }
    } catch {
        // ignore
    }
}
function savePaneOrder() {
    try {
        localStorage.setItem("bbv-pane-order", JSON.stringify(paneOrder.value));
    } catch {
        // ignore
    }
}
loadPaneOrder();

const groupParamMap = computed(() => ({
    "PID Sliders": pidSliderParams.value,
    "PID Controller": pidControllerParams.value,
    Feedforward: feedforwardParams.value,
    Rates: rateParams.value,
    "Rate Limits": rateLimitParams.value,
    Parameters: generalParams.value,
    "Motor / ESC": motorParams.value,
    "Gyro Filters": gyroFilterParams.value,
    "Dynamic Notch": dynNotchParams.value,
    "RPM Filter": rpmFilterParams.value,
    "D-Term Filters": dtermFilterParams.value,
    "RC Smoothing": rcSmoothingParams.value,
}));

function paneHasData(group) {
    if (group === "PID Settings") {
        return allPids.value.length > 0;
    }
    if (group === "Features") {
        return featuresList.value.length > 0;
    }
    if (group === "Disabled Fields") {
        return disabledFieldsList.value.length > 0;
    }
    const params = groupParamMap.value[group];
    return params && params.length > 0;
}

const visiblePanes = computed(() => paneOrder.value.filter((g) => !hiddenGroups.value.has(g) && paneHasData(g)));

// --- Sortable.js drag-and-drop ---
const gridEl = ref(null);
let sortable = null;

watch(gridEl, (el) => {
    if (sortable) {
        sortable.destroy();
        sortable = null;
    }
    if (!el) {
        return;
    }
    sortable = Sortable.create(el, {
        handle: ".drag-handle",
        ghostClass: "opacity-30",
        animation: 0,
        onStart() {
            // Freeze all pane positions to prevent CSS columns reflow during drag
            const children = Array.from(el.children);
            const containerRect = el.getBoundingClientRect();
            const rects = children.map((c) => c.getBoundingClientRect());
            el.style.columns = "auto";
            el.style.position = "relative";
            el.style.height = `${containerRect.height}px`;
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                const r = rects[i];
                c.style.position = "absolute";
                c.style.left = `${r.left - containerRect.left}px`;
                c.style.top = `${r.top - containerRect.top}px`;
                c.style.width = `${r.width}px`;
                c.style.margin = "0";
            }
        },
        onEnd() {
            // Unfreeze — clear inline styles, restore CSS columns layout
            for (const c of el.children) {
                c.style.position = "";
                c.style.left = "";
                c.style.top = "";
                c.style.width = "";
                c.style.margin = "";
            }
            el.style.columns = cols.value == null ? "" : String(cols.value);
            el.style.position = "";
            el.style.height = "";
            // Read reordered visible groups from DOM (Sortable already moved elements)
            const newVisible = Array.from(el.children)
                .map((c) => c.dataset.group)
                .filter(Boolean);
            // Rebuild full order: reordered visible + hidden groups preserved
            const visibleSet = new Set(newVisible);
            const hidden = paneOrder.value.filter((g) => !visibleSet.has(g));
            paneOrder.value = [...newVisible, ...hidden];
            savePaneOrder();
        },
    });
});

onBeforeUnmount(() => {
    if (sortable) {
        sortable.destroy();
    }
});

function toggleGroupVisibility(group) {
    const s = hiddenGroups.value;
    if (s.has(group)) {
        s.delete(group);
    } else {
        s.add(group);
    }
    hiddenGroups.value = new Set(s);
    saveHiddenPrefs();
}

function toggleFieldVisibility(key) {
    const s = hiddenFields.value;
    if (s.has(key)) {
        s.delete(key);
    } else {
        s.add(key);
    }
    hiddenFields.value = new Set(s);
    saveHiddenPrefs();
}

function toggleGroupExpand(group) {
    const s = expandedHeaderGroups.value;
    if (s.has(group)) {
        s.delete(group);
    } else {
        s.add(group);
    }
    expandedHeaderGroups.value = new Set(s);
}

const allGroupsExpanded = computed(() => {
    const groups = groupedHeaders.value;
    return groups.length > 0 && groups.every((g) => expandedHeaderGroups.value.has(g.name));
});

function toggleAllGroups() {
    if (allGroupsExpanded.value) {
        expandedHeaderGroups.value = new Set();
    } else {
        expandedHeaderGroups.value = new Set(groupedHeaders.value.map((g) => g.name));
    }
}

// Group assignment by sysConfig key
const EXPLICIT_GROUPS = {
    rollPID: "PID Settings",
    pitchPID: "PID Settings",
    yawPID: "PID Settings",
    levelPID: "PID Settings",
    altPID: "PID Settings",
    velPID: "PID Settings",
    magPID: "PID Settings",
    posPID: "PID Settings",
    posrPID: "PID Settings",
    navrPID: "PID Settings",
    rates_type: "Rates",
    rates: "Rates",
    rate_limits: "Rate Limits",
    rc_rates: "Rates",
    rc_expo: "Rates",
    rcYawRate: "Rates",
    rcYawExpo: "Rates",
    d_max: "PID Controller",
    d_max_gain: "PID Controller",
    d_max_advance: "PID Controller",
    tpa_rate: "PID Controller",
    tpa_breakpoint: "PID Controller",
    thrust_linear: "PID Controller",
    pidSumLimit: "PID Controller",
    pidSumLimitYaw: "PID Controller",
    vbat_sag_compensation: "PID Controller",
    vbat_pid_compensation: "PID Controller",
    iterm_relax: "PID Controller",
    iterm_relax_type: "PID Controller",
    iterm_relax_cutoff: "PID Controller",
    abs_control_gain: "PID Controller",
    use_integrated_yaw: "PID Controller",
    pidAtMinThrottle: "PID Controller",
    features: "Features",
    fields_disabled_mask: "Disabled Fields",
    looptime: "Parameters",
    gyro_sync_denom: "Parameters",
    pid_process_denom: "Parameters",
    debug_mode: "Parameters",
    deadband: "Parameters",
    yaw_deadband: "Parameters",
    vbatscale: "Parameters",
    vbatref: "Parameters",
    vbatmincellvoltage: "Parameters",
    vbatmaxcellvoltage: "Parameters",
    vbatwarningcellvoltage: "Parameters",
    minthrottle: "Parameters",
    maxthrottle: "Parameters",
    thrMid: "Parameters",
    thrExpo: "Parameters",
    yawRateAccelLimit: "Parameters",
    rateAccelLimit: "Parameters",
    setpointRelaxRatio: "Parameters",
    pidController: "Parameters",
    yaw_p_limit: "Parameters",
    rollPitchItermResetRate: "Parameters",
    yawItermResetRate: "Parameters",
    itermThrottleGain: "Parameters",
    ptermSetpointWeight: "Parameters",
    dtermSetpointWeight: "Parameters",
    H_sensitivity: "Parameters",
    iterm_reset_offset: "Parameters",
    airmode_activate_throttle: "Parameters",
    acc_hardware: "Parameters",
    baro_hardware: "Parameters",
    mag_hardware: "Parameters",
    currentMeter: "Parameters",
    currentMeterOffset: "Parameters",
    currentMeterScale: "Parameters",
    gyro_to_use: "Parameters",
    gyro_enabled_bitmask: "Parameters",
    serialrx_provider: "RC Smoothing",
    yaw_lpf_hz: "Gyro Filters",
    digitalIdleOffset: "Motor / ESC",
};

const PREFIX_GROUPS = [
    ["simplified_", "PID Sliders"],
    ["ff_", "Feedforward"],
    ["anti_gravity_", "PID Controller"],
    ["tpa_low_", "PID Controller"],
    ["gyro_rpm_", "RPM Filter"],
    ["rpm_", "RPM Filter"],
    ["dterm_rpm_", "RPM Filter"],
    ["dyn_notch_", "Dynamic Notch"],
    ["gyro_", "Gyro Filters"],
    ["dterm_", "D-Term Filters"],
    ["rc_smoothing_", "RC Smoothing"],
    ["rc_interpolation", "RC Smoothing"],
    ["motor", "Motor / ESC"],
    ["throttle", "Motor / ESC"],
    ["dshot", "Motor / ESC"],
    ["dyn_idle_", "Motor / ESC"],
    ["dynamic_idle", "Motor / ESC"],
    ["unsynced_", "Motor / ESC"],
    ["fast_pwm_", "Motor / ESC"],
];

function getHeaderGroup(key) {
    if (EXPLICIT_GROUPS[key]) {
        return EXPLICIT_GROUPS[key];
    }
    for (const [prefix, group] of PREFIX_GROUPS) {
        if (key.startsWith(prefix)) {
            return group;
        }
    }
    return "Parameters";
}

function formatHeaderValue(val) {
    if (val == null) {
        return null;
    }
    if (Array.isArray(val)) {
        if (val.every((v) => v == null)) {
            return null;
        }
        return val.map((v) => (v == null ? "-" : String(v))).join(", ");
    }
    return String(val);
}

const HEADER_SKIP_KEYS = new Set([
    "unknownHeaders",
    "firmwareType",
    "Craft_name",
    "firmware",
    "firmwareVersion",
    "boardIdentifier",
    "flightControllerIdentifier",
    "flightControllerVersion",
]);

function buildGroupMap(s) {
    const groups = {};
    for (const key of Object.keys(s)) {
        if (HEADER_SKIP_KEYS.has(key)) {
            continue;
        }
        const formatted = formatHeaderValue(s[key]);
        if (formatted == null) {
            continue;
        }
        const group = getHeaderGroup(key);
        if (!groups[group]) {
            groups[group] = [];
        }
        groups[group].push({ name: key, value: formatted, group });
    }
    if (Array.isArray(s.unknownHeaders)) {
        if (!groups["Parameters"]) {
            groups["Parameters"] = [];
        }
        for (const h of s.unknownHeaders) {
            groups["Parameters"].push({ name: h.name, value: String(h.value), group: "Parameters" });
        }
    }
    return groups;
}

function filterAndSort(fields, query, sortAlpha) {
    let result = fields;
    if (query) {
        result = result.filter((f) => f.name.toLowerCase().includes(query) || f.value.toLowerCase().includes(query));
    }
    if (sortAlpha && result.length > 0) {
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
}

const groupedHeaders = computed(() => {
    const groups = buildGroupMap(sc.value);
    const q = headerSearch.value.trim().toLowerCase();
    const result = [];

    // Groups in defined order
    for (const name of GROUP_ORDER) {
        if (!groups[name]) {
            continue;
        }
        const fields = filterAndSort(groups[name], q, headerSortAlpha.value);
        if (fields.length > 0) {
            result.push({ name, fields });
        }
    }
    // Any groups not in GROUP_ORDER
    for (const name of Object.keys(groups)) {
        if (GROUP_ORDER.includes(name)) {
            continue;
        }
        const fields = filterAndSort(groups[name], q, headerSortAlpha.value);
        if (fields.length > 0) {
            result.push({ name, fields });
        }
    }

    if (headerSortGroups.value) {
        result.sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
});

const totalHeaderCount = computed(() => groupedHeaders.value.reduce((sum, g) => sum + g.fields.length, 0));
</script>
