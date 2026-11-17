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
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import type { ComponentPublicInstance } from "vue";
import LedStripTab from "../../src/components/tabs/LedStripTab.vue";
import BaseTab from "../../src/components/tabs/BaseTab.vue";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { decodeMsp, resetLedTestState, setupLedStore } from "../ledTestUtils";

const { saveToEeprom } = vi.hoisted(() => ({ saveToEeprom: vi.fn() }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));

beforeEach(() => {
    resetLedTestState();
    vi.mocked(MSP.promise).mockImplementation(async (code) => {
        if (code === MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES) decodeMsp(code, [40, 33, 0, 72, 0]);
    });
    saveToEeprom.mockResolvedValue(undefined);
});

describe("LED tab load failure", () => {
    it("locks Advanced editing and Save when the decoded main response is incomplete", async () => {
        const fc = setupLedStore();
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP_LED_STRIP_CONFIG) decodeMsp(code, [0, 0, 0, 1, 2]);
        });
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const wrapper = shallowMount(LedStripTab, {
            global: {
                renderStubDefaultSlot: true,
                mocks: { $t: (key: string) => key },
                stubs: {
                    Button: {
                        props: ["label", "disabled", "loading"],
                        template: '<button :disabled="disabled || loading">{{ label }}</button>',
                    },
                },
            },
        });
        try {
            wrapper.findComponent(BaseTab).vm.$emit("mounted");
            await flushPromises();
            expect(fc.ledStrip).toEqual([]);
            expect(fc.ledStripAdvanced).toBeNull();
            expect(fc.ledStripProfile).toBeNull();
            expect(wrapper.text()).toContain("ledStripLoadFailed");
            expect(wrapper.find(".grid-container").attributes("inert")).toBeDefined();
            expect(wrapper.find(".controls").attributes("inert")).toBeDefined();
            const save = wrapper.findAll("button").find((button) => button.text() === "save");
            expect(save).toBeDefined();
            expect(save!.attributes("disabled")).toBeDefined();
            expect(MSP.promise).toHaveBeenCalledTimes(1);
            expect(MSP.send_message).not.toHaveBeenCalled();
            expect(saveToEeprom).not.toHaveBeenCalled();
        } finally {
            wrapper.unmount();
            consoleError.mockRestore();
        }
    });
});

describe("LED color sliders", () => {
    async function loadTabAndSelectColor(index: number) {
        const errorHandler = vi.fn();
        const wrapper = shallowMount(LedStripTab, {
            global: {
                renderStubDefaultSlot: true,
                mocks: { $t: (key: string) => key },
                config: { errorHandler },
                stubs: { SubtabNav: { template: '<div><slot name="advanced" /></div>' } },
            },
        });
        onTestFinished(() => wrapper.unmount());
        wrapper.getComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        expect([undefined, "false"]).toContain(wrapper.get(".controls").attributes("inert"));
        await wrapper.get(`.colors .color-${index}`).trigger("click");
        function moveSlider(channel: "H" | "S" | "V", value: number) {
            wrapper
                .getComponent<ComponentPublicInstance>(`#colorSlider${channel}`)
                .vm.$emit("update:modelValue", value);
        }
        return { moveSlider, errorHandler };
    }

    it.each([
        { description: "an empty Basic palette", advanced: false, length: 0, index: 0 },
        { description: "a missing entry in a partial palette", advanced: true, length: 1, index: 1 },
    ])("ignores slider updates for $description", async ({ advanced, length, index }) => {
        const fc = setupLedStore();
        fc.ledStripAdvanced = advanced;
        fc.ledColors = fc.ledColors.slice(0, length);
        const palette = fc.ledColors.map((color) => ({ ...color }));
        const { moveSlider, errorHandler } = await loadTabAndSelectColor(index);
        const strip = fc.ledStrip;

        moveSlider("H", 75);

        expect(errorHandler).not.toHaveBeenCalled();
        expect(fc.ledColors).toEqual(palette);
        expect(fc.ledStrip).toBe(strip);
    });

    it("updates the selected HSV color and rebuilds the strip for a valid entry", async () => {
        const fc = setupLedStore();
        const { moveSlider, errorHandler } = await loadTabAndSelectColor(1);
        const strip = fc.ledStrip;

        moveSlider("H", 75);
        moveSlider("S", 85);
        moveSlider("V", 95);

        expect(errorHandler).not.toHaveBeenCalled();
        expect(fc.ledColors[1]).toEqual({ h: 75, s: 85, v: 95 });
        expect(fc.ledColors[0]).toEqual({ h: 0, s: 0, v: 0 });
        expect(fc.ledStrip).not.toBe(strip);
    });
});
