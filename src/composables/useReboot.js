import { reinitializeConnection } from "@/js/serial_backend"; // Backend logic

export function useReboot() {
    // Reboot is owned end-to-end by serial_backend.reinitializeConnection(): it sends the
    // reboot command, drives the per-transport reconnect, shows the reboot progress dialog
    // and settles the connection-state phase. This composable is just the Vue-tab entry point.
    // Return the delegated call so callers keep the backend contract (it resolves to the
    // reboot timestamp).
    const reboot = () => reinitializeConnection();

    return {
        reboot,
    };
}
