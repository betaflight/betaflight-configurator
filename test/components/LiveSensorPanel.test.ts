import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LiveSensorPanel from "../../src/components/tabs/sensors/LiveSensorPanel.vue";
import * as timers from "../../src/js/timers";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { useFlightControllerStore } from "../../src/stores/fc";
import { useSensorsStore } from "../../src/stores/sensors";

const graph = vi.hoisted(() => ({
    addGyroSample: vi.fn(),
    addAccelSample: vi.fn(),
    addMagSample: vi.fn(),
    addAltitudeSample: vi.fn(),
    addSonarSample: vi.fn(),
    addPitotSample: vi.fn(),
    addDebugSample: vi.fn(),
    incrementDebugCounter: vi.fn(),
    updateScales: vi.fn(),
    setDebugScales: vi.fn(),
    updateGraphs: vi.fn(),
    initializeGraphs: vi.fn(),
}));

vi.mock("../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/composables/useSensorGraph", () => ({ useSensorGraph: () => graph }));

function mountPanel() {
    return shallowMount(LiveSensorPanel, { global: { mocks: { $t: (key: string) => key } } });
}

describe("LiveSensorPanel polling", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        localStorage.clear();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);

        const fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.47.0";
        fcStore.config.boardType = 0;
        fcStore.config.activeSensors = 0xff;
        fcStore.pidAdvancedConfig.debugMode = 1;

        const sensorsStore = useSensorsStore();
        Object.assign(sensorsStore.rates, {
            gyro: 30,
            accel: 20,
            mag: 40,
            altitude: 110,
            sonar: 120,
            pitot: 130,
            debug: 140,
        });
    });

    it("loads the motor config, then the advanced config, before polling", async () => {
        mountPanel();
        await flushPromises();

        expect(vi.mocked(MSP.promise).mock.calls).toEqual([
            [MSPCodes.MSP_MOTOR_CONFIG],
            [MSPCodes.MSP_ADVANCED_CONFIG],
        ]);
    });

    it("polls each available sensor at its own rate and feeds each reply to its graph", async () => {
        const fcStore = useFlightControllerStore();
        fcStore.sensorData.pitot = { airspeed: 3, diffPressure: 0 };
        mountPanel();
        await flushPromises();

        const added = new Map(vi.mocked(timers.addInterval).mock.calls.map(([name, , period]) => [name, period]));
        // gyro/accel/mag share the IMU pull at the fastest of their three rates
        expect(Object.fromEntries(added)).toEqual({
            IMU_pull: 20,
            altitude_pull: 110,
            sonar_pull: 120,
            pitot_pull: 130,
            debug_pull: 140,
        });

        const expectations: [string, number, ReturnType<typeof vi.fn>][] = [
            ["IMU_pull", MSPCodes.MSP_RAW_IMU, graph.addGyroSample],
            ["altitude_pull", MSPCodes.MSP_ALTITUDE, graph.addAltitudeSample],
            ["sonar_pull", MSPCodes.MSP_SONAR, graph.addSonarSample],
            ["pitot_pull", MSPCodes.MSP_PITOT, graph.addPitotSample],
            ["debug_pull", MSPCodes.MSP_DEBUG, graph.addDebugSample],
        ];
        for (const [name, code, sample] of expectations) {
            vi.mocked(MSP.send_message).mockClear();
            const tick = vi.mocked(timers.addInterval).mock.calls.find(([n]) => n === name)![1];
            tick();
            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(code, false, false, expect.any(Function));

            const onReply = vi.mocked(MSP.send_message).mock.calls[0][3] as () => void;
            expect(sample).not.toHaveBeenCalled();
            onReply();
            expect(sample).toHaveBeenCalled();
        }
    });
});
