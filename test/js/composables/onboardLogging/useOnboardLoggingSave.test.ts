import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useOnboardLoggingSave } from "../../../../src/composables/onboardLogging/useOnboardLoggingSave";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));

describe("useOnboardLoggingSave", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.pidAdvancedConfig.debugMode = 0;
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        // The payload records the debug mode the store held when it was built.
        vi.mocked(mspHelper.crunch).mockImplementation((code) => [code, fcStore.pidAdvancedConfig.debugMode]);
    });

    it("sends the blackbox config, then the advanced config built with the new debug mode", async () => {
        await useOnboardLoggingSave().sendLoggingConfig(ref(7));

        expect(vi.mocked(MSP.promise).mock.calls).toEqual([
            [MSPCodes.MSP_SET_BLACKBOX_CONFIG, [MSPCodes.MSP_SET_BLACKBOX_CONFIG, 0]],
            [MSPCodes.MSP_SET_ADVANCED_CONFIG, [MSPCodes.MSP_SET_ADVANCED_CONFIG, 7]],
        ]);
        expect(fcStore.pidAdvancedConfig.debugMode).toBe(7);
    });

    it("writes the debug mode only once the blackbox config reply lands, and saves a change made meanwhile", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(undefined);
                }),
        );
        const debugMode = ref(7);

        const saving = useOnboardLoggingSave().sendLoggingConfig(debugMode);
        await flushPromises();
        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(fcStore.pidAdvancedConfig.debugMode).toBe(0);

        debugMode.value = 9;
        release();
        await saving;
        expect(MSP.promise).toHaveBeenLastCalledWith(MSPCodes.MSP_SET_ADVANCED_CONFIG, [
            MSPCodes.MSP_SET_ADVANCED_CONFIG,
            9,
        ]);
    });

    it("does not finish until the advanced config reply lands", async () => {
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

        const saving = useOnboardLoggingSave()
            .sendLoggingConfig(ref(1))
            .then(() => {
                done = true;
            });
        await flushPromises();
        expect(done).toBe(false);

        release();
        await saving;
        expect(done).toBe(true);
    });

    it("leaves the debug mode and the advanced config alone when the blackbox write fails", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP error"));

        await expect(useOnboardLoggingSave().sendLoggingConfig(ref(7))).rejects.toThrow("MSP error");
        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(fcStore.pidAdvancedConfig.debugMode).toBe(0);
    });
});
