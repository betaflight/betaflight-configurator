import { describe, expect, it } from "vitest";
import { computed } from "vue";
import { LockManager, getLockManager, __resetLockManagerForTests } from "../../src/js/lock_manager.js";

// ---------------------------------------------------------------------------
// The connection/flasher lock — a single reactive boolean behind GUI.connect_lock
// and store.connectLock. One port-owning operation holds it at a time.
// ---------------------------------------------------------------------------

describe("LockManager", () => {
    it("is unlocked initially", () => {
        const lm = new LockManager();
        expect(lm.locked).toBe(false);
    });

    it("locked is settable and coerces to boolean", () => {
        const lm = new LockManager();
        lm.locked = true;
        expect(lm.locked).toBe(true);
        lm.locked = false;
        expect(lm.locked).toBe(false);
        // Truthy/falsy values are coerced.
        lm.locked = 1;
        expect(lm.locked).toBe(true);
        lm.locked = 0;
        expect(lm.locked).toBe(false);
    });

    it("locked is reactive — a computed over it recomputes when it changes", () => {
        const lm = new LockManager();
        const mirror = computed(() => lm.locked);
        expect(mirror.value).toBe(false);

        lm.locked = true;
        expect(mirror.value).toBe(true); // tracked the ref change

        lm.locked = false;
        expect(mirror.value).toBe(false);
    });

    it("getLockManager is a stable singleton until reset", () => {
        __resetLockManagerForTests();
        const a = getLockManager();
        expect(getLockManager()).toBe(a);
        __resetLockManagerForTests();
        expect(getLockManager()).not.toBe(a);
    });
});
