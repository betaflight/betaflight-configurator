import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useGpsSave } from "../../../../src/composables/gps/useGpsSave";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));

describe("useGpsSave", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(mspHelper.crunch).mockImplementation((code) => [code]);
    });

    it("sends the feature config, then the GPS config, each with its own payload", async () => {
        await useGpsSave().sendGpsConfig();

        expect(vi.mocked(MSP.promise).mock.calls).toEqual([
            [MSPCodes.MSP_SET_FEATURE_CONFIG, [MSPCodes.MSP_SET_FEATURE_CONFIG]],
            [MSPCodes.MSP_SET_GPS_CONFIG, [MSPCodes.MSP_SET_GPS_CONFIG]],
        ]);
    });

    it("builds and sends the GPS config only after the feature config reply lands", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(undefined);
                }),
        );

        const saving = useGpsSave().sendGpsConfig();
        await flushPromises();
        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(mspHelper.crunch).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_SET_FEATURE_CONFIG);

        release();
        await saving;
        expect(MSP.promise).toHaveBeenCalledTimes(2);
    });

    it("does not finish until the GPS config reply lands", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise)
            .mockResolvedValueOnce(undefined)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        release = () => resolve(undefined);
                    }),
            );
        let done = false;

        const saving = useGpsSave()
            .sendGpsConfig()
            .then(() => {
                done = true;
            });
        await flushPromises();
        expect(done).toBe(false);

        release();
        await saving;
        expect(done).toBe(true);
    });

    it("skips the GPS config when the feature config write fails", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP error"));

        await expect(useGpsSave().sendGpsConfig()).rejects.toThrow("MSP error");
        expect(MSP.promise).toHaveBeenCalledOnce();
    });
});
