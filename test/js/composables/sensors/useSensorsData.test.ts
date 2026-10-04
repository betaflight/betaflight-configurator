import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useSensorsData } from "../../../../src/composables/sensors/useSensorsData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));

const LOAD_BASE = [
    MSPCodes.MSP_SENSOR_CONFIG,
    MSPCodes.MSP_SENSOR_ALIGNMENT,
    MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG,
    MSPCodes.MSP_ACC_TRIM,
    MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE,
    MSPCodes.MSP_MIXER_CONFIG,
    MSPCodes.MSP_MOTOR_CONFIG,
];
const LOAD_ALL = [...LOAD_BASE, MSPCodes.MSP_COMPASS_CONFIG, MSPCodes.MSP2_GYRO_SENSOR];

const SEND_BASE = [
    MSPCodes.MSP_SET_SENSOR_CONFIG,
    MSPCodes.MSP_SET_SENSOR_ALIGNMENT,
    MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG,
    MSPCodes.MSP_SET_ACC_TRIM,
];
const SEND_ALL = [...SEND_BASE, MSPCodes.MSP_SET_COMPASS_CONFIG];

function sentCodes() {
    return vi.mocked(MSP.promise).mock.calls.map(([code]) => code);
}

function setup(api146: string | boolean | undefined = true, api147: string | boolean | undefined = true) {
    const isApi146 = ref(api146);
    const isApi147 = ref(api147);
    return { isApi146, isApi147, data: useSensorsData(isApi146, isApi147) };
}

describe("useSensorsData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        // a payload that identifies the code it was crunched for
        vi.mocked(mspHelper.crunch).mockImplementation((code) => [code, 0xaa]);
    });

    describe("loadSensorsConfig", () => {
        it.each([
            ["1.47", true, true, LOAD_ALL],
            ["1.46", true, false, [...LOAD_BASE, MSPCodes.MSP_COMPASS_CONFIG]],
            ["1.45", false, false, LOAD_BASE],
            ["empty api version", "", "", LOAD_BASE],
        ] as const)("loads in order, gating the optional requests (%s)", async (_label, api146, api147, expected) => {
            await setup(api146, api147).data.loadSensorsConfig();

            expect(vi.mocked(MSP.promise).mock.calls).toEqual(expected.map((code) => [code]));
        });

        it("reads the API gates when it gets to them, not when created", async () => {
            const { isApi146, isApi147, data } = setup(false, false);
            isApi146.value = true;
            isApi147.value = true;

            await data.loadSensorsConfig();

            expect(sentCodes()).toEqual(LOAD_ALL);
        });

        it("stops at the first failed request", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(setup().data.loadSensorsConfig()).rejects.toThrow("MSP timeout");
            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    describe("sendSensorsConfig", () => {
        it("sends each config with its own crunched payload, in order", async () => {
            await setup().data.sendSensorsConfig();

            expect(vi.mocked(MSP.promise).mock.calls).toEqual(SEND_ALL.map((code) => [code, [code, 0xaa]]));
        });

        it("skips the compass config before API 1.46, checked at send time", async () => {
            const { isApi146, data } = setup(true);
            isApi146.value = false;

            await data.sendSensorsConfig();

            expect(sentCodes()).toEqual(SEND_BASE);
        });

        it("does not finish until the last write is acknowledged, so the caller persists after it", async () => {
            let release!: () => void;
            vi.mocked(MSP.promise).mockImplementation((code) =>
                code === MSPCodes.MSP_SET_COMPASS_CONFIG
                    ? new Promise((resolve) => {
                          release = () => resolve(undefined);
                      })
                    : Promise.resolve(undefined),
            );
            let done = false;

            const sending = setup()
                .data.sendSensorsConfig()
                .then(() => {
                    done = true;
                });
            await flushPromises();
            expect(done).toBe(false);

            release();
            await sending;
            expect(done).toBe(true);
        });

        it("stops at the first failed write", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("refused"));

            await expect(setup().data.sendSensorsConfig()).rejects.toThrow("refused");
            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    it("loadGpsData requests the GPS data and passes a failure on, for the caller's fallback", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("no GPS"));

        await expect(setup().data.loadGpsData()).rejects.toThrow("no GPS");
        expect(vi.mocked(MSP.promise).mock.calls).toEqual([[MSPCodes.MSP_RAW_GPS]]);
    });

    it.each([
        ["startAccCalibration", MSPCodes.MSP_ACC_CALIBRATION],
        ["loadBoardInfo", MSPCodes.MSP_BOARD_INFO],
        ["requestAttitude", MSPCodes.MSP_ATTITUDE],
        ["requestAltitude", MSPCodes.MSP_ALTITUDE],
        ["requestAttitudeQuaternion", MSPCodes.MSP_ATTITUDE_QUATERNION],
    ] as const)("%s sends its request with the caller's reply callback", (fn, code) => {
        const onReply = vi.fn();

        setup().data[fn](onReply);

        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(code, false, false, onReply);
    });
});
