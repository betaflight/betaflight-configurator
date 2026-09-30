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

import { reinitializeConnection } from "@/js/serial_backend"; // Backend logic
import { useNavigationStore } from "@/stores/navigation";
import { mspHelper } from "@/js/msp/MSPHelper";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import FC from "@/js/fc";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";

/**
 * Persist the current configuration to EEPROM without rebooting. This is the await-able,
 * error-aware counterpart to the callback-based mspHelper.writeConfiguration: it uses an
 * error-aware MSP request, so a tab switch / disconnect that clears the MSP queue rejects
 * with MspCancelledError (letting runSave settle) instead of dropping the callback and
 * hanging. Mirrors writeConfiguration's arming-safety guard; the 100ms settle delay is
 * unnecessary because callers await their MSP_SET_* writes before persisting.
 *
 * Defined at module scope (not per useReboot() call) because it closes over no
 * composable-local state — only module-level imports.
 * @returns {Promise<void>} resolves once the EEPROM write is acknowledged
 */
async function saveToEeprom(): Promise<void> {
    // Never persist while arming is possible (matches writeConfiguration).
    if (!FC.CONFIG.armingDisabled) {
        mspHelper.disableArming();
    }
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    gui_log(i18n.getMessage("configurationEepromSaved"));
}

export function useReboot() {
    // Reboot is owned end-to-end by serial_backend.reinitializeConnection(): it sends the
    // reboot command, drives the per-transport reconnect, shows the reboot progress dialog
    // and settles the connection-state phase. This composable is just the Vue-tab entry point.
    // Return the delegated call so callers keep the backend contract (it resolves to the
    // reboot timestamp).
    const reboot = () => reinitializeConnection();

    const navigationStore = useNavigationStore();

    function cleanupAndReboot(resolve: () => void): void {
        navigationStore.cleanup(() => {
            reboot();
            resolve();
        });
    }

    /**
     * Persist the current configuration to EEPROM and then reboot the board,
     * settling the connection state via the shared reboot flow.
     * @returns {Promise<void>} resolves once the reboot sequence has started
     */
    function saveAndReboot(): Promise<void> {
        return new Promise<void>((resolve) => {
            mspHelper.writeConfiguration(false, () => cleanupAndReboot(resolve));
        });
    }

    return {
        reboot,
        saveAndReboot,
        saveToEeprom,
    };
}
