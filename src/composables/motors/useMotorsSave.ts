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
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { getTracking } from "@/js/Analytics";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";
import type { MotorsState } from "./useMotorsState";

export interface MotorsSaveOptions {
    /** The tab's change tracking; the analytics payload is read from it and it is reset on success. */
    motorsState: Pick<MotorsState, "analyticsChanges" | "resetChanges"> & {
        configHasChanged: Readonly<Ref<boolean>>;
    };
    /** Whether the ESC sensor port pick differs from the FC; either change makes a save worth doing. */
    escSensorPortChanged: Readonly<Ref<boolean>>;
    /** Asks the user about a port pick that takes a port from another feature; false cancels. */
    confirmPortConflicts: () => Promise<boolean>;
    /** Writes the ESC sensor port after the parameter groups, before the persist. */
    writeEscSensorPort: () => Promise<void>;
    motorsTestingEnabled: Ref<boolean>;
    stopAllMotors: (stopValue?: number) => void;
    /** The stop value under the configuration the FC is running now, not the pending edit. */
    zeroThrottleValue: Readonly<Ref<number>>;
    /** Refreshes the tab's applied-state snapshot once the new configuration is persisted. */
    syncAppliedMotorStopState: () => void;
}

/**
 * Save path for the Motors tab: stop the motors, write every parameter group the tab edits,
 * then the ESC sensor port, and persist (rebooting by default).
 */
export function useMotorsSave({
    motorsState,
    escSensorPortChanged,
    confirmPortConflicts,
    writeEscSensorPort,
    motorsTestingEnabled,
    stopAllMotors,
    zeroThrottleValue,
    syncAppliedMotorStopState,
}: MotorsSaveOptions) {
    // Shared save discipline: runSave owns isSaving and swallows benign MspCancelledError.
    const { isSaving, runSave } = useSaving();
    const { saveToEeprom, saveAndReboot } = useReboot();

    const saveMotors = (reboot = true) => {
        // Don't save if no changes
        if (!motorsState.configHasChanged.value && !escSensorPortChanged.value) {
            return;
        }

        return runSave(async () => {
            // Warn before a pick that would take a port from another feature; a cancel here leaves the
            // save (and the running motor test state) untouched, before anything has been written.
            if (!(await confirmPortConflicts())) {
                return;
            }

            // CRITICAL SAFETY: Stop motor testing and explicitly stop all motors before saving
            // This prevents motors from spinning after reboot due to DShot beacon commands
            if (motorsTestingEnabled.value) {
                motorsTestingEnabled.value = false;
                // Give a small delay for motor testing disable to complete
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            // Explicitly stop all motors to ensure no spinning after reboot
            stopAllMotors(zeroThrottleValue.value);
            // Give time for motor stop command to be processed
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Send feature config FIRST (for MOTOR_STOP, ESC_SENSOR, 3D features)
            await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

            // Send all motor configuration changes in sequence
            await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_MOTOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_MOTOR_3D_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_3D_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));

            // Between the parameter group writes and the persist that serialises them, so a
            // refused port throws before anything reaches EEPROM.
            await writeEscSensorPort();

            // Persist to EEPROM, rebooting when requested.
            if (reboot) {
                await saveAndReboot();
            } else {
                await saveToEeprom();
            }

            // Only after a successful persist: refresh the applied-state snapshot, record analytics,
            // and refresh the dirty baseline.
            syncAppliedMotorStopState();
            if (motorsState.analyticsChanges.value && Object.keys(motorsState.analyticsChanges.value).length > 0) {
                const tracking = getTracking();
                tracking?.sendSaveAndChangeEvents(
                    tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER,
                    motorsState.analyticsChanges.value,
                    "motors",
                );
            }

            // Reset state (clears changes and updates defaults)
            motorsState.resetChanges();
        });
    };

    return { saveMotors, isSaving };
}
