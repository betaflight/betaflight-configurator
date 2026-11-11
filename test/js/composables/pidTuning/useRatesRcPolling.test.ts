import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useRatesRcPolling } from "../../../../src/composables/pidTuning/useRatesRcPolling";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));

type RatesRcPolling = ReturnType<typeof useRatesRcPolling>;

function mountPolling() {
    let polling!: RatesRcPolling;
    const wrapper = mount(
        defineComponent({
            setup() {
                polling = useRatesRcPolling();
                return () => null;
            },
        }),
    );
    return { wrapper, polling };
}

describe("useRatesRcPolling", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("polls MSP_RC every 100 ms once started, hands each reply to the caller, and stops on unmount", () => {
        const onRcData = vi.fn();
        const { wrapper, polling } = mountPolling();
        vi.advanceTimersByTime(1000);
        expect(MSP.send_message).not.toHaveBeenCalled();

        polling.startRcPolling(onRcData);
        vi.advanceTimersByTime(300);
        expect(MSP.send_message).toHaveBeenCalledTimes(3);
        expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_RC, false, false, onRcData);

        wrapper.unmount();
        vi.advanceTimersByTime(1000);
        expect(MSP.send_message).toHaveBeenCalledTimes(3);
    });

    it("replaces a running poll when started again, so only the latest callback is polled", () => {
        const first = vi.fn();
        const second = vi.fn();
        const { wrapper, polling } = mountPolling();

        polling.startRcPolling(first);
        polling.startRcPolling(second);
        vi.advanceTimersByTime(300);

        expect(MSP.send_message).toHaveBeenCalledTimes(3);
        expect(MSP.send_message).not.toHaveBeenCalledWith(MSPCodes.MSP_RC, false, false, first);

        wrapper.unmount();
        vi.advanceTimersByTime(1000);
        expect(MSP.send_message).toHaveBeenCalledTimes(3);
    });
});
