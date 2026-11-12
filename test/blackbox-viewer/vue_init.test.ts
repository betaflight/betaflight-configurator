import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/blackbox-viewer/playback_controls", () => ({
    setGraphState: vi.fn(),
    updateCanvasSize: vi.fn(),
}));
vi.mock("../../src/blackbox-viewer/css/main.css", () => ({}));

const { pinia } = await import("../../src/js/pinia_instance");
const { useAppStore } = await import("../../src/blackbox-viewer/stores/app");
const { usePlaybackStore, GRAPH_STATE_PLAY, GRAPH_STATE_PAUSED } =
    await import("../../src/blackbox-viewer/stores/playback");
const { setGraphState, updateCanvasSize } = await import("../../src/blackbox-viewer/playback_controls");
const { setBlackboxViewerDark, setViewerActive } = await import("../../src/blackbox-viewer/vue_init");

describe("vue_init", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        usePlaybackStore(pinia).graphState = GRAPH_STATE_PAUSED;
    });

    it("follows the host's theme", () => {
        setBlackboxViewerDark(true);
        expect(useAppStore(pinia).darkThemeEnabled).toBe(true);
        setBlackboxViewerDark(false);
        expect(useAppStore(pinia).darkThemeEnabled).toBe(false);
    });

    it("re-measures the canvases when the tab comes back", () => {
        setViewerActive(true);
        expect(useAppStore(pinia).viewerActive).toBe(true);
        expect(updateCanvasSize).toHaveBeenCalledOnce();
        expect(setGraphState).not.toHaveBeenCalled();
    });

    it("pauses playback when the tab is hidden", () => {
        usePlaybackStore(pinia).graphState = GRAPH_STATE_PLAY;
        setViewerActive(false);
        expect(useAppStore(pinia).viewerActive).toBe(false);
        expect(setGraphState).toHaveBeenCalledWith(GRAPH_STATE_PAUSED);
        expect(updateCanvasSize).not.toHaveBeenCalled();
    });

    it("leaves a paused graph alone when the tab is hidden", () => {
        setViewerActive(false);
        expect(setGraphState).not.toHaveBeenCalled();
    });
});
