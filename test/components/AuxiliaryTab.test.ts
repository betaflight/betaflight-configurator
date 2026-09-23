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
import FC from "../../src/js/fc";
import GUI from "../../src/js/gui";
import MSP from "../../src/js/msp";
import { MspCancelledError } from "../../src/js/msp/mspErrors";

vi.mock("../../src/js/gui", () => ({
    default: { content_ready: vi.fn(), interval_add: vi.fn(), interval_remove: vi.fn() },
}));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { loadSerialConfig: (callback: () => void) => callback() },
}));
vi.mock("../../src/composables/useReboot", () => ({
    useReboot: () => ({ saveToEeprom: vi.fn() }),
}));
vi.mock("../../src/js/utils/common", () => ({ getTextWidth: () => 8 }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

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
        FC.resetState();
        Object.assign(FC, { AUX_CONFIG: ["ARM", "ANGLE"], AUX_CONFIG_IDS: [0, 1] });
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
        Object.assign(FC, { AUX_CONFIG: [], AUX_CONFIG_IDS: [] });
        resolveLoad();
        await flushPromises();
        expect(wrapper.get('[role="status"]').text()).toBe("auxiliaryNoModesFound");
    });

    it.each([new Error("MSP timeout"), new MspCancelledError("Disconnected", undefined, "disconnected")])(
        "does not misreport an unsuccessful load as no matching modes: %s",
        async (error) => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            rejectLoad(error);
            await flushPromises();
            expect(GUI.content_ready).toHaveBeenCalled();
            expect(wrapper.find('[role="status"]').exists()).toBe(false);
        },
    );
});
