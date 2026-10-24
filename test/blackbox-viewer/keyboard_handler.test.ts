import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    createDropdownSpaceGuard,
    createKeydownHandler,
    type KeydownContext,
} from "../../src/blackbox-viewer/keyboard_handler";
import { GRAPH_MIN_ZOOM } from "../../src/blackbox-viewer/stores/graph";
import type { WorkspaceList } from "../../src/blackbox-viewer/stores/workspace";

function makeCtx() {
    const graphStore = {
        markerTime: 0,
        hasMarker: false,
        isFullscreen: false,
        graphZoom: 100,
        toggleAnalyser: vi.fn(),
        toggleAnalyserFullscreen: vi.fn(),
        toggleFullscreen: vi.fn(),
    };
    return {
        hasGraph: () => true,
        graphStore,
        logStore: { currentBlackboxTime: 1_500_000 },
        playbackStore: { videoExportInTime: null as number | null, videoExportOutTime: null as number | null },
        workspaceStore: {
            bookmarkTimes: [] as (number | null)[],
            workspaceGraphConfigs: [] as WorkspaceList,
            activeWorkspace: 1,
            showDefaultMenu: false,
        },
        appStore: { viewerActive: true, headerDialogOpen: false, statusMarkerOffset: "" },
        logPlayPause: vi.fn(),
        logJumpBack: vi.fn(),
        logJumpForward: vi.fn(),
        logJumpStart: vi.fn(),
        logJumpEnd: vi.fn(),
        logSmartSync: vi.fn(),
        setGraphZoom: vi.fn(),
        setVideoInTime: vi.fn(),
        setVideoOutTime: vi.fn(),
        setMarker: vi.fn((state: boolean) => {
            graphStore.hasMarker = state;
        }),
        setCurrentBlackboxTime: vi.fn(),
        showValueTable: vi.fn(),
        showConfigFile: vi.fn(),
        newGraphConfig: vi.fn(),
        toggleOverrideStatus: vi.fn(),
        invalidateGraph: vi.fn(),
        onSwitchWorkspace: vi.fn(),
        onSaveWorkspace: vi.fn(),
        lastGraphConfig: vi.fn(() => null),
    };
}

/** A keydown from an element that is not a text field, a modal or a popup. */
function key(code: string, keyValue: string, init: KeyboardEventInit = {}, target: object = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { code, key: keyValue, ...init });
    Object.defineProperty(event, "target", { value: { type: undefined, closest: () => null, ...target } });
    return event;
}

describe("createKeydownHandler", () => {
    let ctx: ReturnType<typeof makeCtx>;
    let press: (event: KeyboardEvent) => void;

    beforeEach(() => {
        ctx = makeCtx();
        press = createKeydownHandler(ctx as unknown as KeydownContext);
    });

    it("sets, clears and jumps to a bookmark with Alt+Shift and Alt and a digit; Digit0 clears them all", () => {
        press(key("Digit3", "3", { altKey: true, shiftKey: true }));
        expect(ctx.workspaceStore.bookmarkTimes[3]).toBe(1_500_000);

        press(key("Digit3", "3", { altKey: true }));
        expect(ctx.setCurrentBlackboxTime).toHaveBeenCalledWith(1_500_000);

        press(key("Digit3", "3", { altKey: true, shiftKey: true }));
        expect(ctx.workspaceStore.bookmarkTimes[3]).toBeNull();

        press(key("Digit4", "4", { altKey: true, shiftKey: true }));
        press(key("Digit0", "0", { altKey: true, shiftKey: true }));
        expect(ctx.workspaceStore.bookmarkTimes).toEqual([]);
    });

    it("switches to a stored workspace with a digit, and saves one with Shift", () => {
        ctx.workspaceStore.workspaceGraphConfigs[2] = { title: "Tune", graphConfig: null };
        press(key("Digit2", "2"));
        expect(ctx.onSwitchWorkspace).toHaveBeenCalledWith(ctx.workspaceStore.workspaceGraphConfigs, 2);
        press(key("Digit5", "5"));
        expect(ctx.onSwitchWorkspace).toHaveBeenCalledOnce();

        press(key("Digit2", "2", { shiftKey: true }));
        expect(ctx.onSaveWorkspace).toHaveBeenLastCalledWith(2, "Tune");
        press(key("Digit5", "5", { shiftKey: true }));
        expect(ctx.onSaveWorkspace).toHaveBeenLastCalledWith(5, "Unnamed");
    });

    it("toggles between the minimum zoom and the previous one with Z", () => {
        press(key("KeyZ", "z"));
        expect(ctx.setGraphZoom).toHaveBeenLastCalledWith(GRAPH_MIN_ZOOM);
        ctx.graphStore.graphZoom = GRAPH_MIN_ZOOM;
        press(key("KeyZ", "z"));
        expect(ctx.setGraphZoom).toHaveBeenLastCalledWith(null);
    });

    it("zooms by 10, or 25 with Alt, on Shift+arrow, and pages by a quarter window", () => {
        press(key("ArrowLeft", "ArrowLeft", { shiftKey: true }));
        expect(ctx.setGraphZoom).toHaveBeenLastCalledWith(90);
        press(key("ArrowLeft", "ArrowLeft", { shiftKey: true, altKey: true }));
        expect(ctx.setGraphZoom).toHaveBeenLastCalledWith(75);
        press(key("ArrowRight", "ArrowRight", { shiftKey: true, altKey: true }));
        expect(ctx.setGraphZoom).toHaveBeenLastCalledWith(125);
        press(key("PageUp", "PageUp"));
        expect(ctx.logJumpBack).toHaveBeenLastCalledWith(0.25);
        press(key("PageDown", "PageDown"));
        expect(ctx.logJumpForward).toHaveBeenLastCalledWith(0.25);
        press(key("ArrowLeft", "ArrowLeft", { altKey: true }));
        expect(ctx.logJumpBack).toHaveBeenLastCalledWith(null, true);
    });

    it("toggles the matching graph override with S, X and G", () => {
        press(key("KeyS", "s"));
        press(key("KeyX", "x"));
        press(key("KeyG", "g"));
        expect(ctx.toggleOverrideStatus.mock.calls).toEqual([
            ["graphSmoothOverride"],
            ["graphExpoOverride"],
            ["graphGridOverride"],
        ]);
    });

    it("drops a marker at the current time with M, and shows its offset", () => {
        press(key("KeyM", "m"));
        expect(ctx.graphStore.markerTime).toBe(1_500_000);
        expect(ctx.appStore.statusMarkerOffset).toBe("Marker Offset 00:00ms");
        press(key("KeyM", "m"));
        expect(ctx.appStore.statusMarkerOffset).toBe("");
    });

    it("leaves fullscreen with Escape, unless a dialog has the key", () => {
        press(key("Escape", "Escape"));
        expect(ctx.graphStore.toggleFullscreen).not.toHaveBeenCalled();
        ctx.graphStore.isFullscreen = true;
        press(
            key("Escape", "Escape", {}, { closest: (selector: string) => (selector.includes("dialog") ? {} : null) }),
        );
        expect(ctx.graphStore.toggleFullscreen).not.toHaveBeenCalled();
        press(key("Escape", "Escape"));
        expect(ctx.graphStore.toggleFullscreen).toHaveBeenCalledOnce();
    });
});

describe("createDropdownSpaceGuard", () => {
    function guard() {
        const logPlayPause = vi.fn();
        const handler = createDropdownSpaceGuard({
            appStore: { viewerActive: true },
            hasGraph: () => true,
            logPlayPause,
        });
        return { handler, logPlayPause };
    }

    const triggerEvent = (tagName: string) => {
        const trigger = { tagName, blur: vi.fn() };
        return { trigger, event: key("Space", " ", {}, { type: undefined, closest: () => trigger }) };
    };

    it("plays and pauses on Space from a focused dropdown trigger, and drops its focus", () => {
        const { handler, logPlayPause } = guard();
        const { trigger, event } = triggerEvent("BUTTON");
        handler(event);
        expect(logPlayPause).toHaveBeenCalledOnce();
        expect(trigger.blur).toHaveBeenCalledOnce();
    });

    it("leaves Space to a text-input combobox", () => {
        const { handler, logPlayPause } = guard();
        handler(triggerEvent("INPUT").event);
        expect(logPlayPause).not.toHaveBeenCalled();
    });
});
