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

import { pinia } from "@/js/pinia_instance";
import { useLogStore } from "./stores/log";
import { useGraphStore } from "./stores/graph";
import { usePlaybackStore } from "./stores/playback";
import { useAppStore } from "./stores/app";

// Both exist whenever a video is loaded; calling these earlier is a caller bug, as it always was.
function videoElement(): HTMLVideoElement {
    const video = usePlaybackStore(pinia).videoElement;
    if (!video) {
        throw new Error("The video element is not mounted");
    }
    return video;
}

function flightLog() {
    const log = useLogStore(pinia).flightLog;
    if (!log) {
        throw new Error("No flight log is loaded");
    }
    return log;
}

export function blackboxTimeFromVideoTime(): number {
    const playbackStore = usePlaybackStore(pinia);
    return (videoElement().currentTime - playbackStore.videoOffset) * 1000000 + flightLog().getMinTime();
}

export function syncLogToVideo(): void {
    const logStore = useLogStore(pinia);
    if (logStore.hasLog) {
        logStore.currentBlackboxTime = blackboxTimeFromVideoTime();
    }
}

export function setVideoOffset(offset: number, withRefresh?: boolean): void {
    const playbackStore = usePlaybackStore(pinia);
    const appStore = useAppStore(pinia);
    const graphStore = useGraphStore(pinia);

    playbackStore.videoOffset = offset;
    appStore.videoOffsetDisplay = (offset >= 0 ? "+" : "") + offset.toFixed(3);

    if (withRefresh) {
        graphStore.invalidateGraph?.();
    }
}

export function setVideoTime(newTime: number): void {
    videoElement().currentTime = newTime;
    syncLogToVideo();
}

/** `null` clears the in point. */
export function setVideoInTime(inTime: number | null): void {
    const playbackStore = usePlaybackStore(pinia);
    const graphStore = useGraphStore(pinia);

    playbackStore.videoExportInTime = inTime;
    graphStore.seekBar?.setInTime(inTime);

    if (graphStore.graph) {
        graphStore.graph.setInTime(inTime);
        graphStore.invalidateGraph?.();
    }
}

/** `null` clears the out point. */
export function setVideoOutTime(outTime: number | null): void {
    const playbackStore = usePlaybackStore(pinia);
    const graphStore = useGraphStore(pinia);

    playbackStore.videoExportOutTime = outTime;
    graphStore.seekBar?.setOutTime(outTime);

    if (graphStore.graph) {
        graphStore.graph.setOutTime(outTime);
        graphStore.invalidateGraph?.();
    }
}

export function loadVideo(file: File): void {
    const playbackStore = usePlaybackStore(pinia);
    const logStore = useLogStore(pinia);

    playbackStore.currentOffsetCache.video = file.name;
    if (logStore.videoURL) {
        URL.revokeObjectURL(logStore.videoURL);
        logStore.videoURL = null;
    }

    if (!URL.createObjectURL) {
        alert("Sorry, your web browser doesn't support showing videos from your local computer.");
        playbackStore.currentOffsetCache.video = null;
        return;
    }

    logStore.videoURL = URL.createObjectURL(file);
    const video = videoElement();
    video.volume = 1;
    video.src = logStore.videoURL;
    video.playbackRate = playbackStore.playbackRate / 100;
}

export function reportVideoError(e: Event): void {
    const error = (e.currentTarget as HTMLMediaElement).error;
    let errorMessage = "Error while loading the video.";
    if (error?.code) {
        errorMessage += ` ERROR (${error.code}): ${error.message}`;
    }
    alert(errorMessage);
}
