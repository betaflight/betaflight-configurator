import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { MspCancelledError } from "../../../../src/js/msp/mspErrors";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useSetupData } from "../../../../src/composables/setup/useSetupData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({
    mspHelper: { REBOOT_TYPES: { BOOTLOADER: 101, BOOTLOADER_FLASH: 102 } },
}));

const LOAD_ORDER = [
    MSPCodes.MSP_ACC_TRIM,
    MSPCodes.MSP_STATUS_EX,
    MSPCodes.MSP2_MCU_INFO,
    MSPCodes.MSP_MIXER_CONFIG,
    MSPCodes.MSP_MOTOR_CONFIG,
    MSPCodes.MSP_SENSOR_ALIGNMENT,
    MSPCodes.MSP_ADVANCED_CONFIG,
];

describe("useSetupData", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    describe("loadSetupData", () => {
        it("requests everything in order, each without a payload", async () => {
            await expect(useSetupData().loadSetupData()).resolves.toBe(true);

            expect(vi.mocked(MSP.promise).mock.calls).toEqual(LOAD_ORDER.map((code) => [code, false]));
            expect(warn).not.toHaveBeenCalled();
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
                let done = false;

                const loading = useSetupData()
                    .loadSetupData()
                    .then(() => {
                        done = true;
                    });
                await flushPromises();

                expect(vi.mocked(MSP.promise).mock.calls.map(([code]) => code)).toEqual(LOAD_ORDER.slice(0, index + 1));
                expect(done).toBe(false);

                release();
                await loading;
                expect(MSP.promise).toHaveBeenCalledTimes(LOAD_ORDER.length);
            },
        );

        it("on a failed request skips the rest, warns, and still lets the tab render", async () => {
            const failure = new Error("MSP timeout");
            vi.mocked(MSP.promise).mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);

            await expect(useSetupData().loadSetupData()).resolves.toBe(true);

            expect(MSP.promise).toHaveBeenCalledTimes(2);
            expect(warn).toHaveBeenCalledWith("Error during Setup initialize sequence:", failure);
        });

        it("reports a cancelled load quietly so the tab does not render", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new MspCancelledError("cancelled", MSPCodes.MSP_ACC_TRIM));

            await expect(useSetupData().loadSetupData()).resolves.toBe(false);

            expect(MSP.promise).toHaveBeenCalledOnce();
            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe("commands", () => {
        it.each([
            [true, 102],
            [false, 101],
        ])("reboots to the bootloader (flash bootloader: %s)", (hasFlash, rebootType) => {
            vi.spyOn(fcStore, "boardHasFlashBootloader").mockReturnValue(hasFlash);

            useSetupData().rebootToBootloader();

            expect(MSP.send_message).toHaveBeenCalledOnce();
            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, [rebootType], false);
        });

        it("resets the settings and hands the acknowledgement to the caller", () => {
            const onReset = vi.fn();

            useSetupData().resetSettings(onReset);

            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_RESET_CONF, false, false, onReset);
        });

        it.each([
            ["requestAttitude", MSPCodes.MSP_ATTITUDE],
            ["requestSonar", MSPCodes.MSP_SONAR],
        ] as const)("%s hands the reply to the caller", (name, code) => {
            const onData = vi.fn();

            useSetupData()[name](onData);

            expect(MSP.send_message).toHaveBeenCalledOnce();
            expect(MSP.send_message).toHaveBeenCalledWith(code, false, false, onData);
        });
    });
});
