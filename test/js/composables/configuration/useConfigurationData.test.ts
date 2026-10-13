import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes, { MSP2TextType } from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useConfigurationData } from "../../../../src/composables/configuration/useConfigurationData";
import { getSetting, getSettingInfo, setSetting } from "../../../../src/composables/useMspSetting";
import { MspCancelledError, MspCrcError, MspTimeoutError } from "../../../../src/js/msp/mspErrors";

vi.mock("../../../../src/composables/useMspSetting", () => ({
    getSetting: vi.fn(),
    getSettingInfo: vi.fn(),
    setSetting: vi.fn(),
}));

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));

/** What crunch() was asked for, so each request's payload is identifiable in the call log. */
const payload = (code: number, modifier?: number) => [`crunch:${code}:${modifier ?? "-"}`];

describe("useConfigurationData", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.45.0";
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(getSetting).mockResolvedValue(null);
        vi.mocked(getSettingInfo).mockResolvedValue(null);
        vi.mocked(mspHelper.crunch).mockImplementation(payload as unknown as typeof mspHelper.crunch);
    });

    const calls = () => vi.mocked(MSP.promise).mock.calls.map(([code, data]) => [code, data]);

    describe("loadConfigurationData", () => {
        it("on 1.45+ reads craft and pilot names through MSP2_GET_TEXT, around the RX config", async () => {
            await expect(useConfigurationData().loadConfigurationData(ref(true))).resolves.toBe(true);

            expect(calls()).toEqual([
                [MSPCodes.MSP_FEATURE_CONFIG, undefined],
                [MSPCodes.MSP_BEEPER_CONFIG, undefined],
                [MSPCodes.MSP_ARMING_CONFIG, undefined],
                [MSPCodes.MSP_SENSOR_CONFIG, undefined],
                [MSPCodes.MSP2_GET_TEXT, payload(MSPCodes.MSP2_GET_TEXT, MSP2TextType.CRAFT_NAME)],
                [MSPCodes.MSP_RX_CONFIG, undefined],
                [MSPCodes.MSP2_GET_TEXT, payload(MSPCodes.MSP2_GET_TEXT, MSP2TextType.PILOT_NAME)],
                [MSPCodes.MSP_ADVANCED_CONFIG, undefined],
            ]);
        });

        it("before 1.45 reads the name with MSP_NAME and asks for no text", async () => {
            fcStore.config.apiVersion = "1.44.0";

            await expect(useConfigurationData().loadConfigurationData(ref(true))).resolves.toBe(true);

            expect(calls()).toEqual([
                [MSPCodes.MSP_FEATURE_CONFIG, undefined],
                [MSPCodes.MSP_BEEPER_CONFIG, undefined],
                [MSPCodes.MSP_ARMING_CONFIG, undefined],
                [MSPCodes.MSP_SENSOR_CONFIG, undefined],
                [MSPCodes.MSP_NAME, undefined],
                [MSPCodes.MSP_RX_CONFIG, undefined],
                [MSPCodes.MSP_ADVANCED_CONFIG, undefined],
            ]);
        });

        it("sends nothing when the tab is already gone", async () => {
            await expect(useConfigurationData().loadConfigurationData(ref(false))).resolves.toBe(false);

            expect(MSP.promise).not.toHaveBeenCalled();
        });

        // Each entry: the request after which the tab unmounts, and how many requests were sent by then.
        it.each([
            ["the sensor config", MSPCodes.MSP_SENSOR_CONFIG, 4],
            ["the pilot name", MSPCodes.MSP2_GET_TEXT, 7],
            ["the advanced config", MSPCodes.MSP_ADVANCED_CONFIG, 8],
        ])("stops and reports it once the tab unmounts during %s", async (_label, code, sent) => {
            const isMounted = ref(true);
            let texts = 0;
            vi.mocked(MSP.promise).mockImplementation(async (requested) => {
                if (requested === MSPCodes.MSP2_GET_TEXT) texts++;
                if (requested === code && (code !== MSPCodes.MSP2_GET_TEXT || texts === 2)) {
                    isMounted.value = false;
                }
            });

            await expect(useConfigurationData().loadConfigurationData(isMounted)).resolves.toBe(false);

            expect(MSP.promise).toHaveBeenCalledTimes(sent);
        });

        it("stops at the first failed request", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(useConfigurationData().loadConfigurationData(ref(true))).rejects.toThrow("MSP timeout");

            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    describe("EZ Landing", () => {
        const mixerInfo = {
            type: "lookup",
            min: null,
            max: null,
            values: ["LEGACY", "LINEAR", "DYNAMIC", "EZLANDING"],
        };

        async function loadMixer(value: string) {
            vi.mocked(getSetting).mockResolvedValue(value);
            vi.mocked(getSettingInfo).mockResolvedValue(mixerInfo);
            const config = useConfigurationData();
            await config.loadConfigurationData(ref(true));
            return config;
        }

        it.each(["LEGACY", "LINEAR", "DYNAMIC", "EZLANDING"])("preserves %s on an unrelated save", async (value) => {
            const config = await loadMixer(value);
            expect(config.ezLandingAvailable.value).toBe(true);
            expect(config.ezLandingEnabled.value).toBe(value === "EZLANDING");
            await config.sendConfigurationData();
            expect(setSetting).not.toHaveBeenCalled();
        });

        it.each([
            ["LEGACY", true, "EZLANDING"],
            ["EZLANDING", false, "LEGACY"],
            ["DYNAMIC", true, "EZLANDING"],
        ] as const)("changes %s to %s only on save", async (initial, enabled, selected) => {
            const config = await loadMixer(initial);
            config.ezLandingEnabled.value = enabled;
            expect(setSetting).not.toHaveBeenCalled();
            vi.mocked(setSetting).mockResolvedValue(selected);
            await config.sendConfigurationData();
            expect(setSetting).toHaveBeenCalledExactlyOnceWith("mixer_type", selected);
        });

        it("selects Legacy when enabled then disabled from a non-Legacy mixer", async () => {
            const config = await loadMixer("LINEAR");
            config.ezLandingEnabled.value = true;
            config.ezLandingEnabled.value = false;
            vi.mocked(setSetting).mockResolvedValue("LEGACY");
            await config.sendConfigurationData();
            expect(setSetting).toHaveBeenCalledExactlyOnceWith("mixer_type", "LEGACY");
        });

        it("hides the control and never writes a mixer on unsupported firmware", async () => {
            const config = useConfigurationData();
            await config.loadConfigurationData(ref(true));
            expect(config.ezLandingAvailable.value).toBe(false);
            expect(getSettingInfo).not.toHaveBeenCalled();
            config.ezLandingEnabled.value = true;
            await config.sendConfigurationData();
            expect(setSetting).not.toHaveBeenCalled();
        });

        it("does not offer a mixer value the build cannot accept", async () => {
            vi.mocked(getSetting).mockResolvedValue("LEGACY");
            vi.mocked(getSettingInfo).mockResolvedValue({ ...mixerInfo, values: ["LEGACY"] });
            const config = useConfigurationData();
            await config.loadConfigurationData(ref(true));
            expect(config.ezLandingAvailable.value).toBe(false);
        });

        it.each([
            ["value", new MspTimeoutError("probe timed out")],
            ["metadata", new MspCrcError("bad response")],
        ] as const)("keeps the rest of the tab usable when the mixer %s probe fails", async (step, error) => {
            const config = await loadMixer("EZLANDING");
            vi.mocked(step === "value" ? getSetting : getSettingInfo).mockRejectedValueOnce(error);
            const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
            try {
                await expect(config.loadConfigurationData(ref(true))).resolves.toBe(true);
                expect(config.ezLandingAvailable.value).toBe(false);
                expect(config.mixerType.value).toBeNull();
                config.ezLandingEnabled.value = true;
                await config.sendConfigurationData();
                expect(setSetting).not.toHaveBeenCalled();
            } finally {
                warning.mockRestore();
            }
        });

        it.each(["value", "metadata"] as const)("propagates cancellation during the mixer %s probe", async (step) => {
            vi.mocked(getSetting).mockResolvedValue("LEGACY");
            const cancellation = new MspCancelledError("tab switched");
            vi.mocked(step === "value" ? getSetting : getSettingInfo).mockRejectedValueOnce(cancellation);
            await expect(useConfigurationData().loadConfigurationData(ref(true))).rejects.toBe(cancellation);
        });

        it("does not finish loading after unmounting during a failed probe", async () => {
            const mounted = ref(true);
            vi.mocked(getSetting).mockImplementation(async () => {
                mounted.value = false;
                throw new MspTimeoutError("probe timed out");
            });
            await expect(useConfigurationData().loadConfigurationData(mounted)).resolves.toBe(false);
        });

        it("stops saving on a refused mixer write", async () => {
            const config = await loadMixer("LEGACY");
            config.ezLandingEnabled.value = true;
            vi.mocked(setSetting).mockRejectedValue(new Error("refused"));
            vi.mocked(MSP.promise).mockClear();
            await expect(config.sendConfigurationData()).rejects.toThrow("refused");
            expect(MSP.promise).not.toHaveBeenCalled();
        });

        it("rejects an acknowledgement confirming a different mixer", async () => {
            const config = await loadMixer("LEGACY");
            config.ezLandingEnabled.value = true;
            vi.mocked(setSetting).mockResolvedValue("LEGACY");
            await expect(config.sendConfigurationData()).rejects.toThrow("did not confirm");
        });

        it("does not update the tab after unmounting during the mixer probe", async () => {
            const mounted = ref(true);
            vi.mocked(getSetting).mockImplementation(async () => {
                mounted.value = false;
                return "EZLANDING";
            });
            const config = useConfigurationData();
            await expect(config.loadConfigurationData(mounted)).resolves.toBe(false);
            expect(config.ezLandingAvailable.value).toBe(false);
            expect(getSettingInfo).not.toHaveBeenCalled();
        });
    });

    describe("sendConfigurationData", () => {
        const SEND_1_45 = [
            [MSPCodes.MSP_SET_FEATURE_CONFIG, payload(MSPCodes.MSP_SET_FEATURE_CONFIG)],
            [MSPCodes.MSP_SET_BEEPER_CONFIG, payload(MSPCodes.MSP_SET_BEEPER_CONFIG)],
            [MSPCodes.MSP_SET_ARMING_CONFIG, payload(MSPCodes.MSP_SET_ARMING_CONFIG)],
            [MSPCodes.MSP2_SET_TEXT, payload(MSPCodes.MSP2_SET_TEXT, MSP2TextType.CRAFT_NAME)],
            [MSPCodes.MSP2_SET_TEXT, payload(MSPCodes.MSP2_SET_TEXT, MSP2TextType.PILOT_NAME)],
            [MSPCodes.MSP_SET_RX_CONFIG, payload(MSPCodes.MSP_SET_RX_CONFIG)],
            [MSPCodes.MSP_SET_ADVANCED_CONFIG, payload(MSPCodes.MSP_SET_ADVANCED_CONFIG)],
        ];

        it("on 1.45+ writes craft then pilot name through MSP2_SET_TEXT", async () => {
            await useConfigurationData().sendConfigurationData();

            expect(calls()).toEqual(SEND_1_45);
        });

        it("before 1.45 writes the name with MSP_SET_NAME", async () => {
            fcStore.config.apiVersion = "1.44.0";

            await useConfigurationData().sendConfigurationData();

            expect(calls()).toEqual([
                [MSPCodes.MSP_SET_FEATURE_CONFIG, payload(MSPCodes.MSP_SET_FEATURE_CONFIG)],
                [MSPCodes.MSP_SET_BEEPER_CONFIG, payload(MSPCodes.MSP_SET_BEEPER_CONFIG)],
                [MSPCodes.MSP_SET_ARMING_CONFIG, payload(MSPCodes.MSP_SET_ARMING_CONFIG)],
                [MSPCodes.MSP_SET_NAME, payload(MSPCodes.MSP_SET_NAME)],
                [MSPCodes.MSP_SET_RX_CONFIG, payload(MSPCodes.MSP_SET_RX_CONFIG)],
                [MSPCodes.MSP_SET_ADVANCED_CONFIG, payload(MSPCodes.MSP_SET_ADVANCED_CONFIG)],
            ]);
        });

        it("skips the beeper write when the store holds no beeper config", async () => {
            fcStore.beepers = null as unknown as typeof fcStore.beepers;

            await useConfigurationData().sendConfigurationData();

            expect(calls().map(([code]) => code)).not.toContain(MSPCodes.MSP_SET_BEEPER_CONFIG);
            expect(calls()).toHaveLength(SEND_1_45.length - 1);
        });

        it("does not finish until the last write is acknowledged, so the caller persists after it", async () => {
            let release!: () => void;
            vi.mocked(MSP.promise).mockImplementation((code) =>
                code === MSPCodes.MSP_SET_ADVANCED_CONFIG
                    ? new Promise((resolve) => {
                          release = () => resolve(undefined);
                      })
                    : Promise.resolve(undefined),
            );
            let done = false;

            const sending = useConfigurationData()
                .sendConfigurationData()
                .then(() => {
                    done = true;
                });
            await flushPromises();
            expect(calls()).toEqual(SEND_1_45);
            expect(done).toBe(false);

            release();
            await sending;
            expect(done).toBe(true);
        });

        it("stops at the first failed write", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(useConfigurationData().sendConfigurationData()).rejects.toThrow("MSP timeout");

            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });
});
