/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";

export const GRAPH_STATE_PAUSED = 0;
export const GRAPH_STATE_PLAY = 1;
export const PLAYBACK_MIN_RATE = 10;
export const PLAYBACK_MAX_RATE = 300;
export const PLAYBACK_DEFAULT_RATE = 100;
export const PLAYBACK_RATE_STEP = 5;

type Action = () => void;

/** A remembered video offset, keyed by log file, log index and video file. */
export interface OffsetCacheEntry {
    log: string | null;
    index: number | null;
    video: string | null;
    offset: number | null;
}

export const usePlaybackStore = defineStore("playback", () => {
    const graphState = ref(GRAPH_STATE_PAUSED);
    const playbackRate = ref(PLAYBACK_DEFAULT_RATE);
    const videoOffset = ref(0);
    const videoExportInTime = ref<number | null>(null);
    const videoExportOutTime = ref<number | null>(null);
    const videoConfig = ref({ width: 1280, height: 720, frameRate: 30, videoDim: 0.4 });

    // Video DOM element — registered by main.js
    const videoElement = shallowRef<HTMLVideoElement | null>(null);

    // Offset cache for auto-syncing video to log
    const offsetCache = shallowRef<OffsetCacheEntry[]>([]);
    const currentOffsetCache = shallowRef<OffsetCacheEntry>({ log: null, index: null, video: null, offset: null });

    const isPlaying = computed(() => graphState.value === GRAPH_STATE_PLAY);
    const isPaused = computed(() => graphState.value === GRAPH_STATE_PAUSED);

    // Callbacks registered by main.js (need video element + renderer closures)
    const logPlayPause = shallowRef<Action | null>(null);
    const logJumpBack = shallowRef<Action | null>(null);
    const logJumpForward = shallowRef<Action | null>(null);
    const logJumpStart = shallowRef<Action | null>(null);
    const logJumpEnd = shallowRef<Action | null>(null);
    const videoJumpStart = shallowRef<Action | null>(null);
    const videoJumpEnd = shallowRef<Action | null>(null);
    const logSyncHere = shallowRef<Action | null>(null);
    const logSyncBack = shallowRef<Action | null>(null);
    const logSyncForward = shallowRef<Action | null>(null);
    const logSmartSync = shallowRef<Action | null>(null);
    const setVideoOffsetValue = shallowRef<((value: string | number) => void) | null>(null);
    const setGraphTime = shallowRef<((timeStr: string) => void) | null>(null);
    const applyPlaybackRate = shallowRef<((rate: number) => void) | null>(null);

    function setPlaybackRate(rate: number) {
        playbackRate.value = Math.max(PLAYBACK_MIN_RATE, Math.min(PLAYBACK_MAX_RATE, rate));
    }

    function setVideoOffset(offset: number) {
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
