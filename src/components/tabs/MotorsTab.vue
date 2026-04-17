<template>
    <BaseTab tab-name="motors">
        <div class="content_wrapper">
            <div class="tab_title !text-xl !mb-2.5" v-html="$t('tabMotorTesting')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="motors" />
            </div>

            <div class="grid-row grid-box col2 max-[1055px]:!grid-cols-1">
                <div class="col-span-1">
                    <div class="flex flex-col gap-4">
                        <!-- MIXER -->
                        <UiBox :title="$t('configurationMixer')" type="neutral">
                            <USelect v-model="fcStore.mixerConfig.mixer" :items="sortedMixerListItems" />
                            <SettingRow
                                :label="$t('configurationReverseMotorSwitch')"
                                :help="$t('configurationReverseMotorSwitchHelp')"
                                full-width
                            >
                                <USwitch v-model="reverseMotorDir" size="sm" />
                            </SettingRow>
                            <div
                                class="flex justify-center p-2.5 [&_svg]:w-[150px] [&_svg]:h-[150px] [&_svg]:ml-[15px]"
                                v-html="mixerPreviewSvg"
                            ></div>
                            <div class="flex gap-2">
                                <UButton
                                    v-if="isMotorReorderingAvailable"
                                    :label="$t('motorOutputReorderDialogOpen')"
                                    :disabled="buttonStates.toolsDisabled"
                                    @click="openMotorOutputReorderDialog()"
                                />
                                <UButton
                                    v-if="digitalProtocolConfigured"
                                    :label="$t('escDshotDirectionDialog-Open')"
                                    :disabled="buttonStates.toolsDisabled"
                                    @click="openEscDshotDirectionDialog()"
                                />
                            </div>
                        </UiBox>
                        <!-- ESC FEATURES -->
                        <UiBox :title="$t('configurationEscFeatures')" type="neutral">
                            <div v-if="!protocolConfigured" class="text-sm text-orange-500">
                                <p v-html="$t('configurationEscProtocolDisabled')"></p>
                            </div>
                            <SettingRow
                                :label="$t('configurationEscProtocol')"
                                :help="$t('configurationEscProtocolHelp')"
                                full-width
                            >
                                <USelect
                                    v-model="selectedEscProtocol"
                                    :items="escProtocolItems"
                                    class="min-w-32"
                                    @update:model-value="onProtocolChange"
                                />
                            </SettingRow>
                            <SettingRow v-if="showAnalogSettings" :label="$t('configurationunsyndePwm')" full-width>
                                <USwitch v-model="useUnsyncedPwm" size="sm" />
                            </SettingRow>
                            <SettingRow
                                v-if="showAnalogSettings && useUnsyncedPwm"
                                :label="$t('configurationUnsyncedPWMFreq')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.pidAdvancedConfig.motor_pwm_rate"
                                    :min="200"
                                    :max="32000"
                                    :step="100"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                            <SettingRow v-if="protocolConfigured" full-width>
                                <USwitch
                                    :model-value="isFeatureEnabled('MOTOR_STOP')"
                                    @update:model-value="toggleFeature('MOTOR_STOP', $event)"
                                    :disabled="isFeatureEnabled('AIRMODE')"
                                    size="sm"
                                />
                                <template #label>
                                    <span class="font-semibold">MOTOR_STOP</span>
                                    <span class="ml-2" v-html="$t('featureMOTOR_STOPTip')"></span>
                                </template>
                            </SettingRow>
                            <SettingRow v-if="digitalProtocolConfigured" full-width>
                                <USwitch
                                    :model-value="isFeatureEnabled('ESC_SENSOR')"
                                    @update:model-value="toggleFeature('ESC_SENSOR', $event)"
                                    size="sm"
                                />
                                <template #label>
                                    <span class="font-semibold">ESC_SENSOR</span>
                                    <span class="ml-2" v-html="$t('featureESC_SENSOR')"></span>
                                </template>
                            </SettingRow>
                            <SettingRow
                                v-if="digitalProtocolConfigured"
                                :label="$t('configurationDshotBidir')"
                                :help="$t('configurationDshotBidirHelp')"
                                full-width
                            >
                                <USwitch v-model="useDshotTelemetry" size="sm" />
                            </SettingRow>
                            <SettingRow
                                v-if="protocolConfigured && rpmFeaturesVisible"
                                :label="$t('configurationMotorPolesLong')"
                                :help="$t('configurationMotorPolesHelp')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.motorConfig.motor_poles"
                                    :min="4"
                                    :max="255"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="showMotorIdle"
                                :label="$t('configurationMotorIdle')"
                                :help="$t('configurationMotorIdleHelp')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.pidAdvancedConfig.motorIdle"
                                    :min="0"
                                    :max="20"
                                    :step="0.1"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="showIdleMinRpm"
                                :label="$t('pidTuningIdleMinRpm')"
                                :help="$t('configurationMotorIdleRpmHelp')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.advancedTuning.idleMinRpm"
                                    :min="0"
                                    :max="100"
                                    :step="1"
                                    :readonly="true"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="showAnalogSettings"
                                :label="$t('configurationThrottleMinimumCommand')"
                                :help="$t('configurationThrottleMinimumCommandHelp')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.motorConfig.mincommand"
                                    :min="0"
                                    :max="2000"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="showMinThrottle"
                                :label="$t('configurationThrottleMinimum')"
                                :help="$t('configurationThrottleMinimumHelp')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.motorConfig.minthrottle"
                                    :min="0"
                                    :max="2000"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                            <SettingRow
                                v-if="showAnalogSettings"
                                :label="$t('configurationThrottleMaximum')"
                                full-width
                            >
                                <UInputNumber
                                    v-model="fcStore.motorConfig.maxthrottle"
                                    :min="0"
                                    :max="2000"
                                    :step="1"
                                    size="xs"
                                    orientation="vertical"
                                    class="w-16"
                                />
                            </SettingRow>
                        </UiBox>
                        <!-- 3D -->
                        <UiBox :title="$t('configuration3d')" type="neutral">
                            <SettingRow :help="$t('feature3DTip')" full-width>
                                <USwitch
                                    :model-value="isFeatureEnabled('3D')"
                                    @update:model-value="toggleFeature('3D', $event)"
                                    size="sm"
                                />
                                <template #label>
                                    <span v-html="$t('feature3D')"></span>
                                    <span class="ml-2 font-semibold">3D</span>
                                </template>
                            </SettingRow>
                            <template v-if="isFeatureEnabled('3D')">
                                <SettingRow :label="$t('configuration3dDeadbandLow')" full-width>
                                    <UInputNumber
                                        v-model="fcStore.motor3dConfig.deadband3d_low"
                                        :min="1250"
                                        :max="1600"
                                        :step="1"
                                        size="xs"
                                        orientation="vertical"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('configuration3dDeadbandHigh')" full-width>
                                    <UInputNumber
                                        v-model="fcStore.motor3dConfig.deadband3d_high"
                                        :min="1400"
                                        :max="1750"
                                        :step="1"
                                        size="xs"
                                        orientation="vertical"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('configuration3dNeutral')" full-width>
                                    <UInputNumber
                                        v-model="fcStore.motor3dConfig.neutral"
                                        :min="1400"
                                        :max="1600"
                                        :step="1"
                                        size="xs"
                                        orientation="vertical"
                                        class="w-16"
                                    />
                                </SettingRow>
                            </template>
                        </UiBox>
                    </div>
                </div>
                <!-- END CONFIGURATION -->
                <div class="col-span-1">
                    <!-- MOTOR TEST SECTION -->
                    <div class="flex flex-col gap-3">
                        <!-- SENSOR GRAPH SECTION -->
                        <UiBox type="neutral">
                            <div class="graph-grid">
                                <svg ref="graphSvg" id="graph" class="w-full h-full">
                                    <g class="grid x" transform="translate(40, 120)"></g>
                                    <g class="grid y" transform="translate(40, 10)"></g>
                                    <g class="data" transform="translate(41, 10)"></g>
                                    <g class="axis x" transform="translate(40, 120)"></g>
                                    <g class="axis y" transform="translate(40, 10)"></g>
                                </svg>
                                <div
                                    class="text-[10px] flex flex-col gap-1 [&_button]:!text-[10px] [&_[data-slot=base]]:!text-[10px]"
                                >
                                    <div class="flex items-center gap-2 mb-2">
                                        <UButton
                                            :label="$t('motorsResetMaximumButton')"
                                            :title="$t('motorsResetMaximum')"
                                            @click="resetMaxValues"
                                            size="xs"
                                        />
                                        <USelect
                                            v-model="sensorType"
                                            :items="sensorTypeItems"
                                            class="min-w-24"
                                            size="xs"
                                        />
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="flex-1" v-html="$t('sensorsRefresh')"></span>
                                        <USelect
                                            v-model.number="sensorRate"
                                            :items="rateItems"
                                            class="min-w-24"
                                            size="xs"
                                        />
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="flex-1" v-html="$t('sensorsScale')"></span>
                                        <USelect
                                            v-model.number="sensorScale"
                                            :items="scaleItems"
                                            class="min-w-24"
                                            size="xs"
                                        />
                                    </div>
                                    <div
                                        v-for="axis in ['x', 'y', 'z']"
                                        :key="axis"
                                        class="flex justify-between py-0.5"
                                    >
                                        <span>{{ axis.toUpperCase() }}:</span>
                                        <span
                                            class="w-24 text-right px-[3px] py-[2px] text-black rounded-[3px]"
                                            :class="{
                                                'bg-[#1fb1f0]': axis === 'x',
                                                'bg-[#97d800]': axis === 'y',
                                                'bg-[#e24761]': axis === 'z',
                                            }"
                                            >{{ rawDataDisplay[axis] }}</span
                                        >
                                    </div>
                                    <div class="flex justify-between py-0.5">
                                        <span>RMS:</span>
                                        <span
                                            class="w-24 text-right px-[3px] py-[2px] text-black rounded-[3px] bg-[#00d800]"
                                            >{{ rawDataDisplay.rms }}</span
                                        >
                                    </div>
                                </div>
                            </div>
                            <div class="text-[10px] flex flex-wrap items-center gap-x-2">
                                <span class="font-bold" v-html="$t('motorsVoltage')"></span>
                                <span class="text-left w-[50px]">{{ powerValues.voltage }}</span>

                                <span class="font-bold" v-html="$t('motorsADrawing')"></span>
                                <span class="text-left w-[50px]">{{ powerValues.amperage }}</span>

                                <span class="font-bold" v-html="$t('motorsmAhDrawn')"></span>
                                <span class="text-left w-[50px]">{{ powerValues.mAhDrawn }}</span>
                            </div>
                        </UiBox>

                        <div class="motors">
                            <ul :class="`grid-box col${numberOfValidOutputs + 1} h-5`">
                                <li
                                    v-for="i in numberOfValidOutputs"
                                    :key="i"
                                    class="text-center"
                                    :title="$t('motorNumber' + i)"
                                >
                                    {{ i }}
                                </li>
                                <li></li>
                            </ul>
                            <ul :class="`grid-box col${numberOfValidOutputs + 1}`">
                                <li
                                    v-for="i in numberOfValidOutputs"
                                    :key="i"
                                    class="relative h-[100px]"
                                    :style="{ '--bar-opacity': (getMotorBarHeight(i - 1) * 0.009 + 0.1).toFixed(2) }"
                                >
                                    <div
                                        class="absolute inset-x-0 bottom-[45px] z-10 text-center text-[10px] font-bold"
                                    >
                                        {{ getMotorValue(i - 1) }}
                                    </div>
                                    <UProgress
                                        orientation="vertical"
                                        inverted
                                        :model-value="getMotorBarHeight(i - 1)"
                                        :max="100"
                                        color="warning"
                                        size="2xl"
                                        :ui="{
                                            root: '!w-full',
                                            base: '!w-full !rounded-md border border-(--ui-border)',
                                            indicator: '!rounded-none !transition-none opacity-(--bar-opacity)',
                                        }"
                                        class="h-full"
                                    />
                                </li>
                                <li></li>
                            </ul>
                        </div>

                        <div class="m-0 p-0 border-0 list-none outline-none">
                            <ul :class="`grid-box col${numberOfValidOutputs + 1} mb-2`">
                                <li
                                    v-for="i in numberOfValidOutputs"
                                    :key="i"
                                    class="text-center text-[10px] whitespace-nowrap overflow-hidden"
                                >
                                    <span
                                        :class="`motor-${i - 1}`"
                                        :title="$t('motorsTelemetryHelp')"
                                        v-html="getTelemetryHtml(i - 1)"
                                    ></span>
                                </li>
                                <li class="text-center text-[10px] whitespace-nowrap overflow-hidden">
                                    <span class="motor-master" :title="$t('motorsTelemetryHelp')">&nbsp;</span>
                                </li>
                            </ul>

                            <div class="mb-2">
                                <ul :class="`grid-box col${numberOfValidOutputs + 1}`">
                                    <li
                                        v-for="i in numberOfValidOutputs"
                                        :key="i"
                                        class="flex items-end justify-center"
                                        @wheel.prevent="onSliderWheel(i - 1, $event)"
                                    >
                                        <USlider
                                            orientation="vertical"
                                            :min="minSliderValue"
                                            :max="maxSliderValue"
                                            :model-value="motorValues[i - 1]"
                                            :disabled="slidersDisabled"
                                            tooltip
                                            class="h-24"
                                            @update:model-value="onMotorValueUpdate(i - 1, $event)"
                                        />
                                    </li>
                                    <li
                                        class="flex items-end justify-center"
                                        @wheel.prevent="onSliderWheel(-1, $event)"
                                    >
                                        <USlider
                                            orientation="vertical"
                                            :min="minSliderValue"
                                            :max="maxSliderValue"
                                            :model-value="masterValue"
                                            :disabled="slidersDisabled"
                                            color="warning"
                                            tooltip
                                            class="h-24"
                                            @update:model-value="onMasterValueUpdate($event)"
                                        />
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <ul :class="`grid-box col${numberOfValidOutputs + 1}`">
                                    <li v-for="i in numberOfValidOutputs" :key="i" class="text-center text-[10px]">
                                        {{ motorValues[i - 1] }}
                                    </li>
                                    <li class="text-center text-[10px] font-bold" v-html="$t('motorsMaster')"></li>
                                </ul>
                            </div>
                        </div>

                        <div class="p-3 border border-red-500/30 rounded-md bg-red-500/5">
                            <p class="text-sm mb-2" v-html="$t('motorsNotice')"></p>
                            <SettingRow :label="$t('motorsEnableControl')" full-width>
                                <USwitch v-model="motorsTestingEnabled" size="sm" />
                            </SettingRow>
                        </div>
                    </div>
                    <!-- END MOTOR TEST SECTION -->
                </div>
            </div>

            <!-- Warning Dialog -->
            <dialog id="dialog-settings-changed" ref="dialogSettingsChanged" class="w-[400px] h-fit">
                <div class="p-4">
                    <div class="mb-4" v-html="warningMessage"></div>
                    <UButton :label="$t('motorsDialogSettingsChangedOk')" @click="closeWarningDialog" />
                </div>
            </dialog>

            <!-- Dynamic Notch Filters Dialog -->
            <dialog id="dialog-dyn-filters" ref="dialogDynFilters" class="w-[400px] h-fit">
                <div class="p-4">
                    <div class="font-semibold mb-2" v-html="$t('dialogDynFiltersChangeTitle')"></div>
                    <div class="mb-4" v-html="$t('dialogDynFiltersChangeNote')"></div>
                    <div class="flex gap-2">
                        <UButton :label="$t('presetsWarningDialogYesButton')" @click="applyDynFiltersChange" />
                        <UButton
                            :label="$t('presetsWarningDialogNoButton')"
                            variant="outline"
                            @click="closeDynFiltersDialog"
                        />
                    </div>
                </div>
            </dialog>
        </div>

        <!-- Fixed Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="flex gap-2">
                <UButton
                    :label="$t('configurationButtonSave')"
                    :disabled="buttonStates.saveDisabled"
                    :color="buttonStates.saveDisabled ? 'neutral' : 'success'"
                    @click="saveAndReboot(true)"
                />
                <UButton
                    :label="$t('escDshotDirectionDialog-StopWizard')"
                    :disabled="buttonStates.stopDisabled"
                    @click="stopMotors()"
                    :color="motorsTestingEnabled ? 'error' : 'neutral'"
                />
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
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
import { mspHelper } from "@/js/msp/MSPHelper";
import { tracking } from "@/js/Analytics";
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
const dshotBidirInitialized = ref(false);
const previousFilterDynQ = ref(null);
const previousFilterDynCount = ref(null);

const showDynFiltersDialog = () => {
    dialogDynFilters.value?.showModal();
};

const closeDynFiltersDialog = () => {
    dialogDynFilters.value?.close();
};

const applyDynFiltersChange = () => {
    const FILTER_DEFAULT = fcStore.getFilterDefaults();

    if (fcStore.motorConfig.use_dshot_telemetry && !previousDshotBidir.value) {
        fcStore.filterConfig.dyn_notch_count = FILTER_DEFAULT.dyn_notch_count_rpm;
        fcStore.filterConfig.dyn_notch_q = FILTER_DEFAULT.dyn_notch_q_rpm;
    } else if (!fcStore.motorConfig.use_dshot_telemetry && previousDshotBidir.value) {
        fcStore.filterConfig.dyn_notch_count = FILTER_DEFAULT.dyn_notch_count;
        fcStore.filterConfig.dyn_notch_q = FILTER_DEFAULT.dyn_notch_q;
    }
    closeDynFiltersDialog();
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
        if (a.name === disabledText) {
            return -1;
        }
        if (b.name === disabledText) {
            return 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
});

// Note: I used `availableEscProtocols` in the template above (v-for="(protocol, index) in availableEscProtocols").
// I should update the template to use `sortedEscProtocolOptions` if I want sorting.
// But the template used index as value, which works if I iterate over the original array.
// If I use sorted array, I must explicitely use the stored value.

const escProtocolItems = computed(() =>
    sortedEscProtocolOptions.value.map((o) => ({
        label: o.name,
        value: o.value,
        disabled: isProtocolDisabled(o.name),
    })),
);

const isProtocolDisabled = (protocolName) => {
    if (protocolName === "DISABLED") {
        return false;
    }
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

// Feature helper (needed by zeroThrottleValue below)
const isFeatureEnabled = (featureName) => {
    return fcStore.features.features.isEnabled(featureName);
};

// Slider range values (needed by zeroThrottleValue below)
const minSliderValue = computed(() => {
    if (digitalProtocolConfigured.value) {
        return 1000; // DShot Disarmed
    }
    return fcStore.motorConfig.mincommand;
});

const zeroThrottleValue = computed(() => {
    if (isFeatureEnabled("3D")) {
        let neutral = fcStore.motor3dConfig.neutral;
        // Sanity check from legacy
        return neutral > 1575 || neutral < 1425 ? 1500 : neutral;
    }
    return minSliderValue.value;
});

// Initialize motor testing with safety features
const { motorsTestingEnabled, motorValues, masterValue, slidersDisabled, sendMotorCommand, stopAllMotors } =
    useMotorTesting(configHasChanged, showWarningDialog, digitalProtocolConfigured, zeroThrottleValue);

// Initialize configuration tracking
const { setupConfigWatchers } = useMotorConfiguration(motorsState, motorsTestingEnabled, () => {
    motorsTestingEnabled.value = false;
});

// Initialize data polling
useMotorDataPolling(motorsTestingEnabled);

// Button states (central controller like original setContentButtons)
const buttonStates = computed(() => ({
    toolsDisabled: configHasChanged.value || motorsTestingEnabled.value,
    saveDisabled: !configHasChanged.value,
    stopDisabled: !motorsTestingEnabled.value,
}));

const useDshotTelemetry = computed({
    get: () => !!fcStore.motorConfig.use_dshot_telemetry,
    set: (val) => {
        fcStore.motorConfig.use_dshot_telemetry = !!val;
    },
});

// Watch for bidirectional DShot changes
watch(
    () => fcStore.motorConfig.use_dshot_telemetry,
    (newValue) => {
        if (!dshotBidirInitialized.value) {
            return;
        } // Skip until MSP data is loaded

        const rpmFilterIsDisabled = fcStore.filterConfig.gyro_rpm_notch_harmonics === 0;

        // Always restore filter values to original firmware state first
        fcStore.filterConfig.dyn_notch_count = previousFilterDynCount.value;
        fcStore.filterConfig.dyn_notch_q = previousFilterDynQ.value;

        // Show dialog when dshotBidir differs from original firmware value and RPM filter is enabled
        if (newValue !== previousDshotBidir.value && !rpmFilterIsDisabled) {
            showDynFiltersDialog();
        } else {
            closeDynFiltersDialog();
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

    // Store initial dshotBidir value for comparison (MUST be set before enabling watcher)
    previousDshotBidir.value = fcStore.motorConfig.use_dshot_telemetry;
    previousFilterDynQ.value = fcStore.filterConfig.dyn_notch_q;
    previousFilterDynCount.value = fcStore.filterConfig.dyn_notch_count;
    dshotBidirInitialized.value = true;

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

const sensorTypeItems = [
    { label: "Gyro", value: "gyro" },
    { label: "Accel", value: "accel" },
];

const rateItems = availableRates.map((r) => ({ label: `${r} ms`, value: r }));

const scaleItems = computed(() =>
    Object.entries(currentScaleOptions.value).map(([label, value]) => ({ label, value })),
);

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
let imuPollingIntervalId = null;
let powerPollingIntervalId = null;

const rawDataDisplay = ref({ x: "0", y: "0", z: "0", rms: "0" });
const powerValues = ref({ voltage: "0.00", amperage: "0.00", mAhDrawn: "0" });

const resetMaxValues = () => {
    maxRead = [0, 0, 0];
    accelOffsetEstablished = false;

    // Clear graph visual
    if (graphData && graphHelpers) {
        for (let i = 0; i < graphData.length; i++) {
            graphData[i] = [];
        }
        samples = 0;
        drawGraph(graphHelpers, graphData, samples);
    }
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
    if (!graphSvg.value) {
        return;
    }
    const svg = d3.select(graphSvg.value);

    updateGraphHelperSize(helpers); // Ensure size is current

    helpers.widthScale.domain([sampleNumber - 299, sampleNumber]);
    if (helpers.dynamicHeightDomain) {
        const allValues = data.flatMap((datum) => [datum.min, datum.max]);
        helpers.heightScale.domain(d3.extent(allValues));
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
        if (dataPoint < data[i].min) {
            data[i].min = dataPoint;
        }
        if (dataPoint > data[i].max) {
            data[i].max = dataPoint;
        }
    }
    while (data[0].length > 300) {
        for (const item of data) {
            item.shift();
        }
    }
    return sampleNumber + 1;
}

function computeAndUpdateDisplay(sensor_data) {
    // Assuming 3 axes
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
    for (const axisData of graphData) {
        for (const point of axisData) {
            totalSq += point[1] * point[1];
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
    if (imuPollingIntervalId) {
        clearInterval(imuPollingIntervalId);
    }

    // Clear existing graph content
    if (graphSvg.value) {
        const svg = d3.select(graphSvg.value);
        svg.selectAll("g.data path").remove(); // Clear existing lines
    }

    // Reset data
    samples = 0;
    graphData = initDataArray(3);
    const domain = [-sensorScale.value, sensorScale.value];
    graphHelpers = initGraphHelpers(samples, domain);
    updateGraphHelperSize(graphHelpers);

    if (sensorType.value === "gyro") {
        imuPollingIntervalId = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, updateGyroGraph);
        }, sensorRate.value);
    } else {
        imuPollingIntervalId = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, updateAccelGraph);
        }, sensorRate.value);
    }
};

const setupPowerPolling = () => {
    if (powerPollingIntervalId) {
        clearInterval(powerPollingIntervalId);
    }
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
    if (imuPollingIntervalId) {
        clearInterval(imuPollingIntervalId);
    }
    if (powerPollingIntervalId) {
        clearInterval(powerPollingIntervalId);
    }
    // Force motor stop when leaving tab
    if (motorsTestingEnabled.value) {
        stopAllMotors();
    }
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

const sortedMixerListItems = computed(() =>
    sortedMixerList.value.map((m) => ({
        label: m.name.toUpperCase(),
        value: m.pos + 1,
        disabled: m.disabled,
    })),
);

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
        return false;
    }

    const mixerName = mixerList[mixer - 1]?.name;
    if (!mixerName) {
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
            motorSpinValue: idleThrottleValue.value,
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

    // Use the idle throttle value for safe motor spinning
    // This matches the original formula: zeroThrottleValue + (motorIdle * 1000) / 100
    const motorConfig = {
        escProtocolIsDshot: digitalProtocolConfigured.value,
        numberOfMotors: numberOfMotors,
        motorStopValue: minSliderValue.value,
        motorSpinValue: idleThrottleValue.value,
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
const saveAndReboot = async (reboot = true) => {
    // Don't save if no changes
    if (!configHasChanged.value) {
        return;
    }

    try {
        // CRITICAL SAFETY: Stop motor testing and explicitly stop all motors before saving
        // This prevents motors from spinning after reboot due to DShot beacon commands
        if (motorsTestingEnabled.value) {
            motorsTestingEnabled.value = false;
            // Give a small delay for motor testing disable to complete
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Explicitly stop all motors to ensure no spinning after reboot
        stopAllMotors(minSliderValue.value);
        // Give time for motor stop command to be processed
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Send feature config FIRST (for MOTOR_STOP, ESC_SENSOR, 3D features)
        await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

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

        // Save to EEPROM and optionally reboot
        mspHelper.writeConfiguration(reboot);
    } catch (error) {
        console.error("[Motors] Save failed:", error);
    }
};

const stopMotors = () => {
    // Stop motor testing (composable handles all cleanup)
    motorsTestingEnabled.value = false;
};

// Feature Logic

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
    // Track the change for config change detection
    trackChange(featureName, checked);
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
    const defaultMotorCount = 4;

    // Early return if mixer is invalid
    if (mixer <= 0 || mixer > mixerList.length) {
        return defaultMotorCount;
    }

    const expectedMotorCount = mixerList[mixer - 1].motors;
    const firmwareCount = fcStore.motorConfig.motor_count;

    // Find actual valid motor count from motor data
    const actualMotorCount = getActualMotorCount(expectedMotorCount);

    // Return the minimum of firmware count and actual count
    return Math.min(firmwareCount, actualMotorCount);
});

// Helper function to extract motor count logic
const getActualMotorCount = (expectedMotorCount) => {
    // Check if motor data is available
    if (!fcStore.motorData || fcStore.motorData.length === 0) {
        return expectedMotorCount;
    }

    // Find first zero value to determine valid count
    const firstZeroIndex = fcStore.motorData.indexOf(0);

    if (firstZeroIndex === -1) {
        return expectedMotorCount; // No zero found, all motors valid
    }

    return firstZeroIndex > 0 ? firstZeroIndex : expectedMotorCount;
};

const maxSliderValue = computed(() => {
    if (digitalProtocolConfigured.value) {
        return 2000;
    }
    return fcStore.motorConfig.maxthrottle;
});

const idleThrottleValue = computed(() => {
    return zeroThrottleValue.value + (fcStore.pidAdvancedConfig.motorIdle * 1000) / 100;
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

const onMotorSliderChange = () => {
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

const onMotorValueUpdate = (index, val) => {
    motorValues.value[index] = val;
    onMotorSliderChange();
};

const onMasterValueUpdate = (val) => {
    masterValue.value = val;
    onMasterSliderChange();
};

const onSliderWheel = (index, event) => {
    if (!motorsTestingEnabled.value) {
        return;
    }

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
        onMotorSliderChange();
    }
};

// Clear buffered motor commands when testing is disabled
watch(motorsTestingEnabled, (enabled) => {
    if (!enabled) {
        if (bufferDelay) {
            clearTimeout(bufferDelay);
            bufferDelay = null;
            bufferingSetMotor = [];
        }
    }
});

// Telemetry Logic
const getMotorValue = (index) => {
    // Match original getMotorOutputs: show FC-reported motor data during testing,
    // zero throttle otherwise. This ensures bars reflect actual motor output whether
    // controlled via sliders (MSP_SET_MOTOR) or via RC input.
    if (motorsTestingEnabled.value) {
        return fcStore.motorData[index] ?? zeroThrottleValue.value;
    }
    return zeroThrottleValue.value;
};

const getMotorBarHeight = (index) => {
    const val = getMotorValue(index);
    const min = minSliderValue.value;
    const max = maxSliderValue.value;
    const range = max - min;
    if (range === 0) {
        return 0;
    }
    return Math.max(0, Math.min(100, ((val - min) / range) * 100));
};

const getTelemetryHtml = (index) => {
    if (!fcStore.motorConfig.use_dshot_telemetry && !isFeatureEnabled("ESC_SENSOR")) {
        return "&nbsp;";
    }
    if (!fcStore.motorTelemetryData || !fcStore.motorTelemetryData.rpm) {
        return "&nbsp;";
    }

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
    // Clear any pending buffered commands
    if (bufferDelay) {
        clearTimeout(bufferDelay);
        bufferDelay = null;
    }
    // ensure disarmed safety - use proper stop values, not 0
    if (motorsTestingEnabled.value) {
        sendMotorCommand(new Array(8).fill(minSliderValue.value));
    }
});
</script>

<!-- D3/SVG graph styles — cannot be expressed as Tailwind (generated by D3 at runtime) -->
<style>
.tab-motors .grid .tick {
    stroke: silver;
    stroke-width: 1px;
    shape-rendering: crispEdges;
}
.tab-motors .grid path {
    stroke-width: 0;
}
.tab-motors .data .line {
    stroke-width: 2px;
    fill: none;
}
.tab-motors svg text {
    stroke: none;
    fill: var(--text);
    font-size: 10px;
}
/* Telemetry warning — class generated in getTelemetryHtml() */
.tab-motors .warning {
    color: var(--error-500);
}
</style>
