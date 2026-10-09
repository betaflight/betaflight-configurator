import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import * as timers from "../../../../src/js/timers";
import { useLiveSensorData, type LiveSensorPull } from "../../../../src/composables/sensors/useLiveSensorData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));

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

const PULLS: [LiveSensorPull, number][] = [
    ["imu", MSPCodes.MSP_RAW_IMU],
    ["altitude", MSPCodes.MSP_ALTITUDE],
    ["sonar", MSPCodes.MSP_SONAR],
    ["pitot", MSPCodes.MSP_PITOT],
    ["debug", MSPCodes.MSP_DEBUG],
];

/** Start every stream; returns the interval name each one registered under. */
function startAll(data: LiveSensorData) {
    const names = new Map<LiveSensorPull, string>();
    for (const [sensor] of PULLS) {
        data.startPolling(sensor, 50, () => {});
        names.set(sensor, vi.mocked(timers.addInterval).mock.lastCall![0]);
    }
    return names;
}

const removed = () => vi.mocked(timers.removeInterval).mock.calls.map(([name]) => name);

describe("useLiveSensorData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it.each([
        ["loadMotorConfig", MSPCodes.MSP_MOTOR_CONFIG],
        ["loadAdvancedConfig", MSPCodes.MSP_ADVANCED_CONFIG],
    ] as const)("%s requests its config and passes a failure on", async (fn, code) => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(mountData().data[fn]()).rejects.toThrow("MSP timeout");
        expect(MSP.promise).toHaveBeenCalledExactlyOnceWith(code);
    });

    it.each(PULLS)(
        "polls %s at the given period, first request immediately, with the caller's callback",
        (sensor, code) => {
            const onReply = vi.fn();
            mountData().data.startPolling(sensor, 123, onReply);

            expect(timers.addInterval).toHaveBeenCalledExactlyOnceWith(
                expect.any(String),
                expect.any(Function),
                123,
                true,
            );

            const tick = vi.mocked(timers.addInterval).mock.calls[0][1];
            tick();
            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(code, false, false, onReply);
        },
    );

    it("stops every stream except pitot, which keeps running until unmount", () => {
        const { wrapper, data } = mountData();
        const names = startAll(data);
        expect(new Set(names.values()).size).toBe(PULLS.length); // one interval per stream
        const allButPitot = PULLS.filter(([sensor]) => sensor !== "pitot").map(([sensor]) => names.get(sensor));

        data.stopPolling();
        expect(removed()).toEqual(allButPitot);

        vi.mocked(timers.removeInterval).mockClear();
        wrapper.unmount();
        expect(removed()).toEqual([names.get("pitot")]);
    });
});
