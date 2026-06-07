import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";
import {
    FIRMWARE_TYPE_BASEFLIGHT,
    FIRMWARE_TYPE_CLEANFLIGHT,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_INAV,
} from "../flightlog_fielddefs.js";

const FIRMWARE_CLASS_MAP = {
    [FIRMWARE_TYPE_BASEFLIGHT]: "isBaseF",
    [FIRMWARE_TYPE_CLEANFLIGHT]: "isCF",
    [FIRMWARE_TYPE_BETAFLIGHT]: "isBF",
    [FIRMWARE_TYPE_INAV]: "isINAV",
};

export const FIRMWARE_CLASSES = Object.values(FIRMWARE_CLASS_MAP);

export const useLogStore = defineStore("log", () => {
    const flightLog = ref(null);
    const flightLogDataArray = ref(null);
    const currentBlackboxTime = ref(0);
    const hasLog = ref(false);
    const hasVideo = ref(false);
    const hasGps = computed(() => {
        // activeLogIndex dependency ensures re-evaluation when log index changes
        return activeLogIndex.value >= 0 && !!flightLog.value?.hasGpsData?.();
    });
    const videoURL = ref(null);

    // Field values table data (updated by updateValuesChart in main.js)
    const fieldValues = shallowRef([]);
    const fieldStats = shallowRef([]);

    // Log index picker (multiple logs in one file)
    const logIndexEntries = shallowRef([]);
    // Each: { label, value, disabled }
    const activeLogIndex = ref(0);

    const minTime = computed(() => flightLog.value?.getMinTime() ?? 0);
    const maxTime = computed(() => flightLog.value?.getMaxTime() ?? 0);

    const firmwareClass = computed(() => {
        const type = flightLog.value?.getSysConfig?.()?.firmwareType;
        return FIRMWARE_CLASS_MAP[type] ?? null;
    });

    function setFlightLog(log) {
        flightLog.value = log;
        hasLog.value = !!log;
    }

    function setFlightLogDataArray(dataArray) {
        flightLogDataArray.value = dataArray;
    }

    function setCurrentBlackboxTime(time) {
        currentBlackboxTime.value = time;
    }

    function setVideo(url) {
        videoURL.value = url;
        hasVideo.value = !!url;
    }

    return {
        flightLog,
        flightLogDataArray,
        currentBlackboxTime,
        hasLog,
        hasVideo,
        hasGps,
        videoURL,
        fieldValues,
        fieldStats,
        logIndexEntries,
        activeLogIndex,
        minTime,
        maxTime,
        firmwareClass,
        setFlightLog,
        setFlightLogDataArray,
        setCurrentBlackboxTime,
        setVideo,
    };
});
