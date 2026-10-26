import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ConfigurationTab from "../../src/components/tabs/ConfigurationTab.vue";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { gui_log } from "../../src/js/gui_log";
import { useFlightControllerStore } from "../../src/stores/fc";

const saveAndReboot = vi.fn();

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn(() => []) } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
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
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
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

    it("sends the edited values from the store, then logs and reboots", async () => {
        wrapper = mountTab();
        await flushPromises();
        vi.mocked(MSP.promise).mockClear();
        const order: string[] = [];
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP2_SET_TEXT) order.push(`text:${fcStore.config.craftName}`);
        });
        vi.mocked(gui_log).mockImplementation(() => order.push("log"));
        saveAndReboot.mockImplementation(async () => {
            order.push("reboot");
        });

        wrapper.vm.craftName = "edited";
        await wrapper.vm.saveConfig();

        expect(order).toEqual(["text:edited", "text:edited", "log", "reboot"]);
        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_SET_ADVANCED_CONFIG, []);
        expect(wrapper.vm.dirty).toBe(false);
    });
});
