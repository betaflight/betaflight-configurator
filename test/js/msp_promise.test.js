import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../src/js/injected_methods";
import MSP from "../../src/js/msp";
import { serial } from "../../src/js/serial";
import MspHelper from "../../src/js/msp/MSPHelper";
import MSPCodes from "../../src/js/msp/MSPCodes";
import CONFIGURATOR from "../../src/js/data_storage";
import { MspCancelledError, MspTimeoutError, MspCrcError } from "../../src/js/msp/mspErrors";

const EEPROM_WRITE_CODE = MSPCodes.MSP_EEPROM_WRITE;

function xorChecksum(bytes) {
    return bytes.reduce((acc, byte) => acc ^ byte, 0);
}

function v1ResponseFrame(code, payload = []) {
    const length = payload.length;
    const checksum = xorChecksum([length, code, ...payload]);
    return [0x24, 0x4d, 0x3e, length, code, ...payload, checksum];
}

function v1CorruptResponseFrame(code, payload = []) {
    const length = payload.length;
    const checksum = xorChecksum([length, code, ...payload]) ^ 0xff;
    return [0x24, 0x4d, 0x3e, length, code, ...payload, checksum];
}

function readFrame(bytes) {
    MSP.read({ data: new Uint8Array(bytes).buffer });
}

describe("MSP promise semantics", () => {
    const mspHelper = new MspHelper();
    let serialSendSpy;
    let boundProcessData;

    beforeEach(() => {
        vi.useFakeTimers();
        serialSendSpy = vi.spyOn(serial, "send").mockImplementation(() => {});
        serial._protocol = { connected: true };
        CONFIGURATOR.virtualMode = false;

        MSP.callbacks = [];
        MSP.parked.clear();
        MSP.state = MSP.decoder_states.IDLE;

        MSP.listeners = [];
        boundProcessData = mspHelper.process_data.bind(mspHelper);
        MSP.listen(boundProcessData);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("timeout", () => {
        it("rejects with MspTimeoutError after MAX_RETRIES attempts and removes the queue entry", async () => {
            const rejection = expect(MSP.promise(EEPROM_WRITE_CODE)).rejects.toBeInstanceOf(MspTimeoutError);

            expect(serialSendSpy).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT);
            expect(serialSendSpy).toHaveBeenCalledTimes(2);

            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT);
            expect(serialSendSpy).toHaveBeenCalledTimes(3);

            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT);
            expect(serialSendSpy).toHaveBeenCalledTimes(3);

            await rejection;
            expect(MSP.callbacks).toHaveLength(0);
        });

        it("invokes onTimeout with the code once retries are exhausted", async () => {
            const onTimeout = vi.fn();
            MSP.onTimeout = onTimeout;
            try {
                const rejection = expect(MSP.promise(EEPROM_WRITE_CODE)).rejects.toBeInstanceOf(MspTimeoutError);

                await vi.advanceTimersByTimeAsync(MSP.TIMEOUT * (MSP.MAX_RETRIES - 1));
                expect(onTimeout).not.toHaveBeenCalled(); // still retrying, not yet exhausted

                await vi.advanceTimersByTimeAsync(MSP.TIMEOUT);
                await rejection;
                expect(onTimeout).toHaveBeenCalledExactlyOnceWith(EEPROM_WRITE_CODE);
            } finally {
                MSP.onTimeout = null;
            }
        });
    });

    describe("disconnect_cleanup", () => {
        it("rejects pending promise with MspCancelledError reason disconnected and empties queues", async () => {
            const promise = MSP.promise(EEPROM_WRITE_CODE);
            promise.catch(() => {});
            const instanceRejection = expect(promise).rejects.toBeInstanceOf(MspCancelledError);
            const reasonRejection = expect(promise).rejects.toMatchObject({ reason: "disconnected" });

            MSP.disconnect_cleanup();

            await instanceRejection;
            await reasonRejection;
            expect(MSP.callbacks).toHaveLength(0);
            expect(MSP.parked.size).toBe(0);
        });

        it("rejects both an in-flight and a parked promise with MspCancelledError reason disconnected", async () => {
            const inFlightPromise = MSP.promise(EEPROM_WRITE_CODE, [1]);
            inFlightPromise.catch(() => {});
            const parkedPromise = MSP.promise(EEPROM_WRITE_CODE, [2]);
            parkedPromise.catch(() => {});

            expect(MSP.parked.get(EEPROM_WRITE_CODE)).toHaveLength(1);

            const inFlightInstanceRejection = expect(inFlightPromise).rejects.toBeInstanceOf(MspCancelledError);
            const inFlightReasonRejection = expect(inFlightPromise).rejects.toMatchObject({ reason: "disconnected" });
            const parkedInstanceRejection = expect(parkedPromise).rejects.toBeInstanceOf(MspCancelledError);
            const parkedReasonRejection = expect(parkedPromise).rejects.toMatchObject({ reason: "disconnected" });

            MSP.disconnect_cleanup();

            await inFlightInstanceRejection;
            await inFlightReasonRejection;
            await parkedInstanceRejection;
            await parkedReasonRejection;
            expect(MSP.callbacks).toHaveLength(0);
            expect(MSP.parked.size).toBe(0);
        });
    });

    describe("callbacks_cleanup", () => {
        it("rejects pending promise with MspCancelledError reason cleanup", async () => {
            const promise = MSP.promise(EEPROM_WRITE_CODE);
            promise.catch(() => {});
            const instanceRejection = expect(promise).rejects.toBeInstanceOf(MspCancelledError);
            const reasonRejection = expect(promise).rejects.toMatchObject({ reason: "cleanup" });

            MSP.callbacks_cleanup();

            await instanceRejection;
            await reasonRejection;
            expect(MSP.callbacks).toHaveLength(0);
        });
    });

    describe("send while disconnected / virtual mode", () => {
        it("rejects with MspCancelledError reason disconnected when serial is not connected", async () => {
            serial._protocol = { connected: false };

            const promise = MSP.promise(EEPROM_WRITE_CODE);
            promise.catch(() => {});
            await expect(promise).rejects.toBeInstanceOf(MspCancelledError);
            await expect(promise).rejects.toMatchObject({ reason: "disconnected" });
            expect(serialSendSpy).not.toHaveBeenCalled();
        });

        it("resolves undefined without touching serial.send when virtualMode is true", async () => {
            CONFIGURATOR.virtualMode = true;

            await expect(MSP.promise(EEPROM_WRITE_CODE)).resolves.toBeUndefined();
            expect(serialSendSpy).not.toHaveBeenCalled();
        });
    });

    describe("crc failure", () => {
        it("rejects with MspCrcError when the response frame checksum is wrong", async () => {
            const rejection = expect(MSP.promise(EEPROM_WRITE_CODE)).rejects.toBeInstanceOf(MspCrcError);

            readFrame(v1CorruptResponseFrame(EEPROM_WRITE_CODE));

            await rejection;
        });
    });

    describe("per-code serialisation", () => {
        it("parks a second errorAware request with a different payload behind the in-flight one, then releases it on response", async () => {
            const firstPromise = MSP.promise(EEPROM_WRITE_CODE, [1]);
            expect(serialSendSpy).toHaveBeenCalledTimes(1);

            const secondPromise = MSP.promise(EEPROM_WRITE_CODE, [2]);
            expect(serialSendSpy).toHaveBeenCalledTimes(1);
            expect(MSP.parked.get(EEPROM_WRITE_CODE)).toHaveLength(1);

            readFrame(v1ResponseFrame(EEPROM_WRITE_CODE, [1]));
            await expect(firstPromise).resolves.toMatchObject({ command: EEPROM_WRITE_CODE });

            expect(serialSendSpy).toHaveBeenCalledTimes(2);
            expect(MSP.parked.has(EEPROM_WRITE_CODE)).toBe(false);

            readFrame(v1ResponseFrame(EEPROM_WRITE_CODE, [2]));
            const secondResult = await secondPromise;
            expect(secondResult.command).toBe(EEPROM_WRITE_CODE);
            expect(secondResult.data.byteLength).toBe(1);
            expect(secondResult.data.getUint8(0)).toBe(2);
        });

        it("dedups two identical (payload-less) requests onto a single wire send and resolves both on one response", async () => {
            // _transmit only skips the resend when `data` is falsy (`if (data || !requestExists)`),
            // so true wire-level dedup only happens for no-payload requests; a truthy payload
            // always resends even when the buffer already matches an in-flight entry.
            const firstPromise = MSP.promise(EEPROM_WRITE_CODE);
            const secondPromise = MSP.promise(EEPROM_WRITE_CODE);

            expect(serialSendSpy).toHaveBeenCalledTimes(1);
            expect(MSP.parked.size).toBe(0);
            expect(MSP.callbacks.filter((entry) => entry.code === EEPROM_WRITE_CODE)).toHaveLength(2);

            readFrame(v1ResponseFrame(EEPROM_WRITE_CODE));

            await expect(firstPromise).resolves.toMatchObject({ command: EEPROM_WRITE_CODE });
            await expect(secondPromise).resolves.toMatchObject({ command: EEPROM_WRITE_CODE });
            expect(MSP.callbacks).toHaveLength(0);
        });

        it("releases a parked request on timeout exhaustion of the in-flight one, and the released request then times out on its own", async () => {
            const firstRejection = expect(MSP.promise(EEPROM_WRITE_CODE, [1])).rejects.toBeInstanceOf(MspTimeoutError);
            const secondRejection = expect(MSP.promise(EEPROM_WRITE_CODE, [2])).rejects.toBeInstanceOf(MspTimeoutError);

            expect(serialSendSpy).toHaveBeenCalledTimes(1);
            expect(MSP.parked.get(EEPROM_WRITE_CODE)).toHaveLength(1);

            // exhaust the first request's retries (initial send + resends while attempts < MAX_RETRIES,
            // exhaustion detected on the MAX_RETRIES-th timer firing, i.e. at MAX_RETRIES * TIMEOUT)
            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT * MSP.MAX_RETRIES);
            await firstRejection;

            // the parked request is released and transmitted once the first is gone
            expect(MSP.parked.has(EEPROM_WRITE_CODE)).toBe(false);
            expect(MSP.callbacks.some((entry) => entry.code === EEPROM_WRITE_CODE)).toBe(true);

            // now let the released request exhaust its own retries
            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT * MSP.MAX_RETRIES);
            await secondRejection;

            expect(MSP.callbacks).toHaveLength(0);
        });
    });

    describe("legacy interplay", () => {
        it("does not park a promise behind an in-flight legacy request with a different payload", async () => {
            // Dispatch (MSPHelper.process_data) matches queued callbacks entries by `code` alone,
            // not by request buffer, so a single incoming frame resolves every same-code entry
            // still queued — legacy and errorAware alike — regardless of which payload it was for.
            let legacyCallbackArg;
            MSP.send_message(EEPROM_WRITE_CODE, [1], false, (result) => {
                legacyCallbackArg = result;
            });
            expect(serialSendSpy).toHaveBeenCalledTimes(1);

            const promiseResult = MSP.promise(EEPROM_WRITE_CODE, [2]);
            expect(serialSendSpy).toHaveBeenCalledTimes(2);
            expect(MSP.parked.size).toBe(0);

            readFrame(v1ResponseFrame(EEPROM_WRITE_CODE, [2]));

            await expect(promiseResult).resolves.toMatchObject({ command: EEPROM_WRITE_CODE });
            expect(legacyCallbackArg).toMatchObject({ command: EEPROM_WRITE_CODE });
            expect(MSP.callbacks).toHaveLength(0);
        });

        it("does not invoke the legacy callback on callbacks_cleanup", () => {
            const legacyCallback = vi.fn();
            MSP.send_message(EEPROM_WRITE_CODE, [1], false, legacyCallback);

            MSP.callbacks_cleanup();

            expect(legacyCallback).not.toHaveBeenCalled();
        });

        it("does not invoke the legacy callback on retry exhaustion, but a late response still fires it", async () => {
            const legacyCallback = vi.fn();
            MSP.send_message(EEPROM_WRITE_CODE, [1], false, legacyCallback);

            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT * MSP.MAX_RETRIES);
            expect(legacyCallback).not.toHaveBeenCalled();
            expect(MSP.callbacks.some((entry) => entry.code === EEPROM_WRITE_CODE)).toBe(true);

            readFrame(v1ResponseFrame(EEPROM_WRITE_CODE, [1]));
            expect(legacyCallback).toHaveBeenCalledTimes(1);
            expect(legacyCallback).toHaveBeenCalledWith(expect.objectContaining({ command: EEPROM_WRITE_CODE }));
        });
    });

    describe("deduped errorAware awaiter", () => {
        it("still times out even though it was deduped onto a legacy in-flight request", async () => {
            const legacyCallback = vi.fn();
            MSP.send_message(EEPROM_WRITE_CODE, undefined, false, legacyCallback);
            expect(serialSendSpy).toHaveBeenCalledTimes(1);

            const rejection = expect(MSP.promise(EEPROM_WRITE_CODE)).rejects.toBeInstanceOf(MspTimeoutError);

            // deduped: no additional wire send at attach time
            expect(serialSendSpy).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(MSP.TIMEOUT * MSP.MAX_RETRIES);
            await rejection;

            expect(legacyCallback).not.toHaveBeenCalled();
            expect(MSP.callbacks.some((entry) => entry.errorAware && entry.code === EEPROM_WRITE_CODE)).toBe(false);
        });
    });
});
