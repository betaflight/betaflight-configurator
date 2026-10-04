import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { useReceiverData } from "../../../../src/composables/receiver/useReceiverData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({ default: { interval_add: vi.fn(), interval_remove: vi.fn() } }));

type ReceiverData = ReturnType<typeof useReceiverData>;

const LOAD_ORDER = [
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_RC,
    MSPCodes.MSP_MODE_RANGES,
    MSPCodes.MSP_MODE_RANGES_EXTRA,
    MSPCodes.MSP_RSSI_CONFIG,
    MSPCodes.MSP_RC_TUNING,
    MSPCodes.MSP_RX_MAP,
    MSPCodes.MSP_RC_DEADBAND,
    MSPCodes.MSP_RX_CONFIG,
    MSPCodes.MSP_MIXER_CONFIG,
    MSPCodes.MSP_MOTOR_CONFIG,
];

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

const requested = () => vi.mocked(MSP.promise).mock.calls.map(([code]) => code);
const ticks = () => new Map(vi.mocked(GUI.interval_add).mock.calls.map(([name, code]) => [name, code]));

describe("useReceiverData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    it("loads in the order the tab depends on", async () => {
        await mountData().data.loadReceiverData();

        expect(requested()).toEqual(LOAD_ORDER);
        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_FEATURE_CONFIG);
    });

    it.each(LOAD_ORDER.map((code, index) => [index, code]))(
        "holds back everything after request %i until its reply lands",
        async (index, held) => {
            let release!: () => void;
            vi.mocked(MSP.promise).mockImplementation((code) =>
                code === held
                    ? new Promise((resolve) => {
                          release = () => resolve(undefined);
                      })
                    : Promise.resolve(undefined),
            );
            let done = false;

            const loading = mountData()
                .data.loadReceiverData()
                .then(() => {
                    done = true;
                });
            await flushPromises();

            expect(requested()).toEqual(LOAD_ORDER.slice(0, index + 1));
            expect(done).toBe(false);

            release();
            await loading;
            expect(requested()).toEqual(LOAD_ORDER);
        },
    );

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.loadReceiverData()).rejects.toThrow("MSP timeout");

        expect(MSP.promise).toHaveBeenCalledOnce();
    });

    it("polls RC for the model preview every 33 ms without a callback, not first", () => {
        mountData().data.startModelPreviewPolling();

        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith(
            "receiver_pull_for_model_preview",
            expect.any(Function),
            33,
            false,
        );
        ticks().get("receiver_pull_for_model_preview")!();
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RC, false, false);
    });

    it("polls RC for the plot at the given rate, first, handing each reply to the caller", () => {
        const onRcData = vi.fn();
        mountData().data.startRcPolling(75, onRcData);

        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith("receiver_pull", expect.any(Function), 75, true);
        ticks().get("receiver_pull")!();
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RC, false, false, onRcData);
    });

    it("restarts the plot polling by removing the old interval before adding the new one", () => {
        const onRcData = vi.fn();

        mountData().data.restartRcPolling(200, onRcData);

        expect(GUI.interval_remove).toHaveBeenCalledExactlyOnceWith("receiver_pull");
        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith("receiver_pull", expect.any(Function), 200, true);
        expect(vi.mocked(GUI.interval_remove).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(GUI.interval_add).mock.invocationCallOrder[0],
        );
        ticks().get("receiver_pull")!();
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RC, false, false, onRcData);
    });

    it("removes both intervals on unmount", () => {
        const { wrapper, data } = mountData();
        data.startModelPreviewPolling();
        data.startRcPolling(50, () => {});

        wrapper.unmount();

        expect(GUI.interval_remove).toHaveBeenCalledWith("receiver_pull_for_model_preview");
        expect(GUI.interval_remove).toHaveBeenCalledWith("receiver_pull");
    });
});
