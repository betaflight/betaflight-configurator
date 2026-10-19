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

import { beforeEach, describe, expect, it } from "vitest";
import { craftKey, loadHistory, resultHasData, sameRun, saveHistory } from "../../src/stores/frameHistory";
import type { WizardResult } from "../../src/stores/frameWizardProtocol";

const empty = {
    phase: "idle",
    points: [[], [], [], [], [], []],
    motors: [[], [], [], []],
} as unknown as WizardResult;
const run = {
    ...empty,
    phase: "done",
    motors: [[{ hz: 212, gain: 0.1, axis: "roll", speeds: 2, cable: false }], [], [], []],
} as unknown as WizardResult;

describe("frame test history", () => {
    beforeEach(() => localStorage.clear());

    it("keys a craft by its MCU id, none before the id is known", () => {
        expect(craftKey([0x00350041, 0x3233510a, 0x37363832])).toBe("frame_test_history_003500413233510a37363832");
        expect(craftKey([0, 0, 0])).toBeNull();
        expect(craftKey(undefined)).toBeNull();
    });

    it("keeps the run and the autotune apart, per craft", () => {
        const a = craftKey([1, 2, 3]);
        const b = craftKey([4, 5, 6]);
        saveHistory(a, { run: { at: "2026-10-19T14:42:37Z", result: run, spinCheck: null } });
        saveHistory(a, { tune: { at: "2026-10-19T15:10:00Z", status: { state: "applied" } as never } });
        expect(loadHistory(a).run?.result).toEqual(run);
        expect(loadHistory(a).tune?.at).toBe("2026-10-19T15:10:00Z");
        expect(loadHistory(b)).toEqual({});
        expect(loadHistory(null)).toEqual({});
    });

    it("tells an empty result (the FC restarted) from a run, and the same run from another", () => {
        expect(resultHasData(empty)).toBe(false);
        expect(resultHasData(null)).toBe(false);
        expect(resultHasData(run)).toBe(true);
        expect(sameRun(run, structuredClone(run))).toBe(true);
        expect(sameRun(run, empty)).toBe(false);
    });
});
