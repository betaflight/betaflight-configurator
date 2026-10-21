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

import { afterEach, describe, expect, it, vi } from "vitest";
import getTpaHyperbolicCurve from "../../src/components/tabs/pid-tuning/WingTpaCurvesData";
import { getCssVar } from "../../src/js/utils/cssVar";
import type { WingConfig } from "../../src/stores/fc.types";

// Reference values were computed by running the JavaScript version of this module.
const BASIC_MAX_SPEED = 71.47981038359656;
const ADVANCED_MAX_SPEED = 14.35960447395274;

function wing(overrides: Partial<WingConfig> = {}): WingConfig {
    return {
        s_term: [0, 0, 0],
        spa_center: [0, 0, 0],
        spa_width: [0, 0, 0],
        spa_mode: [0, 0, 0],
        tpa_curve_type: 1,
        tpa_curve_stall_throttle: 30,
        tpa_curve_pid_thr0: 200,
        tpa_curve_pid_thr100: 50,
        tpa_curve_expo: 20,
        tpa_speed_type: 0,
        tpa_speed_basic_delay: 1000,
        tpa_speed_basic_gravity: 50,
        tpa_speed_adv_prop_pitch: 450,
        tpa_speed_adv_mass: 1000,
        tpa_speed_adv_drag_k: 1000,
        tpa_speed_adv_thrust: 2000,
        tpa_speed_max_voltage: 1680,
        tpa_speed_pitch_offset: 0,
        yaw_type: 0,
        angle_pitch_offset: 0,
        ...overrides,
    };
}

const curve = (config: WingConfig, motorKv = 1000) => getTpaHyperbolicCurve(config, motorKv)[0].data;

describe("getTpaHyperbolicCurve", () => {
    it("returns one active curve of 101 points from zero to the maximal speed", () => {
        const [chart] = getTpaHyperbolicCurve(wing(), 1000);

        expect(chart.active).toBe(true);
        expect(chart.data).toHaveLength(101);
        expect(chart.data[0].speed).toBe(0);
        expect(chart.data[50].speed).toBeCloseTo(BASIC_MAX_SPEED / 2, 10);
        expect(chart.data[100].speed).toBeCloseTo(BASIC_MAX_SPEED, 10);
    });

    it("computes the maximal speed with the advanced model", () => {
        expect(curve(wing({ tpa_speed_type: 1 }))[100].speed).toBeCloseTo(ADVANCED_MAX_SPEED, 10);
    });

    it("scales the advanced maximal speed with motor KV", () => {
        expect(curve(wing({ tpa_speed_type: 1 }), 2000)[100].speed).not.toBeCloseTo(ADVANCED_MAX_SPEED, 3);
    });

    it("holds the throttle-0 multiplier up to the stall throttle", () => {
        const data = curve(wing());

        expect(data[0].multiplier).toBe(2);
        expect(data[29].multiplier).toBe(2);
        expect(data[30].multiplier).toBe(2);
    });

    it("bends from the throttle-0 to the throttle-100 multiplier", () => {
        const data = curve(wing());

        expect(data[50].multiplier).toBeCloseTo(14 / 13, 12);
        expect(data[100].multiplier).toBeCloseTo(0.5, 12);
    });

    it("is flat at the throttle-0 multiplier when the stall throttle is 100%", () => {
        const data = curve(wing({ tpa_curve_stall_throttle: 100 }));

        expect(data.every((point) => point.multiplier === 2)).toBe(true);
        expect(data[100].speed).toBeCloseTo(BASIC_MAX_SPEED, 10);
    });

    it("is flat when the throttle-0 and throttle-100 multipliers are equal", () => {
        const data = curve(wing({ tpa_curve_pid_thr0: 80, tpa_curve_pid_thr100: 80 }));

        expect(data.every((point) => point.multiplier === 0.8)).toBe(true);
    });

    it("treats a throttle-100 multiplier of 0 as 1%", () => {
        expect(curve(wing({ tpa_curve_pid_thr100: 0 }))[100].multiplier).toBeCloseTo(0.01, 12);
    });

    it.each([
        ["basic, zero gravity", { tpa_speed_type: 0, tpa_speed_basic_gravity: 0 }],
        ["advanced, zero mass", { tpa_speed_type: 1, tpa_speed_adv_mass: 0 }],
        ["advanced, zero drag", { tpa_speed_type: 1, tpa_speed_adv_drag_k: 0 }],
    ])("falls back to a maximal speed of 1 for %s", (_, overrides) => {
        expect(curve(wing(overrides))[100].speed).toBe(1);
    });

    it("never reports a maximal speed below 1", () => {
        // A 1 g craft with maximum drag: the advanced model gives about 0.04 m/s.
        const light = wing({
            tpa_speed_type: 1,
            tpa_speed_adv_mass: 1,
            tpa_speed_adv_drag_k: 65535,
            tpa_speed_adv_thrust: 0,
        });

        expect(curve(light, 0)[100].speed).toBe(1);
    });
});

describe("getCssVar", () => {
    afterEach(() => {
        document.documentElement.style.removeProperty("--test-colour");
        vi.restoreAllMocks();
    });

    it("reads a CSS custom property from the document root", () => {
        document.documentElement.style.setProperty("--test-colour", "#123456");

        expect(getCssVar("--test-colour")).toBe("#123456");
    });

    it("trims the value, which browsers may return with leading whitespace", () => {
        // jsdom already trims custom properties, so stub the computed style to see the raw value.
        vi.spyOn(globalThis, "getComputedStyle").mockReturnValue({
            getPropertyValue: () => "  #123456 ",
        } as unknown as CSSStyleDeclaration);

        expect(getCssVar("--test-colour")).toBe("#123456");
    });

    it("falls back when the property is not set", () => {
        expect(getCssVar("--test-colour", "#abcdef")).toBe("#abcdef");
        expect(getCssVar("--test-colour")).toBe("#000000");
    });

    it("colours the TPA curve from --chart-curve-color", () => {
        expect(getTpaHyperbolicCurve(wing(), 1000)[0].color).toBe("#e24761");

        document.documentElement.style.setProperty("--chart-curve-color", "#00ff00");
        expect(getTpaHyperbolicCurve(wing(), 1000)[0].color).toBe("#00ff00");
        document.documentElement.style.removeProperty("--chart-curve-color");
    });
});
