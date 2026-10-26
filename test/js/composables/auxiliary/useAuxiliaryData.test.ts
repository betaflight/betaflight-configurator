import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import * as timers from "../../../../src/js/timers";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useAuxiliaryData } from "../../../../src/composables/auxiliary/useAuxiliaryData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { loadSerialConfig: vi.fn() } }));
vi.mock("../../../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));

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

    it("does not finish until the serial config callback fires", async () => {
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

    it("polls RC every 50 ms (to the caller's callback) and status every 250 ms, and removes both on unmount", () => {
        const onRcData = vi.fn();
        const { wrapper, data } = mountData();

        data.startPolling(onRcData);
        const [[rcName, rcTick, ...rcTiming], [statusName, statusTick, ...statusTiming]] = vi.mocked(timers.addInterval)
            .mock.calls;
        expect([rcTiming, statusTiming]).toEqual([
            [50, false],
            [250, true],
        ]);

        rcTick();
        statusTick();
        expect(MSP.send_message).toHaveBeenNthCalledWith(1, MSPCodes.MSP_RC, false, false, onRcData);
        expect(MSP.send_message).toHaveBeenNthCalledWith(2, MSPCodes.MSP_STATUS);

        wrapper.unmount();
        expect(
            vi
                .mocked(timers.removeInterval)
                .mock.calls.map(([name]) => name)
                .sort(),
        ).toEqual([rcName, statusName].sort());
    });
});
