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

import { mspHelper } from "../../js/msp/MSPHelper";
import { useFlightControllerStore } from "@/stores/fc";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";
import type { AdjustmentSlot } from "./useAdjustmentsState";

export function useAdjustmentsSave(adjustments: AdjustmentSlot[], storeOriginals: () => void) {
    const fcStore = useFlightControllerStore();
    const { isSaving, runSave } = useSaving();
    const { saveToEeprom } = useReboot();

    const saveAdjustments = () =>
        runSave(async () => {
            const requiredAdjustmentRangeCount = fcStore.adjustmentRanges.length;

            fcStore.adjustmentRanges = [];

            adjustments.forEach((adjustment) => {
                if (adjustment.enabled) {
                    fcStore.adjustmentRanges.push({
                        slotIndex: adjustment.slotIndex ?? 0,
                        auxChannelIndex: adjustment.auxChannelIndex,
                        range: {
                            start: adjustment.range.start,
                            end: adjustment.range.end,
                        },
                        adjustmentFunction: adjustment.adjustmentFunction,
                        auxSwitchChannelIndex: adjustment.auxSwitchChannelIndex,
                        adjustmentCenter: adjustment.adjustmentCenter || 0,
                        adjustmentScale: adjustment.adjustmentScale || 0,
                    });
                } else {
                    fcStore.adjustmentRanges.push({
                        slotIndex: 0,
                        auxChannelIndex: 0,
                        range: {
                            start: 900,
                            end: 900,
                        },
                        adjustmentFunction: 0,
                        auxSwitchChannelIndex: 0,
                        adjustmentCenter: 0,
                        adjustmentScale: 0,
                    });
                }
            });

            for (let i = fcStore.adjustmentRanges.length; i < requiredAdjustmentRangeCount; i++) {
                fcStore.adjustmentRanges.push({
                    slotIndex: 0,
                    auxChannelIndex: 0,
                    range: {
                        start: 900,
                        end: 900,
                    },
                    adjustmentFunction: 0,
                    auxSwitchChannelIndex: 0,
                    adjustmentCenter: 0,
                    adjustmentScale: 0,
                });
            }

            await mspHelper.sendAdjustmentRanges();
            await saveToEeprom();

            // saveToEeprom() already emits the shared "EEPROM saved" toast; the previous
            // adjustmentsEepromSaved message resolved to the same string, so it's dropped
            // here to avoid showing the identical toast twice.
            storeOriginals();
        });

    return { saveAdjustments, isSaving, runSave };
}
