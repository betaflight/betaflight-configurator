import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useAuxiliaryData } from "../../../../src/composables/auxiliary/useAuxiliaryData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { loadSerialConfig: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({ default: { interval_add: vi.fn(), interval_remove: vi.fn() } }));

type AuxiliaryData = ReturnType<typeof useAuxiliaryData>;

const LOAD_ORDER = [
    MSPCodes.MSP_BOXNAMES,
    MSPCodes.MSP_MODE_RANGES,
    MSPCodes.MSP_MODE_RANGES_EXTRA,
    MSPCodes.MSP_BOXIDS,
    MSPCodes.MSP_RSSI_CONFIG,
    MSPCodes.MSP_RC,
];

function mountData() {
    let data!: AuxiliaryData;
    const wrapper = mount(
        defineComponent({
            setup() {
                data = useAuxiliaryData();
                return () => null;
            },
        }),
    );
    return { wrapper, data };
}

describe("useAuxiliaryData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(mspHelper.loadSerialConfig).mockImplementation((callback) => callback?.());
    });

    it("loads in the order the tab depends on, finishing with the serial config", async () => {
        const order: string[] = [];
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            order.push(String(code));
        });
        vi.mocked(mspHelper.loadSerialConfig).mockImplementation((callback) => {
            order.push("serial");
            callback?.();
        });

        await mountData().data.loadAuxiliaryData();

        expect(order).toEqual([...LOAD_ORDER.map(String), "serial"]);
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

            const loading = mountData().data.loadAuxiliaryData();
            await flushPromises();

            expect(vi.mocked(MSP.promise).mock.calls.map(([code]) => code)).toEqual(LOAD_ORDER.slice(0, index + 1));
            expect(mspHelper.loadSerialConfig).not.toHaveBeenCalled();

            release();
            await loading;
            expect(mspHelper.loadSerialConfig).toHaveBeenCalledOnce();
        },
    );

    it("does not finish until the serial config reply lands", async () => {
        let reply!: () => void;
        vi.mocked(mspHelper.loadSerialConfig).mockImplementation((callback) => {
            reply = () => callback?.();
        });
        let done = false;

        const loading = mountData()
            .data.loadAuxiliaryData()
            .then(() => {
                done = true;
            });
        await flushPromises();
        expect(done).toBe(false);

        reply();
        await loading;
        expect(done).toBe(true);
    });

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.loadAuxiliaryData()).rejects.toThrow("MSP timeout");

        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(mspHelper.loadSerialConfig).not.toHaveBeenCalled();
    });

    it("polls RC every 50 ms and status every 250 ms, and removes both on unmount", () => {
        const { wrapper, data } = mountData();

        data.startPolling(() => {});

        expect(GUI.interval_add).toHaveBeenCalledWith("aux_data_pull", expect.any(Function), 50, false);
        expect(GUI.interval_add).toHaveBeenCalledWith("status_pull", expect.any(Function), 250, true);

        wrapper.unmount();
        expect(GUI.interval_remove).toHaveBeenCalledWith("aux_data_pull");
        expect(GUI.interval_remove).toHaveBeenCalledWith("status_pull");
    });

    it("hands each RC reply to the caller and requests status without a callback", () => {
        const onRcData = vi.fn();
        mountData().data.startPolling(onRcData);
        const ticks = new Map(vi.mocked(GUI.interval_add).mock.calls.map(([name, code]) => [name, code]));

        ticks.get("aux_data_pull")!();
        ticks.get("status_pull")!();

        expect(MSP.send_message).toHaveBeenNthCalledWith(1, MSPCodes.MSP_RC, false, false, onRcData);
        expect(MSP.send_message).toHaveBeenNthCalledWith(2, MSPCodes.MSP_STATUS);
    });
});
