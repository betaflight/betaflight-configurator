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

    it("loads in order and snapshots right after the advanced config, before the filter config", async () => {
        const order: string[] = [];
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            order.push(String(code));
        });

        await useMotorsData().loadMotorsData(() => order.push("snapshot"));

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
            const onAdvancedConfig = vi.fn();

            const loading = useMotorsData().loadMotorsData(onAdvancedConfig);
            await flushPromises();

            expect(requested()).toEqual(LOAD_ORDER.slice(0, index + 1));
            const snapshotted = index > LOAD_ORDER.indexOf(MSPCodes.MSP_ADVANCED_CONFIG);
            expect(onAdvancedConfig).toHaveBeenCalledTimes(snapshotted ? 1 : 0);

            release();
            await loading;
            expect(requested()).toEqual(LOAD_ORDER);
            expect(onAdvancedConfig).toHaveBeenCalledOnce();
        },
    );

    it("does not finish until the last reply lands", async () => {
        let reply!: () => void;
        vi.mocked(MSP.promise).mockImplementation((code) =>
            code === MSPCodes.MSP_ARMING_CONFIG
                ? new Promise((resolve) => {
                      reply = () => resolve(undefined);
                  })
                : Promise.resolve(undefined),
        );
        let done = false;

        const loading = useMotorsData()
            .loadMotorsData(() => {})
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
