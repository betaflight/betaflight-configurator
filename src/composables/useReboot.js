import { ref, onUnmounted } from "vue";
import { useDialogStore } from "@/stores/dialog";
import { reinitializeConnection } from "@/js/serial_backend"; // Backend logic
import CONFIGURATOR from "@/js/data_storage";
import PortHandler from "@/js/port_handler";
import { i18n } from "@/js/localization";
import { gui_log } from "@/js/gui_log";

export function useReboot() {
    const dialogStore = useDialogStore();
    const isRebooting = ref(false);
    const REBOOT_CONNECT_MAX_TIME_MS = 10000;

    // Track intervals for cleanup
    let progressInterval = null;
    let checkInterval = null;

    onUnmounted(() => {
        if (progressInterval) clearInterval(progressInterval);
        if (checkInterval) clearInterval(checkInterval);
    });

    // Internal helper to wait for reconnection
    const waitForReconnection = (rebootTimestamp, callback) => {
        checkInterval = setInterval(() => {
            const timeoutReached = Date.now() - rebootTimestamp > REBOOT_CONNECT_MAX_TIME_MS;
            // Check global logic for reconnection availability
            const noSerialReconnect = !PortHandler.portPicker.autoConnect && PortHandler.portAvailable;

            if (CONFIGURATOR.connectionValid || timeoutReached || noSerialReconnect) {
                clearInterval(checkInterval);
                checkInterval = null;
                callback(timeoutReached);
            }
        }, 100);

        return checkInterval;
    };

    const reboot = () => {
        if (isRebooting.value) return;

        // Delegates the actual command sending and state setup (rebootTimestamp) to the backend.
        // This ensures serial_backend.js knows to allow auto-connection after the reboot.
        reinitializeConnection();

        // Force invalid locally as well (backend does it too usually, but safe to sync)
        CONFIGURATOR.connectionValid = false;

        const currentPort = PortHandler.portPicker.selectedPort;
        const rebootTimestamp = Date.now();

        // For Virtual/Manual/Bluetooth, reinitializeConnection handles the toggle logic via setTimeout/clicks.
        // We do not show the Vue dialog for these cases to maintain legacy behavior (fast toggle).
        if (CONFIGURATOR.virtualMode || currentPort.startsWith("bluetooth") || currentPort === "manual") {
            return;
        }

        // Show Dialog for standard serial connections
        gui_log(i18n.getMessage("deviceRebooting"));

        dialogStore.open("RebootDialog", {
            status: i18n.getMessage("rebootFlightController"),
            progress: 0,
        });

        isRebooting.value = true;

        // Progress Animation
        let progress = 0;
        const progressIncrement = 100 / (REBOOT_CONNECT_MAX_TIME_MS / 100);

        progressInterval = setInterval(() => {
            progress += progressIncrement;
            if (progress <= 100) {
                dialogStore.updateProps({ progress });
            }
        }, 100);

        // Wait for Reconnection
        waitForReconnection(rebootTimestamp, (timeoutReached) => {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            // Finish Up
            dialogStore.updateProps({
                progress: 100,
                status: i18n.getMessage("rebootFlightControllerReady"),
            });

            setTimeout(() => {
                dialogStore.close();
                isRebooting.value = false;
            }, 1000);

            if (timeoutReached) {
                console.log(`[useReboot] Reboot timeout reached`);
            } else {
                gui_log(i18n.getMessage("deviceReady"));
            }
        });
    };

    return {
        reboot,
        isRebooting,
    };
}
