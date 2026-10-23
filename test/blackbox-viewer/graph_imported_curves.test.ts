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
import { ImportedCurves, type CurvePoint } from "../../src/blackbox-viewer/graph_imported_curves";

const pts = (...xy: [number, number][]): CurvePoint[] => xy.map(([x, y]) => ({ x, y }));

const csv = (name: string, text: string) => new File([text], name, { type: "text/csv" });

describe("ImportedCurves", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("starts empty with an inverted range", () => {
        const curves = new ImportedCurves(() => {});
        expect(curves.curvesCount()).toBe(0);
        expect(curves.isEmpty()).toBe(true);
        expect(curves.isFull()).toBe(false);
        expect([curves.minX, curves.maxX, curves.minY, curves.maxY]).toEqual([
            Number.MAX_VALUE,
            -Number.MAX_VALUE,
            Number.MAX_VALUE,
            -Number.MAX_VALUE,
        ]);
    });

    it("adds a curve, widens the range and reports the change", () => {
        const changed = vi.fn();
        const curves = new ImportedCurves(changed);
        curves.addCurve(pts([0, -3], [10, 4]), "a");
        expect(curves.isEmpty()).toBe(false);
        curves.addCurve(pts([5, -1], [20, 2]), "b");

        expect(changed).toHaveBeenCalledTimes(2);
        expect(curves.getCurve(1)).toEqual({
            name: "b",
            points: pts([5, -1], [20, 2]),
            range: { minX: 5, maxX: 20, minY: -1, maxY: 2 },
        });
        expect([curves.minX, curves.maxX, curves.minY, curves.maxY]).toEqual([0, 20, -3, 4]);
        expect(curves.isEmpty()).toBe(false);
    });

    it("holds six curves at most", () => {
        const changed = vi.fn();
        const curves = new ImportedCurves(changed);
        for (let i = 0; i < 5; i++) {
            curves.addCurve(pts([i, i]), `c${i}`);
        }
        expect(curves.isFull()).toBe(false);
        curves.addCurve(pts([5, 5]), "c5");
        curves.addCurve(pts([6, 6]), "c6");
        expect(curves.curvesCount()).toBe(6);
        expect(curves.isFull()).toBe(true);
        expect(changed).toHaveBeenCalledTimes(6);
        expect(curves.maxX).toBe(5);
    });

    it("throws past the last curve", () => {
        const curves = new ImportedCurves(() => {});
        curves.addCurve(pts([0, 0]), "a");
        expect(curves.getCurve(0).name).toBe("a");
        expect(() => curves.getCurve(1)).toThrow(RangeError);
    });

    it("tells a new name from one already held", () => {
        const curves = new ImportedCurves(() => {});
        curves.addCurve(pts([0, 0]), "a");
        curves.addCurve(pts([0, 0]), "b");
        expect(curves.isNewCurve("a")).toBe(false);
        expect(curves.isNewCurve("b")).toBe(false);
        expect(curves.isNewCurve("c")).toBe(true);
    });

    it("removes a curve by name and shrinks the range to the rest", () => {
        const changed = vi.fn();
        const curves = new ImportedCurves(changed);
        curves.addCurve(pts([0, -30], [100, 30]), "wide");
        curves.addCurve(pts([10, -1], [20, 1]), "narrow");
        changed.mockClear();

        curves.removeCurve("missing");
        expect(changed).not.toHaveBeenCalled();
        expect(curves.curvesCount()).toBe(2);

        curves.removeCurve("wide");
        expect(changed).toHaveBeenCalledTimes(1);
        expect(curves.curvesCount()).toBe(1);
        expect(curves.getCurve(0).name).toBe("narrow");
        expect([curves.minX, curves.maxX, curves.minY, curves.maxY]).toEqual([10, 20, -1, 1]);
    });

    it("removes only the first of several curves with the same name", () => {
        // Two CSV files with the same base name import under one name.
        const curves = new ImportedCurves(() => {});
        curves.addCurve(pts([0, 0]), "same");
        curves.addCurve(pts([1, 1]), "same");
        curves.addCurve(pts([2, 2]), "same");
        curves.removeCurve("same");
        expect(curves.curvesCount()).toBe(2);
        expect(curves.getCurve(0).points).toEqual(pts([1, 1]));
    });

    it("removes every curve and resets the range", () => {
        const changed = vi.fn();
        const curves = new ImportedCurves(changed);
        curves.addCurve(pts([0, 0]), "a");
        changed.mockClear();

        curves.removeAllCurves();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(curves.isEmpty()).toBe(true);
        expect(curves.minY).toBe(Number.MAX_VALUE);
        expect(curves.maxY).toBe(-Number.MAX_VALUE);
    });

    describe("importCurvesFromCSV", () => {
        it("reads x,y rows into a curve named after the file", async () => {
            const changed = vi.fn();
            const curves = new ImportedCurves(changed);
            curves.importCurvesFromCSV([csv("gyro.roll.csv", "x , y\n0,-40\n100,-10\n200,-25\n")]);

            await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
            expect(curves.getCurve(0)).toEqual({
                name: "gyro",
                points: pts([0, -40], [100, -10], [200, -25]),
                range: { minX: 0, maxX: 200, minY: -40, maxY: -10 },
            });
            expect([curves.minX, curves.maxX, curves.minY, curves.maxY]).toEqual([0, 200, -40, -10]);
        });

        it.each(["freq,psd", "x,y,z", "x,psd"])("rejects the header %j", async (header) => {
            const alert = vi.fn();
            vi.stubGlobal("alert", alert);
            const changed = vi.fn();
            const curves = new ImportedCurves(changed);
            curves.importCurvesFromCSV([csv("bad.csv", `${header}\n0,1\n`)]);

            await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
            expect(alert.mock.lastCall?.[0]).toContain("Wrong curves CSV data format");
            expect(curves.isEmpty()).toBe(true);
            expect(changed).not.toHaveBeenCalled();
        });

        it("keeps the range when a file fails part way through", async () => {
            const alert = vi.fn();
            vi.stubGlobal("alert", alert);
            const curves = new ImportedCurves(() => {});
            curves.addCurve(pts([0, -20], [100, -10]), "held");
            // The row without a comma fails the parse after two good rows were read.
            curves.importCurvesFromCSV([csv("broken.csv", "x,y\n0,-90\n500,40\n7\n")]);

            await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
            expect(curves.curvesCount()).toBe(1);
            expect([curves.minX, curves.maxX, curves.minY, curves.maxY]).toEqual([0, 100, -20, -10]);
        });

        it("reads only as many files as there are free slots", async () => {
            const changed = vi.fn();
            const curves = new ImportedCurves(changed);
            for (let i = 0; i < 4; i++) {
                curves.addCurve(pts([0, 0]), `held${i}`);
            }
            changed.mockClear();

            curves.importCurvesFromCSV([1, 2, 3].map((i) => csv(`f${i}.csv`, `x,y\n${i},${i}\n`)));

            await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
            // Give a third reader the chance to finish, were one started.
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(changed).toHaveBeenCalledTimes(2);
            expect(curves.isFull()).toBe(true);
            expect([curves.getCurve(4).name, curves.getCurve(5).name].sort()).toEqual(["f1", "f2"]);
        });
    });
});
