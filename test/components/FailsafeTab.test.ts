import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import FailsafeTab from "../../src/components/tabs/FailsafeTab.vue";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { useFlightControllerStore } from "../../src/stores/fc";

const saveAndReboot = vi.fn();

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: () => [], sendRxFailConfig: (callback: () => void) => callback() },
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: (key: string, params?: Record<string, unknown>) =>
            params ? `${key} ${Object.values(params).join(" ")}` : key,
    },
}));

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

    it("loads the configuration on mount, then takes it as the clean baseline", async () => {
        wrapper = mountTab();
        await flushPromises();

        expect(vi.mocked(MSP.promise).mock.calls[0]).toEqual([MSPCodes.MSP_RX_CONFIG]);
        expect(vi.mocked(MSP.promise).mock.calls.at(-1)).toEqual([MSPCodes.MSP_MODE_RANGES]);
        expect((wrapper.vm as unknown as { configHasChanged: boolean }).configHasChanged).toBe(false);
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

describe("Failsafe channel badges", () => {
    let wrapper: ReturnType<typeof mountTab>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        vi.mocked(MSP.promise).mockResolvedValue(undefined);

        const fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.47.0";
        fcStore.rc.active_channels = 8;
        fcStore.rxFailConfig = Array.from({ length: 8 }, () => ({ mode: 1, value: 1500 }));
        fcStore.auxConfig = ["ARM", "ANGLE"];
        fcStore.auxConfigIds = [0, 1];
        fcStore.modeRanges = [
            { id: 0, auxChannelIndex: 0, range: { start: 1700, end: 2100 } },
            { id: 1, auxChannelIndex: 1, range: { start: 1300, end: 1700 } },
            { id: 1, auxChannelIndex: 2, range: { start: 900, end: 900 } }, // unused slot
        ];
        fcStore.servoConfig = [
            { min: 1000, max: 2000, middle: 1500, rate: 100, indexOfChannelToForward: 6, reversedInputSources: 0 },
            { min: 1100, max: 1900, middle: 1500, rate: 100, indexOfChannelToForward: 255, reversedInputSources: 0 },
            { min: 1000, max: 2000, middle: 1500, rate: 100, indexOfChannelToForward: 2, reversedInputSources: 0 },
        ];
    });

    afterEach(() => {
        wrapper.unmount();
    });

    function labels() {
        const vm = wrapper.vm as unknown as { activeChannels: { assignments: { label: string }[] }[] };
        return vm.activeChannels.map((channel) => channel.assignments.map((badge) => badge.label));
    }

    it("labels aux channels with their mode ranges and forwarding servos", async () => {
        wrapper = mountTab();
        await flushPromises();

        expect(labels()).toEqual([
            [],
            [],
            ["failsafeChannelServoBadge 3 1000 2000"], // servo 3 forwards yaw
            [],
            ["ARM 1700–2100"],
            ["ANGLE 1300–1700"],
            ["failsafeChannelServoBadge 1 1000 2000"], // servo 1 forwards AUX3
            [],
        ]);
    });
});
