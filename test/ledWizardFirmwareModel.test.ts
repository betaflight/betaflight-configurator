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

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import {
    buildLedWizardPlan,
    defaultLedWizardModel,
    reconstructLedWizard,
    validateLedWizard,
    wizardPositions,
    previewArmIndices,
    physicalLedCount,
    type LedWizardModel,
    type LedWizardSource,
} from "../src/composables/ledWizard";

// Betaflight native LED masks, palettes and ring timing.
const HUES = [0, 0, 0, 15, 50, 100, 115, 125, 180, 210, 240, 270, 300, 330, 0, 0];

function createSource(capacity = 32, over: Partial<LedWizardSource> = {}): LedWizardSource {
    return {
        apiVersion: "1.47.0",
        advanced: true,
        profile: 2,
        strip: Array.from({ length: capacity }, () => ({ x: 0, y: 0, color: 0, functions: ["c"], directions: [] })),
        colors: HUES.map((h, i) => ({ h, s: i === 1 ? 255 : 0, v: i === 0 || i >= 14 ? 0 : 255 })),
        modeColors: [
            ...Array.from({ length: 36 }, (_, i) => ({ mode: Math.floor(i / 6), direction: i % 6, color: 1 })),
            ...[6, 10, 1, 0, 0, 2, 3, 6].map((color, direction) => ({ mode: 6, direction, color })),
        ],
        configValues: { brightness: 80, rainbow_delta: 0, rainbow_freq: 120 },
        ...over,
    };
}

const model = (src: LedWizardSource, over: Partial<LedWizardModel>): LedWizardModel => ({
    ...defaultLedWizardModel(src),
    ...over,
});

// updateLedRingCounts()
function ringSeqLen(ring: number) {
    if (ring % 6 === 0) return 6;
    let seq = ring;
    while (seq > 6 && seq % 2 === 0) seq /= 2;
    return seq;
}

describe("Native LED firmware behavior", () => {
    const source = createSource;

    // Native firmware mask encoding and thrust-ring simulation.
    const FN = ["c", "f", "a", "l", "s", "g", "r", "p", "e", "u"];
    const OV = ["t", "y", "o", "b", "v", "i", "w"];
    const DIR = ["n", "e", "s", "w", "u", "d"];
    function mask(led: {
        x: number;
        y: number;
        functions: string | string[];
        directions: string | string[];
        color: number;
    }) {
        let m = (led.y & 0xf) | ((led.x & 0xf) << 4);
        const fns = Array.from(led.functions);
        const fn = fns.map((l) => FN.indexOf(l)).find((i) => i >= 0) ?? 0;
        m |= fn << 8;
        for (const l of fns) if (OV.includes(l)) m |= 1 << (12 + OV.indexOf(l));
        m |= led.color << 22;
        for (const l of Array.from(led.directions)) if (DIR.includes(l)) m |= 1 << (26 + DIR.indexOf(l));
        return m >>> 0;
    }
    // updateLedCount(): stops at the first all-zero config.
    function firmwareCount(strip: LedWizardSource["strip"]) {
        let n = 0;
        for (const led of strip) {
            if (mask(led) === 0) break;
            n++;
        }
        return n;
    }
    // applyLedThrustRingLayer() armed: which ring indices are lit at a given phase.
    function litRing(ring: number, phase: number) {
        const seq = ringSeqLen(ring);
        return Array.from({ length: ring }, (_, i) => (i + phase) % seq < 2);
    }

    test("accepts 16 LEDs on four arms with blue thrust and battery warnings", () => {
        // Warning layers run after the thrust-ring layer and take precedence.
        const src = source();
        const errors = validateLedWizard(
            model(src, { layout: "four", armed: "thrust", armedColor: 10, disarmed: "firmware", warnings: true }),
            src,
        );
        assert.deepEqual(errors, [], `Unexpected validation errors: ${errors.join(", ")}`);
    });

    for (const [count, layout] of [
        [12, "four"],
        [8, "four"],
        [16, "two"],
        [32, "four"],
        [16, "four"],
        [20, "four"],
    ] as const) {
        test(`Thrust ${count} LEDs / ${layout}: synchronizes every arm or rejects the layout`, () => {
            const src = source(64);
            const m = model(src, { count, layout, armed: "thrust", disarmed: "firmware", warnings: false });
            const errors = validateLedWizard(m, src);
            const perArm = count / (layout === "four" ? 4 : 2);
            const synced = perArm % ringSeqLen(count) === 0;
            if (errors.length) return; // Rejected layouts cannot produce an unsynchronized pattern.
            // Every arm must show the same pattern in every firmware phase.
            for (let phase = 0; phase < ringSeqLen(count); phase++) {
                const lit = litRing(count, phase);
                const arms = Array.from({ length: count / perArm }, (_, a) =>
                    lit.slice(a * perArm, (a + 1) * perArm).join(),
                );
                assert.ok(
                    new Set(arms).size === 1,
                    `accepted, but firmware segment ${ringSeqLen(count)} != ${perArm} LEDs/arm produces shifted patterns (synced=${synced})`,
                );
            }
        });
    }

    test("keeps every generated LED visible to firmware without an early zero mask", () => {
        for (const layout of ["strip", "two", "four"] as const)
            for (const direction of ["outward", "inward"] as const)
                for (const count of [4, 8, 16, 32, 64, 128]) {
                    const src = source(256);
                    const m = model(src, { layout, direction, count });
                    if (validateLedWizard(m, src).length) continue;
                    const plan = buildLedWizardPlan(m, src);
                    assert.equal(firmwareCount(plan.strip), count, `${layout}/${direction}/${count}`);
                }
    });

    test("places unique coordinates within the 16x16 grid", () => {
        for (const layout of ["strip", "two", "four"] as const)
            for (const count of [4, 16, 64, 128, 256]) {
                const m = model(source(256), { layout, count });
                if (count % (layout === "four" ? 4 : layout === "two" ? 2 : 1)) continue;
                const pos = wizardPositions(m);
                assert.ok(
                    pos.every((p) => p.x >= 0 && p.x < 16 && p.y >= 0 && p.y < 16),
                    `${layout}/${count} out of grid`,
                );
                assert.equal(
                    new Set(pos.map((p) => `${p.x},${p.y}`)).size,
                    count,
                    `${layout}/${count} duplicate positions`,
                );
            }
    });

    test("reconstructs every valid configuration with idempotent output", () => {
        const problems: string[] = [];
        for (const layout of ["strip", "two", "four"] as const)
            for (const direction of ["outward", "inward"] as const)
                for (const armed of ["static", "thrust"] as const)
                    for (const disarmed of ["off", "static", "firmware"] as const)
                        for (const warnings of [false, true])
                            for (const count of [4, 8, 12, 16]) {
                                const src = source(32);
                                const m = model(src, {
                                    layout,
                                    direction,
                                    armed,
                                    disarmed,
                                    warnings,
                                    count,
                                    disarmedColor: 6,
                                });
                                if (validateLedWizard(m, src).length) continue;
                                const plan = buildLedWizardPlan(m, src);
                                const after = { ...src, ...plan };
                                const back = reconstructLedWizard(after);
                                if (!back) {
                                    problems.push(
                                        `not recognized: ${JSON.stringify({ layout, direction, armed, disarmed, warnings, count })}`,
                                    );
                                    continue;
                                }
                                const again = buildLedWizardPlan(back, after);
                                if (JSON.stringify(again) !== JSON.stringify(plan))
                                    problems.push(`not idempotent: ${JSON.stringify({ layout, direction, count })}`);
                            }
        assert.deepEqual(problems, []);
    });

    test("reconstructs the selected layout and wiring direction", () => {
        const problems: string[] = [];
        for (const layout of ["strip", "two", "four"] as const)
            for (const direction of ["outward", "inward"] as const)
                for (const count of [4, 8, 16]) {
                    const src = source(32);
                    const m = model(src, { layout, direction, count });
                    if (validateLedWizard(m, src).length) continue;
                    const back = reconstructLedWizard({ ...src, ...buildLedWizardPlan(m, src) });
                    const perArm = count / (layout === "four" ? 4 : layout === "two" ? 2 : 1);
                    // With one LED per arm, inward and outward wiring are physically equivalent.
                    if (back && (back.layout !== layout || (perArm > 1 && back.direction !== direction)))
                        problems.push(`${layout}/${direction}/${count} -> ${back.layout}/${back.direction}`);
                }
        assert.deepEqual(problems, []);
    });

    test("classifies configurations with extra directions or overlays as custom", () => {
        const src = source(32);
        const plan = buildLedWizardPlan(model(src, { layout: "four", count: 16 }), src);
        plan.strip[5] = { ...plan.strip[5], functions: "aw", directions: "n" };
        assert.equal(reconstructLedWizard({ ...src, ...plan }), null);
    });

    test("preserves the source and palette without side effects", () => {
        const src = source(32);
        const before = JSON.stringify(src);
        buildLedWizardPlan(
            model(src, { layout: "four", count: 16, armed: "thrust", disarmed: "firmware", warnings: false }),
            src,
        );
        buildLedWizardPlan(model(src, { layout: "four", count: 16 }), src);
        assert.equal(JSON.stringify(src), before);
    });

    test("rejects LED counts beyond controller capacity", () => {
        const src = source(32);
        assert.ok(validateLedWizard(model(src, { count: 36, layout: "four" }), src).includes("ledWizardErrorCount"));
    });

    test("generates exactly one row per controller slot", () => {
        const src = source(32);
        assert.equal(buildLedWizardPlan(model(src, { count: 16, layout: "four" }), src).strip.length, 32);
    });

    test("uses an existing black palette slot for disarmed Off", () => {
        const src = source(32);
        const plan = buildLedWizardPlan(model(src, { count: 16, layout: "four", disarmed: "off" }), src);
        const disarmed = plan.modeColors.find((c) => c.mode === 6 && c.direction === 0)!.color;
        assert.equal(src.colors[disarmed].v, 0);
        assert.ok(!("colors" in plan));
    });

    test("recognizes black slot 14 as equivalent to black slot 0", () => {
        // The Advanced editor allows selecting any black palette slot.
        const src = source(32);
        const plan = buildLedWizardPlan(model(src, { count: 16, layout: "four", disarmed: "off" }), src);
        plan.modeColors = plan.modeColors.map((c) => (c.mode === 6 && c.direction === 0 ? { ...c, color: 14 } : c));
        assert.notEqual(
            reconstructLedWizard({ ...src, ...plan }),
            null,
            "classified as custom despite identical behavior",
        );
    });

    test("handles a controller with zero capacity without crashing", () => {
        const src = source(0);
        const m = defaultLedWizardModel(src);
        assert.ok(validateLedWizard(m, src).length > 0);
        assert.equal(reconstructLedWizard(src), null);
    });

    test("handles invalid numeric input without crashing", () => {
        const src = source(32);
        for (const count of [null as unknown as number, Number.NaN, 2.5, -4]) {
            assert.ok(validateLedWizard(model(src, { count }), src).includes("ledWizardErrorCount"));
            assert.doesNotThrow(() => wizardPositions(model(src, { count, layout: "strip" })));
        }
    });

    test("rejects Basic firmware and non-Status profiles", () => {
        for (const over of [{ advanced: false }, { profile: 0 }, { profile: 1 }, { advanced: null }]) {
            const src = source(32, over);
            assert.ok(validateLedWizard(defaultLedWizardModel(src), src).includes("ledWizardErrorProfile"));
        }
    });
});

describe("Topology and connection constraints", () => {
    const source = (capacity = 32, over: Partial<LedWizardSource> = {}) =>
        createSource(capacity, { configValuesLoaded: true, ...over });
    const seqLen = ringSeqLen;

    const arms = (layout: LedWizardModel["layout"]) => ({ strip: 1, two: 2, four: 4 })[layout];

    // Firmware: updateLedRingCounts() + applyLedThrustRingLayer() (armed)
    function armsInSync(count: number, perArm: number) {
        const s = seqLen(count);
        for (let phase = 0; phase < s; phase++) {
            const lit = Array.from({ length: count }, (_, i) => (i + phase) % s < 2);
            const patterns = new Set(
                Array.from({ length: count / perArm }, (_, a) => lit.slice(a * perArm, (a + 1) * perArm).join()),
            );
            if (patterns.size !== 1) return false;
        }
        return true;
    }

    test("accepts serial thrust exactly when firmware produces a moving synchronized pattern for 1 to 128 LEDs", () => {
        const wrong: string[] = [];
        for (const layout of ["two", "four"] as const)
            for (let count = arms(layout); count <= 128; count += arms(layout)) {
                const src = source(256);
                const m = model(src, { layout, count, armed: "thrust", disarmed: "firmware", warnings: true });
                const accepted = validateLedWizard(m, src).length === 0;
                // A segment of at most two LEDs with width two stays fully lit.
                const synced = seqLen(count) > 2 && armsInSync(count, count / arms(layout));
                if (accepted !== synced)
                    wrong.push(`${layout} ${count}: accepted=${accepted}, firmware-synchronized=${synced}`);
            }
        assert.deepEqual(wrong, []);
    });

    test("accepts parallel thrust with at least three LEDs per arm", () => {
        for (const layout of ["two", "four"] as const)
            for (let count = 3; count <= 32; count++) {
                const src = source(64);
                const errors = validateLedWizard(
                    model(src, {
                        topology: "parallel",
                        layout,
                        count,
                        armed: "thrust",
                        disarmed: "firmware",
                        warnings: true,
                    }),
                    src,
                );
                assert.deepEqual(errors, [], `${layout}/${count}: ${errors.join(",")}`);
            }
    });

    test("generates the same native configuration for parallel arms and a single strip", () => {
        for (const layout of ["two", "four"] as const)
            for (const direction of ["outward", "inward"] as const)
                for (const count of [1, 3, 4, 7, 16]) {
                    const src = source(32);
                    const parallel = buildLedWizardPlan(
                        model(src, { topology: "parallel", layout, direction, count }),
                        src,
                    );
                    const strip = buildLedWizardPlan(
                        model(src, { topology: "serial", layout: "strip", direction, count }),
                        src,
                    );
                    assert.deepEqual(parallel, strip, `${layout}/${direction}/${count}`);
                }
    });

    test("counts all physical parallel LEDs while configuring only one arm", () => {
        const src = source(32);
        const m = model(src, { topology: "parallel", layout: "four", count: 4 });
        assert.equal(physicalLedCount(m), 16);
        const plan = buildLedWizardPlan(m, src);
        assert.equal(plan.strip.filter((l) => Array.from(l.functions).join("") !== "c").length, 4);
    });

    test("reconstructs a mirrored four-by-four layout without changing native data", () => {
        const src = source(32);
        const plan = buildLedWizardPlan(
            model(src, { topology: "parallel", layout: "four", count: 4, direction: "inward" }),
            src,
        );
        const after = { ...src, ...plan };
        const back = reconstructLedWizard(after);
        assert.ok(back, "classified as custom");
        assert.deepEqual(buildLedWizardPlan(back!, after), plan);
    });

    test("keeps preview indices consistent with physical distance from the center", () => {
        for (const layout of ["two", "four"] as const)
            for (const direction of ["outward", "inward"] as const) {
                const m = model(source(64), { layout, direction, count: arms(layout) * 5 });
                const pos = wizardPositions(m);
                for (const armIdx of previewArmIndices(m)) {
                    // Preview indices run from the center outward, so distance must increase.
                    const d = armIdx.map((i) => Math.hypot(pos[i].x - 7.5, pos[i].y - 7.5));
                    for (let k = 1; k < d.length; k++)
                        assert.ok(d[k] > d[k - 1], `${layout}/${direction}: index ${armIdx[k]} is not farther outward`);
                }
            }
    });

    test("displays identical data indices on every parallel arm", () => {
        const m = model(source(32), { topology: "parallel", layout: "four", count: 4 });
        assert.deepEqual(previewArmIndices(m), [
            [0, 1, 2, 3],
            [0, 1, 2, 3],
            [0, 1, 2, 3],
            [0, 1, 2, 3],
        ]);
        const inward = model(source(32), { topology: "parallel", layout: "four", count: 4, direction: "inward" });
        assert.deepEqual(previewArmIndices(inward)[2], [3, 2, 1, 0]);
    });

    test("rejects thrust with one or two LEDs for single strips and parallel arms", () => {
        for (const topology of ["serial", "parallel"] as const)
            for (const count of [1, 2]) {
                const src = source(32);
                const layout = topology === "serial" ? "strip" : "four";
                const errors = validateLedWizard(
                    model(src, { topology, layout, count, armed: "thrust", disarmed: "firmware" }),
                    src,
                );
                assert.ok(errors.length > 0, `${topology}/${count} is accepted but does not animate`);
            }
    });

    test("defaults to warnings off and serial topology", () => {
        const m = defaultLedWizardModel(source(32));
        assert.equal(m.warnings, false);
        assert.equal(m.topology, "serial");
    });

    test("blocks Apply when configuration values were not loaded for the current connection on API 1.46 or newer", () => {
        const src = source(32, { configValuesLoaded: false });
        assert.ok(validateLedWizard(defaultLedWizardModel(src), src).includes("ledWizardErrorConfigValues"));
        const old = source(32, { apiVersion: "1.45.0", configValuesLoaded: false, configValues: {} });
        assert.ok(!validateLedWizard(defaultLedWizardModel(old), old).includes("ledWizardErrorConfigValues"));
        assert.deepEqual(buildLedWizardPlan(defaultLedWizardModel(old), old).configValues, {});
    });

    test("preserves black thrust background slot 14 and replaces a colored background with black", () => {
        const src = source(32);
        const set = (c: number) => ({
            ...src,
            modeColors: src.modeColors.map((x) => (x.mode === 6 && x.direction === 3 ? { ...x, color: c } : x)),
        });
        const m = model(src, { layout: "four", count: 16, armed: "thrust", disarmed: "firmware" });
        const bg = (s: LedWizardSource) =>
            buildLedWizardPlan(m, s).modeColors.find((x) => x.mode === 6 && x.direction === 3)!.color;
        assert.equal(bg(set(14)), 14);
        assert.equal(src.colors[bg(set(6))].v, 0, "colored background is not switched off");
    });

    test("uses black for disarmed Off after a previous color selection", () => {
        const src = source(32);
        const plan = buildLedWizardPlan(
            model(src, { layout: "four", count: 16, disarmed: "off", disarmedColor: 6 }),
            src,
        );
        const c = plan.modeColors.find((x) => x.mode === 6 && x.direction === 0)!.color;
        assert.equal(src.colors[c].v, 0);
    });

    test("preserves native data and idempotence across all topology combinations", () => {
        const problems: string[] = [];
        for (const topology of ["serial", "parallel"] as const)
            for (const layout of ["strip", "two", "four"] as const)
                for (const direction of ["outward", "inward"] as const)
                    for (const armed of ["static", "thrust"] as const)
                        for (const disarmed of ["off", "static", "firmware"] as const)
                            for (const warnings of [false, true])
                                for (const count of [2, 4, 8, 12, 16, 20]) {
                                    const src = source(64);
                                    const m = model(src, {
                                        topology,
                                        layout,
                                        direction,
                                        armed,
                                        disarmed,
                                        warnings,
                                        count,
                                        disarmedColor: 6,
                                    });
                                    if (validateLedWizard(m, src).length) continue;
                                    const plan = buildLedWizardPlan(m, src);
                                    const after = { ...src, ...plan };
                                    const back = reconstructLedWizard(after);
                                    if (!back) {
                                        problems.push(
                                            `custom: ${JSON.stringify({ topology, layout, direction, armed, count })}`,
                                        );
                                        continue;
                                    }
                                    if (JSON.stringify(buildLedWizardPlan(back, after)) !== JSON.stringify(plan))
                                        problems.push(
                                            `different: ${JSON.stringify({ topology, layout, direction, count })}`,
                                        );
                                }
        assert.deepEqual(problems, []);
    });
});
