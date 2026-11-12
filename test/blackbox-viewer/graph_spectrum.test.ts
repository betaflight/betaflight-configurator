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
import { FlightLogAnalyser } from "../../src/blackbox-viewer/graph_spectrum";
import { GraphSpectrumCalc } from "../../src/blackbox-viewer/graph_spectrum_calc";
import { GraphSpectrumPlot } from "../../src/blackbox-viewer/graph_spectrum_plot";
import { SpectrumExporter } from "../../src/blackbox-viewer/spectrum-exporter";
import { PrefStorage } from "../../src/blackbox-viewer/pref_storage";
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings";
import { useGraphStore } from "../../src/blackbox-viewer/stores/graph";
import { useAppStore } from "../../src/blackbox-viewer/stores/app";
import type { FlightLog } from "../../src/blackbox-viewer/flightlog";

vi.mock("../../src/blackbox-viewer/graph_spectrum_calc", () => ({
    GraphSpectrumCalc: {
        initialize: vi.fn(),
        setPointsPerSegmentPSD: vi.fn(),
        setInTime: vi.fn(),
        setOutTime: vi.fn(),
        setDataBuffer: vi.fn(),
        dataLoadFrequency: vi.fn(),
        dataLoadPSD: vi.fn(),
        dataLoadFrequencyVsThrottle: vi.fn(),
        dataLoadFrequencyVsRpm: vi.fn(),
        dataLoadPowerSpectralDensityVsThrottle: vi.fn(),
        dataLoadPowerSpectralDensityVsRpm: vi.fn(),
        dataLoadPidErrorVsSetpoint: vi.fn(),
    },
}));

vi.mock("../../src/blackbox-viewer/graph_spectrum_plot", () => ({
    SPECTRUM_TYPE: {
        FREQUENCY: 0,
        FREQ_VS_THROTTLE: 1,
        FREQ_VS_RPM: 2,
        POWER_SPECTRAL_DENSITY: 3,
        PSD_VS_THROTTLE: 4,
        PSD_VS_RPM: 5,
        PIDERROR_VS_SETPOINT: 6,
    },
    SPECTRUM_OVERDRAW_TYPE: {
        ALL_FILTERS: 0,
        GYRO_FILTERS: 1,
        DTERM_FILTERS: 2,
        YAW_FILTERS: 3,
        HIDE_FILTERS: 4,
        AUTO: 5,
    },
    GraphSpectrumPlot: {
        initialize: vi.fn(),
        setLogRateWarningInfo: vi.fn(),
        setMinPSD: vi.fn(),
        setMaxPSD: vi.fn(),
        setLowLevelPSD: vi.fn(),
        setOverdraw: vi.fn(),
        setFullScreen: vi.fn(),
        setSize: vi.fn(),
        setData: vi.fn(),
        setZoom: vi.fn(),
        setMousePosition: vi.fn(),
        draw: vi.fn(),
        isImportedCurvesMaxCount: vi.fn(),
        isNewComparedCurve: vi.fn(),
        removeComparedCurve: vi.fn(),
        addCurrentSpectrumIntoImport: vi.fn(),
        importCurvesFromCSV: vi.fn(),
        removeImportedCurves: vi.fn(),
        isMultiSpectrum: vi.fn(),
    },
}));

vi.mock("../../src/blackbox-viewer/spectrum-exporter", () => ({ SpectrumExporter: vi.fn() }));

// An immediate pass-through, so the sliders run synchronously.
vi.mock("throttle-debounce", () => ({
    debounce: (_delay: number, callback: (...args: unknown[]) => unknown) => callback,
}));

const FREQUENCY = 0;
const PSD = 3;

const spectrum = (fieldIndex: number) => ({ fieldIndex, fieldName: `field ${fieldIndex}`, maximalSegmentsLength: 0 });
const curve = {} as never;

// Only getSysConfig(): the analyser hands the config to the (mocked) calc and plot and reads nothing else.
const fakeLog = { getSysConfig: () => ({}) } as unknown as FlightLog;

/** The canvases are real jsdom ones; the analyser canvas sits in a container, as in the Vue panel. */
function makeCanvases() {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 500;
    const container = document.createElement("div");
    const analyserCanvas = document.createElement("canvas");
    container.append(analyserCanvas);
    return { canvas, container, analyserCanvas };
}

function makeAnalyser(spectrumType = FREQUENCY) {
    const settings = useSettingsStore().userSettings;
    settings.spectrumType = spectrumType;
    const canvases = makeCanvases();
    const analyser = new FlightLogAnalyser(fakeLog, canvases.canvas, canvases.analyserCanvas);
    return { analyser, settings, ...canvases };
}

describe("FlightLogAnalyser", () => {
    beforeEach(() => {
        // resetAllMocks, not clearAllMocks: clearAllMocks keeps implementations, so a throwing
        // initialize from one test would leak into the next.
        vi.resetAllMocks();
        setActivePinia(createPinia());
        vi.mocked(GraphSpectrumCalc.dataLoadFrequency).mockImplementation(() => spectrum(2) as never);
        vi.mocked(GraphSpectrumCalc.dataLoadPSD).mockImplementation(() => spectrum(2) as never);
        vi.mocked(GraphSpectrumPlot.isImportedCurvesMaxCount).mockReturnValue(false);
        vi.mocked(GraphSpectrumPlot.isNewComparedCurve).mockReturnValue(true);
        vi.mocked(GraphSpectrumPlot.isMultiSpectrum).mockReturnValue(false);
        vi.mocked(SpectrumExporter).mockReturnValue({ dump: vi.fn() } as never);
        vi.spyOn(PrefStorage.prototype, "get").mockImplementation((_name, callback) => callback({} as never));
        vi.spyOn(PrefStorage.prototype, "set").mockImplementation(() => {});
    });

    describe("plotSpectrum", () => {
        it("loads the data and hands it to the plot on the first call", () => {
            const { analyser } = makeAnalyser();
            analyser.plotSpectrum(2, curve, "gyro");

            expect(GraphSpectrumCalc.setDataBuffer).toHaveBeenCalledWith(2, curve, "gyro");
            expect(GraphSpectrumPlot.setData).toHaveBeenCalledWith(spectrum(2), FREQUENCY);
            expect(GraphSpectrumPlot.draw).toHaveBeenCalledTimes(1);
        });

        it("does not reload for the same field, but still draws", () => {
            const { analyser } = makeAnalyser();
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.plotSpectrum(2, curve, "gyro");

            expect(GraphSpectrumCalc.dataLoadFrequency).toHaveBeenCalledTimes(1);
            expect(GraphSpectrumPlot.setData).toHaveBeenCalledTimes(1);
            expect(GraphSpectrumPlot.draw).toHaveBeenCalledTimes(2);
        });

        it("reloads for a new field", () => {
            const { analyser } = makeAnalyser();
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.plotSpectrum(3, curve, "dterm");

            expect(GraphSpectrumCalc.setDataBuffer).toHaveBeenLastCalledWith(3, curve, "dterm");
            expect(GraphSpectrumCalc.dataLoadFrequency).toHaveBeenCalledTimes(2);
        });

        it.each(["setInTime", "setOutTime"] as const)("reloads once after %s", (method) => {
            const { analyser } = makeAnalyser();
            analyser.plotSpectrum(2, curve, "gyro");
            analyser[method](1000);
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.plotSpectrum(2, curve, "gyro");

            expect(GraphSpectrumCalc.dataLoadFrequency).toHaveBeenCalledTimes(2);
        });

        it("forwards the time to the calc and returns its answer", () => {
            vi.mocked(GraphSpectrumCalc.setInTime).mockReturnValue(123);
            vi.mocked(GraphSpectrumCalc.setOutTime).mockReturnValue(456);
            const { analyser } = makeAnalyser();

            expect(analyser.setInTime(100)).toBe(123);
            expect(analyser.setOutTime(200)).toBe(456);
            expect(GraphSpectrumCalc.setInTime).toHaveBeenCalledWith(100);
            expect(GraphSpectrumCalc.setOutTime).toHaveBeenCalledWith(200);
        });

        it("sizes the segment-length slider from the PSD's longest segment", () => {
            vi.mocked(GraphSpectrumCalc.dataLoadPSD).mockReturnValue({
                ...spectrum(2),
                maximalSegmentsLength: 1000,
            } as never);
            const { analyser } = makeAnalyser(PSD);
            analyser.plotSpectrum(2, curve, "gyro");

            expect(useGraphStore().segmentLengthMax).toBe(10);
        });
    });

    describe("PSD comparison", () => {
        it("adds the current spectrum to the import before loading the next one", () => {
            const { analyser } = makeAnalyser(PSD);
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.prepareSpectrumForComparison();
            expect(analyser.shouldAddCurrentSpectrumBeforeReload()).toBe(true);

            vi.mocked(GraphSpectrumCalc.dataLoadPSD).mockReturnValue(spectrum(3) as never);
            analyser.plotSpectrum(3, curve, "dterm");

            // Once for the old spectrum before the reload, once for the new one after it (the
            // comparison flag is only cleared at the end).
            const [beforeReload, afterReload] = vi.mocked(GraphSpectrumPlot.addCurrentSpectrumIntoImport).mock
                .invocationCallOrder;
            const setDataOrder = vi.mocked(GraphSpectrumPlot.setData).mock.invocationCallOrder[1];
            expect(GraphSpectrumPlot.addCurrentSpectrumIntoImport).toHaveBeenCalledTimes(2);
            expect(beforeReload).toBeLessThan(setDataOrder);
            expect(afterReload).toBeGreaterThan(setDataOrder);
            expect(analyser.shouldAddCurrentSpectrumBeforeReload()).toBe(false);
        });

        it("does not add the current spectrum while several are already shown", () => {
            const { analyser } = makeAnalyser(PSD);
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.prepareSpectrumForComparison();
            vi.mocked(GraphSpectrumPlot.isMultiSpectrum).mockReturnValue(true);

            expect(analyser.shouldAddCurrentSpectrumBeforeReload()).toBe(false);
        });

        it("does nothing for other spectrum types", () => {
            const { analyser } = makeAnalyser(FREQUENCY);
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.prepareSpectrumForComparison();
            analyser.plotSpectrum(3, curve, "dterm");

            expect(GraphSpectrumPlot.addCurrentSpectrumIntoImport).not.toHaveBeenCalled();
        });

        it("removes a ctrl-clicked field that is already compared instead of reloading", () => {
            const { analyser } = makeAnalyser(PSD);
            analyser.plotSpectrum(2, curve, "gyro");
            analyser.prepareSpectrumForComparison();
            vi.mocked(GraphSpectrumPlot.isNewComparedCurve).mockReturnValue(false);
            analyser.plotSpectrum(3, curve, "dterm");

            expect(GraphSpectrumPlot.removeComparedCurve).toHaveBeenCalledWith("dterm");
            expect(GraphSpectrumPlot.setData).toHaveBeenCalledTimes(1);
            expect(GraphSpectrumPlot.addCurrentSpectrumIntoImport).not.toHaveBeenCalled();
            // The comparison is over: a later click on a new field is a plain reload.
            vi.mocked(GraphSpectrumPlot.isNewComparedCurve).mockReturnValue(true);
            analyser.plotSpectrum(4, curve, "other");
            expect(GraphSpectrumPlot.setData).toHaveBeenCalledTimes(2);
            expect(GraphSpectrumPlot.addCurrentSpectrumIntoImport).not.toHaveBeenCalled();
        });
    });

    describe("setSpectrumType", () => {
        it("stores the number, persists it and replots", () => {
            vi.mocked(PrefStorage.prototype.get).mockImplementation((_name, callback) =>
                callback({ psdHeatmapMin: -50 } as never),
            );
            const { analyser, settings } = makeAnalyser();
            analyser.setSpectrumType("3");

            expect(settings.spectrumType).toBe(PSD);
            expect(PrefStorage.prototype.set).toHaveBeenCalledWith("userSettings", {
                psdHeatmapMin: -50,
                spectrumType: 3,
            });
            expect(GraphSpectrumCalc.dataLoadPSD).toHaveBeenCalledTimes(1);
            expect(GraphSpectrumPlot.setData).toHaveBeenCalledWith(spectrum(2), PSD);
        });

        it("does nothing for the type already selected", () => {
            const { analyser } = makeAnalyser(PSD);
            analyser.setSpectrumType("3");

            expect(PrefStorage.prototype.set).not.toHaveBeenCalled();
            expect(GraphSpectrumPlot.setData).not.toHaveBeenCalled();
            expect(GraphSpectrumPlot.draw).not.toHaveBeenCalled();
        });
    });

    describe("getExportedFileName", () => {
        it.each([
            [FREQUENCY, "flight_sp"],
            [PSD, "flight_psd"],
            [1, "flight"],
            [6, "flight"],
        ])("for spectrum type %i is %s, from the log name up to the first dot", (type, expected) => {
            const { analyser } = makeAnalyser(type);
            useAppStore().logFilename = "flight.01.bbl";

            expect(analyser.getExportedFileName()).toBe(expected);
        });

        it("is the bare suffix when no log is loaded", () => {
            const { analyser } = makeAnalyser(FREQUENCY);
            expect(analyser.getExportedFileName()).toBe("_sp");
        });
    });

    it("exportSpectrumToCSV passes both callbacks to the exporter, so a failing worker ends the export", () => {
        const dump = vi.fn();
        vi.mocked(SpectrumExporter).mockReturnValue({ dump } as never);
        const { analyser } = makeAnalyser();
        analyser.plotSpectrum(2, curve, "gyro");
        const onSuccess = vi.fn();
        const onFailure = vi.fn();
        const options = { includeHeader: true } as never;
        analyser.exportSpectrumToCSV(onSuccess, options, onFailure);

        expect(SpectrumExporter).toHaveBeenCalledWith(spectrum(2), options);
        expect(dump).toHaveBeenCalledWith(onSuccess, onFailure);
    });

    describe("when setup fails", () => {
        it("makes every method a no-op and reports the error", () => {
            vi.mocked(GraphSpectrumCalc.initialize).mockImplementation(() => {
                throw new Error("no worker");
            });
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
            const { analyser } = makeAnalyser(PSD);
            useAppStore().logFilename = "flight.bbl";

            analyser.plotSpectrum(2, curve, "gyro");
            analyser.setSpectrumType("0");
            analyser.setZoomX(50);
            analyser.resize();
            analyser.exportSpectrumToCSV(vi.fn(), {}, vi.fn());
            analyser.importSpectrumFromCSV([]);
            analyser.removeImportedSpectrums();

            expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("no worker"));
            expect(analyser.getExportedFileName()).toBe("");
            expect(analyser.isMultiSpectrum()).toBe(false);
            expect(analyser.shouldAddCurrentSpectrumBeforeReload()).toBe(false);
            expect(GraphSpectrumPlot.setData).not.toHaveBeenCalled();
            expect(GraphSpectrumPlot.draw).not.toHaveBeenCalled();
            expect(GraphSpectrumPlot.setZoom).not.toHaveBeenCalled();
            expect(GraphSpectrumPlot.importCurvesFromCSV).not.toHaveBeenCalled();
            expect(GraphSpectrumPlot.removeImportedCurves).not.toHaveBeenCalled();
            expect(SpectrumExporter).not.toHaveBeenCalled();
            expect(PrefStorage.prototype.set).not.toHaveBeenCalled();
            expect(useSettingsStore().userSettings.spectrumType).toBe(PSD);
        });
    });

    describe("resize", () => {
        it("positions the container at a percentage of the main canvas and pushes the layout", () => {
            const { analyser, container } = makeAnalyser();
            useSettingsStore().userSettings.analyser = { left: "2%", top: "60%", size: "35%" };
            analyser.resize();

            expect(container.style.left).toBe("20px");
            expect(container.style.top).toBe("300px");
            expect(GraphSpectrumPlot.setSize).toHaveBeenLastCalledWith(350, 175);
            expect(useGraphStore().analyserLayout).toEqual({ width: 350, height: 175, left: 20, top: 300 });
        });

        it("fills the canvas less a margin when fullscreen", () => {
            const { analyser, canvas, container } = makeAnalyser();
            Object.defineProperty(canvas, "clientWidth", { value: 800 });
            Object.defineProperty(canvas, "clientHeight", { value: 600 });
            analyser.setFullscreen(true);

            expect(GraphSpectrumPlot.setFullScreen).toHaveBeenCalledWith(true);
            expect(container.style.left).toBe("10px");
            expect(container.style.top).toBe("10px");
            expect(useGraphStore().analyserLayout).toEqual({ width: 780, height: 580, left: 10, top: 10 });
        });
    });
});
