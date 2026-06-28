import { describe, expect, it } from "vitest";
import { LockManager, getLockManager, __resetLockManagerForTests } from "../../src/js/lock_manager.js";

// ---------------------------------------------------------------------------
// S4 — ref-counting RAII lock that replaces the bare GUI.connect_lock boolean.
// ---------------------------------------------------------------------------

describe("S4 LockManager", () => {
    it("is unlocked initially", () => {
        const lm = new LockManager();
        expect(lm.locked).toBe(false);
        expect(lm.count).toBe(0);
    });

    it("locks on acquire and unlocks on release (RAII token)", () => {
        const lm = new LockManager();
        const hold = lm.acquire("flasher");
        expect(lm.locked).toBe(true);
        expect(lm.owners).toContain("flasher");
        hold.release();
        expect(lm.locked).toBe(false);
    });

    it("ref-counts: stays locked until ALL holders release", () => {
        const lm = new LockManager();
        const a = lm.acquire("reboot");
        const b = lm.acquire("flasher");
        expect(lm.count).toBe(2);

        a.release();
        expect(lm.locked).toBe(true); // b still holds

        b.release();
        expect(lm.locked).toBe(false);
    });

    it("release is idempotent — releasing the same token twice is a no-op", () => {
        const lm = new LockManager();
        const a = lm.acquire("x");
        const b = lm.acquire("y");
        a.release();
        a.release(); // must NOT decrement b's hold
        expect(lm.locked).toBe(true);
        b.release();
        expect(lm.locked).toBe(false);
    });

    it("release(token) via the manager also works and tolerates foreign tokens", () => {
        const lm = new LockManager();
        const a = lm.acquire("x");
        lm.release(a);
        expect(lm.locked).toBe(false);
        // Foreign / junk tokens are tolerated.
        expect(() => lm.release(null)).not.toThrow();
        expect(() => lm.release({})).not.toThrow();
    });

    it("releaseAll clears every holder", () => {
        const lm = new LockManager();
        lm.acquire("a");
        lm.acquire("b");
        lm.releaseAll();
        expect(lm.locked).toBe(false);
    });

    it("getLockManager is a stable singleton until reset", () => {
        __resetLockManagerForTests();
        const a = getLockManager();
        expect(getLockManager()).toBe(a);
        __resetLockManagerForTests();
        expect(getLockManager()).not.toBe(a);
    });
});
