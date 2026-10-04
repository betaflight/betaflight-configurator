import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useBoardAlignmentPolling } from "../../../../src/composables/sensors/useBoardAlignmentPolling";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));

const PERIOD = 30;

/** Answer the most recent request. */
function reply() {
    const callback = vi.mocked(MSP.send_message).mock.lastCall?.[3];
    (callback as () => void)();
}

function sentCodes() {
    return vi.mocked(MSP.send_message).mock.calls.map(([code]) => code);
}

describe("useBoardAlignmentPolling", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Both streams share one loop implementation; its edge cases are covered through the IMU loop.
    it.each([
        ["IMU", "startImuPolling", MSPCodes.MSP_RAW_IMU],
        ["attitude", "startAttitudePolling", MSPCodes.MSP_ATTITUDE],
    ] as const)("%s loop requests immediately, then again one period after each reply", (_label, start, code) => {
        const polling = useBoardAlignmentPolling(PERIOD, () => {});

        polling[start]();
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(code, false, false, expect.any(Function));

        // no re-request until the reply lands, however long it takes
        vi.advanceTimersByTime(PERIOD * 10);
        expect(MSP.send_message).toHaveBeenCalledTimes(1);

        reply();
        vi.advanceTimersByTime(PERIOD - 1);
        expect(MSP.send_message).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(sentCodes()).toEqual([code, code]);
    });

    it("ignores a second start while polling", () => {
        const polling = useBoardAlignmentPolling(PERIOD, () => {});

        polling.startImuPolling();
        polling.startImuPolling();

        expect(MSP.send_message).toHaveBeenCalledOnce();
    });

    it("ignores a reply that lands after stop", () => {
        const onImuSample = vi.fn();
        const polling = useBoardAlignmentPolling(PERIOD, onImuSample);

        polling.startImuPolling();
        polling.stopImuPolling();
        reply();
        vi.advanceTimersByTime(PERIOD * 10);

        expect(MSP.send_message).toHaveBeenCalledOnce();
        expect(onImuSample).not.toHaveBeenCalled();
    });

    it("cancels the pending re-request on stop", () => {
        const polling = useBoardAlignmentPolling(PERIOD, () => {});

        polling.startImuPolling();
        reply();
        polling.stopImuPolling();
        vi.advanceTimersByTime(PERIOD * 10);

        expect(MSP.send_message).toHaveBeenCalledOnce();
    });

    it("runs a single loop when restarted while a re-request is pending", () => {
        const polling = useBoardAlignmentPolling(PERIOD, () => {});

        polling.startImuPolling();
        reply();
        polling.stopImuPolling();
        polling.startImuPolling();
        vi.advanceTimersByTime(PERIOD * 10);

        // the restart's own request is still unanswered, so nothing else goes out
        expect(sentCodes()).toEqual([MSPCodes.MSP_RAW_IMU, MSPCodes.MSP_RAW_IMU]);
    });

    it("hands each IMU reply to the caller, before scheduling the next request", () => {
        const onImuSample = vi.fn(() => {
            expect(vi.getTimerCount()).toBe(0);
        });
        const polling = useBoardAlignmentPolling(PERIOD, onImuSample);

        polling.startImuPolling();
        reply();

        expect(onImuSample).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(1);
    });

    it("sends nothing more when the IMU handler stops polling", () => {
        const polling = useBoardAlignmentPolling(PERIOD, () => polling.stopImuPolling());

        polling.startImuPolling();
        reply();
        vi.advanceTimersByTime(PERIOD * 10);

        expect(MSP.send_message).toHaveBeenCalledOnce();
    });

    it("does not schedule another request when the IMU handler throws", () => {
        const polling = useBoardAlignmentPolling(PERIOD, () => {
            throw new Error("bad sample");
        });

        polling.startImuPolling();
        expect(() => reply()).toThrow("bad sample");

        expect(vi.getTimerCount()).toBe(0);
    });

    it("runs the two loops independently, and keeps attitude replies from the IMU handler", () => {
        const onImuSample = vi.fn();
        const polling = useBoardAlignmentPolling(PERIOD, onImuSample);

        polling.startImuPolling();
        polling.startAttitudePolling();
        polling.stopImuPolling();
        reply(); // the attitude reply
        vi.advanceTimersByTime(PERIOD);

        expect(sentCodes()).toEqual([MSPCodes.MSP_RAW_IMU, MSPCodes.MSP_ATTITUDE, MSPCodes.MSP_ATTITUDE]);
        expect(onImuSample).not.toHaveBeenCalled();
    });
});
