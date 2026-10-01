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

import { computed, ref, type ComputedRef } from "vue";

export interface DirtyState {
    dirty: ComputedRef<boolean>;
    /**
     * Adopt the current state as clean, or a snapshot from `takeSnapshot()` taken before an
     * async save — which keeps an edit made while the write is in flight dirty.
     */
    markClean: (snapshot?: string) => void;
    takeSnapshot: () => string;
}

/**
 * Shared dirty tracking for the config tabs: compare the editable state against a baseline
 * string taken at the last FC sync. Owning it here means the baseline can only be produced by
 * the same `serialize` the comparison uses — a second serializer drifting out of step is what
 * left Modes permanently dirty in #5385. A null baseline means "not tracking yet", so a tab
 * whose load failed never reports dirty.
 *
 * @param serialize side-effect free, since `dirty` calls it during render
 */
export function useDirtyState(serialize: () => string): DirtyState {
    const baseline = ref<string | null>(null);

    const dirty = computed(() => baseline.value !== null && baseline.value !== serialize());

    function markClean(snapshot?: string) {
        baseline.value = snapshot ?? serialize();
    }

    const takeSnapshot = () => serialize();

    return { dirty, markClean, takeSnapshot };
}
