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

import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vueuse/core", async (importOriginal) => {
    const original = await importOriginal<typeof import("@vueuse/core")>();
    return {
        ...original,
        useMediaQuery: (query: string) => {
            if (query.includes("575px")) {
                return compact;
            }
            return ref(false);
        },
    };
});

vi.mock("../../src/js/vue_tab_registry", () => ({ VueTabComponents: {} }));
vi.mock("../../src/js/vue_tab_mounter.js", () => ({
    completeVueTabMount: vi.fn(),
    tabAdapterRegistration: {},
    TAB_ADAPTER_REGISTRATION_KEY: "tabAdapterRegistration",
    vueTabState: { activeTabName: null, activeTabKey: 0 },
}));
vi.mock("../../src/composables/useUiLocale", () => ({ useUiLocale: () => ref(undefined) }));

import App from "../../src/App.vue";

const compact = ref(false);

describe("compact connection control", () => {
    let target: HTMLElement;
    let wrapper: ReturnType<typeof shallowMount>;

    beforeEach(() => {
        compact.value = false;
        setActivePinia(createPinia());
        target = document.createElement("div");
        target.className = "floating-connect";
        document.body.appendChild(target);
        wrapper = shallowMount(App, {
            global: {
                renderStubDefaultSlot: true,
                stubs: {
                    Teleport: false,
                    ConnectButton: { template: '<button class="test-connect">Connect</button>' },
                },
            },
        });
    });

    afterEach(() => {
        wrapper.unmount();
        target.remove();
    });

    it("moves the same connection control between the sidebar and floating area when resized", async () => {
        const button = wrapper.element.querySelector(".test-connect");
        expect(button).not.toBeNull();
        expect(target.querySelector(".test-connect")).toBeNull();

        compact.value = true;
        await nextTick();
        expect(target.querySelector(".test-connect")).toBe(button);

        compact.value = false;
        await nextTick();
        expect(wrapper.element.querySelector(".test-connect")).toBe(button);
        expect(target.querySelector(".test-connect")).toBeNull();
    });
});
