import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GUI from "../../src/js/gui";
import CONFIGURATOR from "../../src/js/data_storage";
import CliEngine from "../../src/tabs/presets/CliEngine";
import { usePresetsCliSession } from "../../src/composables/usePresetsCliSession";

const READ_DUMP_INTERVAL = "PRESETS_READING_DUMP_INTERVAL";
const MAX_READ_TIMEOUT = 10000;

describe("usePresetsCliSession", () => {
    let sendLineSpy;
    let subscribeOnRowCameSpy;
    let onRowCame;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.restoreAllMocks();

        GUI.interval_kill_all();
        GUI.timeout_kill_all();

        CONFIGURATOR.connectionValid = false;
        CONFIGURATOR.cliEngineActive = false;
        CONFIGURATOR.cliEngineValid = false;

        onRowCame = undefined;
        sendLineSpy = vi.spyOn(CliEngine.prototype, "sendLine").mockImplementation(() => {});
        subscribeOnRowCameSpy = vi.spyOn(CliEngine.prototype, "subscribeOnRowCame").mockImplementation(function (cb) {
            onRowCame = cb;
            this._onRowCameCallback = cb;
        });
    });

    afterEach(() => {
        GUI.interval_kill_all();
        GUI.timeout_kill_all();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("resolves once CLI output goes idle and clears the watchdog timeout", async () => {
        const unsubscribeSpy = vi.spyOn(CliEngine.prototype, "unsubscribeOnRowCame");
        const intervalRemoveSpy = vi.spyOn(GUI, "interval_remove");
        const cliSession = usePresetsCliSession();
        const readPromise = cliSession.readDumpAll();
        const readExpectation = expect(readPromise).resolves.toEqual([
            CliEngine.s_commandDefaultsNoSave,
            "",
            "set foo = bar",
        ]);

        expect(sendLineSpy).toHaveBeenCalledWith(CliEngine.s_commandDiffAll);
        expect(subscribeOnRowCameSpy).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(100);
        onRowCame(CliEngine.s_commandDiffAll);
        onRowCame("set foo = bar");
        await vi.advanceTimersByTimeAsync(900);
        await readExpectation;

        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
        expect(intervalRemoveSpy).toHaveBeenCalledWith(READ_DUMP_INTERVAL);

        await vi.advanceTimersByTimeAsync(MAX_READ_TIMEOUT);
        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects if the device never responds and performs the same cleanup", async () => {
        const unsubscribeSpy = vi.spyOn(CliEngine.prototype, "unsubscribeOnRowCame");
        const intervalRemoveSpy = vi.spyOn(GUI, "interval_remove");
        const cliSession = usePresetsCliSession();
        const readPromise = cliSession.readDumpAll();
        const readExpectation = expect(readPromise).rejects.toThrow(
            `Timed out after ${MAX_READ_TIMEOUT}ms waiting for the preset CLI dump response.`,
        );

        await vi.advanceTimersByTimeAsync(MAX_READ_TIMEOUT);
        await readExpectation;

        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
        expect(intervalRemoveSpy).toHaveBeenCalledWith(READ_DUMP_INTERVAL);

        await vi.advanceTimersByTimeAsync(MAX_READ_TIMEOUT);
        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects a pending dump read during cleanup and clears the watchdog timeout", async () => {
        const unsubscribeSpy = vi.spyOn(CliEngine.prototype, "unsubscribeOnRowCame");
        const intervalRemoveSpy = vi.spyOn(GUI, "interval_remove");
        const cliSession = usePresetsCliSession();
        const readPromise = cliSession.readDumpAll();
        const readExpectation = expect(readPromise).rejects.toThrow("Preset CLI dump read cancelled during cleanup.");

        cliSession.cleanup();
        await readExpectation;

        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
        expect(intervalRemoveSpy).toHaveBeenCalledWith(READ_DUMP_INTERVAL);

        await vi.advanceTimersByTimeAsync(MAX_READ_TIMEOUT);
        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    });
});
