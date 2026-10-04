import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import GUI from "../../../../src/js/gui";
import { useLiveSensorData, type LiveSensorPull } from "../../../../src/composables/sensors/useLiveSensorData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/gui", () => ({ default: { interval_add: vi.fn(), interval_remove: vi.fn() } }));

type LiveSensorData = ReturnType<typeof useLiveSensorData>;

function mountData() {
    let data!: LiveSensorData;
    const wrapper = mount(
        defineComponent({
            setup() {
                data = useLiveSensorData();
                return () => null;
            },
        }),
    );
    return { wrapper, data };
}

const PULLS: [LiveSensorPull, string, number][] = [
    ["imu", "IMU_pull", MSPCodes.MSP_RAW_IMU],
    ["altitude", "altitude_pull", MSPCodes.MSP_ALTITUDE],
    ["sonar", "sonar_pull", MSPCodes.MSP_SONAR],
    ["pitot", "pitot_pull", MSPCodes.MSP_PITOT],
    ["debug", "debug_pull", MSPCodes.MSP_DEBUG],
];

describe("useLiveSensorData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    it.each([
        ["loadMotorConfig", MSPCodes.MSP_MOTOR_CONFIG],
        ["loadAdvancedConfig", MSPCodes.MSP_ADVANCED_CONFIG],
    ] as const)("%s requests its config and does not finish until the reply lands", async (fn, code) => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementation(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(undefined);
                }),
        );
        let done = false;

        const loading = mountData()
            .data[fn]()
            .then(() => {
                done = true;
            });
        await flushPromises();
        expect(MSP.promise).toHaveBeenCalledExactlyOnceWith(code);
        expect(done).toBe(false);

        release();
        await loading;
        expect(done).toBe(true);
    });

    it("passes a failed config request on to the caller", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data.loadMotorConfig()).rejects.toThrow("MSP timeout");
    });

    it.each(PULLS)("polls %s as %s at the given period, first request immediately", (sensor, name, code) => {
        const onReply = vi.fn();
        mountData().data.startPolling(sensor, 123, onReply);

        expect(GUI.interval_add).toHaveBeenCalledExactlyOnceWith(name, expect.any(Function), 123, true);

        const tick = vi.mocked(GUI.interval_add).mock.calls[0][1];
        tick();
        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(code, false, false, onReply);
    });

    it("stops every stream except pitot", () => {
        mountData().data.stopPolling();

        expect(vi.mocked(GUI.interval_remove).mock.calls.map(([name]) => name)).toEqual([
            "IMU_pull",
            "altitude_pull",
            "sonar_pull",
            "debug_pull",
        ]);
    });

    it("removes every running stream, pitot included, on unmount", () => {
        const { wrapper, data } = mountData();
        for (const [sensor] of PULLS) {
            data.startPolling(sensor, 50, () => {});
        }

        wrapper.unmount();

        expect(vi.mocked(GUI.interval_remove).mock.calls.map(([name]) => name)).toEqual(PULLS.map(([, name]) => name));
    });
});
