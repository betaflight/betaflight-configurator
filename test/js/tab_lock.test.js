import { afterEach, describe, expect, it, vi } from "vitest";
import { hasWebLocks, acquireTabLock } from "../../src/js/utils/tab_lock.js";

// ---------------------------------------------------------------------------
// S5 — feature-detected multi-tab lock. Never calls navigator.locks
// unconditionally; degrades to single-tab no-op when the API is absent.
// ---------------------------------------------------------------------------

const realNavigator = globalThis.navigator;

afterEach(() => {
    // Restore whatever the environment provided.
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: realNavigator });
    vi.restoreAllMocks();
});

function setNavigatorLocks(locks) {
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: locks ? { locks } : {},
    });
}

describe("S5 tab_lock feature detection", () => {
    it("reports absence when navigator.locks is missing (single-webview shells)", () => {
        setNavigatorLocks(null);
        expect(hasWebLocks()).toBe(false);
    });

    it("reports presence when navigator.locks.request exists", () => {
        setNavigatorLocks({ request: vi.fn() });
        expect(hasWebLocks()).toBe(true);
    });
});

describe("S5 acquireTabLock", () => {
    it("resolves acquired with a no-op release when Web Locks is unavailable", async () => {
        setNavigatorLocks(null);
        const lock = await acquireTabLock("serial_0");
        expect(lock.acquired).toBe(true);
        expect(() => lock.release()).not.toThrow();
    });

    it("acquires the lock and holds it until release when Web Locks is available", async () => {
        let heldPromise = null;
        const request = vi.fn((_name, _opts, cb) => {
            // Simulate the API granting the lock and holding it for the callback's promise.
            heldPromise = cb({ name: _name });
            return Promise.resolve();
        });
        setNavigatorLocks({ request });

        const lock = await acquireTabLock("serial_0");
        expect(lock.acquired).toBe(true);
        expect(request).toHaveBeenCalledWith(
            "bf-connection:serial_0",
            expect.objectContaining({ mode: "exclusive", ifAvailable: true }),
            expect.any(Function),
        );
        // The callback's promise stays pending (lock held) until release().
        let resolved = false;
        heldPromise.then(() => (resolved = true));
        expect(resolved).toBe(false);
        lock.release();
        await Promise.resolve();
        expect(resolved).toBe(true);
    });

    it("reports acquired:false when another tab already holds the lock", async () => {
        const request = vi.fn((_name, _opts, cb) => {
            // ifAvailable => lock is null when contended.
            cb(null);
            return Promise.resolve();
        });
        setNavigatorLocks({ request });

        const lock = await acquireTabLock("serial_0");
        expect(lock.acquired).toBe(false);
        expect(() => lock.release()).not.toThrow();
    });

    it("degrades to single-tab (acquired:true) if the API throws", async () => {
        const request = vi.fn(() => Promise.reject(new Error("nope")));
        setNavigatorLocks({ request });

        const lock = await acquireTabLock("serial_0");
        expect(lock.acquired).toBe(true);
    });
});
