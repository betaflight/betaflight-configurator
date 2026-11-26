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

import { describe, expect, it } from "vitest";
import { reactive, ref } from "vue";
import { useDirtyState } from "../../src/composables/useDirtyState";

function setup(initial: Record<string, number> = { a: 1 }) {
    const state = reactive({ ...initial });
    const tracker = useDirtyState(() => JSON.stringify(state));
    return { state, ...tracker };
}

describe("useDirtyState", () => {
    it("stays clean before the first markClean, so a failed load cannot enable Save", () => {
        const { state, dirty } = setup();

        expect(dirty.value).toBe(false);
        state.a = 2;
        expect(dirty.value).toBe(false);
    });

    it("reports a change once tracking has started", () => {
        const { state, dirty, markClean } = setup();

        markClean();
        expect(dirty.value).toBe(false);

        state.a = 2;
        expect(dirty.value).toBe(true);
    });

    it("goes clean again when the state returns to the baseline", () => {
        const { state, dirty, markClean } = setup();
        markClean();

        state.a = 2;
        expect(dirty.value).toBe(true);

        state.a = 1;
        expect(dirty.value).toBe(false);
    });

    it("adopts the current state on a bare markClean", () => {
        const { state, dirty, markClean } = setup();
        markClean();

        state.a = 2;
        markClean();
        expect(dirty.value).toBe(false);
    });

    it("keeps an edit made mid-save dirty when a pinned snapshot is adopted", () => {
        const { state, dirty, markClean, takeSnapshot } = setup();
        markClean();

        // What the save is about to write.
        state.a = 2;
        const inFlight = takeSnapshot();

        // The user edits again while the write is still going.
        state.a = 3;

        markClean(inFlight);
        expect(dirty.value).toBe(true);
    });

    it("treats an empty-string snapshot as tracked rather than untracked", () => {
        const state = reactive({ text: "" });
        const { dirty, markClean } = useDirtyState(() => state.text);

        markClean();
        expect(dirty.value).toBe(false);

        state.text = "x";
        expect(dirty.value).toBe(true);
    });

    it("reports dirty when the unsaved check is true, even with a clean snapshot", () => {
        const state = reactive({ a: 1 });
        const pending = ref(false);
        const { dirty, markClean } = useDirtyState(() => JSON.stringify(state), { unsaved: () => pending.value });

        // Not tracking yet, so nothing is dirty whatever the check says.
        pending.value = true;
        expect(dirty.value).toBe(false);

        markClean();
        expect(dirty.value).toBe(true);

        pending.value = false;
        expect(dirty.value).toBe(false);
    });
});
