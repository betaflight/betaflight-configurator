import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { OSD } from "../components/tabs/osd/osd";
import { FONT, SYM } from "../js/utils/osdFont";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { OSD_CONSTANTS } from "../components/tabs/osd/osd_constants";
import semver from "semver";
import { useFlightControllerStore } from "./fc";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../js/data_storage";

function encodeStatisticsPayload(statItem, isVirtualMode, virtualMode) {
    if (isVirtualMode && virtualMode) {
        virtualMode.statisticsState[statItem.index] = statItem.enabled;
    }

    const buffer = [];
    buffer.push8(statItem.index);
    buffer.push16(statItem.enabled ? 1 : 0);
    buffer.push8(0);
    return buffer;
}

async function fetchOsdInfo(fcStore) {
    if (CONFIGURATOR.virtualMode) {
        return undefined;
    }

    if (fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
        await MSP.promise(MSPCodes.MSP_OSD_CANVAS);
    }

    return MSP.promise(MSPCodes.MSP_OSD_CONFIG);
}

async function decodeOsdData(info) {
    OSD.loadDisplayFields();
    OSD.chooseFields();

    if (CONFIGURATOR.virtualMode) {
        const { default: VirtualFC } = await import("../js/VirtualFC.js");
        VirtualFC.setupVirtualOSD();

        if (OSD.msp.decodeVirtual) {
            OSD.msp.decodeVirtual();
        }
        return;
    }

    OSD.msp.decode(info);
    await MSP.promise(MSPCodes.MSP_RX_CONFIG);
}

async function ensureDefaultFontLoaded() {
    if (FONT.data?.characters?.length > 0) {
        return;
    }

    try {
        const response = await fetch("./resources/osd/2/default.mcm");
        const data = await response.text();
        FONT.parseMCMFontFile(data);
    } catch (fontError) {
        console.warn("Failed to load default OSD font:", fontError);
    }
}

export const useOsdStore = defineStore("osd", () => {
    // Core OSD data state
    const videoSystem = ref(null);
    const unitMode = ref(null);
    const alarms = ref({});
    const statItems = ref([]);
    const warnings = ref([]);
    const displayItems = ref([]);
    const timers = ref([]);
    const osdProfiles = ref({
        number: 1,
        selected: 0,
    });

    // OSD state flags
    const state = reactive({
        haveSomeOsd: false,
        haveMax7456Video: false,
        haveMax7456Configured: false,
        haveMax7456FontDeviceConfigured: false,
        isMax7456FontDeviceDetected: false,
        haveOsdFeature: false,
        isMspDevice: false,
        haveAirbotTheiaOsdDevice: false,
    });

    // Display size based on video system
    const displaySize = reactive({
        x: 30,
        y: 16,
        total: 480,
    });

    // OSD parameters
    const parameters = reactive({
        cameraFrameWidth: 24,
        cameraFrameHeight: 11,
        overlayRadioMode: 0,
    });

    // Currently selected preview profile
    const selectedPreviewProfile = ref(0);

    // Dirty state tracking
    const savedSnapshot = ref("");

    function takeSnapshot() {
        return JSON.stringify({
            videoSystem: videoSystem.value,
            unitMode: unitMode.value,
            parameters: {
                cameraFrameWidth: parameters.cameraFrameWidth,
                cameraFrameHeight: parameters.cameraFrameHeight,
                overlayRadioMode: parameters.overlayRadioMode,
            },
            alarms: Object.fromEntries(
                Object.entries(alarms.value).map(([key, alarm]) => [key, { value: alarm.value }]),
            ),
            statItems: statItems.value.map(({ index, enabled }) => ({ index, enabled })),
            warnings: warnings.value.map(({ index, enabled }) => ({ index, enabled })),
            displayItems: displayItems.value.map(({ index, position, variant, isVisible }) => ({
                index,
                position,
                variant,
                isVisible: [...isVisible],
            })),
            timers: timers.value.map(({ index, src, precision, alarm }) => ({ index, src, precision, alarm })),
            osdProfiles: {
                number: osdProfiles.value.number,
                selected: osdProfiles.value.selected,
            },
        });
    }

    function captureSnapshot() {
        savedSnapshot.value = takeSnapshot();
    }

    const dirty = computed(() => {
        return savedSnapshot.value !== "" && takeSnapshot() !== savedSnapshot.value;
    });

    // Video system constants
    const VIDEO_COLS = {
        PAL: 30,
        NTSC: 30,
        HD: 53,
    };

    const VIDEO_ROWS = {
        PAL: 16,
        NTSC: 13,
        HD: 20,
    };

    // Getters
    const numberOfProfiles = computed(() => osdProfiles.value.number || 1);

    const currentPreviewProfile = computed(() => selectedPreviewProfile.value);

    const isSupported = computed(() => Boolean(state.haveSomeOsd));

    // Actions
    function initData() {
        videoSystem.value = null;
        unitMode.value = null;
        alarms.value = {};
        statItems.value = [];
        warnings.value = [];
        displayItems.value = [];
        timers.value = [];
        osdProfiles.value = { number: 1, selected: 0 };
    }

    function updateDisplaySize() {
        const videoType = OSD.constants.VIDEO_TYPES[videoSystem.value];
        if (videoType) {
            displaySize.x = VIDEO_COLS[videoType] || 30;
            displaySize.y = VIDEO_ROWS[videoType] || 16;
            displaySize.total = displaySize.x * displaySize.y;
        }
    }

    function setSelectedPreviewProfile(profile) {
        selectedPreviewProfile.value = profile;
    }

    // Update display item visibility for a specific profile
    function updateDisplayItemVisibility(itemIndex, profileIndex, visible) {
        if (displayItems.value[itemIndex]) {
            displayItems.value[itemIndex].isVisible[profileIndex] = visible;
        }
    }

    // Sync state to legacy OSD.data object for compatibility
    function syncToLegacy() {
        OSD.data.video_system = videoSystem.value;
        OSD.data.unit_mode = unitMode.value;
        OSD.data.alarms = alarms.value;
        OSD.data.statItems = statItems.value;
        OSD.data.warnings = warnings.value;
        OSD.data.displayItems = displayItems.value;
        OSD.data.timers = timers.value;
        OSD.data.osd_profiles = osdProfiles.value;
        OSD.data.displaySize = displaySize;
        OSD.data.state = state;
        OSD.data.parameters = parameters;
    }

    function syncStoreFromDecodedOsdData() {
        videoSystem.value = OSD.data.video_system;
        unitMode.value = OSD.data.unit_mode;
        alarms.value = OSD.data.alarms ? structuredClone(OSD.data.alarms) : {};
        statItems.value = structuredClone(OSD.data.statItems);
        warnings.value = structuredClone(OSD.data.warnings);
        timers.value = structuredClone(OSD.data.timers);
        displayItems.value = structuredClone(OSD.data.displayItems);

        if (OSD.data.parameters) {
            parameters.cameraFrameWidth = OSD.data.parameters.cameraFrameWidth;
            parameters.cameraFrameHeight = OSD.data.parameters.cameraFrameHeight;
            parameters.overlayRadioMode = OSD.data.parameters.overlayRadioMode;
        }

        if (OSD.data.osd_profiles) {
            osdProfiles.value = {
                number: OSD.data.osd_profiles.number,
                selected: OSD.data.osd_profiles.selected,
            };
        }

        if (OSD.data.state) {
            Object.assign(state, OSD.data.state);
        }

        updateDisplaySize();
    }

    const fetchOsdConfig = async () => {
        const fcStore = useFlightControllerStore();

        try {
            SYM.loadSymbols();
            FONT.initData();

            const info = await fetchOsdInfo(fcStore);
            await decodeOsdData(info);
            syncStoreFromDecodedOsdData();
            await ensureDefaultFontLoaded();
            captureSnapshot();
        } catch (e) {
            console.error("Failed to fetch OSD config", e);
            throw e;
        }
    };

    // MSP Helper methods
    const helpers = {
        pack: {
            position(displayItem) {
                const isVisible = displayItem.isVisible;
                const position = displayItem.position;
                const variant = displayItem.variant;

                let packed_visible = 0;
                for (let osd_profile = 0; osd_profile < numberOfProfiles.value; osd_profile++) {
                    packed_visible |= isVisible[osd_profile] ? OSD_CONSTANTS.VISIBLE << osd_profile : 0;
                }
                const variantSelected = variant << 14;
                const xpos = position % displaySize.x;
                const ypos = (position - xpos) / displaySize.x;

                return (
                    packed_visible | variantSelected | ((ypos & 0x001f) << 5) | ((xpos & 0x0020) << 5) | (xpos & 0x001f)
                );
            },
            timer(timer) {
                return (timer.src & 0x0f) | ((timer.precision & 0x0f) << 4) | ((timer.alarm & 0xff) << 8);
            },
        },
    };

    function getAlarmValue(key) {
        return alarms.value[key]?.value ?? 0;
    }

    function pushAlarm8(result, key) {
        result.push8(getAlarmValue(key));
    }

    function pushAlarm16(result, key) {
        result.push16(getAlarmValue(key));
    }

    function encodeOther() {
        const fcStore = useFlightControllerStore();
        const apiVersion = fcStore.config.apiVersion;

        const result = [-1, videoSystem.value];
        if (state.haveOsdFeature) {
            result.push8(unitMode.value);
            pushAlarm8(result, "rssi");
            pushAlarm16(result, "cap");

            result.push16(0); // This value is unused by the firmware with configurable timers
            pushAlarm16(result, "alt");

            let warningFlags = 0;
            // warnings is array of objects { enabled: bool }
            for (let i = 0; i < warnings.value.length; i++) {
                if (warnings.value[i].enabled) {
                    warningFlags |= 1 << i;
                }
            }

            if (CONFIGURATOR.virtualMode && OSD.virtualMode) {
                OSD.virtualMode.warningFlags = warningFlags;
            }

            result.push16(warningFlags);
            result.push32(warningFlags);

            result.push8(osdProfiles.value.selected + 1);

            result.push8(parameters.overlayRadioMode);

            result.push8(parameters.cameraFrameWidth);
            result.push8(parameters.cameraFrameHeight);

            if (semver.gte(apiVersion, API_VERSION_1_46)) {
                pushAlarm16(result, "link_quality");
            }

            if (semver.gte(apiVersion, API_VERSION_1_47)) {
                pushAlarm16(result, "rssi_dbm");
            }
        }
        return result;
    }

    function encodeLayout(displayItem) {
        if (CONFIGURATOR.virtualMode && OSD.virtualMode) {
            OSD.virtualMode.itemPositions[displayItem.index] = helpers.pack.position(displayItem);
        }

        const buffer = [];
        buffer.push8(displayItem.index);
        buffer.push16(helpers.pack.position(displayItem));
        return buffer;
    }

    function encodeTimer(timer) {
        if (CONFIGURATOR.virtualMode && OSD.virtualMode) {
            if (!OSD.virtualMode.timerData[timer.index]) {
                OSD.virtualMode.timerData[timer.index] = {};
            }
            OSD.virtualMode.timerData[timer.index].src = timer.src;
            OSD.virtualMode.timerData[timer.index].precision = timer.precision;
            OSD.virtualMode.timerData[timer.index].alarm = timer.alarm;
        }

        const buffer = [-2, timer.index];
        buffer.push16(helpers.pack.timer(timer));
        return buffer;
    }

    // New Actions
    const saveDisplayItem = async (item) => {
        return MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeLayout(item));
    };

    const saveOtherConfig = async () => {
        return MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeOther());
    };

    const saveTimerConfig = async (timer) => {
        return MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeTimer(timer));
    };

    const saveStatisticItem = async (stat) => {
        return MSP.promise(
            MSPCodes.MSP_SET_OSD_CONFIG,
            encodeStatisticsPayload(stat, CONFIGURATOR.virtualMode, OSD.virtualMode),
        );
    };

    const saveToEeprom = async () => {
        return MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    };

    const saveAllConfig = async () => {
        await MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeOther());

        for (const item of displayItems.value) {
            await MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeLayout(item));
        }

        for (const timer of timers.value) {
            await MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, encodeTimer(timer));
        }

        for (const stat of statItems.value) {
            await MSP.promise(
                MSPCodes.MSP_SET_OSD_CONFIG,
                encodeStatisticsPayload(stat, CONFIGURATOR.virtualMode, OSD.virtualMode),
            );
        }

        await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
        captureSnapshot();
    };

    return {
        // State
        videoSystem,
        unitMode,
        alarms,
        statItems,
        warnings,
        displayItems,
        timers,
        osdProfiles,
        state,
        displaySize,
        parameters,
        selectedPreviewProfile,

        // Getters
        numberOfProfiles,
        currentPreviewProfile,
        isSupported,
        dirty,

        // Actions
        initData,
        updateDisplaySize,
        setSelectedPreviewProfile,
        updateDisplayItemVisibility,
        syncToLegacy,
        fetchOsdConfig,
        saveDisplayItem,
        saveOtherConfig,
        saveTimerConfig,
        saveStatisticItem,
        saveToEeprom,
        saveAllConfig,
    };
});
