import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
import { useDataflashErase, DATAFLASH_ERASE_TIMEOUT_MS } from "../../src/composables/useDataflashErase";
import { useConnectionStore } from "../../src/stores/connection";
import CONFIGURATOR from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { MspTimeoutError } from "../../src/js/msp/mspErrors";

describe("useDataflashErase", () => {
    let scope;
    let erase;
    let connectionStore;
    let eraseAcknowledgements;
    let callbacks;

    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        FC.resetState();
        CONFIGURATOR.connectionValid = true;
        connectionStore = useConnectionStore();
        callbacks = {
            onComplete: vi.fn(),
            onError: vi.fn(),
            onFinish: vi.fn(),
        };
        eraseAcknowledgements = [];

        vi.spyOn(MSP, "send_message").mockImplementation((code, data, callbackSent, callbackMsp) => {
            if (code === MSPCodes.MSP_DATAFLASH_ERASE) {
                eraseAcknowledgements.push(callbackMsp);
            }
            return true;
        });
        vi.spyOn(MSP, "promise");

        scope = effectScope();
        scope.run(() => {
            erase = useDataflashErase(callbacks);
        });
    });

    afterEach(() => {
        scope.stop();
        CONFIGURATOR.connectionValid = false;
        vi.runAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("completes and resumes live data when dataflash reports ready", async () => {
        MSP.promise.mockResolvedValue({});
        FC.DATAFLASH.ready = true;

        await erase.start({ clearQueue: false });
        expect(connectionStore.liveDataPaused).toBe(true);
        eraseAcknowledgements[0]();
        await vi.runAllTicks();

        expect(erase.isErasing.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
        expect(callbacks.onComplete).toHaveBeenCalledOnce();
        expect(callbacks.onFinish).toHaveBeenCalledWith("complete");
    });

    it("uses a watchdog-enabled final probe after the bounded erase window", async () => {
        MSP.promise.mockRejectedValue(new MspTimeoutError("timed out", MSPCodes.MSP_DATAFLASH_SUMMARY));

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.advanceTimersByTimeAsync(DATAFLASH_ERASE_TIMEOUT_MS + 500);

        expect(MSP.promise.mock.calls.at(-1)).toEqual([
            MSPCodes.MSP_DATAFLASH_SUMMARY,
            false,
            { notifyTimeout: true },
        ]);
        expect(erase.isErasing.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledOnce();
        expect(callbacks.onFinish).toHaveBeenCalledWith("error");
    });

    it("cleans up immediately when the physical connection closes", async () => {
        await erase.start({ clearQueue: false });
        CONFIGURATOR.connectionValid = false;
        await nextTick();

        expect(erase.isErasing.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
        expect(callbacks.onError).not.toHaveBeenCalled();
        expect(callbacks.onFinish).toHaveBeenCalledWith("disconnected");
    });

    it("ignores a cancelled poll that settles after a new erase starts", async () => {
        let resolveCancelledPoll;
        MSP.promise
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveCancelledPoll = resolve;
                    }),
            )
            .mockResolvedValueOnce({});

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.runAllTicks();

        erase.cancel();
        await erase.start({ clearQueue: false });
        FC.DATAFLASH.ready = true;

        resolveCancelledPoll({});
        await vi.runAllTicks();

        expect(erase.isErasing.value).toBe(true);
        expect(callbacks.onComplete).not.toHaveBeenCalled();

        eraseAcknowledgements[1]();
        await vi.runAllTicks();

        expect(erase.isErasing.value).toBe(false);
        expect(callbacks.onComplete).toHaveBeenCalledOnce();
    });
});
