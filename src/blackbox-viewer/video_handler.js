import pinia from "./pinia_instance.js";
import { useLogStore } from "./stores/log.js";
import { useGraphStore } from "./stores/graph.js";
import { usePlaybackStore } from "./stores/playback.js";
import { useAppStore } from "./stores/app.js";

export function blackboxTimeFromVideoTime() {
    const playbackStore = usePlaybackStore(pinia);
    const logStore = useLogStore(pinia);
    const video = playbackStore.videoElement;
    return (video.currentTime - playbackStore.videoOffset) * 1000000 + logStore.flightLog.getMinTime();
}

export function syncLogToVideo() {
    const logStore = useLogStore(pinia);
    if (logStore.hasLog) {
        logStore.currentBlackboxTime = blackboxTimeFromVideoTime();
    }
}

export function setVideoOffset(offset, withRefresh) {
    const playbackStore = usePlaybackStore(pinia);
    const appStore = useAppStore(pinia);
    const graphStore = useGraphStore(pinia);

    playbackStore.videoOffset = offset;
    appStore.videoOffsetDisplay = (offset >= 0 ? "+" : "") + offset.toFixed(3);

    if (withRefresh) {
        graphStore.invalidateGraph?.();
    }
}

export function setVideoTime(newTime) {
    const playbackStore = usePlaybackStore(pinia);
    playbackStore.videoElement.currentTime = newTime;
    syncLogToVideo();
}

export function setVideoInTime(inTime) {
    const playbackStore = usePlaybackStore(pinia);
    const graphStore = useGraphStore(pinia);

    playbackStore.videoExportInTime = inTime;
    graphStore.seekBar?.setInTime(inTime);

    if (graphStore.graph) {
        graphStore.graph.setInTime(inTime);
        graphStore.invalidateGraph?.();
    }
}

export function setVideoOutTime(outTime) {
    const playbackStore = usePlaybackStore(pinia);
    const graphStore = useGraphStore(pinia);

    playbackStore.videoExportOutTime = outTime;
    graphStore.seekBar?.setOutTime(outTime);

    if (graphStore.graph) {
        graphStore.graph.setOutTime(outTime);
        graphStore.invalidateGraph?.();
    }
}

export function loadVideo(file) {
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
    const video = playbackStore.videoElement;
    video.volume = 1;
    video.src = logStore.videoURL;
    video.playbackRate = playbackStore.playbackRate / 100;
}

export function reportVideoError(e) {
    let errorMessage = "Error while loading the video.";
    if (e.currentTarget.error.code) {
        errorMessage += ` ERROR (${e.currentTarget.error.code}): ${e.currentTarget.error.message}`;
    }
    alert(errorMessage);
}
