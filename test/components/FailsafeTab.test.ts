import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import FailsafeTab from "../../src/components/tabs/FailsafeTab.vue";
import GUI from "../../src/js/gui";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { useFlightControllerStore } from "../../src/stores/fc";

const saveAndReboot = vi.fn();

vi.mock("../../src/js/gui", () => ({ default: { content_ready: vi.fn() } }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: () => [], sendRxFailConfig: (callback: () => void) => callback() },
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

function mountTab() {
    return shallowMount(FailsafeTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

describe("Failsafe MSP wiring", () => {
    let wrapper: ReturnType<typeof mountTab>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        useFlightControllerStore().config.apiVersion = "1.47.0";
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        saveAndReboot.mockResolvedValue(undefined);
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it("loads the configuration on mount, then announces the content", async () => {
        wrapper = mountTab();
        await flushPromises();

        expect(vi.mocked(MSP.promise).mock.calls[0]).toEqual([MSPCodes.MSP_RX_CONFIG]);
        expect(vi.mocked(MSP.promise).mock.calls.at(-1)).toEqual([MSPCodes.MSP_MODE_RANGES]);
        expect(GUI.content_ready).toHaveBeenCalledOnce();
    });

    it("resets the dirty baseline when the save goes through", async () => {
        wrapper = mountTab();
        await flushPromises();
        const fcStore = useFlightControllerStore();
        const vm = wrapper.vm as unknown as { configHasChanged: boolean; saveConfig: () => Promise<void> };

        fcStore.failsafeConfig.failsafe_delay += 1;
        await nextTick();
        expect(vm.configHasChanged).toBe(true);

        await vm.saveConfig();
        await nextTick();

        expect(saveAndReboot).toHaveBeenCalledOnce();
        expect(vm.configHasChanged).toBe(false);
    });
});
