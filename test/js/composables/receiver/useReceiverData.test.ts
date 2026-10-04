import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { useReceiverData } from "../../../../src/composables/receiver/useReceiverData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({ default: { interval_add: vi.fn(), interval_remove: vi.fn() } }));

type ReceiverData = ReturnType<typeof useReceiverData>;

function mountData() {
    let data!: ReceiverData;
    const wrapper = mount(
        defineComponent({
            setup() {
                data = useReceiverData();
                return () => null;
            },
        }),
    );
    return { wrapper, data };
}

const runTick = (name: string) => {
    vi.mocked(MSP.send_message).mockClear();
    vi.mocked(GUI.interval_add)
        .mock.calls.filter(([added]) => added === name)
        .at(-1)![1]();
};

describe("useReceiverData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    it("loads in the order the tab depends on", async () => {
        await mountData().data.loadReceiverData();

        expect(vi.mocked(MSP.promise).mock.calls).toEqual([
            [MSPCodes.MSP_FEATURE_CONFIG],
            [MSPCodes.MSP_RC],
            [MSPCodes.MSP_MODE_RANGES],
            [MSPCodes.MSP_MODE_RANGES_EXTRA],
            [MSPCodes.MSP_RSSI_CONFIG],
            [MSPCodes.MSP_RC_TUNING],
            [MSPCodes.MSP_RX_MAP],
            [MSPCodes.MSP_RC_DEADBAND],
            [MSPCodes.MSP_RX_CONFIG],
            [MSPCodes.MSP_MIXER_CONFIG],
            [MSPCodes.MSP_MOTOR_CONFIG],
        ]);
    });

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.loadReceiverData()).rejects.toThrow("MSP timeout");
        expect(MSP.promise).toHaveBeenCalledOnce();
    });

    it("polls RC for the model preview and the plot, and removes both intervals on unmount", () => {
        const onRcData = vi.fn();
        const { wrapper, data } = mountData();
        data.startModelPreviewPolling();
        data.startRcPolling(75, onRcData);

        expect(vi.mocked(GUI.interval_add).mock.calls).toEqual([
            ["receiver_pull_for_model_preview", expect.any(Function), 33, false],
            ["receiver_pull", expect.any(Function), 75, true],
        ]);
        runTick("receiver_pull_for_model_preview");
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RC, false, false);
        runTick("receiver_pull");
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RC, false, false, onRcData);

        wrapper.unmount();
        expect(GUI.interval_remove).toHaveBeenCalledWith("receiver_pull_for_model_preview");
        expect(GUI.interval_remove).toHaveBeenCalledWith("receiver_pull");
    });

    it("restarts the plot polling by removing the old interval before adding the new one", () => {
        const onRcData = vi.fn();

        mountData().data.restartRcPolling(200, onRcData);

        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith("receiver_pull", expect.any(Function), 200, true);
        expect(vi.mocked(GUI.interval_remove).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(GUI.interval_add).mock.invocationCallOrder[0],
        );
        expect(GUI.interval_remove).toHaveBeenCalledWith("receiver_pull");
        runTick("receiver_pull");
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RC, false, false, onRcData);
    });
});
