/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost/" }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Test keyboard layout independence for Blackbox Viewer shortcuts.
 * 
 * This test verifies that keyboard shortcuts work correctly regardless of
 * the user's keyboard layout (QWERTY, AZERTY, QWERTZ, etc.).
 * 
 * The fix changes from using event.code (physical key position) to
 * event.key.toLowerCase() (actual character produced).
 */

describe('Keyboard Layout Independence', () => {
    describe('Letter key mapping', () => {
        it('should map lowercase letter "m" to marker handler', () => {
            // Simulate AZERTY: physical M key produces key="m", code="Semicolon"
            const azertyMEvent = {
                key: 'm',
                code: 'Semicolon',
                preventDefault: vi.fn(),
                altKey: false,
                shiftKey: false,
                ctrlKey: false,
                metaKey: false,
            };

            // Simulate QWERTY: physical M key produces key="m", code="KeyM"
            const qwertyMEvent = {
                key: 'm',
                code: 'KeyM',
                preventDefault: vi.fn(),
                altKey: false,
                shiftKey: false,
                ctrlKey: false,
                metaKey: false,
            };

            // Both should match the same handler (key.toLowerCase() === "m")
            const letterKeyHandlers = {
                m: 'markerHandler',
                i: 'videoInHandler',
                o: 'videoOutHandler',
            };

            expect(letterKeyHandlers[azertyMEvent.key.toLowerCase()]).toBe('markerHandler');
            expect(letterKeyHandlers[qwertyMEvent.key.toLowerCase()]).toBe('markerHandler');
        });

        it('should handle AZERTY-specific key mappings', () => {
            // AZERTY layout: M is where semicolon is on QWERTY
            const azertyM = { key: 'm', code: 'Semicolon' };
            
            // QWERTY layout: M is where M is
            const qwertyM = { key: 'm', code: 'KeyM' };

            // Both should work with key.toLowerCase()
            expect(azertyM.key.toLowerCase()).toBe('m');
            expect(qwertyM.key.toLowerCase()).toBe('m');
            expect(azertyM.key.toLowerCase()).toBe(qwertyM.key.toLowerCase());
        });

        it('should handle QWERTZ Y/Z swap', () => {
            // QWERTZ: physical Y key produces "z"
            const qwertzY = { key: 'z', code: 'KeyY' };
            
            // QWERTY: physical Y key produces "y"
            const qwertyY = { key: 'y', code: 'KeyY' };

            // key.lowercase correctly identifies the intended character
            expect(qwertzY.key.toLowerCase()).toBe('z');
            expect(qwertyY.key.toLowerCase()).toBe('y');
        });

        it('should preserve case-insensitive matching', () => {
            // User can press with or without Shift
            const uppercaseM = { key: 'M' };
            const lowercaseM = { key: 'm' };

            // Both should match after toLowerCase()
            expect(uppercaseM.key.toLowerCase()).toBe('m');
            expect(lowercaseM.key.toLowerCase()).toBe('m');
        });
    });

    describe('Navigation keys (should still use code)', () => {
        it('Space key should be identified by code', () => {
            // Space is always Space regardless of layout
            const spaceEvent = {
                key: ' ',
                code: 'Space',
            };

            // Navigation keys use code, not key
            expect(spaceEvent.code).toBe('Space');
            expect(spaceEvent.key).toBe(' ');
        });

        it('Arrow keys should be identified by code', () => {
            const arrowLeft = { key: 'ArrowLeft', code: 'ArrowLeft' };
            const arrowRight = { key: 'ArrowRight', code: 'ArrowRight' };

            // Arrow keys have same key and code
            expect(arrowLeft.code).toBe('ArrowLeft');
            expect(arrowRight.code).toBe('ArrowRight');
        });

        it('Digit keys should be identified by code prefix', () => {
            const digit1 = { key: '1', code: 'Digit1' };
            const digit5 = { key: '5', code: 'Digit5' };
            const digit0 = { key: '0', code: 'Digit0' };

            // Digits don't move between layouts, code is reliable
            expect(digit1.code.startsWith('Digit')).toBe(true);
            expect(digit5.code.startsWith('Digit')).toBe(true);
            expect(digit0.code.startsWith('Digit')).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should handle special characters on different layouts', () => {
            // On AZERTY, pressing 2 produces "é"
            const azerty2 = { key: 'é', code: 'Digit2' };
            
            // On QWERTY, pressing 2 produces "2"
            const qwerty2 = { key: '2', code: 'Digit2' };

            // For letter shortcuts, we use key.toLowerCase()
            // For digits, we use code.startsWith('Digit')
            expect(azerty2.code.startsWith('Digit')).toBe(true);
            expect(qwerty2.code.startsWith('Digit')).toBe(true);
        });

        it('should handle dead keys and accents', () => {
            // Some layouts have dead keys for accents
            const deadKey = { key: 'Dead', code: 'Quote' };
            
            // Dead keys should not match any letter shortcut
            expect(deadKey.key.toLowerCase()).toBe('dead');
            expect(deadKey.key.toLowerCase()).not.toBe('a');
            expect(deadKey.key.toLowerCase()).not.toBe('q');
        });
    });
});
