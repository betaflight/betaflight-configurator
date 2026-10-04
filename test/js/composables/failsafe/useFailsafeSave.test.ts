import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useFailsafeSave } from "../../../../src/composables/failsafe/useFailsafeSave";

const saveAndReboot = vi.fn();

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn(), sendRxFailConfig: vi.fn() } }));
vi.mock("../../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
vi.mock("../../../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

const SEND_ORDER = [
    MSPCodes.MSP_SET_RX_CONFIG,
    MSPCodes.MSP_SET_FAILSAFE_CONFIG,
    "rxfail",
    MSPCodes.MSP_SET_FEATURE_CONFIG,
    MSPCodes.MSP_SET_GPS_RESCUE,
];

describe("useFailsafeSave", () => {
    let steps: Array<string | number>;
    let initializeDefaults: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        // reset, not clear: a failure stubbed in one test must not leak into the next
        vi.resetAllMocks();
        setActivePinia(createPinia());
        useFlightControllerStore().config.apiVersion = "1.41.0";
        steps = [];
        vi.mocked(mspHelper.crunch).mockImplementation((code) => [code, 0xaa]);
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            steps.push(code ?? "no code");
        });
        vi.mocked(mspHelper.sendRxFailConfig).mockImplementation((callback) => {
            steps.push("rxfail");
            callback();
        });
        initializeDefaults = vi.fn(() => {
            steps.push("defaults");
        });
        saveAndReboot.mockImplementation(async () => {
            steps.push("reboot");
        });
    });

    const save = () => useFailsafeSave(initializeDefaults).saveConfig();

    it("sends every section with its crunched payload, then resets the baseline, then reboots", async () => {
        await save();

        expect(steps).toEqual([...SEND_ORDER, "defaults", "reboot"]);
        for (const code of SEND_ORDER.filter((step) => step !== "rxfail")) {
            expect(MSP.promise).toHaveBeenCalledWith(code, [code, 0xaa]);
            expect(mspHelper.crunch).toHaveBeenCalledWith(code);
        }
    });

    it("skips GPS Rescue before API 1.41", async () => {
        useFlightControllerStore().config.apiVersion = "1.40.0";

        await save();

        expect(steps).toEqual([
            ...SEND_ORDER.filter((step) => step !== MSPCodes.MSP_SET_GPS_RESCUE),
            "defaults",
            "reboot",
        ]);
    });

    it.each(SEND_ORDER.map((step, index) => [index, step]))(
        "holds back everything after write %i until it is acknowledged",
        async (index, held) => {
            let release!: () => void;
            if (held === "rxfail") {
                vi.mocked(mspHelper.sendRxFailConfig).mockImplementation((callback) => {
                    steps.push("rxfail");
                    release = callback;
                });
            } else {
                vi.mocked(MSP.promise).mockImplementation((code) => {
                    steps.push(code ?? "no code");
                    return code === held
                        ? new Promise((resolve) => {
                              release = () => resolve(undefined);
                          })
                        : Promise.resolve(undefined);
                });
            }

            const saving = save();
            await flushPromises();

            expect(steps).toEqual(SEND_ORDER.slice(0, index + 1));

            release();
            await saving;
            expect(steps).toEqual([...SEND_ORDER, "defaults", "reboot"]);
        },
    );

    it("stays saving until the save-and-reboot settles", async () => {
        let rebooted!: () => void;
        saveAndReboot.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    rebooted = resolve;
                }),
        );
        const { saveConfig, isSaving } = useFailsafeSave(initializeDefaults);

        const saving = saveConfig();
        await flushPromises();
        expect(isSaving.value).toBe(true);

        rebooted();
        await saving;
        expect(isSaving.value).toBe(false);
    });

    it("leaves the baseline alone and does not reboot when a write fails", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const { saveConfig, isSaving } = useFailsafeSave(initializeDefaults);

        await saveConfig();

        expect(initializeDefaults).not.toHaveBeenCalled();
        expect(saveAndReboot).not.toHaveBeenCalled();
        expect(isSaving.value).toBe(false);
    });
});
