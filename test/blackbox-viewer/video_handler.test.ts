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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pinia } from "../../src/js/pinia_instance";
import { useAppStore } from "../../src/blackbox-viewer/stores/app";
import { useGraphStore, type GrapherInstance } from "../../src/blackbox-viewer/stores/graph";
import { useLogStore } from "../../src/blackbox-viewer/stores/log";
import { usePlaybackStore } from "../../src/blackbox-viewer/stores/playback";
import {
    blackboxTimeFromVideoTime,
    loadVideo,
    reportVideoError,
    setVideoInTime,
    setVideoOffset,
    setVideoOutTime,
    setVideoTime,
    syncLogToVideo,
} from "../../src/blackbox-viewer/video_handler";

type FlightLogInstance = NonNullable<ReturnType<typeof useLogStore>["flightLog"]>;

function withLog(minTime: number) {
    const logStore = useLogStore(pinia);
    logStore.flightLog = { getMinTime: () => minTime } as unknown as FlightLogInstance;
    logStore.hasLog = true;
    return logStore;
}

function withVideo(currentTime = 0) {
    const video = document.createElement("video");
    video.currentTime = currentTime;
    usePlaybackStore(pinia).videoElement = video;
    return video;
}

describe("video_handler", () => {
    beforeEach(() => {
        const playbackStore = usePlaybackStore(pinia);
        playbackStore.videoElement = null;
        playbackStore.videoOffset = 0;
        playbackStore.videoExportInTime = null;
        playbackStore.videoExportOutTime = null;
        const logStore = useLogStore(pinia);
        logStore.flightLog = null;
        logStore.hasLog = false;
        logStore.videoURL = null;
        logStore.currentBlackboxTime = 0;
        const graphStore = useGraphStore(pinia);
        graphStore.graph = null;
        graphStore.seekBar = null;
        graphStore.invalidateGraph = null;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("maps the video time to the log's microsecond clock through the offset", () => {
        withLog(1_000_000);
        withVideo(2.5);
        usePlaybackStore(pinia).videoOffset = 0.5;

        expect(blackboxTimeFromVideoTime()).toBe(3_000_000);
    });

    it("syncs the log cursor to the video only when a log is loaded", () => {
        const logStore = withLog(0);
        withVideo(1);
        logStore.hasLog = false;
        syncLogToVideo();
        expect(logStore.currentBlackboxTime).toBe(0);

        logStore.hasLog = true;
        syncLogToVideo();
        expect(logStore.currentBlackboxTime).toBe(1_000_000);
    });

    it("seeks the video and moves the log cursor with it", () => {
        const logStore = withLog(0);
        const video = withVideo();

        setVideoTime(4);

        expect(video.currentTime).toBe(4);
        expect(logStore.currentBlackboxTime).toBe(4_000_000);
    });

    it("says what is missing when there is no video element", () => {
        withLog(0);
        expect(() => blackboxTimeFromVideoTime()).toThrow("video element");
    });

    it("formats the offset with a sign and refreshes only on request", () => {
        const invalidate = vi.fn();
        useGraphStore(pinia).invalidateGraph = invalidate;

        setVideoOffset(0.25);
        expect(useAppStore(pinia).videoOffsetDisplay).toBe("+0.250");
        expect(usePlaybackStore(pinia).videoOffset).toBe(0.25);
        expect(invalidate).not.toHaveBeenCalled();

        setVideoOffset(0);
        expect(useAppStore(pinia).videoOffsetDisplay).toBe("+0.000");

        setVideoOffset(-1.5, true);
        expect(useAppStore(pinia).videoOffsetDisplay).toBe("-1.500");
        expect(invalidate).toHaveBeenCalledOnce();
    });

    it("pushes the in and out points to the store, seekbar and grapher", () => {
        const graphStore = useGraphStore(pinia);
        const seekBar = { setInTime: vi.fn(), setOutTime: vi.fn() };
        const graph = { setInTime: vi.fn(), setOutTime: vi.fn() };
        const invalidate = vi.fn();
        graphStore.seekBar = seekBar as unknown as typeof graphStore.seekBar;
        graphStore.graph = graph as unknown as GrapherInstance;
        graphStore.invalidateGraph = invalidate;

        setVideoInTime(10);
        setVideoOutTime(null);

        const playbackStore = usePlaybackStore(pinia);
        expect(playbackStore.videoExportInTime).toBe(10);
        expect(playbackStore.videoExportOutTime).toBeNull();
        expect(seekBar.setInTime).toHaveBeenCalledWith(10);
        expect(seekBar.setOutTime).toHaveBeenCalledWith(null);
        expect(graph.setInTime).toHaveBeenCalledWith(10);
        expect(graph.setOutTime).toHaveBeenCalledWith(null);
        expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it("loads a video file into the element, releasing the previous URL", () => {
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:new");
        const logStore = useLogStore(pinia);
        logStore.videoURL = "blob:old";
        const video = withVideo();
        usePlaybackStore(pinia).playbackRate = 50;

        loadVideo(new File([""], "flight.mp4"));

        expect(revoke).toHaveBeenCalledWith("blob:old");
        expect(logStore.videoURL).toBe("blob:new");
        expect(video.src).toBe("blob:new");
        expect(video.playbackRate).toBe(0.5);
        expect(usePlaybackStore(pinia).currentOffsetCache.video).toBe("flight.mp4");
    });

    it("refuses a video when the browser cannot make object URLs", () => {
        const alert = vi.fn();
        vi.stubGlobal("alert", alert);
        vi.stubGlobal("URL", { revokeObjectURL: vi.fn() });

        loadVideo(new File([""], "flight.mp4"));

        expect(alert).toHaveBeenCalledOnce();
        expect(usePlaybackStore(pinia).currentOffsetCache.video).toBeNull();
    });

    it("reports the media error code and message when there is one", () => {
        const alert = vi.fn();
        vi.stubGlobal("alert", alert);
        const event = (error: { code: number; message: string } | null) =>
            ({ currentTarget: { error } }) as unknown as Event;

        reportVideoError(event({ code: 4, message: "unsupported" }));
        reportVideoError(event(null));
        reportVideoError(event({ code: 0, message: "" }));

        expect(alert).toHaveBeenNthCalledWith(1, "Error while loading the video. ERROR (4): unsupported");
        expect(alert).toHaveBeenNthCalledWith(2, "Error while loading the video.");
        expect(alert).toHaveBeenNthCalledWith(3, "Error while loading the video.");
    });
});
