import { ref } from "vue";
import { useDialogStore } from "@/stores/dialog";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import CONFIGURATOR from "@/js/data_storage";
import PortHandler from "@/js/port_handler";
import { i18n } from "@/js/localization";
import { gui_log } from "@/js/gui_log";
import $ from "jquery";

export function useReboot() {
    const dialogStore = useDialogStore();
    const isRebooting = ref(false);
    const REBOOT_CONNECT_MAX_TIME_MS = 10000;

    // Internal helper to wait for reconnection
    const waitForReconnection = (rebootTimestamp, callback) => {
        const checkInterval = setInterval(() => {
            const timeoutReached = Date.now() - rebootTimestamp > REBOOT_CONNECT_MAX_TIME_MS;
            // Check global logic for reconnection availability
            const noSerialReconnect = !PortHandler.portPicker.autoConnect && PortHandler.portAvailable;

            if (CONFIGURATOR.connectionValid || timeoutReached || noSerialReconnect) {
                clearInterval(checkInterval);
                callback(timeoutReached);
            }
        }, 100);

        return checkInterval;
    };

    const reboot = () => {
        if (isRebooting.value) return;

        // 1. Handling Virtual Mode
        if (CONFIGURATOR.virtualMode) {
            $("a.connection_button__link").trigger("click");
            if (PortHandler.portPicker.autoConnect) {
                setTimeout(() => {
                    $("a.connection_button__link").trigger("click");
                }, 500);
            }
            return;
        }

        const currentPort = PortHandler.portPicker.selectedPort;
        const rebootTimestamp = Date.now();

        // 2. Send Command
        MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
        CONFIGURATOR.connectionValid = false; // Force invalid until reconnect

        // 3. Handle Manual/Bluetooth (no auto-reconnect logic usually)
        if (currentPort.startsWith("bluetooth") || currentPort === "manual") {
            setTimeout(() => {
                $("a.connection_button__link").trigger("click");
            }, 1500);
            return;
        }

        // 4. Show Dialog
        // Note: Legacy skipped dialog for CLI/Presets. We'll enforce that via caller if needed,
        // but here we assume if you call useReboot().reboot(), you want the UI.

        gui_log(i18n.getMessage("deviceRebooting"));

        dialogStore.open("RebootDialog", {
            status: i18n.getMessage("rebootFlightController"),
            progress: 0,
        });

        isRebooting.value = true;

        // 5. Progress Animation
        let progress = 0;
        const progressIncrement = 100 / (REBOOT_CONNECT_MAX_TIME_MS / 100);

        const progressInterval = setInterval(() => {
            progress += progressIncrement;
            if (progress <= 100) {
                dialogStore.updateProps({ progress });
            }
        }, 100);

        // 6. Wait for Reconnection
        waitForReconnection(rebootTimestamp, (timeoutReached) => {
            clearInterval(progressInterval);

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
