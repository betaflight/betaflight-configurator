<template>
    <BaseTab tab-name="receiver">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabReceiver')"></div>
            <WikiButton docUrl="Receiver" />
            <UiBox highlight class="mb-3">
                <p v-html="$t('receiverHelp')"></p>
            </UiBox>

            <div class="grid-row grid-box col5">
                <!-- Left Column: Model Preview + Channel Bars -->
                <div class="col-span-2">
                    <UiBox :title="$t('receiverModelPreview')">
                        <div class="background_paper h-48 w-full" ref="modelPreviewContainer">
                            <canvas ref="modelCanvas"></canvas>
                        </div>
                    </UiBox>
                    <!-- Channel Bars -->
                    <div class="bars">
                        <ul v-for="(channel, index) in channelBars" :key="index">
                            <li class="name">{{ channel.name }}</li>
                            <div class="w-full relative">
                                <UProgress
                                    :model-value="rc.active_channels === 0 ? 0 : channel.width"
                                    :max="100"
                                    :ui="{
                                        base: 'w-full bg-elevated',
                                        indicator: 'duration-50',
                                    }"
                                    :disabled="rc.active_channels === 0"
                                    size="xl"
                                />
                                <div
                                    v-if="rc.active_channels > 0"
                                    class="text-center text-xs font-bold absolute inset-0"
                                >
                                    {{ channel.value }}
                                </div>
                            </div>
                        </ul>
                    </div>
                </div>

                <!-- Right Column: Configuration -->
                <div class="col-span-3">
                    <!-- Receiver Mode -->
                    <div class="receiver">
                        <UiBox :title="$t('configurationReceiver')">
                            <SettingRow :label="$t('configurationReceiverMode')">
                                <USelect
                                    :items="rxModeOptions"
                                    v-model="selectedRxMode"
                                    @change="onRxModeChange"
                                    class="min-w-52"
                                />
                            </SettingRow>

                            <!-- Serial RX Box -->
                            <template v-if="showSerialRxBox">
                                <UiBox highlight>
                                    <p v-html="$t('configurationSerialRXHelp')"></p>
                                </UiBox>
                                <SettingRow :label="$t('configurationSerialRX')">
                                    <USelectMenu
                                        v-model="rxConfig.serialrx_provider"
                                        value-key="value"
                                        :items="serialRxTypes"
                                        :search-input="{
                                            placeholder: $t('search'),
                                            icon: 'i-lucide-search',
                                        }"
                                        class="min-w-52"
                                        :ui="{ content: 'max-h-72' }"
                                    />
                                </SettingRow>
                                <UiBox highlight v-if="showSomeRxTypesDisabled">
                                    <p v-html="$t('someRXTypesDisabled')"></p>
                                </UiBox>
                                <UiBox highlight v-if="showSerialRxNotSupported">
                                    <p v-html="$t('serialRXNotSupported')"></p>
                                </UiBox>
                            </template>

                            <!-- SPI RX Box -->
                            <template v-if="showSpiRxBox">
                                <UiBox highlight>
                                    <p v-html="$t('configurationSpiRxHelp')"></p>
                                </UiBox>
                                <SettingRow :label="$t('configurationSpiRX')">
                                    <USelectMenu
                                        v-model="rxConfig.rxSpiProtocol"
                                        value-key="value"
                                        :items="spiRxMenuItems"
                                        :search-input="{
                                            placeholder: $t('search'),
                                            icon: 'i-lucide-search',
                                        }"
                                        class="min-w-52"
                                        :ui="{ content: 'max-h-72' }"
                                    />
                                </SettingRow>
                            </template>

                            <!-- ELRS Container -->
                            <template v-if="showElrsContainer">
                                <SettingRow :label="`${$t('receiverButtonBindingPhrase')} (${elrsUidDisplay})`">
                                    <UInput
                                        v-model="elrsBindingPhrase"
                                        :placeholder="$t('receiverButtonBindingPhrase')"
                                        class="min-w-52"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('receiverModelId')"
                                    v-if="showElrsModelId"
                                    :help="$t('receiverHelpModelId')"
                                >
                                    <UInputNumber
                                        v-model="rxConfig.elrsModelId"
                                        :min="0"
                                        :max="255"
                                        :step="1"
                                        class="min-w-52"
                                    />
                                </SettingRow>
                            </template>
                        </UiBox>
                    </div>

                    <div class="grid-box col6">
                        <!-- Telemetry -->
                        <UiBox
                            :title="$t('configurationTelemetry')"
                            :help="$t('configurationTelemetryHelp')"
                            class="col-span-2"
                        >
                            <SettingRow :label="$t('featureTELEMETRY')">
                                <USwitch
                                    :model-value="isTelemetryEnabled"
                                    @update:model-value="(checked) => toggleTelemetry(checked)"
                                />
                            </SettingRow>
                        </UiBox>

                        <!-- RSSI -->
                        <UiBox :title="$t('configurationRSSI')" :help="$t('configurationRSSIHelp')" class="col-span-3">
                            <div class="flex justify-between gap-2 flex-wrap">
                                <SettingRow :label="$t('featureRSSI_ADC')">
                                    <USwitch
                                        :model-value="isRssiAdcEnabled"
                                        @update:model-value="(checked) => toggleRssiAdc(checked)"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('receiverRssiChannel')">
                                    <USelect
                                        :items="[
                                            { label: $t('receiverRssiChannelDisabledOption'), value: 0 },
                                            ...rssiChannelOptions.map((i) => ({
                                                label: $t(`controlAxisAux${i - 4}`),
                                                value: i,
                                            })),
                                        ]"
                                        v-model="rssiConfig.channel"
                                        class="min-w-24 w-fit"
                                    />
                                </SettingRow>
                            </div>
                        </UiBox>

                        <!-- Channel Map -->
                        <UiBox :title="$t('receiverChannelMap')" class="col-span-1">
                            <SettingRow>
                                <UFieldGroup>
                                    <UInput
                                        v-model="channelMapString"
                                        @input="onChannelMapInput"
                                        @focusout="validateChannelMap"
                                        class="w-24"
                                    />
                                    <USelect
                                        v-model="channelMapPresetValue"
                                        :items="channelMapPresetItems"
                                        class="w-fit"
                                        :ui="{
                                            base: 'gap-0 pl-0',
                                            value: 'hidden',
                                            content: 'min-w-fit',
                                        }"
                                    />
                                </UFieldGroup>
                            </SettingRow>
                        </UiBox>

                        <!-- Stick settings -->
                        <UiBox :title="$t('receiverStickRange')" class="col-span-6">
                            <div class="grid grid-cols-3 gap-2">
                                <SettingColumn
                                    :label="$t('receiverStickMin')"
                                    :help="$t('receiverHelpStickMin')"
                                    class="items-start"
                                >
                                    <UInputNumber v-model="rxConfig.stick_min" :min="1000" :max="1200" :step="1" />
                                </SettingColumn>
                                <SettingColumn
                                    :label="$t('receiverStickCenter')"
                                    :help="$t('receiverHelpStickCenter')"
                                    class="items-center"
                                >
                                    <UInputNumber v-model="rxConfig.stick_center" :min="1401" :max="1599" :step="1" />
                                </SettingColumn>
                                <SettingColumn
                                    :label="$t('receiverStickMax')"
                                    :help="$t('receiverHelpStickMax')"
                                    class="items-end"
                                >
                                    <UInputNumber v-model="rxConfig.stick_max" :min="1800" :max="2000" :step="1" />
                                </SettingColumn>
                            </div>
                        </UiBox>

                        <!-- Deadband settings -->
                        <UiBox :title="$t('receiverDeadband')" class="col-span-6">
                            <div class="grid grid-cols-3 gap-2">
                                <SettingColumn
                                    :label="$t('receiverDeadband')"
                                    :help="$t('receiverHelpDeadband')"
                                    class="items-start"
                                >
                                    <UInputNumber v-model="rcDeadbandConfig.deadband" :min="0" :max="32" :step="1" />
                                </SettingColumn>
                                <SettingColumn
                                    :label="$t('receiverYawDeadband')"
                                    :help="$t('receiverHelpYawDeadband')"
                                    class="items-center"
                                >
                                    <UInputNumber
                                        v-model="rcDeadbandConfig.yaw_deadband"
                                        :min="0"
                                        :max="100"
                                        :step="1"
                                    />
                                </SettingColumn>
                                <SettingColumn
                                    :label="$t('recevier3dDeadbandThrottle')"
                                    :help="$t('receiverHelp3dDeadbandThrottle')"
                                    class="items-end"
                                >
                                    <UInputNumber
                                        v-model="rcDeadbandConfig.deadband3d_throttle"
                                        :min="0"
                                        :max="100"
                                        :step="1"
                                    />
                                </SettingColumn>
                            </div>
                        </UiBox>
                    </div>

                    <!-- RC Smoothing -->
                    <UiBox :title="$t('receiverRcSmoothing')" class="col-span-6">
                        <SettingRow :label="$t('receiverRcSmoothing')">
                            <USwitch
                                :model-value="rxConfig.rcSmoothing === 1"
                                @update:model-value="(on) => (rxConfig.rcSmoothing = on ? 1 : 0)"
                            />
                        </SettingRow>
                        <template v-if="rxConfig.rcSmoothing === 1">
                            <SettingRow
                                :label="$t('receiverRcSetpointTypeSelect')"
                                :help="$t('receiverRcSmoothingSetpointManual')"
                            >
                                <USelect
                                    :items="[
                                        { label: $t('receiverRcSmoothingAuto'), value: '0' },
                                        { label: $t('receiverRcSmoothingManual'), value: '1' },
                                    ]"
                                    v-model="setpointManualMode"
                                    class="min-w-42"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="setpointManualMode === '1'"
                                :label="$t('receiverRcSmoothingSetpointHz')"
                                :help="$t('rcSmoothingSetpointCutoffHelp')"
                            >
                                <UInputNumber
                                    :step="1"
                                    :min="0"
                                    :max="255"
                                    v-model="rxConfig.rcSmoothingSetpointCutoff"
                                    class="min-w-42"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="showAutoFactor"
                                :label="$t('receiverRcSmoothingAutoFactor')"
                                :help="$t('receiverRcSmoothingAutoFactorHelp2')"
                            >
                                <UInputNumber
                                    :step="1"
                                    :min="0"
                                    :max="250"
                                    v-model="rxConfig.rcSmoothingAutoFactor"
                                    class="min-w-42"
                                />
                            </SettingRow>
                            <template v-if="showThrottleSmoothingOptions">
                                <SettingRow
                                    :label="$t('receiverThrottleTypeSelect')"
                                    :help="$t('receiverRcSmoothingThrottleManual')"
                                >
                                    <USelect
                                        :items="[
                                            { label: $t('receiverRcSmoothingAuto'), value: '0' },
                                            { label: $t('receiverRcSmoothingManual'), value: '1' },
                                        ]"
                                        v-model="throttleManualMode"
                                        class="min-w-42"
                                    />
                                </SettingRow>
                                <SettingRow
                                    v-if="throttleManualMode === '1'"
                                    :label="$t('receiverRcSmoothingThrottleCutoffHz')"
                                    :help="$t('rcSmoothingThrottleCutoffHelp')"
                                >
                                    <UInputNumber
                                        :step="1"
                                        :min="0"
                                        :max="255"
                                        v-model="rxConfig.rcSmoothingThrottleCutoff"
                                        class="min-w-42"
                                    />
                                </SettingRow>
                                <SettingRow
                                    v-if="showThrottleAutoFactor"
                                    :label="$t('receiverRcSmoothingAutoFactorThrottle')"
                                    :help="$t('receiverRcSmoothingAutoFactorThrottleHelp')"
                                >
                                    <UInputNumber
                                        :step="1"
                                        :min="0"
                                        :max="250"
                                        v-model="rxConfig.rcSmoothingAutoFactorThrottle"
                                        class="min-w-42"
                                    />
                                </SettingRow>
                            </template>
                            <template v-else>
                                <SettingRow
                                    :label="$t('receiverRcFeedforwardTypeSelect')"
                                    :help="$t('receiverRcSmoothingFeedforwardManual')"
                                >
                                    <USelect
                                        :items="[
                                            { label: $t('receiverRcSmoothingAuto'), value: '0' },
                                            { label: $t('receiverRcSmoothingManual'), value: '1' },
                                        ]"
                                        v-model="feedforwardManualMode"
                                        class="min-w-42"
                                    />
                                </SettingRow>
                                <SettingRow
                                    v-if="feedforwardManualMode === '1'"
                                    :label="$t('receiverRcSmoothingFeedforwardCutoff')"
                                    :help="$t('rcSmoothingFeedforwardCutoffHelp')"
                                >
                                    <UInputNumber
                                        :step="1"
                                        :min="1"
                                        :max="255"
                                        v-model="rxConfig.rcSmoothingFeedforwardCutoff"
                                        class="min-w-42"
                                    />
                                </SettingRow>
                            </template>
                        </template>
                    </UiBox>
                </div>
            </div>

            <UiBox class="col-span-6 mt-3">
                <div class="wrapper graphAndLabel">
                    <svg id="RX_plot" class="col-span-5" ref="rxPlot">
                        <g class="axis-display x" transform="translate(40, 188)"></g>
                        <g class="axis-display y" transform="translate(40, 10)"></g>
                        <g class="grid-display x" transform="translate(40, 188)"></g>
                        <g class="grid-display y" transform="translate(40, 10)"></g>
                        <g class="data" transform="translate(40, 10)"></g>
                    </svg>

                    <div class="plot_control flex flex-col gap-2 pt-3 p-1">
                        <div class="flex gap-2 justify-between">
                            <UButton :label="$t('receiverResetRefreshRate')" @click="resetRefreshRate" size="xs" />
                            <USelect
                                :items="[
                                    { label: '10 ms', value: 10 },
                                    { label: '20 ms', value: 20 },
                                    { label: '30 ms', value: 30 },
                                    { label: '40 ms', value: 40 },
                                    { label: '50 ms', value: 50 },
                                    { label: '100 ms', value: 100 },
                                    { label: '250 ms', value: 250 },
                                    { label: '500 ms', value: 500 },
                                    { label: '1000 ms', value: 1000 },
                                ]"
                                v-model="refreshRate"
                                size="xs"
                                class="min-w-24"
                            />
                        </div>
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between" v-for="(label, index) in plotLabels" :key="index">
                                <span class="font-bold">{{ label.name }}</span>
                                <span :class="`ch${index + 1} value min-w-24`">
                                    {{ label.value }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </UiBox>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <UButton :label="$t('receiverButtonSticks')" @click="openSticksWindow" v-if="showSticksButton" />
            <UButton :label="$t('receiverButtonBind')" @click="sendBind" v-if="showBindButton" />
            <UButton :label="$t('receiverButtonRefresh')" @click="refreshTab" />
            <UButton :label="$t('receiverButtonSave')" @click="saveConfig(false)" v-if="!needReboot" />
            <UButton :label="$t('receiverButtonSave')" @click="saveConfig(true)" v-else />
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useConnectionStore } from "@/stores/connection";
import { useNavigationStore } from "@/stores/navigation";
import { useReboot } from "@/composables/useReboot";
import { useInterval } from "../../composables/useInterval";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { i18n } from "@/js/localization";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import GUI from "@/js/gui";
import Model from "@/js/model";
import RateCurve from "@/js/RateCurve";
import { degToRad } from "@/js/utils/common";
import { bit_check, bit_set, bit_clear } from "@/js/bit";
import { get as getConfig, set as setConfig } from "@/js/ConfigStorage";
import { updateTabList } from "@/js/utils/updateTabList";
import { gui_log } from "@/js/gui_log";
import DarkTheme from "@/js/DarkTheme";
import windowWatcherUtil from "@/js/utils/window_watchers";
import { API_VERSION_1_45, API_VERSION_1_47 } from "@/js/data_storage";
import CryptoES from "crypto-es";
import semver from "semver";
import * as THREE from "three";
import * as d3 from "d3";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";
import SettingColumn from "../elements/SettingColumn.vue";

const t = (key) => i18n.getMessage(key);
const fcStore = useFlightControllerStore();
const connectionStore = useConnectionStore();
const navigationStore = useNavigationStore();
const { reboot } = useReboot();
const { addInterval, removeInterval } = useInterval();

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

const spiRxMenuItems = computed(() =>
    spiRxTypes.map((name, index) => ({
        label: name,
        value: index,
    })),
);

// Computed store access
const rc = computed(() => fcStore.rc);
const rxConfig = computed(() => fcStore.rxConfig);
const rssiConfig = computed(() => fcStore.rssiConfig);
const features = computed(() => fcStore.features);

const rcDeadbandConfig = computed(() => fcStore.rcDeadbandConfig);

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
    const types = fcStore.getSerialRxTypes();
    const supported = fcStore.getSupportedSerialRxTypes();
    return types.map((name, index) => ({
        label: name,
        value: index,
        disabled: !supported.includes(name),
    }));
});

const showSomeRxTypesDisabled = computed(() => {
    const types = serialRxTypes.value;
    const selected = rxConfig.value?.serialrx_provider;
    const selectedType = types[selected];
    const allEnabled = types.every((t) => !t.disabled);
    return selectedType && !selectedType.disabled && !allEnabled;
});

const showSerialRxNotSupported = computed(() => {
    const types = serialRxTypes.value;
    const selected = rxConfig.value?.serialrx_provider;
    return types[selected]?.disabled ?? false;
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
    return bit_check(fcStore.config?.targetCapabilities, fcStore.TARGET_CAPABILITIES_FLAGS?.SUPPORTS_RX_BIND);
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
    setConfig({ binding_phrase_map: bindingPhraseMap });
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
    for (let i = 0; i < fcStore.rcMap.length; i++) {
        fcStore.rcMap[i] = chars.indexOf(rcMapLetters[i]);
    }
}

function updateChannelMapFromRcMap() {
    const strBuffer = [];
    for (let i = 0; i < fcStore.rcMap.length; i++) {
        strBuffer[fcStore.rcMap[i]] = rcMapLetters[i];
    }
    channelMapString.value = strBuffer.join("");
}

/** Reka Select disallows item `value: ""` (empty string clears selection). */
const CHANNEL_MAP_PRESET_CUSTOM = "__channelMapCustom__";

const channelMapPresetItems = computed(() => [
    { label: t("receiverChannelDefaultOption"), value: CHANNEL_MAP_PRESET_CUSTOM },
    { label: "FrSky / Futaba / Hitec (AETR1234)", value: "AETR1234" },
    { label: "Spektrum / Graupner / JR (TAER1234)", value: "TAER1234" },
]);

const channelMapPresetValue = computed({
    get() {
        const s = channelMapString.value;
        if (s === "AETR1234" || s === "TAER1234") {
            return s;
        }
        return CHANNEL_MAP_PRESET_CUSTOM;
    },
    set(val) {
        if (val === CHANNEL_MAP_PRESET_CUSTOM) {
            return;
        }
        channelMapString.value = val;
        validateChannelMap();
    },
});

// Feature toggles
function toggleTelemetry(checked) {
    if (features.value?.features?.updateData) {
        features.value.features.updateData({ name: "TELEMETRY", checked });
        updateTabList(features.value.features);
        needReboot.value = needReboot.value || checked !== undefined;
    }
}

function toggleRssiAdc(checked) {
    if (features.value?.features?.updateData) {
        features.value.features.updateData({ name: "RSSI_ADC", checked });
        needReboot.value = needReboot.value || checked !== undefined;
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
        if (connectionStore.connectionValid && GUI.active_tab !== "cli") {
            mspHelper.setRawRx(channels);
            return true;
        }
        return false;
    };

    const createdWindow = globalThis.open(
        "/components/tabs/receiver-msp/receiver_msp.html",
        "receiver_msp",
        `location=no,width=${windowWidth},height=${windowHeight + (screen.height - screen.availHeight)}`,
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
                fcStore.rxConfig.elrsUid = elrsUidChars;
                saveElrsBindingPhrase(elrsUidChars.join(","), elrsBindingPhrase.value);
            } else {
                fcStore.rxConfig.elrsUid = [0, 0, 0, 0, 0, 0];
            }
        }

        // Set cutoffs to 0 for auto mode
        if (setpointManualMode.value === "0") {
            fcStore.rxConfig.rcSmoothingSetpointCutoff = 0;
        }
        if (showThrottleSmoothingOptions.value && throttleManualMode.value === "0") {
            fcStore.rxConfig.rcSmoothingThrottleCutoff = 0;
        }
        if (!showThrottleSmoothingOptions.value && feedforwardManualMode.value === "0") {
            fcStore.rxConfig.rcSmoothingFeedforwardCutoff = 0;
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
    model = new Model(modelPreviewContainer.value, modelCanvas.value);
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

    svg.select(".x.grid-display").call(xGrid);
    svg.select(".y.grid-display").call(yGrid);
    svg.select(".x.axis-display").call(xAxis);
    svg.select(".y.axis-display").call(yAxis);

    const data = svg.select("g.data");
    const lines = data.selectAll("path").data(rxPlotData);
    lines.enter().append("path").attr("class", "line").merge(lines).attr("d", line);
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
    removeInterval("receiver_pull");
    addInterval("receiver_pull", getRcData, newRate, true);
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
    addInterval(
        "receiver_pull_for_model_preview",
        () => {
            MSP.send_message(MSPCodes.MSP_RC, false, false);
        },
        33,
        false,
    );

    // Setup and start RC plot
    setupRxPlot();
    addInterval("receiver_pull", getRcData, refreshRate.value, true);

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
            :deep([data-slot="indicator"]) {
                background-color: #f1453d;
            }
        }
        &:nth-of-type(2) {
            :deep([data-slot="indicator"]) {
                background-color: #673fb4;
            }
        }
        &:nth-of-type(3) {
            :deep([data-slot="indicator"]) {
                background-color: #2b98f0;
            }
        }
        &:nth-of-type(4) {
            :deep([data-slot="indicator"]) {
                background-color: #1fbcd2;
            }
        }
        &:nth-of-type(5) {
            :deep([data-slot="indicator"]) {
                background-color: #159588;
            }
        }
        &:nth-of-type(6) {
            :deep([data-slot="indicator"]) {
                background-color: #50ae55;
            }
        }
        &:nth-of-type(7) {
            :deep([data-slot="indicator"]) {
                background-color: #cdda49;
            }
        }
        &:nth-of-type(8) {
            :deep([data-slot="indicator"]) {
                background-color: #fdc02f;
            }
        }
        &:nth-of-type(9) {
            :deep([data-slot="indicator"]) {
                background-color: #fc5830;
            }
        }
        &:nth-of-type(10) {
            :deep([data-slot="indicator"]) {
                background-color: #785549;
            }
        }
        &:nth-of-type(11) {
            :deep([data-slot="indicator"]) {
                background-color: #9e9e9e;
            }
        }
        &:nth-of-type(12) {
            :deep([data-slot="indicator"]) {
                background-color: #617d8a;
            }
        }
        &:nth-of-type(13) {
            :deep([data-slot="indicator"]) {
                background-color: #cf267d;
            }
        }
        &:nth-of-type(14) {
            :deep([data-slot="indicator"]) {
                background-color: #7a1464;
            }
        }
        &:nth-of-type(15) {
            :deep([data-slot="indicator"]) {
                background-color: #3a7a14;
            }
        }
        &:nth-of-type(16) {
            :deep([data-slot="indicator"]) {
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
        container-type: inline-size;
        width: 100%;
        height: 1rem;
        border: 1px solid var(--surface-500);
        background-color: var(--surface-200);
        border-radius: 0.3rem;
        .label {
            position: absolute;
            width: 50px;
            text-align: center;
            left: calc(50cqi - 25px);
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

.graphAndLabel {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.5rem;
}

:deep(svg:not(.iconify)) {
    width: 100%;
    height: 100%;
}

.plot_control {
    width: 14rem;
    margin: 0;
    border-top-right-radius: 3px;
    border-bottom-right-radius: 3px;
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

:deep(.grid-display) {
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

@media all and (max-width: 1055px) {
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
