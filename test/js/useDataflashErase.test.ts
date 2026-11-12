/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, type EffectScope } from "vue";
import { useDataflashErase, getDataflashEraseTimeoutMs } from "../../src/composables/useDataflashErase";
import { useConnectionStore } from "../../src/stores/connection";
import { useFlightControllerStore } from "../../src/stores/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { MspTimeoutError } from "../../src/js/msp/mspErrors";

let fcStore: ReturnType<typeof useFlightControllerStore>;

const MIB = 1024 * 1024;

describe("useDataflashErase", () => {
    let scope: EffectScope;
    let erase: ReturnType<typeof useDataflashErase>;
    let connectionStore: ReturnType<typeof useConnectionStore>;
    let eraseAcknowledgements: (() => void)[];
    let callbacks: { onComplete: Mock; onError: Mock; onFinish: Mock };

    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        connectionStore = useConnectionStore();
        connectionStore.connectionValid = true;
        callbacks = {
            onComplete: vi.fn(),
            onError: vi.fn(),
            onFinish: vi.fn(),
        };
        eraseAcknowledgements = [];

        vi.spyOn(MSP, "send_message").mockImplementation((code, _data, _callbackSent, callbackMsp) => {
            if (code === MSPCodes.MSP_DATAFLASH_ERASE && callbackMsp) {
                eraseAcknowledgements.push(callbackMsp as () => void);
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
        connectionStore.connectionValid = false;
        vi.runAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("completes and resumes live data when dataflash reports ready", async () => {
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        fcStore.dataflash.ready = true;

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
        vi.mocked(MSP.promise).mockRejectedValue(new MspTimeoutError("timed out", MSPCodes.MSP_DATAFLASH_SUMMARY));

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.advanceTimersByTimeAsync(getDataflashEraseTimeoutMs(0) + 500);

        expect(vi.mocked(MSP.promise).mock.calls.at(-1)).toEqual([
            MSPCodes.MSP_DATAFLASH_SUMMARY,
            false,
            { notifyTimeout: true },
        ]);
        expect(erase.isErasing.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledOnce();
        expect(callbacks.onFinish).toHaveBeenCalledWith("error");
    });

    it("keeps polling while the FC reports the erase is still running", async () => {
        vi.mocked(MSP.promise).mockResolvedValue(undefined);

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.advanceTimersByTimeAsync(120000);

        expect(erase.isErasing.value).toBe(true);
        expect(callbacks.onError).not.toHaveBeenCalled();
        expect(vi.mocked(MSP.promise).mock.calls.every(([, , options]) => options?.notifyTimeout === false)).toBe(true);

        fcStore.dataflash.ready = true;
        await vi.advanceTimersByTimeAsync(500);

        expect(erase.isErasing.value).toBe(false);
        expect(callbacks.onComplete).toHaveBeenCalledOnce();
        expect(callbacks.onFinish).toHaveBeenCalledWith("complete");
    });

    it("tolerates a silent FC for the whole erase window", async () => {
        vi.mocked(MSP.promise).mockRejectedValue(new MspTimeoutError("timed out", MSPCodes.MSP_DATAFLASH_SUMMARY));

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.advanceTimersByTimeAsync(getDataflashEraseTimeoutMs(0) - 1000);

        expect(erase.isErasing.value).toBe(true);
        expect(callbacks.onFinish).not.toHaveBeenCalled();
        expect(vi.mocked(MSP.promise).mock.calls.every(([, , options]) => options?.notifyTimeout === false)).toBe(true);
    });

    it("fails when the FC still reports not ready after the erase window", async () => {
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        fcStore.dataflash.totalSize = 32 * MIB;
        const timeoutMs = getDataflashEraseTimeoutMs(32 * MIB);

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.advanceTimersByTimeAsync(timeoutMs - 1000);

        expect(erase.isErasing.value).toBe(true);

        await vi.advanceTimersByTimeAsync(1500);

        expect(vi.mocked(MSP.promise).mock.calls.at(-1)).toEqual([
            MSPCodes.MSP_DATAFLASH_SUMMARY,
            false,
            { notifyTimeout: true },
        ]);
        expect(erase.isErasing.value).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledOnce();
        expect(callbacks.onFinish).toHaveBeenCalledWith("error");
    });

    it("scales the erase window with NOR flash size", () => {
        expect(getDataflashEraseTimeoutMs(0)).toBe(300000);
        expect(getDataflashEraseTimeoutMs(16 * MIB)).toBe(300000);
        expect(getDataflashEraseTimeoutMs(32 * MIB)).toBe(500000);
        expect(getDataflashEraseTimeoutMs(64 * MIB)).toBe(900000);
        expect(getDataflashEraseTimeoutMs(128 * MIB)).toBe(900000);
    });

    it("cleans up immediately when the physical connection closes", async () => {
        await erase.start({ clearQueue: false });
        connectionStore.connectionValid = false;
        await nextTick();

        expect(erase.isErasing.value).toBe(false);
        expect(connectionStore.liveDataPaused).toBe(false);
        expect(callbacks.onError).not.toHaveBeenCalled();
        expect(callbacks.onFinish).toHaveBeenCalledWith("disconnected");
    });

    it("ignores a cancelled poll that settles after a new erase starts", async () => {
        let resolveCancelledPoll: (value: undefined) => void = () => {};
        vi.mocked(MSP.promise)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveCancelledPoll = resolve;
                    }),
            )
            .mockResolvedValueOnce(undefined);

        await erase.start({ clearQueue: false });
        eraseAcknowledgements[0]();
        await vi.runAllTicks();

        erase.cancel();
        await erase.start({ clearQueue: false });
        fcStore.dataflash.ready = true;

        resolveCancelledPoll(undefined);
        await vi.runAllTicks();

        expect(erase.isErasing.value).toBe(true);
        expect(callbacks.onComplete).not.toHaveBeenCalled();

        eraseAcknowledgements[1]();
        await vi.runAllTicks();

        expect(erase.isErasing.value).toBe(false);
        expect(callbacks.onComplete).toHaveBeenCalledOnce();
    });
});
