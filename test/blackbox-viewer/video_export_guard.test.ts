import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateGraph, isExportInProgress, setExportInProgress } from "../../src/blackbox-viewer/playback_controls";
import { createKeydownHandler, type KeydownContext } from "../../src/blackbox-viewer/keyboard_handler";

afterEach(() => {
    setExportInProgress(false);
    vi.unstubAllGlobals();
});

describe("video export playback guard", () => {
    it("releases the queued-frame latch when an animation frame is suppressed", () => {
        const callbacks: FrameRequestCallback[] = [];
        const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => callbacks.push(callback));
        vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

        setExportInProgress(true);
        invalidateGraph();
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
        callbacks.shift()!(0);

        setExportInProgress(false);
        invalidateGraph();
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

        // Reset the module latch without entering the store-dependent render path.
        setExportInProgress(true);
        callbacks.shift()!(0);
        expect(isExportInProgress()).toBe(true);
    });

    it("blocks viewer shortcuts while the live grapher is borrowed", () => {
        const logPlayPause = vi.fn();
        const handler = createKeydownHandler({
            appStore: { viewerActive: true },
            hasGraph: () => true,
            logPlayPause,
        } as unknown as KeydownContext);
        const event = {
            code: "Space",
            key: " ",
            target: { type: "", closest: () => null },
            preventDefault: vi.fn(),
        };

        setExportInProgress(true);
        handler(event as unknown as KeyboardEvent);

        expect(logPlayPause).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});
