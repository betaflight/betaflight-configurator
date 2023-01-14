import "bluebird";
import { JSDOM } from "jsdom";
import $ from "jquery";
import { vi } from "vitest";
import jBox from "jbox";

// Note: this can go away once jquery is used as module everywhere
const { window } = new JSDOM("");
$(window);
globalThis.$ = $;
globalThis.jQuery = $;
globalThis.jBox = jBox;

Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});
