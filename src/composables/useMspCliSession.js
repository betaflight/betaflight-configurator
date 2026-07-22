import { ref } from "vue";
import semver from "semver";
import MSP from "../js/msp";
import GUI from "../js/gui";
import FC from "../js/fc";
import { disconnect, isDrivenRebootTarget, scheduleRebootReconnect } from "../js/serial_backend";
import DeviceHandler from "../js/device_handler";
import { getConnectionState, State } from "../js/connection_state";

const DEFAULT_COMMAND_TIMEOUT_MS = 2000;
const SAVE_COMMAND_TIMEOUT_MS = 5000;
const DUMP_READ_TIMEOUT_MS = 10000;
const LINE_DELAY_MS = 15;
const PROFILE_COMMAND_DELAY_MS = 100;
const ERROR_PREFIX = "###ERROR";
const RECONNECT_TIMEOUT_NAME = "msp_cli_reconnect";
const RECONNECT_DELAY_MS = 500;

export const MIN_FC_VERSION_FOR_MSP_CLI = "4.5.4";

export function isMspCliSupported() {
    const version = FC.CONFIG?.flightControllerVersion;
    if (!version) {
        return false;
    }
    return semver.gte(version, MIN_FC_VERSION_FOR_MSP_CLI);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldSkip(line) {
    const trimmed = line.trim();
    return !trimmed || trimmed.startsWith("#");
}

function parseErrors(lines) {
    return lines.filter((line) => line.startsWith(ERROR_PREFIX));
}

function delayAfter(line) {
    return line.toLowerCase().startsWith("profile") ? PROFILE_COMMAND_DELAY_MS : LINE_DELAY_MS;
}

export function send(command, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
        MSP.send_cli_command(
            command,
            (lines, error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(Array.isArray(lines) ? [...lines] : []);
            },
            { timeoutMs },
        );
    });
}

export function sendSave() {
    return send("save", { timeoutMs: SAVE_COMMAND_TIMEOUT_MS });
}

export function readDumpAll() {
    return send("diff all", { timeoutMs: DUMP_READ_TIMEOUT_MS });
}

export function scheduleReconnect() {
    const willAutoReconnect = DeviceHandler.devicePicker.autoConnect;
    const target = DeviceHandler.devicePicker.selectedDevice;

    // BLE and manual/TCP links never re-enumerate after an FC reboot, so the passive path
    // below (drop the link, let auto-connect pick up the re-added device) would leave them
    // disconnected forever. Hand them to serial_backend's driven reboot cycle instead — the
    // same machinery a BLE/manual Save & Reboot uses. It reads Auto-Connect live, so with it
    // off the cycle still ends in a clean disconnect.
    if (isDrivenRebootTarget(target)) {
        scheduleRebootReconnect();
        return;
    }

    // The FC reboots after save/exit, so its port drops and re-enumerates, often under a new id
    // (serial_0 -> serial_1). Don't reconnect explicitly: that would target the old, gone id and
    // race the reboot into a spurious failure dialog. Just drop the stale link — with Auto-Connect
    // on, auto-connect picks up the re-added device; with it off, the user reconnects manually.

    // When we expect an auto-reconnect, hold the reconnect-in-progress window so selectActivePort()
    // keeps the current selection and does NOT hijack it with the expert-mode virtual/manual
    // fallback while the device is briefly off the port list.
    if (willAutoReconnect && target && target !== "noselection" && target !== "virtual" && target !== "manual") {
        getConnectionState().reconnectStarted();
    }

    GUI.timeout_remove(RECONNECT_TIMEOUT_NAME);
    GUI.timeout_add(
        RECONNECT_TIMEOUT_NAME,
        () => {
            // Drop the stale link only. disconnect() is a no-op if the reboot already closed the
            // port; reconnection (if any) is auto-connect's job on device re-enumeration.
            disconnect();
        },
        RECONNECT_DELAY_MS,
    );
}

export function cancelScheduledReconnect() {
    const removed = GUI.timeout_remove(RECONNECT_TIMEOUT_NAME);
    // Only conclude the window this function actually cancelled: the timer was still
    // pending (removed) AND we are still in the RECONNECTING wait it opened. Once the
    // timer has fired, connectDisconnect() owns the phase (CONNECTING/HANDSHAKING) and
    // its own concludeReboot settles it — forcing IDLE here would abort a live connect.
    if (removed && getConnectionState().state === State.RECONNECTING) {
        getConnectionState().concludeReboot(false);
    }
}

// A `save`/`exit` reboots the FC, so the port closes before the command can reply and its
// in-flight promise is drained with a connection-closed error (tagged in MSP.disconnect_cleanup).
// That is the EXPECTED successful outcome — the config is saved and the board is restarting — not
// a failure, so callers should not surface it as an error.
export function isConnectionClosedError(error) {
    return error?.connectionClosed === true;
}

export async function saveAndReconnect() {
    let saveError = null;
    try {
        await sendSave();
    } catch (error) {
        if (isConnectionClosedError(error)) {
            // Save accepted; the FC is rebooting (the port closed before it could reply).
            console.debug("Save reboot: connection closed before response (expected).");
        } else {
            saveError = error;
            console.error("sendSave failed:", error);
        }
    } finally {
        scheduleReconnect();
    }
    return { ok: saveError === null, error: saveError };
}

export function useMspCliSession() {
    const isBatchRunning = ref(false);
    let cancelRequested = false;

    async function runBatch(commands, { onProgress, onError, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
        cancelRequested = false;
        isBatchRunning.value = true;

        const errors = [];
        const total = commands.length;
        let index = 0;
        let sent = 0;

        try {
            for (const rawLine of commands) {
                if (cancelRequested) {
                    break;
                }

                index++;

                if (shouldSkip(rawLine)) {
                    onProgress?.({ index, total, sent, errorCount: errors.length });
                    continue;
                }

                const line = rawLine.trim();
                let response;
                try {
                    response = await send(line, { timeoutMs: commandTimeoutMs });
                    sent++;
                } catch (error) {
                    const message = String(error?.message ?? error);
                    const failure = { command: line, response: [message], errors: [message] };
                    errors.push(failure);
                    onError?.(failure);
                    onProgress?.({ index, total, sent, errorCount: errors.length });
                    continue;
                }

                const commandErrors = parseErrors(response);
                if (commandErrors.length > 0) {
                    const failure = { command: line, response, errors: commandErrors };
                    errors.push(failure);
                    onError?.(failure);
                }

                onProgress?.({ index, total, sent, errorCount: errors.length });
                await wait(delayAfter(line));
            }
        } finally {
            isBatchRunning.value = false;
        }

        return { sent, total, errors, cancelled: cancelRequested };
    }

    function cancel() {
        cancelRequested = true;
    }

    return {
        isBatchRunning,
        send,
        sendSave,
        readDumpAll,
        runBatch,
        cancel,
    };
}
