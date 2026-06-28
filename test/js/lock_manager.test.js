import { describe, expect, it } from "vitest";
import { computed } from "vue";
import { LockManager, getLockManager, __resetLockManagerForTests } from "../../src/js/lock_manager.js";

// ---------------------------------------------------------------------------
// Single-hold-per-owner lock that replaces the bare GUI.connect_lock boolean.
// ---------------------------------------------------------------------------

describe("LockManager", () => {
    it("is unlocked initially", () => {
        const lm = new LockManager();
        expect(lm.locked).toBe(false);
    });

    it("setBoolean(owner, true/false) holds and releases per owner", () => {
        const lm = new LockManager();
        lm.setBoolean("gui", true);
        expect(lm.locked).toBe(true);

        // Idempotent: repeated true keeps a single hold.
        lm.setBoolean("gui", true);
        expect(lm.locked).toBe(true);

        lm.setBoolean("gui", false);
        expect(lm.locked).toBe(false);

        // Releasing when not held is a no-op.
        lm.setBoolean("gui", false);
        expect(lm.locked).toBe(false);
    });

    it("distinct owners hold independently — stays locked until all clear", () => {
        const lm = new LockManager();
        lm.setBoolean("gui", true);
        lm.setBoolean("flasher", true);
        expect(lm.locked).toBe(true);

        lm.setBoolean("gui", false);
        expect(lm.locked).toBe(true); // flasher still holds

        lm.setBoolean("flasher", false);
        expect(lm.locked).toBe(false);
    });

    it("locked is reactive — a computed over it recomputes when holds change", () => {
        const lm = new LockManager();
        const mirror = computed(() => lm.locked);
        expect(mirror.value).toBe(false);

        lm.setBoolean("gui", true);
        expect(mirror.value).toBe(true); // tracked the ref change

        lm.setBoolean("gui", false);
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
