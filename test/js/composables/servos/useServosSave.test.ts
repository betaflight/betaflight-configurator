import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { MspCancelledError } from "../../../../src/js/msp/mspErrors";
import { useServosSave } from "../../../../src/composables/servos/useServosSave";

const saveToEeprom = vi.fn();

vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { sendServoConfigurations: vi.fn() } }));
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
    });

    describe("saveServoConfig", () => {
        it("marshals, sends, persists, then moves the baseline", async () => {
            await useServosSave(marshal, markClean).saveServoConfig();

            expect(order).toEqual(["marshal", "send", "eeprom", "markClean"]);
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

        it("waits for the EEPROM write before moving the baseline", async () => {
            let release!: () => void;
            saveToEeprom.mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
            );

            const saving = useServosSave(marshal, markClean).saveServoConfig();
            await flushPromises();
            expect(markClean).not.toHaveBeenCalled();

            release();
            await saving;
            expect(markClean).toHaveBeenCalledOnce();
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
