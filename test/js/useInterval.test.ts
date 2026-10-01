import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const { intervalAdd, intervalRemove, intervalPause, intervalResume } = vi.hoisted(() => ({
    intervalAdd: vi.fn(),
    intervalRemove: vi.fn(),
    intervalPause: vi.fn(),
    intervalResume: vi.fn(),
}));

vi.mock("../../src/js/gui", () => ({
    default: {
        interval_add: intervalAdd,
        interval_remove: intervalRemove,
        interval_pause: intervalPause,
        interval_resume: intervalResume,
    },
}));

import { useInterval, type IntervalRegistry } from "../../src/composables/useInterval";

function inScope() {
    const scope = effectScope();
    const registry = scope.run(() => useInterval()) as IntervalRegistry;
    return { scope, ...registry };
}

describe("useInterval", () => {
    beforeEach(() => {
        intervalAdd.mockReset();
        intervalRemove.mockReset();
        intervalPause.mockReset();
        intervalResume.mockReset();
    });

    it("registers the interval with GUI, not firing first by default", () => {
        const { scope, addInterval } = inScope();
        const code = () => {};

        addInterval("poll", code, 100);

        expect(intervalAdd).toHaveBeenCalledWith("poll", code, 100, false);
        scope.stop();
    });

    it("passes first through when asked to fire immediately", () => {
        const { scope, addInterval } = inScope();
        const code = () => {};

        addInterval("poll", code, 100, true);

        expect(intervalAdd).toHaveBeenCalledWith("poll", code, 100, true);
        scope.stop();
    });

    it("removes every interval it added when the scope is disposed", () => {
        const { scope, addInterval } = inScope();
        addInterval("a", () => {}, 10);
        addInterval("b", () => {}, 10);

        scope.stop();

        expect(intervalRemove.mock.calls).toEqual([["a"], ["b"]]);
    });

    it("tracks a re-added name once", () => {
        const { scope, addInterval } = inScope();
        addInterval("a", () => {}, 10);
        addInterval("a", () => {}, 10);

        scope.stop();

        expect(intervalRemove.mock.calls).toEqual([["a"]]);
    });

    it("stops tracking an interval removed by hand", () => {
        const { scope, addInterval, removeInterval } = inScope();
        addInterval("a", () => {}, 10);
        addInterval("b", () => {}, 10);

        removeInterval("a");
        expect(intervalRemove.mock.calls).toEqual([["a"]]);

        intervalRemove.mockClear();
        scope.stop();
        expect(intervalRemove.mock.calls).toEqual([["b"]]);
    });

    it("removeAllIntervals empties the list, so dispose removes nothing more", () => {
        const { scope, addInterval, removeAllIntervals } = inScope();
        addInterval("a", () => {}, 10);

        removeAllIntervals();
        expect(intervalRemove.mock.calls).toEqual([["a"]]);

        intervalRemove.mockClear();
        scope.stop();
        expect(intervalRemove).not.toHaveBeenCalled();
    });

    it("pause and resume forward GUI's found/not-found result", () => {
        const { scope, pauseInterval, resumeInterval } = inScope();
        intervalPause.mockReturnValueOnce(true).mockReturnValueOnce(false);
        intervalResume.mockReturnValueOnce(false);

        expect(pauseInterval("a")).toBe(true);
        expect(pauseInterval("missing")).toBe(false);
        expect(resumeInterval("missing")).toBe(false);
        expect(intervalPause.mock.calls).toEqual([["a"], ["missing"]]);
        expect(intervalResume).toHaveBeenCalledWith("missing");
        scope.stop();
    });

    it("a paused interval is still removed on dispose", () => {
        const { scope, addInterval, pauseInterval } = inScope();
        addInterval("a", () => {}, 10);
        pauseInterval("a");

        scope.stop();

        expect(intervalRemove.mock.calls).toEqual([["a"]]);
    });
});
