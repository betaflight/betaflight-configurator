import { ref } from "vue";
import MSP from "../js/msp";
import GUI from "../js/gui";
import { connectDisconnect } from "../js/serial_backend";

const DEFAULT_COMMAND_TIMEOUT_MS = 2000;
const SAVE_COMMAND_TIMEOUT_MS = 5000;
const DUMP_READ_TIMEOUT_MS = 10000;
const LINE_DELAY_MS = 15;
const PROFILE_COMMAND_DELAY_MS = 100;
const ERROR_PREFIX = "###ERROR";
const RECONNECT_TIMEOUT_NAME = "msp_cli_reconnect";
const RECONNECT_DELAY_MS = 500;

let cliMutex = Promise.resolve();

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

function clearMspCliState() {
    MSP.cli_output.length = 0;
    MSP.cli_buffer.length = 0;
}

function dispatch(command, timeoutMs) {
    // Drop any stale CLI state left over from a prior timed-out send so
    // late bytes can't bleed into this command's response.
    clearMspCliState();

    return new Promise((resolve, reject) => {
        let settled = false;
        const onResponse = (lines) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(Array.isArray(lines) ? [...lines] : []);
        };
        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            // Disown our callback and wipe the accumulator so a late ETX for
            // this command cannot be routed to the next command's callback.
            if (MSP.cli_callback === onResponse) {
                MSP.cli_callback = null;
            }
            clearMspCliState();
            reject(new Error(`Timed out after ${timeoutMs}ms waiting for response to "${command}"`));
        }, timeoutMs);

        MSP.send_cli_command(command, onResponse);
    });
}

export function send(command, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    const next = cliMutex.then(() => dispatch(command, timeoutMs));
    cliMutex = next.catch(() => undefined);
    return next;
}

export function sendSave() {
    return send("save", { timeoutMs: SAVE_COMMAND_TIMEOUT_MS });
}

export function readDumpAll() {
    return send("diff all", { timeoutMs: DUMP_READ_TIMEOUT_MS });
}

export function scheduleReconnect() {
    GUI.timeout_remove(RECONNECT_TIMEOUT_NAME);
    GUI.timeout_add(RECONNECT_TIMEOUT_NAME, () => connectDisconnect(), RECONNECT_DELAY_MS);
}

export function cancelScheduledReconnect() {
    GUI.timeout_remove(RECONNECT_TIMEOUT_NAME);
}

export async function saveAndReconnect() {
    try {
        await sendSave();
    } catch (error) {
        console.error("Failed to save configuration:", error);
    } finally {
        scheduleReconnect();
    }
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
