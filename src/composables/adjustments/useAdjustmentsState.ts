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

import { reactive, ref, computed } from "vue";
import { useDirtyState } from "../useDirtyState";
import type { AdjustmentRange } from "@/stores/fc.types";

export type AdjustmentMode = "selection" | "absolute" | "step";

/** One adjustment slot as the tab edits it: the FC range plus UI-only state. */
export interface AdjustmentSlot extends AdjustmentRange {
    enabled: boolean;
    readonly mode: AdjustmentMode;
    /** `[range.start, range.end]`, for the range slider's v-model. */
    rangeArray: number[];
}

export function useAdjustmentsState() {
    const adjustments = reactive<AdjustmentSlot[]>([]);
    const showAllSlots = ref(false);

    function serializeAdjustments() {
        return JSON.stringify(
            adjustments.map((a) => ({
                auxChannelIndex: Number(a.auxChannelIndex),
                range: { start: Number(a.range.start), end: Number(a.range.end) },
                adjustmentFunction: Number(a.adjustmentFunction),
                auxSwitchChannelIndex: Number(a.auxSwitchChannelIndex),
                adjustmentCenter: Number(a.adjustmentCenter || 0),
                adjustmentScale: Number(a.adjustmentScale || 0),
                enabled: !!a.enabled,
            })),
        );
    }

    // A computed, so the deep watcher the old manually-maintained ref needed is gone.
    const { dirty: hasChanges, markClean } = useDirtyState(serializeAdjustments);

    // Wrapped so an event object from a click handler cannot be mistaken for a snapshot.
    const storeOriginals = () => markClean();

    const activeCount = computed(() => adjustments.filter((a) => a.enabled).length);

    const visibleAdjustments = computed(() => {
        if (showAllSlots.value) {
            return adjustments.map((a, i) => ({ adjustment: a, originalIndex: i }));
        }
        const result: { adjustment: AdjustmentSlot; originalIndex: number }[] = [];
        let firstDisabledAdded = false;
        for (let i = 0; i < adjustments.length; i++) {
            if (adjustments[i].enabled) {
                result.push({ adjustment: adjustments[i], originalIndex: i });
            } else if (!firstDisabledAdded) {
                result.push({ adjustment: adjustments[i], originalIndex: i });
                firstDisabledAdded = true;
            }
        }
        return result;
    });

    return { adjustments, hasChanges, storeOriginals, showAllSlots, activeCount, visibleAdjustments };
}
