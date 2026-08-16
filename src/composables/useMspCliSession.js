import { ref } from "vue";
import semver from "semver";
import MSP from "../js/msp";
import FC from "../js/fc";
import { cancelRebootReconnect, scheduleRebootReconnect } from "../js/serial_backend";

const DEFAULT_COMMAND_TIMEOUT_MS = 2000;
const SAVE_COMMAND_TIMEOUT_MS = 5000;
const DUMP_READ_TIMEOUT_MS = 10000;
const LINE_DELAY_MS = 15;
const PROFILE_COMMAND_DELAY_MS = 100;
const ERROR_PREFIX = "###ERROR";

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

/**
 * A CLI `save`/`exit` has already rebooted the FC. Hand the wait to serial_backend's reconnect
 * cycle — the same one a Save & Reboot uses, minus the reboot command it does not need to send.
 * The cycle drops the stale link, retries while Auto-Connect is on, and ends the window on a
 * deadline. Previously this path ran its own 500 ms timeout and put the connection state into
 * RECONNECTING with no window, so a device that never came back left the phase there for good.
 */
export function scheduleReconnect() {
    scheduleRebootReconnect();
}

/** Abandon that wait (a tab unmounting mid-reconnect). */
export function cancelScheduledReconnect() {
    cancelRebootReconnect();
}

// A `save`/`exit` reboots the FC, so the port closes before the command can reply and its
// in-flight promise is drained with a connection-closed error (tagged in MSP.disconnect_cleanup).
// That is the EXPECTED successful outcome — the config is saved and the board is restarting — not
// a failure, so callers should not surface it as an error.
export function isConnectionClosedError(error) {
    return error?.connectionClosed === true;
}

// `send` resolves with whatever the FC replied, and a command the FC refused replies normally —
// the refusal is a line in the response, not a transport error. Callers that need to know whether
// a command took effect have to look for it.
export function findCliError(lines) {
    return parseErrors(lines ?? [])[0] ?? null;
}

// `get <name>` matches on substring, so the reply can carry several settings, each followed by its
// allowed range and default. Only the line naming the setting exactly holds the current value.
export function findCliSettingValue(lines, setting) {
    for (const line of lines ?? []) {
        const [name, ...rest] = line.split("=");
        if (name.trim() === setting && rest.length) {
            return rest.join("=").trim();
        }
    }

    return null;
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
