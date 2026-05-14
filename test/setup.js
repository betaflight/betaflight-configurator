import { JSDOM } from "jsdom";
import { vi } from "vitest";

const { window } = new JSDOM("");

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

if (globalThis.HTMLDialogElement && !globalThis.HTMLDialogElement.prototype.showModal) {
    globalThis.HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
}

if (globalThis.HTMLDialogElement && !globalThis.HTMLDialogElement.prototype.close) {
    globalThis.HTMLDialogElement.prototype.close = function close() {
        this.open = false;
        this.dispatchEvent(new Event("close"));
    };
}
