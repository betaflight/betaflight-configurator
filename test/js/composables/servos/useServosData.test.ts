import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import * as timers from "../../../../src/js/timers";
import { useServosData } from "../../../../src/composables/servos/useServosData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));

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

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.loadServoConfigs()).rejects.toThrow("MSP timeout");

        expect(MSP.promise).toHaveBeenCalledOnce();
    });

    it("polls servos every 50 ms (to the caller's callback) and status every 250 ms, and removes both on unmount", () => {
        const onServoData = vi.fn();
        const { wrapper, data } = mountData();

        data.startPolling(onServoData);
        const [[servoName, servoTick, ...servoTiming], [statusName, statusTick, ...statusTiming]] = vi.mocked(
            timers.addInterval,
        ).mock.calls;
        expect([servoTiming, statusTiming]).toEqual([
            [50, false],
            [250, true],
        ]);

        servoTick();
        statusTick();
        expect(MSP.send_message).toHaveBeenNthCalledWith(1, MSPCodes.MSP_SERVO, false, false, onServoData);
        expect(MSP.send_message).toHaveBeenNthCalledWith(2, MSPCodes.MSP_STATUS);

        wrapper.unmount();
        expect(
            vi
                .mocked(timers.removeInterval)
                .mock.calls.map(([name]) => name)
                .sort(),
        ).toEqual([servoName, statusName].sort());
    });
});
