import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import MSP, { type MspCallback } from "../../../../src/js/msp";
import MSPCodes, { MSP2TextType } from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { MspCancelledError, MspTimeoutError } from "../../../../src/js/msp/mspErrors";
import GUI from "../../../../src/js/gui";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import {
    SdcardState,
    isMspCancelled,
    useOnboardLoggingData,
} from "../../../../src/composables/onboardLogging/useOnboardLoggingData";

vi.mock("../../../../src/js/msp", () => ({
    default: {
        promise: vi.fn(),
        send_message: vi.fn(),
        SDCARD_STATE_NOT_PRESENT: 0,
        SDCARD_STATE_FATAL: 1,
        SDCARD_STATE_CARD_INIT: 2,
        SDCARD_STATE_FS_INIT: 3,
        SDCARD_STATE_READY: 4,
    },
}));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: vi.fn(), dataflashRead: vi.fn(), REBOOT_TYPES: { MSC: 2, MSC_UTC: 3 } },
}));
vi.mock("../../../../src/js/gui", () => ({ default: { operating_system: "Windows" } }));

const BASE_LOAD = [
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_DATAFLASH_SUMMARY,
    MSPCodes.MSP_SDCARD_SUMMARY,
    MSPCodes.MSP_BLACKBOX_CONFIG,
    MSPCodes.MSP_ADVANCED_CONFIG,
    MSPCodes.MSP_SENSOR_CONFIG,
];

const sentCodes = () => vi.mocked(MSP.promise).mock.calls.map(([code]) => code);

describe("useOnboardLoggingData", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(MSP.send_message).mockReturnValue(true);
        vi.mocked(mspHelper.crunch).mockImplementation((code, modifier) => [code, modifier ?? -1]);
        GUI.operating_system = "Windows";
    });

    describe("loadOnboardLoggingData", () => {
        it.each([
            ["1.44.0", [MSPCodes.MSP_NAME]],
            ["1.45.0", [MSPCodes.MSP2_GET_TEXT]],
            ["1.46.0", [MSPCodes.MSP2_GET_TEXT]],
            ["1.47.0", [MSPCodes.MSP2_GET_TEXT, MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE]],
        ])("on API %s loads the base set, then %j", async (apiVersion, tail) => {
            fcStore.config.apiVersion = apiVersion;

            await useOnboardLoggingData().loadOnboardLoggingData();

            expect(sentCodes()).toEqual([...BASE_LOAD, ...tail]);
        });

        it("falls back to MSP_NAME when the API version is not known yet", async () => {
            fcStore.config.apiVersion = "";

            await useOnboardLoggingData().loadOnboardLoggingData();

            expect(sentCodes()).toEqual([...BASE_LOAD, MSPCodes.MSP_NAME]);
        });

        it("asks for the craft name text with its own payload", async () => {
            fcStore.config.apiVersion = "1.45.0";

            await useOnboardLoggingData().loadOnboardLoggingData();

            expect(mspHelper.crunch).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP2_GET_TEXT, MSP2TextType.CRAFT_NAME);
            expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP2_GET_TEXT, [
                MSPCodes.MSP2_GET_TEXT,
                MSP2TextType.CRAFT_NAME,
            ]);
        });

        const FULL_LOAD = [...BASE_LOAD, MSPCodes.MSP2_GET_TEXT, MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE];

        it.each(FULL_LOAD.map((code, index) => [index, code]))(
            "holds back everything after request %i until its reply lands",
            async (index, held) => {
                fcStore.config.apiVersion = "1.47.0";
                let release!: () => void;
                vi.mocked(MSP.promise).mockImplementation((code) =>
                    code === held
                        ? new Promise((resolve) => {
                              release = () => resolve(undefined);
                          })
                        : Promise.resolve(undefined),
                );
                let done = false;

                const loading = useOnboardLoggingData()
                    .loadOnboardLoggingData()
                    .then(() => {
                        done = true;
                    });
                await flushPromises();

                expect(sentCodes()).toEqual(FULL_LOAD.slice(0, index + 1));
                expect(done).toBe(false);

                release();
                await loading;
                expect(sentCodes()).toEqual(FULL_LOAD);
            },
        );

        it("holds back the finish until the MSP_NAME reply lands on older firmware", async () => {
            fcStore.config.apiVersion = "1.44.0";
            let release!: () => void;
            vi.mocked(MSP.promise).mockImplementation((code) =>
                code === MSPCodes.MSP_NAME
                    ? new Promise((resolve) => {
                          release = () => resolve(undefined);
                      })
                    : Promise.resolve(undefined),
            );
            let done = false;

            const loading = useOnboardLoggingData()
                .loadOnboardLoggingData()
                .then(() => {
                    done = true;
                });
            await flushPromises();
            expect(done).toBe(false);

            release();
            await loading;
            expect(done).toBe(true);
        });

        it("stops at the first failed request", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(useOnboardLoggingData().loadOnboardLoggingData()).rejects.toThrow("MSP timeout");
            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    describe("summaries", () => {
        it("requests the dataflash summary and calls back only once the reply lands", () => {
            const onDone = vi.fn();

            useOnboardLoggingData().requestDataflashSummary(onDone);

            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(
                MSPCodes.MSP_DATAFLASH_SUMMARY,
                false,
                false,
                expect.any(Function),
            );
            expect(onDone).not.toHaveBeenCalled();
            (vi.mocked(MSP.send_message).mock.calls[0][3] as MspCallback)(null);
            expect(onDone).toHaveBeenCalledOnce();
        });

        it("tolerates a dataflash summary reply with no callback", () => {
            useOnboardLoggingData().requestDataflashSummary();

            expect(() => (vi.mocked(MSP.send_message).mock.calls[0][3] as MspCallback)(null)).not.toThrow();
        });

        it("requests the SD card summary with the caller's reply handler", () => {
            const onReply = vi.fn();

            useOnboardLoggingData().requestSdcardSummary(onReply);

            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(
                MSPCodes.MSP_SDCARD_SUMMARY,
                false,
                false,
                onReply,
            );
        });
    });

    it("reads a dataflash block with the caller's address, size and handler", () => {
        const onChunkRead = vi.fn();

        useOnboardLoggingData().readDataflash(8192, 1024, onChunkRead);

        expect(mspHelper.dataflashRead).toHaveBeenCalledExactlyOnceWith(8192, 1024, onChunkRead);
    });

    describe("rebootToMassStorage", () => {
        it.each([
            ["Linux", 3],
            ["Windows", 2],
            ["MacOS", 2],
            ["ChromeOS", 2],
        ])("on %s reboots with type %i and no reply handler", (os, rebootType) => {
            GUI.operating_system = os;

            useOnboardLoggingData().rebootToMassStorage();

            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_SET_REBOOT, [rebootType], false);
        });
    });

    it("tells a cancelled read from a failed one", () => {
        expect(isMspCancelled(new MspCancelledError("cancelled", MSPCodes.MSP_DATAFLASH_READ, "cleanup"))).toBe(true);
        expect(isMspCancelled(new MspTimeoutError("timeout", MSPCodes.MSP_DATAFLASH_READ))).toBe(false);
    });

    it("exposes the FC's SD card states", () => {
        expect(SdcardState).toEqual({ NOT_PRESENT: 0, FATAL: 1, CARD_INIT: 2, FS_INIT: 3, READY: 4 });
    });
});
