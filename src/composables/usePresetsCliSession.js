import { computed, ref } from "vue";
import GUI from "../js/gui";
import CONFIGURATOR from "../js/data_storage";
import CliEngine from "../components/tabs/presets/CliEngine";

const READ_DUMP_IDLE_MS = 500;
const MAX_READ_TIMEOUT = 10000;
const DISCONNECT_TIMEOUT_NAME = "presets_disconnect_cli";

function disconnectCliMakeSure() {
    GUI.timeout_remove(DISCONNECT_TIMEOUT_NAME);
    GUI.timeout_add(
        DISCONNECT_TIMEOUT_NAME,
        () => {
            document.querySelector("a.connection_button__link")?.click();
        },
        500,
    );
}

export function usePresetsCliSession({ onProgressChange } = {}) {
    const cliWindowRef = ref(null);
    const windowWrapperRef = ref(null);
    const commandInputRef = ref(null);
    const cliEngine = new CliEngine(null);
    let cancelPendingDumpRead;

    cliEngine.setProgressCallback((value) => {
        onProgressChange?.(value);
    });

    const isCliActive = computed(() => CONFIGURATOR.cliEngineActive && CONFIGURATOR.cliEngineValid);

    function attachUi() {
        if (!cliWindowRef.value || !windowWrapperRef.value || !commandInputRef.value) {
            return false;
        }

        cliEngine.setUi(cliWindowRef.value, windowWrapperRef.value, commandInputRef.value);
        return true;
    }

    function activate() {
        if (!attachUi()) {
            return Promise.reject(new Error("Presets CLI session UI is not attached."));
        }

        CONFIGURATOR.cliEngineActive = true;
        cliEngine.enterCliMode();

        return new Promise((resolve) => {
            GUI.timeout_add("presets_enter_cli_mode_done", resolve, 500);
        });
    }

    function readSerial(readInfo) {
        cliEngine.readSerial(readInfo);
    }

    function executeCommandsArray(strings) {
        return cliEngine.executeCommandsArray(strings);
    }

    function sendLine(line, callback, responseCallback) {
        cliEngine.sendLine(line, callback, responseCallback);
    }

    function cancelDumpRead(error) {
        cancelPendingDumpRead?.(error);
    }

    function close(callback) {
        GUI.timeout_remove(DISCONNECT_TIMEOUT_NAME);
        cancelDumpRead(new Error("Preset CLI dump read cancelled because the CLI session was closed."));
        cliEngine.close(() => {
            CONFIGURATOR.cliEngineActive = false;
            CONFIGURATOR.cliEngineValid = false;
            callback?.();
        });
    }

    function cleanup(callback) {
        GUI.timeout_remove(DISCONNECT_TIMEOUT_NAME);
        cancelDumpRead(new Error("Preset CLI dump read cancelled during cleanup."));

        if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.cliEngineActive && CONFIGURATOR.cliEngineValid)) {
            CONFIGURATOR.cliEngineActive = false;
            CONFIGURATOR.cliEngineValid = false;
            callback?.();
            return;
        }

        close(callback);
    }

    function readDumpAll() {
        let hasReceivedResponse = false;
        let lastCliStringReceived;
        const diffAll = [CliEngine.s_commandDefaultsNoSave, ""];
        const intervalName = "PRESETS_READING_DUMP_INTERVAL";
        let readTimeoutId;
        let settled = false;

        return new Promise((resolve, reject) => {
            const cleanupRead = () => {
                clearTimeout(readTimeoutId);
                cliEngine.unsubscribeOnRowCame();
                GUI.interval_remove(intervalName);

                if (cancelPendingDumpRead === cancelRead) {
                    cancelPendingDumpRead = undefined;
                }
            };

            const settleRead = (callback, value) => {
                if (settled) {
                    return;
                }

                settled = true;
                cleanupRead();
                callback(value);
            };

            const cancelRead = (error = new Error("Preset CLI dump read cancelled.")) => {
                settleRead(reject, error);
            };

            cancelPendingDumpRead = cancelRead;

            cliEngine.subscribeOnRowCame((text) => {
                hasReceivedResponse = true;
                lastCliStringReceived = performance.now();

                if (CliEngine.s_commandDiffAll !== text && CliEngine.s_commandSave !== text) {
                    diffAll.push(text);
                }
            });

            readTimeoutId = setTimeout(() => {
                settleRead(
                    reject,
                    new Error(`Timed out after ${MAX_READ_TIMEOUT}ms waiting for the preset CLI dump response.`),
                );
            }, MAX_READ_TIMEOUT);

            cliEngine.sendLine(CliEngine.s_commandDiffAll);

            GUI.interval_add(
                intervalName,
                () => {
                    if (hasReceivedResponse && performance.now() - lastCliStringReceived > READ_DUMP_IDLE_MS) {
                        settleRead(resolve, diffAll);
                    }
                },
                READ_DUMP_IDLE_MS,
                false,
            );
        });
    }

    function getErrorCount() {
        return cliEngine.errorsCount;
    }

    function resetProgress() {
        onProgressChange?.(0);
    }

    return {
        cliWindowRef,
        windowWrapperRef,
        commandInputRef,
        isCliActive,
        activate,
        readSerial,
        executeCommandsArray,
        sendLine,
        close,
        cleanup,
        readDumpAll,
        disconnectCliMakeSure,
        getErrorCount,
        resetProgress,
    };
}
