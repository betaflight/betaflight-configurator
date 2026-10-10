/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ComponentPublicInstance } from "vue";
import UInput from "@nuxt/ui/components/Input.vue";
import AuxiliaryTab from "../../src/components/tabs/AuxiliaryTab.vue";
import * as timers from "../../src/js/timers";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { mspHelper } from "../../src/js/msp/MSPHelper";
import { channelPercent } from "../../src/js/utils/rcChannel";
import { MspCancelledError } from "../../src/js/msp/mspErrors";
import { useFlightControllerStore } from "../../src/stores/fc";

vi.mock("../../src/js/timers", () => ({ addInterval: vi.fn(), removeInterval: vi.fn() }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { loadSerialConfig: (callback: () => void) => callback(), sendModeRanges: vi.fn() },
}));
vi.mock("../../src/composables/useReboot", () => ({
    useReboot: () => ({ saveToEeprom: vi.fn() }),
}));
vi.mock("../../src/js/utils/common", () => ({ getTextWidth: () => 8 }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

let fcStore: ReturnType<typeof useFlightControllerStore>;

function mountTab() {
    return shallowMount(AuxiliaryTab, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

describe("Modes empty-state announcement", () => {
    let wrapper: ReturnType<typeof mountTab>;
    let resolveLoad: () => void;
    let rejectLoad: (error: Error) => void;

    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        Object.assign(fcStore, { auxConfig: ["ARM", "ANGLE"], auxConfigIds: [0, 1] });
        localStorage.clear();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(MSP.promise).mockImplementationOnce(
            () =>
                new Promise<undefined>((resolve, reject) => {
                    resolveLoad = () => resolve(undefined);
                    rejectLoad = reject;
                }),
        );
        wrapper = mountTab();
    });

    afterEach(() => {
        wrapper.unmount();
        vi.restoreAllMocks();
    });

    it("waits for the controller before announcing an unmatched search", async () => {
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        wrapper.findComponent<ComponentPublicInstance>(UInput).vm.$emit("update:modelValue", "gps");
        await flushPromises();
        expect(wrapper.find('[role="status"]').exists()).toBe(false);

        resolveLoad();
        await flushPromises();
        expect(wrapper.get('[role="status"]').text()).toBe("auxiliaryNoModesFound");

        wrapper.findComponent<ComponentPublicInstance>(UInput).vm.$emit("update:modelValue", "ar");
        await flushPromises();
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        expect(wrapper.text()).toContain("ARM");
    });

    it("renders the loaded list without an empty-state announcement", async () => {
        resolveLoad();
        await flushPromises();
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        expect(wrapper.text()).toContain("ARM");
        expect(wrapper.text()).toContain("ANGLE");
    });

    it("announces an empty list when the controller successfully returns no modes", async () => {
        Object.assign(fcStore, { auxConfig: [], auxConfigIds: [] });
        resolveLoad();
        await flushPromises();
        expect(wrapper.get('[role="status"]').text()).toBe("auxiliaryNoModesFound");
    });

    it.each([new Error("MSP timeout"), new MspCancelledError("Disconnected", undefined, "disconnected")])(
        "does not misreport an unsuccessful load as no matching modes: %s",
        async (error) => {
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
            rejectLoad(error);
            await flushPromises();
            // the load settled through its failure path: a real failure is logged, a cancel is not
            expect(consoleError).toHaveBeenCalledTimes(error instanceof MspCancelledError ? 0 : 1);
            expect(MSP.promise).toHaveBeenCalledOnce();
            expect(wrapper.find('[role="status"]').exists()).toBe(false);
        },
    );
});

describe("Modes MSP wiring", () => {
    let wrapper: ReturnType<typeof mountTab>;

    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        Object.assign(fcStore, { auxConfig: ["ARM"], auxConfigIds: [0] });
        localStorage.clear();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it("starts RC polling on mount and refreshes the channel markers from each reply", async () => {
        Object.assign(fcStore.rc, { active_channels: 5, channels: [1500, 1500, 1000, 1500, 1234] });
        wrapper = mountTab();
        await flushPromises();
        const rcTick = vi.mocked(timers.addInterval).mock.calls.find(([name]) => name === "aux_data_pull")![1];

        rcTick();
        const [code, , , onRcData] = vi.mocked(MSP.send_message).mock.calls.at(-1)!;
        expect(code).toBe(MSPCodes.MSP_RC);
        fcStore.rc.channels[4] = 1900;
        (onRcData as () => void)();
        await flushPromises();

        expect(wrapper.vm.rcMarkers).toEqual({ 0: channelPercent(1900) });
    });

    it("pads the saved ranges to the slot count the FC reported at load", async () => {
        fcStore.modeRanges = Array.from({ length: 4 }, () => ({
            id: 0,
            auxChannelIndex: 0,
            range: { start: 900, end: 900 },
        }));
        wrapper = mountTab();
        await flushPromises();

        await wrapper.vm.saveModes();

        expect(mspHelper.sendModeRanges).toHaveBeenCalledOnce();
        expect(fcStore.modeRanges).toHaveLength(4);
    });
});
