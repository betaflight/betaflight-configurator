<template>
    <BaseTab tab-name="failsafe">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabFailsafe')"></div>
            <WikiButton docUrl="Failsafe" />

            <UiBox type="warning" highlight class="mb-4">
                <p class="text-sm" v-html="$t('failsafeFeaturesHelpNew')"></p>
            </UiBox>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- Left Column -->
                <div class="flex flex-col gap-4">
                    <!-- Pulse Range Settings -->
                    <UiBox :title="$t('failsafePulsrangeTitle')" type="neutral" collapsible>
                        <SettingRow :label="$t('failsafeRxMinUsecItem')">
                            <UInputNumber
                                v-model="rxConfig.rx_min_usec"
                                :min="750"
                                :max="2250"
                                :step="1"
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-20"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('failsafeRxMaxUsecItem')">
                            <UInputNumber
                                v-model="rxConfig.rx_max_usec"
                                :min="750"
                                :max="2250"
                                :step="1"
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-20"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- Channel Fallback Settings -->
                    <UiBox :title="$t('failsafeChannelFallbackSettingsTitle')" type="neutral" collapsible>
                        <div class="grid grid-cols-[minmax(10rem,1fr)_7rem_5rem] gap-x-3 gap-y-1.5 items-center">
                            <template v-for="(channel, index) in activeChannels" :key="index">
                                <div>
                                    <span class="font-semibold text-sm">{{ channel.name }}</span>
                                    <span v-if="channel.assignments?.length" class="ml-1 inline-flex flex-wrap gap-0.5">
                                        <UBadge
                                            v-for="(badge, i) in channel.assignments"
                                            :key="i"
                                            :label="badge.label"
                                            color="neutral"
                                            variant="subtle"
                                        />
                                    </span>
                                </div>
                                <USelect
                                    v-model="rxFailConfig[index].mode"
                                    :items="channelModeItems(index)"
                                    size="xs"
                                />
                                <UInputNumber
                                    v-if="rxFailConfig[index].mode === 2"
                                    v-model="rxFailConfig[index].value"
                                    :min="750"
                                    :max="2250"
                                    :step="25"
                                    size="xs"
                                    orientation="vertical"
                                    :format-options="{ useGrouping: false }"
                                    class="w-full"
                                />
                                <div v-else />
                            </template>
                        </div>
                    </UiBox>
                </div>

                <!-- Right Column -->
                <div class="flex flex-col gap-4">
                    <!-- Failsafe Switch -->
                    <UiBox :title="$t('failsafeSwitchTitle')" type="neutral" collapsible>
                        <SettingRow :label="$t('failsafeSwitchModeItem')" :help="$t('failsafeSwitchModeHelp')">
                            <USelect
                                v-model="failsafeConfig.failsafe_switch_mode"
                                :items="switchModeItems"
                                class="min-w-32"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- Stage 2 Settings -->
                    <UiBox :title="$t('failsafeStageTwoSettingsTitle')" type="neutral" collapsible>
                        <SettingRow :label="$t('failsafeDelayItem')" :help="$t('failsafeDelayHelp')">
                            <UInputNumber
                                v-model="failsafeDelay"
                                :min="1"
                                :max="20"
                                :step="0.1"
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('failsafeThrottleLowItem')" :help="$t('failsafeThrottleLowHelp')">
                            <UInputNumber
                                v-model="failsafeThrottleLowDelay"
                                :min="0"
                                :max="30"
                                :step="0.1"
                                size="xs"
                                orientation="vertical"
                                :format-options="{ useGrouping: false }"
                                class="w-16"
                            />
                        </SettingRow>

                        <!-- Procedure selector -->
                        <div class="mt-4 pt-4 border-t border-(--ui-border)">
                            <div class="text-sm font-semibold mb-2" v-html="$t('failsafeSubTitle1')"></div>
                            <USelect
                                v-model="failsafeConfig.failsafe_procedure"
                                :items="procedureItems"
                                class="min-w-40 mb-3"
                            />

                            <img
                                v-if="procedureImage"
                                :src="procedureImage"
                                alt=""
                                aria-hidden="true"
                                class="h-24 opacity-70 mb-3"
                            />

                            <!-- Land settings -->
                            <div v-if="failsafeConfig.failsafe_procedure === 0" class="flex flex-col gap-2">
                                <SettingRow :label="$t('failsafeThrottleItem')">
                                    <UInputNumber
                                        v-model="failsafeConfig.failsafe_throttle"
                                        :min="0"
                                        :max="2000"
                                        :step="1"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-20"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeOffDelayItem')" :help="$t('failsafeOffDelayHelp')">
                                    <UInputNumber
                                        v-model="failsafeOffDelay"
                                        :min="limits.offDelay.min"
                                        :max="limits.offDelay.max"
                                        :step="offDelayStep"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                            </div>

                            <!-- GPS Rescue settings -->
                            <div v-if="showGpsRescue" class="flex flex-col gap-2">
                                <SettingRow :label="$t('failsafeGpsRescueItemAltitudeMode')">
                                    <USelect
                                        v-model="gpsRescue.altitudeMode"
                                        :items="altitudeModeItems"
                                        :disabled="isGpsSettingsDisabled"
                                        class="min-w-32"
                                        size="xs"
                                    />
                                </SettingRow>
                                <SettingRow
                                    v-if="gpsRescue.altitudeMode === 1"
                                    :label="$t('failsafeGpsRescueItemReturnAltitude')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.returnAltitudeM"
                                        :min="limits.returnAltitude.min"
                                        :max="limits.returnAltitude.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow
                                    v-if="showInitialClimb"
                                    :label="$t('failsafeGpsRescueInitialClimb')"
                                    :help="$t('failsafeGpsRescueInitialClimbHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.initialClimbM"
                                        :min="limits.initialClimb.min"
                                        :max="limits.initialClimb.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemAscendRate')">
                                    <UInputNumber
                                        v-model="gpsRescueAscendRate"
                                        :min="limits.ascendRate.min"
                                        :max="limits.ascendRate.max"
                                        :step="0.1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemGroundSpeed')">
                                    <UInputNumber
                                        v-model="gpsRescueGroundSpeed"
                                        :min="limits.groundSpeed.min"
                                        :max="limits.groundSpeed.max"
                                        :step="0.1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueItemAngle')"
                                    :help="$t('failsafeGpsRescueAngleHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.angle"
                                        :min="limits.angle.min"
                                        :max="limits.angle.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemDescentDistance')">
                                    <UInputNumber
                                        v-model="gpsRescue.descentDistanceM"
                                        :min="limits.descentDistance.min"
                                        :max="limits.descentDistance.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueItemDescendRate')"
                                    :help="$t('failsafeGpsRescueDescendRateHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescueDescendRate"
                                        :min="limits.descendRate.min"
                                        :max="limits.descendRate.max"
                                        :step="0.05"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemThrottleMin')">
                                    <UInputNumber
                                        v-model="gpsRescue.throttleMin"
                                        :min="limits.throttleMin.min"
                                        :max="limits.throttleMin.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-20"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueItemThrottleMax')"
                                    :help="$t('failsafeGpsRescueThrottleMaxHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.throttleMax"
                                        :min="limits.throttleMax.min"
                                        :max="limits.throttleMax.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-20"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueItemThrottleHover')"
                                    :help="$t('failsafeGpsRescueThrottleHoverHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.throttleHover"
                                        :min="limits.throttleHover.min"
                                        :max="limits.throttleHover.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-20"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemMinDth')" :help="minStartDistHelp">
                                    <UInputNumber
                                        v-model="gpsRescue.minStartDistM"
                                        :min="limits.minStartDist.min"
                                        :max="limits.minStartDist.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-20"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemMinSats')">
                                    <UInputNumber
                                        v-model="gpsRescue.minSats"
                                        :min="limits.minSats.min"
                                        :max="limits.minSats.max"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueItemAllowArmingWithoutFix')"
                                    :help="$t('failsafeGpsRescueArmWithoutFixHelp')"
                                >
                                    <USwitch
                                        v-model="gpsRescueAllowArmingWithoutFix"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('failsafeGpsRescueItemSanityChecks')">
                                    <USelect
                                        v-model="gpsRescue.sanityChecks"
                                        :items="sanityCheckItems"
                                        :disabled="isGpsSettingsDisabled"
                                        class="min-w-28"
                                        size="xs"
                                    />
                                </SettingRow>
                            </div>
                        </div>
                    </UiBox>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <UButton
                :label="$t('configurationButtonSave')"
                :disabled="!configHasChanged"
                size="xs"
                @click="saveConfig"
            />
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref, watch, onMounted, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useReboot } from "@/composables/useReboot";
import { useSaving } from "@/composables/useSaving";
import { runTabLoad } from "@/composables/useTabLoad";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { i18n } from "@/js/localization";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import adjustBoxNameIfPeripheralWithModeID from "@/js/peripherals";
import semver from "semver";
import {
    API_VERSION_1_41,
    API_VERSION_1_45,
    API_VERSION_1_46,
    API_VERSION_1_47,
    API_VERSION_1_48,
} from "@/js/data_storage";
import GUI from "@/js/gui";

// Procedure illustration images (same pattern as GpsTab's loadingBarsUrl)
const procedureDropImage = new URL("../../images/icons/cf_failsafe_procedure1.svg", import.meta.url).href;
const procedureLandImage = new URL("../../images/icons/cf_failsafe_procedure2.svg", import.meta.url).href;
const procedureGpsImage = new URL("../../images/icons/cf_failsafe_procedure4.svg", import.meta.url).href;
const procedureDropImageDark = new URL("../../images/icons/cf_failsafe_procedure1-dark.svg", import.meta.url).href;
const procedureLandImageDark = new URL("../../images/icons/cf_failsafe_procedure2-dark.svg", import.meta.url).href;
const procedureGpsImageDark = new URL("../../images/icons/cf_failsafe_procedure4-dark.svg", import.meta.url).href;

const t = (key) => i18n.getMessage(key);
const fcStore = useFlightControllerStore();
const { saveAndReboot } = useReboot();

const { runSave } = useSaving();

// --- Data loading ---

const loadConfig = async () => {
    await runTabLoad(
        async () => {
            await MSP.promise(MSPCodes.MSP_RX_CONFIG);
            await MSP.promise(MSPCodes.MSP_FAILSAFE_CONFIG);

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
                await MSP.promise(MSPCodes.MSP_GPS_RESCUE);
            }

            await MSP.promise(MSPCodes.MSP_RXFAIL_CONFIG);
            await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
            await MSP.promise(MSPCodes.MSP_BOXNAMES);
            await MSP.promise(MSPCodes.MSP_BOXIDS);
            await MSP.promise(MSPCodes.MSP_RC);
            await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
            await MSP.promise(MSPCodes.MSP_MODE_RANGES);
        },
        (e) => console.error("Failed to load Failsafe configuration", e),
    );
};

// --- Store data refs ---

const rxConfig = computed(() => fcStore.rxConfig);
const rxFailConfig = computed(() => fcStore.rxFailConfig);
const failsafeConfig = computed(() => fcStore.failsafeConfig);
const gpsRescue = computed(() => fcStore.gpsRescue);
const gpsConfig = computed(() => fcStore.gpsConfig);
const rc = computed(() => fcStore.rc);
const auxConfig = computed(() => fcStore.auxConfig);
const auxConfigIds = computed(() => fcStore.auxConfigIds);
const modeRanges = computed(() => fcStore.modeRanges);
const rssiConfig = computed(() => fcStore.rssiConfig);

// --- Dirty state tracking ---

const configDefaults = ref({});
const configChanges = ref({});
const configHasChanged = computed(() => Object.keys(configChanges.value).length > 0);

const initializeDefaults = () => {
    configDefaults.value = {
        rxConfig: JSON.stringify({ rx_min_usec: rxConfig.value.rx_min_usec, rx_max_usec: rxConfig.value.rx_max_usec }),
        failsafeConfig: JSON.stringify(failsafeConfig.value),
        gpsRescue: gpsRescue.value ? JSON.stringify(gpsRescue.value) : null,
        rxFailConfig: JSON.stringify(rxFailConfig.value),
    };
    configChanges.value = {};
};

const trackChange = (key, newValue) => {
    if (newValue === configDefaults.value[key]) {
        delete configChanges.value[key];
    } else {
        configChanges.value[key] = newValue;
    }
};

watch(
    () => JSON.stringify({ rx_min_usec: rxConfig.value.rx_min_usec, rx_max_usec: rxConfig.value.rx_max_usec }),
    (val) => trackChange("rxConfig", val),
);
watch(
    () => JSON.stringify(failsafeConfig.value),
    (val) => trackChange("failsafeConfig", val),
);
watch(
    () => (gpsRescue.value ? JSON.stringify(gpsRescue.value) : null),
    (val) => trackChange("gpsRescue", val),
);
watch(
    () => JSON.stringify(rxFailConfig.value),
    (val) => trackChange("rxFailConfig", val),
);

// --- Select item lists ---

const switchModeItems = computed(() => [
    { label: t("failsafeSwitchOptionStage1"), value: 0 },
    { label: t("failsafeSwitchOptionStage2"), value: 2 },
    { label: t("failsafeSwitchOptionKill"), value: 1 },
]);

const procedureItems = computed(() => {
    const items = [
        { label: t("failsafeProcedureItemSelect2"), value: 1 }, // Drop
        { label: t("failsafeProcedureItemSelect1"), value: 0 }, // Land
    ];
    if (gpsConfig.value) {
        items.push({ label: t("failsafeProcedureItemSelect4"), value: 2 }); // GPS Rescue
    }
    return items;
});

const isDark = document.documentElement.classList.contains("dark");

const procedureImage = computed(() => {
    const map = isDark
        ? { 1: procedureDropImageDark, 0: procedureLandImageDark, 2: procedureGpsImageDark }
        : { 1: procedureDropImage, 0: procedureLandImage, 2: procedureGpsImage };
    return map[failsafeConfig.value.failsafe_procedure];
});

const channelModeItems = (index) => [
    ...(index < 4 ? [{ label: t("failsafeChannelFallbackSettingsValueAuto"), value: 0 }] : []),
    { label: t("failsafeChannelFallbackSettingsValueHold"), value: 1 },
    { label: t("failsafeChannelFallbackSettingsValueSet"), value: 2 },
];

const altitudeModeItems = computed(() => [
    { label: t("failsafeGpsRescueItemAltitudeModeMaxAlt"), value: 0 },
    { label: t("failsafeGpsRescueItemAltitudeModeFixedAlt"), value: 1 },
    { label: t("failsafeGpsRescueItemAltitudeModeCurrentAlt"), value: 2 },
]);

const sanityCheckItems = computed(() => [
    { label: t("failsafeGpsRescueItemSanityChecksOff"), value: 0 },
    { label: t("failsafeGpsRescueItemSanityChecksOn"), value: 1 },
    { label: t("failsafeGpsRescueItemSanityChecksFSOnly"), value: 2 },
]);

// --- Channel fallback list ---

const activeChannels = computed(() => {
    const channels = [];
    const channelNames = [t("controlAxisRoll"), t("controlAxisPitch"), t("controlAxisYaw"), t("controlAxisThrottle")];

    let auxIndex = 1;
    let auxAssignmentIndex = 0;

    const auxAssignments = [];
    for (let i = 0; i < rc.value.active_channels - 4; i++) {
        auxAssignments.push([]);
    }

    if (rssiConfig.value && typeof rssiConfig.value.channel !== "undefined") {
        const index = rssiConfig.value.channel - 5;
        if (index >= 0 && index < auxAssignments.length) {
            auxAssignments[index].push({ label: "RSSI" });
        }
    }

    for (let modeIndex = 0; modeIndex < auxConfig.value.length; modeIndex++) {
        const modeId = auxConfigIds.value[modeIndex];

        for (let modeRangeIndex = 0; modeRangeIndex < modeRanges.value.length; modeRangeIndex++) {
            const modeRange = modeRanges.value[modeRangeIndex];
            if (modeRange.id !== modeId) continue;

            const range = modeRange.range;
            if (range.start >= range.end) continue;

            const modeName = adjustBoxNameIfPeripheralWithModeID(modeId, auxConfig.value[modeIndex]);

            if (modeRange.auxChannelIndex < auxAssignments.length) {
                auxAssignments[modeRange.auxChannelIndex].push({ label: modeName });
            }
        }
    }

    for (let i = 0; i < rxFailConfig.value.length; i++) {
        if (i < 4) {
            channels.push({ name: channelNames[i] });
        } else {
            const messageKey = `controlAxisAux${auxIndex++}`;
            channels.push({
                name: t(messageKey),
                assignments: auxAssignments[auxAssignmentIndex++] || [],
            });
        }
    }
    return channels;
});

// --- GPS Rescue helpers ---

const hasGpsRescueAsMode = computed(() => {
    for (let modeIndex = 0; modeIndex < auxConfig.value.length; modeIndex++) {
        if (auxConfig.value[modeIndex] === "GPS RESCUE") {
            const modeId = auxConfigIds.value[modeIndex];
            const hasRange = modeRanges.value.some((mr) => mr.id === modeId && mr.range.start < mr.range.end);
            if (hasRange) return true;
        }
    }
    return false;
});

const showGpsRescue = computed(() => {
    return gpsRescue.value && (failsafeConfig.value.failsafe_procedure === 2 || hasGpsRescueAsMode.value);
});

const isGpsSettingsDisabled = computed(() => {
    return failsafeConfig.value.failsafe_procedure !== 2 && !hasGpsRescueAsMode.value;
});

// --- API version dependent input limits ---

const isApiVersion1_46 = computed(() => semver.gte(fcStore.config.apiVersion, API_VERSION_1_46));
const isApiVersion1_47 = computed(() => semver.gte(fcStore.config.apiVersion, API_VERSION_1_47));

// The firmware CLI limits changed with nearly every release, so the inputs have to
// follow the API version of the connected board. Without this they clamp perfectly
// valid values, e.g. minimum start distance to 50m when the firmware allows 5-30m.
//
// Values come from src/main/cli/settings.c of the matching firmware release, in the
// units shown in the UI: the rates are entered in m/s while the firmware stores cm/s.
// The baseline is API 1.44 (4.3), the oldest version the configurator connects to.
const limits = computed(() => {
    const gte = (version) => semver.gte(fcStore.config.apiVersion, version);

    const l = {
        offDelay: { min: 0, max: 20 }, // failsafe_off_delay, tenths of a second
        returnAltitude: { min: 20, max: 100 }, // gps_rescue_initial_alt
        initialClimb: { min: 0, max: 100 }, // only sent over MSP from 1.46
        ascendRate: { min: 1, max: 25 },
        groundSpeed: { min: 0.3, max: 30 }, // 30-3000 cm/s, so 0.3 m/s and not 3
        angle: { min: 0, max: 200 }, // gps_rescue_angle
        descentDistance: { min: 30, max: 500 },
        descendRate: { min: 1, max: 5 },
        throttleMin: { min: 1000, max: 2000 },
        throttleMax: { min: 1000, max: 2000 },
        throttleHover: { min: 1000, max: 2000 },
        minStartDist: { min: 50, max: 1000 }, // gps_rescue_min_dth
        minSats: { min: 5, max: 50 }, // unchanged across all versions
    };

    // 4.4. min_dth becomes min_start_dist, initial_alt becomes return_alt and
    // angle becomes max_rescue_angle. 4.4 released with an angle maximum of 60 and
    // later 1.45 dev builds widened it to 80; take the wider bound so a value stored
    // by such a build is not clamped, MSP_SET_GPS_RESCUE does not range check it.
    if (gte(API_VERSION_1_45)) {
        Object.assign(l, {
            returnAltitude: { min: 2, max: 255 },
            groundSpeed: { min: 0, max: 30 },
            ascendRate: { min: 0.5, max: 25 },
            descendRate: { min: 0.25, max: 5 },
            angle: { min: 0, max: 80 },
            descentDistance: { min: 5, max: 500 },
            minStartDist: { min: 20, max: 1000 },
        });
    }

    // 4.5. Minimum start distance changed meaning: instead of blocking a rescue that
    // starts close to home, the aircraft now flies out to this distance first, hence
    // the much smaller range.
    if (gte(API_VERSION_1_46)) {
        Object.assign(l, {
            returnAltitude: { min: 5, max: 1000 },
            angle: { min: 30, max: 60 },
            descentDistance: { min: 10, max: 500 },
            minStartDist: { min: 10, max: 30 },
        });
    }

    // 4.6. failsafe_off_delay becomes failsafe_landing_time and switches from tenths
    // of a second to whole seconds. The throttles are still carried by MSP_GPS_RESCUE
    // but are read from and written to the autopilot settings, which are narrower.
    if (gte(API_VERSION_1_47)) {
        Object.assign(l, {
            offDelay: { min: 0, max: 250 },
            throttleMin: { min: 1050, max: 1400 },
            throttleMax: { min: 1400, max: 2000 },
            throttleHover: { min: 1100, max: 1700 },
        });
    }

    // 2026.x. Rescue angle moves to autopilot_max_angle.
    if (gte(API_VERSION_1_48)) {
        Object.assign(l, {
            angle: { min: 10, max: 70 },
            descentDistance: { min: 5, max: 500 },
            throttleHover: { min: 0, max: 1700 },
            minStartDist: { min: 5, max: 30 },
        });
    }

    return l;
});

// Initial climb was introduced in 1.46, and the minimum start distance changed
// meaning in the same release, so it needs the updated explanation.
const showInitialClimb = isApiVersion1_46;
const minStartDistHelp = computed(() =>
    isApiVersion1_46.value ? t("failsafeGpsRescueItemMinStartDistHelp") : t("failsafeGpsRescueItemMinDthHelp"),
);

// --- Value conversions (stored as x10 or x100) ---

const failsafeDelay = computed({
    get: () => failsafeConfig.value.failsafe_delay / 10,
    set: (val) => (failsafeConfig.value.failsafe_delay = Math.round(Number(val) * 10)),
});

const failsafeThrottleLowDelay = computed({
    get: () => failsafeConfig.value.failsafe_throttle_low_delay / 10,
    set: (val) => (failsafeConfig.value.failsafe_throttle_low_delay = Math.round(Number(val) * 10)),
});

// Tenths of a second up to 1.46. From 1.47 the setting is failsafe_landing_time and
// the firmware stores whole seconds, so it needs no conversion and steps by 1.
const offDelayScale = computed(() => (isApiVersion1_47.value ? 1 : 10));
const offDelayStep = computed(() => (isApiVersion1_47.value ? 1 : 0.1));

const failsafeOffDelay = computed({
    get: () => failsafeConfig.value.failsafe_off_delay / offDelayScale.value,
    set: (val) => (failsafeConfig.value.failsafe_off_delay = Math.round(Number(val) * offDelayScale.value)),
});

const gpsRescueGroundSpeed = computed({
    get: () => gpsRescue.value.groundSpeed / 100,
    set: (val) => (gpsRescue.value.groundSpeed = Math.round(Number(val) * 100)),
});

const gpsRescueAscendRate = computed({
    get: () => gpsRescue.value.ascendRate / 100,
    set: (val) => (gpsRescue.value.ascendRate = Math.round(Number(val) * 100)),
});

const gpsRescueDescendRate = computed({
    get: () => gpsRescue.value.descendRate / 100,
    set: (val) => (gpsRescue.value.descendRate = Math.round(Number(val) * 100)),
});

const gpsRescueAllowArmingWithoutFix = computed({
    get: () => gpsRescue.value.allowArmingWithoutFix > 0,
    set: (val) => (gpsRescue.value.allowArmingWithoutFix = val ? 1 : 0),
});

// --- Save ---

const saveConfig = () =>
    runSave(
        async () => {
            await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_FAILSAFE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FAILSAFE_CONFIG));

            await new Promise((resolve) => {
                mspHelper.sendRxFailConfig(resolve);
            });

            await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
                await MSP.promise(MSPCodes.MSP_SET_GPS_RESCUE, mspHelper.crunch(MSPCodes.MSP_SET_GPS_RESCUE));
            }

            initializeDefaults();

            await saveAndReboot();
        },
        {
            onError: (e) => console.error("Failed to save configuration", e),
        },
    );

onMounted(async () => {
    await loadConfig();
    initializeDefaults();
    await nextTick();
    GUI.content_ready();
});
</script>
