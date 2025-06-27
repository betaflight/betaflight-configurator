import { JSDOM } from "jsdom";
import $ from "jquery";
import { vi } from "vitest";

// Note: this can go away once jquery is used as module everywhere
const { window } = new JSDOM("");
$(window);
globalThis.$ = $;
globalThis.jQuery = $;

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
