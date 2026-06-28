import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../src/js/msp";
import { serial } from "../../src/js/serial.js";

describe("MSP", () => {
    describe("send_message / promise bounded timeout", () => {
        let sendSpy;

        beforeEach(() => {
            vi.useFakeTimers();
            // Force the connected path in send_message and capture outgoing bytes.
            vi.spyOn(serial, "connected", "get").mockReturnValue(true);
            sendSpy = vi.spyOn(serial, "send").mockImplementation((_data, callback) => {
                // Mimic a successful, but unanswered, write.
                callback?.({ bytesSent: _data.byteLength });
            });
            MSP.callbacks_cleanup();
        });

        afterEach(() => {
            MSP.callbacks_cleanup();
            vi.clearAllTimers();
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        it("without timeoutMs keeps resending and never rejects (legacy behavior preserved)", async () => {
            const responseCallback = vi.fn();
            const sent = MSP.send_message(MSP.code ?? 1, false, false, responseCallback);
            expect(sent).toBe(true);

            const initialSends = sendSpy.mock.calls.length;
            expect(initialSends).toBeGreaterThan(0);

            // Advance well past several TIMEOUT windows: the request should resend
            // repeatedly and the callback must never fire (no rejection/resolution).
            for (let i = 0; i < 5; i++) {
                vi.advanceTimersByTime(MSP.TIMEOUT);
            }

            expect(sendSpy.mock.calls.length).toBeGreaterThan(initialSends);
            expect(responseCallback).not.toHaveBeenCalled();
            // The request remains queued (still in flight).
            expect(MSP.callbacks.length).toBe(1);
        });

        it("with timeoutMs rejects after the bound and stops resending", async () => {
            const timeoutMs = 250;
            const promise = MSP.promise(1, false, { timeoutMs });
            // Surface the rejection without an unhandled-rejection warning.
            const assertion = expect(promise).rejects.toThrow(/timed out after 250ms/);

            const sendsBeforeDeadline = sendSpy.mock.calls.length;

            // Fire the deadline.
            await vi.advanceTimersByTimeAsync(timeoutMs);
            await assertion;

            // The request is removed from the queue and its timers are gone.
            expect(MSP.callbacks.length).toBe(0);

            // After the deadline, the resend timer must not fire any more sends.
            const sendsAfterDeadline = sendSpy.mock.calls.length;
            vi.advanceTimersByTime(MSP.TIMEOUT * 5);
            expect(sendSpy.mock.calls.length).toBe(sendsAfterDeadline);
            expect(sendsAfterDeadline).toBeGreaterThanOrEqual(sendsBeforeDeadline);
        });

        it("cleans up both resend and deadline timers on rejection", async () => {
            const clearSpy = vi.spyOn(globalThis, "clearTimeout");
            const promise = MSP.promise(1, false, { timeoutMs: 100 });
            const assertion = expect(promise).rejects.toThrow();

            await vi.advanceTimersByTimeAsync(100);
            await assertion;

            // Deadline handler clears the resend timer; queue is empty so no leaks.
            expect(clearSpy).toHaveBeenCalled();
            expect(MSP.callbacks.length).toBe(0);
            // No pending timers remain.
            expect(vi.getTimerCount()).toBe(0);
        });

        it("arms the deadline for a COALESCED timeoutMs request so it still rejects (S3 acceptance)", async () => {
            const timeoutMs = 200;
            // First request owns the queue slot and the resend timer.
            const cb1 = vi.fn();
            MSP.send_message(1, false, false, cb1, { timeoutMs });
            // An identical request coalesces (requestExists === true): it gets no
            // resend timer, but it MUST still get its own deadline — otherwise it
            // could never reject (the trap this fix closes).
            const cb2 = vi.fn();
            MSP.send_message(1, false, false, cb2, { timeoutMs });

            const entries = MSP.callbacks.filter((c) => c.code === 1);
            expect(entries.length).toBe(2);
            expect(entries.every((e) => e.deadlineTimer !== undefined)).toBe(true);

            await vi.advanceTimersByTimeAsync(timeoutMs);

            // Both the original and the coalesced waiter reject with a timeout marker.
            expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ timeout: true, timeoutMs }));
            expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ timeout: true, timeoutMs }));
            expect(MSP.callbacks.filter((c) => c.code === 1).length).toBe(0);
        });

        it("clears the deadline timer when a response arrives in time", () => {
            const clearSpy = vi.spyOn(globalThis, "clearTimeout");
            const responseCallback = vi.fn();
            MSP.send_message(1, false, false, responseCallback, { timeoutMs: 1000 });

            // Simulate the response path that MSPHelper performs on a matched code.
            const entry = MSP.callbacks.find((c) => c.code === 1);
            expect(entry).toBeDefined();
            clearTimeout(entry.timer);
            clearTimeout(entry.deadlineTimer);
            MSP.callbacks.splice(MSP.callbacks.indexOf(entry), 1);
            entry.callback({ command: 1, data: null, length: 0, crcError: false });

            expect(clearSpy).toHaveBeenCalled();
            // Advancing past the deadline must not invoke the callback again.
            vi.advanceTimersByTime(2000);
            expect(responseCallback).toHaveBeenCalledTimes(1);
            expect(MSP.callbacks.length).toBe(0);
        });
    });

    describe("encode_message_v1", () => {
        it("handles correctly any code and no data", () => {
            for (let code = 0; code < 256; code++) {
                let encodedMessage = MSP.encode_message_v1(code, false);
                expect(new Uint8Array(encodedMessage)).toEqual(new Uint8Array([36, 77, 60, 0, code, code]));
            }
        });
        it("handles non-empty messages correctly", () => {
            let [operationCode, inputDataLengthPadding] = crypto.getRandomValues(new Uint8Array(2));

            let inputData = crypto.getRandomValues(new Uint8Array(100 + (inputDataLengthPadding % 100)));

            let encodedMessage = new Uint8Array(MSP.encode_message_v1(operationCode, inputData));

            // check that header is in place
            expect(encodedMessage.slice(0, 3)).toEqual(new Uint8Array([36, 77, 60]));

            // check that length got encoded as expected
            expect(encodedMessage[3]).toEqual(inputData.length);

            // check that operation code is there
            expect(encodedMessage[4]).toEqual(operationCode);

            // check that data got encoded as expected
            expect(encodedMessage.slice(5, -1)).toEqual(inputData);

            // and that the checksum is valid
            let checksum = encodedMessage.slice(3, -1).reduce((acc, curr) => acc ^ curr);
            expect(encodedMessage[encodedMessage.length - 1]).toEqual(checksum);
        });
    });

    describe("encode_message_v2", () => {
        it("handles correctly any code and no data", () => {
            // Test boundary values and representative samples instead of
            // brute-forcing all 65536 combinations (which exceeds the 5s timeout)
            const testCodes = [
                0x0000, 0x0001, 0x00ff, 0x0100, 0x0101, 0x01ff, 0x7f00, 0x7fff, 0x8000, 0x8001, 0xff00, 0xfffe, 0xffff,
            ];

            // Add a spread of values across the full range
            for (let i = 0; i < 256; i += 17) {
                for (let j = 0; j < 256; j += 17) {
                    testCodes.push(i + j * 256);
                }
            }

            for (const code of testCodes) {
                const codeLowByte = code & 0xff;
                const codeHighByte = (code >> 8) & 0xff;
                let encodedMessage = MSP.encode_message_v2(code, false).slice(0, -1);
                expect(new Uint8Array(encodedMessage)).toEqual(
                    new Uint8Array([36, 88, 60, 0, codeLowByte, codeHighByte, 0, 0]),
                );
            }
        });
        it("handles non-empty messages correctly", () => {
            let [lengthLowByte, lengthHighByte] = crypto.getRandomValues(new Uint8Array(2));

            let inputData = crypto.getRandomValues(new Uint8Array(lengthLowByte + lengthHighByte * 256));
            let [operationCodeLowByte, operationCodeHighByte] = crypto.getRandomValues(new Uint8Array(2));

            let encodedMessage = new Uint8Array(
                MSP.encode_message_v2(operationCodeLowByte + 256 * operationCodeHighByte, inputData),
            );

            // check that header is in place
            expect(encodedMessage.slice(0, 3)).toEqual(new Uint8Array([36, 88, 60]));

            expect(encodedMessage[3]).toEqual(0);

            // check that operation code is there
            expect(encodedMessage[4]).toEqual(operationCodeLowByte);
            expect(encodedMessage[5]).toEqual(operationCodeHighByte);

            // check that length got encoded as expected
            expect(encodedMessage[6]).toEqual(lengthLowByte);
            expect(encodedMessage[7]).toEqual(lengthHighByte);

            // check that data got encoded as expected
            expect(encodedMessage.slice(8, -1)).toEqual(inputData);
        });
    });
});
