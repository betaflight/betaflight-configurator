import { reinitializeConnection } from "@/js/serial_backend"; // Backend logic

export function useReboot() {
    // Reboot is owned end-to-end by serial_backend.reinitializeConnection(): it sends the
    // reboot command, drives the per-transport reconnect, shows the shared reboot progress
    // dialog (the Vue RebootDialog, via the dialog store) and settles the connection-state
    // phase. This composable is just the Vue-tab entry point — the former duplicate
    // wait-loop + dialog that lived here diverged from the backend's and, on the serial
    // path, never settled the phase (leaving isReconnecting stuck).
    // Return the delegated call so callers keep the backend contract (it resolves to
    // the reboot timestamp); the wrapper stays transparent rather than swallowing it.
    const reboot = () => reinitializeConnection();

    return {
        reboot,
    };
}
