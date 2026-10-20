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
import { isFrameMode, modeSpectrum, motorOwnPeaks, type WizardResult } from "../../src/stores/frameWizardProtocol";

// The 5" bench run of 2026-10-18 09:41 with its cable step (wizard_5inch_cable3.json): taps then motors.
// Per point (arms 1-4, frame, cable) [Hz, cable]; per motor [Hz, gain, cable].
// prettier-ignore
const POINTS: [number, number][][] = [[[76.3,0],[208.2,0],[272.4,0],[335.2,0],[129.6,0],[449.0,0]],[[76.0,0],[128.9,0],[208.3,0],[270.5,0],[334.5,0],[450.1,0],[441.0,0]],[[75.7,0],[132.6,0],[210.9,0],[278.9,0],[333.9,0],[453.4,0],[173.5,0]],[[75.6,0],[210.5,0],[269.5,0],[333.7,0],[455.5,0],[127.4,0]],[[80.4,0],[210.9,0],[271.7,0],[334.2,0],[446.1,0],[134.7,0]],[[128.3,0],[210.1,0],[262.1,0],[438.3,0],[336.9,0],[244.7,1],[87.7,1]]];
// prettier-ignore
const MOTORS: [number, number, number][][] = [[[96.7,0.0345,0],[127.8,0.0287,0],[209.0,0.1064,0],[266.6,0.0402,0],[435.4,0.0872,0],[526.6,0.0358,0],[934.3,0.0069,0],[1067.9,0.0068,0]],[[128.0,0.026,0],[210.3,0.1136,0],[270.0,0.0766,0],[432.6,0.0667,0],[520.5,0.0501,0],[962.3,0.0045,0],[1111.4,0.0049,0]],[[63.8,0.0338,0],[212.6,0.14,0],[256.8,0.0358,0],[327.8,0.0517,0],[444.5,0.1058,0],[881.7,0.0072,0]],[[214.2,0.1435,0],[270.0,0.0938,0],[448.7,0.0769,0],[511.5,0.0699,0],[970.0,0.0063,0],[1138.9,0.0046,0]]];

const run = {
    points: POINTS.map((modes) => modes.map(([hz, cable]) => ({ hz, taps: 3, cable: cable === 1 }))),
    motors: MOTORS.map((peaks) =>
        peaks.map(([hz, gain, cable]) => ({ hz, gain, axis: null, speeds: 2, cable: cable === 1 })),
    ),
} as unknown as WizardResult;

const short = (run: WizardResult | null, map: Parameters<typeof modeSpectrum>[1] = []) =>
    modeSpectrum(run, map).map((l) => [Math.round(l.hz), l.levelDb, l.severity]);

describe("mode spectrum", () => {
    it("ranks the modes of a real run: the ones every motor drives near the loudest are serious", () => {
        expect(short(run)).toEqual([
            [64, -12.6, "minor"],
            [76, null, "minor"], // rings on every arm, the motors do not drive it
            [80, null, "minor"],
            [88, null, "cable"],
            [97, -12.4, "minor"], // one motor only
            [129, -14, "minor"],
            [174, null, "minor"],
            [211, 0, "serious"],
            [245, null, "cable"],
            [270, -3.7, "serious"],
            [334, -8.9, "notable"],
            [447, -2.6, "serious"],
            [521, -6.2, "notable"],
            [882, -26, "minor"],
            [962, -26.4, "minor"],
            [1111, -26.5, "minor"],
        ]);
    });

    it("keeps the points and motors of a mode", () => {
        const line = modeSpectrum(run).find((l) => Math.round(l.hz) === 334);
        expect(line).toMatchObject({ points: [0, 1, 2, 3, 4], motors: [2] });
    });

    it("marks a tap mode the frame map calls unstable, unless the motors drive it", () => {
        const map = [
            { hz: 173, fromCable: false, unstable: true },
            { hz: 270, fromCable: false, unstable: true }, // the FC would not: motors drive it
        ];
        const lines = short(run, map);
        expect(lines).toContainEqual([174, null, "unstable"]);
        expect(lines).toContainEqual([270, -3.7, "serious"]);
    });

    it("adds the map modes the run did not see, without a level", () => {
        const map = [
            { hz: 210, fromCable: false, unstable: false },
            { hz: 375, fromCable: true, unstable: false },
            { hz: 600, fromCable: false, unstable: true },
        ];
        expect(short(null, map)).toEqual([
            [210, null, "unrated"],
            [375, null, "cable"],
            [600, null, "unstable"],
        ]);
        expect(short(run, map).filter(([hz]) => hz === 375)).toEqual([[375, null, "cable"]]);
        // which run of the map it came from
        const stored = modeSpectrum(null, [
            { hz: 117, fromTaps: false, fromMotors: true, fromCable: false, unstable: false },
            { hz: 600, fromTaps: true, fromMotors: false, fromCable: false, unstable: false },
        ]);
        expect(stored.map((l) => l.storedFrom)).toEqual(["motors", null]);
        expect(stored.map((l) => l.tapped)).toEqual([false, true]);
        expect(modeSpectrum(run).every((l) => l.storedFrom === null)).toBe(true);
    });

    it("rates nothing before a motor run: the taps give no level", () => {
        const tapsOnly = { ...run, motors: [[], [], [], []] } as WizardResult;
        const lines = modeSpectrum(tapsOnly);
        expect(lines.filter((l) => l.severity !== "cable").every((l) => l.severity === "unrated")).toBe(true);
        expect(lines.find((l) => Math.round(l.hz) === 76)).toMatchObject({ levelDb: null, points: [0, 1, 2, 3] });
    });

    it('keeps a frame mode the FC took for the cable on some motors only (5" motor run, 2026-10-19 16:21)', () => {
        // prettier-ignore
        const peaks: [number, number, number][][] = [[[108.9,0.0211,0],[208.3,0.1066,0],[263.9,0.0275,0],[326.4,0.0384,0],[434.1,0.0643,0],[530.5,0.026,0],[645.1,0.0159,0],[947.6,0.0031,0]],[[211.2,0.0757,0],[335.2,0.0271,0],[440.5,0.042,1],[508.4,0.0545,0],[648.4,0.0193,0]],[[130.4,0.0239,0],[211.8,0.1059,0],[248.9,0.0378,0],[443.7,0.0825,1],[956.5,0.004,0],[1103.6,0.0026,0]],[[214.1,0.1193,0],[235.4,0.0635,0],[341,0.0164,0],[490.7,0.0707,0],[1103,0.0015,0],[1254.1,0.001,0]]];
        const motorRun = {
            points: [[], [], [], [], [], []],
            motors: peaks.map((list) =>
                list.map(([hz, gain, cable]) => ({ hz, gain, axis: null, speeds: 2, cable: cable === 1 })),
            ),
        } as unknown as WizardResult;
        // the taps run before it: the cable step named 452 Hz the cable's
        const map = [57, 102, 170, 452].map((hz) => ({ hz, fromCable: true, unstable: false }));
        const line = modeSpectrum(motorRun, map).find((l) => Math.round(l.hz) === 441);
        expect(line).toMatchObject({ severity: "serious", levelDb: -3.2, motors: [0, 1, 2], cableMotors: [1, 2] });
        const cable = modeSpectrum(motorRun, map).filter((l) => l.severity === "cable");
        expect(cable.map((l) => l.hz)).toEqual([57, 102, 170]);
    });

    it("after a motor run, the map's taps part says which modes the frame rang at", () => {
        const motorsOnly = { ...run, points: [[], [], [], [], [], []] } as WizardResult;
        const map = [
            { hz: 75, fromTaps: true, fromMotors: false, fromCable: false, unstable: false },
            { hz: 210, fromTaps: true, fromMotors: true, fromCable: false, unstable: false },
        ];
        const lines = modeSpectrum(motorsOnly, map);
        expect(lines.find((l) => Math.round(l.hz) === 75)).toMatchObject({
            tapped: true,
            severity: "minor",
            storedFrom: null,
        });
        expect(lines.find((l) => Math.round(l.hz) === 211)).toMatchObject({ tapped: true, severity: "serious" });
        expect(lines.find((l) => Math.round(l.hz) === 521)).toMatchObject({ tapped: false });
    });

    it("splits the frame modes from the peaks of one or two motors", () => {
        const lines = modeSpectrum(run);
        expect(lines.filter(isFrameMode).map((l) => Math.round(l.hz))).toEqual([
            76, 80, 88, 129, 174, 211, 245, 270, 334, 447, 521, 962, 1111,
        ]);
        const own = motorOwnPeaks(lines);
        expect(own[0].map((p) => Math.round(p.hz))).toEqual([97]);
        expect(own[2].map((p) => [Math.round(p.hz), p.db])).toEqual([
            [64, -12.6],
            [882, -26],
        ]);
    });

    it('keeps a strong mode two motors drive on the chart (5" motor run, 2026-10-20 10:22)', () => {
        // prettier-ignore
        const peaks: [number, number][][] = [[[67.1,0.0413],[208.5,0.1153],[326.2,0.069],[437.8,0.1079],[556.5,0.0344],[840.5,0.0063],[1035.4,0.0039],[1191.3,0.0033]],[[211.7,0.0766],[239.2,0.0448],[531.1,0.0585],[1087.9,0.0028]],[[128.6,0.0283],[211.9,0.1128],[328.6,0.0429],[357.8,0.0397],[439.4,0.0584],[529.7,0.0174],[648.5,0.0156],[873.8,0.0068]],[[130.1,0.0294],[212.5,0.1021],[236.9,0.0683],[301.3,0.0335],[521.6,0.0765],[1098,0.0021]]];
        const motorRun = {
            points: [[], [], [], [], [], []],
            motors: peaks.map((list) => list.map(([hz, gain]) => ({ hz, gain, axis: null, speeds: 2, cable: false }))),
        } as unknown as WizardResult;
        const lines = modeSpectrum(motorRun);
        // 439 Hz: motors 1 and 3 only, -0.6 dB from the strongest: a frame mode, not a motor's own peak
        const strong = lines.find((l) => Math.round(l.hz) === 439)!;
        expect(strong.motors).toEqual([0, 2]);
        expect(isFrameMode(strong)).toBe(true);
        // a weak peak of one motor stays off the chart
        expect(isFrameMode(lines.find((l) => Math.round(l.hz) === 1191)!)).toBe(false);
    });
});
