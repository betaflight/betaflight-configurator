import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";

export const GRAPH_STATE_PAUSED = 0;
export const GRAPH_STATE_PLAY = 1;
export const PLAYBACK_MIN_RATE = 10;
export const PLAYBACK_MAX_RATE = 300;
export const PLAYBACK_DEFAULT_RATE = 100;
export const PLAYBACK_RATE_STEP = 5;

export const usePlaybackStore = defineStore("playback", () => {
    const graphState = ref(GRAPH_STATE_PAUSED);
    const playbackRate = ref(PLAYBACK_DEFAULT_RATE);
    const videoOffset = ref(0);
    const videoExportInTime = ref(null);
    const videoExportOutTime = ref(null);
    const videoConfig = ref({ width: 1280, height: 720, frameRate: 30, videoDim: 0.4 });

    // Video DOM element — registered by main.js
    const videoElement = shallowRef(null);

    // Offset cache for auto-syncing video to log
    const offsetCache = shallowRef([]);
    const currentOffsetCache = shallowRef({ log: null, index: null, video: null, offset: null });

    const isPlaying = computed(() => graphState.value === GRAPH_STATE_PLAY);
    const isPaused = computed(() => graphState.value === GRAPH_STATE_PAUSED);

    // Callbacks registered by main.js (need video element + renderer closures)
    const logPlayPause = shallowRef(null);
    const logJumpBack = shallowRef(null);
    const logJumpForward = shallowRef(null);
    const logJumpStart = shallowRef(null);
    const logJumpEnd = shallowRef(null);
    const videoJumpStart = shallowRef(null);
    const videoJumpEnd = shallowRef(null);
    const logSyncHere = shallowRef(null);
    const logSyncBack = shallowRef(null);
    const logSyncForward = shallowRef(null);
    const logSmartSync = shallowRef(null);
    const setVideoOffsetValue = shallowRef(null);
    const setGraphTime = shallowRef(null);
    const applyPlaybackRate = shallowRef(null);

    function setPlaybackRate(rate) {
        playbackRate.value = Math.max(PLAYBACK_MIN_RATE, Math.min(PLAYBACK_MAX_RATE, rate));
    }

    function setVideoOffset(offset) {
        videoOffset.value = offset;
    }

    return {
        graphState,
        playbackRate,
        videoOffset,
        videoExportInTime,
        videoExportOutTime,
        videoConfig,
        videoElement,
        offsetCache,
        currentOffsetCache,
        isPlaying,
        isPaused,
        logPlayPause,
        logJumpBack,
        logJumpForward,
        logJumpStart,
        logJumpEnd,
        videoJumpStart,
        videoJumpEnd,
        logSyncHere,
        logSyncBack,
        logSyncForward,
        logSmartSync,
        setVideoOffsetValue,
        setGraphTime,
        applyPlaybackRate,
        setPlaybackRate,
        setVideoOffset,
    };
});
