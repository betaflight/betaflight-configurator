import { ref } from "vue";
import MSP from "../js/msp";

const DEFAULT_COMMAND_TIMEOUT_MS = 2000;
const SAVE_COMMAND_TIMEOUT_MS = 5000;
const DUMP_READ_TIMEOUT_MS = 10000;
const LINE_DELAY_MS = 15;
const PROFILE_COMMAND_DELAY_MS = 100;
const ERROR_PREFIX = "###ERROR";

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

export function useMspCliSession() {
    const isSending = ref(false);
    let cancelRequested = false;

    function send(command, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new Error(`Timed out after ${timeoutMs}ms waiting for response to "${command}"`));
            }, timeoutMs);

            MSP.send_cli_command(command, (lines) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolve(Array.isArray(lines) ? [...lines] : []);
            });
        });
    }

    function sendSave() {
        return send("save", { timeoutMs: SAVE_COMMAND_TIMEOUT_MS });
    }

    function readDumpAll() {
        return send("diff all", { timeoutMs: DUMP_READ_TIMEOUT_MS });
    }

    async function runBatch(commands, { onProgress, onError, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
        cancelRequested = false;
        isSending.value = true;

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
                const response = await send(line, { timeoutMs: commandTimeoutMs });
                sent++;

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
            isSending.value = false;
        }

        return { sent, total, errors, cancelled: cancelRequested };
    }

    function cancel() {
        cancelRequested = true;
    }

    return {
        isSending,
        send,
        sendSave,
        readDumpAll,
        runBatch,
        cancel,
    };
}
