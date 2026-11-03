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
import { shallowMount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import LedStripTab from "../../src/components/tabs/LedStripTab.vue";
import LedSetupWizard from "../../src/components/tabs/led_strip/LedSetupWizard.vue";
import LedWizardPreview from "../../src/components/tabs/led_strip/LedWizardPreview.vue";
import { buildLedWizardPlan, defaultLedWizardModel } from "../../src/composables/ledWizard";
import LedGrid from "../../src/components/tabs/led_strip/LedGrid.vue";
import BaseTab from "../../src/components/tabs/BaseTab.vue";
import { useFlightControllerStore } from "../../src/stores/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { decodeMsp, resetLedTestState, setupLedStore } from "../ledTestUtils";
import englishMessages from "../../locales/en/messages.json";

const { saveToEeprom } = vi.hoisted(() => ({ saveToEeprom: vi.fn() }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));

function translate(key: string, params?: Record<string, string | number>) {
    const countMessages = [
        "ledWizardPhysicalCount",
        "ledWizardPerArm",
        "ledWizardCountSplit",
        "ledWizardCountCapacity",
        "ledWizardRecognizedStrip",
    ];
    const message = countMessages.includes(key) ? englishMessages[key as keyof typeof englishMessages].message : key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ""));
}

beforeEach(() => {
    resetLedTestState();
    vi.mocked(MSP.promise).mockImplementation(async (code) => {
        if (code === MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES) decodeMsp(code, [40, 33, 0, 72, 0]);
    });
    saveToEeprom.mockResolvedValue(undefined);
});

describe("Wizard and Advanced share the actual tab state", () => {
    const mountTab = () =>
        shallowMount(LedStripTab, {
            global: {
                renderStubDefaultSlot: true,
                mocks: { $t: translate },
                stubs: {
                    LedSetupWizard: false,
                    InputNumber: false,
                    NumberFieldRoot: false,
                    NumberFieldInput: false,
                    Primitive: false,
                    FormField: false,
                    LedWizardPreview: false,
                    Button: {
                        props: ["label", "disabled", "loading"],
                        emits: ["click"],
                        template:
                            '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>',
                    },
                },
            },
        });
    let wrapper: ReturnType<typeof mountTab>;
    afterEach(() => wrapper?.unmount());
    const click = async (label: string) => {
        const button = wrapper.findAll("button").find((button) => button.text() === label);
        expect(button, label).toBeDefined();
        await button!.trigger("click");
        await flushPromises();
    };

    it("keeps Wizard and Save disabled after the real decoder receives a truncated strip reply", async () => {
        const fc = setupLedStore();
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP_LED_STRIP_CONFIG) decodeMsp(code, [0, 0, 0, 1, 2]);
        });
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            wrapper = mountTab();
            wrapper.findComponent(BaseTab).vm.$emit("mounted");
            await flushPromises();
            expect(fc.ledStrip).toEqual([]);
            expect(wrapper.text()).toContain("ledStripLoadFailed");
            for (const label of ["ledWizardTitle", "save"]) {
                const button = wrapper.findAll("button").find((button) => button.text() === label);
                expect(button, label).toBeDefined();
                expect(button!.attributes("disabled")).toBeDefined();
            }
            expect(wrapper.findComponent(LedSetupWizard).exists()).toBe(false);
            expect(wrapper.find(".grid-container").attributes("inert")).toBeDefined();
            expect(wrapper.find(".controls").attributes("inert")).toBeDefined();
            expect(MSP.promise).toHaveBeenCalledTimes(1);
            expect(saveToEeprom).not.toHaveBeenCalled();
        } finally {
            consoleError.mockRestore();
        }
    });

    it("opening/reviewing sends nothing; Apply refreshes Advanced; Save uses the shared path", async () => {
        const fc = setupLedStore();
        fc.ledStrip[0] = { x: 15, y: 15, color: 3, functions: "fo", directions: "n" };
        wrapper = mountTab();
        wrapper.findComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        const before = JSON.stringify(fc.$state);
        vi.mocked(MSP.promise).mockClear();
        vi.mocked(MSP.send_message).mockClear();
        await click("ledWizardTitle");
        expect(wrapper.findComponent(LedSetupWizard).text()).toContain("ledWizardCustom");
        expect(JSON.stringify(fc.$state)).toBe(before);
        await click("ledWizardReview");
        expect(JSON.stringify(fc.$state)).toBe(before);
        await click("ledWizardApply");
        expect(MSP.promise).not.toHaveBeenCalled();
        expect(MSP.send_message).not.toHaveBeenCalled();
        const grid = wrapper.findComponent(LedGrid).props("gridLeds");
        expect(grid[7 * 16 + 7]).toMatchObject({ wireNumber: "0", functions: ["a"] });
        expect(grid.filter((cell: { wireNumber: string }) => cell.wireNumber !== "")).toHaveLength(16);
        expect(wrapper.text()).toContain("ledWizardApplied");
        await click("save");
        expect(saveToEeprom).toHaveBeenCalledOnce();
        await nextTick();
        await click("ledWizardTitle");
        expect(wrapper.findComponent(LedSetupWizard).text()).not.toContain("ledWizardCustomNote");
    });

    it.each(["outward", "inward"] as const)(
        "parallel Apply and reopen preserve the complete native configuration: %s",
        async (direction) => {
            const fc = setupLedStore();
            const source = {
                apiVersion: fc.config.apiVersion,
                advanced: true,
                profile: 2,
                strip: fc.ledStrip,
                colors: fc.ledColors,
                modeColors: fc.ledModeColors,
                configValues: fc.ledConfigValues,
            };
            const model = {
                ...defaultLedWizardModel(source),
                topology: "parallel" as const,
                count: 4,
                layout: "four" as const,
                direction,
            };
            const plan = buildLedWizardPlan(model, source);
            fc.$patch({ ledStrip: plan.strip, ledModeColors: plan.modeColors });
            wrapper = mountTab();
            wrapper.findComponent(BaseTab).vm.$emit("mounted");
            await flushPromises();
            const before = JSON.stringify(fc.$state);
            vi.mocked(MSP.promise).mockClear();
            vi.mocked(MSP.send_message).mockClear();
            await click("ledWizardTitle");
            expect(wrapper.findComponent(LedSetupWizard).text()).not.toContain("ledWizardCustomNote");
            await click("ledWizardReview");
            expectNoChanges();
            expect(JSON.stringify(fc.$state)).toBe(before);
            expect(MSP.promise).not.toHaveBeenCalled();
            expect(MSP.send_message).not.toHaveBeenCalled();
            expect(
                wrapper
                    .findComponent(LedGrid)
                    .props("gridLeds")
                    .filter((cell: { wireNumber: string }) => cell.wireNumber !== ""),
            ).toHaveLength(4);
            await click("ledWizardTitle");
            expect(wrapper.findComponent(LedSetupWizard).text()).not.toContain("ledWizardCustomNote");
        },
    );

    it("switches compatible disarmed options and reviews parallel counts with color labels", async () => {
        const fc = setupLedStore();
        fc.ledColors[10].h = 240;
        fc.ledColors[6].h = 115;
        wrapper = mountTab();
        wrapper.findComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        await click("ledWizardTitle");
        const wizard = wrapper.findComponent(LedSetupWizard);
        const select = (id: string) =>
            wizard
                .findAllComponents({ name: "FormField" })
                .find((item) => item.props("name") === `led-${id}`)!
                .findComponent({ name: "Select" });
        select("wizard-disarmed").vm.$emit("update:modelValue", "static");
        await nextTick();
        select("wizard-disarmed-color").vm.$emit("update:modelValue", 6);
        select("wizard-armed").vm.$emit("update:modelValue", "thrust");
        await nextTick();
        expect(select("wizard-disarmed").props("items")).toEqual([
            { value: "firmware", label: "ledWizardFirmwarePattern" },
        ]);
        expect(wizard.find('[role="alert"]').exists()).toBe(false);
        expect(wizard.text().match(/ledWizardThrustNote/g)).toHaveLength(1);
        select("wizard-armed").vm.$emit("update:modelValue", "static");
        await nextTick();
        expect(select("wizard-disarmed").props("modelValue")).toBe("static");
        expect(select("wizard-disarmed-color").props("modelValue")).toBe(6);
        expect(select("wizard-disarmed").props("items")).toEqual([
            { value: "off", label: "off" },
            { value: "static", label: "ledWizardStatic" },
        ]);
        expect(wizard.find('[role="alert"]').exists()).toBe(false);
        select("wizard-topology").vm.$emit("update:modelValue", "parallel");
        await nextTick();
        expect(wizard.findComponent({ name: "InputNumber" }).props("modelValue")).toBe(4);
        expect(wizard.text()).not.toContain("ledWizardPerArm");
        await click("ledWizardReview");
        expect(wizard.find('[aria-live="polite"]').text()).toContain("ledWizardReplaceParallelSummary");
        expect(wizard.find(".review-details").text()).toContain("colorBlue (10)");
        expect(wizard.find(".review-details").text()).toContain("colorGreen (6)");
    });

    async function openWizard(capacity = 32) {
        const fc = setupLedStore();
        fc.ledStrip = Array.from({ length: capacity }, () => ({ ...fc.ledStrip[0] }));
        wrapper = mountTab();
        wrapper.findComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        await click("ledWizardTitle");
        return wrapper.findComponent(LedSetupWizard);
    }
    const fieldSelect = (name: string) =>
        wrapper
            .findComponent(LedSetupWizard)
            .findAllComponents({ name: "FormField" })
            .find((field) => field.props("name") === `led-wizard-${name}`)!
            .findComponent({ name: "Select" });
    async function chooseTopology(value: "serial" | "parallel") {
        fieldSelect("topology").vm.$emit("update:modelValue", value);
        await nextTick();
    }
    async function enterCount(value: string) {
        const input = wrapper.findComponent(LedSetupWizard).findComponent({ name: "InputNumber" }).find("input");
        await input.setValue(value);
        await input.trigger("blur");
        await nextTick();
    }
    const reviewButton = () => wrapper.findAll("button").find((button) => button.text() === "ledWizardReview")!;
    function expectNoChanges() {
        const wizard = wrapper.findComponent(LedSetupWizard);
        expect(wizard.find('[aria-live="polite"]').text()).toContain("ledWizardNoChanges");
        expect(wizard.text()).not.toContain("ledWizardReplace");
        expect(wizard.text()).not.toContain("ledWizardApplyNote");
        expect(wrapper.findAll("button").some((button) => button.text() === "ledWizardApply")).toBe(false);
        expect(wrapper.find(".content_toolbar button").attributes("disabled")).toBeDefined();
        expect(wrapper.text()).not.toContain("ledWizardApplied");
    }

    it("reloads parallel 2 x 16 as a single strip, explains it and reviews equivalent wiring without dirtying", async () => {
        await openWizard();
        await chooseTopology("parallel");
        fieldSelect("layout").vm.$emit("update:modelValue", "two");
        await enterCount("16");
        await click("ledWizardReview");
        await click("ledWizardApply");
        await click("save");
        const fc = useFlightControllerStore();
        const saved = JSON.parse(JSON.stringify({ strip: fc.ledStrip, modeColors: fc.ledModeColors }));
        wrapper.unmount();
        // A new tab load supplies native data only; the previous draft no longer exists.
        fc.$patch({ ledStrip: saved.strip, ledModeColors: saved.modeColors });
        wrapper = mountTab();
        wrapper.findComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        await click("ledWizardTitle");
        const wizard = wrapper.findComponent(LedSetupWizard);
        expect(fieldSelect("topology").props("modelValue")).toBe("serial");
        expect(fieldSelect("layout").props("modelValue")).toBe("strip");
        expect(wizard.text()).toContain("Recognized as a single strip of 16 LEDs.");
        const hint = wizard
            .findAllComponents({ name: "UiBox" })
            .find((box) => box.text().includes("Recognized as a single strip of 16 LEDs."))!;
        expect(hint.props("type")).not.toBe("warning");
        const before = JSON.stringify(fc.$state);
        vi.mocked(MSP.promise).mockClear();
        vi.mocked(MSP.send_message).mockClear();
        await chooseTopology("parallel");
        fieldSelect("layout").vm.$emit("update:modelValue", "two");
        await nextTick();
        expect(wizard.text()).not.toContain("Recognized as a single strip of 16 LEDs.");
        expect(wizard.text()).toContain("ledWizardTopologyReopen");
        await click("ledWizardReview");
        expectNoChanges();
        expect(JSON.stringify(fc.$state)).toBe(before);
        expect(MSP.promise).not.toHaveBeenCalled();
        expect(MSP.send_message).not.toHaveBeenCalled();
        fieldSelect("armed-color").vm.$emit("update:modelValue", 6);
        await nextTick();
        expect(wizard.find('[aria-live="polite"]').exists()).toBe(false);
        await click("ledWizardReview");
        expect(wizard.text()).toContain("ledWizardReplaceParallelSummary");
        await click("ledWizardApply");
        expect(fc.ledModeColors.find((color) => color.mode === 6 && color.direction === 1)?.color).toBe(6);
        expect(wrapper.text()).toContain("ledWizardApplied");
    });

    it.each(["topology", "layout"])(
        "dismisses the recognized-strip hint permanently after a %s change",
        async (field) => {
            await openWizard();
            fieldSelect("layout").vm.$emit("update:modelValue", "strip");
            await nextTick();
            await click("ledWizardReview");
            await click("ledWizardApply");
            await click("save");
            await click("ledWizardTitle");
            const wizard = wrapper.findComponent(LedSetupWizard);
            expect(wizard.text()).toContain("Recognized as a single strip of 16 LEDs.");
            fieldSelect("armed-color").vm.$emit("update:modelValue", 6);
            await nextTick();
            expect(wizard.text()).toContain("Recognized as a single strip of 16 LEDs.");
            fieldSelect(field).vm.$emit("update:modelValue", field === "topology" ? "parallel" : "two");
            await nextTick();
            expect(wizard.text()).not.toContain("Recognized as a single strip of 16 LEDs.");
            fieldSelect(field).vm.$emit("update:modelValue", field === "topology" ? "serial" : "strip");
            await nextTick();
            expect(wizard.text()).not.toContain("Recognized as a single strip of 16 LEDs.");
        },
    );

    it.each(["empty", "custom", "four"])("does not show the single-strip hint for %s configurations", async (kind) => {
        const fc = setupLedStore();
        if (kind === "custom") fc.ledStrip[0] = { x: 15, y: 12, color: 3, functions: "fo", directions: "n" };
        wrapper = mountTab();
        wrapper.findComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        await click("ledWizardTitle");
        if (kind === "four") {
            await click("ledWizardReview");
            await click("ledWizardApply");
            await click("save");
            await click("ledWizardTitle");
            expect(fieldSelect("layout").props("modelValue")).toBe("four");
        }
        expect(wrapper.findComponent(LedSetupWizard).text()).not.toContain("Recognized as a single strip of 16 LEDs.");
    });

    it("reviews an unused disarmed-color edit as unchanged but a brightness edit as a replacement", async () => {
        await openWizard();
        await click("ledWizardReview");
        await click("ledWizardApply");
        await click("save");
        await click("ledWizardTitle");
        fieldSelect("disarmed").vm.$emit("update:modelValue", "static");
        await nextTick();
        fieldSelect("disarmed-color").vm.$emit("update:modelValue", 6);
        fieldSelect("disarmed").vm.$emit("update:modelValue", "off");
        await nextTick();
        await click("ledWizardReview");
        expectNoChanges();
        const wizard = wrapper.findComponent(LedSetupWizard);
        wizard.findComponent({ name: "Slider" }).vm.$emit("update:modelValue", 50);
        await nextTick();
        await click("ledWizardReview");
        expect(wizard.text()).toContain("ledWizardReplaceSummary");
        expect(wrapper.findAll("button").some((button) => button.text() === "ledWizardApply")).toBe(true);
    });
    function expectEmptyCount() {
        const wizard = wrapper.findComponent(LedSetupWizard);
        const number = wizard.findComponent({ name: "InputNumber" });
        expect(number.props("modelValue")).toBeUndefined();
        expect(number.find("input").element.value).toBe("");
        expect(wizard.text()).toContain("Physical LEDs: —");
        expect(wizard.text()).toContain("ledWizardErrorCount");
        expect(wizard.html()).not.toContain("NaN");
        expect(reviewButton().attributes("disabled")).toBeDefined();
        expect(wizard.find('[aria-live="polite"]').exists()).toBe(false);
        expect(wrapper.findAll("button").some((button) => button.text() === "ledWizardApply")).toBe(false);
    }

    it("preserves 16 physical LEDs when only topology changes in either direction and invalidates review", async () => {
        const wizard = await openWizard();
        expect(wizard.findComponent({ name: "InputNumber" }).props("modelValue")).toBe(16);
        expect(wizard.text()).toContain("Physical LEDs: 16");
        expect(wizard.text()).not.toContain("ledWizardTopologyReopen");
        await click("ledWizardReview");
        expect(wizard.find('[aria-live="polite"]').exists()).toBe(true);
        await chooseTopology("parallel");
        expect(wizard.findComponent({ name: "InputNumber" }).props("modelValue")).toBe(4);
        expect(wizard.text()).toContain("Physical LEDs: 16");
        expect(wizard.text()).toContain("ledWizardTopologyReopen");
        expect(wizard.find('[aria-live="polite"]').exists()).toBe(false);
        expect(reviewButton().attributes("disabled")).toBeUndefined();
        await chooseTopology("serial");
        expect(wizard.findComponent({ name: "InputNumber" }).props("modelValue")).toBe(16);
        expect(wizard.text()).toContain("Physical LEDs: 16");
        expect(wizard.text()).not.toContain("ledWizardTopologyReopen");
        expect(wizard.find('[aria-live="polite"]').exists()).toBe(false);
    });

    it("clears a non-divisible serial count with a field explanation until a new number is entered", async () => {
        const wizard = await openWizard();
        await enterCount("15");
        await chooseTopology("parallel");
        expectEmptyCount();
        expect(wizard.text()).toContain("15 LEDs cannot be split evenly across 4 arms. Enter LEDs per arm.");
        await enterCount("4");
        expect(wizard.text()).not.toContain("cannot be split");
        expect(wizard.text()).toContain("Physical LEDs: 16");
        expect(reviewButton().attributes("disabled")).toBeUndefined();
    });

    it("clears a parallel count when serial slots exceed capacity and permits correction", async () => {
        const wizard = await openWizard(64);
        await chooseTopology("parallel");
        await enterCount("20");
        await click("ledWizardReview");
        await chooseTopology("serial");
        expectEmptyCount();
        expect(wizard.text()).toContain("LEDs per arm / strip: —");
        expect(wizard.text()).toContain("Serial wiring needs 80 LED slots; the controller supports 64.");
        await enterCount("64");
        expect(wizard.text()).not.toContain("Serial wiring needs");
        expect(wizard.text()).toContain("Physical LEDs: 64");
        expect(reviewButton().attributes("disabled")).toBeUndefined();
    });

    it.each(["serial", "parallel"] as const)("handles the real InputNumber empty emission for %s", async (topology) => {
        const wizard = await openWizard();
        await chooseTopology(topology);
        await click("ledWizardReview");
        await enterCount("");
        expect(wizard.findComponent({ name: "InputNumber" }).emitted("update:modelValue")?.at(-1)).toEqual([undefined]);
        expectEmptyCount();
    });

    it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
        "normalizes an empty or non-finite InputNumber update: %s",
        async (value) => {
            const wizard = await openWizard();
            wizard.findComponent({ name: "InputNumber" }).vm.$emit("update:modelValue", value);
            await nextTick();
            expectEmptyCount();
        },
    );

    it.each(["two", "strip"] as const)("preserves the physical total for %s layouts", async (layout) => {
        const wizard = await openWizard();
        fieldSelect("layout").vm.$emit("update:modelValue", layout);
        await nextTick();
        await chooseTopology("parallel");
        expect(wizard.findComponent({ name: "InputNumber" }).props("modelValue")).toBe(layout === "two" ? 8 : 16);
        expect(wizard.text()).toContain("Physical LEDs: 16");
        await chooseTopology("serial");
        expect(wizard.findComponent({ name: "InputNumber" }).props("modelValue")).toBe(16);
    });

    it.each(["two", "four"] as const)("labels every LED on %s parallel arms of eight LEDs", async (layout) => {
        const wizard = await openWizard();
        fieldSelect("layout").vm.$emit("update:modelValue", layout);
        await nextTick();
        await chooseTopology("parallel");
        await enterCount("8");
        const arms = wizard.findComponent(LedWizardPreview).findAll("svg > g");
        expect(arms).toHaveLength(layout === "two" ? 2 : 4);
        for (const arm of arms) {
            expect(arm.findAll(":scope > g > text").map((label) => label.text())).toEqual([
                "0",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
            ]);
        }
    });

    it("keeps the Wizard and Save disabled after a failed load", async () => {
        setupLedStore();
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("offline"));
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        wrapper = mountTab();
        wrapper.findComponent(BaseTab).vm.$emit("mounted");
        await flushPromises();
        expect(wrapper.text()).toContain("ledStripLoadFailed");
        expect(
            wrapper
                .findAll("button")
                .find((button) => button.text() === "ledWizardTitle")!
                .attributes("disabled"),
        ).toBeDefined();
        expect(saveToEeprom).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe("Rendered native LED indices", () => {
    it.each(["serial", "parallel"] as const)("renders both wiring directions for %s", (topology) => {
        const fc = setupLedStore();
        const source = {
            apiVersion: fc.config.apiVersion,
            advanced: true,
            profile: 2,
            strip: fc.ledStrip,
            colors: fc.ledColors,
            modeColors: fc.ledModeColors,
            configValues: fc.ledConfigValues,
        };
        for (const direction of ["outward", "inward"] as const) {
            const model = {
                ...defaultLedWizardModel(source),
                topology,
                count: topology === "serial" ? 16 : 4,
                direction,
            };
            const preview = shallowMount(LedWizardPreview, {
                props: { model, color: "", off: true },
                global: {
                    mocks: { $t: (key: string, params?: { index: number }) => (params ? `Arm ${params.index}` : key) },
                },
            });
            const sequence = direction === "outward" ? [0, 1, 2, 3] : [3, 2, 1, 0];
            const expected = [0, 1, 2, 3].flatMap((arm) =>
                sequence.map((index) => String(index + (topology === "serial" ? arm * 4 : 0))),
            );
            expect(preview.findAll("svg > g > g > text").map((text) => text.text())).toEqual(expected);
            expect(preview.findAll(".arm-label").map((text) => text.text())).toEqual([
                "Arm 1",
                "Arm 2",
                "Arm 3",
                "Arm 4",
            ]);
            expect(preview.findAll(".off-mark")).toHaveLength(16);
            preview.unmount();
        }
    });
});

describe("Preview label spacing", () => {
    const cases = (["strip", "two", "four"] as const).flatMap((layout) =>
        (["serial", "parallel"] as const).flatMap((topology) =>
            (["outward", "inward"] as const).map((direction) => ({ layout, topology, direction })),
        ),
    );
    it.each(cases)(
        "separates labels and arrows for $layout / $topology / $direction with 16 LEDs per arm",
        ({ layout, topology, direction }) => {
            const armTotal = { strip: 1, two: 2, four: 4 }[layout];
            const preview = shallowMount(LedWizardPreview, {
                props: {
                    model: {
                        topology,
                        layout,
                        direction,
                        count: topology === "serial" ? armTotal * 16 : 16,
                        armed: "static",
                        armedColor: 10,
                        disarmed: "off",
                        disarmedColor: 0,
                        warnings: false,
                        brightness: 50,
                    },
                    color: "",
                    off: false,
                },
                global: { mocks: { $t: (key: string) => key } },
            });
            try {
                const labels = preview.findAll("svg > g > g > text").map((label) => ({
                    x: Number(label.attributes("x")),
                    y: Number(label.attributes("y")),
                    text: label.text(),
                }));
                expect(labels).toHaveLength(layout === "strip" ? 16 : armTotal * 2);
                for (let arm = 0; arm < armTotal; arm++) {
                    const numbers = preview
                        .findAll("svg > g")
                        [arm].findAll(":scope > g > text")
                        .map((label) => Number(label.text()));
                    const first = topology === "serial" ? arm * 16 : 0;
                    const endpoints = direction === "outward" ? [first, first + 15] : [first + 15, first];
                    expect([numbers[0], numbers.at(-1)]).toEqual(endpoints);
                }
                labels.forEach((label, index) => {
                    for (const other of labels.slice(index + 1)) {
                        expect(Math.hypot(label.x - other.x, label.y - other.y)).toBeGreaterThanOrEqual(20);
                    }
                });
                for (const arrow of preview.findAll(".arrow")) {
                    const points: { x: number; y: number }[] = [];
                    let x = 0;
                    let y = 0;
                    for (const match of (arrow.attributes("d") ?? "").matchAll(/([MLml])\s+(-?[\d.]+)\s+(-?[\d.]+)/g)) {
                        const relative = match[1] === match[1].toLowerCase();
                        x = (relative ? x : 0) + Number(match[2]);
                        y = (relative ? y : 0) + Number(match[3]);
                        points.push({ x, y });
                    }
                    expect(points).toHaveLength(5);
                    for (const label of labels) {
                        const halfWidth = label.text.length * 4;
                        const separated =
                            Math.max(...points.map((point) => point.x)) + 2 < label.x - halfWidth ||
                            Math.min(...points.map((point) => point.x)) - 2 > label.x + halfWidth ||
                            Math.max(...points.map((point) => point.y)) + 2 < label.y - 12 ||
                            Math.min(...points.map((point) => point.y)) - 2 > label.y;
                        expect(separated, `arrow intersects label ${label.text}`).toBe(true);
                    }
                }
            } finally {
                preview.unmount();
            }
        },
    );
});
