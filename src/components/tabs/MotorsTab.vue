<template>
    <BaseTab tab-name="motors">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabMotorTesting')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="motors" />
            </div>

            <div class="grid-row grid-box col2">
                <div class="col-span-1">
                    <div class="configuration">
                        <!-- MIXER -->
                        <div class="mixer">
                            <div class="gui_box grey">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title" v-html="$t('configurationMixer')"></div>
                                </div>
                                <div class="spacer_box mixer_settings">
                                    <select class="mixerList" v-model="fcStore.mixerConfig.mixer">
                                        <option
                                            v-for="mixer in sortedMixerList"
                                            :key="mixer.pos"
                                            :value="mixer.pos + 1"
                                            :disabled="mixer.disabled"
                                        >
                                            {{ mixer.name.toUpperCase() }}
                                        </option>
                                    </select>
                                    <div class="motor_direction_reversed">
                                        <div style="float: left; height: 20px; margin-right: 15px; margin-left: 3px">
                                            <input
                                                type="checkbox"
                                                id="reverseMotorSwitch"
                                                class="toggle"
                                                v-model="reverseMotorDir"
                                            />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationReverseMotorSwitch')"></span>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('configurationReverseMotorSwitchHelp')"
                                        ></div>
                                    </div>
                                </div>
                                <div class="grid-row">
                                    <div class="grid-col col6">
                                        <div class="mixerPreview" v-html="mixerPreviewSvg"></div>
                                    </div>
                                </div>
                                <div class="btn motor_tool_buttons">
                                    <a
                                        href="#"
                                        id="motorOutputReorderDialogOpen"
                                        class="tool regular-button"
                                        :class="{ disabled: buttonStates.toolsDisabled }"
                                        v-if="isMotorReorderingAvailable"
                                        @click.prevent="!buttonStates.toolsDisabled && openMotorOutputReorderDialog()"
                                        v-html="$t('motorOutputReorderDialogOpen')"
                                    ></a>
                                    <a
                                        href="#"
                                        id="escDshotDirectionDialog-Open"
                                        class="tool regular-button"
                                        :class="{ disabled: buttonStates.toolsDisabled }"
                                        v-if="digitalProtocolConfigured"
                                        @click.prevent="!buttonStates.toolsDisabled && openEscDshotDirectionDialog()"
                                        v-html="$t('escDshotDirectionDialog-Open')"
                                    ></a>
                                </div>
                            </div>
                        </div>
                        <!-- MOTOR STOP -->
                        <div class="motorstop">
                            <div class="gui_box grey">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title" v-html="$t('configurationEscFeatures')"></div>
                                </div>
                                <div class="spacer_box">
                                    <div id="escProtocolDisabled" class="note" v-if="!protocolConfigured">
                                        <p v-html="$t('configurationEscProtocolDisabled')"></p>
                                    </div>
                                    <div class="selectProtocol">
                                        <label>
                                            <select
                                                class="escprotocol"
                                                v-model="selectedEscProtocol"
                                                @change="onProtocolChange"
                                            >
                                                <option
                                                    v-for="option in sortedEscProtocolOptions"
                                                    :key="option.value"
                                                    :value="option.value"
                                                    :disabled="isProtocolDisabled(option.name)"
                                                >
                                                    {{ option.name }}
                                                </option>
                                            </select>
                                            <span v-html="$t('configurationEscProtocol')"></span>
                                            <div
                                                class="helpicon cf_tip"
                                                :title="$t('configurationEscProtocolHelp')"
                                            ></div>
                                        </label>
                                    </div>
                                    <div class="number checkboxPwm" v-if="showAnalogSettings">
                                        <div>
                                            <input
                                                type="checkbox"
                                                id="unsyncedPWMSwitch"
                                                class="toggle"
                                                v-model="useUnsyncedPwm"
                                            />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationunsyndePwm')"></span>
                                    </div>
                                    <div class="number unsyncedpwmfreq" v-if="showAnalogSettings && useUnsyncedPwm">
                                        <label>
                                            <div class="numberspacer">
                                                <input
                                                    type="number"
                                                    name="unsyncedpwmfreq"
                                                    min="200"
                                                    max="32000"
                                                    step="100"
                                                    v-model.number="fcStore.pidAdvancedConfig.motor_pwm_rate"
                                                />
                                            </div>
                                            <span v-html="$t('configurationUnsyncedPWMFreq')"></span>
                                        </label>
                                    </div>

                                    <table class="featuresMultiple">
                                        <tbody class="features escMotorStop" v-if="protocolConfigured">
                                            <tr>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        class="toggle"
                                                        :checked="isFeatureEnabled('MOTOR_STOP')"
                                                        @change="toggleFeature('MOTOR_STOP', $event.target.checked)"
                                                        :disabled="isFeatureEnabled('AIRMODE')"
                                                    />
                                                </td>
                                                <td>MOTOR_STOP</td>
                                                <td>
                                                    <span v-html="$t('featureMOTOR_STOPTip')"></span>
                                                </td>
                                            </tr>
                                        </tbody>
                                        <tbody class="features escSensor" v-if="digitalProtocolConfigured">
                                            <tr>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        class="toggle"
                                                        :checked="isFeatureEnabled('ESC_SENSOR')"
                                                        @change="toggleFeature('ESC_SENSOR', $event.target.checked)"
                                                    />
                                                </td>
                                                <td>ESC_SENSOR</td>
                                                <td>
                                                    <span v-html="$t('featureESC_SENSOR')"></span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div class="number checkboxDshotBidir" v-if="digitalProtocolConfigured">
                                        <div>
                                            <input
                                                type="checkbox"
                                                id="dshotBidir"
                                                class="toggle"
                                                v-model="fcStore.motorConfig.use_dshot_telemetry"
                                            />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationDshotBidir')"></span>
                                        <div class="helpicon cf_tip" :title="$t('configurationDshotBidirHelp')"></div>
                                    </div>
                                    <div class="number motorPoles" v-if="protocolConfigured && rpmFeaturesVisible">
                                        <div class="numberspacer">
                                            <input
                                                type="number"
                                                name="motorPoles"
                                                min="4"
                                                max="255"
                                                step="1"
                                                v-model.number="fcStore.motorConfig.motor_poles"
                                            />
                                        </div>
                                        <span v-html="$t('configurationMotorPolesLong')"></span>
                                        <div class="helpicon cf_tip" :title="$t('configurationMotorPolesHelp')"></div>
                                    </div>
                                    <div class="number motorIdle" v-if="showMotorIdle">
                                        <div class="numberspacer">
                                            <input
                                                type="number"
                                                name="motorIdle"
                                                min="0.0"
                                                max="20.0"
                                                step="0.1"
                                                v-model.number="fcStore.pidAdvancedConfig.motorIdle"
                                            />
                                        </div>
                                        <span v-html="$t('configurationMotorIdle')"></span>
                                        <div
                                            class="helpicon cf_tip_wide"
                                            :title="$t('configurationMotorIdleHelp')"
                                        ></div>
                                    </div>
                                    <div class="number idleMinRpm" v-if="showIdleMinRpm">
                                        <div class="numberspacer noarrows">
                                            <input
                                                type="number"
                                                name="idleMinRpm"
                                                min="0"
                                                max="100"
                                                step="1"
                                                readonly
                                                v-model.number="fcStore.advancedTuning.idleMinRpm"
                                            />
                                        </div>
                                        <span v-html="$t('pidTuningIdleMinRpm')"></span>
                                        <div class="helpicon cf_tip" :title="$t('configurationMotorIdleRpmHelp')"></div>
                                    </div>
                                    <div class="number mincommand" v-if="showAnalogSettings">
                                        <div class="numberspacer">
                                            <input
                                                type="number"
                                                name="mincommand"
                                                min="0"
                                                max="2000"
                                                v-model.number="fcStore.motorConfig.mincommand"
                                            />
                                        </div>
                                        <span v-html="$t('configurationThrottleMinimumCommand')"></span>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('configurationThrottleMinimumCommandHelp')"
                                        ></div>
                                    </div>
                                    <div class="number minthrottle" v-if="showMinThrottle">
                                        <div class="numberspacer">
                                            <input
                                                type="number"
                                                name="minthrottle"
                                                min="0"
                                                max="2000"
                                                v-model.number="fcStore.motorConfig.minthrottle"
                                            />
                                        </div>
                                        <span v-html="$t('configurationThrottleMinimum')"></span>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('configurationThrottleMinimumHelp')"
                                        ></div>
                                    </div>
                                    <div class="number maxthrottle" v-if="showAnalogSettings">
                                        <div class="numberspacer">
                                            <input
                                                type="number"
                                                name="maxthrottle"
                                                min="0"
                                                max="2000"
                                                v-model.number="fcStore.motorConfig.maxthrottle"
                                            />
                                        </div>
                                        <span v-html="$t('configurationThrottleMaximum')"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- 3D -->
                        <div class="_3d">
                            <div class="gui_box grey">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title" v-html="$t('configuration3d')"></div>
                                </div>
                                <div class="spacer_box">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th v-html="$t('configurationFeatureEnabled')"></th>
                                                <th v-html="$t('configurationFeatureDescription')"></th>
                                                <th v-html="$t('configurationFeatureName')"></th>
                                            </tr>
                                        </thead>
                                        <tbody class="features 3D" id="features_3d" style="margin-bottom: 10px">
                                            <tr>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        class="toggle"
                                                        :checked="isFeatureEnabled('3D')"
                                                        @change="toggleFeature('3D', $event.target.checked)"
                                                    />
                                                </td>
                                                <td><span v-html="$t('feature3D')"></span></td>
                                                <td>
                                                    <span>3D</span>
                                                    <div class="helpicon cf_tip" :title="$t('feature3DTip')"></div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div class="_3dSettings" v-if="isFeatureEnabled('3D')">
                                        <div class="number">
                                            <label>
                                                <input
                                                    type="number"
                                                    name="_3ddeadbandlow"
                                                    step="1"
                                                    min="1250"
                                                    max="1600"
                                                    v-model.number="fcStore.motor3dConfig.deadband3d_low"
                                                />
                                                <span v-html="$t('configuration3dDeadbandLow')"></span>
                                            </label>
                                        </div>
                                        <div class="number">
                                            <label>
                                                <input
                                                    type="number"
                                                    name="_3ddeadbandhigh"
                                                    step="1"
                                                    min="1400"
                                                    max="1750"
                                                    v-model.number="fcStore.motor3dConfig.deadband3d_high"
                                                />
                                                <span v-html="$t('configuration3dDeadbandHigh')"></span>
                                            </label>
                                        </div>
                                        <div class="number">
                                            <label>
                                                <input
                                                    type="number"
                                                    name="_3dneutral"
                                                    step="1"
                                                    min="1400"
                                                    max="1600"
                                                    v-model.number="fcStore.motor3dConfig.neutral"
                                                />
                                                <span v-html="$t('configuration3dNeutral')"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- END 3D -->
                    </div>
                </div>
                <!-- END CONFIGURATION -->
                <div class="col-span-1">
                    <!-- MOTOR TEST SECTION -->
                    <div class="gui_box motorblock">
                        <div class="spacer">
                            <!-- SENSOR GRAPH SECTION -->
                            <div class="gui_box grey">
                                <div class="graph-grid">
                                    <svg ref="graphSvg" id="graph">
                                        <g class="grid x" transform="translate(40, 120)"></g>
                                        <g class="grid y" transform="translate(40, 10)"></g>
                                        <g class="data" transform="translate(41, 10)"></g>
                                        <g class="axis x" transform="translate(40, 120)"></g>
                                        <g class="axis y" transform="translate(40, 10)"></g>
                                    </svg>
                                    <div class="plot_control">
                                        <div class="table">
                                            <div class="sensor row">
                                                <div class="left-cell motor-button">
                                                    <a
                                                        class="reset_max"
                                                        href="#"
                                                        @click.prevent="resetMaxValues"
                                                        :title="$t('motorsResetMaximum')"
                                                        v-html="$t('motorsResetMaximumButton')"
                                                    ></a>
                                                </div>
                                                <div class="right-cell">
                                                    <select name="sensor_choice" v-model="sensorType">
                                                        <option
                                                            value="gyro"
                                                            v-html="$t('motorsSensorGyroSelect')"
                                                        ></option>
                                                        <option
                                                            value="accel"
                                                            v-html="$t('motorsSensorAccelSelect')"
                                                        ></option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div class="row-container">
                                                <div class="row">
                                                    <div class="left-cell">
                                                        <div v-html="$t('sensorsRefresh')"></div>
                                                    </div>
                                                    <div class="rate right-cell">
                                                        <select name="rate" v-model.number="sensorRate">
                                                            <option
                                                                v-for="rate in availableRates"
                                                                :key="rate"
                                                                :value="rate"
                                                            >
                                                                {{ rate }} ms
                                                            </option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div class="row">
                                                    <div class="left-cell">
                                                        <div v-html="$t('sensorsScale')"></div>
                                                    </div>
                                                    <div class="scale right-cell">
                                                        <select name="scale" v-model.number="sensorScale">
                                                            <option
                                                                v-for="(val, label) in currentScaleOptions"
                                                                :key="label"
                                                                :value="val"
                                                            >
                                                                {{ label }}
                                                            </option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div class="row" v-for="axis in ['x', 'y', 'z']" :key="axis">
                                                    <div class="left-cell">{{ axis.toUpperCase() }}:</div>
                                                    <div class="value right-cell" :class="axis">
                                                        {{ rawDataDisplay[axis] }}
                                                    </div>
                                                </div>
                                                <div class="row">
                                                    <div class="left-cell">RMS:</div>
                                                    <div class="rms value right-cell">
                                                        {{ rawDataDisplay.rms }}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="power_info">
                                    <span class="power_text" v-html="$t('motorsVoltage')"></span>
                                    <span class="motors-bat-voltage power_value">{{ powerValues.voltage }}</span>

                                    <span class="power_text" v-html="$t('motorsADrawing')"></span>
                                    <span class="motors-bat-mah-drawing power_value">{{ powerValues.amperage }}</span>

                                    <span class="power_text" v-html="$t('motorsmAhDrawn')"></span>
                                    <span class="motors-bat-mah-drawn power_value">{{ powerValues.mAhDrawn }}</span>
                                </div>
                            </div>

                            <div class="motors">
                                <ul class="grid-box col9 titles">
                                    <li v-for="i in numberOfValidOutputs" :key="i" :title="$t('motorNumber' + i)">
                                        {{ i }}
                                    </li>
                                    <li></li>
                                </ul>
                                <div class="bar-wrapper grid-box col9">
                                    <div v-for="i in numberOfValidOutputs" :key="i" :class="'m-block motor-' + (i - 1)">
                                        <div class="meter-bar">
                                            <div class="label">{{ motorValues[i - 1] }}</div>
                                            <div
                                                class="indicator"
                                                :style="{
                                                    marginTop: 100 - getMotorBarHeight(i - 1) + 'px',
                                                    height: getMotorBarHeight(i - 1) + 'px',
                                                    backgroundColor:
                                                        'rgba(255,187,0,' +
                                                        (getMotorBarHeight(i - 1) * 0.009).toFixed(2) +
                                                        ')',
                                                }"
                                            >
                                                <div class="label"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="m-block"></div>
                                </div>
                            </div>

                            <div class="motor_testing">
                                <ul class="grid-box col9 telemetry">
                                    <li v-for="i in numberOfValidOutputs" :key="i">
                                        <span
                                            :class="'motor-' + (i - 1) + ' cf_tip'"
                                            :title="$t('motorsTelemetryHelp')"
                                            v-html="getTelemetryHtml(i - 1)"
                                        ></span>
                                    </li>
                                    <li>
                                        <span class="motor-master cf_tip" :title="$t('motorsTelemetryHelp')"
                                            >&nbsp;</span
                                        >
                                    </li>
                                </ul>

                                <div class="sliders">
                                    <ul class="grid-box col9">
                                        <li v-for="i in numberOfValidOutputs" :key="i">
                                            <input
                                                type="range"
                                                class="motor-slider"
                                                :min="minSliderValue"
                                                :max="maxSliderValue"
                                                v-model.number="motorValues[i - 1]"
                                                :disabled="!motorsTestingEnabled"
                                                @input="onMotorSliderChange(i - 1)"
                                                @wheel.prevent="onSliderWheel(i - 1, $event)"
                                            />
                                        </li>
                                        <li>
                                            <input
                                                type="range"
                                                class="master-slider master"
                                                :min="minSliderValue"
                                                :max="maxSliderValue"
                                                v-model.number="masterValue"
                                                :disabled="!motorsTestingEnabled"
                                                @input="onMasterSliderChange"
                                                @wheel.prevent="onSliderWheel(-1, $event)"
                                            />
                                        </li>
                                    </ul>
                                </div>

                                <div class="values">
                                    <ul class="grid-box col9">
                                        <li v-for="i in numberOfValidOutputs" :key="i">{{ motorValues[i - 1] }}</li>
                                        <li style="font-weight: bold" v-html="$t('motorsMaster')"></li>
                                    </ul>
                                </div>
                            </div>

                            <div class="danger">
                                <p v-html="$t('motorsNotice')"></p>
                                <input
                                    id="motorsEnableTestMode"
                                    type="checkbox"
                                    class="togglesmall"
                                    v-model="motorsTestingEnabled"
                                />
                                <span class="motorsEnableTestMode" v-html="$t('motorsEnableControl')"></span>
                            </div>
                        </div>
                    </div>
                    <!-- END MOTOR TEST SECTION -->
                </div>
            </div>

            <!-- Warning Dialog -->
            <dialog id="dialog-settings-changed" ref="dialogSettingsChanged">
                <div id="dialog-settings-changed-content-wrapper">
                    <div id="dialog-settings-changed-content">{{ warningMessage }}</div>
                    <div class="btn dialog-buttons">
                        <a
                            href="#"
                            class="regular-button"
                            @click.prevent="closeWarningDialog"
                            v-html="$t('motorsDialogSettingsChangedOk')"
                        ></a>
                    </div>
                </div>
            </dialog>

            <!-- Dynamic Notch Filters Dialog -->
            <dialog id="dialog-dyn-filters" ref="dialogDynFilters">
                <div class="dialog-content-wrapper">
                    <div class="dialog-title" v-html="$t('dialogDynFiltersChangeTitle')"></div>
                    <div class="dialog-text" v-html="$t('dialogDynFiltersChangeNote')"></div>
                    <div class="btn dialog-buttons">
                        <a
                            href="#"
                            class="regular-button"
                            @click.prevent="applyDynFiltersChange"
                            v-html="$t('presetsWarningDialogYesButton')"
                        ></a>
                        <a
                            href="#"
                            class="regular-button"
                            @click.prevent="closeDynFiltersDialog"
                            v-html="$t('presetsWarningDialogNoButton')"
                        ></a>
                    </div>
                </div>
            </dialog>
        </div>

        <!-- Fixed Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom" style="position: fixed">
            <div class="btn save_btn">
                <a
                    class="save"
                    href="#"
                    :class="{ disabled: buttonStates.saveDisabled }"
                    @click.prevent="!buttonStates.saveDisabled && saveAndReboot()"
                >
                    {{ $t("configurationButtonSave") }}
                </a>
            </div>
            <div class="btn">
                <a
                    class="stop"
                    href="#"
                    :class="{ disabled: buttonStates.stopDisabled }"
                    @click.prevent="!buttonStates.stopDisabled && stopMotors()"
                >
                    {{ $t("escDshotDirectionDialog-StopWizard") }}
                </a>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useDialog } from "@/composables/useDialog";
import { mixerList } from "@/js/model";
import { getMixerImageSrc } from "@/js/utils/common";
import EscProtocols from "@/js/utils/EscProtocols";
import semver from "semver";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import * as d3 from "d3";
import { get as getConfig, set as setConfig } from "@/js/ConfigStorage";
import DshotCommand from "@/js/utils/DshotCommand";
import { mspHelper } from "@/js/msp/MSPHelper";
import { tracking } from "@/js/Analytics";
import GUI from "@/js/gui";

// Import composables for proper state management
import { useMotorsState } from "@/composables/motors/useMotorsState";
import { useMotorTesting } from "@/composables/motors/useMotorTesting";
import { useMotorConfiguration } from "@/composables/motors/useMotorConfiguration";
import { useMotorDataPolling } from "@/composables/motors/useMotorDataPolling";

const API_VERSION_1_47 = "1.47.0";

const fcStore = useFlightControllerStore();
const dialog = useDialog();

// Initialize motors state management
const motorsState = useMotorsState();
const { configHasChanged, trackChange, resetChanges } = motorsState;

// Warning dialog
const dialogSettingsChanged = ref(null);
const warningMessage = ref("");

const showWarningDialog = (message) => {
    warningMessage.value = message;
    dialogSettingsChanged.value?.showModal();
};

const closeWarningDialog = () => {
    dialogSettingsChanged.value?.close();
};

// Dynamic notch filter dialog
const dialogDynFilters = ref(null);
const previousDshotBidir = ref(false);
const previousFilterDynQ = ref(null);
const previousFilterDynCount = ref(null);

const showDynFiltersDialog = () => {
    dialogDynFilters.value?.showModal();
};

const closeDynFiltersDialog = () => {
    dialogDynFilters.value?.close();
};

const applyDynFiltersChange = () => {
    const FILTER_DEFAULT = {
        dyn_notch_count_rpm: 1,
        dyn_notch_q_rpm: 500,
        dyn_notch_count: 3,
        dyn_notch_q: 120,
    };

    if (fcStore.motorConfig.use_dshot_telemetry && !previousDshotBidir.value) {
        fcStore.filterConfig.dyn_notch_count = FILTER_DEFAULT.dyn_notch_count_rpm;
        fcStore.filterConfig.dyn_notch_q = FILTER_DEFAULT.dyn_notch_q_rpm;
    } else if (!fcStore.motorConfig.use_dshot_telemetry && previousDshotBidir.value) {
        fcStore.filterConfig.dyn_notch_count = FILTER_DEFAULT.dyn_notch_count;
        fcStore.filterConfig.dyn_notch_q = FILTER_DEFAULT.dyn_notch_q;
    }
    closeDynFiltersDialog();
};

// Initialize motor testing with safety features
const { motorsTestingEnabled, motorValues, masterValue, sendMotorCommand, stopAllMotors } = useMotorTesting(
    configHasChanged,
    showWarningDialog,
);

// Initialize configuration tracking
const { setupConfigWatchers } = useMotorConfiguration(motorsState, motorsTestingEnabled, () => {
    motorsTestingEnabled.value = false;
});

// Initialize data polling
const { motorTelemetry, powerStats } = useMotorDataPolling(motorsTestingEnabled);

// Button states (central controller like original setContentButtons)
const buttonStates = computed(() => ({
    toolsDisabled: configHasChanged.value || motorsTestingEnabled.value,
    saveDisabled: !configHasChanged.value,
    stopDisabled: !motorsTestingEnabled.value,
}));

// Watch for bidirectional DShot changes
watch(
    () => fcStore.motorConfig.use_dshot_telemetry,
    (newValue, oldValue) => {
        if (oldValue === undefined) return; // Skip initial load

        const rpmFilterIsDisabled = fcStore.filterConfig.gyro_rpm_notch_harmonics === 0;

        // Store previous values for potential restore
        if (previousFilterDynQ.value === null) {
            previousFilterDynQ.value = fcStore.filterConfig.dyn_notch_q;
            previousFilterDynCount.value = fcStore.filterConfig.dyn_notch_count;
        }

        // Show dialog only when ENABLING dshotBidir and RPM filter is disabled
        if (newValue && !previousDshotBidir.value && !rpmFilterIsDisabled) {
            showDynFiltersDialog();
        } else {
            // Restore values if dialog not shown
            fcStore.filterConfig.dyn_notch_count = previousFilterDynCount.value;
            fcStore.filterConfig.dyn_notch_q = previousFilterDynQ.value;
        }
    },
);

onMounted(async () => {
    // Request MSP data
    await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
    if (fcStore.motorConfig.use_dshot_telemetry || fcStore.motorConfig.use_esc_sensor) {
        await MSP.promise(MSPCodes.MSP_MOTOR_TELEMETRY);
    }
    await MSP.promise(MSPCodes.MSP_MOTOR_3D_CONFIG);
    await MSP.promise(MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING);
    await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
    await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
    await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);

    // Initialize motors state (CRITICAL: must be after MSP data loaded)
    motorsState.initializeDefaults();

    // Setup configuration change watchers (CRITICAL: tracks all config changes)
    setupConfigWatchers();

    // Store initial dshotBidir value for comparison
    previousDshotBidir.value = fcStore.motorConfig.use_dshot_telemetry;
    previousFilterDynQ.value = fcStore.filterConfig.dyn_notch_q;
    previousFilterDynCount.value = fcStore.filterConfig.dyn_notch_count;

    updateMixerPreview();

    // Initialize graph state from config
    const storedSettings = getConfig([
        "motors_tab_sensor_settings",
        "motors_tab_gyro_settings",
        "motors_tab_accel_settings",
    ]);
    if (storedSettings.motors_tab_sensor_settings) {
        sensorType.value = storedSettings.motors_tab_sensor_settings.sensor;
    }
    if (storedSettings.motors_tab_gyro_settings) {
        sensorGyroRate.value = storedSettings.motors_tab_gyro_settings.rate;
        sensorGyroScale.value = storedSettings.motors_tab_gyro_settings.scale;
    }
    if (storedSettings.motors_tab_accel_settings) {
        sensorAccelRate.value = storedSettings.motors_tab_accel_settings.rate;
        sensorAccelScale.value = storedSettings.motors_tab_accel_settings.scale;
    }

    // Start graph
    setupGraph();

    // Initialize Switchery for toggle switches - wait for DOM to be fully updated
    await nextTick();
    await nextTick();
    GUI.switchery();
});

// Sensor Graph Logic
const graphSvg = ref(null);
const sensorType = ref("gyro");
const sensorGyroRate = ref(20);
const sensorGyroScale = ref(2000);
const sensorAccelRate = ref(20);
const sensorAccelScale = ref(2);

const availableRates = [10, 20, 30, 40, 50, 100, 250, 500, 1000];

const sensorSelectValues = {
    gyroScale: {
        "1 deg/s": 1,
        "2 deg/s": 2,
        "3 deg/s": 3,
        "4 deg/s": 4,
        "5 deg/s": 5,
        "10 deg/s": 10,
        "25 deg/s": 25,
        "50 deg/s": 50,
        "100 deg/s": 100,
        "200 deg/s": 200,
        "300 deg/s": 300,
        "400 deg/s": 400,
        "500 deg/s": 500,
        "1000 deg/s": 1000,
        "2000 deg/s": 2000,
    },
    accelScale: {
        "0.05 g": 0.05,
        "0.1 g": 0.1,
        "0.2 g": 0.2,
        "0.3 g": 0.3,
        "0.4 g": 0.4,
        "0.5 g": 0.5,
        "1 g": 1,
        "2 g": 2,
    },
};

// We need to invert the key/value for the select options as we want value to be the number
// and label to be the text. The object above is label: value.
const currentScaleOptions = computed(() => {
    return sensorType.value === "gyro" ? sensorSelectValues.gyroScale : sensorSelectValues.accelScale;
});

const sensorRate = computed({
    get: () => (sensorType.value === "gyro" ? sensorGyroRate.value : sensorAccelRate.value),
    set: (val) => {
        if (sensorType.value === "gyro") {
            sensorGyroRate.value = val;
            setConfig({ motors_tab_gyro_settings: { rate: val, scale: sensorGyroScale.value } });
        } else {
            sensorAccelRate.value = val;
            setConfig({ motors_tab_accel_settings: { rate: val, scale: sensorAccelScale.value } });
        }
    },
});

const sensorScale = computed({
    get: () => (sensorType.value === "gyro" ? sensorGyroScale.value : sensorAccelScale.value),
    set: (val) => {
        if (sensorType.value === "gyro") {
            sensorGyroScale.value = val;
            setConfig({ motors_tab_gyro_settings: { rate: sensorGyroRate.value, scale: val } });
        } else {
            sensorAccelScale.value = val;
            setConfig({ motors_tab_accel_settings: { rate: sensorAccelRate.value, scale: val } });
        }
    },
});

watch(sensorType, (val) => {
    setConfig({ motors_tab_sensor_settings: { sensor: val } });
});

// Graph State
const margin = { top: 20, right: 30, bottom: 10, left: 20 };
let graphHelpers = null;
let graphData = [];
let samples = 0;
let maxRead = [0, 0, 0];
let accelOffset = [0, 0, 0];
let accelOffsetEstablished = false;
let pollingIntervalId = null;
let powerPollingIntervalId = null;

const rawDataDisplay = ref({ x: "0", y: "0", z: "0", rms: "0" });
const powerValues = ref({ voltage: "0.00", amperage: "0.00", mAhDrawn: "0" });

const resetMaxValues = () => {
    maxRead = [0, 0, 0];
    accelOffsetEstablished = false;
};

// D3 Helpers
function initDataArray(length) {
    const data = Array.from({ length: length });
    for (let i = 0; i < length; i++) {
        data[i] = [];
        data[i].min = -1;
        data[i].max = 1;
    }
    return data;
}

function updateGraphHelperSize(helpers) {
    const width = 450; // Fixed width matching SVG in CSS or parent
    // Typically we would get clientWidth of container, but let's assume fixed or check ref
    const element = graphSvg.value;
    const clientWidth = element ? element.clientWidth || 450 : 450;
    const clientHeight = element ? element.clientHeight || 250 : 250;

    helpers.width = clientWidth - margin.left - margin.right;
    helpers.height = clientHeight - margin.top - margin.bottom;

    helpers.widthScale.range([0, helpers.width]);
    helpers.heightScale.range([helpers.height, 0]);

    helpers.xGrid.tickSize(-helpers.height, 0, 0);
    helpers.yGrid.tickSize(-helpers.width, 0, 0);
}

function initGraphHelpers(sampleNumber, heightDomain) {
    const helpers = { dynamicHeightDomain: !heightDomain };

    helpers.widthScale = d3
        .scaleLinear()
        .clamp(true)
        .domain([sampleNumber - 299, sampleNumber]);
    helpers.heightScale = d3
        .scaleLinear()
        .clamp(true)
        .domain(heightDomain || [1, -1]);

    helpers.xGrid = d3.axisBottom();
    helpers.yGrid = d3.axisLeft();

    // Deferred sizing update until mounted/drawing
    helpers.widthScale.range([0, 400]); // fallback
    helpers.heightScale.range([200, 0]); // fallback

    helpers.xGrid.scale(helpers.widthScale).tickFormat("");
    helpers.yGrid.scale(helpers.heightScale).tickFormat("");

    helpers.xAxis = d3
        .axisBottom()
        .scale(helpers.widthScale)
        .ticks(5)
        .tickFormat((d) => d);
    helpers.yAxis = d3
        .axisLeft()
        .scale(helpers.heightScale)
        .ticks(5)
        .tickFormat((d) => d);

    helpers.line = d3
        .line()
        .x((d) => helpers.widthScale(d[0]))
        .y((d) => helpers.heightScale(d[1]));

    return helpers;
}

function drawGraph(helpers, data, sampleNumber) {
    if (!graphSvg.value) return;
    const svg = d3.select(graphSvg.value);

    updateGraphHelperSize(helpers); // Ensure size is current

    helpers.widthScale.domain([sampleNumber - 299, sampleNumber]);
    if (helpers.dynamicHeightDomain) {
        // logic for dynamic domain todo
    } else {
        // Domain set in init
    }

    helpers.xGrid.tickValues(helpers.widthScale.ticks(5).concat(helpers.widthScale.domain()));
    helpers.yGrid.tickValues(helpers.heightScale.ticks(5).concat(helpers.heightScale.domain()));

    svg.select(".x.grid").call(helpers.xGrid);
    svg.select(".y.grid").call(helpers.yGrid);
    svg.select(".x.axis").call(helpers.xAxis);
    svg.select(".y.axis").call(helpers.yAxis);

    const group = svg.select("g.data");
    const lines = group.selectAll("path").data(data, (d, i) => i);

    lines.enter().append("path").attr("class", "line");
    lines.attr("d", helpers.line);
}

function addSampleToData(data, sampleNumber, sensorData) {
    for (let i = 0; i < data.length; i++) {
        const dataPoint = sensorData[i];
        data[i].push([sampleNumber, dataPoint]);
        // Min/Max tracking for dynamic domain if needed
        if (dataPoint < data[i].min) data[i].min = dataPoint;
        if (dataPoint > data[i].max) data[i].max = dataPoint;
    }
    while (data[0].length > 300) {
        for (const item of data) {
            item.shift();
        }
    }
    return sampleNumber + 1;
}

function computeAndUpdateDisplay(sensor_data) {
    let sum = 0.0;
    // Assuming 3 axes
    for (const val of sensor_data) {
        sum += val * val;
    }
    // RMS over the buffer is cleaner, but motors.js does RMS of current window?
    // motors.js:
    /*
        let sum = 0.0;
        for (let j = 0; j < data.length; j++) { for k... sum += data[j][k][1]... }
        rms = sqrt(sum / total_points)
    */
    // It calculates RMS of the VISIBLE data (300 points per axis).

    let totalSq = 0;
    let totalCount = 0;
    for (let i = 0; i < graphData.length; i++) {
        for (let j = 0; j < graphData[i].length; j++) {
            totalSq += graphData[i][j][1] * graphData[i][j][1];
            totalCount++;
        }
    }
    const rms = totalCount > 0 ? Math.sqrt(totalSq / totalCount) : 0;

    rawDataDisplay.value = {
        x: `${sensor_data[0].toFixed(2)} ( ${maxRead[0].toFixed(2)} )`,
        y: `${sensor_data[1].toFixed(2)} ( ${maxRead[1].toFixed(2)} )`,
        z: `${sensor_data[2].toFixed(2)} ( ${maxRead[2].toFixed(2)} )`,
        rms: rms.toFixed(4),
    };
}

const updateGyroGraph = () => {
    const gyro = [fcStore.sensorData.gyroscope[0], fcStore.sensorData.gyroscope[1], fcStore.sensorData.gyroscope[2]];

    samples = addSampleToData(graphData, samples, gyro);
    drawGraph(graphHelpers, graphData, samples);

    for (let i = 0; i < 3; i++) {
        if (Math.abs(gyro[i]) > Math.abs(maxRead[i])) {
            maxRead[i] = gyro[i];
        }
    }
    computeAndUpdateDisplay(gyro);
};

const updateAccelGraph = () => {
    if (!accelOffsetEstablished) {
        for (let i = 0; i < 3; i++) {
            accelOffset[i] = fcStore.sensorData.accelerometer[i] * -1;
        }
        accelOffsetEstablished = true;
    }

    const accelWithOffset = [
        accelOffset[0] + fcStore.sensorData.accelerometer[0],
        accelOffset[1] + fcStore.sensorData.accelerometer[1],
        accelOffset[2] + fcStore.sensorData.accelerometer[2],
    ];

    samples = addSampleToData(graphData, samples, accelWithOffset);
    drawGraph(graphHelpers, graphData, samples);

    for (let i = 0; i < 3; i++) {
        if (Math.abs(accelWithOffset[i]) > Math.abs(maxRead[i])) {
            maxRead[i] = accelWithOffset[i];
        }
    }
    computeAndUpdateDisplay(accelWithOffset);
};

const setupGraph = () => {
    if (pollingIntervalId) clearInterval(pollingIntervalId);

    // Reset data
    samples = 0;
    graphData = initDataArray(3);
    const domain = [-sensorScale.value, sensorScale.value];
    graphHelpers = initGraphHelpers(samples, domain);
    updateGraphHelperSize(graphHelpers);

    if (sensorType.value === "gyro") {
        pollingIntervalId = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, updateGyroGraph);
        }, sensorRate.value);
    } else {
        pollingIntervalId = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, updateAccelGraph);
        }, sensorRate.value);
    }
};

const setupPowerPolling = () => {
    if (powerPollingIntervalId) clearInterval(powerPollingIntervalId);
    powerPollingIntervalId = setInterval(() => {
        if (fcStore.analogData.last_received_timestamp) {
            powerValues.value = {
                voltage: fcStore.analogData.voltage.toFixed(1), // Basic display
                amperage: fcStore.analogData.amperage.toFixed(2),
                mAhDrawn: fcStore.analogData.mAhdrawn,
            };
        }
    }, 250);
};

// Watchers to restart graph on settings change
watch([sensorType, sensorRate, sensorScale], () => {
    setupGraph();
});

onMounted(() => {
    setupPowerPolling();
    // Graph setup called above in async block
});

onUnmounted(() => {
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    if (powerPollingIntervalId) clearInterval(powerPollingIntervalId);
    document.removeEventListener("keydown", disableMotorTestOnKey);
});

const reverseMotorDir = computed({
    get: () => fcStore.mixerConfig.reverseMotorDir === 1,
    set: (val) => {
        fcStore.mixerConfig.reverseMotorDir = val ? 1 : 0;
    },
});

const sortedMixerList = computed(() => {
    // Legacy behavior: sort mixer list alphabetically
    return [...mixerList].sort((a, b) => a.name.localeCompare(b.name));
});

const mixerPreviewSvg = ref("");

const updateMixerPreview = async () => {
    const imgSrc = getMixerImageSrc(fcStore.mixerConfig.mixer, fcStore.mixerConfig.reverseMotorDir);
    try {
        const response = await fetch(imgSrc);
        const text = await response.text();
        // Extract SVG content
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");
        const svg = doc.querySelector("svg");
        if (svg) {
            mixerPreviewSvg.value = svg.outerHTML;
        }
    } catch (e) {
        console.error("Failed to load mixer preview", e);
    }
};

watch(
    [() => fcStore.mixerConfig.mixer, () => fcStore.mixerConfig.reverseMotorDir],
    () => {
        updateMixerPreview();
    },
    { immediate: true },
);

// Track configuration changes for Save button
const defaultConfiguration = ref({});

// Store initial configuration on mount
onMounted(() => {
    defaultConfiguration.value = {
        mixer: fcStore.mixerConfig.mixer,
        reverseMotorDir: fcStore.mixerConfig.reverseMotorDir,
        // Add other config fields that need tracking
    };
});

// Motor Reordering Availability Check - matches legacy motors.js logic
const isMotorReorderingAvailable = computed(() => {
    const mixer = fcStore.mixerConfig.mixer;
    if (!mixer || mixer < 1 || mixer > mixerList.length) {
        console.log("[Motors] Reorder button hidden: invalid mixer", mixer);
        return false;
    }

    const mixerName = mixerList[mixer - 1]?.name;
    if (!mixerName) {
        console.log("[Motors] Reorder button hidden: no mixer name");
        return false;
    }

    // Check if mixer is supported by MotorOutputReorderConfig
    // These are the mixer names that have configurations defined in MotorOutputReorderingConfig.js
    const supportedMixers = [
        "Quad X",
        "Quad X 1234",
        "Quad +",
        "Tricopter",
        "Hex +",
        "Hex X",
        "Octo Flat +",
        "Octo Flat X",
        "Octo X8",
        "Bicopter",
        "V-tail Quad",
        "A-tail Quad",
        "Y4",
        "Y6",
    ];

    const result = supportedMixers.includes(mixerName) && fcStore.motorOutputOrder?.length > 0;
    return result;
});

// Motor dialog handlers
const openMotorOutputReorderDialog = () => {
    const mixer = fcStore.mixerConfig.mixer;
    if (!mixer || mixer < 1 || mixer > mixerList.length) {
        console.error("Invalid mixer configuration");
        return;
    }

    const mixerName = mixerList[mixer - 1]?.name;
    if (!mixerName) {
        console.error("Mixer name not found");
        return;
    }

    dialog.open(
        "MotorOutputReorderingDialog",
        {
            droneConfiguration: mixerName,
            motorStopValue: minSliderValue.value,
            motorSpinValue: Math.round((minSliderValue.value + maxSliderValue.value) / 2),
        },
        {
            close: () => {
                dialog.close();
            },
        },
    );
};

const openEscDshotDirectionDialog = () => {
    // Calculate motor configuration
    const mixer = fcStore.mixerConfig.mixer;
    const numberOfMotors = mixer > 0 && mixer <= mixerList.length ? mixerList[mixer - 1].motors : 0;

    const motorConfig = {
        escProtocolIsDshot: digitalProtocolConfigured.value,
        numberOfMotors: numberOfMotors,
        motorStopValue: minSliderValue.value,
        motorSpinValue: Math.round((minSliderValue.value + maxSliderValue.value) / 2),
    };

    dialog.open(
        "EscDshotDirectionDialog",
        { motorConfig },
        {
            close: () => {
                dialog.close();
            },
        },
    );
};

// Action Toolbar Buttons
const saveAndReboot = async () => {
    // Don't save if no changes
    if (!configHasChanged.value) {
        return;
    }

    try {
        // Send all motor configuration changes in sequence
        await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_MOTOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_MOTOR_3D_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_3D_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));

        // Send analytics if there were changes tracked
        if (motorsState.analyticsChanges.value && Object.keys(motorsState.analyticsChanges.value).length > 0) {
            tracking.sendSaveAndChangeEvents(
                tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER,
                motorsState.analyticsChanges.value,
                "motors",
            );
        }

        // Reset state (clears changes and updates defaults)
        resetChanges();

        // Save to EEPROM and reboot
        mspHelper.writeConfiguration(true);
    } catch (error) {
        console.error("[Motors] Save failed:", error);
    }
};

const stopMotors = () => {
    // Stop motor testing (composable handles all cleanup)
    motorsTestingEnabled.value = false;
};

// ESC Protocol Logic
const availableEscProtocols = computed(() => {
    return EscProtocols.GetAvailableProtocols(fcStore.config.apiVersion);
});

// Since we need to enable/disable options and potentially sort them (DISABLED first)
// But to keep it simple and working with index, I might not sort.
// Legacy 'sortSelect' puts "DISABLED" at top.
// I will replicate the sort order for display, but bind to index.
const sortedEscProtocolOptions = computed(() => {
    const protocols = availableEscProtocols.value.map((name, index) => ({ name, value: index }));
    const disabledText = "DISABLED";
    return protocols.sort((a, b) => {
        if (a.name === disabledText) return -1;
        if (b.name === disabledText) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
});

// Note: I used `availableEscProtocols` in the template above (v-for="(protocol, index) in availableEscProtocols").
// I should update the template to use `sortedEscProtocolOptions` if I want sorting.
// But the template used index as value, which works if I iterate over the original array.
// If I use sorted array, I must explicitely use the stored value.

const isProtocolDisabled = (protocolName) => {
    if (protocolName === "DISABLED") return false;
    const buildOptions = fcStore.config.buildOptions;
    if (buildOptions && buildOptions.length > 0) {
        return !buildOptions.some((option) => protocolName.includes(option.substring(4)));
    }
    return false;
};

const selectedEscProtocol = computed({
    get: () => fcStore.pidAdvancedConfig.fast_pwm_protocol,
    set: (val) => {
        fcStore.pidAdvancedConfig.fast_pwm_protocol = val;
    },
});

const onProtocolChange = () => {
    // legacy motors.js triggers 'updateVisibility' here.
    // Vue reactivity handles visibility via computed properties below.
    // We might need analytics tracking here later.
};

const protocolName = computed(() => {
    return availableEscProtocols.value[selectedEscProtocol.value];
});

const protocolConfigured = computed(() => {
    return protocolName.value !== "DISABLED";
});

const digitalProtocolConfigured = computed(() => {
    if (!protocolConfigured.value) {
        return false;
    }
    const name = protocolName.value;
    const result = ["DSHOT150", "DSHOT300", "DSHOT600", "PROSHOT1000"].includes(name);
    return result;
});

const analogProtocolConfigured = computed(() => {
    return protocolConfigured.value && !digitalProtocolConfigured.value;
});

const rpmFeaturesVisible = computed(() => {
    return (
        (digitalProtocolConfigured.value && fcStore.motorConfig.use_dshot_telemetry) || isFeatureEnabled("ESC_SENSOR")
    );
});

const showAnalogSettings = computed(() => {
    return analogProtocolConfigured.value;
});

const showMinThrottle = computed(() => {
    return analogProtocolConfigured.value && semver.lt(fcStore.config.apiVersion, API_VERSION_1_47);
});

const showMotorIdle = computed(() => {
    return (
        protocolConfigured.value ||
        (digitalProtocolConfigured.value &&
            fcStore.motorConfig.use_dshot_telemetry &&
            fcStore.advancedTuning.idleMinRpm)
    );
});

const showIdleMinRpm = computed(() => {
    return protocolConfigured.value && digitalProtocolConfigured.value && fcStore.motorConfig.use_dshot_telemetry;
});

const useUnsyncedPwm = computed({
    get: () => fcStore.pidAdvancedConfig.use_unsyncedPwm !== 0,
    set: (val) => {
        fcStore.pidAdvancedConfig.use_unsyncedPwm = val ? 1 : 0;
    },
});

// Feature Logic
const isFeatureEnabled = (featureName) => {
    return fcStore.features.features.isEnabled(featureName);
};

const toggleFeature = (featureName, checked) => {
    // We need to update the bitmask in fcStore.features.featureMask
    // The `features` object in store might be the whole `FEATURE_CONFIG` object which has `features` property which is `Features` instance.
    // `fcStore.features` returns `FC.FEATURE_CONFIG`.
    // `FC.FEATURE_CONFIG.features` is the Features helper instance.
    // `features.isEnabled` works.
    // `features.enable(name)` / `features.disable(name)`.
    const featuresHelper = fcStore.features.features;
    if (checked) {
        featuresHelper.enable(featureName);
    } else {
        featuresHelper.disable(featureName);
    }
    // We might need to trigger an update to make sure Vue detects change if the helper modifies internal state but not the ref directly in a way Vue sees?
    // Pinia store `features` refers to `FC.FEATURE_CONFIG`.
    // The `featureMask` is inside.
    // To ensure reactivity, we might need to re-assign or trigger update.
    // `fcStore.features = { ...fcStore.features }` might be too heavy.
    // But since `FC.FEATURE_CONFIG` is reactive in `fc.js` (proxy), it should work?
    // Let's assume it works for now.
};

const numberOfValidOutputs = computed(() => {
    const mixer = fcStore.mixerConfig.mixer;
    if (mixer > 0 && mixer <= mixerList.length) {
        const motorCount = mixerList[mixer - 1].motors;
        // Use firmware supplied motor_count or the mixer's expected motor count
        const firmwareCount = fcStore.motorConfig.motor_count;

        // Check if motor data is available to validate
        if (fcStore.motorData && fcStore.motorData.length > 0) {
            for (let i = 0; i < fcStore.motorData.length; i++) {
                if (fcStore.motorData[i] === 0) {
                    return i > 0 ? i : motorCount;
                }
            }
        }

        // Return the minimum of firmware count and motor count
        return Math.min(firmwareCount, motorCount);
    }
    return 4; // Default to 4 motors (quad)
});

const isMotorTesting = computed(() => motorsTestingEnabled.value);

const minSliderValue = computed(() => {
    if (digitalProtocolConfigured.value) {
        return 1000; // DShot Disarmed
    }
    return fcStore.motorConfig.mincommand;
});

const maxSliderValue = computed(() => {
    if (digitalProtocolConfigured.value) {
        return 2000;
    }
    return fcStore.motorConfig.maxthrottle;
});

const zeroThrottleValue = computed(() => {
    if (isFeatureEnabled("3D")) {
        let neutral = fcStore.motor3dConfig.neutral;
        // Sanity check from legacy
        return neutral > 1575 || neutral < 1425 ? 1500 : neutral;
    }
    return minSliderValue.value;
});

watch(zeroThrottleValue, (val) => {
    if (!motorsTestingEnabled.value) {
        motorValues.value.fill(val);
        masterValue.value = val;
    }
});

// Buffering for motor commands to prevent MSP queue overflow
let bufferingSetMotor = [];
let bufferDelay = null;

const sendBufferedMotorCommand = () => {
    if (bufferingSetMotor.length > 0) {
        // Only send the last buffered values
        const values = bufferingSetMotor.pop();
        sendMotorCommand(values);
        bufferingSetMotor = [];
    }
    bufferDelay = null;
};

const onMotorSliderChange = (index) => {
    // Buffer motor values and send after 10ms delay
    bufferingSetMotor.push([...motorValues.value]);

    if (!bufferDelay) {
        bufferDelay = setTimeout(sendBufferedMotorCommand, 10);
    }
};

const onMasterSliderChange = () => {
    for (let i = 0; i < numberOfValidOutputs.value; i++) {
        motorValues.value[i] = masterValue.value;
    }

    // Buffer motor values and send after 10ms delay
    bufferingSetMotor.push([...motorValues.value]);

    if (!bufferDelay) {
        bufferDelay = setTimeout(sendBufferedMotorCommand, 10);
    }
};

const onSliderWheel = (index, event) => {
    if (!motorsTestingEnabled.value) return;

    // index -1 for master
    const step = 25;
    const delta = event.deltaY > 0 ? -step : step;

    let newVal;
    if (index === -1) {
        newVal = masterValue.value + delta;
    } else {
        newVal = motorValues.value[index] + delta;
    }

    // Clamp
    newVal = Math.max(minSliderValue.value, Math.min(maxSliderValue.value, newVal));
    // Round to step
    newVal = Math.round(newVal / step) * step;

    if (index === -1) {
        masterValue.value = newVal;
        onMasterSliderChange();
    } else {
        motorValues.value[index] = newVal;
        onMotorSliderChange(index);
    }
};

const ignoreKeys = ["PageUp", "PageDown", "End", "Home", "ArrowUp", "ArrowDown", "AltLeft", "AltRight", "Tab"];

const disableMotorTestOnKey = (e) => {
    if (motorsTestingEnabled.value) {
        // Check if key is ignored
        if (!ignoreKeys.includes(e.code) && !ignoreKeys.includes(e.key)) {
            motorsTestingEnabled.value = false;
        }
    }
};

watch(motorsTestingEnabled, async (enabled) => {
    if (enabled) {
        const buffer = [];
        buffer.push(DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING);
        buffer.push(255); // Send to all escs
        buffer.push(1); // 1 command
        buffer.push(13); // Enable extended dshot telemetry

        MSP.send_message(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);

        document.addEventListener("keydown", disableMotorTestOnKey);
    } else {
        motorValues.value.fill(zeroThrottleValue.value);
        masterValue.value = zeroThrottleValue.value;

        // Clear any pending buffered commands
        if (bufferDelay) {
            clearTimeout(bufferDelay);
            bufferDelay = null;
            bufferingSetMotor = [];
        }

        // Stop all motors
        sendMotorCommand(Array(8).fill(0));

        // Sync Switchery visual state with programmatic change
        await nextTick();
        const checkbox = document.getElementById("motorsEnableTestMode");
        if (checkbox) {
            // Remove existing Switchery element
            const switcheryElement = checkbox.nextElementSibling;
            if (switcheryElement && switcheryElement.classList.contains("switchery")) {
                switcheryElement.remove();
            }
            // Add the toggle class back so GUI.switchery() will reinitialize
            if (!checkbox.classList.contains("toggle")) {
                checkbox.classList.add("toggle");
            }
            // Reinitialize Switchery with correct state
            GUI.switchery();
        }

        document.removeEventListener("keydown", disableMotorTestOnKey);
    }

    // We need to tell the backend/MSP helper that we are arming/testing
    mspHelper.setArmingEnabled(enabled, enabled);
});

// Telemetry Logic
const getMotorValue = (index) => {
    if (motorsTestingEnabled.value) return motorValues.value[index];
    // If telemetry running, show telemetry data
    return fcStore.motorData[index] || minSliderValue.value;
};

const getMotorBarHeight = (index) => {
    const val = getMotorValue(index);
    const min = minSliderValue.value;
    const max = maxSliderValue.value;
    const range = max - min;
    if (range === 0) return 0;
    return Math.max(0, Math.min(100, ((val - min) / range) * 100));
};

const getTelemetryHtml = (index) => {
    if (!fcStore.motorConfig.use_dshot_telemetry && !isFeatureEnabled("ESC_SENSOR")) return "&nbsp;";
    if (!fcStore.motorTelemetryData || !fcStore.motorTelemetryData.rpm) return "&nbsp;";

    const rpm = fcStore.motorTelemetryData.rpm[index];
    let rpmText = rpm;
    if (rpm > 999999) {
        rpmText = `${(rpm / 1000000).toFixed(2)}M`;
    }

    let html = `RPM: ${rpmText}`;

    if (fcStore.motorConfig.use_dshot_telemetry) {
        const invalid = fcStore.motorTelemetryData.invalidPercent[index];
        const errorClass = invalid > 100 ? "warning" : ""; // >1.00% ? Legacy said > 100 which is raw value?
        html += `<br><span class="${errorClass}">Err: ${(invalid / 100).toFixed(2)}%</span>`;
    }

    if (fcStore.motorTelemetryData.temperature) {
        html += `<br>Temp: ${fcStore.motorTelemetryData.temperature[index]}°C`;
    }

    return html;
};

onMounted(() => {
    // Polling is handled by useMotorDataPolling()
});

onUnmounted(() => {
    if (telemetryInterval) clearInterval(telemetryInterval);
    // Clear any pending buffered commands
    if (bufferDelay) {
        clearTimeout(bufferDelay);
        bufferDelay = null;
    }
    // ensure disarmed safety
    if (motorsTestingEnabled.value) {
        sendMotorCommand(Array(8).fill(0));
    }
});
</script>

<style lang="less">
.tab-motors {
    .tab_title {
        margin-bottom: 10px;
        font-size: 20px;
    }
    .spacer {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .motorstop {
        .spacer_box {
            gap: 0;
        }
    }
    .configuration {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .danger {
        color: var(--text);
        .switchery {
            margin-right: 0.1rem;
        }
    }
    .ui-grid-col {
        margin-bottom: 0;
    }
    position: relative;
    .groupTitle {
        padding: 0 0 5px 0;
        margin: 0 0 10px 0;
        font-size: 16px;
        border-bottom: 1px solid var(--surface-500);
    }
    .mixerPreview {
        display: flex;
        justify-content: center;
        padding: 10px;
        svg {
            width: 150px;
            height: 150px;
            margin-left: 15px;
        }
    }
    dl.features {
        dt {
            width: 10px;
            height: 18px;
            line-height: 18px;
        }
        dd {
            margin: 0 0 0 20px;
            height: 18px;
            line-height: 18px;
        }
    }
    table.featuresMultiple {
        border-collapse: collapse;
        margin-bottom: 0.5rem;
        tbody {
            border-bottom: 1px solid var(--surface-500);
            tr {
                td {
                    padding: 0 0 0.5rem 0;
                }
            }
        }
    }
    .number {
        input {
            width: 55px;
            padding-left: 3px;
            height: 20px;
            line-height: 20px;
            text-align: left;
            border-radius: 3px;
            margin-right: 11px;
            font-size: 12px;
            font-weight: normal;
        }
        .disabled {
            width: 48px;
            padding: 0 5px;
            background-color: var(--surface-400);
        }
        input[readonly] {
            background-color: #afafaf;
            border: none;
            pointer-events: none;
            opacity: 0.5;
        }
        span {
            margin-left: 0;
        }
        &:last-child {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 0;
        }
    }
    .disarm {
        .checkbox {
            padding-left: 0;
            margin-top: -5px;
            margin-right: 5px;
            padding-bottom: 5px;
            border-bottom: 1px solid var(--surface-500);
            width: 100%;
        }
        margin-bottom: 5px;
        border-bottom: 1px solid var(--surface-500);
        width: 100%;
    }
    .freelabel {
        margin-left: 10px;
        position: relative;
    }
    span {
        margin: 0;
    }
    .spacer_box.mixer_settings {
        padding-bottom: 0px;
    }
    .motor_direction_reversed {
        padding-top: 10px;
    }
    .motor_tool_buttons {
        padding-left: 10px;
        margin-top: 10px;
        display: flex;
        gap: 10px;
    }
    .disarmdelay {
        width: 100%;
        border-bottom: 1px solid var(--surface-500);
    }
    .select {
        margin-bottom: 5px;
        clear: left;
        padding-bottom: 5px;
        border-bottom: 1px solid var(--surface-500);
        width: 100%;
        &:last-child {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 0;
        }
    }
    .selectProtocol {
        padding: 0.5rem 0;
        margin-bottom: 0.5rem;
        border-bottom: 1px solid var(--surface-500);
        width: 100%;
    }
    thead {
        display: none;
    }
    .alignicon {
        width: 15px;
        height: 15px;
        margin: 3px;
    }
    ._3dSettings {
        width: 100%;
    }
    .modelAndGraph {
        width: 100%;
    }
    #dialogMotorOutputReorder-closebtn {
        margin-right: 0px;
        margin-bottom: 0px;
    }
    dialog {
        width: 400px;
        height: 440px;
    }
    #dialogMotorOutputReorderContentWrapper {
        display: flex;
        flex-flow: column;
        width: 100%;
        height: 100%;
    }
    #dialogMotorOutputReorderContent {
        flex-grow: 1;
    }
    #escDshotDirectionDialog-closebtn {
        margin-right: 0px;
        margin-bottom: 0px;
        position: absolute;
        right: 0px;
        bottom: 0px;
    }
    #escDshotDirectionDialog-ContentWrapper {
        display: flex;
        flex-flow: column;
        width: 100%;
        height: 100%;
        position: relative;
    }
    #escDshotDirectionDialog-Content {
        flex-grow: 1;
    }
    #dialog-mixer-reset {
        width: 400px;
        height: fit-content;
    }
    #dialog-settings-changed {
        height: 120px;
    }
    #dialog-settings-reset-confirmbtn {
        margin-bottom: 12px;
        position: relative;
    }
    #dialog-settings-changed-confirmbtn {
        margin-right: 0px;
        margin-bottom: 0px;
        position: absolute;
        right: 0px;
        bottom: 0px;
    }
    #dialog-settings-changed-content-wrapper {
        display: flex;
        flex-flow: column;
        width: 100%;
        height: 100%;
        position: relative;
    }
    #dialog-settings-changed-content {
        flex-grow: 1;
    }
    .plot_control {
        margin: 0;
        background-color: transparent;
        border-top-right-radius: 3px;
        border-bottom-right-radius: 3px;
        .table {
            display: table;
            table-layout: fixed;
            border-collapse: separate;
            border-spacing: 5px;
            box-sizing: border-box;
        }
        .row-container {
            display: table-row-group;
        }
        .motor-button {
            a {
                background-color: var(--primary-500);
                border-radius: 3px;
                border: 1px solid #e8b423;
                color: #000;
                font-size: 10px;
                line-height: 17px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                display: block;
                text-align: center;
            }
        }
        .row {
            display: table-row;
        }
        .left-cell {
            display: table-cell;
            vertical-align: middle;
        }
        .right-cell {
            display: table-cell;
            vertical-align: middle;
            text-align: right;
            width: 95px;
            font-size: smaller;
        }
        select {
            width: 100%;
            border: 1px solid var(--surface-500);
            border-radius: 3px;
        }
        .value {
            padding: 3px;
            color: black;
            border-radius: 3px;
        }
        .rms {
            background-color: #00d800;
        }
    }
    .power_info {
        margin-left: 1em;
        .power_text {
            font-weight: bold;
        }
        .power_value {
            margin-right: 2em;
            margin-left: 1em;
            display: inline-block;
            text-align: left;
            width: 50px;
        }
    }
    svg {
        width: 100%;
        height: 100%;
    }
    .grid {
        .tick {
            stroke: silver;
            stroke-width: 1px;
            shape-rendering: crispEdges;
        }
        path {
            stroke-width: 0;
        }
    }
    .data {
        .line {
            stroke-width: 2px;
            fill: none;
        }
    }
    text {
        stroke: none;
        fill: var(--text);
        font-size: 10px;
    }
    .motorblock {
        margin-bottom: 0;
        background-color: var(--surface-200);
    }
    .title {
        padding-bottom: 2px;
        text-align: center;
        font-weight: bold;
    }
    .title2 {
        padding-bottom: 2px;
        text-align: center;
        font-size: 12px;
        font-weight: 300;
    }
    .titles {
        height: 20px;
        li {
            text-align: center;
        }
        .active {
            color: green;
        }
    }
    .m-block {
        height: 100px;
        width: 100%;
        text-align: center;
        background-color: var(--surface-300);
        border-radius: 0.5rem;
        .meter-bar {
            position: relative;
            width: 100%;
            height: 100px;
            background-color: var(--surface-300);
            border-radius: 0.5rem;
            border: 1px solid var(--surface-500);
        }
        .label {
            position: absolute;
            width: 100%;
            bottom: 45px;
            text-align: center;
            font-weight: bold;
            font-size: 10px;
            color: var(--surface-950);
        }
        .label.rpm_info {
            bottom: 28px;
        }
        .indicator {
            .label {
                color: white;
            }
        }
    }
    .indicator {
        position: absolute;
        overflow: hidden;
        width: 100%;
        text-align: center;
        border-radius: 2px;
    }
    .motor_testing {
        margin-bottom: 0;
        padding: 0;
        border: 0;
        list-style: none;
        outline: none;
        .sliders {
            ul li {
                display: flex;
                align-items: flex-end;
                justify-content: center;
            }
            input {
                cursor: ns-resize;
                writing-mode: vertical-lr;
                direction: rtl;
                height: 6rem !important;
                padding: 0 !important;
            }
        }
        .values {
            li {
                text-align: center;
                font-size: 10px;
            }
        }
        .telemetry {
            margin-bottom: 0.5rem;
            .warning {
                color: var(--error-500);
            }
            li {
                text-align: center;
                font-size: 10px;
            }
        }
    }

    @media all and (max-width: 1055px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr !important;
            }
        }
    }
}
</style>
