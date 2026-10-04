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

import { mspHelper } from "@/js/msp/MSPHelper";
import { isMspCancelled } from "@/js/msp/mspErrors";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";

/**
 * Live-preview and save paths for the Servos tab.
 * @param marshalServoConfigs copies the tab's edits into FC.SERVO_CONFIG; runs before every send
 * @param markClean moves the tab's dirty baseline; only called after a successful persist
 */
export function useServosSave(marshalServoConfigs: () => void, markClean: () => void) {
    const { isSaving, runSave } = useSaving();
    const { saveToEeprom } = useReboot();

    // Live-mode preview: push the current servo config to the FC without persisting.
    // sendServoConfigurations is error-aware/async; this is fire-and-forget preview, so
    // ignore a benign queue-clear cancellation on tab switch but still log genuine failures.
    const updateServos = () => {
        marshalServoConfigs();
        mspHelper.sendServoConfigurations().catch((error) => {
            if (!isMspCancelled(error)) {
                console.error("Failed to update servo configuration", error);
            }
        });
    };

    const saveServoConfig = () =>
        runSave(async () => {
            marshalServoConfigs();
            await mspHelper.sendServoConfigurations();
            await saveToEeprom();
            // saveToEeprom() already emits the shared "EEPROM saved" toast; servosEepromSave
            // resolved to the same string, so it's dropped here to avoid a duplicate.
            markClean();
        });

    return { updateServos, saveServoConfig, isSaving };
}
