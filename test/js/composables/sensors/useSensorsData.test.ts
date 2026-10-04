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

/** Make the request for `held` pend until the returned release is called. */
function holdRequest(held: number) {
    let release!: () => void;
    vi.mocked(MSP.promise).mockImplementation((code) =>
        code === held
            ? new Promise((resolve) => {
                  release = () => resolve(undefined);
              })
            : Promise.resolve(undefined),
    );
    return () => release();
}

describe("useSensorsData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        // a payload that identifies the code it was crunched for
        vi.mocked(mspHelper.crunch).mockImplementation((code) => [code, 0xaa]);
    });

    describe("loadSensorsConfig", () => {
        it("loads in order, with compass and gyro sensors on API 1.47+", async () => {
            await setup().data.loadSensorsConfig();

            expect(vi.mocked(MSP.promise).mock.calls).toEqual(LOAD_ALL.map((code) => [code]));
        });

        it.each([
            ["1.45", false, false, LOAD_BASE],
            ["1.46", true, false, [...LOAD_BASE, MSPCodes.MSP_COMPASS_CONFIG]],
            ["empty api version", "", "", LOAD_BASE],
        ] as const)("gates the optional requests (%s)", async (_label, api146, api147, expected) => {
            await setup(api146, api147).data.loadSensorsConfig();

            expect(sentCodes()).toEqual(expected);
        });

        it("reads the API gates when it gets to them, not when created", async () => {
            const { isApi146, isApi147, data } = setup(false, false);
            isApi146.value = true;
            isApi147.value = true;

            await data.loadSensorsConfig();

            expect(sentCodes()).toEqual(LOAD_ALL);
        });

        it.each(LOAD_ALL.map((code, index) => [index, code]))(
            "holds back everything after request %i until its reply lands",
            async (index, held) => {
                const release = holdRequest(held);
                let done = false;

                const loading = setup()
                    .data.loadSensorsConfig()
                    .then(() => {
                        done = true;
                    });
                await flushPromises();
                expect(sentCodes()).toEqual(LOAD_ALL.slice(0, index + 1));
                expect(done).toBe(false);

                release();
                await loading;
                expect(sentCodes()).toEqual(LOAD_ALL);
            },
        );

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

        it.each(SEND_ALL.map((code, index) => [index, code]))(
            "holds back everything after write %i until it is acknowledged",
            async (index, held) => {
                const release = holdRequest(held);
                let done = false;

                const sending = setup()
                    .data.sendSensorsConfig()
                    .then(() => {
                        done = true;
                    });
                await flushPromises();
                expect(sentCodes()).toEqual(SEND_ALL.slice(0, index + 1));
                expect(done).toBe(false);

                release();
                await sending;
                expect(sentCodes()).toEqual(SEND_ALL);
            },
        );

        it("stops at the first failed write", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("refused"));

            await expect(setup().data.sendSensorsConfig()).rejects.toThrow("refused");
            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    describe("loadGpsData", () => {
        it("requests the GPS data and waits for the reply", async () => {
            const release = holdRequest(MSPCodes.MSP_RAW_GPS);
            let done = false;

            const loading = setup()
                .data.loadGpsData()
                .then(() => {
                    done = true;
                });
            await flushPromises();
            expect(vi.mocked(MSP.promise).mock.calls).toEqual([[MSPCodes.MSP_RAW_GPS]]);
            expect(done).toBe(false);

            release();
            await loading;
            expect(done).toBe(true);
        });

        it("passes a failure on, for the caller's fallback", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("no GPS"));

            await expect(setup().data.loadGpsData()).rejects.toThrow("no GPS");
        });
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
        expect(MSP.promise).not.toHaveBeenCalled();
    });
});
