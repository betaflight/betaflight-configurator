import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ComponentPublicInstance } from "vue";
import ConfigurationTab from "../../src/components/tabs/ConfigurationTab.vue";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { gui_log } from "../../src/js/gui_log";
import { useFlightControllerStore } from "../../src/stores/fc";
import { getSetting, getSettingInfo, setSetting } from "../../src/composables/useMspSetting";
import Features from "../../src/js/Features";
import { MspCancelledError, MspTimeoutError } from "../../src/js/msp/mspErrors";

const saveToEeprom = vi.fn();
const rebootAfterSave = vi.fn();
const saveAndReboot = async () => {
    await saveToEeprom();
    await rebootAfterSave();
};
vi.mock("../../src/composables/useMspSetting", () => ({
    getSetting: vi.fn(),
    getSettingInfo: vi.fn(),
    setSetting: vi.fn(),
}));

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn(() => []) } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/composables/useReboot", () => ({
    useReboot: () => ({ saveAndReboot, saveToEeprom, rebootAfterSave }),
}));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

function mountTab() {
    return shallowMount(ConfigurationTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

describe("Configuration MSP wiring", () => {
    let wrapper: ReturnType<typeof mountTab> | undefined;
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.45.0";
        fcStore.features.features = new Features({ apiVersion: "1.45.0" });
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(getSetting).mockResolvedValue(null);
        vi.mocked(getSettingInfo).mockResolvedValue(null);
    });

    afterEach(() => {
        wrapper?.unmount();
        wrapper = undefined;
    });

    it("leaves the UI alone when the tab unmounts while the load is in flight", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(undefined);
                }),
        );
        fcStore.config.craftName = "quad";
        const mounted = mountTab();
        await flushPromises();

        mounted.unmount();
        release();
        await flushPromises();

        // the load only checks between groups of requests, so the first group still completes
        expect(MSP.promise).toHaveBeenCalledTimes(4);
        expect(mounted.vm.craftName).not.toBe("quad");
    });

    it("populates the UI once the load completes", async () => {
        fcStore.config.craftName = "quad";
        wrapper = mountTab();
        await flushPromises();

        expect(wrapper.vm.craftName).toBe("quad");
        expect(wrapper.vm.dirty).toBe(false);
    });

    it("populates the other settings when the optional mixer probe times out", async () => {
        fcStore.config.craftName = "quad";
        vi.mocked(getSetting).mockRejectedValue(new MspTimeoutError("probe timed out"));
        const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            wrapper = mountTab();
            await flushPromises();
            expect(wrapper.vm.craftName).toBe("quad");
            expect(wrapper.vm.ezLandingAvailable).toBe(false);
            expect(wrapper.vm.dirty).toBe(false);
        } finally {
            warning.mockRestore();
        }
    });

    it("tracks the EZ Landing toggle and writes it before rebooting", async () => {
        vi.mocked(getSetting).mockResolvedValue("LEGACY");
        vi.mocked(getSettingInfo).mockResolvedValue({
            type: "lookup",
            min: null,
            max: null,
            values: ["LEGACY", "EZLANDING"],
        });
        wrapper = mountTab();
        await flushPromises();
        expect(wrapper.vm.ezLandingAvailable).toBe(true);
        expect(wrapper.find('[aria-label="configurationEzLandingLabel"]').exists()).toBe(true);
        expect(wrapper.vm.dirty).toBe(false);
        wrapper
            .findComponent<ComponentPublicInstance>('[aria-label="configurationEzLandingLabel"]')
            .vm.$emit("update:modelValue", true);
        await flushPromises();
        expect(fcStore.features.features?.isEnabled("AIRMODE")).toBe(false);
        expect(wrapper.vm.dirty).toBe(true);
        expect(setSetting).not.toHaveBeenCalled();
        const order: string[] = [];
        vi.mocked(setSetting).mockImplementation(async () => {
            order.push("mixer");
            return "EZLANDING";
        });
        rebootAfterSave.mockImplementation(async () => {
            order.push("reboot");
        });
        await wrapper.vm.saveConfig();
        expect(order).toEqual(["mixer", "reboot"]);
        expect(wrapper.vm.dirty).toBe(false);
    });

    it("does not render the toggle on firmware without named-setting support", async () => {
        wrapper = mountTab();
        await flushPromises();
        expect(wrapper.find('[aria-label="configurationEzLandingLabel"]').exists()).toBe(false);
    });

    it("keeps the edit dirty and does not reboot when the mixer write fails", async () => {
        vi.mocked(getSetting).mockResolvedValue("LEGACY");
        vi.mocked(getSettingInfo).mockResolvedValue({
            type: "lookup",
            min: null,
            max: null,
            values: ["LEGACY", "EZLANDING"],
        });
        wrapper = mountTab();
        await flushPromises();
        wrapper.vm.ezLandingEnabled = true;
        vi.mocked(setSetting).mockRejectedValue(new Error("refused"));
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper.vm.saveConfig();
            expect(saveToEeprom).not.toHaveBeenCalled();
            expect(rebootAfterSave).not.toHaveBeenCalled();
            expect(wrapper.vm.dirty).toBe(true);
            expect(gui_log).toHaveBeenCalledWith("configurationSaveFailed");
        } finally {
            consoleError.mockRestore();
        }
    });

    async function loadEditableMixer() {
        let controllerMixer = "LEGACY";
        vi.mocked(getSetting).mockImplementation(async () => controllerMixer);
        vi.mocked(getSettingInfo).mockResolvedValue({
            type: "lookup",
            min: null,
            max: null,
            values: ["LEGACY", "EZLANDING"],
        });
        vi.mocked(setSetting).mockImplementation(async (_name, value) => {
            controllerMixer = String(value);
            return controllerMixer;
        });
        wrapper = mountTab();
        await flushPromises();
        return {
            current: () => controllerMixer,
            change: (value: string) => {
                controllerMixer = value;
            },
        };
    }

    it("restores the old mixer after a later configuration write fails", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("feature write failed"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            expect(saveToEeprom).not.toHaveBeenCalled();
            expect(rebootAfterSave).not.toHaveBeenCalled();
            expect(wrapper!.vm.dirty).toBe(true);
            wrapper!.vm.ezLandingEnabled = false;
            expect(wrapper!.vm.dirty).toBe(false);
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
        } finally {
            logged.mockRestore();
        }
    });

    it("restores the mixer after EEPROM failure while keeping the requested edit unsaved", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        saveToEeprom.mockRejectedValueOnce(new MspTimeoutError("EEPROM timed out"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            expect(wrapper!.vm.ezLandingEnabled).toBe(true);
            expect(wrapper!.vm.dirty).toBe(true);
            expect(rebootAfterSave).not.toHaveBeenCalled();
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("EZLANDING");
            expect(wrapper!.vm.dirty).toBe(false);
        } finally {
            logged.mockRestore();
        }
    });

    it("keeps a lost EEPROM acknowledgement pending even after RAM is restored", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        saveToEeprom.mockRejectedValueOnce(new MspTimeoutError("EEPROM acknowledgement lost"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            wrapper!.vm.ezLandingEnabled = false;
            expect(wrapper!.vm.dirty).toBe(true);
            await wrapper!.vm.saveConfig();
            expect(saveToEeprom).toHaveBeenCalledTimes(2);
            expect(controller.current()).toBe("LEGACY");
            expect(wrapper!.vm.dirty).toBe(false);
        } finally {
            logged.mockRestore();
        }
    });

    it("retains uncertain persistence after leaving and reopening Configuration", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        saveToEeprom.mockRejectedValueOnce(new MspTimeoutError("EEPROM acknowledgement lost"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            wrapper!.unmount();
            wrapper = mountTab();
            await flushPromises();
            expect(wrapper.vm.ezLandingEnabled).toBe(false);
            expect(wrapper.vm.dirty).toBe(true);
            await wrapper.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            expect(wrapper.vm.dirty).toBe(false);
        } finally {
            logged.mockRestore();
        }
    });

    it("does not persist unknown mixer state when a remounted capability probe fails", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        saveToEeprom.mockRejectedValueOnce(new MspTimeoutError("EEPROM acknowledgement lost"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            wrapper!.unmount();
            vi.mocked(getSetting).mockRejectedValueOnce(new MspTimeoutError("probe failed"));
            wrapper = mountTab();
            await flushPromises();
            expect(wrapper.vm.ezLandingAvailable).toBe(false);
            expect(wrapper.vm.dirty).toBe(true);
            saveToEeprom.mockClear();
            await wrapper.vm.saveConfig();
            expect(saveToEeprom).not.toHaveBeenCalled();
            expect(controller.current()).toBe("LEGACY");
            expect(gui_log).toHaveBeenCalledWith("configurationMixerReadFailed");
        } finally {
            logged.mockRestore();
            warning.mockRestore();
        }
    });

    it("does not report a recovery error when a tab switch cancels the restore", async () => {
        await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        saveToEeprom.mockRejectedValueOnce(new Error("EEPROM refused"));
        vi.mocked(getSetting).mockRejectedValueOnce(new MspCancelledError("tab switched"));
        vi.mocked(gui_log).mockClear();
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(gui_log).not.toHaveBeenCalled();
            expect(logged).not.toHaveBeenCalled();
        } finally {
            logged.mockRestore();
        }
    });

    it("keeps recovery pending when rollback fails and writes Legacy on the next retry", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        saveToEeprom.mockRejectedValueOnce(new Error("EEPROM refused"));
        vi.mocked(setSetting)
            .mockImplementationOnce(async () => {
                controller.change("EZLANDING");
                return "EZLANDING";
            })
            .mockRejectedValueOnce(new MspTimeoutError("rollback timed out"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("EZLANDING");
            wrapper!.vm.ezLandingEnabled = false;
            expect(wrapper!.vm.dirty).toBe(true);
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            expect(setSetting).toHaveBeenLastCalledWith("mixer_type", "LEGACY");
            expect(wrapper!.vm.dirty).toBe(false);
        } finally {
            logged.mockRestore();
        }
    });

    it("recovers a mixer write that changed RAM but lost its acknowledgement", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        vi.mocked(setSetting).mockImplementationOnce(async () => {
            controller.change("EZLANDING");
            throw new MspTimeoutError("reply lost");
        });
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("LEGACY");
            expect(saveToEeprom).not.toHaveBeenCalled();
            expect(wrapper!.vm.dirty).toBe(true);
        } finally {
            logged.mockRestore();
        }
    });

    it("keeps an acknowledged save when reboot initiation fails", async () => {
        const controller = await loadEditableMixer();
        wrapper!.vm.ezLandingEnabled = true;
        rebootAfterSave.mockRejectedValueOnce(new Error("reboot failed"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await wrapper!.vm.saveConfig();
            expect(controller.current()).toBe("EZLANDING");
            expect(setSetting).toHaveBeenCalledExactlyOnceWith("mixer_type", "EZLANDING");
            expect(wrapper!.vm.dirty).toBe(false);
            expect(gui_log).toHaveBeenCalledWith("configurationSavedRebootFailed");
        } finally {
            logged.mockRestore();
        }
    });

    it("sends the edited values from the store, then logs and reboots", async () => {
        wrapper = mountTab();
        await flushPromises();
        vi.mocked(MSP.promise).mockClear();
        const order: string[] = [];
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP2_SET_TEXT) order.push(`text:${fcStore.config.craftName}`);
        });
        vi.mocked(gui_log).mockImplementation(() => order.push("log"));
        rebootAfterSave.mockImplementation(async () => {
            order.push("reboot");
        });

        wrapper.vm.craftName = "edited";
        await wrapper.vm.saveConfig();

        expect(order).toEqual(["text:edited", "text:edited", "log", "reboot"]);
        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_SET_ADVANCED_CONFIG, []);
        expect(wrapper.vm.dirty).toBe(false);
    });
});
