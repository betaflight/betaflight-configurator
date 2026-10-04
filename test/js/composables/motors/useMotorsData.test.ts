import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useMotorsData } from "../../../../src/composables/motors/useMotorsData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));

const BEFORE_TELEMETRY = [
    MSPCodes.MSP_PID_ADVANCED,
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_MIXER_CONFIG,
    MSPCodes.MSP_MOTOR_CONFIG,
];
const AFTER_TELEMETRY = [
    MSPCodes.MSP_MOTOR_3D_CONFIG,
    MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING,
    MSPCodes.MSP_ADVANCED_CONFIG,
];
const AFTER_SNAPSHOT = [MSPCodes.MSP_FILTER_CONFIG, MSPCodes.MSP_ARMING_CONFIG];
const LOAD_ORDER = [...BEFORE_TELEMETRY, MSPCodes.MSP_MOTOR_TELEMETRY, ...AFTER_TELEMETRY, ...AFTER_SNAPSHOT];

describe("useMotorsData", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.motorConfig.use_dshot_telemetry = true;
        fcStore.motorConfig.use_esc_sensor = false;
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    const requested = () => vi.mocked(MSP.promise).mock.calls.map(([code]) => code);

    it("loads in order and snapshots once the advanced config reply lands, before the filter config", async () => {
        const order: string[] = [];
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementation((code) => {
            order.push(String(code));
            return code === MSPCodes.MSP_ADVANCED_CONFIG
                ? new Promise((resolve) => (release = () => resolve(undefined)))
                : Promise.resolve(undefined);
        });

        const loading = useMotorsData().loadMotorsData(() => order.push("snapshot"));
        await flushPromises();
        expect(order).not.toContain("snapshot");

        release();
        await loading;
        expect(order).toEqual([
            ...[...BEFORE_TELEMETRY, MSPCodes.MSP_MOTOR_TELEMETRY, ...AFTER_TELEMETRY].map(String),
            "snapshot",
            ...AFTER_SNAPSHOT.map(String),
        ]);
    });

    it.each([
        [true, false],
        [false, true],
    ])("requests telemetry when dshot telemetry is %s and the ESC sensor is %s", async (dshot, escSensor) => {
        fcStore.motorConfig.use_dshot_telemetry = dshot;
        fcStore.motorConfig.use_esc_sensor = escSensor;

        await useMotorsData().loadMotorsData(() => {});

        expect(requested()).toEqual(LOAD_ORDER);
    });

    it("skips telemetry when neither is enabled, deciding on the motor config reply", async () => {
        fcStore.motorConfig.use_dshot_telemetry = true;
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP_MOTOR_CONFIG) {
                fcStore.motorConfig.use_dshot_telemetry = false;
            }
        });

        await useMotorsData().loadMotorsData(() => {});

        expect(requested()).toEqual([...BEFORE_TELEMETRY, ...AFTER_TELEMETRY, ...AFTER_SNAPSHOT]);
    });

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));
        const onAdvancedConfig = vi.fn();

        await expect(useMotorsData().loadMotorsData(onAdvancedConfig)).rejects.toThrow("MSP timeout");

        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(onAdvancedConfig).not.toHaveBeenCalled();
    });

    it("requests one IMU sample and hands the reply to the caller", () => {
        const onData = vi.fn();

        useMotorsData().requestRawImu(onData);

        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_RAW_IMU, false, false, onData);
    });
});
