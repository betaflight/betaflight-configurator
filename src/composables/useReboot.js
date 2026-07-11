import { reinitializeConnection } from "@/js/serial_backend"; // Backend logic
import { useNavigationStore } from "@/stores/navigation";
import { mspHelper } from "@/js/msp/MSPHelper";

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
    };
}
