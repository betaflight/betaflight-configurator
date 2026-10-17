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
import ConfigurationTab from "../../src/components/tabs/ConfigurationTab.vue";
import VirtualFC from "../../src/js/VirtualFC";
import { useConnectionStore } from "../../src/stores/connection";
import { getSetting } from "../../src/composables/useMspSetting";

vi.mock("../../src/composables/useReboot", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/composables/useReboot")>();
    return { useReboot: () => ({ ...actual.useReboot(), rebootAfterSave: vi.fn() }) };
});
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));

function mountTab() {
    return shallowMount(ConfigurationTab, {
        global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key } },
    });
}

describe("EZ Landing on the virtual flight controller", () => {
    let wrapper: ReturnType<typeof mountTab> | undefined;

    beforeEach(() => {
        setActivePinia(createPinia());
        const connection = useConnectionStore();
        connection.virtualMode = true;
        connection.virtualApiVersion = "1.46.0";
        VirtualFC.setVirtualConfig();
    });

    afterEach(() => {
        wrapper?.unmount();
    });

    it("renders, saves both toggle positions and reloads the saved virtual value", async () => {
        wrapper = mountTab();
        await flushPromises();
        const selector = '[aria-label="configurationEzLandingLabel"]';
        expect(wrapper.find(selector).exists()).toBe(true);
        expect(wrapper.vm.ezLandingEnabled).toBe(false);
        expect(wrapper.vm.dirty).toBe(false);

        wrapper.findComponent<ComponentPublicInstance>(selector).vm.$emit("update:modelValue", true);
        await flushPromises();
        expect(wrapper.vm.dirty).toBe(true);
        await expect(getSetting("mixer_type")).resolves.toBe("LEGACY");
        await wrapper.vm.saveConfig();
        await expect(getSetting("mixer_type")).resolves.toBe("EZLANDING");

        wrapper.unmount();
        VirtualFC.setVirtualConfig();
        wrapper = mountTab();
        await flushPromises();
        expect(wrapper.vm.ezLandingEnabled).toBe(true);
        wrapper.findComponent<ComponentPublicInstance>(selector).vm.$emit("update:modelValue", false);
        await flushPromises();
        await wrapper.vm.saveConfig();
        await expect(getSetting("mixer_type")).resolves.toBe("LEGACY");
    });
});
