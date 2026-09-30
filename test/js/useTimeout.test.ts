import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const { timeoutAdd, timeoutRemove } = vi.hoisted(() => ({
    timeoutAdd: vi.fn(),
    timeoutRemove: vi.fn(),
}));

vi.mock("../../src/js/gui", () => ({
    default: { timeout_add: timeoutAdd, timeout_remove: timeoutRemove },
}));

import { useTimeout, type TimeoutRegistry } from "../../src/composables/useTimeout";

function inScope() {
    const scope = effectScope();
    const registry = scope.run(() => useTimeout()) as TimeoutRegistry;
    return { scope, ...registry };
}

describe("useTimeout", () => {
    beforeEach(() => {
        timeoutAdd.mockClear();
        timeoutRemove.mockClear();
    });

    it("registers the timeout with GUI", () => {
        const { scope, addTimeout } = inScope();
        const code = () => {};

        addTimeout("delay", code, 500);

        expect(timeoutAdd).toHaveBeenCalledWith("delay", code, 500);
        scope.stop();
    });

    it("removes every timeout it added when the scope is disposed", () => {
        const { scope, addTimeout } = inScope();
        addTimeout("a", () => {}, 10);
        addTimeout("b", () => {}, 10);

        scope.stop();

        expect(timeoutRemove.mock.calls).toEqual([["a"], ["b"]]);
    });

    it("tracks a re-added name once", () => {
        const { scope, addTimeout } = inScope();
        addTimeout("a", () => {}, 10);
        addTimeout("a", () => {}, 10);

        scope.stop();

        expect(timeoutRemove.mock.calls).toEqual([["a"]]);
    });

    it("stops tracking a timeout removed by hand", () => {
        const { scope, addTimeout, removeTimeout } = inScope();
        addTimeout("a", () => {}, 10);
        addTimeout("b", () => {}, 10);

        removeTimeout("a");
        expect(timeoutRemove.mock.calls).toEqual([["a"]]);

        timeoutRemove.mockClear();
        scope.stop();
        expect(timeoutRemove.mock.calls).toEqual([["b"]]);
    });

    it("removeAllTimeouts empties the list, so dispose removes nothing more", () => {
        const { scope, addTimeout, removeAllTimeouts } = inScope();
        addTimeout("a", () => {}, 10);

        removeAllTimeouts();
        expect(timeoutRemove.mock.calls).toEqual([["a"]]);

        timeoutRemove.mockClear();
        scope.stop();
        expect(timeoutRemove).not.toHaveBeenCalled();
    });
});
