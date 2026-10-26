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

import type { Ref } from "vue";
import { mspHelper } from "../../js/msp/MSPHelper";
import { buildModeRangePayload, type Mode } from "../../js/utils/modeRanges";
import { useFlightControllerStore } from "@/stores/fc";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";
import type { DirtyState } from "@/composables/useDirtyState";

/**
 * Save path for the Modes (Auxiliary) tab: marshal the edited modes into the store, send them
 * to the FC and persist to EEPROM.
 * @param modes the tab's editable modes
 * @param requiredModeRangeCount how many range slots the FC reported; the payload is padded to it
 * @param dirtyState the tab's dirty tracking; the baseline only moves after a successful persist
 */
export function useAuxiliarySave(
    modes: Mode[],
    requiredModeRangeCount: Ref<number>,
    { takeSnapshot, markClean }: Pick<DirtyState, "takeSnapshot" | "markClean">,
) {
    const fcStore = useFlightControllerStore();
    const { isSaving, runSave } = useSaving();
    const { saveToEeprom } = useReboot();

    const saveModes = () =>
        runSave(async () => {
            const { modeRanges, modeRangesExtra } = buildModeRangePayload(modes, requiredModeRangeCount.value || 0);

            const savedSnapshot = takeSnapshot();

            fcStore.modeRanges = modeRanges;
            fcStore.modeRangesExtra = modeRangesExtra;

            await mspHelper.sendModeRanges();
            await saveToEeprom();

            // Only after a successful persist: refresh the dirty baseline.
            markClean(savedSnapshot);
        });

    return { saveModes, isSaving };
}
