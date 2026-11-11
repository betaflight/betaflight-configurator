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

import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sortablejs", () => ({
    default: { create: () => ({ destroy: vi.fn() }) },
}));

import GraphConfigDialog from "../../src/blackbox-viewer/components/GraphConfigDialog.vue";
import type { FlightLogInstance } from "../../src/blackbox-viewer/stores/log";
import type { GraphConfigInstance, GraphPanelConfig } from "../../src/blackbox-viewer/stores/graph";

// "Full range" acts on the range of a field over the whole log. The dialog hands that lookup the
// field name, so each field must get its own range and not the +-500 fallback.
const FIELD = "testField[0]";
const RANGE = { min: -123, max: 456 };

interface MenuEntry {
    label?: string;
    onSelect?: (e: Event) => void;
    children?: MenuEntry[][];
}

// Renders the context menu's items as buttons so a test can pick one by its label. A submenu's
// entries are rendered after its parent, tagged with the parent's label.
function renderEntries(groups: MenuEntry[][], parent = ""): ReturnType<typeof h>[] {
    return groups.flatMap((group) =>
        group.flatMap((item) => [
            h(
                "button",
                {
                    class: "menu-item",
                    "data-path": `${parent}${item.label}`,
                    onClick: () => item.onSelect?.(new Event("select")),
                },
                item.label,
            ),
            ...(item.children ? renderEntries(item.children, `${item.label}/`) : []),
        ]),
    );
}

const stubs = {
    UModal: defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("div", [slots.header?.(), slots.body?.(), slots.footer?.()]),
    }),
    UContextMenu: defineComponent({
        props: { items: { type: Array as PropType<MenuEntry[][]>, default: () => [] } },
        setup:
            (props, { slots }) =>
            () =>
                h("div", [slots.default?.(), ...renderEntries(props.items)]),
    }),
    UiBox: defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("div", [slots.title?.(), slots.default?.()]),
    }),
    UButton: defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("button", slots.default?.()),
    }),
    UDropdownMenu: defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("div", slots.default?.()),
    }),
    UIcon: true,
    UInput: true,
    USelect: true,
    USelectMenu: true,
    UInputNumber: true,
};

// Nuxt UI components resolve under their own names (Modal, Button, ...) as well as U-prefixed.
const allStubs = {
    ...stubs,
    ...Object.fromEntries(
        Object.entries(stubs)
            .filter(([n]) => n.startsWith("U") && n !== "UiBox")
            .map(([name, stub]) => [name.slice(1), stub]),
    ),
};

// A log with a single field. It lacks everything else FlightLog has: no frames, no
// sysConfig contents, no disabled-field flags beyond "none", so the defaults for the field are generic.
const flightLog = {
    getMainFieldNames: () => [FIELD],
    getMainFieldIndexByName: () => undefined,
    getSysConfig: () => ({}),
    isFieldDisabled: () => ({}),
    getMinMaxForFieldDuringAllTime: (name: string) => (name === FIELD ? { ...RANGE } : undefined),
} as unknown as FlightLogInstance;

// A config with one graph of one field, started at the +-500 fallback. It lacks everything but
// the two methods the dialog calls.
const graphConfig = {
    getGraphs: () => [
        {
            label: "Test",
            height: 1,
            fields: [{ name: FIELD, curve: { power: 1, MinMax: { min: -500, max: 500 } } }],
        },
    ],
    extendFields: (_log: unknown, f: unknown) => [f],
} as unknown as GraphConfigInstance;

let wrapper: VueWrapper | null = null;

// ConvertFieldValue reads the user settings store for its unit conversions.
beforeEach(() => {
    setActivePinia(createPinia());
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

// Opens the dialog, right-clicks the field's min/max inputs and returns the last config it emitted.
async function lastUpdateAfter(menuPath: string, shiftKey = false): Promise<GraphPanelConfig[]> {
    wrapper = mount(GraphConfigDialog, {
        props: { open: false, flightLog, graphConfig, grapher: null },
        global: { stubs: allStubs },
    });
    await wrapper.setProps({ open: true });
    await nextTick();

    await wrapper.get("div[style*='display: contents']").trigger("contextmenu", { shiftKey });
    await nextTick();

    await wrapper.get(`button[data-path="${menuPath}"]`).trigger("click");
    const updates = wrapper.emitted("update") as GraphPanelConfig[][][];
    return updates.at(-1)![0];
}

describe("GraphConfigDialog full range during all time", () => {
    it("sets every field to the range over the whole log (menu: Full range)", async () => {
        const [graph] = await lastUpdateAfter("Full range");
        const { min, max } = graph.fields[0].curve!.MinMax!;
        expect({ min, max }).toEqual(RANGE);
    });

    it("sets the selected field to the range over the whole log (menu: field > Full range)", async () => {
        const [graph] = await lastUpdateAfter(`${FIELD}/Full range`);
        const { min, max } = graph.fields[0].curve!.MinMax!;
        expect({ min, max }).toEqual(RANGE);
    });
});
