import { afterEach, describe, expect, it, vi } from "vitest";
import {
    invalidateGraph,
    isExportInProgress,
    setExportInProgress,
} from "../../src/blackbox-viewer/playback_controls.js";
import { createKeydownHandler } from "../../src/blackbox-viewer/keyboard_handler.js";

afterEach(() => {
    setExportInProgress(false);
    vi.unstubAllGlobals();
});

describe("video export playback guard", () => {
    it("releases the queued-frame latch when an animation frame is suppressed", () => {
        const callbacks = [];
        const requestAnimationFrame = vi.fn((callback) => callbacks.push(callback));
        vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

        setExportInProgress(true);
        invalidateGraph();
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
        callbacks.shift()();

        setExportInProgress(false);
        invalidateGraph();
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

        // Reset the module latch without entering the store-dependent render path.
        setExportInProgress(true);
        callbacks.shift()();
        expect(isExportInProgress()).toBe(true);
    });

    it("blocks viewer shortcuts while the live grapher is borrowed", () => {
        const logPlayPause = vi.fn();
        const handler = createKeydownHandler({
            appStore: { viewerActive: true },
            hasGraph: () => true,
            logPlayPause,
        });
        const event = {
            code: "Space",
            key: " ",
            target: { type: "", closest: () => null },
            preventDefault: vi.fn(),
        };

        setExportInProgress(true);
        handler(event);

        expect(logPlayPause).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});
