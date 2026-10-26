import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/blackbox-viewer/video_handler", () => ({
    blackboxTimeFromVideoTime: vi.fn(() => 7_000_000),
    syncLogToVideo: vi.fn(),
    setVideoTime: vi.fn(),
    setVideoOffset: vi.fn(),
}));
vi.mock("../../src/blackbox-viewer/values_display", () => ({ updateValuesChart: vi.fn() }));

const { pinia } = await import("../../src/js/pinia_instance");
const { useLogStore } = await import("../../src/blackbox-viewer/stores/log");
const { useGraphStore } = await import("../../src/blackbox-viewer/stores/graph");
const { usePlaybackStore, GRAPH_STATE_PAUSED, GRAPH_STATE_PLAY } =
    await import("../../src/blackbox-viewer/stores/playback");
const video = await import("../../src/blackbox-viewer/video_handler");
const { updateValuesChart } = await import("../../src/blackbox-viewer/values_display");
const playback = await import("../../src/blackbox-viewer/playback_controls");
import type { FlightLog } from "../../src/blackbox-viewer/flightlog";

const MIN = 1_000_000;
const MAX = 3_000_000;

function setUp({ hasVideo = false } = {}) {
    const logStore = useLogStore(pinia);
    const graphStore = useGraphStore(pinia);
    const playbackStore = usePlaybackStore(pinia);
    const graph = {
        render: vi.fn(),
        resize: vi.fn(),
        setGraphZoom: vi.fn(),
        getWindowWidthTime: () => 400_000,
    };
    const seekBar = { setCurrentTime: vi.fn(), setWindow: vi.fn(), repaint: vi.fn(), resize: vi.fn() };
    const flightLog = {
        getMinTime: () => MIN,
        getMaxTime: () => MAX,
        hasGpsData: () => false,
        getCurrentFrameAtTime: (time: number) => ({
            previous: [0, time - 125],
            current: [0, time],
            next: [0, time + 125],
        }),
    } as unknown as FlightLog;
    const videoElement = { play: vi.fn(() => Promise.resolve()), pause: vi.fn(), currentTime: 10, playbackRate: 1 };

    logStore.flightLog = flightLog;
    logStore.hasVideo = hasVideo;
    logStore.hasLog = true;
    logStore.currentBlackboxTime = 2_000_000;
    graphStore.graph = graph as never;
    graphStore.seekBar = seekBar as never;
    graphStore.graphZoom = 100;
    graphStore.lastGraphZoom = 50;
    graphStore.hasMarker = false;
    graphStore.hasConfig = true;
    graphStore.hasConfigOverlay = false;
    graphStore.hasTableOverlay = false;
    playbackStore.videoElement = videoElement as unknown as HTMLVideoElement;
    playbackStore.videoOffset = 0.5;
    playbackStore.graphState = GRAPH_STATE_PAUSED;
    playbackStore.playbackRate = 100;
    return { logStore, graphStore, playbackStore, graph, seekBar, videoElement };
}

describe("playback controls", () => {
    let frames: FrameRequestCallback[];

    beforeEach(() => {
        vi.clearAllMocks();
        frames = [];
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
        // Drain the frame a previous test may have left queued, so invalidateGraph() queues again.
        playback.setExportInProgress(true);
        playback.animationLoop();
        playback.setExportInProgress(false);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe("jumps", () => {
        it("steps 100 ms by default, either way, and pauses", () => {
            const { logStore, playbackStore } = setUp();
            playbackStore.graphState = GRAPH_STATE_PLAY;
            playback.logJumpForward(null);
            expect(logStore.currentBlackboxTime).toBe(2_100_000);
            playback.logJumpBack();
            playback.logJumpBack();
            expect(logStore.currentBlackboxTime).toBe(1_900_000);
            expect(playbackStore.graphState).toBe(GRAPH_STATE_PAUSED);
        });

        it("steps a fraction of the window, and 100 ms for a fraction of 0", () => {
            const { logStore } = setUp();
            playback.logJumpForward(0.25);
            expect(logStore.currentBlackboxTime).toBe(2_100_000);
            playback.logJumpBack(0.5);
            expect(logStore.currentBlackboxTime).toBe(1_900_000);
            playback.logJumpBack(0);
            expect(logStore.currentBlackboxTime).toBe(1_800_000);
        });

        it("steps one log frame when slow", () => {
            const { logStore } = setUp();
            playback.logJumpForward(null, true);
            expect(logStore.currentBlackboxTime).toBe(2_000_125);
            playback.logJumpBack(null, true);
            playback.logJumpBack(null, true);
            expect(logStore.currentBlackboxTime).toBe(1_999_875);
        });

        it("moves the video instead when there is one, a 60th of a second when slow", () => {
            setUp({ hasVideo: true });
            playback.logJumpForward(null);
            expect(video.setVideoTime).toHaveBeenLastCalledWith(10.1);
            playback.logJumpBack(null, true);
            expect(video.setVideoTime).toHaveBeenLastCalledWith(10 - 1 / 60);
        });

        it("goes to either end of the log", () => {
            const { logStore } = setUp();
            playback.logJumpEnd();
            expect(logStore.currentBlackboxTime).toBe(MAX);
            playback.logJumpStart();
            expect(logStore.currentBlackboxTime).toBe(MIN);
        });
    });

    it("plays and pauses the video with the graph", () => {
        const { playbackStore, videoElement } = setUp({ hasVideo: true });
        playback.logPlayPause();
        expect(playbackStore.graphState).toBe(GRAPH_STATE_PLAY);
        expect(videoElement.play).toHaveBeenCalledOnce();
        playback.logPlayPause();
        expect(playbackStore.graphState).toBe(GRAPH_STATE_PAUSED);
        expect(videoElement.pause).toHaveBeenCalledOnce();
    });

    it("sets a video's time from a log time, offset by the sync", () => {
        const { videoElement } = setUp({ hasVideo: true });
        playback.setCurrentBlackboxTime(2_500_000);
        expect(videoElement.currentTime).toBe(2);
        expect(video.syncLogToVideo).toHaveBeenCalledOnce();
    });

    it("only takes a playback rate inside the allowed range", () => {
        const { playbackStore, videoElement } = setUp();
        playback.setPlaybackRate(250);
        expect(playbackStore.playbackRate).toBe(250);
        expect(videoElement.playbackRate).toBe(2.5);
        playback.setPlaybackRate(5);
        playback.setPlaybackRate(301);
        expect(playbackStore.playbackRate).toBe(250);
    });

    it("zooms, and goes back to the previous zoom for none", () => {
        const { graphStore, graph } = setUp();
        playback.setGraphZoom(null);
        expect(graphStore.graphZoom).toBe(50);
        playback.setGraphZoom(200);
        expect(graphStore.lastGraphZoom).toBe(50);
        playback.setGraphZoom(100);
        expect(graph.setGraphZoom).toHaveBeenLastCalledWith(1);
        expect(graphStore.lastGraphZoom).toBe(200);
        playback.setGraphZoom(null);
        expect(graphStore.graphZoom).toBe(200);
        playback.setGraphZoom(5000);
        expect(graphStore.graphZoom).toBe(200);
    });

    it("toggles the overlays, or sets them", () => {
        const { graphStore } = setUp();
        playback.showValueTable();
        expect(graphStore.hasTableOverlay).toBe(true);
        expect(updateValuesChart).toHaveBeenCalledOnce();
        playback.showValueTable(true);
        expect(graphStore.hasTableOverlay).toBe(true);
        playback.showConfigFile();
        expect(graphStore.hasConfigOverlay).toBe(true);
        playback.showConfigFile(false);
        expect(graphStore.hasConfigOverlay).toBe(false);
        graphStore.hasConfig = false;
        playback.showConfigFile(true);
        expect(graphStore.hasConfigOverlay).toBe(false);
    });

    it("moves the video sync by a 15th of a second, or to the marker", () => {
        const { graphStore, logStore } = setUp({ hasVideo: true });
        playback.logSyncForward();
        expect(video.setVideoOffset).toHaveBeenLastCalledWith(0.5 + 1 / 15, true);
        playback.logSyncBack();
        expect(video.setVideoOffset).toHaveBeenLastCalledWith(0.5 - 1 / 15, true);
        playback.logSyncHere();
        expect(video.setVideoOffset).toHaveBeenLastCalledWith(10, true);

        graphStore.hasMarker = true;
        graphStore.markerTime = 1_500_000;
        logStore.currentBlackboxTime = 2_000_000;
        playback.logSmartSync();
        expect(video.setVideoOffset).toHaveBeenLastCalledWith(1, true);
        expect(graphStore.hasMarker).toBe(false);
    });

    describe("animation loop", () => {
        it("advances the log by the time since the last frame at the playback rate, then pauses at the end", () => {
            // Only Date: the frames come from the stubbed requestAnimationFrame.
            vi.useFakeTimers({ now: 0, toFake: ["Date"] });
            const { logStore, playbackStore, graph, seekBar } = setUp();
            playback.setGraphState(GRAPH_STATE_PLAY);
            frames.shift()!(0);
            expect(graph.render).toHaveBeenLastCalledWith(2_000_000);

            vi.setSystemTime(100);
            frames.shift()!(0);
            expect(logStore.currentBlackboxTime).toBe(2_100_000);
            expect(seekBar.setWindow).toHaveBeenLastCalledWith(400_000);

            playbackStore.playbackRate = 50;
            vi.setSystemTime(200);
            frames.shift()!(0);
            expect(logStore.currentBlackboxTime).toBe(2_150_000);

            vi.setSystemTime(10_000);
            frames.shift()!(0);
            expect(logStore.currentBlackboxTime).toBe(MAX);
            expect(playbackStore.graphState).toBe(GRAPH_STATE_PAUSED);
        });

        it("follows the video's time while there is a video", () => {
            const { logStore } = setUp({ hasVideo: true });
            playback.invalidateGraph();
            frames.shift()!(0);
            expect(logStore.currentBlackboxTime).toBe(7_000_000);
        });

        it("queues one frame however often it is asked, and none during an export", () => {
            setUp();
            playback.invalidateGraph();
            playback.invalidateGraph();
            expect(frames).toHaveLength(1);
            frames.shift()!(0);

            playback.setExportInProgress(true);
            playback.updateCanvasSize();
            playback.invalidateGraph();
            const { graph } = setUp();
            frames.shift()!(0);
            expect(graph.render).not.toHaveBeenCalled();
            expect(graph.resize).not.toHaveBeenCalled();
            playback.setExportInProgress(false);
        });
    });
});
