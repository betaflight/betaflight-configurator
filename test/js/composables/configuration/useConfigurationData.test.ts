import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes, { MSP2TextType } from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useConfigurationData } from "../../../../src/composables/configuration/useConfigurationData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));

/** What crunch() was asked for, so each request's payload is identifiable in the call log. */
const payload = (code: number, modifier?: number) => [`crunch:${code}:${modifier ?? "-"}`];

const LOAD_1_45 = [
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_BEEPER_CONFIG,
    MSPCodes.MSP_ARMING_CONFIG,
    MSPCodes.MSP_SENSOR_CONFIG,
    MSPCodes.MSP2_GET_TEXT,
    MSPCodes.MSP_RX_CONFIG,
    MSPCodes.MSP2_GET_TEXT,
    MSPCodes.MSP_ADVANCED_CONFIG,
];

describe("useConfigurationData", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.45.0";
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
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

        it.each(LOAD_1_45.map((code, index) => [index, code]))(
            "holds back everything after request %i until its reply lands",
            async (index) => {
                let release!: () => void;
                let seen = 0;
                vi.mocked(MSP.promise).mockImplementation(() =>
                    seen++ === index
                        ? new Promise((resolve) => {
                              release = () => resolve(undefined);
                          })
                        : Promise.resolve(undefined),
                );
                let done = false;

                const loading = useConfigurationData()
                    .loadConfigurationData(ref(true))
                    .then(() => {
                        done = true;
                    });
                await flushPromises();

                expect(calls().map(([code]) => code)).toEqual(LOAD_1_45.slice(0, index + 1));
                expect(done).toBe(false);

                release();
                await loading;
                expect(calls()).toHaveLength(LOAD_1_45.length);
            },
        );

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

        it.each(SEND_1_45.map((_, index) => [index]))(
            "holds back everything after write %i until its reply lands",
            async (index) => {
                let release!: () => void;
                let seen = 0;
                vi.mocked(MSP.promise).mockImplementation(() =>
                    seen++ === index
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

                expect(calls()).toEqual(SEND_1_45.slice(0, index + 1));
                expect(done).toBe(false);

                release();
                await sending;
                expect(calls()).toEqual(SEND_1_45);
            },
        );

        it("stops at the first failed write", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(useConfigurationData().sendConfigurationData()).rejects.toThrow("MSP timeout");

            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });
});
