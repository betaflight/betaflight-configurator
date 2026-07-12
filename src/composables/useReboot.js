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
async function saveToEeprom() {
    // Never persist while arming is possible (matches writeConfiguration).
    if (!FC.CONFIG.armingDisabled) {
        mspHelper.setArmingEnabled(false, false);
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

    function cleanupAndReboot(resolve) {
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
    function saveAndReboot() {
        return new Promise((resolve) => {
            mspHelper.writeConfiguration(false, () => cleanupAndReboot(resolve));
        });
    }

    return {
        reboot,
        saveAndReboot,
        saveToEeprom,
    };
}
