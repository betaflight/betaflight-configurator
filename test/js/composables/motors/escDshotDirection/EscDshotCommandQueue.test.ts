import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../../../../src/js/msp";
import EscDshotCommandQueue from "../../../../../src/composables/motors/escDshotDirection/EscDshotCommandQueue";

vi.mock("../../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));

describe("EscDshotCommandQueue", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("sends nothing until started, then one queued command per tick, in order", () => {
        const queue = new EscDshotCommandQueue(20);
        queue.pushCommand(1, [1]);
        queue.pushCommand(2, [2]);

        vi.advanceTimersByTime(100);
        expect(MSP.send_message).not.toHaveBeenCalled();

        queue.start();
        vi.advanceTimersByTime(19);
        expect(MSP.send_message).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(1, [1]);
        vi.advanceTimersByTime(20);
        expect(MSP.send_message).toHaveBeenLastCalledWith(2, [2]);
        expect(MSP.send_message).toHaveBeenCalledTimes(2);
    });

    it("spends ceil(ms / interval) ticks on a pause without sending", () => {
        const queue = new EscDshotCommandQueue(20);
        queue.pushPause(41); // 3 ticks
        queue.pushCommand(7, [7]);
        queue.start();

        vi.advanceTimersByTime(60);
        expect(MSP.send_message).not.toHaveBeenCalled();
        vi.advanceTimersByTime(20);
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(7, [7]);
    });

    it("starting twice does not double the send rate", () => {
        const queue = new EscDshotCommandQueue(20);
        queue.pushCommand(1, [1]);
        queue.pushCommand(2, [2]);
        queue.start();
        queue.start();

        vi.advanceTimersByTime(20);
        expect(MSP.send_message).toHaveBeenCalledOnce();
    });

    it("clear drops everything still queued", () => {
        const queue = new EscDshotCommandQueue(20);
        queue.pushCommand(1, [1]);
        queue.start();
        queue.clear();

        vi.advanceTimersByTime(100);
        expect(MSP.send_message).not.toHaveBeenCalled();
    });

    it("stop halts the timer; stopWhenEmpty drains the queue first", () => {
        const queue = new EscDshotCommandQueue(20);
        queue.pushCommand(1, [1]);
        queue.start();
        queue.stop();
        vi.advanceTimersByTime(100);
        expect(MSP.send_message).not.toHaveBeenCalled();

        queue.pushCommand(2, [2]);
        queue.start();
        queue.stopWhenEmpty();
        vi.advanceTimersByTime(40);
        expect(MSP.send_message).toHaveBeenNthCalledWith(1, 1, [1]);
        expect(MSP.send_message).toHaveBeenNthCalledWith(2, 2, [2]);
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(20);
        expect(vi.getTimerCount()).toBe(0);

        // the purge flag is consumed: a restarted queue keeps ticking while empty
        queue.start();
        vi.advanceTimersByTime(100);
        expect(vi.getTimerCount()).toBe(1);
    });
});
