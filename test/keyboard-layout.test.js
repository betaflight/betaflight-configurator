/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost/" }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKeydownHandler } from '../src/blackbox-viewer/keyboard_handler.js';

/**
 * Integration tests for keyboard layout independence in Blackbox Viewer shortcuts.
 * 
 * These tests verify that the actual createKeydownHandler function correctly
 * handles keyboard events from different layouts (QWERTY, AZERTY, QWERTZ) by
 * using event.key.toLowerCase() instead of event.code for letter keys.
 */

describe('Keyboard Handler - Layout Independence', () => {
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
                statusMarkerOffset: '',
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
    });

    describe('Letter shortcuts - AZERTY layout support', () => {
        it('should trigger marker toggle on M key (AZERTY: physical semicolon position)', () => {
            const azertyMEvent = new KeyboardEvent('keydown', {
                key: 'm',
                code: 'Semicolon', // AZERTY: M key is where semicolon is on QWERTY
                bubbles: true,
            });

            document.dispatchEvent(azertyMEvent);

            expect(mockCtx.setMarker).toHaveBeenCalled();
            expect(mockCtx.invalidateGraph).toHaveBeenCalled();
        });

        it('should trigger marker toggle on M key (QWERTY: physical M position)', () => {
            const qwertyMEvent = new KeyboardEvent('keydown', {
                key: 'm',
                code: 'KeyM', // QWERTY: M key is where M is
                bubbles: true,
            });

            document.dispatchEvent(qwertyMEvent);

            expect(mockCtx.setMarker).toHaveBeenCalled();
            expect(mockCtx.invalidateGraph).toHaveBeenCalled();
        });

        it('should trigger analyser toggle on A key (AZERTY: physical Q position)', () => {
            const azertyAEvent = new KeyboardEvent('keydown', {
                key: 'a',
                code: 'KeyQ', // AZERTY: A key is where Q is on QWERTY
                bubbles: true,
            });

            document.dispatchEvent(azertyAEvent);

            expect(mockCtx.graphStore.toggleAnalyser).toHaveBeenCalled();
        });

        it('should trigger analyser toggle on A key (QWERTY: physical A position)', () => {
            const qwertyAEvent = new KeyboardEvent('keydown', {
                key: 'a',
                code: 'KeyA', // QWERTY: A key is where A is
                bubbles: true,
            });

            document.dispatchEvent(qwertyAEvent);

            expect(mockCtx.graphStore.toggleAnalyser).toHaveBeenCalled();
        });

        it('should trigger video in-point on I key (both layouts)', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'i',
                code: 'KeyI',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.setVideoInTime).toHaveBeenCalled();
        });

        it('should trigger video out-point on O key (both layouts)', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'o',
                code: 'KeyO',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.setVideoOutTime).toHaveBeenCalled();
        });

        it('should trigger fullscreen toggle on F key (both layouts)', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'f',
                code: 'KeyF',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.graphStore.toggleFullscreen).toHaveBeenCalled();
        });

        it('should trigger zoom toggle on Z key (AZERTY: physical W position)', () => {
            const azertyZEvent = new KeyboardEvent('keydown', {
                key: 'z',
                code: 'KeyW', // AZERTY: Z key is where W is on QWERTY
                bubbles: true,
            });

            document.dispatchEvent(azertyZEvent);

            expect(mockCtx.setGraphZoom).toHaveBeenCalled();
        });
    });

    describe('Letter shortcuts - QWERTZ layout support', () => {
        it('should handle Y/Z swap in QWERTZ layout', () => {
            // QWERTZ: physical Y key produces 'z'
            const qwertzYEvent = new KeyboardEvent('keydown', {
                key: 'z',
                code: 'KeyY',
                bubbles: true,
            });

            document.dispatchEvent(qwertzYEvent);

            // Should trigger zoom (mapped to 'z'), not fail
            expect(mockCtx.setGraphZoom).toHaveBeenCalled();
        });

        it('should handle Z/Y swap in QWERTZ layout', () => {
            // QWERTZ: physical Z key produces 'y'
            const qwertzZEvent = new KeyboardEvent('keydown', {
                key: 'y',
                code: 'KeyZ',
                bubbles: true,
            });

            document.dispatchEvent(qwertzZEvent);

            // 'y' is not a shortcut, so no action should be taken
            expect(mockCtx.setGraphZoom).not.toHaveBeenCalled();
        });
    });

    describe('Letter shortcuts - Case independence', () => {
        it('should handle uppercase M (with Shift)', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'M', // Uppercase with Shift
                code: 'KeyM',
                shiftKey: true,
                bubbles: true,
            });

            document.dispatchEvent(event);

            // Should still match 'm' after toLowerCase()
            expect(mockCtx.setMarker).toHaveBeenCalled();
        });

        it('should handle lowercase m (without Shift)', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'm',
                code: 'KeyM',
                shiftKey: false,
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.setMarker).toHaveBeenCalled();
        });
    });

    describe('Navigation keys - Use event.code (unchanged)', () => {
        it('should toggle play/pause on Space', () => {
            const event = new KeyboardEvent('keydown', {
                key: ' ',
                code: 'Space',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.logPlayPause).toHaveBeenCalled();
        });

        it('should jump back on ArrowLeft', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowLeft',
                code: 'ArrowLeft',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.logJumpBack).toHaveBeenCalled();
        });

        it('should jump forward on ArrowRight', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowRight',
                code: 'ArrowRight',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.logJumpForward).toHaveBeenCalled();
        });

        it('should jump to start on Home', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'Home',
                code: 'Home',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.logJumpStart).toHaveBeenCalled();
        });

        it('should jump to end on End', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'End',
                code: 'End',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.logJumpEnd).toHaveBeenCalled();
        });
    });

    describe('Digit keys - Use event.code.startsWith("Digit") (unchanged)', () => {
        it('should handle workspace switch on digit 1', () => {
            mockCtx.workspaceStore.workspaceGraphConfigs[1] = { title: 'Test' };

            const event = new KeyboardEvent('keydown', {
                key: '1',
                code: 'Digit1',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.onSwitchWorkspace).toHaveBeenCalled();
        });

        it('should handle workspace switch on digit 5', () => {
            mockCtx.workspaceStore.workspaceGraphConfigs[5] = { title: 'Test' };

            const event = new KeyboardEvent('keydown', {
                key: '5',
                code: 'Digit5',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.onSwitchWorkspace).toHaveBeenCalled();
        });
    });

    describe('Edge cases', () => {
        it('should not trigger shortcuts when viewer is not active', () => {
            mockCtx.appStore.viewerActive = false;

            const event = new KeyboardEvent('keydown', {
                key: 'm',
                code: 'KeyM',
                bubbles: true,
            });

            document.dispatchEvent(event);

            expect(mockCtx.setMarker).not.toHaveBeenCalled();
        });

        it('should not trigger shortcuts when text input is focused', () => {
            const input = document.createElement('input');
            input.type = 'text';
            document.body.appendChild(input);
            input.focus();

            const event = new KeyboardEvent('keydown', {
                key: 'm',
                code: 'KeyM',
                bubbles: true,
            });

            input.dispatchEvent(event);

            expect(mockCtx.setMarker).not.toHaveBeenCalled();
            input.remove();
        });

        it('should not trigger shortcuts for non-letter, non-navigation keys', () => {
            const event = new KeyboardEvent('keydown', {
                key: 'Dead',
                code: 'Quote',
                bubbles: true,
            });

            document.dispatchEvent(event);

            // Dead keys should not match any shortcut
            expect(mockCtx.setMarker).not.toHaveBeenCalled();
            expect(mockCtx.logPlayPause).not.toHaveBeenCalled();
        });
    });
});
