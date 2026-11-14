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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import WaypointEditor from "@/components/tabs/FlightPlan/WaypointEditor.vue";
import { useDisplayUnits } from "@/composables/useDisplayUnits";

const showEditorDialog = ref(false);
const editingWaypointUid = ref<string | null>(null);
const editingWaypoint = ref<unknown>(null);
const addWaypoint = vi.fn<(waypoint: { speed: number }) => boolean>(() => true);
const updateWaypoint = vi.fn(() => true);
vi.mock("@/composables/useFlightPlan", () => ({
    useFlightPlan: () => ({
        showEditorDialog,
        editingWaypointUid,
        editingWaypoint,
        addWaypoint,
        updateWaypoint,
        cancelEdit: vi.fn(),
        isModifierWaypointType: (type: string) => ["yaw_rate", "alt_change", "delay"].includes(type),
    }),
}));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const Input = defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<input type="number" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))">`,
});
const Dialog = defineComponent({ template: "<div><slot/><slot name='footer'/></div>" });
const Row = defineComponent({ template: "<div><slot/></div>" });
const Button = defineComponent({ template: "<button><slot/></button>" });

function editor() {
    return mount(WaypointEditor, {
        global: {
            mocks: { $t: (key: string) => key },
            stubs: { Dialog, SettingRow: Row, UInputNumber: Input, USelect: true, UButton: Button },
        },
    });
}

describe("waypoint editing when display units change", () => {
    beforeEach(() => {
        useDisplayUnits().setUnitSystem("imperial");
        showEditorDialog.value = false;
        editingWaypointUid.value = null;
        editingWaypoint.value = null;
        addWaypoint.mockClear();
        updateWaypoint.mockClear();
    });

    it("preserves edited physical values across repeated switches and save", async () => {
        const wrapper = editor();
        showEditorDialog.value = true;
        await nextTick();
        const inputs = wrapper.findAll("input");
        await inputs[2]!.setValue("401");
        await inputs[3]!.setValue("10.3");
        await inputs[2]!.trigger("blur");
        await inputs[3]!.trigger("blur");
        expect((inputs[2]!.element as HTMLInputElement).value).toBe("401");
        useDisplayUnits().setUnitSystem("metric");
        await nextTick();
        expect((inputs[2]!.element as HTMLInputElement).value).toBe("122");
        useDisplayUnits().setUnitSystem("imperial");
        await nextTick();
        expect((inputs[2]!.element as HTMLInputElement).value).toBe("401");
        useDisplayUnits().setUnitSystem("british");
        await nextTick();
        expect((inputs[2]!.element as HTMLInputElement).value).toBe("122");
        expect((inputs[3]!.element as HTMLInputElement).value).toBe("10.3");
        await wrapper.find("form").trigger("submit");
        expect(addWaypoint).toHaveBeenCalledWith(expect.objectContaining({ altitude: 401 }));
        expect(addWaypoint.mock.calls[0]![0].speed).toBeCloseTo(10.3 / 1.150779448, 6);
        wrapper.unmount();
    });

    it("does not round an untouched saved waypoint when units change", async () => {
        const wrapper = editor();
        editingWaypointUid.value = "wp";
        editingWaypoint.value = {
            latitude: 1,
            longitude: 2,
            altitude: 400.3,
            speed: 10.26,
            type: "flyover",
            duration: 1,
            pattern: "circle",
        };
        showEditorDialog.value = true;
        await nextTick();
        useDisplayUnits().setUnitSystem("metric");
        await nextTick();
        await wrapper.find("form").trigger("submit");
        expect(updateWaypoint).toHaveBeenCalledWith("wp", expect.objectContaining({ altitude: 400.3, speed: 10.26 }));
        wrapper.unmount();
    });
});
