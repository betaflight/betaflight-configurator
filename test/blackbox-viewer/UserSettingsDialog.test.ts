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

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import UserSettingsDialog from "../../src/blackbox-viewer/components/UserSettingsDialog.vue";
import { mixerList, type UserSettings } from "../../src/blackbox-viewer/user_settings_data";

// The modal renders its slots; the first switch is "Custom", the first select the mixer.
const stubs = {
    UModal: defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("div", [slots.header?.(), slots.body?.(), slots.footer?.()]),
    }),
    USwitch: defineComponent({
        props: { modelValue: Boolean },
        emits: ["update:modelValue"],
        setup:
            (props, { emit }) =>
            () =>
                h("input", {
                    type: "checkbox",
                    class: "switch",
                    checked: props.modelValue,
                    onChange: (e: Event) => emit("update:modelValue", (e.target as HTMLInputElement).checked),
                }),
    }),
    USelect: defineComponent({
        props: { modelValue: [Number, String] },
        emits: ["update:modelValue"],
        setup:
            (_, { emit }) =>
            () =>
                h("select", {
                    class: "select",
                    onChange: (e: Event) => emit("update:modelValue", Number((e.target as HTMLSelectElement).value)),
                }),
    }),
    UButton: defineComponent({
        props: { label: String },
        setup: (props) => () => h("button", { class: "button" }, props.label),
    }),
    UInputNumber: true,
    UIcon: true,
    UTooltip: defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("span", slots.default?.()),
    }),
};

// Nuxt UI components resolve under their own names (Modal, Switch, ...) as well as U-prefixed.
const allStubs = {
    ...stubs,
    ...Object.fromEntries(Object.entries(stubs).map(([name, stub]) => [name.slice(1), stub])),
};

async function saveWithCustom(mixer?: number): Promise<UserSettings> {
    const wrapper = mount(UserSettingsDialog, { props: { open: true }, global: { stubs: allStubs } });
    await wrapper.findAll("input.switch")[0].setValue(true);
    if (mixer !== undefined) {
        const select = wrapper.findAll("select.select")[0];
        select.element.innerHTML = `<option value="${mixer}"></option>`;
        await select.setValue(String(mixer));
    }
    await nextTick();
    await wrapper
        .findAll("button.button")
        .find((b) => b.text() === "Save")!
        .trigger("click");
    const saved = wrapper.emitted("save")![0][0] as UserSettings;
    wrapper.unmount();
    return saved;
}

describe("UserSettingsDialog custom mix", () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    // The craft renderers read customMix.motorOrder.length, so `{}` broke them.
    it("saves the selected mixer's motor order and yaw offset when Custom is on", async () => {
        const saved = await saveWithCustom();

        const quadX = mixerList[2];
        expect(saved.customMix).toEqual({ motorOrder: quadX.defaultMotorOrder, yawOffset: quadX.defaultYawOffset });
    });

    it("follows a mixer chosen after Custom was switched on", async () => {
        const saved = await saveWithCustom(10);

        const hexX = mixerList[9];
        expect(saved.mixerConfiguration).toBe(10);
        expect(saved.customMix).toEqual({ motorOrder: hexX.defaultMotorOrder, yawOffset: hexX.defaultYawOffset });
    });
});
