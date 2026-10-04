import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { useServosData } from "../../../../src/composables/servos/useServosData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({ default: { interval_add: vi.fn(), interval_remove: vi.fn() } }));

type ServosData = ReturnType<typeof useServosData>;

const LOAD_ORDER = [
    MSPCodes.MSP_SERVO_CONFIGURATIONS,
    MSPCodes.MSP_SERVO_MIX_RULES,
    MSPCodes.MSP_RC,
    MSPCodes.MSP_BOXNAMES,
];

function mountData() {
    let data!: ServosData;
    const wrapper = mount(
        defineComponent({
            setup() {
                data = useServosData();
                return () => null;
            },
        }),
    );
    return { wrapper, data };
}

describe("useServosData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    it("loads servo configs, mix rules, RC and box names in that order", async () => {
        await mountData().data.loadServoConfigs();

        expect(vi.mocked(MSP.promise).mock.calls.map(([code]) => code)).toEqual(LOAD_ORDER);
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
                .data.loadServoConfigs()
                .then(() => {
                    done = true;
                });
            await flushPromises();

            expect(vi.mocked(MSP.promise).mock.calls.map(([code]) => code)).toEqual(LOAD_ORDER.slice(0, index + 1));
            expect(done).toBe(false);

            release();
            await loading;
            expect(done).toBe(true);
        },
    );

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.loadServoConfigs()).rejects.toThrow("MSP timeout");

        expect(MSP.promise).toHaveBeenCalledOnce();
    });

    it("polls servos every 50 ms and status every 250 ms, and removes both on unmount", () => {
        const { wrapper, data } = mountData();

        data.startPolling(() => {});

        expect(GUI.interval_add).toHaveBeenCalledWith("servo_data_pull", expect.any(Function), 50, false);
        expect(GUI.interval_add).toHaveBeenCalledWith("status_pull", expect.any(Function), 250, true);

        wrapper.unmount();
        expect(GUI.interval_remove).toHaveBeenCalledWith("servo_data_pull");
        expect(GUI.interval_remove).toHaveBeenCalledWith("status_pull");
    });

    it("hands each servo reply to the caller and requests status without a callback", () => {
        const onServoData = vi.fn();
        mountData().data.startPolling(onServoData);
        const ticks = new Map(vi.mocked(GUI.interval_add).mock.calls.map(([name, code]) => [name, code]));

        ticks.get("servo_data_pull")!();
        ticks.get("status_pull")!();

        expect(MSP.send_message).toHaveBeenNthCalledWith(1, MSPCodes.MSP_SERVO, false, false, onServoData);
        expect(MSP.send_message).toHaveBeenNthCalledWith(2, MSPCodes.MSP_STATUS);
    });
});
