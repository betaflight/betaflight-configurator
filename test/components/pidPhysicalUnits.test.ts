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

import { describe, expect, it } from "vitest";
import {
    dLeadTimeMs,
    feedforwardLeadTimeMs,
    iResetTimeMs,
    pMotorPercentPer100Dps,
    YAW_KI_MULTIPLIER,
} from "@/components/tabs/pid-tuning/PidPhysicalUnits";

describe("PID physical units", () => {
    it("converts the firmware roll defaults (P45 I80 D30 Dmax40 F120)", () => {
        expect(pMotorPercentPer100Dps(45)).toBeCloseTo(14.41, 2);
        expect(iResetTimeMs(45, 80)).toBeCloseTo(73.7, 1);
        expect(dLeadTimeMs(45, 30)).toBeCloseTo(11.0, 1);
        expect(dLeadTimeMs(45, 40)).toBeCloseTo(14.7, 1);
        expect(feedforwardLeadTimeMs(45, 120)).toBeCloseTo(11.5, 1);
    });

    it("applies the firmware's yaw Ki multiplier to the yaw reset time (P45 I80)", () => {
        expect(iResetTimeMs(45, 80, YAW_KI_MULTIPLIER)).toBeCloseTo(29.5, 1);
    });

    it("matches a firmware loop where I integrates a constant error until it equals P", () => {
        const p = 47;
        const i = 84;
        const errorDps = 50;
        const dT = 1 / 8000;
        const pTerm = 0.032029 * p * errorDps;
        let iTerm = 0;
        let steps = 0;
        while (iTerm < pTerm) {
            iTerm += 0.244381 * i * dT * errorDps;
            steps++;
        }
        expect(iResetTimeMs(p, i)).toBeCloseTo(steps * dT * 1000, 0);
    });

    it("treats feedforward 100 as the same strength as D 26", () => {
        expect(feedforwardLeadTimeMs(45, 100)).toBeCloseTo(dLeadTimeMs(45, 26) as number, 3);
    });

    it("has no time constant without P, and no reset time without I", () => {
        expect(iResetTimeMs(0, 80)).toBeNull();
        expect(iResetTimeMs(45, 0)).toBeNull();
        expect(dLeadTimeMs(0, 30)).toBeNull();
        expect(feedforwardLeadTimeMs(0, 120)).toBeNull();
        expect(dLeadTimeMs(45, 0)).toBe(0);
    });
});
