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

import { debounce } from "throttle-debounce";
import type { ExpoCurve } from "./expo";
import type { FlightLog } from "./flightlog";
import { GraphSpectrumCalc, type FrequencySpectrum, type PsdSpectrum, type SpectrumData } from "./graph_spectrum_calc";
import { GraphSpectrumPlot, SPECTRUM_TYPE, SPECTRUM_OVERDRAW_TYPE } from "./graph_spectrum_plot";
import { PrefStorage } from "./pref_storage";
import { SpectrumExporter, type SpectrumExportOptions } from "./spectrum-exporter";
import { useSettingsStore } from "./stores/settings";
import { useGraphStore } from "./stores/graph";
import { useAppStore } from "./stores/app";

type Slider = (value: number) => void;

/**
 * The spectrum analyser of the log viewer: loads the selected field's spectrum through
 * GraphSpectrumCalc and draws it with GraphSpectrumPlot. If setting up fails, every member is a
 * no-op, so the grapher and the Vue panel can call it without checking.
 */
export class FlightLogAnalyser {
    declare setFullscreen: (size: boolean) => void;
    /** Ctrl+click on a legend field: keep the current PSD to compare the next one against. */
    declare prepareSpectrumForComparison: () => void;
    /** null clears the mark; the analysis then starts at the log's start. */
    declare setInTime: (time: number | null) => number | null | void;
    /** null clears the mark; the analysis then ends at the log's end. */
    declare setOutTime: (time: number | null) => number | null | void;
    declare resize: () => void;
    declare shouldAddCurrentSpectrumBeforeReload: () => boolean;
    declare plotSpectrum: (fieldIndex: number, curve: ExpoCurve | null, fieldName: string | null) => void;
    declare destroy: () => void;
    declare refresh: () => void;
    declare draw: () => void;
    /** One of SPECTRUM_TYPE, as the panel's select holds it. */
    declare setSpectrumType: (type: string) => void;
    /** One of SPECTRUM_OVERDRAW_TYPE, as the panel's select holds it. */
    declare setOverdrawType: (type: string) => void;
    /** Percent; debounced. */
    declare setZoomX: Slider;
    declare resetZoomX: () => void;
    /** Percent; debounced. */
    declare setZoomY: Slider;
    declare resetZoomY: () => void;
    declare setMinPSD: Slider;
    declare resetMinPSD: () => void;
    declare setMaxPSD: Slider;
    declare resetMaxPSD: () => void;
    declare setLowLevelPSD: Slider;
    declare resetLowLevelPSD: (minValue: number) => void;
    /** log2 of the PSD segment length; debounced. */
    declare setSegmentLength: Slider;
    declare resetSegmentLength: () => void;
    /** Only the frequency and PSD spectra export (see getExportedFileName()). */
    declare exportSpectrumToCSV: (
        onSuccess: (csv: string) => void,
        options: Partial<SpectrumExportOptions>,
        onFailure: (error: unknown) => void,
    ) => void;
    declare importSpectrumFromCSV: (files: Iterable<File>) => void;
    declare removeImportedSpectrums: () => void;
    /** The log's name with a suffix per spectrum type; "" for a type that does not export. */
    declare getExportedFileName: () => string;
    declare isMultiSpectrum: () => boolean;

    constructor(flightLog: FlightLog, canvas: HTMLCanvasElement, analyserCanvas: HTMLCanvasElement) {
        const { userSettings } = useSettingsStore();
        const graphStore = useGraphStore();
        const appStore = useAppStore();

        const ANALYSER_LARGE_LEFT_MARGIN = 10,
            ANALYSER_LARGE_TOP_MARGIN = 10,
            ANALYSER_LARGE_HEIGHT_MARGIN = 20,
            ANALYSER_LARGE_WIDTH_MARGIN = 20;

        const prefs = new PrefStorage(),
            DEFAULT_PSD_HEATMAP_MIN = -40,
            DEFAULT_PSD_HEATMAP_MAX = 10,
            DEFAULT_PSD_SEGMENT_LENGTH_POWER = 9;
        let analyserZoomX = 1,
            analyserZoomY = 1,
            dataReload = false,
            fftData: SpectrumData | null = null,
            addSpectrumForComparison = false;

        try {
            let isFullscreen = false;

            const sysConfig = flightLog.getSysConfig();
            const logRateInfo = GraphSpectrumCalc.initialize(flightLog, sysConfig);
            GraphSpectrumPlot.initialize(analyserCanvas, sysConfig);
            GraphSpectrumPlot.setLogRateWarningInfo(logRateInfo);

            // Initialize user settings defaults
            userSettings.spectrumType = userSettings.spectrumType || SPECTRUM_TYPE.FREQUENCY;
            userSettings.overdrawSpectrumType = userSettings.overdrawSpectrumType || SPECTRUM_OVERDRAW_TYPE.ALL_FILTERS;
            if (userSettings.psdHeatmapMin === undefined) {
                userSettings.psdHeatmapMin = DEFAULT_PSD_HEATMAP_MIN;
            }
            if (userSettings.psdHeatmapMax === undefined) {
                userSettings.psdHeatmapMax = DEFAULT_PSD_HEATMAP_MAX;
            }

            GraphSpectrumPlot.setMinPSD(userSettings.psdHeatmapMin);
            GraphSpectrumPlot.setLowLevelPSD(userSettings.psdHeatmapMin);
            GraphSpectrumPlot.setMaxPSD(userSettings.psdHeatmapMax);
            GraphSpectrumPlot.setOverdraw(userSettings.overdrawSpectrumType);
            GraphSpectrumCalc.setPointsPerSegmentPSD(2 ** DEFAULT_PSD_SEGMENT_LENGTH_POWER);

            this.setFullscreen = (size) => {
                isFullscreen = size === true;
                GraphSpectrumPlot.setFullScreen(isFullscreen);
                this.resize();
            };

            this.prepareSpectrumForComparison = () => {
                if (userSettings.spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY) {
                    addSpectrumForComparison = true;
                }
            };

            this.setInTime = (time) => {
                dataReload = true;
                return GraphSpectrumCalc.setInTime(time);
            };

            this.setOutTime = (time) => {
                dataReload = true;
                return GraphSpectrumCalc.setOutTime(time);
            };

            const getSize = function () {
                if (isFullscreen) {
                    return {
                        height: canvas.clientHeight - ANALYSER_LARGE_HEIGHT_MARGIN,
                        width: canvas.clientWidth - ANALYSER_LARGE_WIDTH_MARGIN,
                        left: ANALYSER_LARGE_LEFT_MARGIN,
                        top: ANALYSER_LARGE_TOP_MARGIN,
                    };
                } else {
                    return {
                        height: (canvas.height * Number.parseInt(userSettings.analyser.size, 10)) / 100,
                        width: (canvas.width * Number.parseInt(userSettings.analyser.size, 10)) / 100,
                        left: (canvas.width * Number.parseInt(userSettings.analyser.left, 10)) / 100,
                        top: (canvas.height * Number.parseInt(userSettings.analyser.top, 10)) / 100,
                    };
                }
            };

            this.resize = () => {
                const newSize = getSize();
                GraphSpectrumPlot.setSize(newSize.width, newSize.height);

                // Position the analyser canvas container
                // The analyser canvas is mounted inside its positioned container.
                const parentElem = analyserCanvas.parentElement!;
                parentElem.style.left = `${newSize.left}px`;
                parentElem.style.top = `${newSize.top}px`;

                // Push layout to store for Vue component positioning
                graphStore.analyserLayout = {
                    width: newSize.width,
                    height: newSize.height,
                    left: newSize.left,
                    top: newSize.top,
                };
            };

            const dataLoad = function (
                fieldIndex?: number,
                curve?: ExpoCurve | null,
                fieldName?: string | null,
            ): SpectrumData {
                if (fieldIndex !== undefined && fieldIndex > 0 && curve != null && fieldName != null) {
                    GraphSpectrumCalc.setDataBuffer(fieldIndex, curve, fieldName);
                }

                switch (userSettings.spectrumType) {
                    case SPECTRUM_TYPE.FREQ_VS_THROTTLE:
                        fftData = GraphSpectrumCalc.dataLoadFrequencyVsThrottle();
                        break;
                    case SPECTRUM_TYPE.FREQ_VS_RPM:
                        fftData = GraphSpectrumCalc.dataLoadFrequencyVsRpm();
                        break;
                    case SPECTRUM_TYPE.PSD_VS_THROTTLE:
                        fftData = GraphSpectrumCalc.dataLoadPowerSpectralDensityVsThrottle();
                        break;
                    case SPECTRUM_TYPE.PSD_VS_RPM:
                        fftData = GraphSpectrumCalc.dataLoadPowerSpectralDensityVsRpm();
                        break;
                    case SPECTRUM_TYPE.PIDERROR_VS_SETPOINT:
                        fftData = GraphSpectrumCalc.dataLoadPidErrorVsSetpoint();
                        break;
                    case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY: {
                        const psd = GraphSpectrumCalc.dataLoadPSD(analyserZoomY);
                        fftData = psd;
                        if (psd.maximalSegmentsLength > 0) {
                            graphStore.segmentLengthMax = Math.ceil(Math.log2(psd.maximalSegmentsLength));
                        }
                        break;
                    }
                    case SPECTRUM_TYPE.FREQUENCY:
                    default:
                        fftData = GraphSpectrumCalc.dataLoadFrequency();
                        break;
                }
                return fftData;
            };

            this.shouldAddCurrentSpectrumBeforeReload = () => {
                return addSpectrumForComparison && fftData !== null && !this.isMultiSpectrum() && !dataReload;
            };

            this.plotSpectrum = (fieldIndex, curve, fieldName) => {
                const isMaxCountOfImportedPSD =
                    GraphSpectrumPlot.isImportedCurvesMaxCount() &&
                    userSettings.spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY;
                let shouldReload =
                    fftData === null || (fieldIndex !== fftData.fieldIndex && !isMaxCountOfImportedPSD) || dataReload;

                if (addSpectrumForComparison && !GraphSpectrumPlot.isNewComparedCurve(fieldName)) {
                    GraphSpectrumPlot.removeComparedCurve(fieldName);
                    addSpectrumForComparison = false;
                    shouldReload = false;
                }

                if (shouldReload) {
                    if (this.shouldAddCurrentSpectrumBeforeReload()) {
                        GraphSpectrumPlot.addCurrentSpectrumIntoImport();
                    }
                    dataReload = false;
                    GraphSpectrumPlot.setData(dataLoad(fieldIndex, curve, fieldName), userSettings.spectrumType);
                }
                if (addSpectrumForComparison) {
                    GraphSpectrumPlot.addCurrentSpectrumIntoImport();
                    addSpectrumForComparison = false;
                }
                this.draw();
            };

            // Also bound to touchmove, where shiftKey is false unless a keyboard is held, and clientX is absent.
            const onMouseMoveAnalyser = (e: MouseEvent | TouchEvent) => {
                if (e.shiftKey) {
                    graphStore.spectrumShiftActive = true;
                    const rect = analyserCanvas.getBoundingClientRect();
                    const { clientX, clientY } = e as MouseEvent;
                    const mouseX = clientX - rect.left;
                    const mouseY = clientY - rect.top;
                    GraphSpectrumPlot.setMousePosition(mouseX, mouseY);
                    this.refresh();
                    e.preventDefault();
                } else {
                    graphStore.spectrumShiftActive = false;
                }
            };

            this.destroy = () => {
                analyserCanvas.removeEventListener("mousemove", onMouseMoveAnalyser);
                analyserCanvas.removeEventListener("touchmove", onMouseMoveAnalyser);
            };

            this.refresh = () => {
                this.draw();
            };

            this.draw = () => {
                GraphSpectrumPlot.draw();
            };

            analyserCanvas.addEventListener("mousemove", onMouseMoveAnalyser);
            analyserCanvas.addEventListener("touchmove", onMouseMoveAnalyser);

            // --- Methods called by Vue component ---

            this.setSpectrumType = (type) => {
                const optionSelected = Number.parseInt(type, 10);
                if (optionSelected !== userSettings.spectrumType) {
                    userSettings.spectrumType = optionSelected;
                    saveOneUserSetting("spectrumType", optionSelected);
                    dataReload = true;
                    this.plotSpectrum(-1, null, null);
                }
            };

            this.setOverdrawType = (type) => {
                const optionSelected = Number.parseInt(type, 10);
                if (optionSelected !== userSettings.overdrawSpectrumType) {
                    userSettings.overdrawSpectrumType = optionSelected;
                    saveOneUserSetting("overdrawSpectrumType", optionSelected);
                    GraphSpectrumPlot.setOverdraw(optionSelected);
                    this.draw();
                }
            };

            this.setZoomX = debounce(100, (value: number) => {
                analyserZoomX = value / 100;
                GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
                this.refresh();
            });

            this.resetZoomX = () => {
                analyserZoomX = 1;
                GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
                this.refresh();
            };

            this.setZoomY = debounce(100, (value: number) => {
                analyserZoomY = 1 / (value / 100);
                GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
                this.refresh();
            });

            this.resetZoomY = () => {
                analyserZoomY = 1;
                GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
                this.refresh();
            };

            this.setMinPSD = debounce(100, (value: number) => {
                const min = Number.parseInt(String(value), 10);
                GraphSpectrumPlot.setMinPSD(min);
                saveOneUserSetting("psdHeatmapMin", min);
                this.refresh();
            });

            this.resetMinPSD = () => {
                GraphSpectrumPlot.setMinPSD(userSettings.psdHeatmapMin);
                this.refresh();
            };

            this.setMaxPSD = debounce(100, (value: number) => {
                const max = Number.parseInt(String(value), 10);
                GraphSpectrumPlot.setMaxPSD(max);
                saveOneUserSetting("psdHeatmapMax", max);
                this.refresh();
            });

            this.resetMaxPSD = () => {
                GraphSpectrumPlot.setMaxPSD(userSettings.psdHeatmapMax);
                this.refresh();
            };

            this.setLowLevelPSD = debounce(100, (value: number) => {
                GraphSpectrumPlot.setLowLevelPSD(Number.parseInt(String(value), 10));
                this.refresh();
            });

            this.resetLowLevelPSD = (minValue) => {
                GraphSpectrumPlot.setLowLevelPSD(Number.parseInt(String(minValue), 10));
                this.refresh();
            };

            this.setSegmentLength = debounce(100, (value: number) => {
                GraphSpectrumCalc.setPointsPerSegmentPSD(2 ** Number.parseInt(String(value), 10));
                GraphSpectrumPlot.setData(dataLoad(), userSettings.spectrumType);
                this.refresh();
            });

            this.resetSegmentLength = () => {
                GraphSpectrumCalc.setPointsPerSegmentPSD(2 ** DEFAULT_PSD_SEGMENT_LENGTH_POWER);
                GraphSpectrumPlot.setData(dataLoad(), userSettings.spectrumType);
                this.refresh();
            };

            function saveOneUserSetting(name: string, value: number) {
                prefs.get("userSettings", function (stored) {
                    const data = (stored || {}) as Record<string, unknown>;
                    data[name] = value;
                    prefs.set("userSettings", data);
                });
            }

            this.exportSpectrumToCSV = (onSuccess, options, onFailure) => {
                // Reached only for a type getExportedFileName() names, so a frequency or PSD spectrum.
                SpectrumExporter(fftData as FrequencySpectrum | PsdSpectrum, options).dump(onSuccess, onFailure);
            };

            this.importSpectrumFromCSV = (files) => {
                GraphSpectrumPlot.importCurvesFromCSV(files);
            };

            this.removeImportedSpectrums = () => {
                GraphSpectrumPlot.removeImportedCurves();
            };

            this.getExportedFileName = () => {
                let fileName = (appStore.logFilename || "").split(".")[0];
                switch (userSettings.spectrumType) {
                    case SPECTRUM_TYPE.FREQUENCY:
                        fileName = `${fileName}_sp`;
                        break;
                    case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
                        fileName = `${fileName}_psd`;
                        break;
                }
                return fileName;
            };

            this.isMultiSpectrum = () => {
                return GraphSpectrumPlot.isMultiSpectrum();
            };
        } catch (e) {
            console.error(`Failed to create analyser... error: ${e}`);

            // Initialisation failed: provide safe no-op stubs so callers that invoke
            // these methods directly (e.g. grapher.js) don't crash with TypeError.
            const noop = () => {};
            this.resize = noop;
            this.setFullscreen = noop;
            this.plotSpectrum = noop;
            this.destroy = noop;
            this.refresh = noop;
            this.draw = noop;
            this.setSpectrumType = noop;
            this.setOverdrawType = noop;
            this.setZoomX = noop;
            this.resetZoomX = noop;
            this.setZoomY = noop;
            this.resetZoomY = noop;
            this.setMinPSD = noop;
            this.resetMinPSD = noop;
            this.setMaxPSD = noop;
            this.resetMaxPSD = noop;
            this.setLowLevelPSD = noop;
            this.resetLowLevelPSD = noop;
            this.setSegmentLength = noop;
            this.resetSegmentLength = noop;
            this.prepareSpectrumForComparison = noop;
            this.setInTime = noop;
            this.setOutTime = noop;
            this.shouldAddCurrentSpectrumBeforeReload = () => false;
            this.exportSpectrumToCSV = noop;
            this.importSpectrumFromCSV = noop;
            this.removeImportedSpectrums = noop;
            this.getExportedFileName = () => "";
            this.isMultiSpectrum = () => false;
        }
    }
}
