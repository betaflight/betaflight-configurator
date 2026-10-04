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

    it("does not poll until started", () => {
        mountPolling();

        vi.advanceTimersByTime(1000);

        expect(MSP.send_message).not.toHaveBeenCalled();
    });

    it("requests MSP_RC every 100 ms, not up front, and hands each reply to the caller", () => {
        const onRcData = vi.fn();
        mountPolling().polling.startRcPolling(onRcData);

        expect(MSP.send_message).not.toHaveBeenCalled();
        vi.advanceTimersByTime(99);
        expect(MSP.send_message).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(MSP.send_message).toHaveBeenCalledOnce();
        expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_RC, false, false, onRcData);

        vi.advanceTimersByTime(200);
        expect(MSP.send_message).toHaveBeenCalledTimes(3);
    });

    it("stops polling when the component unmounts", () => {
        const { wrapper, polling } = mountPolling();
        polling.startRcPolling(() => {});
        vi.advanceTimersByTime(100);
        expect(MSP.send_message).toHaveBeenCalledOnce();

        wrapper.unmount();
        vi.advanceTimersByTime(1000);

        expect(MSP.send_message).toHaveBeenCalledOnce();
    });

    it("unmounting before polling starts is harmless", () => {
        const { wrapper } = mountPolling();

        expect(() => wrapper.unmount()).not.toThrow();
    });
});
