<template>
    <BaseTab tab-name="failsafe">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabFailsafe')"></div>
            <div class="cf_doc_version_bt">
                <WikiButton docUrl="Failsafe" />
            </div>

            <UiBox type="warning" highlight class="mb-4">
                <p class="text-sm" v-html="$t('failsafeFeaturesHelpNew')"></p>
            </UiBox>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- Left Column -->
                <div class="flex flex-col gap-4">
                    <!-- Pulse Range Settings -->
                    <UiBox type="neutral" :title="$t('failsafePulsrangeTitle')" :help="$t('failsafePulsrangeHelp')">
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
                    <UiBox
                        type="neutral"
                        :title="$t('failsafeChannelFallbackSettingsTitle')"
                        :help="$t('failsafeChannelFallbackSettingsHelp')"
                    >
                        <div class="grid grid-cols-[minmax(10rem,1fr)_7rem_5rem] gap-x-3 gap-y-1.5 items-center">
                            <template v-for="(channel, index) in activeChannels" :key="index">
                                <div>
                                    <span class="font-semibold text-sm">{{ channel.name }}</span>
                                    <span v-if="channel.assignment" v-html="channel.assignment" class="ml-1"></span>
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
                    <UiBox type="neutral" :title="$t('failsafeSwitchTitle')">
                        <SettingRow :label="$t('failsafeSwitchModeItem')" :help="$t('failsafeSwitchModeHelp')">
                            <USelect
                                v-model="failsafeConfig.failsafe_switch_mode"
                                :items="switchModeItems"
                                class="min-w-32"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- Stage 2 Settings -->
                    <UiBox type="neutral" :title="$t('failsafeStageTwoSettingsTitle')">
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
                                        :min="0"
                                        :max="250"
                                        :step="0.1"
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
                                        :min="20"
                                        :max="100"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-16"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueInitialClimb')"
                                    :help="$t('failsafeGpsRescueInitialClimbHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.initialClimbM"
                                        :min="0"
                                        :max="100"
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
                                        :min="1"
                                        :max="25"
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
                                        :min="3"
                                        :max="30"
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
                                        :min="0"
                                        :max="200"
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
                                        :min="30"
                                        :max="500"
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
                                        :min="1"
                                        :max="5"
                                        :step="0.1"
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
                                        :min="1000"
                                        :max="2000"
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
                                        :min="1000"
                                        :max="2000"
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
                                        :min="1000"
                                        :max="2000"
                                        :step="1"
                                        :disabled="isGpsSettingsDisabled"
                                        size="xs"
                                        orientation="vertical"
                                        :format-options="{ useGrouping: false }"
                                        class="w-20"
                                    />
                                </SettingRow>
                                <SettingRow
                                    :label="$t('failsafeGpsRescueItemMinDth')"
                                    :help="$t('failsafeGpsRescueItemMinDthHelp')"
                                >
                                    <UInputNumber
                                        v-model="gpsRescue.minStartDistM"
                                        :min="50"
                                        :max="1000"
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
                                        :min="5"
                                        :max="50"
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
                                        size="sm"
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
                :color="configHasChanged ? 'success' : 'neutral'"
                @click="saveConfig"
            />
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref, watch, onMounted, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useNavigationStore } from "@/stores/navigation";
import { useReboot } from "@/composables/useReboot";
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
import { API_VERSION_1_41 } from "@/js/data_storage";
import GUI from "@/js/gui";

// Procedure illustration images (same pattern as GpsTab's loadingBarsUrl)
const procedureDropImage = new URL("../../images/icons/cf_failsafe_procedure1.svg", import.meta.url).href;
const procedureLandImage = new URL("../../images/icons/cf_failsafe_procedure2.svg", import.meta.url).href;
const procedureGpsImage = new URL("../../images/icons/cf_failsafe_procedure4.svg", import.meta.url).href;

const t = (key) => i18n.getMessage(key);
const fcStore = useFlightControllerStore();
const navigationStore = useNavigationStore();
const { reboot } = useReboot();

const isSaving = ref(false);

// --- Data loading ---

const loadConfig = async () => {
    try {
        await MSP.promise(MSPCodes.MSP_RX_CONFIG);
        await MSP.promise(MSPCodes.MSP_FAILSAFE_CONFIG);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
            await MSP.promise(MSPCodes.MSP_GPS_RESCUE);
        }

        await MSP.promise(MSPCodes.MSP_RXFAIL_CONFIG);
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_MODE_RANGES);
    } catch (e) {
        console.error("Failed to load Failsafe configuration", e);
    }
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

const procedureImage = computed(() => {
    const map = { 1: procedureDropImage, 0: procedureLandImage, 2: procedureGpsImage };
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
        auxAssignments.push("");
    }

    if (rssiConfig.value && typeof rssiConfig.value.channel !== "undefined") {
        const index = rssiConfig.value.channel - 5;
        if (index >= 0 && index < auxAssignments.length) {
            auxAssignments[index] +=
                '<span class="bg-neutral-600 text-white text-xs font-semibold px-1 rounded border border-neutral-500 mr-0.5">RSSI</span>';
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
                auxAssignments[modeRange.auxChannelIndex] +=
                    `<span class="bg-neutral-600 text-white text-xs font-semibold px-1 rounded border border-neutral-500 mr-0.5">${modeName}</span>`;
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
                assignment: auxAssignments[auxAssignmentIndex++] || "",
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

// --- Value conversions (stored as x10 or x100) ---

const failsafeDelay = computed({
    get: () => failsafeConfig.value.failsafe_delay / 10,
    set: (val) => (failsafeConfig.value.failsafe_delay = Math.round(Number(val) * 10)),
});

const failsafeThrottleLowDelay = computed({
    get: () => failsafeConfig.value.failsafe_throttle_low_delay / 10,
    set: (val) => (failsafeConfig.value.failsafe_throttle_low_delay = Math.round(Number(val) * 10)),
});

const failsafeOffDelay = computed({
    get: () => failsafeConfig.value.failsafe_off_delay / 10,
    set: (val) => (failsafeConfig.value.failsafe_off_delay = Math.round(Number(val) * 10)),
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

const saveConfig = async () => {
    if (isSaving.value) return;
    isSaving.value = true;

    try {
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

        await new Promise((resolve) => {
            mspHelper.writeConfiguration(false, () => {
                navigationStore.cleanup(() => {
                    reboot();
                    resolve();
                });
            });
        });
    } catch (e) {
        console.error("Failed to save configuration", e);
    } finally {
        isSaving.value = false;
    }
};

onMounted(async () => {
    await loadConfig();
    initializeDefaults();
    await nextTick();
    GUI.content_ready();
});
</script>
