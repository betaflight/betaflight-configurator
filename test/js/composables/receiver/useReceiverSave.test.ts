import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useReceiverSave } from "../../../../src/composables/receiver/useReceiverSave";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));

const SETTINGS_ORDER = [
    MSPCodes.MSP_SET_RX_MAP,
    MSPCodes.MSP_SET_RSSI_CONFIG,
    MSPCodes.MSP_SET_RC_DEADBAND,
    MSPCodes.MSP_SET_RX_CONFIG,
];

const sent = () => vi.mocked(MSP.promise).mock.calls.map(([code]) => code);

describe("useReceiverSave", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(mspHelper.crunch).mockImplementation((code) => [code, 0xaa]);
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    it("sends the receiver settings in order, each with its own crunched payload", async () => {
        await useReceiverSave().sendReceiverSettings();

        expect(sent()).toEqual(SETTINGS_ORDER);
        for (const code of SETTINGS_ORDER) {
            expect(MSP.promise).toHaveBeenCalledWith(code, [code, 0xaa]);
        }
    });

    it.each(SETTINGS_ORDER.map((code, index) => [index, code]))(
        "holds back everything after write %i until it is acknowledged",
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

            const sending = useReceiverSave()
                .sendReceiverSettings()
                .then(() => {
                    done = true;
                });
            await flushPromises();

            expect(sent()).toEqual(SETTINGS_ORDER.slice(0, index + 1));
            expect(done).toBe(false);

            release();
            await sending;
            expect(sent()).toEqual(SETTINGS_ORDER);
        },
    );

    it("stops at the first failed write", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(useReceiverSave().sendReceiverSettings()).rejects.toThrow("MSP timeout");

        expect(MSP.promise).toHaveBeenCalledOnce();
    });

    it("sends the feature mask with its crunched payload and waits for the ack", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementation(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(undefined);
                }),
        );
        let done = false;

        const sending = useReceiverSave()
            .sendFeatureConfig()
            .then(() => {
                done = true;
            });
        await flushPromises();

        expect(MSP.promise).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_SET_FEATURE_CONFIG, [
            MSPCodes.MSP_SET_FEATURE_CONFIG,
            0xaa,
        ]);
        expect(done).toBe(false);

        release();
        await sending;
        expect(done).toBe(true);
    });
});
