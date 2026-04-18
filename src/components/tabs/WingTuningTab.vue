<template>
    <BaseTab tab-name="wing_tuning">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabWingTuning") }}</div>

            <!-- Firmware too old for MSP path — tab is effectively disabled. -->
            <div v-if="!apiOk" class="grid-row">
                <div class="grid-col col12">
                    <div class="gui_box">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("wingTuningStatus") }}</div>
                        </div>
                        <div class="spacer">
                            <p>{{ $t("wingTuningApiRequired") }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <template v-else>
                <!-- Status panel -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingTuningStatus") }}</div>
                            </div>
                            <div class="spacer">
                                <p v-if="loading">{{ $t("wingTuningLoading") }}</p>
                                <p v-else-if="error" style="color: #c00">{{ error }}</p>
                                <p v-else-if="saving">{{ $t("wingTuningSaving") }}</p>
                                <p v-else>
                                    <span v-if="dirty">{{ $t("wingTuningDirty") }}</span>
                                    <span v-else>{{ $t("wingTuningClean") }}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Yaw Type + Angle Mode -->
                <div class="grid-row">
                    <div class="grid-col col6">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingYawTypeTitle") }}</div>
                            </div>
                            <div class="spacer">
                                <p>{{ $t("wingYawTypeDesc") }}</p>
                                <select v-model="fields.yaw_type" :disabled="loading">
                                    <option value="RUDDER">RUDDER</option>
                                    <option value="DIFF_THRUST">DIFF_THRUST</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="grid-col col6">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingAngleModeTitle") }}</div>
                            </div>
                            <div class="spacer">
                                <p>{{ $t("wingAngleModeDesc") }}</p>
                                <table class="fields">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("wingParameter") }}</th>
                                            <th>{{ $t("wingValue") }}</th>
                                            <th>{{ $t("wingSlider") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td
                                                title="Trims pitch attitude in Angle mode. Units of 0.1°. Negative pitches the nose down. See BF PR #14009."
                                            >
                                                angle_pitch_offset (0.1°)
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    :min="-1000"
                                                    :max="1000"
                                                    v-model.number="fields.angle_pitch_offset"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    :min="-1000"
                                                    :max="1000"
                                                    v-model.number="fields.angle_pitch_offset"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="Earth-reference strength for Angle mode axis mixing. Set 0 to disable mixing for wings (often preferable)."
                                            >
                                                angle_earth_ref
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    v-model.number="fields.angle_earth_ref"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    v-model.number="fields.angle_earth_ref"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- S-term -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingSTermTitle") }}</div>
                            </div>
                            <div class="spacer">
                                <p>{{ $t("wingSTermDesc") }}</p>
                                <table class="fields">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("wingAxis") }}</th>
                                            <th>{{ $t("wingValue") }}</th>
                                            <th>{{ $t("wingSlider") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Pitch</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    :max="PID_GAIN_MAX"
                                                    v-model.number="fields.s_pitch"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    :max="PID_GAIN_MAX"
                                                    v-model.number="fields.s_pitch"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Roll</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    :max="PID_GAIN_MAX"
                                                    v-model.number="fields.s_roll"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    :max="PID_GAIN_MAX"
                                                    v-model.number="fields.s_roll"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Yaw</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    :max="PID_GAIN_MAX"
                                                    v-model.number="fields.s_yaw"
                                                    :disabled="loading || diffThrustMode"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    :max="PID_GAIN_MAX"
                                                    v-model.number="fields.s_yaw"
                                                    :disabled="loading || diffThrustMode"
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p v-if="diffThrustMode" style="color: #c80">{{ $t("wingSYawForcedZero") }}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TPA Mode + Airspeed -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingTpaAirspeedTitle") }}</div>
                            </div>
                            <div class="spacer">
                                <p>{{ $t("wingTpaAirspeedDesc") }}</p>
                                <table class="fields">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("wingParameter") }}</th>
                                            <th>{{ $t("wingValue") }}</th>
                                            <th>{{ $t("wingSlider") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td
                                                title="PID scaling mode. PDS enables S-term scaling at low speeds for wings. See BF PR #14010."
                                            >
                                                tpa_mode
                                            </td>
                                            <td colspan="2">
                                                <select v-model="fields.tpa_mode" :disabled="loading">
                                                    <option value="PD">PD</option>
                                                    <option value="D">D</option>
                                                    <option value="PDS">PDS (wing)</option>
                                                </select>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="Airspeed estimation model. BASIC works for most pilots. ADVANCED uses additional params (adv_prop_pitch, adv_mass, adv_drag_k, adv_thrust) that must be set via CLI. See BF PR #13895."
                                            >
                                                tpa_speed_type
                                            </td>
                                            <td colspan="2">
                                                <select v-model="fields.tpa_speed_type" :disabled="loading">
                                                    <option value="BASIC">BASIC</option>
                                                    <option value="ADVANCED">ADVANCED (CLI only)</option>
                                                </select>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="BASIC airspeed model filter delay. See BF PR #13895 for tuning procedure."
                                            >
                                                tpa_speed_basic_delay
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="65535"
                                                    v-model.number="fields.tpa_speed_basic_delay"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td title="BASIC airspeed model gravity term. See BF PR #13895 for tuning.">
                                                tpa_speed_basic_gravity
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="65535"
                                                    v-model.number="fields.tpa_speed_basic_gravity"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="Battery full-charge voltage × 100. Example: 3S = 1260 (12.6V), 6S = 2520 (25.2V). Use the cell-count dropdown to set correctly."
                                            >
                                                tpa_speed_max_voltage
                                                <small>(V × 100)</small>
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="3360"
                                                    v-model.number="fields.tpa_speed_max_voltage"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    @change="onCellCountChange"
                                                    :value="detectedCellCount"
                                                    :disabled="loading"
                                                    title="Pick your cell count to auto-fill max_voltage."
                                                >
                                                    <option value="">— cells —</option>
                                                    <option v-for="n in [2, 3, 4, 5, 6, 7, 8]" :key="n" :value="n">
                                                        {{ n }}S ({{ (n * 4.2).toFixed(1) }}V)
                                                    </option>
                                                </select>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="Pitch offset for BASIC airspeed estimation, in units of 0.1° (firmware comment: 'pitch offset in degrees*10 for craft speed estimation'). Compensates for FC mounting angle relative to the wing's aero-zero reference. Default 0."
                                            >
                                                tpa_speed_pitch_offset (0.1°)
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="-32768"
                                                    max="32767"
                                                    v-model.number="fields.tpa_speed_pitch_offset"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p v-if="fields.tpa_speed_type === 'ADVANCED'" style="color: #c80">
                                    {{ $t("wingTpaAdvancedHint") }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TPA Curve -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingTpaCurveTitle") }}</div>
                            </div>
                            <div class="spacer">
                                <p>{{ $t("wingTpaCurveDesc") }}</p>
                                <table class="fields">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("wingParameter") }}</th>
                                            <th>{{ $t("wingValue") }}</th>
                                            <th>{{ $t("wingSlider") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td
                                                title="Curve shape. HYPERBOLIC is recommended for planes. CLASSIC uses tpa_low_* params (CLI only) instead of this curve. See BF PR #13805."
                                            >
                                                tpa_curve_type
                                            </td>
                                            <td colspan="2">
                                                <select v-model="fields.tpa_curve_type" :disabled="loading">
                                                    <option value="CLASSIC">CLASSIC</option>
                                                    <option value="HYPERBOLIC">HYPERBOLIC</option>
                                                </select>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="Throttle % below which PID multiplier stays at pid_thr0. Dashed yellow line on the curve."
                                            >
                                                tpa_curve_stall_throttle
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    v-model.number="fields.tpa_curve_stall_throttle"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    v-model.number="fields.tpa_curve_stall_throttle"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="PID multiplier % at zero throttle / stall. Typical: 200 (2.0×) for planes."
                                            >
                                                tpa_curve_pid_thr0
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="1000"
                                                    v-model.number="fields.tpa_curve_pid_thr0"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1000"
                                                    v-model.number="fields.tpa_curve_pid_thr0"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="PID multiplier % at full throttle. Typical: 70 (0.7×) for planes."
                                            >
                                                tpa_curve_pid_thr100
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="1000"
                                                    v-model.number="fields.tpa_curve_pid_thr100"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1000"
                                                    v-model.number="fields.tpa_curve_pid_thr100"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                title="Curve slope parameter. Divided by 10 in the formula. Values near 10 approach a step; negative values invert curvature."
                                            >
                                                tpa_curve_expo
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="-100"
                                                    max="100"
                                                    v-model.number="fields.tpa_curve_expo"
                                                    :disabled="loading"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="range"
                                                    min="-100"
                                                    max="100"
                                                    v-model.number="fields.tpa_curve_expo"
                                                    :disabled="loading"
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <!-- TPA curve live preview (HYPERBOLIC math from Limon's PR #13805) -->
                                <div v-if="fields.tpa_curve_type === 'HYPERBOLIC'" class="curve_container">
                                    <svg :width="tpaChart.width" :height="tpaChart.height" class="curve_svg">
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
                                        <text
                                            :x="tpaChart.stallX + 3"
                                            :y="tpaChart.padTop + 10"
                                            fill="#c80"
                                            font-size="10"
                                        >
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
                                        <text :x="tpaChart.padLeft" :y="tpaChart.height - 4" fill="#aaa" font-size="10">
                                            0%
                                        </text>
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
                                <p v-else class="curve_hint">
                                    {{ $t("wingTpaClassicNoPreview") }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SPA -->
                <div class="grid-row">
                    <div class="grid-col col12">
                        <div class="gui_box">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("wingSpaTitle") }}</div>
                            </div>
                            <div class="spacer">
                                <p>{{ $t("wingSpaDesc") }}</p>
                                <table class="fields">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("wingAxis") }}</th>
                                            <th>Center</th>
                                            <th></th>
                                            <th>Width</th>
                                            <th></th>
                                            <th>Mode</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <template v-for="axis in ['roll', 'pitch', 'yaw']" :key="axis">
                                            <tr>
                                                <td>{{ axis }}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="65535"
                                                        v-model.number="fields[`spa_${axis}_center`]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        :max="SPA_SETPOINT_MAX"
                                                        v-model.number="fields[`spa_${axis}_center`]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="65535"
                                                        v-model.number="fields[`spa_${axis}_width`]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        :max="SPA_WIDTH_SLIDER_MAX"
                                                        v-model.number="fields[`spa_${axis}_width`]"
                                                        :disabled="loading"
                                                    />
                                                </td>
                                                <td>
                                                    <select v-model="fields[`spa_${axis}_mode`]" :disabled="loading">
                                                        <option value="OFF">OFF</option>
                                                        <option value="I_FREEZE">I_FREEZE</option>
                                                        <option value="I">I</option>
                                                        <option value="PID">PID</option>
                                                        <option value="PD_I_FREEZE">PD_I_FREEZE</option>
                                                    </select>
                                                </td>
                                            </tr>
                                            <tr v-if="fields[`spa_${axis}_mode`] !== 'OFF'">
                                                <td colspan="6">
                                                    <div class="curve_container">
                                                        <svg
                                                            :width="spaChart(axis).width"
                                                            :height="spaChart(axis).height"
                                                            class="curve_svg"
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
                                                            <path
                                                                :d="spaChart(axis).pathD"
                                                                fill="none"
                                                                stroke="#3af"
                                                                stroke-width="2"
                                                            />
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
                                                </td>
                                            </tr>
                                        </template>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
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
import { defineComponent, reactive, ref, computed, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { computeTpaCurve, computeSpaCurve, SPA_SETPOINT_MAX } from "../../js/utils/wing_math.js";

const PID_GAIN_MAX = 200;

// Field definitions: name → parse/format type. "int" and "string" only.
// Enums (lookup tables) are strings; everything else is int.
const FIELD_DEFS = [
    // S-term
    { name: "s_pitch", type: "int" },
    { name: "s_roll", type: "int" },
    { name: "s_yaw", type: "int" },
    // Yaw type
    { name: "yaw_type", type: "string" },
    // Angle mode
    { name: "angle_pitch_offset", type: "int" },
    { name: "angle_earth_ref", type: "int" },
    // TPA mode + airspeed
    { name: "tpa_mode", type: "string" },
    { name: "tpa_speed_type", type: "string" },
    { name: "tpa_speed_basic_delay", type: "int" },
    { name: "tpa_speed_basic_gravity", type: "int" },
    { name: "tpa_speed_max_voltage", type: "int" },
    { name: "tpa_speed_pitch_offset", type: "int" },
    // TPA curve
    { name: "tpa_curve_type", type: "string" },
    { name: "tpa_curve_stall_throttle", type: "int" },
    { name: "tpa_curve_pid_thr0", type: "int" },
    { name: "tpa_curve_pid_thr100", type: "int" },
    { name: "tpa_curve_expo", type: "int" },
    // SPA
    { name: "spa_roll_center", type: "int" },
    { name: "spa_roll_width", type: "int" },
    { name: "spa_roll_mode", type: "string" },
    { name: "spa_pitch_center", type: "int" },
    { name: "spa_pitch_width", type: "int" },
    { name: "spa_pitch_mode", type: "string" },
    { name: "spa_yaw_center", type: "int" },
    { name: "spa_yaw_width", type: "int" },
    { name: "spa_yaw_mode", type: "string" },
];

function defaultFields() {
    const f = {};
    for (const def of FIELD_DEFS) {
        f[def.name] = def.type === "string" ? "" : 0;
    }
    return f;
}

export default defineComponent({
    name: "WingTuningTab",
    components: { BaseTab },

    setup() {
        const fields = reactive(defaultFields());
        const initialFields = ref({ ...fields });

        const loading = ref(false);
        const saving = ref(false);
        const error = ref(null);

        const diffThrustMode = computed(() => fields.yaw_type === "DIFF_THRUST");

        watch(diffThrustMode, (isDiff) => {
            if (isDiff && fields.s_yaw !== 0) {
                fields.s_yaw = 0;
            }
        });

        const dirty = computed(() => FIELD_DEFS.some((def) => fields[def.name] !== initialFields.value[def.name]));

        // Capability check — tab requires a USE_WING firmware build.
        // The MSP codes (MSP2_WING_TUNING / MSP2_SET_WING_TUNING) ship
        // in the same firmware PR as USE_WING, so the build-option flag
        // is sufficient. Per BF convention, API_VERSION_MINOR is bumped
        // by release maintainers at release-cut time, not per feature
        // PR — so we don't gate on apiVersion here.
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

        function onCellCountChange(event) {
            const n = Number.parseInt(event.target.value, 10);
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
                initialFields.value = { ...fields };
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
                initialFields.value = { ...fields };
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
            fields,
            loading,
            saving,
            error,
            apiOk,
            FC,
            dirty,
            diffThrustMode,
            detectedCellCount,
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

<style scoped>
table.fields {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
}
table.fields th,
table.fields td {
    padding: 4px 8px;
    text-align: left;
    vertical-align: middle;
}
table.fields input[type="number"] {
    width: 100px;
}
table.fields input[type="range"] {
    width: 100%;
    min-width: 120px;
}
table.fields select {
    min-width: 140px;
}
button {
    margin-right: 8px;
}
.curve_container {
    margin-top: 12px;
    display: flex;
    justify-content: center;
}
.curve_svg {
    background: var(--surface-200, rgba(255, 255, 255, 0.04));
    border-radius: 4px;
}
.curve_hint {
    margin-top: 8px;
    color: #888;
    font-style: italic;
}
</style>
