<template>
    <BaseTab tab-name="wing_tuning">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabWingTuning") }}</div>

            <!-- Firmware too old for MSP path — tab is effectively disabled. -->
            <UiBox v-if="!apiOk" type="warning" :title="$t('wingTuningStatus')">
                <p>{{ $t("wingTuningApiRequired") }}</p>
            </UiBox>

            <template v-else>
                <!-- Status panel -->
                <UiBox :title="$t('wingTuningStatus')" :type="error ? 'error' : 'default'">
                    <p v-if="loading">{{ $t("wingTuningLoading") }}</p>
                    <p v-else-if="error" class="text-error">{{ error }}</p>
                    <p v-else-if="saving">{{ $t("wingTuningSaving") }}</p>
                    <p v-else>
                        <span v-if="dirty">{{ $t("wingTuningDirty") }}</span>
                        <span v-else>{{ $t("wingTuningClean") }}</span>
                    </p>
                </UiBox>

                <!-- Yaw Type + Angle Mode -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <UiBox :title="$t('wingYawTypeTitle')">
                        <p>{{ $t("wingYawTypeDesc") }}</p>
                        <USelect
                            v-model="fields.yaw_type"
                            :items="enumOptions.yaw_type"
                            size="sm"
                            :disabled="loading"
                            class="min-w-40"
                        />
                    </UiBox>
                    <UiBox :title="$t('wingAngleModeTitle')">
                        <p>{{ $t("wingAngleModeDesc") }}</p>
                        <div class="flex flex-col gap-2">
                            <div
                                class="grid grid-cols-[180px_100px_1fr] gap-2 items-center text-sm font-semibold text-dimmed"
                            >
                                <span>{{ $t("wingParameter") }}</span>
                                <span>{{ $t("wingValue") }}</span>
                                <span>{{ $t("wingSlider") }}</span>
                            </div>
                            <div class="grid grid-cols-[180px_100px_1fr] gap-2 items-center">
                                <span
                                    title="Trims pitch attitude in Angle mode. Units of 0.1°. Positive pitches the nose down, negative pitches the nose up. See BF PR #14009."
                                >
                                    angle_pitch_offset (0.1°)
                                </span>
                                <UInputNumber
                                    v-model="fields.angle_pitch_offset"
                                    :min="-1000"
                                    :max="1000"
                                    size="sm"
                                    :disabled="loading"
                                />
                                <USlider
                                    v-model="fields.angle_pitch_offset"
                                    :min="-1000"
                                    :max="1000"
                                    :disabled="loading"
                                />
                            </div>
                            <div class="grid grid-cols-[180px_100px_1fr] gap-2 items-center">
                                <span
                                    title="Earth-reference strength for Angle mode axis mixing. Set 0 to disable mixing for wings (often preferable)."
                                >
                                    angle_earth_ref
                                </span>
                                <UInputNumber
                                    v-model="fields.angle_earth_ref"
                                    :min="0"
                                    :max="100"
                                    size="sm"
                                    :disabled="loading"
                                />
                                <USlider v-model="fields.angle_earth_ref" :min="0" :max="100" :disabled="loading" />
                            </div>
                        </div>
                    </UiBox>
                </div>

                <!-- S-term -->
                <UiBox :title="$t('wingSTermTitle')">
                    <p>{{ $t("wingSTermDesc") }}</p>
                    <div class="flex flex-col gap-2">
                        <div
                            class="grid grid-cols-[80px_120px_1fr] gap-2 items-center text-sm font-semibold text-dimmed"
                        >
                            <span>{{ $t("wingAxis") }}</span>
                            <span>{{ $t("wingValue") }}</span>
                            <span>{{ $t("wingSlider") }}</span>
                        </div>
                        <div
                            v-for="axis in ['pitch', 'roll', 'yaw']"
                            :key="axis"
                            class="grid grid-cols-[80px_120px_1fr] gap-2 items-center"
                        >
                            <span class="capitalize">{{ axis }}</span>
                            <UInputNumber
                                v-model="fields[`s_${axis}`]"
                                :min="0"
                                :max="PID_GAIN_MAX"
                                size="sm"
                                :disabled="loading || (axis === 'yaw' && diffThrustMode)"
                            />
                            <USlider
                                v-model="fields[`s_${axis}`]"
                                :min="0"
                                :max="PID_GAIN_MAX"
                                :disabled="loading || (axis === 'yaw' && diffThrustMode)"
                            />
                        </div>
                    </div>
                    <p v-if="diffThrustMode" class="mt-2 text-warning">{{ $t("wingSYawIgnored") }}</p>
                </UiBox>

                <!-- TPA Mode + Airspeed -->
                <UiBox :title="$t('wingTpaAirspeedTitle')">
                    <p>{{ $t("wingTpaAirspeedDesc") }}</p>
                    <div class="flex flex-col gap-2">
                        <div
                            class="grid grid-cols-[260px_140px_1fr] gap-2 items-center text-sm font-semibold text-dimmed"
                        >
                            <span>{{ $t("wingParameter") }}</span>
                            <span>{{ $t("wingValue") }}</span>
                            <span></span>
                        </div>
                        <div class="grid grid-cols-[260px_140px_1fr] gap-2 items-center">
                            <span
                                title="PID scaling mode. PDS enables S-term scaling at low speeds for wings. See BF PR #14010."
                            >
                                tpa_mode
                            </span>
                            <USelect
                                v-model="fields.tpa_mode"
                                :items="enumOptions.tpa_mode"
                                size="sm"
                                :disabled="loading"
                                class="col-span-2"
                            />
                        </div>
                        <div class="grid grid-cols-[260px_140px_1fr] gap-2 items-center">
                            <span
                                title="Airspeed estimation model. BASIC works for most pilots. ADVANCED uses additional params (adv_prop_pitch, adv_mass, adv_drag_k, adv_thrust) that must be set via CLI. See BF PR #13895."
                            >
                                tpa_speed_type
                            </span>
                            <USelect
                                v-model="fields.tpa_speed_type"
                                :items="enumOptions.tpa_speed_type"
                                size="sm"
                                :disabled="loading"
                                class="col-span-2"
                            />
                        </div>
                        <div class="grid grid-cols-[260px_140px_1fr] gap-2 items-center">
                            <span title="BASIC airspeed model filter delay. See BF PR #13895 for tuning procedure.">
                                tpa_speed_basic_delay
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_speed_basic_delay"
                                :min="1"
                                :max="65535"
                                size="sm"
                                :disabled="loading"
                            />
                            <span></span>
                        </div>
                        <div class="grid grid-cols-[260px_140px_1fr] gap-2 items-center">
                            <span title="BASIC airspeed model gravity term. See BF PR #13895 for tuning.">
                                tpa_speed_basic_gravity
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_speed_basic_gravity"
                                :min="1"
                                :max="65535"
                                size="sm"
                                :disabled="loading"
                            />
                            <span></span>
                        </div>
                        <div class="grid grid-cols-[260px_140px_1fr] gap-2 items-center">
                            <span
                                title="Battery full-charge voltage × 100. Example: 3S = 1260 (12.6V), 6S = 2520 (25.2V). Use the cell-count dropdown to set correctly."
                            >
                                tpa_speed_max_voltage <small>(V × 100)</small>
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_speed_max_voltage"
                                :min="0"
                                :max="3360"
                                size="sm"
                                :disabled="loading"
                            />
                            <USelect
                                :model-value="detectedCellCount"
                                @update:model-value="onCellCountChange"
                                :items="cellCountItems"
                                size="sm"
                                :disabled="loading"
                                placeholder="— cells —"
                                title="Pick your cell count to auto-fill max_voltage."
                                class="max-w-44"
                            />
                        </div>
                        <div class="grid grid-cols-[260px_140px_1fr] gap-2 items-center">
                            <span
                                title="Pitch offset for BASIC airspeed estimation, in units of 0.1° (firmware comment: 'pitch offset in degrees*10 for craft speed estimation'). Compensates for FC mounting angle relative to the wing's aero-zero reference. Default 0."
                            >
                                tpa_speed_pitch_offset (0.1°)
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_speed_pitch_offset"
                                :min="-32768"
                                :max="32767"
                                size="sm"
                                :disabled="loading"
                            />
                            <span></span>
                        </div>
                    </div>
                    <p v-if="fields.tpa_speed_type === 'ADVANCED'" class="mt-2 text-warning">
                        {{ $t("wingTpaAdvancedHint") }}
                    </p>
                </UiBox>

                <!-- TPA Curve -->
                <UiBox :title="$t('wingTpaCurveTitle')">
                    <p>{{ $t("wingTpaCurveDesc") }}</p>
                    <div class="flex flex-col gap-2">
                        <div
                            class="grid grid-cols-[220px_120px_1fr] gap-2 items-center text-sm font-semibold text-dimmed"
                        >
                            <span>{{ $t("wingParameter") }}</span>
                            <span>{{ $t("wingValue") }}</span>
                            <span>{{ $t("wingSlider") }}</span>
                        </div>
                        <div class="grid grid-cols-[220px_120px_1fr] gap-2 items-center">
                            <span
                                title="Curve shape. HYPERBOLIC is recommended for planes. CLASSIC uses tpa_low_* params (CLI only) instead of this curve. See BF PR #13805."
                            >
                                tpa_curve_type
                            </span>
                            <USelect
                                v-model="fields.tpa_curve_type"
                                :items="enumOptions.tpa_curve_type"
                                size="sm"
                                :disabled="loading"
                                class="col-span-2"
                            />
                        </div>
                        <div class="grid grid-cols-[220px_120px_1fr] gap-2 items-center">
                            <span
                                title="Throttle % below which PID multiplier stays at pid_thr0. Dashed yellow line on the curve."
                            >
                                tpa_curve_stall_throttle
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_curve_stall_throttle"
                                :min="0"
                                :max="100"
                                size="sm"
                                :disabled="loading"
                            />
                            <USlider
                                v-model="fields.tpa_curve_stall_throttle"
                                :min="0"
                                :max="100"
                                :disabled="loading"
                            />
                        </div>
                        <div class="grid grid-cols-[220px_120px_1fr] gap-2 items-center">
                            <span title="PID multiplier % at zero throttle / stall. Typical: 200 (2.0×) for planes.">
                                tpa_curve_pid_thr0
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_curve_pid_thr0"
                                :min="0"
                                :max="1000"
                                size="sm"
                                :disabled="loading"
                            />
                            <USlider v-model="fields.tpa_curve_pid_thr0" :min="0" :max="1000" :disabled="loading" />
                        </div>
                        <div class="grid grid-cols-[220px_120px_1fr] gap-2 items-center">
                            <span title="PID multiplier % at full throttle. Typical: 70 (0.7×) for planes.">
                                tpa_curve_pid_thr100
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_curve_pid_thr100"
                                :min="0"
                                :max="1000"
                                size="sm"
                                :disabled="loading"
                            />
                            <USlider v-model="fields.tpa_curve_pid_thr100" :min="0" :max="1000" :disabled="loading" />
                        </div>
                        <div class="grid grid-cols-[220px_120px_1fr] gap-2 items-center">
                            <span
                                title="Curve slope parameter. Divided by 10 in the formula. Values near 10 approach a step; negative values invert curvature."
                            >
                                tpa_curve_expo
                            </span>
                            <UInputNumber
                                v-model="fields.tpa_curve_expo"
                                :min="-100"
                                :max="100"
                                size="sm"
                                :disabled="loading"
                            />
                            <USlider v-model="fields.tpa_curve_expo" :min="-100" :max="100" :disabled="loading" />
                        </div>
                    </div>
                    <!-- TPA curve live preview (HYPERBOLIC math from Limon's PR #13805) -->
                    <div v-if="fields.tpa_curve_type === 'HYPERBOLIC'" class="flex justify-center mt-3">
                        <svg :width="tpaChart.width" :height="tpaChart.height" class="rounded bg-neutral-800/40">
                            <!-- axes -->
                            <line
                                :x1="tpaChart.padLeft"
                                :y1="tpaChart.padTop"
                                :x2="tpaChart.padLeft"
                                :y2="tpaChart.height - tpaChart.padBottom"
                                stroke="#888"
                                stroke-width="1"
                            />
                            <line
                                :x1="tpaChart.padLeft"
                                :y1="tpaChart.height - tpaChart.padBottom"
                                :x2="tpaChart.width - tpaChart.padRight"
                                :y2="tpaChart.height - tpaChart.padBottom"
                                stroke="#888"
                                stroke-width="1"
                            />
                            <!-- stall threshold vertical line -->
                            <line
                                :x1="tpaChart.stallX"
                                :y1="tpaChart.padTop"
                                :x2="tpaChart.stallX"
                                :y2="tpaChart.height - tpaChart.padBottom"
                                stroke="#c80"
                                stroke-width="1"
                                stroke-dasharray="4 3"
                            />
                            <text :x="tpaChart.stallX + 3" :y="tpaChart.padTop + 10" fill="#c80" font-size="10">
                                stall
                            </text>
                            <!-- curve -->
                            <path :d="tpaChart.pathD" fill="none" stroke="#ffb800" stroke-width="2" />
                            <!-- labels -->
                            <text
                                :x="tpaChart.padLeft - 4"
                                :y="tpaChart.padTop + 4"
                                text-anchor="end"
                                fill="#aaa"
                                font-size="10"
                            >
                                {{ tpaChart.yMax }}
                            </text>
                            <text
                                :x="tpaChart.padLeft - 4"
                                :y="tpaChart.height - tpaChart.padBottom"
                                text-anchor="end"
                                fill="#aaa"
                                font-size="10"
                            >
                                {{ tpaChart.yMin }}
                            </text>
                            <text :x="tpaChart.padLeft" :y="tpaChart.height - 4" fill="#aaa" font-size="10">0%</text>
                            <text
                                :x="tpaChart.width - tpaChart.padRight"
                                :y="tpaChart.height - 4"
                                text-anchor="end"
                                fill="#aaa"
                                font-size="10"
                            >
                                100% throttle
                            </text>
                        </svg>
                    </div>
                    <p v-else class="text-sm text-neutral-500 italic mt-2">
                        {{ $t("wingTpaClassicNoPreview") }}
                    </p>
                </UiBox>

                <!-- SPA -->
                <UiBox :title="$t('wingSpaTitle')">
                    <p>{{ $t("wingSpaDesc") }}</p>
                    <div class="flex flex-col gap-3">
                        <div
                            class="grid grid-cols-[60px_100px_1fr_100px_1fr_140px] gap-2 items-center text-sm font-semibold text-dimmed"
                        >
                            <span>{{ $t("wingAxis") }}</span>
                            <span>Center</span>
                            <span></span>
                            <span>Width</span>
                            <span></span>
                            <span>Mode</span>
                        </div>
                        <template v-for="axis in ['roll', 'pitch', 'yaw']" :key="axis">
                            <div class="grid grid-cols-[60px_100px_1fr_100px_1fr_140px] gap-2 items-center">
                                <span class="capitalize">{{ axis }}</span>
                                <UInputNumber
                                    v-model="fields[`spa_${axis}_center`]"
                                    :min="0"
                                    :max="65535"
                                    size="sm"
                                    :disabled="loading"
                                />
                                <USlider
                                    v-model="fields[`spa_${axis}_center`]"
                                    :min="0"
                                    :max="SPA_SETPOINT_MAX"
                                    :disabled="loading"
                                />
                                <UInputNumber
                                    v-model="fields[`spa_${axis}_width`]"
                                    :min="0"
                                    :max="65535"
                                    size="sm"
                                    :disabled="loading"
                                />
                                <USlider
                                    v-model="fields[`spa_${axis}_width`]"
                                    :min="0"
                                    :max="SPA_WIDTH_SLIDER_MAX"
                                    :disabled="loading"
                                />
                                <USelect
                                    v-model="fields[`spa_${axis}_mode`]"
                                    :items="enumOptions.spa_mode"
                                    size="sm"
                                    :disabled="loading"
                                />
                            </div>
                            <div v-if="fields[`spa_${axis}_mode`] !== 'OFF'" class="flex justify-center">
                                <svg
                                    :width="spaChart(axis).width"
                                    :height="spaChart(axis).height"
                                    class="rounded bg-neutral-800/40"
                                >
                                    <!-- gridlines at 0.5 PID -->
                                    <line
                                        :x1="spaChart(axis).padLeft"
                                        :y1="spaChart(axis).midY"
                                        :x2="spaChart(axis).width - spaChart(axis).padRight"
                                        :y2="spaChart(axis).midY"
                                        stroke="#444"
                                        stroke-width="1"
                                        stroke-dasharray="2 3"
                                    />
                                    <!-- axes -->
                                    <line
                                        :x1="spaChart(axis).padLeft"
                                        :y1="spaChart(axis).padTop"
                                        :x2="spaChart(axis).padLeft"
                                        :y2="spaChart(axis).height - spaChart(axis).padBottom"
                                        stroke="#888"
                                        stroke-width="1"
                                    />
                                    <line
                                        :x1="spaChart(axis).padLeft"
                                        :y1="spaChart(axis).height - spaChart(axis).padBottom"
                                        :x2="spaChart(axis).width - spaChart(axis).padRight"
                                        :y2="spaChart(axis).height - spaChart(axis).padBottom"
                                        stroke="#888"
                                        stroke-width="1"
                                    />
                                    <!-- left limit (green dashed) -->
                                    <line
                                        :x1="spaChart(axis).leftLimitX"
                                        :y1="spaChart(axis).padTop"
                                        :x2="spaChart(axis).leftLimitX"
                                        :y2="spaChart(axis).height - spaChart(axis).padBottom"
                                        stroke="#3c3"
                                        stroke-width="1"
                                        stroke-dasharray="4 3"
                                    />
                                    <!-- right limit (green dashed) -->
                                    <line
                                        :x1="spaChart(axis).rightLimitX"
                                        :y1="spaChart(axis).padTop"
                                        :x2="spaChart(axis).rightLimitX"
                                        :y2="spaChart(axis).height - spaChart(axis).padBottom"
                                        stroke="#3c3"
                                        stroke-width="1"
                                        stroke-dasharray="4 3"
                                    />
                                    <!-- center (red dashed) -->
                                    <line
                                        :x1="spaChart(axis).centerX"
                                        :y1="spaChart(axis).padTop"
                                        :x2="spaChart(axis).centerX"
                                        :y2="spaChart(axis).height - spaChart(axis).padBottom"
                                        stroke="#e44"
                                        stroke-width="1"
                                        stroke-dasharray="4 3"
                                    />
                                    <!-- curve -->
                                    <path :d="spaChart(axis).pathD" fill="none" stroke="#3af" stroke-width="2" />
                                    <!-- labels -->
                                    <text
                                        :x="spaChart(axis).padLeft - 4"
                                        :y="spaChart(axis).padTop + 4"
                                        text-anchor="end"
                                        fill="#aaa"
                                        font-size="10"
                                    >
                                        1.0
                                    </text>
                                    <text
                                        :x="spaChart(axis).padLeft - 4"
                                        :y="spaChart(axis).height - spaChart(axis).padBottom"
                                        text-anchor="end"
                                        fill="#aaa"
                                        font-size="10"
                                    >
                                        0.0
                                    </text>
                                    <text
                                        :x="spaChart(axis).padLeft"
                                        :y="spaChart(axis).height - 4"
                                        fill="#aaa"
                                        font-size="10"
                                    >
                                        0
                                    </text>
                                    <text
                                        :x="spaChart(axis).width - spaChart(axis).padRight"
                                        :y="spaChart(axis).height - 4"
                                        text-anchor="end"
                                        fill="#aaa"
                                        font-size="10"
                                    >
                                        {{ SPA_SETPOINT_MAX }} setpoint
                                    </text>
                                    <text
                                        :x="spaChart(axis).centerX + 3"
                                        :y="spaChart(axis).padTop + 10"
                                        fill="#e44"
                                        font-size="10"
                                    >
                                        center
                                    </text>
                                </svg>
                            </div>
                        </template>
                    </div>
                </UiBox>
            </template>
        </div>

        <!-- Sticky bottom-right toolbar, matching ServosTab / PortsTab / etc.
             Global `a.disabled` CSS (main.less:47) greys out + disables
             pointer-events, so click is blocked automatically. -->
        <div class="content_toolbar toolbar_fixed_bottom" v-if="apiOk">
            <div class="btn save_btn">
                <a class="update" href="#" :class="{ disabled: loading || saving || !dirty }" @click.prevent="save">{{
                    $t("wingTuningSave")
                }}</a>
            </div>
            <div class="btn save_btn">
                <a class="update" href="#" :class="{ disabled: loading || saving }" @click.prevent="reload">{{
                    $t("wingTuningReload")
                }}</a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, computed, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";
import { useWingTuningStore, FIELD_DEFS } from "@/stores/wingTuning";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { computeTpaCurve, computeSpaCurve, SPA_SETPOINT_MAX } from "../../js/utils/wing_math.js";
import { WING_ENUM_TABLES } from "../../js/utils/wingEnumLookups.js";

// Friendly labels for a few enum values where the raw firmware string
// alone is ambiguous in the UI. Anything not listed here renders the
// raw string from WING_ENUM_TABLES.
const ENUM_LABEL_OVERRIDES = {
    tpa_mode: { PDS: "PDS (wing)" },
    tpa_speed_type: { ADVANCED: "ADVANCED (CLI only)" },
};

// Pre-built {value, label} arrays per enum table. Driving the dropdowns
// from this avoids drift between the UI options and what the MSP crunch
// path (`enumStringToIndex`) accepts — a firmware enum reorder shows up
// in one source-of-truth file (`wingEnumLookups.js`) and fixes both at
// once.
const ENUM_OPTIONS = Object.fromEntries(
    Object.entries(WING_ENUM_TABLES).map(([table, values]) => [
        table,
        values.map((value) => ({ value, label: ENUM_LABEL_OVERRIDES[table]?.[value] ?? value })),
    ]),
);

const PID_GAIN_MAX = 200;

export default defineComponent({
    name: "WingTuningTab",
    components: { BaseTab, UiBox, SettingRow },

    setup() {
        const wingTuningStore = useWingTuningStore();
        // `fields` is owned by the Pinia store so other code (presets,
        // wizards, etc.) can read/write through a single SSoT. MSP I/O
        // remains in this tab.
        const fields = wingTuningStore.fields;

        const loading = ref(false);
        const saving = ref(false);
        const error = ref(null);

        // In DIFF_THRUST mode the firmware ignores s_yaw, and the
        // `s_yaw` input is disabled in the template when this is true.
        // Don't mutate `fields.s_yaw` here — a user who toggles
        // RUDDER → DIFF_THRUST → RUDDER would otherwise silently lose
        // their tuned value.
        const diffThrustMode = computed(() => fields.yaw_type === "DIFF_THRUST");

        // hasChanges is owned by the Pinia store; mirror it as `dirty`
        // so the template binding stays unchanged.
        const dirty = computed(() => wingTuningStore.hasChanges);

        watch(fields, () => wingTuningStore.checkForChanges(), { deep: true });

        // Capability check — tab requires a USE_WING firmware build.
        // The MSP codes (MSP2_WING_TUNING / MSP2_SET_WING_TUNING) ship
        // in the same firmware PR as USE_WING, so the build-option flag
        // is sufficient at merge time. Per BF convention,
        // API_VERSION_MINOR is bumped by release maintainers at
        // release-cut time, not per feature PR — so we don't gate on
        // apiVersion here yet.
        //
        // TODO: once the firmware side (betaflight/betaflight#15124)
        // allocates a minor API version, tighten this gate with a
        // `semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_xx)` check so
        // custom firmware builds that flip USE_WING without picking up
        // the MSP handlers fall back to the stub instead of hanging on
        // reload. Suggested by limonspb on PR #5015.
        //
        // Safe-by-default: if FC.CONFIG.buildOptions is undefined/empty
        // (MSP_BUILD_INFO failed or truncated), .includes returns false
        // → stub shown, no crash.
        const apiOk = computed(() => {
            const opts = FC.CONFIG?.buildOptions;
            return Array.isArray(opts) && opts.includes("USE_WING");
        });

        // Cell-count helper: derive S-count from tpa_speed_max_voltage (V×100).
        // Full charge per cell = 4.2V → V×100 / 420 ≈ cell count.
        const detectedCellCount = computed(() => {
            const v = fields.tpa_speed_max_voltage;
            if (!v) {
                return "";
            }
            const n = Math.round(v / 420);
            return n >= 2 && n <= 8 ? n : "";
        });

        const cellCountItems = [2, 3, 4, 5, 6, 7, 8].map((n) => ({
            label: `${n}S (${(n * 4.2).toFixed(1)}V)`,
            value: n,
        }));

        function onCellCountChange(value) {
            const n = Number.parseInt(value, 10);
            if (!Number.isNaN(n)) {
                fields.tpa_speed_max_voltage = n * 420;
            }
        }

        // TPA curve chart geometry (reactive).
        const tpaChart = computed(() => {
            const stall = fields.tpa_curve_stall_throttle;
            const thr0 = fields.tpa_curve_pid_thr0;
            const thr100 = fields.tpa_curve_pid_thr100;
            const expo = fields.tpa_curve_expo;
            const points = computeTpaCurve(stall, thr0, thr100, expo);

            const width = 480,
                height = 200;
            const padLeft = 40,
                padRight = 16,
                padTop = 16,
                padBottom = 28;
            const plotW = width - padLeft - padRight;
            const plotH = height - padTop - padBottom;
            const yMin = Math.min(thr0, thr100, 50) - 10;
            const yMax = Math.max(thr0, thr100, 100) + 10;
            const yRange = yMax - yMin || 1;
            const toX = (t) => padLeft + (t / 100) * plotW;
            const toY = (m) => padTop + plotH - ((m - yMin) / yRange) * plotH;
            const pathD = points
                .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.throttle).toFixed(1)},${toY(p.multiplier).toFixed(1)}`)
                .join(" ");
            const stallX = toX(stall);
            return { width, height, padLeft, padRight, padTop, padBottom, pathD, stallX, yMin, yMax };
        });

        function spaChart(axis) {
            const center = fields[`spa_${axis}_center`] || 0;
            const width = fields[`spa_${axis}_width`] || 0;
            const points = computeSpaCurve(center, width);
            const chartW = 420,
                chartH = 140;
            const padLeft = 34,
                padRight = 16,
                padTop = 12,
                padBottom = 22;
            const plotW = chartW - padLeft - padRight;
            const plotH = chartH - padTop - padBottom;
            const toX = (s) => padLeft + (s / SPA_SETPOINT_MAX) * plotW;
            const toY = (m) => padTop + plotH - m * plotH;
            const pathD = points
                .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.setpoint).toFixed(1)},${toY(p.multiplier).toFixed(1)}`)
                .join(" ");
            const leftLimit = Math.max(0, center - width / 2);
            const rightLimit = Math.min(SPA_SETPOINT_MAX, center + width / 2);
            return {
                width: chartW,
                height: chartH,
                padLeft,
                padRight,
                padTop,
                padBottom,
                pathD,
                centerX: toX(Math.min(SPA_SETPOINT_MAX, center)),
                leftLimitX: toX(leftLimit),
                rightLimitX: toX(rightLimit),
                midY: padTop + plotH / 2,
            };
        }

        async function reload() {
            loading.value = true;
            error.value = null;
            try {
                await MSP.promise(MSPCodes.MSP2_WING_TUNING);
                for (const def of FIELD_DEFS) {
                    if (FC.WING_TUNING[def.name] !== undefined) {
                        fields[def.name] = FC.WING_TUNING[def.name];
                    }
                }
                wingTuningStore.storeOriginals();
            } catch (e) {
                console.error("[WingTuning] reload failed:", e);
                error.value = e.message || String(e);
            } finally {
                loading.value = false;
            }
        }

        async function save() {
            saving.value = true;
            error.value = null;
            try {
                // Copy form state into FC.WING_TUNING so crunch reads the
                // correct values. Enum strings pass through; crunch maps
                // them to indices via wingEnumLookups.
                for (const def of FIELD_DEFS) {
                    FC.WING_TUNING[def.name] = fields[def.name];
                }
                await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));
                await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
                wingTuningStore.storeOriginals();
            } catch (e) {
                console.error("[WingTuning] save failed:", e);
                error.value = e.message || String(e);
            } finally {
                saving.value = false;
            }
        }

        function onTabReady() {
            GUI.content_ready();
            if (apiOk.value) {
                reload();
            }
        }

        return {
            PID_GAIN_MAX,
            SPA_SETPOINT_MAX,
            SPA_WIDTH_SLIDER_MAX: 500,
            enumOptions: ENUM_OPTIONS,
            fields,
            loading,
            saving,
            error,
            apiOk,
            FC,
            dirty,
            diffThrustMode,
            detectedCellCount,
            cellCountItems,
            onCellCountChange,
            tpaChart,
            spaChart,
            reload,
            save,
            onTabReady,
        };
    },

    mounted() {
        this.onTabReady();
    },
});
</script>
