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

    describe.each([
        ["IMU", "startImuPolling", "stopImuPolling", MSPCodes.MSP_RAW_IMU],
        ["attitude", "startAttitudePolling", "stopAttitudePolling", MSPCodes.MSP_ATTITUDE],
    ] as const)("%s loop", (_label, start, stop, code) => {
        it("requests immediately, then again one period after each reply", () => {
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

            polling[start]();
            polling[start]();

            expect(MSP.send_message).toHaveBeenCalledOnce();
        });

        it("ignores a reply that lands after stop", () => {
            const onImuSample = vi.fn();
            const polling = useBoardAlignmentPolling(PERIOD, onImuSample);

            polling[start]();
            polling[stop]();
            reply();
            vi.advanceTimersByTime(PERIOD * 10);

            expect(MSP.send_message).toHaveBeenCalledOnce();
            expect(onImuSample).not.toHaveBeenCalled();
        });

        it("cancels the pending re-request on stop", () => {
            const polling = useBoardAlignmentPolling(PERIOD, () => {});

            polling[start]();
            reply();
            polling[stop]();
            expect(vi.getTimerCount()).toBe(0);
            vi.advanceTimersByTime(PERIOD * 10);

            expect(MSP.send_message).toHaveBeenCalledOnce();
        });

        it("runs a single loop when restarted while a re-request is pending", () => {
            const polling = useBoardAlignmentPolling(PERIOD, () => {});

            polling[start]();
            reply();
            polling[stop]();
            polling[start]();
            vi.advanceTimersByTime(PERIOD * 10);

            // the restart's own request is still unanswered, so nothing else goes out
            expect(sentCodes()).toEqual([code, code]);
        });

        it("can be restarted after stop", () => {
            const polling = useBoardAlignmentPolling(PERIOD, () => {});

            polling[start]();
            polling[stop]();
            polling[start]();

            expect(sentCodes()).toEqual([code, code]);
        });
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

    it("does not hand attitude replies to the IMU handler", () => {
        const onImuSample = vi.fn();
        const polling = useBoardAlignmentPolling(PERIOD, onImuSample);

        polling.startAttitudePolling();
        reply();

        expect(onImuSample).not.toHaveBeenCalled();
    });

    it("runs the two loops independently", () => {
        const polling = useBoardAlignmentPolling(PERIOD, () => {});

        polling.startImuPolling();
        polling.startAttitudePolling();
        polling.stopImuPolling();
        reply(); // the attitude reply
        vi.advanceTimersByTime(PERIOD);

        expect(sentCodes()).toEqual([MSPCodes.MSP_RAW_IMU, MSPCodes.MSP_ATTITUDE, MSPCodes.MSP_ATTITUDE]);
    });
});
