import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { OSD, FONT, SYM } from "../js/tabs/osd";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { OSD_CONSTANTS } from "../js/tabs/osd_constants";
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

export const useOsdStore = defineStore("osd", () => {
    // Core OSD data state
    const videoSystem = ref(null);
    const unitMode = ref(null);
    const alarms = ref({});
    const statItems = ref([]);
    const warnings = ref([]);
    const displayItems = ref([]);
    const timers = ref([]);
    const lastPositions = ref({});
    const preview = ref([]);
    const tooltips = ref([]);
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

    const VIDEO_BUFFER_CHARS = {
        PAL: 480,
        NTSC: 390,
        HD: 1590,
    };

    // Getters
    const numberOfProfiles = computed(() => osdProfiles.value.number || 1);

    const currentPreviewProfile = computed(() => selectedPreviewProfile.value);

    const videoTypeName = computed(() => {
        const types = ["AUTO", "PAL", "NTSC", "HD"];
        return types[videoSystem.value] || "AUTO";
    });

    const isHdVideoSystem = computed(() => videoSystem.value === 3);

    const isSupported = computed(() => Boolean(state.haveSomeOsd));

    // Actions
    function initData() {
        videoSystem.value = null;
        unitMode.value = null;
        alarms.value = [];
        statItems.value = [];
        warnings.value = [];
        displayItems.value = [];
        timers.value = [];
        lastPositions.value = {};
        preview.value = [];
        tooltips.value = [];
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

    function setVideoSystem(value) {
        videoSystem.value = value;
        updateDisplaySize();
    }

    function setUnitMode(value) {
        unitMode.value = value;
    }

    function setDisplayItems(items) {
        displayItems.value = items;
    }

    function setTimers(timerList) {
        timers.value = timerList;
    }

    function setWarnings(warningList) {
        warnings.value = warningList;
    }

    function setStatItems(stats) {
        statItems.value = stats;
    }

    function setAlarms(alarmList) {
        alarms.value = alarmList;
    }

    function setOsdProfiles(profiles) {
        osdProfiles.value = profiles;
    }

    function setSelectedPreviewProfile(profile) {
        selectedPreviewProfile.value = profile;
    }

    function setState(newState) {
        Object.assign(state, newState);
    }

    function setParameters(params) {
        Object.assign(parameters, params);
    }

    // Update display item visibility for a specific profile
    function updateDisplayItemVisibility(itemIndex, profileIndex, visible) {
        if (displayItems.value[itemIndex]) {
            displayItems.value[itemIndex].isVisible[profileIndex] = visible;
        }
    }

    // Update display item position
    function updateDisplayItemPosition(itemIndex, position) {
        if (displayItems.value[itemIndex]) {
            displayItems.value[itemIndex].position = position;
        }
    }

    // Update display item variant
    function updateDisplayItemVariant(itemIndex, variant) {
        if (displayItems.value[itemIndex]) {
            displayItems.value[itemIndex].variant = variant;
        }
    }

    // Update timer configuration
    function updateTimer(timerIndex, timerData) {
        if (timers.value[timerIndex]) {
            Object.assign(timers.value[timerIndex], timerData);
        }
    }

    // Update warning enabled state
    function updateWarningEnabled(warningIndex, enabled) {
        if (warnings.value[warningIndex]) {
            warnings.value[warningIndex].enabled = enabled;
        }
    }

    // Update stat item enabled state
    function updateStatItemEnabled(statIndex, enabled) {
        if (statItems.value[statIndex]) {
            statItems.value[statIndex].enabled = enabled;
        }
    }

    // Clear preview buffer
    function clearPreview() {
        preview.value = [];
        const blankCharCode = " ".codePointAt(0);
        for (let i = 0; i < displaySize.total; i++) {
            preview.value.push([null, blankCharCode, null, null]);
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
        OSD.data.last_positions = lastPositions.value;
        OSD.data.preview = preview.value;
        OSD.data.tooltips = tooltips.value;
        OSD.data.osd_profiles = osdProfiles.value;
        OSD.data.displaySize = displaySize;
        OSD.data.state = state;
        OSD.data.parameters = parameters;
    }

    // Sync from legacy OSD.data object
    function syncFromLegacy() {
        if (OSD.data) {
            videoSystem.value = OSD.data.video_system;
            unitMode.value = OSD.data.unit_mode;
            alarms.value = OSD.data.alarms || [];
            statItems.value = OSD.data.statItems || [];
            warnings.value = OSD.data.warnings || [];
            displayItems.value = OSD.data.displayItems || [];
            timers.value = OSD.data.timers || [];
            lastPositions.value = OSD.data.last_positions || {};
            preview.value = OSD.data.preview || [];
            tooltips.value = OSD.data.tooltips || [];

            if (OSD.data.osd_profiles) {
                osdProfiles.value = OSD.data.osd_profiles;
            }

            if (OSD.data.displaySize) {
                displaySize.x = OSD.data.displaySize.x;
                displaySize.y = OSD.data.displaySize.y;
                displaySize.total = OSD.data.displaySize.total;
            }

            if (OSD.data.state) {
                Object.assign(state, OSD.data.state);
            }

            if (OSD.data.parameters) {
                Object.assign(parameters, OSD.data.parameters);
            }
        }
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

    function syncStoreFromDecodedOsdData() {
        videoSystem.value = OSD.data.video_system;
        unitMode.value = OSD.data.unit_mode;
        alarms.value = OSD.data.alarms ? structuredClone(OSD.data.alarms) : {};
        statItems.value = [...OSD.data.statItems];
        warnings.value = [...OSD.data.warnings];
        timers.value = OSD.data.timers.map((t) => ({ ...t }));
        displayItems.value = OSD.data.displayItems.map((item) => ({ ...item }));

        if (OSD.data.parameters) {
            parameters.cameraFrameWidth = OSD.data.parameters.cameraFrameWidth;
            parameters.cameraFrameHeight = OSD.data.parameters.cameraFrameHeight;
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

    async function ensureDefaultFontLoaded() {
        if (FONT.data?.characters.length !== 0) {
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

    const fetchOsdConfig = async () => {
        const fcStore = useFlightControllerStore();

        try {
            SYM.loadSymbols();
            FONT.initData();

            const info = await fetchOsdInfo(fcStore);
            await decodeOsdData(info);
            syncStoreFromDecodedOsdData();
            await ensureDefaultFontLoaded();
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

    const saveOsdConfig = async () => {
        try {
            // Keep writes ordered. MSP callback matching is keyed by command code.
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

            // Sync back to legacy OSD.data?
            syncToLegacy();
        } catch (e) {
            console.error("Failed to save OSD config", e);
            throw e;
        }
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
        lastPositions,
        preview,
        tooltips,
        osdProfiles,
        state,
        displaySize,
        parameters,
        selectedPreviewProfile,

        // Constants
        VIDEO_COLS,
        VIDEO_ROWS,
        VIDEO_BUFFER_CHARS,

        // Getters
        numberOfProfiles,
        currentPreviewProfile,
        videoTypeName,
        isHdVideoSystem,
        isSupported,

        // Actions
        initData,
        updateDisplaySize,
        setVideoSystem,
        setUnitMode,
        setDisplayItems,
        setTimers,
        setWarnings,
        setStatItems,
        setAlarms,
        setOsdProfiles,
        setSelectedPreviewProfile,
        setState,
        setParameters,
        updateDisplayItemVisibility,
        updateDisplayItemPosition,
        updateDisplayItemVariant,
        updateTimer,
        updateWarningEnabled,
        updateStatItemEnabled,
        clearPreview,
        syncToLegacy,
        syncFromLegacy,
        fetchOsdConfig,
        saveDisplayItem,
        saveOtherConfig,
        saveTimerConfig,
        saveStatisticItem,
        saveToEeprom,
        saveOsdConfig,
    };
});
