import { debounce } from "throttle-debounce";
import { GraphSpectrumCalc } from "./graph_spectrum_calc";
import { GraphSpectrumPlot, SPECTRUM_TYPE, SPECTRUM_OVERDRAW_TYPE } from "./graph_spectrum_plot";
import { PrefStorage } from "./pref_storage";
import { SpectrumExporter } from "./spectrum-exporter";
import { useSettingsStore } from "./stores/settings.js";
import { useGraphStore } from "./stores/graph.js";
import { useAppStore } from "./stores/app.js";

export function FlightLogAnalyser(flightLog, canvas, analyserCanvas) {
    const { userSettings } = useSettingsStore();
    const graphStore = useGraphStore();
    const appStore = useAppStore();

    const ANALYSER_LARGE_LEFT_MARGIN = 10,
        ANALYSER_LARGE_TOP_MARGIN = 10,
        ANALYSER_LARGE_HEIGHT_MARGIN = 20,
        ANALYSER_LARGE_WIDTH_MARGIN = 20;

    const that = this,
        prefs = new PrefStorage(),
        DEFAULT_PSD_HEATMAP_MIN = -40,
        DEFAULT_PSD_HEATMAP_MAX = 10,
        DEFAULT_PSD_SEGMENT_LENGTH_POWER = 9;
    let analyserZoomX = 1,
        analyserZoomY = 1,
        dataReload = false,
        fftData = null,
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

        this.setFullscreen = function (size) {
            isFullscreen = size === true;
            GraphSpectrumPlot.setFullScreen(isFullscreen);
            that.resize();
        };

        this.prepareSpectrumForComparison = function () {
            if (userSettings.spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY) {
                addSpectrumForComparison = true;
            }
        };

        this.setInTime = function (time) {
            dataReload = true;
            return GraphSpectrumCalc.setInTime(time);
        };

        this.setOutTime = function (time) {
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

        this.resize = function () {
            const newSize = getSize();
            GraphSpectrumPlot.setSize(newSize.width, newSize.height);

            // Position the analyser canvas container
            const parentElem = analyserCanvas.parentElement;
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

        const dataLoad = function (fieldIndex, curve, fieldName) {
            if (fieldIndex > 0 && curve != null && fieldName != null) {
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
                case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
                    fftData = GraphSpectrumCalc.dataLoadPSD(analyserZoomY);
                    if (fftData.maximalSegmentsLength > 0) {
                        graphStore.segmentLengthMax = Math.ceil(Math.log2(fftData.maximalSegmentsLength));
                    }
                    break;
                case SPECTRUM_TYPE.FREQUENCY:
                default:
                    fftData = GraphSpectrumCalc.dataLoadFrequency();
                    break;
            }
        };

        this.shouldAddCurrentSpectrumBeforeReload = function () {
            return addSpectrumForComparison && fftData !== null && !this.isMultiSpectrum() && !dataReload;
        };

        this.plotSpectrum = function (fieldIndex, curve, fieldName) {
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
                dataLoad(fieldIndex, curve, fieldName);
                GraphSpectrumPlot.setData(fftData, userSettings.spectrumType);
            }
            if (addSpectrumForComparison) {
                GraphSpectrumPlot.addCurrentSpectrumIntoImport();
                addSpectrumForComparison = false;
            }
            that.draw();
        };

        function onMouseMoveAnalyser(e) {
            if (e.shiftKey) {
                graphStore.spectrumShiftActive = true;
                const rect = analyserCanvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                GraphSpectrumPlot.setMousePosition(mouseX, mouseY);
                that.refresh();
                e.preventDefault();
            } else {
                graphStore.spectrumShiftActive = false;
            }
        }

        this.destroy = function () {
            analyserCanvas.removeEventListener("mousemove", onMouseMoveAnalyser);
            analyserCanvas.removeEventListener("touchmove", onMouseMoveAnalyser);
        };

        this.refresh = function () {
            that.draw();
        };

        this.draw = function () {
            GraphSpectrumPlot.draw();
        };

        analyserCanvas.addEventListener("mousemove", onMouseMoveAnalyser);
        analyserCanvas.addEventListener("touchmove", onMouseMoveAnalyser);

        // --- Methods called by Vue component ---

        this.setSpectrumType = function (type) {
            const optionSelected = Number.parseInt(type, 10);
            if (optionSelected !== userSettings.spectrumType) {
                userSettings.spectrumType = optionSelected;
                saveOneUserSetting("spectrumType", optionSelected);
                dataReload = true;
                that.plotSpectrum(-1, null, null);
            }
        };

        this.setOverdrawType = function (type) {
            const optionSelected = Number.parseInt(type, 10);
            if (optionSelected !== userSettings.overdrawSpectrumType) {
                userSettings.overdrawSpectrumType = optionSelected;
                saveOneUserSetting("overdrawSpectrumType", optionSelected);
                GraphSpectrumPlot.setOverdraw(optionSelected);
                that.draw();
            }
        };

        this.setZoomX = debounce(100, function (value) {
            analyserZoomX = value / 100;
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            that.refresh();
        });

        this.resetZoomX = function () {
            analyserZoomX = 1;
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            that.refresh();
        };

        this.setZoomY = debounce(100, function (value) {
            analyserZoomY = 1 / (value / 100);
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            that.refresh();
        });

        this.resetZoomY = function () {
            analyserZoomY = 1;
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            that.refresh();
        };

        this.setMinPSD = debounce(100, function (value) {
            const min = Number.parseInt(value, 10);
            GraphSpectrumPlot.setMinPSD(min);
            saveOneUserSetting("psdHeatmapMin", min);
            that.refresh();
        });

        this.resetMinPSD = function () {
            GraphSpectrumPlot.setMinPSD(userSettings.psdHeatmapMin);
            that.refresh();
        };

        this.setMaxPSD = debounce(100, function (value) {
            const max = Number.parseInt(value, 10);
            GraphSpectrumPlot.setMaxPSD(max);
            saveOneUserSetting("psdHeatmapMax", max);
            that.refresh();
        });

        this.resetMaxPSD = function () {
            GraphSpectrumPlot.setMaxPSD(userSettings.psdHeatmapMax);
            that.refresh();
        };

        this.setLowLevelPSD = debounce(100, function (value) {
            GraphSpectrumPlot.setLowLevelPSD(Number.parseInt(value, 10));
            that.refresh();
        });

        this.resetLowLevelPSD = function (minValue) {
            GraphSpectrumPlot.setLowLevelPSD(Number.parseInt(minValue, 10));
            that.refresh();
        };

        this.setSegmentLength = debounce(100, function (value) {
            GraphSpectrumCalc.setPointsPerSegmentPSD(2 ** Number.parseInt(value, 10));
            dataLoad();
            GraphSpectrumPlot.setData(fftData, userSettings.spectrumType);
            that.refresh();
        });

        this.resetSegmentLength = function () {
            GraphSpectrumCalc.setPointsPerSegmentPSD(2 ** DEFAULT_PSD_SEGMENT_LENGTH_POWER);
            dataLoad();
            GraphSpectrumPlot.setData(fftData, userSettings.spectrumType);
            that.refresh();
        };

        function saveOneUserSetting(name, value) {
            prefs.get("userSettings", function (data) {
                data = data || {};
                data[name] = value;
                prefs.set("userSettings", data);
            });
        }

        this.exportSpectrumToCSV = function (onSuccess, options) {
            SpectrumExporter(fftData, options).dump(onSuccess);
        };

        this.importSpectrumFromCSV = function (files) {
            GraphSpectrumPlot.importCurvesFromCSV(files);
        };

        this.removeImportedSpectrums = function () {
            GraphSpectrumPlot.removeImportedCurves();
        };

        this.getExportedFileName = function () {
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

        this.isMultiSpectrum = function () {
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
