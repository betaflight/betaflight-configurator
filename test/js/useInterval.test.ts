/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const { intervalAdd, intervalRemove, intervalPause, intervalResume } = vi.hoisted(() => ({
    intervalAdd: vi.fn(),
    intervalRemove: vi.fn(),
    intervalPause: vi.fn(),
    intervalResume: vi.fn(),
}));

vi.mock("../../src/js/timers", () => ({
    addInterval: intervalAdd,
    removeInterval: intervalRemove,
    pauseInterval: intervalPause,
    resumeInterval: intervalResume,
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

    it("registers the interval with the timer registry, not firing first by default", () => {
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

    it("pause and resume forward the registry's found/not-found result", () => {
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
