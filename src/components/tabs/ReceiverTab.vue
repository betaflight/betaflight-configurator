<template>
    <BaseTab tab-name="receiver">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabReceiver')"></div>
            <WikiButton docUrl="Receiver" />
            <div class="note">
                <p v-html="$t('receiverHelp')"></p>
            </div>

            <div class="grid-row grid-box col5">
                <!-- Left Column: Model Preview + Channel Bars -->
                <div class="col-span-2">
                    <div class="gui_box grey tunings topspacer">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('receiverModelPreview')"></div>
                        </div>
                        <div class="model_preview_cell spacer_box">
                            <div class="model_preview background_paper" ref="modelPreviewContainer">
                                <canvas ref="modelCanvas"></canvas>
                            </div>
                        </div>
                    </div>
                    <!-- Channel Bars -->
                    <div class="bars">
                        <ul v-for="(channel, index) in channelBars" :key="index">
                            <li class="name">{{ channel.name }}</li>
                            <li class="meter">
                                <div class="meter-bar">
                                    <div class="label">{{ channel.value }}</div>
                                    <div
                                        class="fill"
                                        :class="{ disabled: rc.active_channels === 0 }"
                                        :style="{ width: channel.width + '%' }"
                                    >
                                        <div class="label">{{ channel.value }}</div>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Right Column: Configuration -->
                <div class="col-span-3">
                    <!-- Receiver Mode -->
                    <div class="receiver">
                        <div class="gui_box receiver grey">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('configurationReceiver')"></div>
                            </div>
                            <div class="spacer_box">
                                <select
                                    id="rxModeSelect"
                                    class="features rxMode"
                                    name="rxMode"
                                    v-model="selectedRxMode"
                                    @change="onRxModeChange"
                                >
                                    <option v-for="mode in rxModeOptions" :key="mode.value" :value="mode.value">
                                        {{ mode.label }}
                                    </option>
                                </select>
                                <span v-html="$t('configurationReceiverMode')"></span>
                            </div>

                            <!-- Serial RX Box -->
                            <div class="serialRXBox spacer_box" v-if="showSerialRxBox">
                                <div class="note">
                                    <p v-html="$t('configurationSerialRXHelp')"></p>
                                </div>
                                <select class="serialRX" v-model.number="rxConfig.serialrx_provider">
                                    <option
                                        v-for="(rxType, idx) in serialRxTypes"
                                        :key="idx"
                                        :value="idx"
                                        :disabled="!rxType.enabled"
                                    >
                                        {{ rxType.name }}
                                    </option>
                                </select>
                                <span v-html="$t('configurationSerialRX')"></span>
                                <div class="note someRXTypesDisabled" v-if="showSomeRxTypesDisabled">
                                    {{ $t("someRXTypesDisabled") }}
                                </div>
                                <div class="note gui_warning serialRXNotSupported" v-if="showSerialRxNotSupported">
                                    {{ $t("serialRXNotSupported") }}
                                </div>
                            </div>

                            <!-- SPI RX Box -->
                            <div class="spiRxBox spacer_box" v-if="showSpiRxBox">
                                <div class="note">
                                    <p v-html="$t('configurationSpiRxHelp')"></p>
                                </div>
                                <select class="spiRx" v-model.number="rxConfig.rxSpiProtocol">
                                    <option v-for="(rxType, idx) in spiRxTypes" :key="idx" :value="idx">
                                        {{ rxType }}
                                    </option>
                                </select>
                                <span v-html="$t('configurationSpiRX')"></span>
                            </div>

                            <!-- ELRS Container -->
                            <div id="elrsContainer" class="elrsContainer spacer_box" v-if="showElrsContainer">
                                <div class="number">
                                    <input type="text" class="elrsBindingPhrase" v-model="elrsBindingPhrase" />
                                    <span v-html="$t('receiverButtonBindingPhrase')"></span>
                                </div>
                                <div>
                                    <span class="elrsUid">{{ elrsUidDisplay }}</span>
                                </div>
                                <div class="number" v-if="showElrsModelId">
                                    <input
                                        type="number"
                                        name="elrsModelId-number"
                                        min="0"
                                        max="255"
                                        v-model.number="rxConfig.elrsModelId"
                                    />
                                    <span v-html="$t('receiverModelId')"></span>
                                    <div class="helpicon cf_tip" :title="$t('receiverHelpModelId')"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid-box col6">
                        <!-- Telemetry -->
                        <div class="gui_box grey col-span-3">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('configurationTelemetry')"></div>
                                <div class="helpicon cf_tip" :title="$t('configurationTelemetryHelp')"></div>
                            </div>
                            <div class="spacer_box">
                                <table>
                                    <tbody class="features telemetry">
                                        <tr>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    class="toggle feature"
                                                    name="TELEMETRY"
                                                    :checked="isTelemetryEnabled"
                                                    @change="toggleTelemetry"
                                                />
                                            </td>
                                            <td>{{ $t("featureTELEMETRY") }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- RSSI -->
                        <div class="gui_box grey col-span-3">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('configurationRSSI')"></div>
                                <div class="helpicon cf_tip" :title="$t('configurationRSSIHelp')"></div>
                            </div>
                            <div class="spacer_box">
                                <table>
                                    <tbody class="features rssi">
                                        <tr>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    class="toggle feature"
                                                    name="RSSI_ADC"
                                                    :checked="isRssiAdcEnabled"
                                                    @change="toggleRssiAdc"
                                                />
                                            </td>
                                            <td>{{ $t("featureRSSI_ADC") }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- RSSI Channel -->
                        <div class="gui_box grey col-span-3">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverRssiChannel')"></div>
                            </div>
                            <select name="rssi_channel" v-model.number="rssiConfig.channel">
                                <option value="0">{{ $t("receiverRssiChannelDisabledOption") }}</option>
                                <option v-for="i in rssiChannelOptions" :key="i" :value="i">
                                    {{ $t(`controlAxisAux${i - 4}`) }}
                                </option>
                            </select>
                        </div>

                        <!-- Channel Map -->
                        <div class="gui_box grey col-span-3">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverChannelMap')"></div>
                            </div>
                            <div class="hybrid_element">
                                <input
                                    type="text"
                                    name="rcmap"
                                    spellcheck="false"
                                    v-model="channelMapString"
                                    @input="onChannelMapInput"
                                    @focusout="validateChannelMap"
                                />
                                <select class="hybrid_helper" name="rcmap_helper" @change="applyChannelMapPreset">
                                    <option value="">{{ $t("receiverChannelDefaultOption") }}</option>
                                    <option value="AETR1234">FrSky / Futaba / Hitec (AETR1234)</option>
                                    <option value="TAER1234">Spektrum / Graupner / JR (TAER1234)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Stick settings -->
                        <div class="gui_box grey col-span-2 sticks">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverStickMin')"></div>
                            </div>
                            <div class="input-helpicon-flex">
                                <input
                                    type="number"
                                    name="stick_min"
                                    min="1000"
                                    max="1200"
                                    v-model.number="rxConfig.stick_min"
                                />
                                <div class="helpicon cf_tip" :title="$t('receiverHelpStickMin')"></div>
                            </div>
                        </div>
                        <div class="gui_box grey col-span-2 sticks">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverStickCenter')"></div>
                            </div>
                            <div class="input-helpicon-flex">
                                <input
                                    type="number"
                                    name="stick_center"
                                    min="1401"
                                    max="1599"
                                    v-model.number="rxConfig.stick_center"
                                />
                                <div class="helpicon cf_tip" :title="$t('receiverHelpStickCenter')"></div>
                            </div>
                        </div>
                        <div class="gui_box grey col-span-2 sticks">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverStickMax')"></div>
                            </div>
                            <div class="input-helpicon-flex">
                                <input
                                    type="number"
                                    name="stick_max"
                                    min="1800"
                                    max="2000"
                                    v-model.number="rxConfig.stick_max"
                                />
                                <div class="helpicon cf_tip" :title="$t('receiverHelpStickMax')"></div>
                            </div>
                        </div>

                        <!-- Deadband settings -->
                        <div class="gui_box grey col-span-2 deadband">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverDeadband')"></div>
                            </div>
                            <div class="input-helpicon-flex">
                                <input
                                    type="number"
                                    name="deadband"
                                    min="0"
                                    max="32"
                                    v-model.number="rcDeadbandConfig.deadband"
                                />
                                <div class="helpicon cf_tip" :title="$t('receiverHelpDeadband')"></div>
                            </div>
                        </div>
                        <div class="gui_box grey col-span-2 deadband">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('receiverYawDeadband')"></div>
                            </div>
                            <div class="input-helpicon-flex">
                                <input
                                    type="number"
                                    name="yaw_deadband"
                                    min="0"
                                    max="100"
                                    v-model.number="rcDeadbandConfig.yaw_deadband"
                                />
                                <div class="helpicon cf_tip" :title="$t('receiverHelpYawDeadband')"></div>
                            </div>
                        </div>
                        <div class="gui_box grey col-span-2 deadband">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title" v-html="$t('recevier3dDeadbandThrottle')"></div>
                            </div>
                            <div class="input-helpicon-flex">
                                <input
                                    type="number"
                                    name="3ddeadbandthrottle"
                                    min="0"
                                    max="100"
                                    v-model.number="rcDeadbandConfig.deadband3d_throttle"
                                />
                                <div class="helpicon cf_tip" :title="$t('receiverHelp3dDeadbandThrottle')"></div>
                            </div>
                        </div>
                    </div>

                    <!-- RC Smoothing -->
                    <div class="gui_box grey tunings topspacer rcSmoothing">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('receiverRcSmoothing')"></div>
                        </div>
                        <table class="rcSmoothing-table">
                            <tbody>
                                <tr class="rc-smoothing-type">
                                    <td>
                                        <select name="rcSmoothing-select" v-model.number="rxConfig.rcSmoothing">
                                            <option value="0">{{ $t("off") }}</option>
                                            <option value="1">{{ $t("on") }}</option>
                                        </select>
                                    </td>
                                    <td colspan="2">
                                        <label>
                                            <span v-html="$t('receiverRcSmoothing')"></span>
                                        </label>
                                    </td>
                                </tr>
                                <template v-if="rxConfig.rcSmoothing === 1">
                                    <!-- Setpoint Manual/Auto -->
                                    <tr class="rcSmoothing-setpoint-manual">
                                        <td>
                                            <select
                                                name="rcSmoothing-setpoint-manual-select"
                                                v-model="setpointManualMode"
                                            >
                                                <option value="0">{{ $t("receiverRcSmoothingAuto") }}</option>
                                                <option value="1">{{ $t("receiverRcSmoothingManual") }}</option>
                                            </select>
                                        </td>
                                        <td>
                                            <label>
                                                <span v-html="$t('receiverRcSetpointTypeSelect')"></span>
                                            </label>
                                        </td>
                                        <td>
                                            <div
                                                class="helpicon cf_tip"
                                                :title="$t('receiverRcSmoothingSetpointManual')"
                                            ></div>
                                        </td>
                                    </tr>
                                    <tr class="rcSmoothing-setpoint-manual" v-if="setpointManualMode === '1'">
                                        <td class="rcSmoothing-setpoint-cutoff">
                                            <input
                                                type="number"
                                                name="rcSmoothingSetpointHz-number"
                                                step="1"
                                                min="0"
                                                max="255"
                                                v-model.number="rxConfig.rcSmoothingSetpointCutoff"
                                            />
                                        </td>
                                        <td class="rcSmoothing-setpoint-cutoff" colspan="2">
                                            <label>
                                                <span v-html="$t('receiverRcSmoothingSetpointHz')"></span>
                                            </label>
                                            <div
                                                class="helpicon cf_tip"
                                                :title="$t('rcSmoothingSetpointCutoffHelp')"
                                            ></div>
                                        </td>
                                    </tr>

                                    <!-- Auto Factor -->
                                    <tr class="rcSmoothing-auto-factor" v-if="showAutoFactor">
                                        <td>
                                            <input
                                                type="number"
                                                name="rcSmoothingAutoFactor-number"
                                                step="1"
                                                min="0"
                                                max="250"
                                                v-model.number="rxConfig.rcSmoothingAutoFactor"
                                            />
                                        </td>
                                        <td>
                                            <label>
                                                <span v-html="$t('receiverRcSmoothingAutoFactor')"></span>
                                            </label>
                                        </td>
                                        <td>
                                            <div
                                                class="helpicon cf_tip receiverRcSmoothingAutoFactorHelp"
                                                :title="$t('receiverRcSmoothingAutoFactorHelp2')"
                                            ></div>
                                        </td>
                                    </tr>

                                    <!-- Throttle Manual/Auto (API >= 1.47) -->
                                    <template v-if="showThrottleSmoothingOptions">
                                        <tr class="rcSmoothing-throttle-manual">
                                            <td>
                                                <select
                                                    name="rcSmoothing-throttle-manual-select"
                                                    v-model="throttleManualMode"
                                                >
                                                    <option value="0">{{ $t("receiverRcSmoothingAuto") }}</option>
                                                    <option value="1">{{ $t("receiverRcSmoothingManual") }}</option>
                                                </select>
                                            </td>
                                            <td>
                                                <label>
                                                    <span v-html="$t('receiverThrottleTypeSelect')"></span>
                                                </label>
                                            </td>
                                            <td>
                                                <div
                                                    class="helpicon cf_tip"
                                                    :title="$t('receiverRcSmoothingThrottleManual')"
                                                ></div>
                                            </td>
                                        </tr>
                                        <tr class="rcSmoothing-throttle-manual" v-if="throttleManualMode === '1'">
                                            <td class="rcSmoothing-throttle-cutoff">
                                                <input
                                                    type="number"
                                                    name="rcSmoothingThrottleCutoffHz-number"
                                                    step="1"
                                                    min="0"
                                                    max="255"
                                                    v-model.number="rxConfig.rcSmoothingThrottleCutoff"
                                                />
                                            </td>
                                            <td class="rcSmoothing-throttle-cutoff" colspan="2">
                                                <label>
                                                    <span v-html="$t('receiverRcSmoothingThrottleCutoffHz')"></span>
                                                </label>
                                                <div
                                                    class="helpicon cf_tip"
                                                    :title="$t('rcSmoothingThrottleCutoffHelp')"
                                                ></div>
                                            </td>
                                        </tr>
                                        <tr class="rcSmoothing-auto-factor-throttle" v-if="showThrottleAutoFactor">
                                            <td>
                                                <input
                                                    type="number"
                                                    name="rcSmoothingAutoFactorThrottle-number"
                                                    step="1"
                                                    min="0"
                                                    max="250"
                                                    v-model.number="rxConfig.rcSmoothingAutoFactorThrottle"
                                                />
                                            </td>
                                            <td>
                                                <label>
                                                    <span v-html="$t('receiverRcSmoothingAutoFactorThrottle')"></span>
                                                </label>
                                            </td>
                                            <td>
                                                <div
                                                    class="helpicon cf_tip receiverRcSmoothingAutoFactorThrottleHelp"
                                                    :title="$t('receiverRcSmoothingAutoFactorThrottleHelp')"
                                                ></div>
                                            </td>
                                        </tr>
                                    </template>

                                    <!-- Feedforward (API < 1.47) -->
                                    <template v-else>
                                        <tr class="rcSmoothing-feedforward-manual">
                                            <td>
                                                <select
                                                    name="rcSmoothing-feedforward-select"
                                                    v-model="feedforwardManualMode"
                                                >
                                                    <option value="0">{{ $t("receiverRcSmoothingAuto") }}</option>
                                                    <option value="1">{{ $t("receiverRcSmoothingManual") }}</option>
                                                </select>
                                            </td>
                                            <td>
                                                <label>
                                                    <span v-html="$t('receiverRcFeedforwardTypeSelect')"></span>
                                                </label>
                                            </td>
                                            <td>
                                                <div
                                                    class="helpicon cf_tip"
                                                    :title="$t('receiverRcSmoothingFeedforwardManual')"
                                                ></div>
                                            </td>
                                        </tr>
                                        <tr class="rcSmoothing-feedforward-manual" v-if="feedforwardManualMode === '1'">
                                            <td class="rcSmoothing-feedforward-cutoff">
                                                <input
                                                    type="number"
                                                    name="rcSmoothingFeedforwardCutoff-number"
                                                    step="1"
                                                    min="1"
                                                    max="255"
                                                    v-model.number="rxConfig.rcSmoothingFeedforwardCutoff"
                                                />
                                            </td>
                                            <td colspan="2" class="rcSmoothing-feedforward-cutoff">
                                                <label>
                                                    <span v-html="$t('receiverRcSmoothingFeedforwardCutoff')"></span>
                                                </label>
                                                <div
                                                    class="helpicon cf_tip"
                                                    :title="$t('rcSmoothingFeedforwardCutoffHelp')"
                                                ></div>
                                            </td>
                                        </tr>
                                    </template>
                                </template>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- RC Plot -->
            <div class="gui_box grey">
                <div class="spacer">
                    <div class="wrapper graphAndLabel">
                        <svg id="RX_plot" class="col-span-5" ref="rxPlot">
                            <g class="axis x" transform="translate(40, 188)"></g>
                            <g class="axis y" transform="translate(40, 10)"></g>
                            <g class="grid x" transform="translate(40, 188)"></g>
                            <g class="grid y" transform="translate(40, 10)"></g>
                            <g class="data" transform="translate(40, 10)"></g>
                        </svg>

                        <div class="plot_control">
                            <div class="table">
                                <div class="sensor row">
                                    <div class="left-cell receiver-button">
                                        <a class="reset_rate" href="#" @click.prevent="resetRefreshRate">
                                            {{ $t("receiverResetRefreshRate") }}
                                        </a>
                                    </div>
                                    <div class="right-cell">
                                        <select
                                            name="rx_refresh_rate"
                                            v-model.number="refreshRate"
                                            :title="$t('receiverRefreshRateTitle')"
                                        >
                                            <option value="10">10 ms</option>
                                            <option value="20">20 ms</option>
                                            <option value="30">30 ms</option>
                                            <option value="40">40 ms</option>
                                            <option value="50">50 ms</option>
                                            <option value="100">100 ms</option>
                                            <option value="250">250 ms</option>
                                            <option value="500">500 ms</option>
                                            <option value="1000">1000 ms</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="row-container">
                                    <div class="row" v-for="(label, index) in plotLabels" :key="index">
                                        <div class="left-cell">
                                            <ul>
                                                <li class="name">{{ label.name }}</li>
                                            </ul>
                                        </div>
                                        <div :class="`ch${index + 1} value right-cell`">
                                            {{ label.value }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="clear-both"></div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom" style="position: fixed">
            <div class="btn sticks_btn" v-if="showSticksButton">
                <a class="sticks" href="#" @click.prevent="openSticksWindow">
                    {{ $t("receiverButtonSticks") }}
                </a>
            </div>
            <div class="btn bind_btn" v-if="showBindButton">
                <a class="bind" href="#" @click.prevent="sendBind">
                    {{ $t("receiverButtonBind") }}
                </a>
            </div>
            <div class="btn refresh_btn">
                <a class="refresh" href="#" @click.prevent="refreshTab">
                    {{ $t("receiverButtonRefresh") }}
                </a>
            </div>
            <div class="btn update_btn" v-if="!needReboot">
                <a class="update" href="#" @click.prevent="saveConfig(false)">
                    {{ $t("receiverButtonSave") }}
                </a>
            </div>
            <div class="btn save_btn" v-else>
                <a class="save" href="#" @click.prevent="saveConfig(true)">
                    {{ $t("configurationButtonSave") }}
                </a>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useNavigationStore } from "@/stores/navigation";
import { useReboot } from "@/composables/useReboot";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { i18n } from "@/js/localization";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import GUI from "@/js/gui";
import FC from "@/js/fc";
import Model from "@/js/model";
import RateCurve from "@/js/RateCurve";
import { degToRad } from "@/js/utils/common";
import { bit_check, bit_set, bit_clear } from "@/js/bit";
import { get as getConfig, set as setConfig } from "@/js/ConfigStorage";
import { updateTabList } from "@/js/utils/updateTabList";
import { gui_log } from "@/js/gui_log";
import DarkTheme from "@/js/DarkTheme";
import windowWatcherUtil from "@/js/utils/window_watchers";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";
import CryptoES from "crypto-es";
import semver from "semver";
import * as THREE from "three";
import * as d3 from "d3";
import $ from "jquery";

const t = (key) => i18n.getMessage(key);
const fcStore = useFlightControllerStore();
const navigationStore = useNavigationStore();
const { reboot } = useReboot();

// Template refs
const modelPreviewContainer = ref(null);
const modelCanvas = ref(null);
const rxPlot = ref(null);

// Local state
const needReboot = ref(false);
const isSaving = ref(false);
const refreshRate = ref(50);
const channelMapString = ref("");
const elrsBindingPhrase = ref("");
const setpointManualMode = ref("0");
const throttleManualMode = ref("0");
const feedforwardManualMode = ref("0");
const selectedRxMode = ref(0);

// Model preview state
let model = null;
let rateCurve = null;
let currentRates = null;
let clock = null;
let keepRendering = true;
let animationFrameId = null;

// D3 chart state
let rxPlotData = [];
let samples = 0;

// Meter scale for channel bars
const meterScale = { min: 800, max: 2200 };

// RC Map letters
const rcMapLetters = ["A", "E", "R", "T", "1", "2", "3", "4"];

// SPI RX Types
const spiRxTypes = [
    "NRF24_V202_250K",
    "NRF24_V202_1M",
    "NRF24_SYMA_X",
    "NRF24_SYMA_X5C",
    "NRF24_CX10",
    "CX10A",
    "NRF24_H8_3D",
    "NRF24_INAV",
    "FRSKY_D",
    "FRSKY_X",
    "A7105_FLYSKY",
    "A7105_FLYSKY_2A",
    "NRF24_KN",
    "SFHSS",
    "SPEKTRUM",
    "FRSKY_X_LBT",
    "REDPINE",
    "FRSKY_X_V2",
    "FRSKY_X_LBT_V2",
    "EXPRESSLRS",
];

// Computed store access
const rc = computed(() => fcStore.rc);
const rxConfig = computed(() => fcStore.rxConfig);
const rssiConfig = computed(() => fcStore.rssiConfig);
const features = computed(() => fcStore.features);

// Need to access FC directly for some missing store properties
const rcDeadbandConfig = computed(() => FC.RC_DEADBAND_CONFIG);
const rcMap = computed(() => FC.RC_MAP);

// Decode HTML entities in translations (some use &lt; etc)
function decodeHtmlEntities(text) {
    if (!text) return text;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}

// RX Mode options (generated from features)
const rxModeOptions = computed(() => {
    const options = [{ value: -1, label: decodeHtmlEntities(t("featureNone")) }];
    if (features.value?.features?._features) {
        // Features with mode === "select" are RX mode options
        for (const feature of features.value.features._features) {
            if (feature.mode === "select" && feature.group === "rxMode") {
                options.push({
                    value: feature.bit,
                    label: decodeHtmlEntities(t(`feature${feature.name}`)) || feature.name,
                });
            }
        }
    }
    return options;
});

// Serial RX types with enabled status
const serialRxTypes = computed(() => {
    const types = FC.getSerialRxTypes ? FC.getSerialRxTypes() : [];
    const supported = FC.getSupportedSerialRxTypes ? FC.getSupportedSerialRxTypes() : types;
    return types.map((name) => ({
        name,
        enabled: supported.includes(name),
    }));
});

const showSomeRxTypesDisabled = computed(() => {
    const types = serialRxTypes.value;
    const selected = rxConfig.value?.serialrx_provider;
    const selectedType = types[selected];
    const allEnabled = types.every((t) => t.enabled);
    return selectedType?.enabled && !allEnabled;
});

const showSerialRxNotSupported = computed(() => {
    const types = serialRxTypes.value;
    const selected = rxConfig.value?.serialrx_provider;
    return types[selected] && !types[selected].enabled;
});

// Feature checks
const isRxSerialEnabled = () => features.value?.features?.isEnabled?.("RX_SERIAL") ?? false;
const isRxSpiEnabled = () => features.value?.features?.isEnabled?.("RX_SPI") ?? false;
const isRxMspEnabled = () => features.value?.features?.isEnabled?.("RX_MSP") ?? false;
const isTelemetryEnabled = computed(() => features.value?.features?.isEnabled?.("TELEMETRY") ?? false);
const isRssiAdcEnabled = computed(() => features.value?.features?.isEnabled?.("RSSI_ADC") ?? false);

const showSerialRxBox = computed(() => isRxSerialEnabled());
const showSpiRxBox = computed(() => isRxSpiEnabled());
const showSticksButton = computed(() => isRxMspEnabled());

const elrsBindingPhraseEnabled = computed(() => {
    return (
        isRxSpiEnabled() &&
        rxConfig.value?.rxSpiProtocol === 19 &&
        semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)
    );
});

const showElrsContainer = computed(() => elrsBindingPhraseEnabled.value);
const showElrsModelId = computed(
    () => elrsBindingPhraseEnabled.value && semver.gte(fcStore.config.apiVersion, API_VERSION_1_47),
);

const showThrottleSmoothingOptions = computed(() => semver.gte(fcStore.config.apiVersion, API_VERSION_1_47));

const showAutoFactor = computed(
    () =>
        setpointManualMode.value === "0" ||
        (feedforwardManualMode.value === "0" && !showThrottleSmoothingOptions.value),
);

const showThrottleAutoFactor = computed(() => throttleManualMode.value === "0");

const showBindButton = computed(() => {
    return bit_check(fcStore.config?.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS?.SUPPORTS_RX_BIND);
});

// ELRS UID display
const elrsUidDisplay = computed(() => {
    if (elrsBindingPhrase.value) {
        const bytes = elrsBindingPhraseToBytes(elrsBindingPhrase.value);
        return bytes.join(",");
    }
    return rxConfig.value?.elrsUid?.join(",") || "0,0,0,0,0,0";
});

// RSSI Channel options (5 to active_channels)
const rssiChannelOptions = computed(() => {
    const options = [];
    const channels = rc.value?.active_channels || 8;
    for (let i = 5; i <= channels; i++) {
        options.push(i);
    }
    return options;
});

// Channel bars data
const channelBars = computed(() => {
    const bars = [];
    const barNames = [t("controlAxisRoll"), t("controlAxisPitch"), t("controlAxisYaw"), t("controlAxisThrottle")];
    const channels = rc.value?.channels || [];
    const activeChannels = rc.value?.active_channels || 8;
    const numBars = activeChannels > 0 ? activeChannels : 8;

    let auxIndex = 1;
    for (let i = 0; i < numBars; i++) {
        let name;
        if (i < barNames.length) {
            name = barNames[i];
        } else {
            name = t(`controlAxisAux${auxIndex++}`);
        }
        const value = channels[i] || 1500;
        const width = Math.max(0, Math.min(100, ((value - meterScale.min) / (meterScale.max - meterScale.min)) * 100));
        bars.push({ name, value, width });
    }
    return bars;
});

// Plot labels for first 4 channels
const plotLabels = computed(() => {
    const labels = [
        { name: t("receiverRowContainerRoll"), value: 0 },
        { name: t("receiverRowContainerPitch"), value: 0 },
        { name: t("receiverRowContainerYaw"), value: 0 },
        { name: t("receiverRowContainerThrottle"), value: 0 },
    ];
    const channels = rc.value?.channels || [];
    for (let i = 0; i < 4 && i < channels.length; i++) {
        labels[i].value = channels[i] || 0;
    }
    return labels;
});

// ELRS Binding Phrase helpers
function elrsBindingPhraseToBytes(text) {
    let uidBytes = [0, 0, 0, 0, 0, 0];
    if (text) {
        const bindingPhraseFull = `-DMY_BINDING_PHRASE="${text}"`;
        const hash = CryptoES.MD5(bindingPhraseFull).toString();
        const bytes = hash.match(/.{1,2}/g).map((byte) => parseInt(byte, 16));
        const view = new DataView(new ArrayBuffer(6));
        for (let i = 0; i < 6; i++) {
            view.setUint8(i, bytes[i]);
        }
        uidBytes = Array.from(new Uint8Array(view.buffer));
    }
    return uidBytes;
}

function lookupElrsBindingPhrase(uidString) {
    const bindingPhraseMap = getConfig("binding_phrase_map")?.binding_phrase_map ?? {};
    return bindingPhraseMap[uidString] ?? "";
}

function saveElrsBindingPhrase(uidString, bindingPhrase) {
    const bindingPhraseMap = getConfig("binding_phrase_map")?.binding_phrase_map ?? {};
    bindingPhraseMap[uidString] = bindingPhrase;
    setConfig({ binding_phrase_map: { binding_phrase_map: bindingPhraseMap } });
}

// Channel map helpers
function onChannelMapInput(event) {
    let val = event.target.value.toUpperCase();
    if (val.length > 8) {
        val = val.substring(0, 8);
        channelMapString.value = val;
    } else {
        channelMapString.value = val;
    }
}

function validateChannelMap() {
    const val = channelMapString.value;
    if (val.length !== 8) {
        // Reset to current RC_MAP
        updateChannelMapFromRcMap();
        return;
    }
    const chars = val.split("");
    const seen = new Set();
    for (const char of chars) {
        if (!rcMapLetters.includes(char) || seen.has(char)) {
            updateChannelMapFromRcMap();
            return;
        }
        seen.add(char);
    }
    // Valid - update RC_MAP
    for (let i = 0; i < FC.RC_MAP.length; i++) {
        FC.RC_MAP[i] = chars.indexOf(rcMapLetters[i]);
    }
}

function updateChannelMapFromRcMap() {
    const strBuffer = [];
    for (let i = 0; i < FC.RC_MAP.length; i++) {
        strBuffer[FC.RC_MAP[i]] = rcMapLetters[i];
    }
    channelMapString.value = strBuffer.join("");
}

function applyChannelMapPreset(event) {
    const val = event.target.value;
    if (val) {
        channelMapString.value = val;
        validateChannelMap();
    }
}

// Feature toggles
function toggleTelemetry(event) {
    if (features.value?.features?.updateData) {
        features.value.features.updateData({ name: "TELEMETRY", checked: event.target.checked });
        updateTabList(features.value.features);
        needReboot.value = true;
    }
}

function toggleRssiAdc(event) {
    if (features.value?.features?.updateData) {
        features.value.features.updateData({ name: "RSSI_ADC", checked: event.target.checked });
        needReboot.value = true;
    }
}

function onRxModeChange() {
    // Update feature mask based on selected RX mode
    if (features.value?.features?._features) {
        const selectedBit = selectedRxMode.value;
        // Clear all RX mode bits first, then set the selected one
        for (const feature of features.value.features._features) {
            if (feature.mode === "select" && feature.group === "rxMode") {
                features.value.features._featureMask = bit_clear(features.value.features._featureMask, feature.bit);
            }
        }
        // Set the selected RX mode bit (if not "None" which is -1)
        if (selectedBit !== -1) {
            features.value.features._featureMask = bit_set(features.value.features._featureMask, selectedBit);
        }
        updateTabList(features.value.features);
        needReboot.value = true;
    }
}

// Actions
function resetRefreshRate() {
    refreshRate.value = 50;
}

function sendBind() {
    MSP.send_message(MSPCodes.MSP2_BETAFLIGHT_BIND);
    gui_log(t("receiverButtonBindMessage"));
}

function openSticksWindow() {
    const windowWidth = 370;
    const windowHeight = 550;

    const rxFunction = (channels) => {
        if (CONFIGURATOR.connectionValid && GUI.active_tab !== "cli") {
            mspHelper.setRawRx(channels);
            return true;
        }
        return false;
    };

    const createdWindow = window.open(
        "/receiver_msp/receiver_msp.html",
        "receiver_msp",
        `location=no,width=${windowWidth},height=${windowHeight + (window.screen.height - window.screen.availHeight)}`,
    );
    if (createdWindow) {
        createdWindow.setRawRx = rxFunction;
        DarkTheme.isDarkThemeEnabled((isEnabled) => {
            windowWatcherUtil.passValue(createdWindow, "darkTheme", isEnabled);
        });
    }
}

async function refreshTab() {
    await loadConfig();
    gui_log(t("receiverDataRefreshed"));
}

// Load configuration
async function loadConfig() {
    try {
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC);
        await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC_TUNING);
        await MSP.promise(MSPCodes.MSP_RX_MAP);
        await MSP.promise(MSPCodes.MSP_RC_DEADBAND);
        await MSP.promise(MSPCodes.MSP_RX_CONFIG);
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);

        // Update local state from FC
        updateChannelMapFromRcMap();

        // Initialize selectedRxMode from feature mask
        if (features.value?.features?._features) {
            const featureMask = features.value.features._featureMask;
            let foundRxMode = -1;
            for (const feature of features.value.features._features) {
                if (feature.mode === "select" && feature.group === "rxMode") {
                    if (bit_check(featureMask, feature.bit)) {
                        foundRxMode = feature.bit;
                        break;
                    }
                }
            }
            selectedRxMode.value = foundRxMode;
        }

        // Load ELRS binding phrase if applicable
        if (elrsBindingPhraseEnabled.value && rxConfig.value?.elrsUid) {
            const uidString = rxConfig.value.elrsUid.join(",");
            const storedPhrase = lookupElrsBindingPhrase(uidString);
            if (storedPhrase) {
                elrsBindingPhrase.value = storedPhrase;
            }
        }

        // Set RC smoothing modes based on cutoff values
        setpointManualMode.value = rxConfig.value?.rcSmoothingSetpointCutoff === 0 ? "0" : "1";
        if (showThrottleSmoothingOptions.value) {
            throttleManualMode.value = rxConfig.value?.rcSmoothingThrottleCutoff === 0 ? "0" : "1";
        } else {
            feedforwardManualMode.value = rxConfig.value?.rcSmoothingFeedforwardCutoff === 0 ? "0" : "1";
        }

        // Load saved refresh rate
        const savedRate = getConfig("rx_refresh_rate");
        if (savedRate?.rx_refresh_rate) {
            refreshRate.value = savedRate.rx_refresh_rate;
        }
    } catch (e) {
        console.error("Failed to load Receiver configuration", e);
    }
}

// Save configuration
async function saveConfig(withReboot = false) {
    if (isSaving.value) return;
    isSaving.value = true;

    try {
        // Update RC_MAP from channel map string
        validateChannelMap();

        // Handle ELRS binding phrase
        if (elrsBindingPhraseEnabled.value) {
            const elrsUidChars = elrsBindingPhraseToBytes(elrsBindingPhrase.value);
            if (elrsUidChars.length === 6) {
                FC.RX_CONFIG.elrsUid = elrsUidChars;
                saveElrsBindingPhrase(elrsUidChars.join(","), elrsBindingPhrase.value);
            } else {
                FC.RX_CONFIG.elrsUid = [0, 0, 0, 0, 0, 0];
            }
        }

        // Set cutoffs to 0 for auto mode
        if (setpointManualMode.value === "0") {
            FC.RX_CONFIG.rcSmoothingSetpointCutoff = 0;
        }
        if (showThrottleSmoothingOptions.value && throttleManualMode.value === "0") {
            FC.RX_CONFIG.rcSmoothingThrottleCutoff = 0;
        }
        if (!showThrottleSmoothingOptions.value && feedforwardManualMode.value === "0") {
            FC.RX_CONFIG.rcSmoothingFeedforwardCutoff = 0;
        }

        // Save sequence
        await MSP.promise(MSPCodes.MSP_SET_RX_MAP, mspHelper.crunch(MSPCodes.MSP_SET_RX_MAP));
        await MSP.promise(MSPCodes.MSP_SET_RSSI_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RSSI_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND));
        await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));

        if (withReboot) {
            await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));
            await new Promise((resolve) => {
                mspHelper.writeConfiguration(true, () => {
                    navigationStore.cleanup(() => {
                        reboot();
                        resolve();
                    });
                });
            });
        } else {
            await new Promise((resolve) => {
                mspHelper.writeConfiguration(false, resolve);
            });
            gui_log(t("receiverConfigSaved") || "Configuration saved");
        }

        needReboot.value = false;
    } catch (e) {
        console.error("Failed to save configuration", e);
    } finally {
        isSaving.value = false;
    }
}

// Model preview
function initModelPreview() {
    if (!modelPreviewContainer.value || !modelCanvas.value) return;
    // Model constructor expects jQuery-wrapped elements
    model = new Model($(modelPreviewContainer.value), $(modelCanvas.value));
    rateCurve = new RateCurve(false);
    currentRates = rateCurve.getCurrentRates();
    window.addEventListener("resize", handleModelResize);
}

function handleModelResize() {
    if (model?.resize) {
        model.resize();
    }
}

function renderModel() {
    if (!keepRendering) return;
    animationFrameId = requestAnimationFrame(renderModel);

    if (!clock) {
        clock = new THREE.Clock();
    }

    const channels = rc.value?.channels;
    if (channels?.[0] && channels?.[1] && channels?.[2] && model && rateCurve && currentRates) {
        const delta = clock.getDelta();

        const roll =
            delta *
            rateCurve.rcCommandRawToDegreesPerSecond(
                channels[0],
                currentRates.roll_rate,
                currentRates.rc_rate,
                currentRates.rc_expo,
                currentRates.superexpo,
                currentRates.deadband,
                currentRates.roll_rate_limit,
            );
        const pitch =
            delta *
            rateCurve.rcCommandRawToDegreesPerSecond(
                channels[1],
                currentRates.pitch_rate,
                currentRates.rc_rate_pitch,
                currentRates.rc_pitch_expo,
                currentRates.superexpo,
                currentRates.deadband,
                currentRates.pitch_rate_limit,
            );
        const yaw =
            delta *
            rateCurve.rcCommandRawToDegreesPerSecond(
                channels[2],
                currentRates.yaw_rate,
                currentRates.rc_rate_yaw,
                currentRates.rc_yaw_expo,
                currentRates.superexpo,
                currentRates.yawDeadband,
                currentRates.yaw_rate_limit,
            );

        model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));
    }
}

// D3 Chart setup
function setupRxPlot() {
    const activeChannels = rc.value?.active_channels || 8;
    rxPlotData = new Array(activeChannels);
    for (let i = 0; i < rxPlotData.length; i++) {
        rxPlotData[i] = [];
    }
    samples = 0;
}

function updateRxPlot() {
    const svg = d3.select(rxPlot.value);
    if (!svg.node()) return;

    const channels = rc.value?.channels || [];
    const activeChannels = rc.value?.active_channels || 0;

    if (activeChannels > 0) {
        // Push latest data
        for (let i = 0; i < activeChannels && i < rxPlotData.length; i++) {
            rxPlotData[i].push([samples, channels[i] || 1500]);
        }

        // Remove old data
        while (rxPlotData[0]?.length > 300) {
            for (let i = 0; i < rxPlotData.length; i++) {
                rxPlotData[i].shift();
            }
        }
    }

    const plotElement = rxPlot.value;
    if (!plotElement) return;

    const margin = { top: 20, right: 0, bottom: 10, left: 40 };
    const width = plotElement.clientWidth - margin.left - margin.right;
    const height = plotElement.clientHeight - margin.top - margin.bottom;

    const widthScale = d3
        .scaleLinear()
        .domain([samples - 299, samples])
        .range([0, width]);
    const heightScale = d3.scaleLinear().domain([800, 2200]).range([height, 0]);

    const xGrid = d3.axisBottom().scale(widthScale).tickSize(-height).tickFormat("");
    const yGrid = d3.axisLeft().scale(heightScale).tickSize(-width).tickFormat("");
    const xAxis = d3.axisBottom().scale(widthScale);
    const yAxis = d3.axisLeft().scale(heightScale);

    const line = d3
        .line()
        .x((d) => widthScale(d[0]))
        .y((d) => heightScale(d[1]));

    svg.select(".x.grid").call(xGrid);
    svg.select(".y.grid").call(yGrid);
    svg.select(".x.axis").call(xAxis);
    svg.select(".y.axis").call(yAxis);

    const data = svg.select("g.data");
    const lines = data.selectAll("path").data(rxPlotData);
    lines.enter().append("path").attr("class", "line");
    lines.attr("d", line);
    lines.exit().remove();

    samples++;
}

// RC Data polling
function getRcData() {
    MSP.send_message(MSPCodes.MSP_RC, false, false, updateRxPlot);
}

// Watch refresh rate changes
watch(refreshRate, (newRate) => {
    setConfig({ rx_refresh_rate: newRate });
    GUI.interval_remove("receiver_pull");
    GUI.interval_add("receiver_pull", getRcData, newRate, true);
});

// Lifecycle
onMounted(async () => {
    // Reset rendering flag on mount
    keepRendering = true;

    await loadConfig();
    await nextTick();

    // Initialize model preview
    initModelPreview();
    renderModel();

    // Start model preview polling
    GUI.interval_add(
        "receiver_pull_for_model_preview",
        () => {
            MSP.send_message(MSPCodes.MSP_RC, false, false);
        },
        33,
        false,
    );

    // Setup and start RC plot
    setupRxPlot();
    GUI.interval_add("receiver_pull", getRcData, refreshRate.value, true);

    GUI.content_ready();
});

onUnmounted(() => {
    keepRendering = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    window.removeEventListener("resize", handleModelResize);
    if (model?.dispose) {
        model.dispose();
    }
    GUI.interval_remove("receiver_pull");
    GUI.interval_remove("receiver_pull_for_model_preview");
});
</script>

<style lang="less" scoped>
.content_wrapper {
    padding-bottom: 60px;
}

.bars {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-weight: bold;
    ul {
        display: flex;
        gap: 0.5rem;
        &:nth-of-type(1) {
            .fill {
                background-color: #f1453d;
            }
        }
        &:nth-of-type(2) {
            .fill {
                background-color: #673fb4;
            }
        }
        &:nth-of-type(3) {
            .fill {
                background-color: #2b98f0;
            }
        }
        &:nth-of-type(4) {
            .fill {
                background-color: #1fbcd2;
            }
        }
        &:nth-of-type(5) {
            .fill {
                background-color: #159588;
            }
        }
        &:nth-of-type(6) {
            .fill {
                background-color: #50ae55;
            }
        }
        &:nth-of-type(7) {
            .fill {
                background-color: #cdda49;
            }
        }
        &:nth-of-type(8) {
            .fill {
                background-color: #fdc02f;
            }
        }
        &:nth-of-type(9) {
            .fill {
                background-color: #fc5830;
            }
        }
        &:nth-of-type(10) {
            .fill {
                background-color: #785549;
            }
        }
        &:nth-of-type(11) {
            .fill {
                background-color: #9e9e9e;
            }
        }
        &:nth-of-type(12) {
            .fill {
                background-color: #617d8a;
            }
        }
        &:nth-of-type(13) {
            .fill {
                background-color: #cf267d;
            }
        }
        &:nth-of-type(14) {
            .fill {
                background-color: #7a1464;
            }
        }
        &:nth-of-type(15) {
            .fill {
                background-color: #3a7a14;
            }
        }
        &:nth-of-type(16) {
            .fill {
                background-color: #14407a;
            }
        }
    }
    .name {
        width: 5rem;
        text-align: right;
    }
    .meter {
        width: 100%;
    }
    .meter-bar {
        position: relative;
        width: 100%;
        height: 1rem;
        border: 1px solid var(--surface-500);
        background-color: var(--surface-200);
        border-radius: 0.3rem;
        .label {
            position: absolute;
            width: 50px;
            text-align: center;
            color: var(--text);
        }
        .fill {
            position: relative;
            overflow: hidden;
            border-radius: 0.3rem;
            width: 50%;
            height: 1rem;
            background-color: var(--primary-500);
            .label {
                color: white;
            }
        }
    }
}

.sticks {
    th {
        width: 33%;
    }
}

.deadband {
    th {
        width: 33%;
    }
}

.hybrid_element {
    position: relative;
    width: 11rem;
    select {
        z-index: 3;
        position: absolute;
        border: none !important;
        height: 1.45rem;
        min-width: 0 !important;
        width: 1rem;
        inset: 0;
        left: calc(100% - 1.25rem);
        top: 1px;
    }
    input {
        z-index: 2;
    }
}

.rcSmoothing {
    table {
        select {
            width: 90%;
        }
        input {
            width: 90%;
        }
        .helpicon {
            margin-top: 0;
        }
    }
    td {
        &:first-child {
            width: 120px;
            padding: 0.5rem 0;
        }
        &:last-child {
            width: calc(100% - 78px);
        }
    }
}

.rcInterpolation {
    .slider {
        input {
            appearance: slider-horizontal;
        }
    }
}

.graphAndLabel {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.5rem;
}

:deep(svg) {
    width: 100%;
    height: 100%;
}

.plot_control {
    width: 14rem;
    margin: 0;
    border-top-right-radius: 3px;
    border-bottom-right-radius: 3px;
    .table {
        display: table;
        width: 100%;
        table-layout: fixed;
        border-collapse: separate;
        border-spacing: 5px;
        box-sizing: border-box;
        padding: 5px 5px 5px 3px;
    }
    .row-container {
        display: table-row-group;
    }
    .receiver-button {
        a {
            background-color: var(--primary-500);
            border-radius: 0.5rem;
            color: #000;
            font-size: 10px;
            line-height: 1.25rem;
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
        font-weight: bold;
    }
    .right-cell {
        display: table-cell;
        vertical-align: middle;
        text-align: right;
        font-size: smaller;
    }
    .value {
        padding: 4px;
        color: #fff;
        border-radius: 3px;
    }
    .ch1 {
        background-color: #f1453d;
    }
    .ch2 {
        background-color: #673fb4;
    }
    .ch3 {
        background-color: #2b98f0;
    }
    .ch4 {
        background-color: #1fbcd2;
    }
}

:deep(#RX_plot) {
    height: 208px;
    color: var(--text);
    .line {
        &:nth-child(1) {
            stroke: #f1453d;
        }
        &:nth-child(2) {
            stroke: #673fb4;
        }
        &:nth-child(3) {
            stroke: #2b98f0;
        }
        &:nth-child(4) {
            stroke: #1fbcd2;
        }
        &:nth-child(5) {
            stroke: #159588;
        }
        &:nth-child(6) {
            stroke: #50ae55;
        }
        &:nth-child(7) {
            stroke: #cdda49;
        }
        &:nth-child(8) {
            stroke: #fdc02f;
        }
        &:nth-child(9) {
            stroke: #fc5830;
        }
        &:nth-child(10) {
            stroke: #785549;
        }
        &:nth-child(11) {
            stroke: #9e9e9e;
        }
        &:nth-child(12) {
            stroke: #7a6614;
        }
        &:nth-child(13) {
            stroke: #cf267d;
        }
        &:nth-child(14) {
            stroke: #7a1464;
        }
        &:nth-child(15) {
            stroke: #3a7a14;
        }
        &:nth-child(16) {
            stroke: #14407a;
        }
    }
}

:deep(.grid) {
    .tick {
        stroke: silver;
        stroke-width: 1px;
        shape-rendering: crispEdges;
    }
    path {
        stroke-width: 0;
    }
}

:deep(.line) {
    stroke-width: 2px;
    fill: none;
}

:deep(text) {
    stroke: none;
    fill: var(--text);
    font-size: 10px;
}

.model_preview_cell {
    position: relative;
    width: 100%;
    height: 11rem;
}

.model_preview {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-bottom-left-radius: 5px;
    border-bottom-right-radius: 5px;
}

.receiver {
    select {
        width: fit-content;
    }
}

table {
    width: 100%;
    padding: 0;
    th {
        border-bottom: 1px solid var(--surface-500);
    }
    td {
        border-bottom: 1px solid var(--surface-500);
    }
}

@media all and (max-width: 575px) {
    :deep(.grid-box) {
        &.col5 {
            grid-template-columns: 1fr !important;
        }
        &.col6 {
            column-gap: 0.5rem;
        }
    }
}
</style>
