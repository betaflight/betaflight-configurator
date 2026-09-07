/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost/" }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createKeydownHandler } from "../src/blackbox-viewer/keyboard_handler.js";

/**
 * Test helper to create a keyboard event with proper target mocking.
 * The keyboard handler checks e.target.type and e.target.closest(),
 * so we need to mock these for the tests to work in jsdom.
 */
function createKeyboardEvent(key, code, options = {}) {
    const event = new KeyboardEvent("keydown", {
        key,
        code,
        bubbles: true,
        ...options,
    });

    // Mock event target to bypass type checks
    const mockTarget = { type: undefined, closest: () => null };
    Object.defineProperty(event, "target", {
        value: mockTarget,
        writable: true,
        configurable: true,
    });

    return event;
}

/**
 * Integration tests for keyboard layout independence in Blackbox Viewer shortcuts.
 *
 * These tests verify that the actual createKeydownHandler function correctly
 * handles keyboard events from different layouts (QWERTY, AZERTY, QWERTZ) by
 * using event.key.toLowerCase() instead of event.code for letter keys.
 */

describe("Keyboard Handler - Layout Independence", () => {
    let mockCtx;
    let handler;

    beforeEach(() => {
        // Create minimal mocked context for testing
        mockCtx = {
            hasGraph: vi.fn(() => true),
            graphStore: {
                markerTime: null,
                hasMarker: false,
                toggleAnalyserFullscreen: vi.fn(),
                toggleAnalyser: vi.fn(),
                toggleFullscreen: vi.fn(),
                graphZoom: 100,
            },
            logStore: {
                currentBlackboxTime: 1000,
            },
            playbackStore: {
                videoExportInTime: null,
                videoExportOutTime: null,
            },
            workspaceStore: {
                bookmarkTimes: [],
                workspaceGraphConfigs: {},
                activeWorkspace: 1,
                showDefaultMenu: false,
            },
            appStore: {
                viewerActive: true,
                headerDialogOpen: false,
                statusMarkerOffset: "",
            },
            // Action spies
            logPlayPause: vi.fn(),
            logJumpBack: vi.fn(),
            logJumpForward: vi.fn(),
            logJumpStart: vi.fn(),
            logJumpEnd: vi.fn(),
            logSmartSync: vi.fn(),
            setGraphZoom: vi.fn(),
            setVideoInTime: vi.fn(),
            setVideoOutTime: vi.fn(),
            setMarker: vi.fn(),
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

        handler = createKeydownHandler(mockCtx);
        // Attach handler to document
        document.addEventListener("keydown", handler);
    });

    afterEach(() => {
        // Clean up event listener
        document.removeEventListener("keydown", handler);
    });

    describe("Letter shortcuts - AZERTY layout support", () => {
        it("should trigger marker toggle on M key (AZERTY: physical semicolon position)", () => {
            const azertyMEvent = createKeyboardEvent("m", "Semicolon", {
                // AZERTY: M key is where semicolon is on QWERTY
            });

            document.dispatchEvent(azertyMEvent);

            expect(mockCtx.setMarker).toHaveBeenCalled();
            expect(mockCtx.invalidateGraph).toHaveBeenCalled();
        });

        it("should trigger marker toggle on M key (QWERTY: physical M position)", () => {
            const qwertyMEvent = createKeyboardEvent("m", "KeyM");

            document.dispatchEvent(qwertyMEvent);

            expect(mockCtx.setMarker).toHaveBeenCalled();
            expect(mockCtx.invalidateGraph).toHaveBeenCalled();
        });

        it("should trigger analyser toggle on A key (AZERTY: physical Q position)", () => {
            const azertyAEvent = createKeyboardEvent("a", "KeyQ");
            // AZERTY: A key is where Q is on QWERTY

            document.dispatchEvent(azertyAEvent);

            expect(mockCtx.graphStore.toggleAnalyser).toHaveBeenCalled();
        });

        it("should trigger analyser toggle on A key (QWERTY: physical A position)", () => {
            const qwertyAEvent = createKeyboardEvent("a", "KeyA");

            document.dispatchEvent(qwertyAEvent);

            expect(mockCtx.graphStore.toggleAnalyser).toHaveBeenCalled();
        });

        it("should trigger video in-point on I key (both layouts)", () => {
            const event = createKeyboardEvent("i", "KeyI");

            document.dispatchEvent(event);

            expect(mockCtx.setVideoInTime).toHaveBeenCalled();
        });

        it("should trigger video out-point on O key (both layouts)", () => {
            const event = createKeyboardEvent("o", "KeyO");

            document.dispatchEvent(event);

            expect(mockCtx.setVideoOutTime).toHaveBeenCalled();
        });

        it("should trigger fullscreen toggle on F key (both layouts)", () => {
            const event = createKeyboardEvent("f", "KeyF");

            document.dispatchEvent(event);

            expect(mockCtx.graphStore.toggleFullscreen).toHaveBeenCalled();
        });

        it("should trigger zoom toggle on Z key (AZERTY: physical W position)", () => {
            const azertyZEvent = createKeyboardEvent("z", "KeyW");
            // AZERTY: Z key is where W is on QWERTY

            document.dispatchEvent(azertyZEvent);

            expect(mockCtx.setGraphZoom).toHaveBeenCalled();
        });
    });

    describe("Letter shortcuts - QWERTZ layout support", () => {
        it("should handle Y/Z swap in QWERTZ layout", () => {
            // QWERTZ: physical Y key produces 'z'
            const qwertzYEvent = createKeyboardEvent("z", "KeyY");

            document.dispatchEvent(qwertzYEvent);

            // Should trigger zoom (mapped to 'z'), not fail
            expect(mockCtx.setGraphZoom).toHaveBeenCalled();
        });

        it("should handle Z/Y swap in QWERTZ layout", () => {
            // QWERTZ: physical Z key produces 'y'
            const qwertzZEvent = createKeyboardEvent("y", "KeyZ");

            document.dispatchEvent(qwertzZEvent);

            // 'y' is not a shortcut, so no action should be taken
            expect(mockCtx.setGraphZoom).not.toHaveBeenCalled();
        });
    });

    describe("Letter shortcuts - Case independence", () => {
        it("should handle uppercase M (with Shift)", () => {
            const event = createKeyboardEvent("M", "KeyM", { shiftKey: true });

            document.dispatchEvent(event);

            // Should still match 'm' after toLowerCase()
            expect(mockCtx.setMarker).toHaveBeenCalled();
        });

        it("should handle lowercase m (without Shift)", () => {
            const event = createKeyboardEvent("m", "KeyM", { shiftKey: false });

            document.dispatchEvent(event);

            expect(mockCtx.setMarker).toHaveBeenCalled();
        });
    });

    describe("Navigation keys - Use event.code (unchanged)", () => {
        it("should toggle play/pause on Space", () => {
            const event = createKeyboardEvent(" ", "Space");

            document.dispatchEvent(event);

            expect(mockCtx.logPlayPause).toHaveBeenCalled();
        });

        it("should jump back on ArrowLeft", () => {
            const event = createKeyboardEvent("ArrowLeft", "ArrowLeft");

            document.dispatchEvent(event);

            expect(mockCtx.logJumpBack).toHaveBeenCalled();
        });

        it("should jump forward on ArrowRight", () => {
            const event = createKeyboardEvent("ArrowRight", "ArrowRight");

            document.dispatchEvent(event);

            expect(mockCtx.logJumpForward).toHaveBeenCalled();
        });

        it("should jump to start on Home", () => {
            const event = createKeyboardEvent("Home", "Home");

            document.dispatchEvent(event);

            expect(mockCtx.logJumpStart).toHaveBeenCalled();
        });

        it("should jump to end on End", () => {
            const event = createKeyboardEvent("End", "End");

            document.dispatchEvent(event);

            expect(mockCtx.logJumpEnd).toHaveBeenCalled();
        });
    });

    describe('Digit keys - Use event.code.startsWith("Digit") (unchanged)', () => {
        it("should handle workspace switch on digit 1", () => {
            mockCtx.workspaceStore.workspaceGraphConfigs[1] = { title: "Test" };

            const event = createKeyboardEvent("1", "Digit1");

            document.dispatchEvent(event);

            // Handler uses code ("Digit1") not key ("1") for detection and parsing
            expect(mockCtx.onSwitchWorkspace).toHaveBeenCalledWith(mockCtx.workspaceStore.workspaceGraphConfigs, 1);
        });

        it("should handle workspace switch on digit 5", () => {
            mockCtx.workspaceStore.workspaceGraphConfigs[5] = { title: "Test" };

            const event = createKeyboardEvent("5", "Digit5");

            document.dispatchEvent(event);

            // Handler uses code ("Digit5") not key ("5") for detection and parsing
            expect(mockCtx.onSwitchWorkspace).toHaveBeenCalledWith(mockCtx.workspaceStore.workspaceGraphConfigs, 5);
        });

        it("should handle bookmark jump on alt+digit with layout-specific key (code-based parsing)", () => {
            mockCtx.workspaceStore.bookmarkTimes[1] = 5000;

            // On AZERTY, physical Digit1 key produces "&" by default
            // This proves handler uses code ("Digit1") not key ("&") for parsing
            const event = createKeyboardEvent("&", "Digit1", { altKey: true });

            document.dispatchEvent(event);

            // Handler parses ID from code ("Digit1" -> 1), ignores layout-specific key
            expect(mockCtx.setCurrentBlackboxTime).toHaveBeenCalledWith(5000);
            expect(mockCtx.invalidateGraph).toHaveBeenCalled();
        });
    });

    describe("Edge cases", () => {
        it("should not trigger shortcuts when viewer is not active", () => {
            mockCtx.appStore.viewerActive = false;

            const event = createKeyboardEvent("m", "KeyM");

            document.dispatchEvent(event);

            expect(mockCtx.setMarker).not.toHaveBeenCalled();
        });

        it("should not trigger shortcuts when text input is focused", () => {
            const event = createKeyboardEvent("m", "KeyM");
            // Mock target as a text input
            Object.defineProperty(event, "target", {
                value: { type: "text", closest: () => null },
                writable: false,
            });

            document.dispatchEvent(event);

            expect(mockCtx.setMarker).not.toHaveBeenCalled();
        });

        it("should not trigger shortcuts for non-letter, non-navigation keys", () => {
            const event = createKeyboardEvent("Dead", "Quote");

            document.dispatchEvent(event);

            // Dead keys should not match any shortcut
            expect(mockCtx.setMarker).not.toHaveBeenCalled();
            expect(mockCtx.logPlayPause).not.toHaveBeenCalled();
        });
    });
});
