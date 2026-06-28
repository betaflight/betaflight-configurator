import { ref } from "vue";
import semver from "semver";
import MSP from "../js/msp";
import GUI from "../js/gui";
import FC from "../js/fc";
import { connectDisconnect } from "../js/serial_backend";
import PortHandler from "../js/port_handler";
import { serial } from "../js/serial";
import { getConnectionFsm } from "../js/connection_fsm";

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
    // Capture the currently-selected real device synchronously, before the reboot/save can drop
    // it off the port list. Freeze it as the FSM reconnect token (the single authority for
    // "reconnect in progress + target") so selectActivePort() will not hijack the selection with
    // the expert-mode virtual/manual fallback during the reconnect window. Only real paths.
    const target = PortHandler.portPicker.selectedPort;
    if (target && target !== "noselection" && target !== "virtual") {
        const token = serial.getReconnectToken?.() ?? {
            transportType: "unknown",
            opaqueId: target,
            baud: 0,
            isVirtual: false,
        };
        getConnectionFsm().freezeReconnectToken(token);
    }

    GUI.timeout_remove(RECONNECT_TIMEOUT_NAME);
    GUI.timeout_add(
        RECONNECT_TIMEOUT_NAME,
        () => {
            // If selectActivePort drifted the selection while the device was transiently gone,
            // restore it to the reconnect target (token resolved to its current path, or its
            // original path while still absent) so we reconnect to the original device.
            const token = getConnectionFsm().getReconnectToken();
            if (token) {
                const original = typeof token.opaqueId === "string" ? token.opaqueId : token.opaqueId?.path;
                const aim = serial.resolveReconnectTarget?.(token) ?? original;
                if (aim && PortHandler.portPicker.selectedPort !== aim) {
                    PortHandler.portPicker.selectedPort = aim;
                }
            }
            connectDisconnect();
        },
        RECONNECT_DELAY_MS,
    );
}

export function cancelScheduledReconnect() {
    GUI.timeout_remove(RECONNECT_TIMEOUT_NAME);
    // Cancelling the reconnect ends the reconnect-in-progress window: clear the FSM token so
    // selectActivePort() resumes its normal (incl. virtual/manual) fallback. Without this the
    // token frozen in scheduleReconnect would linger and suppress that fallback until the next connect.
    getConnectionFsm().clearReconnectToken();
}

export async function saveAndReconnect() {
    let saveError = null;
    try {
        await sendSave();
    } catch (error) {
        saveError = error;
        console.error("sendSave failed:", error);
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
