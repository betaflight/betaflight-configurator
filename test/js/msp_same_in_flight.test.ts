import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MSP from "../../src/js/msp";
import MspHelper from "../../src/js/msp/MSPHelper";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { serial } from "../../src/js/serial";
import { MspDataView } from "../../src/js/msp/mspBytes";
import type { MspRequest } from "../../src/js/msp";

// MSP.MAX_SAME_IN_FLIGHT: how many identical payload-less requests may be on the wire. Serial
// links keep 1 (a repeat attaches to the pending request); a high-latency BLE bridge gets 2 so
// a poller keeps the bridge busy and each reply settles exactly one caller, oldest first.
describe("MSP.MAX_SAME_IN_FLIGHT", () => {
    afterEach(() => {
        MSP.MAX_SAME_IN_FLIGHT = 1;
        for (const entry of MSP.callbacks) {
            clearTimeout(entry.timer ?? undefined);
        }
        MSP.callbacks = [];
        vi.restoreAllMocks();
    });

    function armSerial() {
        setActivePinia(createPinia());
        Object.defineProperty(serial, "connected", { value: true, configurable: true });
        return vi.spyOn(serial, "send").mockImplementation((buffer: ArrayBuffer | ArrayLike<number>) => {
            const length = "byteLength" in buffer ? buffer.byteLength : buffer.length;
            return Promise.resolve({ bytesSent: length });
        });
    }

    it("sends a repeated request once per allowed copy and attaches the rest", () => {
        const send = armSerial();

        MSP.MAX_SAME_IN_FLIGHT = 1;
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        expect(send).toHaveBeenCalledTimes(1);
        expect(MSP.callbacks).toHaveLength(2);

        MSP.callbacks = [];
        send.mockClear();
        MSP.MAX_SAME_IN_FLIGHT = 2;
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        expect(send).toHaveBeenCalledTimes(2);
        expect(MSP.callbacks).toHaveLength(3);
    });

    it("does not let a request whose retries ran out block fresh sends", () => {
        const send = armSerial();

        MSP.MAX_SAME_IN_FLIGHT = 1;
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        expect(send).toHaveBeenCalledTimes(1);
        // The legacy timeout path leaves an exhausted entry queued without a timer.
        clearTimeout(MSP.callbacks[0].timer ?? undefined);
        MSP.callbacks[0].timer = null;
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {});
        expect(send).toHaveBeenCalledTimes(2);
        expect(MSP.callbacks).toHaveLength(2);
    });

    it("settles one in-flight copy per reply, taking any timer-less riders with it", () => {
        setActivePinia(createPinia());
        const helper = new MspHelper();
        const order: string[] = [];
        const timers: ReturnType<typeof setTimeout>[] = [];
        const entry = (name: string, inFlight: boolean): MspRequest => {
            const timer = inFlight ? setTimeout(() => {}, 60000) : null;
            if (timer) {
                timers.push(timer);
            }
            return {
                code: MSPCodes.MSP_ATTITUDE,
                timer,
                callback: () => order.push(name),
            } as Partial<MspRequest> as MspRequest;
        };
        const frame = (max: number) => ({
            code: MSPCodes.MSP_ATTITUDE,
            dataView: new MspDataView(new Int16Array([0, 0, 0]).buffer),
            crcError: false,
            unsupported: 0,
            callbacks: [] as MspRequest[],
            MAX_SAME_IN_FLIGHT: max,
        });

        try {
            const pipelined = frame(2);
            pipelined.callbacks.push(entry("first", true), entry("second", true), entry("rider", false));
            helper.process_data(pipelined);
            expect(order).toEqual(["first", "rider"]);
            expect(pipelined.callbacks).toHaveLength(1);
            helper.process_data(pipelined);
            expect(order).toEqual(["first", "rider", "second"]);
            expect(pipelined.callbacks).toHaveLength(0);

            // The serial default still settles every pending copy with one reply.
            order.length = 0;
            const deduped = frame(1);
            deduped.callbacks.push(entry("a", true), entry("b", false));
            helper.process_data(deduped);
            expect(order.sort()).toEqual(["a", "b"]);
            expect(deduped.callbacks).toHaveLength(0);
        } finally {
            timers.forEach((t) => clearTimeout(t));
        }
    });
});
