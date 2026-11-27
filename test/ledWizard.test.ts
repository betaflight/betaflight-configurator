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
import { beforeEach, describe, expect, it } from "vitest";
import { watch } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { setupLedStore } from "./ledTestUtils";
import { useLedSetupWizard } from "../src/composables/useLedSetupWizard";
import {
    buildLedWizardPlan,
    defaultLedWizardModel,
    reconstructLedWizard,
    sameLedWizardConfig,
    validateLedWizard,
    previewArmIndices,
    ringSeqLen,
    type LedWizardSource,
} from "../src/composables/ledWizard";

function fixture(): LedWizardSource {
    return {
        apiVersion: "1.46.0",
        advanced: true,
        profile: 2,
        strip: Array.from({ length: 32 }, () => ({ x: 0, y: 0, color: 0, functions: ["c"], directions: [] })),
        colors: Array.from({ length: 16 }, (_, i) => ({ h: i * 20, s: 0, v: i ? 255 : 0 })),
        modeColors: Array.from({ length: 8 }, (_, direction) => ({ mode: 6, direction, color: direction })),
        configValues: { brightness: 65, rainbow_delta: 33, rainbow_freq: 72 },
    };
}

describe("Wizard to native LED configuration", () => {
    it("defaults to warnings off and preserves any selected black special-color slot", () => {
        const source = fixture();
        source.colors[14].v = 0;
        expect(defaultLedWizardModel(source).warnings).toBe(false);
        for (const armed of ["static", "thrust"] as const) {
            const model = {
                ...defaultLedWizardModel(source),
                armed,
                disarmed: armed === "thrust" ? ("firmware" as const) : ("off" as const),
            };
            const plan = buildLedWizardPlan(model, source);
            plan.modeColors.find((color) => color.direction === (armed === "thrust" ? 3 : 0))!.color = 14;
            const saved = { ...source, ...plan };
            const recovered = reconstructLedWizard(saved);
            expect(recovered).not.toBeNull();
            expect(buildLedWizardPlan(recovered!, saved)).toEqual(plan);
        }
    });

    it.each([
        [8, "four", 4, false],
        [12, "four", 6, false],
        [16, "four", 4, true],
        [20, "four", 5, true],
        [32, "four", 4, true],
        [16, "two", 4, true],
    ] as const)("matches firmware segments for %s/%s", (count, layout, segment, valid) => {
        const source = fixture();
        const model = {
            ...defaultLedWizardModel(source),
            count,
            layout,
            armed: "thrust" as const,
            disarmed: "firmware" as const,
            warnings: true,
        };
        expect(ringSeqLen(count)).toBe(segment);
        expect(validateLedWizard(model, source)).toEqual(valid ? [] : ["ledWizardErrorRingSegment"]);
    });

    it.each([
        ["serial", "strip", 1],
        ["serial", "strip", 2],
        ["parallel", "four", 1],
        ["parallel", "four", 2],
        ["serial", "two", 2],
    ] as const)("reports only the chase limit for %s/%s/%s", (topology, layout, count) => {
        const source = fixture();
        expect(
            validateLedWizard(
                { ...defaultLedWizardModel(source), topology, layout, count, armed: "thrust", disarmed: "firmware" },
                source,
            ),
        ).toEqual(["ledWizardErrorThrustChase"]);
    });

    it.each(["outward", "inward"] as const)(
        "keeps serial and mirrored four-arm indices consistent with native data: %s",
        (direction) => {
            const source = fixture();
            const serial = { ...defaultLedWizardModel(source), direction, count: 16 };
            const parallel = { ...serial, topology: "parallel" as const, count: 4 };
            const displayed = direction === "outward" ? [0, 1, 2, 3] : [3, 2, 1, 0];
            const serialPlan = buildLedWizardPlan(serial, source);
            expect(previewArmIndices(serial)).toEqual(
                [0, 1, 2, 3].map((arm) => displayed.map((index) => index + arm * 4)),
            );
            expect(previewArmIndices(parallel)).toEqual([displayed, displayed, displayed, displayed]);
            // Position of the innermost LED must agree with the displayed native index on every arm.
            previewArmIndices(serial).forEach((indices, arm) =>
                expect(serialPlan.strip[indices[0]]).toMatchObject({ x: arm % 2 ? 8 : 7, y: arm < 2 ? 7 : 8 }),
            );
            const parallelPlan = buildLedWizardPlan(parallel, source);
            expect(parallelPlan).toEqual(
                buildLedWizardPlan({ ...parallel, topology: "serial", layout: "strip" }, source),
            );
            const saved = { ...source, ...parallelPlan };
            const recovered = reconstructLedWizard(saved);
            expect(recovered).not.toBeNull();
            expect(buildLedWizardPlan(recovered!, saved)).toEqual(parallelPlan);
            expect(
                validateLedWizard({ ...parallel, armed: "thrust", disarmed: "firmware", warnings: true }, source),
            ).toEqual([]);
        },
    );
    it("lays out two arms horizontally and a single strip in physical wire order", () => {
        const source = fixture();
        const base = defaultLedWizardModel(source);
        const two = buildLedWizardPlan({ ...base, layout: "two" }, source);
        expect(two.strip.slice(0, 16).map(({ x, y }) => [x, y])).toEqual([
            [7, 8],
            [6, 8],
            [5, 8],
            [4, 8],
            [3, 8],
            [2, 8],
            [1, 8],
            [0, 8],
            [8, 8],
            [9, 8],
            [10, 8],
            [11, 8],
            [12, 8],
            [13, 8],
            [14, 8],
            [15, 8],
        ]);
        const strip = buildLedWizardPlan({ ...base, layout: "strip" }, source);
        expect(strip.strip.slice(0, 16).map(({ x, y }) => [x, y])).toEqual(
            Array.from({ length: 16 }, (_, x) => [x, 0]),
        );
    });
    it("maps 16 physical LEDs in four arm-sized groups from center to outside", () => {
        const source = fixture();
        const plan = buildLedWizardPlan(defaultLedWizardModel(source), source);
        expect(plan.strip.slice(0, 16).map(({ x, y }) => [x, y])).toEqual([
            [7, 7],
            [6, 6],
            [5, 5],
            [4, 4],
            [8, 7],
            [9, 6],
            [10, 5],
            [11, 4],
            [7, 8],
            [6, 9],
            [5, 10],
            [4, 11],
            [8, 8],
            [9, 9],
            [10, 10],
            [11, 11],
        ]);
        expect(plan.strip.slice(16)).toEqual(
            Array.from({ length: 16 }, () => ({ x: 0, y: 0, color: 0, functions: "c", directions: "" })),
        );
    });

    it("maps inward wiring independently for each arm without pretending to reverse the firmware", () => {
        const source = fixture();
        const plan = buildLedWizardPlan({ ...defaultLedWizardModel(source), direction: "inward" }, source);
        expect(plan.strip.slice(0, 8).map(({ x, y }) => [x, y])).toEqual([
            [4, 4],
            [5, 5],
            [6, 6],
            [7, 7],
            [11, 4],
            [10, 5],
            [9, 6],
            [8, 7],
        ]);
    });

    it("uses arm-state special colors and preserves palette and unrelated settings", () => {
        const source = fixture();
        const original = structuredClone(source);
        const plan = buildLedWizardPlan(
            { ...defaultLedWizardModel(source), disarmed: "static", disarmedColor: 4, armedColor: 10, warnings: false },
            source,
        );
        expect(plan.strip.slice(0, 16).every((led) => led.functions === "a" && led.color === 0)).toBe(true);
        expect(plan.modeColors.slice(0, 2).map((color) => color.color)).toEqual([4, 10]);
        expect(plan.modeColors.slice(2)).toEqual(source.modeColors.slice(2));
        expect(plan.configValues).toEqual(source.configValues);
        expect(source).toEqual(original);
    });

    it("generates native thrust only with the truthful firmware disarmed pattern", () => {
        const source = fixture();
        const model = {
            ...defaultLedWizardModel(source),
            armed: "thrust" as const,
            disarmed: "firmware" as const,
            warnings: false,
        };
        const plan = buildLedWizardPlan(model, source);
        expect(plan.strip.slice(0, 16).every((led) => led.functions === "r" && led.color === 10)).toBe(true);
        expect(plan.modeColors.find((color) => color.direction === 3)?.color).toBe(0);
        expect(() => buildLedWizardPlan({ ...model, disarmed: "off" }, source)).toThrow();
        expect(() => buildLedWizardPlan({ ...model, disarmed: "static" }, source)).toThrow();
        expect(buildLedWizardPlan({ ...model, warnings: true }, source).strip[0].functions).toBe("rw");
    });

    it("uses the shared warning overlay on every configured arm-state LED", () => {
        const source = fixture();
        const plan = buildLedWizardPlan({ ...defaultLedWizardModel(source), warnings: true }, source);
        expect(plan.strip.slice(0, 16).every((led) => led.functions === "aw")).toBe(true);
    });

    it.each([0, -1, 1.5, 33, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid LED count %s", (count) => {
        const source = fixture();
        expect(validateLedWizard({ ...defaultLedWizardModel(source), count }, source)).toContain("ledWizardErrorCount");
        expect(() => buildLedWizardPlan({ ...defaultLedWizardModel(source), count }, source)).toThrow();
    });

    it("rejects uneven arms, missing Off colors, bad palette indices and unsupported profiles", () => {
        const source = fixture();
        const model = defaultLedWizardModel(source);
        expect(validateLedWizard({ ...model, count: 15 }, source)).toContain("ledWizardErrorArms");
        expect(validateLedWizard({ ...model, armedColor: 16 }, source)).toContain("ledWizardErrorColor");
        expect(validateLedWizard({ ...model, brightness: 4 }, source)).toContain("ledWizardErrorBrightness");
        expect(validateLedWizard(model, { ...source, profile: 0 })).toContain("ledWizardErrorProfile");
        expect(validateLedWizard(model, { ...source, advanced: false })).toContain("ledWizardErrorProfile");
        expect(validateLedWizard(model, { ...source, colors: source.colors.map((c) => ({ ...c, v: 255 })) })).toContain(
            "ledWizardErrorOffColor",
        );
    });

    it.each(["strip", "two", "four"] as const)("has unique 4-bit coordinates up to grid capacity for %s", (layout) => {
        const source = fixture();
        source.strip = Array.from({ length: 256 }, () => ({ ...source.strip[0] }));
        const plan = buildLedWizardPlan({ ...defaultLedWizardModel(source), count: 256, layout }, source);
        expect(new Set(plan.strip.map((led) => `${led.x},${led.y}`)).size).toBe(256);
        expect(plan.strip.every((led) => led.x >= 0 && led.x <= 15 && led.y >= 0 && led.y <= 15)).toBe(true);
    });

    it.each(["strip", "two", "four"] as const)(
        "reconstructs both directions for %s using array or string letters",
        (layout) => {
            for (const direction of ["inward", "outward"] as const) {
                const source = fixture();
                const model = { ...defaultLedWizardModel(source), layout, direction };
                const plan = buildLedWizardPlan(model, source);
                const saved = {
                    ...source,
                    ...plan,
                    strip: plan.strip.map((led) => ({
                        ...led,
                        functions: Array.from(led.functions),
                        directions: Array.from(led.directions),
                        parameters: 0,
                    })),
                };
                const recovered = reconstructLedWizard(saved);
                expect(recovered).toMatchObject({
                    count: 16,
                    layout,
                    direction,
                    armed: "static",
                    disarmed: "off",
                    warnings: false,
                });
                expect(buildLedWizardPlan(recovered!, saved)).toEqual(plan);
            }
        },
    );

    it("reconstructs thrust and gives identical output on repeated Apply", () => {
        const source = fixture();
        const model = {
            ...defaultLedWizardModel(source),
            armed: "thrust" as const,
            disarmed: "firmware" as const,
            warnings: false,
        };
        const first = buildLedWizardPlan(model, source);
        const saved = { ...source, ...first };
        expect(reconstructLedWizard(saved)).toMatchObject({ armed: "thrust", disarmed: "firmware", armedColor: 10 });
        expect(buildLedWizardPlan(model, saved)).toEqual(first);
    });

    it("classifies unsupported overlays, directions, holes and legacy parameters as custom", () => {
        const source = fixture();
        const plan = buildLedWizardPlan(defaultLedWizardModel(source), source);
        for (const mutation of [
            { functions: "awo" },
            { directions: "n" },
            { parameters: 1 },
            { color: 4 },
            { x: 0, y: 0, functions: "c", color: 0 },
        ]) {
            const strip = plan.strip.map((led) => ({ ...led }));
            Object.assign(strip[3], mutation);
            expect(reconstructLedWizard({ ...source, ...plan, strip })).toBeNull();
        }
    });

    it("preserves unsupported brightness on older APIs", () => {
        const source = { ...fixture(), apiVersion: "1.44.0", configValues: {} };
        expect(buildLedWizardPlan(defaultLedWizardModel(source), source).configValues).toEqual({});
    });
});

describe("Wizard draft and review boundary", () => {
    beforeEach(() => setActivePinia(createPinia()));
    function setup() {
        const fc = setupLedStore();
        const source = fixture();
        fc.$patch({
            ledStrip: source.strip,
            ledConfigValues: source.configValues,
        });
        return fc;
    }
    it.each(["off", "static"] as const)(
        "restores %s and its color without a transient validation error",
        (disarmed) => {
            setup();
            const wizard = useLedSetupWizard();
            wizard.model.value.disarmed = disarmed;
            wizard.model.value.disarmedColor = 6;
            const observed: string[][] = [];
            const stop = watch(wizard.errors, (errors) => observed.push([...errors]), {
                flush: "sync",
                immediate: true,
            });
            wizard.armed.value = "thrust";
            expect(wizard.model.value).toMatchObject({ armed: "thrust", disarmed: "firmware", disarmedColor: 6 });
            wizard.armed.value = "static";
            expect(wizard.model.value).toMatchObject({ armed: "static", disarmed, disarmedColor: 6 });
            expect(observed.length).toBeGreaterThanOrEqual(3);
            expect(observed.every((errors) => errors.length === 0)).toBe(true);
            stop();
        },
    );

    it("falls back to Off when an existing thrust configuration has no static selection", () => {
        const fc = setup();
        const source = fixture();
        const plan = buildLedWizardPlan(
            { ...defaultLedWizardModel(source), armed: "thrust", disarmed: "firmware" },
            source,
        );
        fc.$patch({ ledStrip: plan.strip, ledModeColors: plan.modeColors });
        const wizard = useLedSetupWizard();
        expect(wizard.armed.value).toBe("thrust");
        wizard.armed.value = "static";
        expect(wizard.model.value.disarmed).toBe("off");
        expect(wizard.errors.value).toEqual([]);
    });

    it("opening, editing and reviewing a custom configuration never mutates FC state", () => {
        const fc = setup();
        fc.ledStrip[0] = { x: 15, y: 12, color: 3, functions: "fo", directions: "n" };
        const before = JSON.stringify(fc.$state);
        const wizard = useLedSetupWizard();
        expect(wizard.custom.value).toBe(true);
        wizard.model.value.brightness = 25;
        wizard.reviewChanges();
        expect(wizard.review.value).not.toBeNull();
        expect(JSON.stringify(fc.$state)).toBe(before);
    });

    it("requires review, applies locally and reconstructs when reopened", () => {
        const fc = setup();
        const wizard = useLedSetupWizard();
        expect(wizard.apply()).toBe(false);
        wizard.model.value.brightness = 30;
        wizard.reviewChanges();
        expect(wizard.apply()).toBe(true);
        expect(fc.ledStrip[0].functions).toBe("a");
        expect(fc.ledConfigValues.brightness).toBe(30);
        const reopened = useLedSetupWizard();
        expect(reopened.custom.value).toBe(false);
        expect(reopened.model.value).toMatchObject({ count: 16, layout: "four", brightness: 30 });
    });

    it("invalidates review when the draft or underlying configuration changes", () => {
        const fc = setup();
        const wizard = useLedSetupWizard();
        wizard.reviewChanges();
        wizard.model.value.count = 20;
        expect(wizard.apply()).toBe(false);
        wizard.reviewChanges();
        fc.ledColors[10].h = 90;
        expect(wizard.apply()).toBe(false);
        wizard.reviewChanges();
        fc.ledStripProfile = 0;
        expect(wizard.apply()).toBe(false);
    });

    it("refuses an identical Apply without normalizing decoded LEDs or replacing any native state", () => {
        const fc = setup();
        const initial = useLedSetupWizard();
        initial.model.value.warnings = true;
        initial.reviewChanges();
        expect(initial.apply()).toBe(true);
        fc.ledStrip = fc.ledStrip.map((led, index) => ({
            ...led,
            functions: index < 16 ? ["w", "a"] : [],
            directions: [],
            parameters: 0,
        }));
        const strip = fc.ledStrip;
        const modeColors = fc.ledModeColors;
        const configValues = fc.ledConfigValues;
        const before = JSON.stringify(fc.$state);
        const reopened = useLedSetupWizard();
        reopened.reviewChanges();
        expect(reopened.noChanges.value).toBe(true);
        expect(reopened.apply()).toBe(false);
        expect(fc.ledStrip).toBe(strip);
        expect(fc.ledModeColors).toBe(modeColors);
        expect(fc.ledConfigValues).toBe(configValues);
        expect(JSON.stringify(fc.$state)).toBe(before);
        fc.ledConfigValues.brightness = 30;
        expect(reopened.review.value).toBeNull();
        expect(reopened.noChanges.value).toBe(false);
    });
});

describe("Native configuration equivalence", () => {
    const plan = () => {
        const source = fixture();
        return buildLedWizardPlan({ ...defaultLedWizardModel(source), warnings: true }, source);
    };

    it("compares decoded arrays, letter order, empty slots and default parameters semantically", () => {
        const a = plan();
        const b = structuredClone(a);
        b.strip = b.strip.map((led, index) => ({
            ...led,
            functions: index < 16 ? ["w", "a"] : [],
            directions: [],
            parameters: 0,
        }));
        b.configValues = { rainbow_freq: 72, brightness: 65, rainbow_delta: 33 };
        expect(sameLedWizardConfig(a, b)).toBe(true);
    });

    it.each(["x", "y", "color", "parameters"] as const)("detects a changed LED %s", (field) => {
        const a = plan();
        const b = structuredClone(a);
        b.strip[0][field] = (b.strip[0][field] ?? 0) + 1;
        expect(sameLedWizardConfig(a, b)).toBe(false);
    });

    it.each(["functions", "directions"] as const)("detects changed LED %s", (field) => {
        const a = plan();
        const b = structuredClone(a);
        b.strip[0][field] = field === "functions" ? "a" : "n";
        expect(sameLedWizardConfig(a, b)).toBe(false);
    });

    it.each(["mode", "direction", "color"] as const)("detects a changed mode-color %s", (field) => {
        const a = plan();
        const b = structuredClone(a);
        b.modeColors[7][field]++;
        expect(sameLedWizardConfig(a, b)).toBe(false);
    });

    it.each(["brightness", "rainbow_delta", "rainbow_freq"] as const)("detects a changed config value %s", (field) => {
        const a = plan();
        const b = structuredClone(a);
        b.configValues[field]!++;
        expect(sameLedWizardConfig(a, b)).toBe(false);
        delete b.configValues[field];
        expect(sameLedWizardConfig(a, b)).toBe(false);
    });

    it.each(["strip", "modeColors"] as const)("rejects a prefix match for %s", (field) => {
        const a = plan();
        const b = structuredClone(a);
        b[field].pop();
        expect(sameLedWizardConfig(a, b)).toBe(false);
        expect(sameLedWizardConfig(b, a)).toBe(false);
    });
});
