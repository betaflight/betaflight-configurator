import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { OSD } from "../js/tabs/osd";

export const useOsdStore = defineStore("osd", () => {
    // Core OSD data state
    const videoSystem = ref(null);
    const unitMode = ref(null);
    const alarms = ref([]);
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

    const isSupported = computed(() => state.haveMax7456Video || state.isMspDevice);

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
        for (let i = 0; i < displaySize.total; i++) {
            preview.value.push([null, " ".charCodeAt(0), null, null]);
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
    };
});
