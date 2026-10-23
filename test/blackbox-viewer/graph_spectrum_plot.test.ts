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
import { createPinia, setActivePinia } from "pinia";
import { GraphSpectrumPlot, SPECTRUM_TYPE } from "../../src/blackbox-viewer/graph_spectrum_plot";
import type { PsdSpectrum, VsSpectrum } from "../../src/blackbox-viewer/graph_spectrum_calc";
import type { SysConfig } from "../../src/blackbox-viewer/flightlog_parser";

/** A canvas whose 2D context records the text it is asked to draw; everything else is a no-op. */
function recordingCanvas(texts: string[]): HTMLCanvasElement {
    const canvas = { width: 400, height: 240, offsetLeft: 0, offsetTop: 0 } as Record<string, unknown>;
    const ctx = new Proxy({ canvas } as Record<string, unknown>, {
        get(target, prop) {
            if (prop in target) return target[prop as string];
            if (prop === "fillText") return (text: string) => texts.push(text);
            if (prop === "createLinearGradient") return () => ({ addColorStop() {} });
            return () => {};
        },
        set(target, prop, value) {
            target[prop as string] = value;
            return true;
        },
    });
    canvas.getContext = () => ctx;
    // Only the members the plot uses: width, height, offsets and getContext().
    return canvas as unknown as HTMLCanvasElement;
}

const psd = (fftOutput: number[]): PsdSpectrum => ({
    fieldIndex: 2,
    fieldName: "Gyro [roll]",
    fftLength: fftOutput.length,
    fftOutput: Float64Array.from(fftOutput),
    blackBoxRate: 2000,
    minimum: -60,
    maximum: 10,
    maxNoiseFrequency: 100,
    maximalSegmentsLength: 512,
});

describe("GraphSpectrumPlot", () => {
    let texts: string[];

    beforeEach(() => {
        setActivePinia(createPinia());
        texts = [];
        const realCreate = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
            tag === "canvas" ? recordingCanvas(texts) : realCreate(tag)) as typeof document.createElement);
        GraphSpectrumPlot.initialize(recordingCanvas(texts), {} as SysConfig);
    });

    describe("log rate warning", () => {
        it("names both rates", () => {
            GraphSpectrumPlot.setLogRateWarningInfo({ actualRate: 1999.6, betaflightRate: 4000 });
            GraphSpectrumPlot.setData(psd([0, 1, 2, 3]), SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY);
            GraphSpectrumPlot.draw();
            expect(texts).toContain("THE ACTUAL AND CONFIG LOG DATA RATE DIFFERENCE: 2000 : 4000");
        });

        it("draws no warning when the rates agree", () => {
            GraphSpectrumPlot.setLogRateWarningInfo(undefined);
            GraphSpectrumPlot.setData(psd([0, 1, 2, 3]), SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY);
            GraphSpectrumPlot.draw();
            expect(texts.some((t) => t.includes("RATE DIFFERENCE"))).toBe(false);
        });
    });

    it("reads the PSD at a frequency, clamped to the spectrum", () => {
        // 5 bins spread 0..1000 Hz (half of 2000 Hz).
        GraphSpectrumPlot.setData(psd([10, 20, 30, 40, 50]), SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY);
        expect(GraphSpectrumPlot.getPSDbyFreq(0)).toBe(10);
        expect(GraphSpectrumPlot.getPSDbyFreq(500)).toBe(30);
        expect(GraphSpectrumPlot.getPSDbyFreq(1000)).toBe(50);
        expect(GraphSpectrumPlot.getPSDbyFreq(5000)).toBe(50);
        expect(GraphSpectrumPlot.getPSDbyFreq(-300)).toBe(10);
    });

    it("reads a heat map cell by frequency and throttle", () => {
        const rows = Array.from({ length: 100 }, (_, row) => Float64Array.from([row, row + 0.5]));
        const map: VsSpectrum = {
            fieldIndex: 2,
            fieldName: "Gyro [roll]",
            fftLength: 2,
            fftOutput: rows,
            maxNoise: 1,
            blackBoxRate: 2000,
            vsRange: { min: 0, max: 100 },
        };
        GraphSpectrumPlot.setData(map, SPECTRUM_TYPE.FREQ_VS_THROTTLE);
        expect(GraphSpectrumPlot.getValueFromMatrixFFT(0, 25)).toBe(25);
        expect(GraphSpectrumPlot.getValueFromMatrixFFT(700, 25)).toBe(25.5);
        expect(GraphSpectrumPlot.getValueFromMatrixFFT(0, 200)).toBe(99);
        expect(GraphSpectrumPlot.getValueFromMatrixFFT(0, -10)).toBe(0);
    });

    it("copies the current PSD into the comparison once per field", () => {
        GraphSpectrumPlot.setData(psd([1, 2]), SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY);
        expect(GraphSpectrumPlot.isMultiSpectrum()).toBe(false);

        GraphSpectrumPlot.addCurrentSpectrumIntoImport();
        GraphSpectrumPlot.addCurrentSpectrumIntoImport();

        expect(GraphSpectrumPlot.isMultiSpectrum()).toBe(true);
        expect(GraphSpectrumPlot.isNewComparedCurve("Gyro [roll]")).toBe(false);
        expect(GraphSpectrumPlot._importedPSD!.curvesCount()).toBe(1);
        expect(GraphSpectrumPlot._importedPSD!.getCurve(0).points).toEqual([
            { x: 0, y: 1 },
            { x: 500, y: 2 },
        ]);

        GraphSpectrumPlot.removeComparedCurve("Gyro [roll]");
        expect(GraphSpectrumPlot.isMultiSpectrum()).toBe(false);
    });

    it("only compares power spectral densities", () => {
        GraphSpectrumPlot.setData(psd([1, 2]), SPECTRUM_TYPE.FREQUENCY);
        GraphSpectrumPlot.addCurrentSpectrumIntoImport();
        expect(GraphSpectrumPlot.isMultiSpectrum()).toBe(false);
    });
});
