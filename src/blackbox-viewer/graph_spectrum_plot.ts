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

import { FILTER_TYPE } from "./flightlog_fielddefs";
import type { SysConfig } from "./flightlog_parser";
import { constrain, type HeaderScalar, type HeaderValue } from "./tools";
import {
    NUM_VS_BINS,
    type FrequencySpectrum,
    type LogRateInfo,
    type PidErrorVsSetpoint,
    type PsdSpectrum,
    type SpectrumData,
    type ValueRange,
    type VsSpectrum,
} from "./graph_spectrum_calc";
import { ImportedCurves, type CurvePoint } from "./graph_imported_curves";
import { useSettingsStore } from "./stores/settings";

const BLUR_FILTER_PIXEL = 1,
    DEFAULT_FONT_FACE = "Verdana, Arial, sans-serif",
    DEFAULT_MARK_LINE_WIDTH = 2,
    MARGIN = 10,
    MARGIN_BOTTOM = 10,
    MARGIN_LEFT = 25,
    MARGIN_LEFT_FULLSCREEN = 35,
    MAX_SETPOINT_DEFAULT = 100,
    PID_ERROR_VERTICAL_CHUNK = 5,
    ZOOM_X_MAX = 5,
    MAX_SPECTRUM_LINE_COUNT = 30000;

export const SPECTRUM_TYPE = {
    FREQUENCY: 0,
    FREQ_VS_THROTTLE: 1,
    FREQ_VS_RPM: 2,
    POWER_SPECTRAL_DENSITY: 3,
    PSD_VS_THROTTLE: 4,
    PSD_VS_RPM: 5,
    PIDERROR_VS_SETPOINT: 6,
} as const;

export type SpectrumType = (typeof SPECTRUM_TYPE)[keyof typeof SPECTRUM_TYPE];

export const SPECTRUM_OVERDRAW_TYPE = {
    ALL_FILTERS: 0,
    GYRO_FILTERS: 1,
    DTERM_FILTERS: 2,
    YAW_FILTERS: 3,
    HIDE_FILTERS: 4,
    AUTO: 5,
} as const;

export type SpectrumOverdrawType = (typeof SPECTRUM_OVERDRAW_TYPE)[keyof typeof SPECTRUM_OVERDRAW_TYPE];

/**
 * What the overlays shared by every spectrum type read from the data. The PID error plot has
 * no rate, so the filter markers drawn over it land at NaN, as they always have.
 */
interface SpectrumView {
    fieldName: string | null;
    blackBoxRate?: number;
    maxNoiseFrequency?: number;
    vsRange?: ValueRange;
}

type CanvasTextAlign2D = CanvasRenderingContext2D["textAlign"];
type CanvasTextBaseline2D = CanvasRenderingContext2D["textBaseline"];

/** Where a marker is drawn: the plot's size, and the label row's distance from the top. */
interface MarkerArea {
    WIDTH: number;
    HEIGHT: number;
    OFFSET: number;
}

/** A marker's colour and width; a width over 5 is a frequency band in Hz. Unset parts take the defaults. */
interface MarkerStyle {
    stroke?: string;
    lineWidth?: number;
}

/** A dynamic lowpass filter: its cutoff from minimum to maximum throttle, and the curve's expo. */
interface DynamicLowpass {
    frequency1: number;
    frequency2: number;
    expo: HeaderValue | null | undefined;
}

interface GraphSpectrumPlotModule {
    _isFullScreen: boolean;
    _cachedCanvas: HTMLCanvasElement | null;
    _cachedDataCanvas: HTMLCanvasElement | null;
    _canvasCtx: CanvasRenderingContext2D | null;
    _fftData: SpectrumData | null;
    _mousePosition: { x: number; y: number };
    /** The user setting: not yet one of SPECTRUM_OVERDRAW_TYPE when it comes from older stored settings. */
    _overdrawType: number | null;
    /** The user setting: not yet one of SPECTRUM_TYPE when it comes from older stored settings. */
    _spectrumType: number | null;
    _sysConfig: SysConfig | null;
    _zoomX: number;
    _zoomY: number;
    _minPSD: number;
    _maxPSD: number;
    _lowLevelPSD: number;
    _drawingParams: { fontSizeFrameLabel: string; fontSizeFrameLabelFullscreen: string };
    _importedSpectrums: ImportedCurves | null;
    _importedPSD: ImportedCurves | null;
    _logRateWarning?: LogRateInfo;
    curvesColors: string[];

    initialize(canvas: HTMLCanvasElement, sysConfig: SysConfig): void;
    setZoom(zoomX: number, zoomY: number): void;
    setMinPSD(min: number): void;
    setMaxPSD(max: number): void;
    setLowLevelPSD(lowLevel: number): void;
    setSize(width: number, height: number): void;
    setFullScreen(isFullScreen: boolean): void;
    setData(fftData: SpectrumData, spectrumType: number): void;
    redraw(): void;
    setOverdraw(overdrawType: number): void;
    setMousePosition(x: number, y: number): void;
    draw(): void;
    _drawCachedElements(): void;
    _drawGraph(canvasCtx: CanvasRenderingContext2D): void;
    getCurveColor(index: number): string;
    _drawFrequencyGraph(canvasCtx: CanvasRenderingContext2D): void;
    _drawPowerSpectralDensityGraph(canvasCtx: CanvasRenderingContext2D): void;
    _drawLegend(
        canvasCtx: CanvasRenderingContext2D,
        WIDTH: number,
        HEIGHT: number,
        importedCurves: ImportedCurves,
    ): void;
    getPSDbyFreq(frequency: number): number;
    _drawFrequencyVsXGraph(canvasCtx: CanvasRenderingContext2D, drawPSD?: boolean): void;
    _drawHeatMap(drawPSD?: boolean): HTMLCanvasElement;
    getValueFromMatrixFFT(frequency: number, vsArgument: number): number;
    _drawPidErrorVsSetpointGraph(canvasCtx: CanvasRenderingContext2D): void;
    _drawPidErrorVsSetpointGraphProcessData(): {
        currentDataMaxSetpoint: number;
        currentDrawMaxSetpoint: number;
        pidErrorArray: (number | null)[];
        currentDrawMaxPidError: number;
    };
    _drawPidErrorVsSetpointGraphLine(
        canvasCtx: CanvasRenderingContext2D,
        pidErrorArray: (number | null)[],
        currentDrawMaxSetpoint: number,
        currentDrawMaxPidError: number,
        WIDTH: number,
        HEIGHT: number,
    ): void;
    _drawPidErrorVsSetpointGraphGroups(
        canvasCtx: CanvasRenderingContext2D,
        currentDataMaxSetpoint: number,
        currentDrawMaxSetpoint: number,
        currentDrawMaxPidError: number,
        WIDTH: number,
        HEIGHT: number,
    ): void;
    _drawFiltersAndMarkers(canvasCtx: CanvasRenderingContext2D): void;
    _drawNotCachedElements(): void;
    _drawAxisLabel(
        canvasCtx: CanvasRenderingContext2D,
        axisLabel: string,
        X: number,
        Y: number,
        align?: CanvasTextAlign2D,
        baseline?: CanvasTextBaseline2D,
    ): void;
    _drawHorizontalGridLines(
        canvasCtx: CanvasRenderingContext2D,
        maxValue: number,
        WIDTH: number,
        HEIGHT: number,
        MARGIN_UP_LABEL: number,
        unitsLabel: string,
    ): void;
    _drawVerticalGridLines(
        canvasCtx: CanvasRenderingContext2D,
        WIDTH: number,
        HEIGHT: number,
        minValue: number,
        maxValue: number,
        label: string,
        ticks?: number,
    ): void;
    _drawVerticalMarkerLine(
        canvasCtx: CanvasRenderingContext2D,
        value: number,
        axisMaximum: number,
        label: string | null,
        area: MarkerArea,
        style?: MarkerStyle,
    ): number;
    _drawHorizontalMarkerLine(
        canvasCtx: CanvasRenderingContext2D,
        value: number,
        minAxisValue: number,
        maxAxisValue: number,
        label: string | null,
        area: MarkerArea,
        style?: MarkerStyle,
    ): number;
    _drawGradientBackground(canvasCtx: CanvasRenderingContext2D, WIDTH: number, HEIGHT: number): void;
    _drawInterestFrequency(
        canvasCtx: CanvasRenderingContext2D,
        frequency: number,
        maximalFrequency: number,
        label: string,
        area: MarkerArea,
        style?: MarkerStyle,
    ): number;
    _drawLowpassFilter(
        canvasCtx: CanvasRenderingContext2D,
        frequency: number,
        maximalFrequency: number,
        label: string,
        area: MarkerArea,
        style?: MarkerStyle,
    ): number;
    _drawLowpassDynFilter(
        canvasCtx: CanvasRenderingContext2D,
        filter: DynamicLowpass,
        maximalFrequency: number,
        label: string,
        area: MarkerArea,
        style?: MarkerStyle,
    ): void;
    _drawNotchFilter(
        canvasCtx: CanvasRenderingContext2D,
        center: number,
        cutoff: number,
        maximalFrequency: number,
        label: string,
        area: MarkerArea,
        style?: MarkerStyle,
    ): void;
    _drawMousePosition(
        canvasCtx: CanvasRenderingContext2D,
        mouseX: number,
        mouseY: number,
        area: MarkerArea,
        style: MarkerStyle,
    ): void;
    _getActualMarginLeft(): number;
    _drawCurve(canvasCtx: CanvasRenderingContext2D, points: CurvePoint[], tension?: number | null): void;
    _invalidateCache(): void;
    _invalidateDataCache(): void;
    setLogRateWarningInfo(logRateInfo: LogRateInfo | undefined): void;
    _drawRateWarning(canvasCtx: CanvasRenderingContext2D): void;
    importCurvesFromCSV(files: Iterable<File>): void;
    removeImportedCurves(): void;
    isNewComparedCurve(name: string | null): boolean;
    addCurrentSpectrumIntoImport(): void;
    removeComparedCurve(name: string | null): void;
    isMultiSpectrum(): boolean;
    isImportedCurvesMaxCount(): boolean;
}

/** Draws the spectrum analyser; one canvas at a time, set by initialize(). */
export const GraphSpectrumPlot = {
    _isFullScreen: false,
    _cachedCanvas: null,
    _cachedDataCanvas: null,
    _canvasCtx: null,
    _fftData: null,
    _mousePosition: {
        x: 0,
        y: 0,
    },
    _overdrawType: null,
    _spectrumType: null,
    _sysConfig: null,
    _zoomX: 1,
    _zoomY: 1,
    // _minPSD, _maxPSD, _lowLevelPSD will initialize later in FlightLogAnalyser from stored settings
    _minPSD: 0,
    _maxPSD: 0,
    _lowLevelPSD: 0,
    _drawingParams: {
        fontSizeFrameLabel: "6",
        fontSizeFrameLabelFullscreen: "9",
    },
    _importedSpectrums: null,
    _importedPSD: null,
    curvesColors: [
        "White", // The first imported curve duplicates existing main curve, therefore it must have same white color
        "Blue",
        "Purple",
        "DeepPink",
        "DarkCyan",
        "Chocolate",
    ],
} as GraphSpectrumPlotModule;

/** `value[i]` as JavaScript reads it from a header value: a single number has no elements. */
function headerElement(value: HeaderValue, i: number): HeaderScalar | null | undefined {
    return typeof value === "number" ? undefined : value[i];
}

// The accessors below hold for every draw: initialize() sets the canvas, the curve sets and the
// header, and FlightLogAnalyser calls setData() before its first draw.

function contextOf(plot: GraphSpectrumPlotModule): CanvasRenderingContext2D {
    return plot._canvasCtx!;
}

function sysConfigOf(plot: GraphSpectrumPlotModule): SysConfig {
    return plot._sysConfig!;
}

function spectraOf(plot: GraphSpectrumPlotModule): ImportedCurves {
    return plot._importedSpectrums!;
}

function comparedPsdOf(plot: GraphSpectrumPlotModule): ImportedCurves {
    return plot._importedPSD!;
}

/** The data as the shape the current spectrum type's loader returns; each draw is only reached for its own type. */
function dataOf<T extends SpectrumData>(plot: GraphSpectrumPlotModule): T {
    return plot._fftData as T;
}

/** The data as the shared overlays read it, whichever spectrum type is drawn. */
function viewOf(plot: GraphSpectrumPlotModule): SpectrumView {
    return plot._fftData as SpectrumView;
}

GraphSpectrumPlot.initialize = function (canvas, sysConfig) {
    this._importedSpectrums = new ImportedCurves(() => GraphSpectrumPlot.redraw());
    this._importedPSD = new ImportedCurves(() => GraphSpectrumPlot.redraw());
    this._canvasCtx = canvas.getContext("2d");
    this._sysConfig = sysConfig;
    this._invalidateCache();
    this._invalidateDataCache();
    this._logRateWarning = undefined;
    this._zoomX = 1;
    this._zoomY = 1;
};

GraphSpectrumPlot.setZoom = function (zoomX, zoomY) {
    const modifiedZoomY = this._zoomY !== zoomY;

    this._zoomX = zoomX;
    this._zoomY = zoomY;
    this._invalidateCache();

    if (modifiedZoomY) {
        this._invalidateDataCache();
    }
};

GraphSpectrumPlot.setMinPSD = function (min) {
    const modified = this._minPSD !== min;
    if (modified) {
        this._minPSD = min;
        this._invalidateCache();
        this._invalidateDataCache();
    }
};

GraphSpectrumPlot.setMaxPSD = function (max) {
    const modified = this._maxPSD !== max;
    if (modified) {
        this._maxPSD = max;
        this._invalidateCache();
        this._invalidateDataCache();
    }
};

GraphSpectrumPlot.setLowLevelPSD = function (lowLevel) {
    const modifiedLevel = this._lowLevelPSD !== lowLevel;
    if (modifiedLevel) {
        this._lowLevelPSD = lowLevel;
        this._invalidateCache();
        this._invalidateDataCache();
    }
};

GraphSpectrumPlot.setSize = function (width, height) {
    contextOf(this).canvas.width = width;
    contextOf(this).canvas.height = height;
    this._invalidateCache();
};

GraphSpectrumPlot.setFullScreen = function (isFullScreen) {
    this._isFullScreen = isFullScreen;
    this._invalidateCache();
};

GraphSpectrumPlot.setData = function (fftData, spectrumType) {
    this._fftData = fftData;
    this._spectrumType = spectrumType;
    this._invalidateCache();
    this._invalidateDataCache();
};

GraphSpectrumPlot.redraw = function () {
    this._invalidateCache();
    this._invalidateDataCache();
    GraphSpectrumPlot.draw();
};

GraphSpectrumPlot.setOverdraw = function (overdrawType) {
    this._overdrawType = overdrawType;
    this._invalidateCache();
};

GraphSpectrumPlot.setMousePosition = function (x, y) {
    this._mousePosition.x = x;
    this._mousePosition.y = y;
};

GraphSpectrumPlot.draw = function () {
    this._drawCachedElements();
    this._drawNotCachedElements();
};

GraphSpectrumPlot._drawCachedElements = function () {
    if (this._cachedCanvas == null) {
        this._cachedCanvas = document.createElement("canvas");
        // A fresh canvas always has a 2D context to give.
        const cachedCtx = this._cachedCanvas.getContext("2d")!;

        cachedCtx.canvas.height = contextOf(this).canvas.height;
        cachedCtx.canvas.width = contextOf(this).canvas.width;

        this._drawGraph(cachedCtx);
        this._drawFiltersAndMarkers(cachedCtx);
    }

    contextOf(this).clearRect(0, 0, contextOf(this).canvas.width, contextOf(this).canvas.height);
    contextOf(this).drawImage(this._cachedCanvas, 0, 0, contextOf(this).canvas.width, contextOf(this).canvas.height);
};

GraphSpectrumPlot._drawGraph = function (canvasCtx) {
    switch (this._spectrumType) {
        case SPECTRUM_TYPE.FREQUENCY:
            this._drawFrequencyGraph(canvasCtx);
            break;

        case SPECTRUM_TYPE.FREQ_VS_THROTTLE:
            this._drawFrequencyVsXGraph(canvasCtx);
            break;

        case SPECTRUM_TYPE.FREQ_VS_RPM:
            this._drawFrequencyVsXGraph(canvasCtx);
            break;

        case SPECTRUM_TYPE.PSD_VS_THROTTLE:
            this._drawFrequencyVsXGraph(canvasCtx, true);
            break;

        case SPECTRUM_TYPE.PSD_VS_RPM:
            this._drawFrequencyVsXGraph(canvasCtx, true);
            break;

        case SPECTRUM_TYPE.PIDERROR_VS_SETPOINT:
            this._drawPidErrorVsSetpointGraph(canvasCtx);
            break;

        case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
            this._drawPowerSpectralDensityGraph(canvasCtx);
            break;
    }
};

GraphSpectrumPlot.getCurveColor = function (index) {
    return this.curvesColors[index % this.curvesColors.length];
};

/**
 * The moving average of 200 points around a point of an imported spectrum, to give a visible line.
 * Near the ends the window is clamped to the curve, and the sum is still divided by 200.
 */
function movingAverageAt(curvesPoints: CurvePoint[], pointNum: number): number {
    const filterPointsCount = 200;
    const pointsCount = curvesPoints.length;
    let filterStartPoint = Math.max(pointNum - filterPointsCount / 2, 0);
    let filterStopPoint = filterStartPoint + filterPointsCount;
    if (filterStopPoint > pointsCount) {
        filterStopPoint = pointsCount;
        filterStartPoint = Math.max(filterStopPoint - filterPointsCount, 0);
    }
    let middleValue = 0;
    for (let i = filterStartPoint; i < filterStopPoint; i++) {
        middleValue += curvesPoints[i].y;
    }
    return middleValue / filterPointsCount;
}

/** How the PSD graph maps a (frequency, dBm/Hz) point onto the canvas. */
interface PsdAxes {
    maxFrequency: number;
    scaleX: number;
    scaleY: number;
    minY: number;
    HEIGHT: number;
}

/** The current spectrum, drawn when nothing is being compared, up to the zoomed maximum frequency. */
function drawPsdCurve(canvasCtx: CanvasRenderingContext2D, fftData: PsdSpectrum, color: string, axes: PsdAxes): void {
    const { maxFrequency, scaleX, scaleY, minY, HEIGHT } = axes;
    const pointsCount = fftData.fftLength;
    canvasCtx.beginPath();
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = color;
    for (let pointNum = 0; pointNum < pointsCount; pointNum++) {
        const freq = ((fftData.blackBoxRate / 2) * pointNum) / pointsCount;
        if (freq > maxFrequency) {
            break;
        }
        const y = HEIGHT - (fftData.fftOutput[pointNum] - minY) * scaleY;
        if (pointNum === 0) {
            canvasCtx.moveTo(freq * scaleX, y);
        } else {
            canvasCtx.lineTo(freq * scaleX, y);
        }
    }
    canvasCtx.stroke();
}

/** A compared spectrum, up to the zoomed maximum frequency. */
function drawComparedCurve(
    canvasCtx: CanvasRenderingContext2D,
    points: CurvePoint[],
    color: string,
    axes: PsdAxes,
): void {
    const { maxFrequency, scaleX, scaleY, minY, HEIGHT } = axes;
    canvasCtx.beginPath();
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = color;
    let isFirstPoint = true;
    for (const point of points) {
        if (point.x > maxFrequency) {
            break;
        }
        if (isFirstPoint) {
            canvasCtx.moveTo(point.x * scaleX, HEIGHT - (point.y - minY) * scaleY);
            isFirstPoint = false;
        } else {
            canvasCtx.lineTo(point.x * scaleX, HEIGHT - (point.y - minY) * scaleY);
        }
    }
    canvasCtx.stroke();
}

GraphSpectrumPlot._drawFrequencyGraph = function (canvasCtx) {
    const fftData = dataOf<FrequencySpectrum>(this);
    const HEIGHT = canvasCtx.canvas.height - MARGIN;
    const WIDTH = canvasCtx.canvas.width;
    const PLOTTED_BUFFER_LENGTH = fftData.fftLength / this._zoomX;
    const MAXIMAL_PLOTTED_FREQUENCY = (0.5 * fftData.blackBoxRate) / this._zoomX;

    this._drawGradientBackground(canvasCtx, WIDTH, HEIGHT);

    const barGradient = canvasCtx.createLinearGradient(0, HEIGHT, 0, 0);
    barGradient.addColorStop(constrain(0 / this._zoomY, 0, 1), "rgba(0,255,0,0.2)");
    barGradient.addColorStop(constrain(0.15 / this._zoomY, 0, 1), "rgba(128,255,0,0.2)");
    barGradient.addColorStop(constrain(0.45 / this._zoomY, 0, 1), "rgba(255,0,0,0.5)");
    barGradient.addColorStop(constrain(1 / this._zoomY, 0, 1), "rgba(255,128,128,1.0)");

    canvasCtx.fillStyle = barGradient;

    const fftScale = HEIGHT / (this._zoomY * 100);
    // Limit maximal count of drawing line to get good performance
    const stepData = Math.floor(PLOTTED_BUFFER_LENGTH / MAX_SPECTRUM_LINE_COUNT) + 1;
    const stepX = WIDTH / (PLOTTED_BUFFER_LENGTH / stepData);
    const barWidth = Math.max(stepX, 1);
    let x = 0;
    for (let i = 0; i < PLOTTED_BUFFER_LENGTH; i += stepData) {
        const barHeight = fftData.fftOutput[i] * fftScale;
        canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
        x += stepX;
    }

    const scaleX = WIDTH / MAXIMAL_PLOTTED_FREQUENCY;
    const spectrumCount = spectraOf(this).curvesCount();
    for (let spectrumNum = 0; spectrumNum < spectrumCount; spectrumNum++) {
        const curvesPoints = spectraOf(this).getCurve(spectrumNum).points;
        const pointsCount = curvesPoints.length;

        canvasCtx.beginPath();
        canvasCtx.lineWidth = 1;
        canvasCtx.strokeStyle = this.getCurveColor(spectrumNum);
        canvasCtx.moveTo(0, HEIGHT);
        for (let pointNum = 0; pointNum < pointsCount; pointNum++) {
            const middleValue = movingAverageAt(curvesPoints, pointNum);
            canvasCtx.lineTo(curvesPoints[pointNum].x * scaleX, HEIGHT - middleValue * fftScale);
        }
        canvasCtx.stroke();
    }

    //Legend draw
    if (this._isFullScreen && spectrumCount > 0) {
        this._drawLegend(canvasCtx, WIDTH, HEIGHT, spectraOf(this));
    }

    this._drawAxisLabel(canvasCtx, String(fftData.fieldName), WIDTH - 4, HEIGHT - 6, "right");
    this._drawHorizontalGridLines(canvasCtx, MAXIMAL_PLOTTED_FREQUENCY, WIDTH, HEIGHT, MARGIN, "Hz");
};

GraphSpectrumPlot._drawPowerSpectralDensityGraph = function (canvasCtx) {
    const fftData = dataOf<PsdSpectrum>(this);
    const HEIGHT = canvasCtx.canvas.height - MARGIN;
    const ACTUAL_MARGIN_LEFT = this._getActualMarginLeft();
    const WIDTH = canvasCtx.canvas.width - ACTUAL_MARGIN_LEFT;
    const LEFT = canvasCtx.canvas.offsetLeft + ACTUAL_MARGIN_LEFT;
    const TOP = canvasCtx.canvas.offsetTop;
    const MAXIMAL_PLOTTED_FREQUENCY = (0.5 * fftData.blackBoxRate) / this._zoomX;

    // Allign y axis range by 10db
    const minimum = Math.min(fftData.minimum, comparedPsdOf(this).minY),
        maximum = Math.max(fftData.maximum, comparedPsdOf(this).maxY);
    const dbStep = 10;
    const minY = Math.floor(minimum / dbStep) * dbStep;
    let maxY = (Math.floor(maximum / dbStep) + 1) * dbStep;
    if (minY === maxY) {
        maxY = minY + 1; // prevent divide by zero
    }
    //Store vsRange for _drawMousePosition
    fftData.vsRange = {
        min: minY,
        max: maxY,
    };

    const mainCurveColor = this.getCurveColor(0); // The main curve must have color like the first imported curves - White.
    const ticksCount = (maxY - minY) / dbStep;
    const axes: PsdAxes = {
        maxFrequency: MAXIMAL_PLOTTED_FREQUENCY,
        scaleX: WIDTH / MAXIMAL_PLOTTED_FREQUENCY,
        scaleY: HEIGHT / (maxY - minY),
        minY,
        HEIGHT,
    };

    canvasCtx.translate(LEFT, TOP);
    this._drawGradientBackground(canvasCtx, WIDTH, HEIGHT);

    const comparedSpectrumCount = comparedPsdOf(this).curvesCount();

    if (comparedSpectrumCount === 0) {
        // Draw main spectrum curve when there are no spectrums comparison only
        drawPsdCurve(canvasCtx, fftData, mainCurveColor, axes);
    }

    for (let spectrumNum = 0; spectrumNum < comparedSpectrumCount; spectrumNum++) {
        drawComparedCurve(
            canvasCtx,
            comparedPsdOf(this).getCurve(spectrumNum).points,
            this.getCurveColor(spectrumNum),
            axes,
        );
    }

    //Legend draw
    if (this._isFullScreen && comparedSpectrumCount > 0) {
        this._drawLegend(canvasCtx, WIDTH, HEIGHT, comparedPsdOf(this));
    }

    this._drawAxisLabel(canvasCtx, String(fftData.fieldName), WIDTH - 4, HEIGHT - 6, "right");
    this._drawHorizontalGridLines(canvasCtx, MAXIMAL_PLOTTED_FREQUENCY, WIDTH, HEIGHT, MARGIN, "Hz");
    this._drawVerticalGridLines(canvasCtx, WIDTH, HEIGHT, minY, maxY, "dBm/Hz", ticksCount);
    const offset = 1;
    this._drawInterestFrequency(
        canvasCtx,
        fftData.maxNoiseFrequency,
        MAXIMAL_PLOTTED_FREQUENCY,
        "Max noise",
        { WIDTH, HEIGHT, OFFSET: 15 * offset + MARGIN },
        { stroke: "rgba(255,0,0,0.50)", lineWidth: 3 },
    );
};

GraphSpectrumPlot._drawLegend = function (canvasCtx, WIDTH, HEIGHT, importedCurves) {
    const { userSettings } = useSettingsStore();
    const left = Number.parseFloat(userSettings?.analyser_legend?.left);
    const top = Number.parseFloat(userSettings?.analyser_legend?.top);
    const width = Number.parseFloat(userSettings?.analyser_legend?.width);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width)) {
        return;
    }
    const spectrumCount = importedCurves.curvesCount(),
        legendPosX = (left / 100) * WIDTH,
        legendPosY = (top / 100) * HEIGHT,
        rowHeight = 16,
        padding = 4,
        legendWidth = (width / 100) * WIDTH,
        legendHeight = spectrumCount * rowHeight + padding,
        legendArea = new Path2D();

    canvasCtx.save();
    legendArea.rect(legendPosX, legendPosY, legendWidth, legendHeight);
    canvasCtx.clip(legendArea);
    canvasCtx.strokeStyle = "gray";
    canvasCtx.strokeRect(legendPosX, legendPosY, legendWidth, legendHeight);
    canvasCtx.font = `${this._drawingParams.fontSizeFrameLabelFullscreen}pt ${DEFAULT_FONT_FACE}`;
    canvasCtx.textAlign = "left";
    canvasCtx.textBaseline = "middle"; // Ensure proper vertical centering
    for (let row = 0; row < spectrumCount; row++) {
        const curvesName = importedCurves.getCurve(row).name;
        const Y = legendPosY + padding + rowHeight * row + rowHeight / 2; // Center text vertically
        canvasCtx.strokeStyle = this.getCurveColor(row);
        canvasCtx.strokeText(curvesName, legendPosX + padding, Y);
    }
    canvasCtx.restore();
};

GraphSpectrumPlot.getPSDbyFreq = function (frequency) {
    const fftData = dataOf<PsdSpectrum>(this);
    let freqIndex = Math.round(((2 * frequency) / fftData.blackBoxRate) * (fftData.fftOutput.length - 1));
    freqIndex = Math.min(freqIndex, fftData.fftOutput.length - 1);
    freqIndex = Math.max(freqIndex, 0);
    return fftData.fftOutput.length ? fftData.fftOutput[freqIndex] : 0;
};

GraphSpectrumPlot._drawFrequencyVsXGraph = function (canvasCtx, drawPSD = false) {
    const fftData = dataOf<VsSpectrum>(this);
    const MAXIMAL_PLOTTED_FREQUENCY = (0.5 * fftData.blackBoxRate) / this._zoomX;
    const ACTUAL_MARGIN_LEFT = this._getActualMarginLeft();
    const WIDTH = canvasCtx.canvas.width - ACTUAL_MARGIN_LEFT;
    const HEIGHT = canvasCtx.canvas.height - MARGIN_BOTTOM;
    const LEFT = canvasCtx.canvas.offsetLeft + ACTUAL_MARGIN_LEFT;
    const TOP = canvasCtx.canvas.offsetTop;

    canvasCtx.translate(LEFT, TOP);

    this._cachedDataCanvas ??= this._drawHeatMap(drawPSD);

    canvasCtx.drawImage(this._cachedDataCanvas, 0, 0, WIDTH, HEIGHT);

    canvasCtx.drawImage(
        this._cachedDataCanvas,
        0,
        0,
        this._cachedDataCanvas.width / this._zoomX,
        this._cachedDataCanvas.height,
        0,
        0,
        WIDTH,
        HEIGHT,
    );

    this._drawAxisLabel(canvasCtx, String(fftData.fieldName), WIDTH - 4, HEIGHT - 6, "right");
    this._drawHorizontalGridLines(canvasCtx, MAXIMAL_PLOTTED_FREQUENCY, WIDTH, HEIGHT, MARGIN_BOTTOM, "Hz");

    if (this._spectrumType === SPECTRUM_TYPE.FREQ_VS_THROTTLE || this._spectrumType === SPECTRUM_TYPE.PSD_VS_THROTTLE) {
        this._drawVerticalGridLines(canvasCtx, WIDTH, HEIGHT, fftData.vsRange.min, fftData.vsRange.max, "%");
    } else if (this._spectrumType === SPECTRUM_TYPE.FREQ_VS_RPM || this._spectrumType === SPECTRUM_TYPE.PSD_VS_RPM) {
        this._drawVerticalGridLines(canvasCtx, WIDTH, HEIGHT, fftData.vsRange.min, fftData.vsRange.max, "Hz");
    }
};

GraphSpectrumPlot._drawHeatMap = function (drawPSD = false) {
    const fftData = dataOf<VsSpectrum>(this);
    const THROTTLE_VALUES_SIZE = 100;
    //The magnitude is greate then seperete Re or Im value up to 1.4=sqrt(2). Therefore the SCALE_HEATMAP is decreased from 1.3 to 1.1
    const SCALE_HEATMAP = 1.1; // Value decided after some tests to be similar to the s
    // This value will be maximum color

    const heatMapCanvas = document.createElement("canvas");
    const canvasCtx = heatMapCanvas.getContext("2d", { alpha: false })!;

    // We use always a canvas of the size of the FFT data (is not too big)
    canvasCtx.canvas.width = fftData.fftLength;
    canvasCtx.canvas.height = THROTTLE_VALUES_SIZE;

    // Loop for throttle
    for (let j = 0; j < THROTTLE_VALUES_SIZE; j++) {
        // Loop for frequency
        for (let i = 0; i < fftData.fftLength; i++) {
            let valuePlot = fftData.fftOutput[j][i];
            if (drawPSD) {
                if (valuePlot < this._lowLevelPSD) {
                    valuePlot = this._minPSD; // Filter low values
                } else {
                    valuePlot = Math.max(valuePlot, this._minPSD);
                }
                valuePlot = Math.min(valuePlot, this._maxPSD);
                valuePlot = Math.round(((valuePlot - this._minPSD) * 100) / (this._maxPSD - this._minPSD));
            } else {
                const fftColorScale = 100 / (this._zoomY * SCALE_HEATMAP);
                valuePlot = Math.round(Math.min(valuePlot * fftColorScale, 100));
            }

            // The fillStyle is slow, but I haven't found a way to do this faster...
            canvasCtx.fillStyle = `hsl(360, 100%, ${valuePlot}%)`;
            canvasCtx.fillRect(i, 99 - j, 1, 1);
        }
    }

    // The resulting image has imperfections, usually we not have all the data in the input, so we apply a little of blur
    canvasCtx.filter = `blur(${BLUR_FILTER_PIXEL}px)`;
    canvasCtx.drawImage(heatMapCanvas, 0, 0);
    canvasCtx.filter = "none";

    return heatMapCanvas;
};

GraphSpectrumPlot.getValueFromMatrixFFT = function (frequency, vsArgument) {
    const matrixFFT = dataOf<VsSpectrum>(this);
    let vsArgumentIndex = Math.round(
        (NUM_VS_BINS * (vsArgument - matrixFFT.vsRange.min)) / (matrixFFT.vsRange.max - matrixFFT.vsRange.min),
    );
    vsArgumentIndex = Math.max(vsArgumentIndex, 0);
    vsArgumentIndex = Math.min(vsArgumentIndex, NUM_VS_BINS - 1);

    let freqIndex = Math.round(((2 * frequency) / matrixFFT.blackBoxRate) * (matrixFFT.fftLength - 1));
    freqIndex = Math.max(freqIndex, 0);
    freqIndex = Math.min(freqIndex, matrixFFT.fftLength - 1);
    return matrixFFT.fftOutput[vsArgumentIndex][freqIndex];
};

GraphSpectrumPlot._drawPidErrorVsSetpointGraph = function (canvasCtx) {
    const fftData = dataOf<PidErrorVsSetpoint>(this);
    const ACTUAL_MARGIN_LEFT = this._getActualMarginLeft();

    const WIDTH = canvasCtx.canvas.width - ACTUAL_MARGIN_LEFT;
    const HEIGHT = canvasCtx.canvas.height - MARGIN_BOTTOM;
    const LEFT = canvasCtx.canvas.offsetLeft + ACTUAL_MARGIN_LEFT;
    const TOP = canvasCtx.canvas.offsetTop;

    const dataLimits = this._drawPidErrorVsSetpointGraphProcessData();

    canvasCtx.translate(LEFT, TOP);

    canvasCtx.beginPath();

    this._drawGradientBackground(canvasCtx, WIDTH, HEIGHT);

    // Line with all the PID Error
    this._drawPidErrorVsSetpointGraphLine(
        canvasCtx,
        dataLimits.pidErrorArray,
        dataLimits.currentDrawMaxSetpoint,
        dataLimits.currentDrawMaxPidError,
        WIDTH,
        HEIGHT,
    );

    // Squares grouping the setpoint range in groups
    this._drawPidErrorVsSetpointGraphGroups(
        canvasCtx,
        dataLimits.currentDataMaxSetpoint,
        dataLimits.currentDrawMaxSetpoint,
        dataLimits.currentDrawMaxPidError,
        WIDTH,
        HEIGHT,
    );

    this._drawAxisLabel(canvasCtx, fftData.axisName, WIDTH - 4, HEIGHT - 6, "right");
    this._drawHorizontalGridLines(canvasCtx, dataLimits.currentDrawMaxSetpoint, WIDTH, HEIGHT, MARGIN_BOTTOM, "deg/s");
    this._drawVerticalGridLines(canvasCtx, WIDTH, HEIGHT, 0, dataLimits.currentDrawMaxPidError, "deg/s");
};

GraphSpectrumPlot._drawPidErrorVsSetpointGraphProcessData = function () {
    const fftData = dataOf<PidErrorVsSetpoint>(this);
    const totalDrawMaxSetpoint =
        Math.trunc((fftData.fftOutput.length + (MAX_SETPOINT_DEFAULT - 1)) / MAX_SETPOINT_DEFAULT) *
        MAX_SETPOINT_DEFAULT;
    const currentDrawMaxSetpoint =
        MAX_SETPOINT_DEFAULT +
        Math.trunc((totalDrawMaxSetpoint - MAX_SETPOINT_DEFAULT) / (ZOOM_X_MAX - 1)) * (this._zoomX - 1);
    const currentDataMaxSetpoint = Math.min(currentDrawMaxSetpoint, fftData.fftOutput.length - 1);
    const pidErrorArray = fftData.fftOutput.slice(0, currentDataMaxSetpoint + 1);
    // Math.max() reads a null bin as 0.
    const maxPidError = Math.max(...pidErrorArray.map(Number));
    const currentDrawMaxPidError = Math.trunc(maxPidError / PID_ERROR_VERTICAL_CHUNK + 1) * PID_ERROR_VERTICAL_CHUNK;

    return {
        currentDataMaxSetpoint,
        currentDrawMaxSetpoint,
        pidErrorArray,
        currentDrawMaxPidError,
    };
};

GraphSpectrumPlot._drawPidErrorVsSetpointGraphLine = function (
    canvasCtx,
    pidErrorArray,
    currentDrawMaxSetpoint,
    currentDrawMaxPidError,
    WIDTH,
    HEIGHT,
) {
    canvasCtx.lineWidth = DEFAULT_MARK_LINE_WIDTH;
    canvasCtx.strokeStyle = "rgba(128,128,255,0.50)";

    const points: CurvePoint[] = [];
    for (let setpoint = 0; setpoint <= currentDrawMaxSetpoint; setpoint++) {
        const pidError = pidErrorArray[setpoint];
        if (pidError != null) {
            const x = (setpoint * WIDTH) / currentDrawMaxSetpoint;
            const y = HEIGHT - (pidError * HEIGHT) / currentDrawMaxPidError;
            points.push({
                x,
                y,
            });
        }
    }
    this._drawCurve(canvasCtx, points);
};

GraphSpectrumPlot._drawPidErrorVsSetpointGraphGroups = function (
    canvasCtx,
    currentDataMaxSetpoint,
    currentDrawMaxSetpoint,
    currentDrawMaxPidError,
    WIDTH,
    HEIGHT,
) {
    const fftData = dataOf<PidErrorVsSetpoint>(this);
    const NUMBER_OF_GROUPS = 10;

    const groupedSetpointWidth = currentDrawMaxSetpoint / NUMBER_OF_GROUPS;
    for (let setpointGroup = 0; setpointGroup <= currentDrawMaxSetpoint; setpointGroup += groupedSetpointWidth) {
        let sumPidError = 0;
        let countSamples = 0;
        for (
            let setpoint = setpointGroup;
            setpoint <= currentDataMaxSetpoint && setpoint < setpointGroup + groupedSetpointWidth;
            setpoint++
        ) {
            const pidError = fftData.fftOutput[setpoint];
            if (pidError != null) {
                sumPidError += pidError;
                countSamples++;
            }
        }
        if (countSamples > 0) {
            // Draw the rectangle
            const setpointGroupError = sumPidError / countSamples;
            const x = (setpointGroup * WIDTH) / currentDrawMaxSetpoint;
            const y = HEIGHT - (setpointGroupError * HEIGHT) / currentDrawMaxPidError;
            const width = (groupedSetpointWidth * WIDTH) / currentDrawMaxSetpoint;
            const height = HEIGHT - y;
            canvasCtx.fillStyle = "rgba(128,255,0,0.2)";
            canvasCtx.fillRect(x + 1, y, width - 2, height);

            // Draw the value number
            const textGroup = setpointGroupError.toFixed(1);
            this._drawAxisLabel(canvasCtx, textGroup, x + width / 2, Math.min(y + 12, HEIGHT - 2));
        }
    }
};

/**
 * Where the filter markers go: one row each, 15 px apart, held in a shared counter so a marker
 * drawn before a failure still keeps its row.
 */
interface FilterOverlay {
    plot: GraphSpectrumPlotModule;
    canvasCtx: CanvasRenderingContext2D;
    sys: SysConfig;
    maxFrequency: number;
    WIDTH: number;
    HEIGHT: number;
    rows: { offset: number };
}

/** The area of the next marker row. */
function nextRow(overlay: FilterOverlay): MarkerArea {
    return { WIDTH: overlay.WIDTH, HEIGHT: overlay.HEIGHT, OFFSET: 15 * overlay.rows.offset + MARGIN };
}

/** A filter's label, with its type where the header names one: "GYRO LPF (PT1) cutoff". */
function filterLabel(name: string, type: number | null | undefined, suffix: string): string {
    return type == null ? `${name} ${suffix}` : `${name} (${FILTER_TYPE[type]}) ${suffix}`;
}

/** Whether the overdraw setting shows a filter group, for the field drawn. */
function showsFilters(plot: GraphSpectrumPlotModule, group: number, fieldKeyword: string): boolean {
    return (
        plot._overdrawType === SPECTRUM_OVERDRAW_TYPE.ALL_FILTERS ||
        plot._overdrawType === group ||
        (plot._overdrawType === SPECTRUM_OVERDRAW_TYPE.AUTO &&
            viewOf(plot).fieldName!.toLowerCase().includes(fieldKeyword))
    );
}

/** The first lowpass: dynamic when the header gives a rising range, otherwise static if set. */
function drawFirstLowpass(
    overlay: FilterOverlay,
    filter: {
        dynHz: (number | null)[];
        dynExpo: HeaderValue | null | undefined;
        hz: unknown;
        type: number | null | undefined;
    },
    name: string,
    stroke: string,
): void {
    const { plot, canvasCtx, maxFrequency, rows } = overlay;
    const { dynHz, dynExpo, hz, type } = filter;
    if (dynHz[0] != null && Number(dynHz[0]) > 0 && Number(dynHz[1]) > Number(dynHz[0])) {
        plot._drawLowpassDynFilter(
            canvasCtx,
            { frequency1: Number(dynHz[0]), frequency2: Number(dynHz[1]), expo: dynExpo },
            maxFrequency,
            filterLabel(name, type, "Dyn cutoff"),
            nextRow(overlay),
            { stroke },
        );
        rows.offset++;
    } else if (hz != null && Number(hz) > 0) {
        plot._drawLowpassFilter(
            canvasCtx,
            Number(hz),
            maxFrequency,
            filterLabel(name, type, "cutoff"),
            nextRow(overlay),
            {
                stroke,
            },
        );
        rows.offset++;
    }
}

/** A static lowpass, if set. */
function drawStaticLowpass(overlay: FilterOverlay, hz: unknown, label: string, stroke?: string): void {
    if (hz != null && Number(hz) > 0) {
        overlay.plot._drawLowpassFilter(
            overlay.canvasCtx,
            Number(hz),
            overlay.maxFrequency,
            label,
            nextRow(overlay),
            stroke === undefined ? undefined : { stroke },
        );
        overlay.rows.offset++;
    }
}

/** A notch, if both its centre and cutoff are set. */
function drawNotch(overlay: FilterOverlay, center: number, cutoff: number, label: string, stroke: string): void {
    if (center > 0 && cutoff > 0) {
        overlay.plot._drawNotchFilter(
            overlay.canvasCtx,
            center,
            cutoff,
            overlay.maxFrequency,
            label,
            nextRow(overlay),
            {
                stroke,
            },
        );
        overlay.rows.offset++;
    }
}

function drawGyroFilters(overlay: FilterOverlay): void {
    const { sys } = overlay;
    drawFirstLowpass(
        overlay,
        {
            dynHz: sys.gyro_lowpass_dyn_hz,
            dynExpo: sys.gyro_lowpass_dyn_expo,
            hz: sys.gyro_lowpass_hz,
            type: sys.gyro_soft_type,
        },
        "GYRO LPF",
        "rgba(94, 194, 98, 0.50)",
    );
    drawStaticLowpass(
        overlay,
        sys.gyro_lowpass2_hz,
        filterLabel("GYRO LPF2", sys.gyro_soft2_type, "cutoff"),
        "rgba(0, 172, 122, 0.50)",
    );

    const notchHz = sys.gyro_notch_hz,
        notchCutoff = sys.gyro_notch_cutoff;
    if (notchHz == null || notchCutoff == null) {
        return;
    }
    if (typeof notchHz !== "number" && notchHz.length > 0) {
        //there are multiple gyro notch filters
        for (let i = 0; i < notchHz.length; i++) {
            const center = Number(headerElement(notchHz, i)),
                cutoff = Number(headerElement(notchCutoff, i));
            drawNotch(overlay, center, cutoff, "GYRO Notch", "rgba(0, 148, 134, 0.50)");
        }
    } else {
        // only a single gyro notch to display
        drawNotch(overlay, Number(notchHz), Number(notchCutoff), "GYRO Notch", "rgba(0, 148, 134, 0.50)");
    }
}

function drawDtermFilters(overlay: FilterOverlay): void {
    const { sys } = overlay;
    drawFirstLowpass(
        overlay,
        {
            dynHz: sys.dterm_lpf_dyn_hz,
            dynExpo: sys.dterm_lpf_dyn_expo,
            hz: sys.dterm_lpf_hz,
            type: sys.dterm_filter_type,
        },
        "D-TERM LPF",
        "rgba(0, 123, 132, 0.50)",
    );
    drawStaticLowpass(
        overlay,
        sys.dterm_lpf2_hz,
        filterLabel("D-TERM LPF2", sys.dterm_filter2_type, "cutoff"),
        "rgba(16, 97, 116, 0.50)",
    );
    if (sys.dterm_notch_hz != null && sys.dterm_notch_cutoff != null) {
        drawNotch(
            overlay,
            Number(sys.dterm_notch_hz),
            Number(sys.dterm_notch_cutoff),
            "D-TERM Notch",
            "rgba(47, 72, 88, 0.50)",
        );
    }
}

GraphSpectrumPlot._drawFiltersAndMarkers = function (canvasCtx) {
    const fftData = viewOf(this);
    const overlay: FilterOverlay = {
        plot: this,
        canvasCtx,
        sys: sysConfigOf(this),
        maxFrequency: (0.5 * Number(fftData.blackBoxRate)) / this._zoomX,
        HEIGHT: contextOf(this).canvas.height - MARGIN,
        WIDTH: contextOf(this).canvas.width - this._getActualMarginLeft(),
        // make some space! Includes the space for the mouse frequency. In this way the other elements don't move in the screen when used
        rows: { offset: 2 },
    };

    if (showsFilters(this, SPECTRUM_OVERDRAW_TYPE.GYRO_FILTERS, "gyro")) {
        drawGyroFilters(overlay);
    }
    overlay.rows.offset++; // make some space!

    if (showsFilters(this, SPECTRUM_OVERDRAW_TYPE.YAW_FILTERS, "yaw")) {
        drawStaticLowpass(overlay, overlay.sys.yaw_lpf_hz, "YAW LPF cutoff");
    }

    try {
        if (showsFilters(this, SPECTRUM_OVERDRAW_TYPE.DTERM_FILTERS, "pid d")) {
            drawDtermFilters(overlay);
        }
        overlay.rows.offset++; // make some space!
    } catch {
        console.warn("Notch filter fieldName missing");
    }

    if (this._spectrumType === SPECTRUM_TYPE.FREQUENCY) {
        this._drawInterestFrequency(
            canvasCtx,
            dataOf<FrequencySpectrum>(this).maxNoiseFrequency,
            overlay.maxFrequency,
            "Max noise",
            nextRow(overlay),
            { stroke: "rgba(255,0,0,0.50)", lineWidth: 3 },
        );
    }

    this._drawRateWarning(canvasCtx);
};

GraphSpectrumPlot._drawNotCachedElements = function () {
    const canvasCtx = contextOf(this); // Not cached canvas

    canvasCtx.save();

    const HEIGHT = canvasCtx.canvas.height - MARGIN_BOTTOM;
    const WIDTH = canvasCtx.canvas.width - this._getActualMarginLeft();
    const LEFT = canvasCtx.canvas.offsetLeft + this._getActualMarginLeft();
    const TOP = canvasCtx.canvas.offsetTop;

    canvasCtx.translate(LEFT, TOP);

    const offset = 0;
    if (this._mousePosition.x > 0 || this._mousePosition.y > 0) {
        const stroke = "rgba(0,255,0,0.50)";
        this._drawMousePosition(
            canvasCtx,
            this._mousePosition.x,
            this._mousePosition.y,
            { WIDTH, HEIGHT, OFFSET: 15 * offset + MARGIN },
            { stroke, lineWidth: 3 },
        );
    }

    canvasCtx.restore();
};

GraphSpectrumPlot._drawAxisLabel = function (canvasCtx, axisLabel, X, Y, align, baseline) {
    canvasCtx.save();

    canvasCtx.font = `${
        this._isFullScreen ? this._drawingParams.fontSizeFrameLabelFullscreen : this._drawingParams.fontSizeFrameLabel
    }pt ${DEFAULT_FONT_FACE}`;
    canvasCtx.fillStyle = "rgba(255,255,255,0.9)";
    if (align) {
        canvasCtx.textAlign = align;
    } else {
        canvasCtx.textAlign = "center";
    }
    if (baseline) {
        canvasCtx.textBaseline = baseline;
    } else {
        canvasCtx.textBaseline = "alphabetic";
    }
    canvasCtx.shadowColor = "black";
    canvasCtx.strokeStyle = "black";
    canvasCtx.shadowBlur = 3;
    canvasCtx.strokeText(axisLabel, X, Y);
    canvasCtx.fillText(axisLabel, X, Y);

    canvasCtx.restore();
};

GraphSpectrumPlot._drawHorizontalGridLines = function (
    canvasCtx,
    maxValue,
    WIDTH,
    HEIGHT,
    MARGIN_UP_LABEL,
    unitsLabel,
) {
    const TICKS = 5;
    const ticksInterval = maxValue / TICKS;

    let currentTick = 0;
    for (let i = 0; i <= TICKS; i++) {
        canvasCtx.beginPath();
        canvasCtx.lineWidth = 1;
        canvasCtx.strokeStyle = "rgba(255,255,255,0.25)";

        canvasCtx.moveTo(i * (WIDTH / TICKS), 0);
        canvasCtx.lineTo(i * (WIDTH / TICKS), HEIGHT);

        canvasCtx.stroke();
        let textAlign: CanvasTextAlign2D;
        switch (i) {
            case 0:
                textAlign = "left";
                break;
            case TICKS:
                textAlign = "right";
                break;
            default:
                textAlign = "center";
        }
        this._drawAxisLabel(
            canvasCtx,
            `${currentTick.toFixed(0)}${unitsLabel}`,
            i * (WIDTH / TICKS),
            HEIGHT + MARGIN_UP_LABEL,
            textAlign,
        );
        currentTick += ticksInterval;
    }
};

GraphSpectrumPlot._drawVerticalGridLines = function (canvasCtx, WIDTH, HEIGHT, minValue, maxValue, label, ticks = 5) {
    for (let i = 0; i <= ticks; i++) {
        canvasCtx.beginPath();
        canvasCtx.lineWidth = 1;
        canvasCtx.strokeStyle = "rgba(255,255,255,0.25)";

        const verticalPosition = i * (HEIGHT / ticks);
        canvasCtx.moveTo(0, verticalPosition);
        canvasCtx.lineTo(WIDTH, verticalPosition);

        canvasCtx.stroke();
        const verticalAxisValue = ((maxValue - minValue) * ((ticks - i) / ticks) + minValue).toFixed(0);
        let textBaseline: CanvasTextBaseline2D;
        switch (i) {
            case 0:
                textBaseline = "top";
                break;
            case ticks:
                textBaseline = "bottom";
                break;
            default:
                textBaseline = "middle";
        }
        this._drawAxisLabel(canvasCtx, `${verticalAxisValue}${label}`, 0, verticalPosition, "center", textBaseline);
    }
};

GraphSpectrumPlot._drawVerticalMarkerLine = function (canvasCtx, value, axisMaximum, label, area, style) {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style ?? {};

    const x = (WIDTH * value) / axisMaximum;

    let realLineWidth = lineWidth || DEFAULT_MARK_LINE_WIDTH;
    if (realLineWidth > 5) {
        // is the linewidth specified as a frequency band
        realLineWidth = (WIDTH * (2 * realLineWidth)) / (axisMaximum / 2);
    }
    if (realLineWidth < 1) {
        realLineWidth = 1;
    }

    canvasCtx.beginPath();
    canvasCtx.lineWidth = realLineWidth || 1;
    canvasCtx.strokeStyle = stroke || "rgba(128,128,255,0.50)";

    canvasCtx.moveTo(x, OFFSET - 10);
    canvasCtx.lineTo(x, HEIGHT);

    canvasCtx.stroke();

    if (label != null) {
        this._drawAxisLabel(canvasCtx, label.trim(), x + 2, OFFSET + 1, "left");
    }

    return x;
};

GraphSpectrumPlot._drawHorizontalMarkerLine = function (
    canvasCtx,
    value,
    minAxisValue,
    maxAxisValue,
    label,
    area,
    style,
) {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style ?? {};

    const fftData = viewOf(this);
    const y = (HEIGHT * (maxAxisValue - value)) / (maxAxisValue - minAxisValue); // percentage of range where throttle lies

    let realLineWidth = lineWidth || DEFAULT_MARK_LINE_WIDTH;
    if (realLineWidth > 5) {
        // is the linewidth specified as a frequency band
        const maximalFrequency = (0.5 * Number(fftData.blackBoxRate)) / this._zoomX;
        realLineWidth = (WIDTH * (2 * realLineWidth)) / maximalFrequency;
    }
    if (realLineWidth < 1) {
        realLineWidth = 1;
    }

    canvasCtx.beginPath();
    canvasCtx.lineWidth = realLineWidth || 1;
    canvasCtx.strokeStyle = stroke || "rgba(128,128,255,0.50)";

    canvasCtx.moveTo(0, y);
    canvasCtx.lineTo(WIDTH - OFFSET + 10, y);

    canvasCtx.stroke();

    if (label != null) {
        this._drawAxisLabel(canvasCtx, label.trim(), WIDTH - OFFSET + 8, y - 2, "right");
    }

    return y;
};

GraphSpectrumPlot._drawGradientBackground = function (canvasCtx, WIDTH, HEIGHT) {
    const backgroundGradient = canvasCtx.createLinearGradient(0, 0, 0, HEIGHT + (this._isFullScreen ? MARGIN : 0));

    if (this._isFullScreen) {
        backgroundGradient.addColorStop(1, "rgba(0,0,0,1)");
        backgroundGradient.addColorStop(0, "rgba(0,0,0,0.9)");
    } else {
        backgroundGradient.addColorStop(1, "rgba(255,255,255,0.25)");
        backgroundGradient.addColorStop(0, "rgba(255,255,255,0)");
    }

    canvasCtx.fillStyle = backgroundGradient;
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT + (this._isFullScreen ? MARGIN : 0));
};

GraphSpectrumPlot._drawInterestFrequency = function (canvasCtx, frequency, maximalFrequency, label, area, style) {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style ?? {};

    let interestLabel;
    if (this._spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY && label !== "") {
        const psdValue = this.getPSDbyFreq(frequency);
        interestLabel = `${label}: (${frequency.toFixed(0)}Hz, ${psdValue.toFixed(0)}dBm/Hz)`;
    } else {
        interestLabel = `${label} ${frequency.toFixed(0)}Hz`;
    }
    return this._drawVerticalMarkerLine(
        canvasCtx,
        frequency,
        maximalFrequency,
        interestLabel,
        { WIDTH, HEIGHT, OFFSET },
        { stroke, lineWidth },
    );
};

GraphSpectrumPlot._drawLowpassFilter = function (canvasCtx, frequency, maximalFrequency, label, area, style) {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style ?? {};

    const lpfLabel = `${label} ${frequency.toFixed(0)}Hz`;
    return this._drawVerticalMarkerLine(
        canvasCtx,
        frequency,
        maximalFrequency,
        lpfLabel,
        { WIDTH, HEIGHT, OFFSET },
        { stroke, lineWidth },
    );
};

GraphSpectrumPlot._drawLowpassDynFilter = function (canvasCtx, filter, maximalFrequency, label, area, style) {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style ?? {};
    const { frequency1, frequency2, expo } = filter;

    // frequency1 line with label
    const dynFilterLabel = `${label} ${frequency1.toFixed(0)}-${frequency2.toFixed(0)}Hz`;
    const x1 = this._drawVerticalMarkerLine(
        canvasCtx,
        frequency1,
        maximalFrequency,
        dynFilterLabel,
        { WIDTH, HEIGHT, OFFSET },
        { stroke, lineWidth },
    );

    // frequency2 line
    const offsetByType =
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_RPM ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_RPM
            ? 0
            : OFFSET;
    const x2 = this._drawVerticalMarkerLine(
        canvasCtx,
        frequency2,
        maximalFrequency,
        null,
        { WIDTH, HEIGHT, OFFSET: offsetByType },
        { stroke, lineWidth },
    );

    // Join line between frequency1 and frequency2 lines
    canvasCtx.beginPath();
    canvasCtx.lineWidth = lineWidth || DEFAULT_MARK_LINE_WIDTH;
    canvasCtx.strokeStyle = stroke || "rgba(128,128,255,0.50)";

    if (
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_RPM ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_RPM
    ) {
        /*
         * It draws a real betaflight filters curve with expo
         */
        const scaleX = WIDTH / maximalFrequency;
        const NUMBER_OF_POINTS = this._isFullScreen ? 30 : 10;

        /** `@type` {Array<{x: number, y: number}>} */
        const points = [];
        for (let i = 0; i < NUMBER_OF_POINTS; i++) {
            const throttle = i / (NUMBER_OF_POINTS - 1);
            const y = HEIGHT - HEIGHT * throttle;

            const expof = Number(expo ?? 0) / 10;
            const curve = throttle * (1 - throttle) * expof + throttle;
            const frequency = (frequency2 - frequency1) * curve + frequency1;

            const x = scaleX * frequency;
            points.push({
                x,
                y,
            });
        }

        this._drawCurve(canvasCtx, points);
    } else {
        canvasCtx.moveTo(x1, OFFSET - 10);
        canvasCtx.lineTo(x2, OFFSET - 10);
    }

    canvasCtx.stroke();
};

GraphSpectrumPlot._drawNotchFilter = function (canvasCtx, center, cutoff, maximalFrequency, label, area, style) {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style ?? {};

    const cutoffX = (WIDTH * cutoff) / maximalFrequency;
    const centerX = (WIDTH * center) / maximalFrequency;

    canvasCtx.beginPath();
    canvasCtx.lineWidth = lineWidth || DEFAULT_MARK_LINE_WIDTH;
    canvasCtx.strokeStyle = stroke || "rgba(128,128,255,0.50)";

    if (
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_RPM ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_RPM
    ) {
        canvasCtx.moveTo(cutoffX, 0);
        canvasCtx.lineTo(centerX * 2 - cutoffX, HEIGHT);
        canvasCtx.lineTo(centerX * 2 - cutoffX, 0);
        canvasCtx.lineTo(cutoffX, HEIGHT);
        canvasCtx.lineTo(cutoffX, 0);
    } else {
        // center - offset
        canvasCtx.moveTo(centerX, OFFSET - 10);
        canvasCtx.lineTo(cutoffX, HEIGHT);

        // center + offset
        canvasCtx.moveTo(centerX, OFFSET - 10);
        canvasCtx.lineTo(centerX * 2 - cutoffX, HEIGHT);
    }

    canvasCtx.stroke();

    // center with label
    const labelNotch = `${label} center ${center.toFixed(0)}Hz, cutoff ${cutoff.toFixed(0)}Hz`;
    this._drawVerticalMarkerLine(
        canvasCtx,
        center,
        maximalFrequency,
        labelNotch,
        { WIDTH, HEIGHT, OFFSET },
        { stroke, lineWidth },
    );
};

/** The unit of the mouse marker's value on the y axis, or null for a type that has none. */
function mouseUnitLabel(spectrumType: number | null): string | null {
    switch (spectrumType) {
        case SPECTRUM_TYPE.FREQ_VS_THROTTLE:
        case SPECTRUM_TYPE.PSD_VS_THROTTLE:
            return "%";
        case SPECTRUM_TYPE.FREQ_VS_RPM:
        case SPECTRUM_TYPE.PSD_VS_RPM:
            return "Hz";
        case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
            return "dBm/Hz";
        default:
            return null;
    }
}

/** The mouse markers over a spectrum or heat map: the frequency, and the value or throttle/RPM there. */
function drawMouseOnSpectrum(
    plot: GraphSpectrumPlotModule,
    canvasCtx: CanvasRenderingContext2D,
    mouseX: number,
    mouseY: number,
    marginLeft: number,
    area: MarkerArea,
    style: MarkerStyle,
): void {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style;
    const fftData = viewOf(plot);
    // Calculate frequency at mouse
    const maximalFrequency = (0.5 * Number(fftData.blackBoxRate)) / plot._zoomX;

    const mouseFrequency = ((mouseX - marginLeft) / WIDTH) * maximalFrequency;
    if (mouseFrequency >= 0 && mouseFrequency <= maximalFrequency) {
        plot._drawInterestFrequency(
            canvasCtx,
            mouseFrequency,
            maximalFrequency,
            "",
            { WIDTH, HEIGHT, OFFSET },
            { stroke: "rgba(0,255,0,0.50)", lineWidth: 3 },
        );
    }

    // Y axis
    const unitLabel = mouseUnitLabel(plot._spectrumType);
    if (unitLabel !== null) {
        // Every type with a unit has a range: the heat maps compute one, and the PSD draw stores its axis.
        const vsRange = fftData.vsRange!;
        const val_min = vsRange.min;
        const val_max = vsRange.max;
        const vsArgValue = (1 - mouseY / HEIGHT) * (val_max - val_min) + val_min;

        if (plot._spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY && comparedPsdOf(plot).curvesCount() === 0) {
            // single PSD spectrum
            const currentPSD = plot.getPSDbyFreq(mouseFrequency);
            const psdLabel = Math.round(currentPSD).toString() + unitLabel;
            plot._drawHorizontalMarkerLine(
                canvasCtx,
                currentPSD,
                val_min,
                val_max,
                psdLabel,
                { WIDTH, HEIGHT, OFFSET },
                { stroke, lineWidth },
            );
        } else if (vsArgValue >= val_min && vsArgValue <= val_max) {
            const valueLabel = `${vsArgValue.toFixed(0)}${unitLabel}`;
            plot._drawHorizontalMarkerLine(
                canvasCtx,
                vsArgValue,
                val_min,
                val_max,
                valueLabel,
                { WIDTH, HEIGHT, OFFSET },
                { stroke, lineWidth },
            );
        }
        if (plot._spectrumType === SPECTRUM_TYPE.PSD_VS_THROTTLE || plot._spectrumType === SPECTRUM_TYPE.PSD_VS_RPM) {
            const label = `${Math.round(plot.getValueFromMatrixFFT(mouseFrequency, vsArgValue))}dBm/Hz`;
            plot._drawAxisLabel(canvasCtx, label, mouseX - 30, mouseY - 4, "left");
        }
    }
}

/** The mouse markers over the PID error plot: the setpoint, and the error there. */
function drawMouseOnPidError(
    plot: GraphSpectrumPlotModule,
    canvasCtx: CanvasRenderingContext2D,
    mouseX: number,
    mouseY: number,
    marginLeft: number,
    area: MarkerArea,
    style: MarkerStyle,
): void {
    const { WIDTH, HEIGHT, OFFSET } = area;
    const { stroke, lineWidth } = style;
    const dataLimits = plot._drawPidErrorVsSetpointGraphProcessData();

    // X axis. Calculate deg/sec at mouse
    const mouseDegreesSecond = ((mouseX - marginLeft) / WIDTH) * dataLimits.currentDrawMaxSetpoint;
    const interestLabel = `${mouseDegreesSecond.toFixed(0)}deg/sec`;
    plot._drawVerticalMarkerLine(
        canvasCtx,
        mouseDegreesSecond,
        dataLimits.currentDrawMaxSetpoint,
        interestLabel,
        { WIDTH, HEIGHT, OFFSET },
        { stroke, lineWidth },
    );

    // Y axis. Calculate PID Error at mouse

    const mousePidError = (1 - mouseY / HEIGHT) * dataLimits.currentDrawMaxPidError;
    if (mousePidError >= 0 && mousePidError <= dataLimits.currentDrawMaxPidError) {
        const pidErrorLabel = `${mousePidError.toFixed(1)}deg/sec`;
        plot._drawHorizontalMarkerLine(
            canvasCtx,
            mousePidError,
            0,
            dataLimits.currentDrawMaxPidError,
            pidErrorLabel,
            { WIDTH, HEIGHT, OFFSET },
            { stroke, lineWidth },
        );
    }
}

GraphSpectrumPlot._drawMousePosition = function (canvasCtx, mouseX, mouseY, area, style) {
    const { HEIGHT } = area;
    // X axis

    const marginLeft = this._getActualMarginLeft();

    // Hide mouse cursor in the left-down corner position
    const mouseCursorOffLimit = 5;
    if (mouseY > HEIGHT + mouseCursorOffLimit && mouseX < marginLeft - mouseCursorOffLimit) {
        return;
    }

    mouseX = Math.max(mouseX, marginLeft);
    mouseY = Math.min(mouseY, HEIGHT);

    if (
        this._spectrumType === SPECTRUM_TYPE.FREQUENCY ||
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.FREQ_VS_RPM ||
        this._spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_THROTTLE ||
        this._spectrumType === SPECTRUM_TYPE.PSD_VS_RPM
    ) {
        drawMouseOnSpectrum(this, canvasCtx, mouseX, mouseY, marginLeft, area, style);
    } else if (this._spectrumType === SPECTRUM_TYPE.PIDERROR_VS_SETPOINT) {
        drawMouseOnPidError(this, canvasCtx, mouseX, mouseY, marginLeft, area, style);
    }
};

GraphSpectrumPlot._getActualMarginLeft = function () {
    let actualMarginLeft;
    switch (this._spectrumType) {
        case SPECTRUM_TYPE.FREQ_VS_THROTTLE:
        case SPECTRUM_TYPE.FREQ_VS_RPM:
        case SPECTRUM_TYPE.PSD_VS_THROTTLE:
        case SPECTRUM_TYPE.PSD_VS_RPM:
        case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
            actualMarginLeft = this._isFullScreen ? MARGIN_LEFT_FULLSCREEN : MARGIN_LEFT;
            break;
        case SPECTRUM_TYPE.PIDERROR_VS_SETPOINT:
            actualMarginLeft = this._isFullScreen ? MARGIN_LEFT_FULLSCREEN : MARGIN_LEFT;
            actualMarginLeft *= 2;
            break;
        case SPECTRUM_TYPE.FREQUENCY:
        default:
            actualMarginLeft = 0;
    }

    return actualMarginLeft;
};

GraphSpectrumPlot._drawCurve = function (canvasCtx, points, tension) {
    canvasCtx.beginPath();
    canvasCtx.moveTo(points[0].x, points[0].y);

    const t = tension ?? 1;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i === points.length - 2 ? p2 : points[i + 2];

        const cp1x = p1.x + ((p2.x - p0.x) / 6) * t;
        const cp1y = p1.y + ((p2.y - p0.y) / 6) * t;

        const cp2x = p2.x - ((p3.x - p1.x) / 6) * t;
        const cp2y = p2.y - ((p3.y - p1.y) / 6) * t;

        canvasCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    canvasCtx.stroke();
};

GraphSpectrumPlot._invalidateCache = function () {
    this._cachedCanvas = null;
};

GraphSpectrumPlot._invalidateDataCache = function () {
    this._cachedDataCanvas = null;
};

GraphSpectrumPlot.setLogRateWarningInfo = function (logRateInfo) {
    this._logRateWarning = logRateInfo;
};

GraphSpectrumPlot._drawRateWarning = function (canvasCtx) {
    if (this._logRateWarning !== undefined) {
        canvasCtx.save();

        canvasCtx.font = `${
            this._isFullScreen
                ? this._drawingParams.fontSizeFrameLabelFullscreen
                : this._drawingParams.fontSizeFrameLabel
        }pt ${DEFAULT_FONT_FACE}`;
        canvasCtx.fillStyle = "orange";
        canvasCtx.textAlign = "center";
        canvasCtx.shadowColor = "black";
        canvasCtx.strokeStyle = "black";

        // A log without a looptime header has no configured rate to compare with.
        const { actualRate: measured, betaflightRate: configured } = this._logRateWarning;
        const actualRate = measured.toFixed(0),
            betaflightRate = configured === null ? "unknown" : configured.toFixed(0);
        const WarningText = `THE ACTUAL AND CONFIG LOG DATA RATE DIFFERENCE: ${actualRate} : ${betaflightRate}`;
        const X = canvasCtx.canvas.width / 2,
            Y = canvasCtx.canvas.height / 12;
        canvasCtx.strokeText(WarningText, X, Y);
        canvasCtx.fillText(WarningText, X, Y);

        canvasCtx.restore();
    }
};

GraphSpectrumPlot.importCurvesFromCSV = function (files) {
    switch (this._spectrumType) {
        case SPECTRUM_TYPE.FREQUENCY:
            spectraOf(this).importCurvesFromCSV(files);
            break;
        case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
            if (comparedPsdOf(this).curvesCount() === 0) {
                this.addCurrentSpectrumIntoImport(); // Add current main spectrum to import for the first imported file to have same behavior like first Ctrl+Mouse click selection.
            }
            comparedPsdOf(this).importCurvesFromCSV(files);
            break;
        default:
            console.warn(`Import not supported for spectrum type: ${this._spectrumType}`);
            break;
    }
};

GraphSpectrumPlot.removeImportedCurves = function () {
    switch (this._spectrumType) {
        case SPECTRUM_TYPE.FREQUENCY:
            spectraOf(this).removeAllCurves();
            break;
        case SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY:
            comparedPsdOf(this).removeAllCurves();
            break;
    }
};

GraphSpectrumPlot.isNewComparedCurve = function (name) {
    return comparedPsdOf(this).isNewCurve(name);
};

GraphSpectrumPlot.addCurrentSpectrumIntoImport = function () {
    const fftData = dataOf<PsdSpectrum>(this);
    if (this._spectrumType === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY && this.isNewComparedCurve(fftData.fieldName)) {
        const fftLength = fftData.fftLength;
        const frequencyStep = (0.5 * fftData.blackBoxRate) / fftLength;
        const points = [];
        for (let index = 0; index < fftLength; index++) {
            const frequency = frequencyStep * index;
            points.push({
                x: frequency,
                y: fftData.fftOutput[index],
            });
        }
        // isNewComparedCurve() above has matched the name of a loaded field.
        comparedPsdOf(this).addCurve(points, fftData.fieldName!);
    }
};

GraphSpectrumPlot.removeComparedCurve = function (name) {
    comparedPsdOf(this).removeCurve(name);
};

GraphSpectrumPlot.isMultiSpectrum = function () {
    return !comparedPsdOf(this).isEmpty();
};

GraphSpectrumPlot.isImportedCurvesMaxCount = function () {
    return comparedPsdOf(this).isFull();
};
