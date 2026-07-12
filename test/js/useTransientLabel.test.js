import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useTransientLabel } from "../../src/composables/useTransientLabel";

describe("useTransientLabel", () => {
    let scope;
    let label;
    let flash;

    beforeEach(() => {
        vi.useFakeTimers();
        scope = effectScope();
        scope.run(() => {
            ({ label, flash } = useTransientLabel("Save"));
        });
    });

    afterEach(() => {
        scope.stop();
        vi.useRealTimers();
    });

    it("shows the base label by default", () => {
        expect(label.value).toBe("Save");
    });

    it("flash sets the transient text immediately", () => {
        flash("Saved", 1500);
        expect(label.value).toBe("Saved");
    });

    it("reverts to the base label after the given delay", () => {
        flash("Saved", 1500);
        vi.advanceTimersByTime(1499);
        expect(label.value).toBe("Saved");
        vi.advanceTimersByTime(1);
        expect(label.value).toBe("Save");
    });

    it("re-flashing before expiry clears the prior timer (only one revert)", () => {
        flash("Saving", 1000);
        vi.advanceTimersByTime(500);

        flash("Saved", 1500);
        // Past the first timer's original 1000ms deadline: it must not have fired.
        vi.advanceTimersByTime(600);
        expect(label.value).toBe("Saved");

        // Past the second timer's 1500ms deadline: exactly one revert to base.
        vi.advanceTimersByTime(1000);
        expect(label.value).toBe("Save");
    });

    it("clears the pending timer on scope dispose", () => {
        flash("Saved", 1500);
        expect(vi.getTimerCount()).toBe(1);

        expect(() => scope.stop()).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("accepts a getter as the base label", () => {
        let dynamicLabel;
        const getterScope = effectScope();
        getterScope.run(() => {
            let current = "First";
            const composable = useTransientLabel(() => current);
            dynamicLabel = composable.label;
            current = "Second";
        });

        expect(dynamicLabel.value).toBe("Second");
        getterScope.stop();
    });
});
