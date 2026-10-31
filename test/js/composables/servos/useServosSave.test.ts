import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { MspCancelledError } from "../../../../src/js/msp/mspErrors";
import { useServosSave } from "../../../../src/composables/servos/useServosSave";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../../../../src/stores/fc";

const saveToEeprom = vi.fn();

vi.mock("../../../../src/js/msp/MSPHelper", () => ({
    mspHelper: { sendServoConfigurations: vi.fn(), sendServoMixRules: vi.fn() },
}));
vi.mock("../../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));
vi.mock("../../../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

describe("useServosSave", () => {
    let marshal: ReturnType<typeof vi.fn<() => void>>;
    let markClean: ReturnType<typeof vi.fn<() => void>>;
    let order: string[];

    beforeEach(() => {
        // reset, not clear: a failure stubbed in one test must not leak into the next
        vi.resetAllMocks();
        setActivePinia(createPinia());
        order = [];
        marshal = vi.fn(() => {
            order.push("marshal");
        });
        markClean = vi.fn(() => {
            order.push("markClean");
        });
        vi.mocked(mspHelper.sendServoConfigurations).mockImplementation(async () => {
            order.push("send");
        });
        saveToEeprom.mockImplementation(async () => {
            order.push("eeprom");
        });
        vi.mocked(mspHelper.sendServoMixRules).mockImplementation(async () => {
            order.push("rules");
        });
    });

    describe("saveServoConfig", () => {
        it("marshals, sends, persists, then moves the baseline", async () => {
            await useServosSave(marshal, markClean).saveServoConfig();

            expect(order).toEqual(["marshal", "send", "eeprom", "markClean"]);
            expect(mspHelper.sendServoMixRules).not.toHaveBeenCalled();
        });

        it("writes the given mixer rules after the servo config, before EEPROM", async () => {
            const rules = [{ target: 2, input: 0, rate: 100, speed: 0, min: 0, max: 100, box: 0 }];
            await useServosSave(marshal, markClean).saveServoConfig(rules);

            expect(useFlightControllerStore().servoRules).toEqual(rules);
            expect(order).toEqual(["marshal", "send", "rules", "eeprom", "markClean"]);
        });

        it("waits for the send before writing EEPROM", async () => {
            let release!: () => void;
            vi.mocked(mspHelper.sendServoConfigurations).mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
            );

            const saving = useServosSave(marshal, markClean).saveServoConfig();
            await flushPromises();
            expect(saveToEeprom).not.toHaveBeenCalled();

            release();
            await saving;
            expect(saveToEeprom).toHaveBeenCalledOnce();
        });

        it("leaves the baseline alone and skips EEPROM when the send fails", async () => {
            vi.mocked(mspHelper.sendServoConfigurations).mockRejectedValue(new Error("MSP timeout"));
            vi.spyOn(console, "error").mockImplementation(() => {});
            const { saveServoConfig, isSaving } = useServosSave(marshal, markClean);

            await saveServoConfig();

            expect(saveToEeprom).not.toHaveBeenCalled();
            expect(markClean).not.toHaveBeenCalled();
            expect(isSaving.value).toBe(false);
        });

        it("leaves the baseline alone when the EEPROM write fails", async () => {
            saveToEeprom.mockRejectedValueOnce(new Error("EEPROM"));
            vi.spyOn(console, "error").mockImplementation(() => {});

            await useServosSave(marshal, markClean).saveServoConfig();

            expect(markClean).not.toHaveBeenCalled();
        });
    });

    describe("updateServos", () => {
        it("marshals then sends, without persisting or moving the baseline", async () => {
            useServosSave(marshal, markClean).updateServos();
            await flushPromises();

            expect(order).toEqual(["marshal", "send"]);
            expect(saveToEeprom).not.toHaveBeenCalled();
            expect(markClean).not.toHaveBeenCalled();
        });

        it("logs a genuine send failure", async () => {
            const error = new Error("MSP timeout");
            vi.mocked(mspHelper.sendServoConfigurations).mockRejectedValue(error);
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

            useServosSave(marshal, markClean).updateServos();
            await flushPromises();

            expect(consoleError).toHaveBeenCalledExactlyOnceWith("Failed to update servo configuration", error);
        });

        it("stays quiet when the send is cancelled by a queue clear", async () => {
            vi.mocked(mspHelper.sendServoConfigurations).mockRejectedValue(new MspCancelledError());
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

            useServosSave(marshal, markClean).updateServos();
            await flushPromises();

            expect(consoleError).not.toHaveBeenCalled();
        });
    });
});
