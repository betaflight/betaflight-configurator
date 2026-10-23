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

import { ComplexFFT } from "../js/blackbox/fft";
import type { ExpoCurve } from "./expo";
import type { FlightLog, LogFrame, Chunk } from "./flightlog";
import type { SysConfig } from "./flightlog_parser";
import { FlightLogFieldPresenter } from "./flightlog_fields_presenter";
import { useSettingsStore } from "./stores/settings";

const FIELD_THROTTLE_NAME = ["rcCommands[3]"],
    FIELD_RPM_NAMES = ["eRPM[0]", "eRPM[1]", "eRPM[2]", "eRPM[3]", "eRPM[4]", "eRPM[5]", "eRPM[6]", "eRPM[7]"],
    FREQ_VS_THR_CHUNK_TIME_MS = 300,
    FREQ_VS_THR_WINDOW_DIVISOR = 6,
    MAX_ANALYSER_LENGTH = 300 * 1000 * 1000, // 5min
    MAX_RPM_HZ_VALUE = 800,
    RPM_AXIS_TOP_MARGIN_PERCENT = 2,
    MIN_SPECTRUM_SAMPLES_COUNT = 2048;
export const NUM_VS_BINS = 100;

export interface ValueRange {
    min: number;
    max: number;
}

interface SpectrumSource {
    fieldIndex: number;
    fieldName: string | null;
}

/** The magnitude spectrum: one side of the FFT, `fftLength` bins up to half the log rate. */
export interface FrequencySpectrum extends SpectrumSource {
    fftLength: number;
    fftOutput: Float64Array;
    maxNoiseFrequency: number;
    blackBoxRate: number;
}

/** The Welch power spectral density, in dBm/Hz. */
export interface PsdSpectrum extends SpectrumSource {
    fftLength: number;
    fftOutput: Float64Array;
    blackBoxRate: number;
    minimum: number;
    maximum: number;
    maxNoiseFrequency: number;
    maximalSegmentsLength: number;
    /** Not computed here: the plot stores its dB axis range on the data it draws. */
    vsRange?: ValueRange;
}

/** A heat map: `NUM_VS_BINS` rows of throttle or RPM bins, each `fftLength` frequency bins. */
export interface VsSpectrum extends SpectrumSource {
    fftLength: number;
    fftOutput: Float64Array[];
    maxNoise: number;
    blackBoxRate: number;
    vsRange: ValueRange;
}

/** Mean absolute PID error per whole deg/s of setpoint; null where no sample had that setpoint. */
export interface PidErrorVsSetpoint extends SpectrumSource {
    axisName: string;
    fftOutput: (number | null)[];
    fftMaxOutput: number;
}

export type SpectrumData = FrequencySpectrum | PsdSpectrum | VsSpectrum | PidErrorVsSetpoint;

/** Set when the log's own rate and the measured one disagree; the analysis then runs at the measured rate. */
export interface LogRateInfo {
    actualRate: number;
    /** null when the header gives no rate (no looptime). */
    betaflightRate: number | null;
}

type PsdScaling = "density" | "spectrum";

interface FlightSamples {
    samples: Float64Array;
    count: number;
}

interface FlightSamplesVsX extends FlightSamples {
    vsValues: Float64Array[];
    minValue: number;
    maxValue: number;
}

interface PsdResult {
    psdOutput: Float64Array;
    min: number;
    max: number;
    maxNoiseFrequency: number;
}

interface GraphSpectrumCalcModule {
    /** null or 0 means the log's own start or end. */
    _analyserTimeRange: { in: number | null; out: number | null };
    /** The rate the analysis runs at: the log's own, or the measured one when they disagree. */
    _blackBoxRate: number;
    /** The rate the log header gives. */
    _BetaflightRate: number | null;
    _actualeRate: number;
    /** `curve` is set together with the field, before any load. */
    _dataBuffer: { fieldIndex: number; curve: ExpoCurve | null; fieldName: string | null };
    _flightLog: FlightLog | null;
    _sysConfig: SysConfig | null;
    /** Raw from the header: the RPM arithmetic reads it through Number(), so a missing value stays NaN. */
    _motorPoles: number | null | undefined;
    _pointsPerSegmentPSD: number;

    initialize(flightLog: FlightLog, sysConfig: SysConfig): LogRateInfo | undefined;
    setInTime(time: number | null): number | null;
    setOutTime(time: number | null): number | null;
    setDataBuffer(fieldIndex: number, curve: ExpoCurve, fieldName: string): undefined;
    getNearPower2Value(size: number): number;
    dataLoadFrequency(): FrequencySpectrum;
    setPointsPerSegmentPSD(pointsCount: number): void;
    dataLoadPSD(_analyserZoomY?: number): PsdSpectrum;
    _dataLoadFrequencyVsX(vsFieldNames: string[], minValue?: number, maxValue?: number): VsSpectrum;
    _dataLoadPowerSpectralDensityVsX(vsFieldNames: string[], minValue?: number, maxValue?: number): VsSpectrum;
    dataLoadFrequencyVsThrottle(): VsSpectrum;
    dataLoadPowerSpectralDensityVsThrottle(): VsSpectrum;
    dataLoadFrequencyVsRpm(): VsSpectrum;
    dataLoadPowerSpectralDensityVsRpm(): VsSpectrum;
    dataLoadPidErrorVsSetpoint(): PidErrorVsSetpoint;
    _getFlightChunks(): Chunk[];
    _getFlightSamplesFreq(scaled?: boolean): FlightSamples;
    _getVsIndexes(vsFieldNames: string[]): number[];
    _getFlightSamplesFreqVsX(
        vsFieldNames: string[],
        minValue?: number,
        maxValue?: number,
        scaled?: boolean,
    ): FlightSamplesVsX;
    _getFlightSamplesPidErrorVsSetpoint(axisIndex: number | undefined): {
        piderror: Int16Array;
        setpoint: Int16Array;
        maxSetpoint: number;
        count: number;
    };
    _hanningWindow(samples: Float64Array | number[], size?: number): void;
    _fft(samples: Float64Array, type?: string): Float64Array;
    _normalizeFft(fftOutput: Float64Array): FrequencySpectrum;
    _psd(samples: Float64Array, pointsPerSegment: number, overlapCount: number, scaling?: PsdScaling): PsdResult;
    _fft_segmented(samples: Float64Array, pointsPerSegment: number, overlapCount: number): Float64Array[];
}

/**
 * A frame's value as the typed sample arrays store it: null (no slow frame yet) becomes 0 and a
 * field the log lacks NaN, the coercion a Float64Array or Int16Array store applies anyway.
 */
function sampleValue(frame: LogFrame, index: number | undefined): number {
    return Number(index === undefined ? undefined : frame[index]);
}

/** The calculation behind the spectrum analyser; one log at a time, set by initialize(). */
export const GraphSpectrumCalc = {
    _analyserTimeRange: {
        in: 0,
        out: MAX_ANALYSER_LENGTH,
    },
    _blackBoxRate: 0,
    _dataBuffer: {
        fieldIndex: 0,
        curve: null,
        fieldName: null,
    },
    _flightLog: null,
    _sysConfig: null,
    _motorPoles: null,
    _pointsPerSegmentPSD: 64,
} as GraphSpectrumCalcModule;

/** The log the analyser was initialised with; the loaders are only reached after initialize(). */
function flightLogOf(calc: GraphSpectrumCalcModule): FlightLog {
    return calc._flightLog!;
}

/** The field curve; setDataBuffer() runs before any scaled load. */
function curveOf(calc: GraphSpectrumCalcModule): ExpoCurve {
    return calc._dataBuffer.curve!;
}

GraphSpectrumCalc.initialize = function (flightLog, sysConfig) {
    this._flightLog = flightLog;
    this._sysConfig = sysConfig;

    this._motorPoles = sysConfig["motor_poles"];
    this._BetaflightRate = flightLog.getBlackboxRate();

    this._actualeRate = flightLog.getActualLogRate();
    // isWrongLogRate() is true whenever the header gives no rate, so the analysis rate is never null.
    this._blackBoxRate = flightLog.isWrongLogRate() ? Math.round(this._actualeRate) : Number(this._BetaflightRate);

    if (this._BetaflightRate !== this._blackBoxRate) {
        return {
            actualRate: this._actualeRate,
            betaflightRate: this._BetaflightRate,
        };
    }

    return undefined;
};

GraphSpectrumCalc.setInTime = function (time) {
    this._analyserTimeRange.in = time;
    return this._analyserTimeRange.in;
};

GraphSpectrumCalc.setOutTime = function (time) {
    // A cleared (null) mark counts as 0 in the length check, as it always has.
    if (Number(time) - Number(this._analyserTimeRange.in) <= MAX_ANALYSER_LENGTH) {
        this._analyserTimeRange.out = time;
    } else {
        this._analyserTimeRange.out = Number(this._analyserTimeRange.in) + MAX_ANALYSER_LENGTH;
    }
    return this._analyserTimeRange.out;
};

GraphSpectrumCalc.setDataBuffer = function (fieldIndex, curve, fieldName) {
    this._dataBuffer.curve = curve;
    this._dataBuffer.fieldName = fieldName;
    this._dataBuffer.fieldIndex = fieldIndex;
    return undefined;
};

GraphSpectrumCalc.getNearPower2Value = function (size) {
    return 2 ** Math.ceil(Math.log2(size));
};

GraphSpectrumCalc.dataLoadFrequency = function () {
    const { userSettings } = useSettingsStore();
    const flightSamples = this._getFlightSamplesFreq();

    if (userSettings.analyserHanning) {
        this._hanningWindow(flightSamples.samples, flightSamples.count); // Apply Hann function to actual flightSamples.count values only
    }

    //calculate fft for the all samples
    const fftOutput = this._fft(flightSamples.samples);

    // Normalize the result
    const fftData = this._normalizeFft(fftOutput);

    return fftData;
};

GraphSpectrumCalc.setPointsPerSegmentPSD = function (pointsCount) {
    this._pointsPerSegmentPSD = pointsCount;
};

GraphSpectrumCalc.dataLoadPSD = function (_analyserZoomY) {
    const flightSamples = this._getFlightSamplesFreq(false);
    const totalCount = flightSamples.count; // actual samples, not padded length
    // Guard an empty selected range: getNearPower2Value(0) is 0 and ComplexFFT(0) throws,
    // so short-circuit before the FFT with a valid empty result the caller can render.
    if (totalCount === 0) {
        return {
            fieldIndex: this._dataBuffer.fieldIndex,
            fieldName: this._dataBuffer.fieldName,
            fftLength: 0,
            fftOutput: new Float64Array(0),
            blackBoxRate: this._blackBoxRate,
            minimum: 0,
            maximum: 0,
            maxNoiseFrequency: 0,
            maximalSegmentsLength: 0,
        };
    }
    const pointsPerSegment = Math.min(this._pointsPerSegmentPSD, totalCount);
    // Non-overlapping when single full-segment; otherwise 75% overlap
    const overlapCount = pointsPerSegment === totalCount ? 0 : Math.floor((pointsPerSegment * 3) / 4);
    // Avoid bias from zero-padded tail
    const samplesForPsd =
        flightSamples.samples.length === totalCount
            ? flightSamples.samples
            : flightSamples.samples.slice(0, totalCount);
    const psd = this._psd(samplesForPsd, pointsPerSegment, overlapCount);

    const psdData = {
        fieldIndex: this._dataBuffer.fieldIndex,
        fieldName: this._dataBuffer.fieldName,
        fftLength: psd.psdOutput.length,
        fftOutput: psd.psdOutput,
        blackBoxRate: this._blackBoxRate,
        minimum: psd.min,
        maximum: psd.max,
        maxNoiseFrequency: psd.maxNoiseFrequency,
        maximalSegmentsLength: this.getNearPower2Value(totalCount),
    };
    return psdData;
};

GraphSpectrumCalc._dataLoadFrequencyVsX = function (vsFieldNames, minValue = Infinity, maxValue = -Infinity) {
    const { userSettings } = useSettingsStore();
    const flightSamples = this._getFlightSamplesFreqVsX(vsFieldNames, minValue, maxValue);
    // We divide it into FREQ_VS_THR_CHUNK_TIME_MS FFT chunks, we calculate the average throttle
    // for each chunk. We use a moving window to get more chunks available.
    const fftChunkLength = Math.round((this._blackBoxRate * FREQ_VS_THR_CHUNK_TIME_MS) / 1000);
    const fftChunkWindow = Math.round(fftChunkLength / FREQ_VS_THR_WINDOW_DIVISOR);
    const fftBufferSize = this.getNearPower2Value(fftChunkLength);
    const magnitudeLength = Math.floor(fftBufferSize / 2);
    let maxNoise = 0; // Stores the maximum amplitude of the fft over all chunks
    // Matrix where each row represents a bin of vs values, and the columns are amplitudes at frequencies
    const matrixFftOutput = new Array(NUM_VS_BINS).fill(null).map(() => new Float64Array(fftBufferSize * 2));
    const numberSamples = new Uint32Array(NUM_VS_BINS); // Number of samples in each vs value, used to average them later.
    const fft = new ComplexFFT(fftBufferSize, false);
    const fftInput = new Float64Array(fftBufferSize);
    const fftOutput = new Float64Array(fftBufferSize * 2);

    for (
        let fftChunkIndex = 0;
        fftChunkIndex + fftChunkLength < flightSamples.samples.length;
        fftChunkIndex += fftChunkWindow
    ) {
        const samples = flightSamples.samples.slice(fftChunkIndex, fftChunkIndex + fftChunkLength);
        fftInput.set(samples);

        // Hanning window applied to input data, without padding zeros
        if (userSettings.analyserHanning) {
            this._hanningWindow(fftInput, fftChunkLength);
        }

        fft.simple(fftOutput, fftInput, "real");

        //  Compute magnitude
        //  The fftOutput contains two side spectrum, we use the first part only to get one side
        const magnitudes = new Float64Array(magnitudeLength);
        for (let i = 0; i < magnitudeLength; i++) {
            const re = fftOutput[2 * i],
                im = fftOutput[2 * i + 1];
            magnitudes[i] = Math.hypot(re, im);
            maxNoise = Math.max(magnitudes[i], maxNoise);
        }

        // calculate a bin index and put the fft value in that bin for each field (e.g. eRPM[0], eRPM[1]..) sepparately
        for (const vsValueArray of flightSamples.vsValues) {
            // Calculate average of the VS values in the chunk
            let sumVsValues = 0;
            for (let indexVs = fftChunkIndex; indexVs < fftChunkIndex + fftChunkLength; indexVs++) {
                sumVsValues += vsValueArray[indexVs];
            }
            // Translate the average vs value to a bin index
            const avgVsValue = sumVsValues / fftChunkLength;
            // Clamp to a valid bin: a degenerate or out-of-range average must never index
            // outside the matrix (would dereference an undefined row — issue #922).
            const vsBinIndex = Math.max(
                0,
                Math.min(
                    NUM_VS_BINS - 1,
                    Math.round(
                        ((NUM_VS_BINS - 1) * (avgVsValue - flightSamples.minValue)) /
                            (flightSamples.maxValue - flightSamples.minValue),
                    ),
                ),
            );
            numberSamples[vsBinIndex]++;

            // add the output from the fft to the row given by the vs value bin index
            for (let i = 0; i < magnitudeLength; i++) {
                matrixFftOutput[vsBinIndex][i] += magnitudes[i];
            }
        }
    }

    // Divide the values from the fft in each row (vs value bin) by the number of samples in the bin
    for (let i = 0; i < NUM_VS_BINS; i++) {
        if (numberSamples[i] > 1) {
            for (let j = 0; j < matrixFftOutput[i].length; j++) {
                matrixFftOutput[i][j] /= numberSamples[i];
            }
        }
    }

    // The output data needs to be smoothed, the sampling is not perfect
    // but after some tests we let the data as is, an we prefer to apply a
    // blur algorithm to the heat map image

    const fftData = {
        fieldIndex: this._dataBuffer.fieldIndex,
        fieldName: this._dataBuffer.fieldName,
        fftLength: magnitudeLength,
        fftOutput: matrixFftOutput,
        maxNoise: maxNoise,
        blackBoxRate: this._blackBoxRate,
        vsRange: { min: flightSamples.minValue, max: flightSamples.maxValue },
    };

    return fftData;
};

GraphSpectrumCalc._dataLoadPowerSpectralDensityVsX = function (
    vsFieldNames,
    minValue = Infinity,
    maxValue = -Infinity,
) {
    const flightSamples = this._getFlightSamplesFreqVsX(vsFieldNames, minValue, maxValue, false);

    // We divide it into FREQ_VS_THR_CHUNK_TIME_MS FFT chunks, we calculate the average throttle
    // for each chunk. We use a moving window to get more chunks available.
    const fftChunkLength = Math.round((this._blackBoxRate * FREQ_VS_THR_CHUNK_TIME_MS) / 1000);
    const fftChunkWindow = Math.round(fftChunkLength / FREQ_VS_THR_WINDOW_DIVISOR);

    let maxNoise = 0; // Stores the maximum amplitude of the fft over all chunks
    let psdLength = 0;
    // Matrix where each row represents a bin of vs values, and the columns are amplitudes at frequencies
    const BACKGROUND_PSD_VALUE = -200;
    let matrixPsdOutput;

    const numberSamples = new Uint32Array(NUM_VS_BINS); // Number of samples in each vs value, used to average them later.

    for (
        let fftChunkIndex = 0;
        fftChunkIndex + fftChunkLength < flightSamples.samples.length;
        fftChunkIndex += fftChunkWindow
    ) {
        const fftInput = flightSamples.samples.slice(fftChunkIndex, fftChunkIndex + fftChunkLength);
        const psd = this._psd(fftInput, fftChunkLength, 0, "density"); // Using the one segment with all chunks fftChunkLength size, it will extended at power at 2 size inside _psd() - _fft_segmented()
        maxNoise = Math.max(psd.max, maxNoise);
        // The _psd() can extend fft data size. Set psdLength and create matrix by first using
        if (matrixPsdOutput === undefined) {
            psdLength = psd.psdOutput.length;
            matrixPsdOutput = new Array(NUM_VS_BINS)
                .fill(null)
                .map(() => new Float64Array(psdLength).fill(BACKGROUND_PSD_VALUE));
        }
        // calculate a bin index and put the fft value in that bin for each field (e.g. eRPM[0], eRPM[1]..) sepparately
        for (const vsValueArray of flightSamples.vsValues) {
            // Calculate average of the VS values in the chunk
            let sumVsValues = 0;
            for (let indexVs = fftChunkIndex; indexVs < fftChunkIndex + fftChunkLength; indexVs++) {
                sumVsValues += vsValueArray[indexVs];
            }
            // Translate the average vs value to a bin index
            const avgVsValue = sumVsValues / fftChunkLength;
            // Clamp to a valid bin: a degenerate or out-of-range average must never index
            // outside the matrix (would dereference an undefined row — issue #922).
            const vsBinIndex = Math.max(
                0,
                Math.min(
                    NUM_VS_BINS - 1,
                    Math.round(
                        ((NUM_VS_BINS - 1) * (avgVsValue - flightSamples.minValue)) /
                            (flightSamples.maxValue - flightSamples.minValue),
                    ),
                ),
            );
            numberSamples[vsBinIndex]++;

            // add the output from the fft to the row given by the vs value bin index
            for (let i = 0; i < psdLength; i++) {
                matrixPsdOutput[vsBinIndex][i] += psd.psdOutput[i];
            }
        }
    }

    // Empty selected range: no chunks were processed, so the lazily-created matrix is
    // still undefined. Return an empty matrix so fftOutput is never undefined.
    if (matrixPsdOutput === undefined) {
        matrixPsdOutput = new Array(NUM_VS_BINS).fill(null).map(() => new Float64Array(0));
    }

    // Divide the values from the fft in each row (vs value bin) by the number of samples in the bin
    for (let i = 0; i < NUM_VS_BINS; i++) {
        if (numberSamples[i] > 1) {
            for (let j = 0; j < psdLength; j++) {
                matrixPsdOutput[i][j] /= numberSamples[i];
            }
        }
    }

    // The output data needs to be smoothed, the sampling is not perfect
    // but after some tests we let the data as is, an we prefer to apply a
    // blur algorithm to the heat map image

    const psdData = {
        fieldIndex: this._dataBuffer.fieldIndex,
        fieldName: this._dataBuffer.fieldName,
        fftLength: psdLength,
        fftOutput: matrixPsdOutput,
        maxNoise: maxNoise,
        blackBoxRate: this._blackBoxRate,
        vsRange: { min: flightSamples.minValue, max: flightSamples.maxValue },
    };

    return psdData;
};

GraphSpectrumCalc.dataLoadFrequencyVsThrottle = function () {
    return this._dataLoadFrequencyVsX(FIELD_THROTTLE_NAME, 0, 100);
};

GraphSpectrumCalc.dataLoadPowerSpectralDensityVsThrottle = function () {
    return this._dataLoadPowerSpectralDensityVsX(FIELD_THROTTLE_NAME, 0, 100);
};

GraphSpectrumCalc.dataLoadFrequencyVsRpm = function () {
    const fftData = this._dataLoadFrequencyVsX(FIELD_RPM_NAMES, 0);
    fftData.vsRange.max *= 3.333 / Number(this._motorPoles);
    fftData.vsRange.min *= 3.333 / Number(this._motorPoles);
    return fftData;
};

GraphSpectrumCalc.dataLoadPowerSpectralDensityVsRpm = function () {
    const fftData = this._dataLoadPowerSpectralDensityVsX(FIELD_RPM_NAMES, 0);
    fftData.vsRange.max *= 3.333 / Number(this._motorPoles);
    fftData.vsRange.min *= 3.333 / Number(this._motorPoles);
    return fftData;
};

GraphSpectrumCalc.dataLoadPidErrorVsSetpoint = function () {
    // Detect the axis
    // Only offered for a selected field, so the name is set.
    const fieldName = this._dataBuffer.fieldName!;
    let axisIndex;
    if (fieldName.includes("[roll]")) {
        axisIndex = 0;
    } else if (fieldName.includes("[pitch]")) {
        axisIndex = 1;
    } else if (fieldName.includes("[yaw]")) {
        axisIndex = 2;
    }

    const flightSamples = this._getFlightSamplesPidErrorVsSetpoint(axisIndex);

    // Add the total error by absolute position
    const errorBySetpoint = Array.from<number | null>({ length: flightSamples.maxSetpoint + 1 });
    const numberOfSamplesBySetpoint = Array.from<number>({
        length: flightSamples.maxSetpoint + 1,
    });

    // Initialize
    for (let i = 0; i <= flightSamples.maxSetpoint; i++) {
        errorBySetpoint[i] = 0;
        numberOfSamplesBySetpoint[i] = 0;
    }

    // Sum by position
    for (let i = 0; i < flightSamples.count; i++) {
        const pidErrorValue = Math.abs(flightSamples.piderror[i]);
        const setpointValue = Math.abs(flightSamples.setpoint[i]);

        errorBySetpoint[setpointValue]! += pidErrorValue;
        numberOfSamplesBySetpoint[setpointValue]++;
    }

    // Calculate the media and max values
    let maxErrorBySetpoint = 0;
    for (let i = 0; i <= flightSamples.maxSetpoint; i++) {
        if (numberOfSamplesBySetpoint[i] > 0) {
            const meanError = errorBySetpoint[i]! / numberOfSamplesBySetpoint[i];
            errorBySetpoint[i] = meanError;
            if (meanError > maxErrorBySetpoint) {
                maxErrorBySetpoint = meanError;
            }
        } else {
            errorBySetpoint[i] = null;
        }
    }

    return {
        fieldIndex: this._dataBuffer.fieldIndex,
        fieldName: this._dataBuffer.fieldName,
        axisName: FlightLogFieldPresenter.fieldNameToFriendly(`axisError[${axisIndex}]`),
        fftOutput: errorBySetpoint,
        fftMaxOutput: maxErrorBySetpoint,
    };
};

GraphSpectrumCalc._getFlightChunks = function () {
    const flightLog = flightLogOf(this);
    const logStart = this._analyserTimeRange.in || flightLog.getMinTime();

    let logEnd = this._analyserTimeRange.out || flightLog.getMaxTime();

    // Limit size
    logEnd = logEnd - logStart <= MAX_ANALYSER_LENGTH ? logEnd : logStart + MAX_ANALYSER_LENGTH;

    const allChunks = flightLog.getChunksInTimeRange(logStart, logEnd);

    return allChunks;
};

GraphSpectrumCalc._getFlightSamplesFreq = function (scaled = true) {
    const allChunks = this._getFlightChunks();

    // Size the sample buffer from the real number of logged frames in the selected
    // chunks, not from a _blackBoxRate estimate. The estimate can undershoot the actual
    // frame count for long logs and silently truncate the FFT input (see issue #922).
    let frameCount = 0;
    for (const chunk of allChunks) {
        frameCount += chunk.frames.length;
    }

    // The FFT input size is power 2 to get maximal performance
    // Limit fft input count for simple spectrum chart to get normal charts plot quality
    let fftBufferSize;
    if (scaled && frameCount < MIN_SPECTRUM_SAMPLES_COUNT) {
        fftBufferSize = MIN_SPECTRUM_SAMPLES_COUNT;
    } else {
        fftBufferSize = this.getNearPower2Value(frameCount);
    }

    // Allocate at least fftBufferSize: slice() clamps without zero-padding, so the buffer
    // must cover the (possibly larger, power-of-2) FFT window for short logs.
    const samples = new Float64Array(Math.max(frameCount, fftBufferSize));

    // Loop through all the samples in the chunks and assign them to a sample array ready to pass to the FFT.
    let samplesCount = 0;
    for (const chunk of allChunks) {
        for (const frame of chunk.frames) {
            if (scaled) {
                samples[samplesCount] = curveOf(this).lookupRaw(sampleValue(frame, this._dataBuffer.fieldIndex));
            } else {
                samples[samplesCount] = sampleValue(frame, this._dataBuffer.fieldIndex);
            }
            samplesCount++;
        }
    }

    return {
        samples: samples.slice(0, fftBufferSize),
        count: samplesCount,
    };
};

GraphSpectrumCalc._getVsIndexes = function (vsFieldNames) {
    const fieldIndexes: number[] = [];
    const logFieldIndexes = flightLogOf(this).getMainFieldIndexes();
    for (const fieldName of vsFieldNames) {
        if (Object.hasOwn(logFieldIndexes, fieldName)) {
            fieldIndexes.push(logFieldIndexes[fieldName]);
        }
    }
    return fieldIndexes;
};

GraphSpectrumCalc._getFlightSamplesFreqVsX = function (
    vsFieldNames,
    minValue = Infinity,
    maxValue = -Infinity,
    scaled = true,
) {
    const allChunks = this._getFlightChunks();
    const vsIndexes = this._getVsIndexes(vsFieldNames);

    // Size the buffers from the real number of logged frames in the selected chunks.
    // A _blackBoxRate estimate can undershoot the actual frame count for long logs,
    // overflowing the buffers; the out-of-range reads then poisoned minValue/maxValue
    // with NaN and crashed the binning in _dataLoadFrequencyVsX (issue #922).
    let frameCount = 0;
    for (const chunk of allChunks) {
        frameCount += chunk.frames.length;
    }

    const samples = new Float64Array(frameCount);
    const vsValues = new Array(vsIndexes.length).fill(null).map(() => new Float64Array(frameCount));

    let samplesCount = 0;
    for (const chunk of allChunks) {
        for (let frameIndex = 0; frameIndex < chunk.frames.length; frameIndex++) {
            if (scaled) {
                samples[samplesCount] = curveOf(this).lookupRaw(
                    sampleValue(chunk.frames[frameIndex], this._dataBuffer.fieldIndex),
                );
            } else {
                samples[samplesCount] = sampleValue(chunk.frames[frameIndex], this._dataBuffer.fieldIndex);
            }
            for (let i = 0; i < vsIndexes.length; i++) {
                const vsFieldIx = vsIndexes[i];
                let value = sampleValue(chunk.frames[frameIndex], vsFieldIx);
                if (vsFieldNames === FIELD_RPM_NAMES) {
                    const maxRPM = (MAX_RPM_HZ_VALUE * Number(this._motorPoles)) / 3.333;
                    if (value > maxRPM) {
                        value = maxRPM;
                    } else if (value < 0) {
                        value = 0;
                    }
                }
                vsValues[i][samplesCount] = value;
            }
            samplesCount++;
        }
    }

    // Calculate min max average of the VS values in the chunk what will used by spectrum data definition
    const fftChunkLength = Math.round((this._blackBoxRate * FREQ_VS_THR_CHUNK_TIME_MS) / 1000);
    const fftChunkWindow = Math.round(fftChunkLength / FREQ_VS_THR_WINDOW_DIVISOR);
    for (let fftChunkIndex = 0; fftChunkIndex + fftChunkLength < samplesCount; fftChunkIndex += fftChunkWindow) {
        for (const vsValueArray of vsValues) {
            // Calculate average of the VS values in the chunk
            let sumVsValues = 0;
            for (let indexVs = fftChunkIndex; indexVs < fftChunkIndex + fftChunkLength; indexVs++) {
                sumVsValues += vsValueArray[indexVs];
            }
            // Find min max average of the VS values in the chunk
            const avgVsValue = sumVsValues / fftChunkLength;
            maxValue = Math.max(maxValue, avgVsValue);
            minValue = Math.min(minValue, avgVsValue);
        }
    }

    // Use small top margin for RPM axis only. Because it has bad axis view for throttle
    if (vsFieldNames === FIELD_RPM_NAMES) {
        maxValue += ((maxValue - minValue) * RPM_AXIS_TOP_MARGIN_PERCENT) / 100;
    }

    // Reject any non-usable range: non-finite bounds (empty/too-short window leaves the
    // Infinity/-Infinity defaults, or a buffer overflow would leave NaN) and the
    // degenerate equal-bounds case (constant VS value → maxValue - minValue === 0 →
    // divide-by-zero in the bin index). Fall back to a safe 0..100 range.
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue >= maxValue) {
        if (minValue === Infinity) {
            // this should never happen
            console.warn("Invalid minimum value");
        } else {
            console.warn("Invalid value range for spectrum binning (min %s, max %s)", minValue, maxValue);
        }
        minValue = 0;
        maxValue = 100;
    }

    const slicedVsValues = [];
    for (const vsValueArray of vsValues) {
        slicedVsValues.push(vsValueArray.slice(0, samplesCount));
    }

    return {
        samples: samples.slice(0, samplesCount),
        vsValues: slicedVsValues,
        count: samplesCount,
        minValue: minValue,
        maxValue: maxValue,
    };
};

GraphSpectrumCalc._getFlightSamplesPidErrorVsSetpoint = function (axisIndex) {
    const allChunks = this._getFlightChunks();

    // Size the buffers from the real number of logged frames; a _blackBoxRate
    // estimate can undershoot the actual frame count for long logs, overflowing
    // the buffers and truncating the data (same approach as _getFlightSamplesFreqVsX).
    let frameCount = 0;
    for (const chunk of allChunks) {
        frameCount += chunk.frames.length;
    }

    // Get the PID Error field
    const flightLog = flightLogOf(this);
    const FIELD_PIDERROR_INDEX = flightLog.getMainFieldIndexByName(`axisError[${axisIndex}]`);
    const FIELD_SETPOINT_INDEX = flightLog.getMainFieldIndexByName(`setpoint[${axisIndex}]`);

    const piderror = new Int16Array(frameCount);
    const setpoint = new Int16Array(frameCount);

    // Loop through all the samples in the chunks and assign them to a sample array.
    let samplesCount = 0;
    let maxSetpoint = 0;
    for (const chunk of allChunks) {
        for (const frame of chunk.frames) {
            piderror[samplesCount] = sampleValue(frame, FIELD_PIDERROR_INDEX);
            setpoint[samplesCount] = sampleValue(frame, FIELD_SETPOINT_INDEX);
            if (setpoint[samplesCount] > maxSetpoint) {
                maxSetpoint = setpoint[samplesCount];
            }
            samplesCount++;
        }
    }

    return {
        piderror: piderror.slice(0, samplesCount),
        setpoint: setpoint.slice(0, samplesCount),
        maxSetpoint,
        count: samplesCount,
    };
};

GraphSpectrumCalc._hanningWindow = function (samples, size) {
    if (!size) {
        size = samples.length;
    }

    for (let i = 0; i < size; i++) {
        samples[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
};

GraphSpectrumCalc._fft = function (samples, type) {
    if (!type) {
        type = "real";
    }

    const fftLength = samples.length;
    const fftOutput = new Float64Array(fftLength * 2);
    const fft = new ComplexFFT(fftLength, false);

    fft.simple(fftOutput, samples, type);

    return fftOutput;
};

/**
 * Makes all the values absolute and returns the index of maxFrequency found
 */
GraphSpectrumCalc._normalizeFft = function (fftOutput) {
    // The fft output contains two side spectrum, we use the first part only to get one side
    const fftLength = fftOutput.length / 2;

    // The fft output contains complex values (re, im pairs) of two-side spectrum
    // Compute magnitudes for one spectrum side
    const magnitudeLength = Math.floor(fftLength / 2);
    const maxFrequency = this._blackBoxRate / 2;
    const noiseLowEndIdx = (100 / maxFrequency) * magnitudeLength;
    const magnitudes = new Float64Array(magnitudeLength);
    let maxNoiseIdx = 0;
    let maxNoise = 0;

    for (let i = 0; i < magnitudeLength; i++) {
        const re = fftOutput[2 * i],
            im = fftOutput[2 * i + 1];
        magnitudes[i] = Math.hypot(re, im);
        if (i > noiseLowEndIdx && magnitudes[i] > maxNoise) {
            maxNoise = magnitudes[i];
            maxNoiseIdx = i;
        }
    }

    const maxNoiseFrequency = (maxNoiseIdx / magnitudeLength) * maxFrequency;

    const fftData = {
        fieldIndex: this._dataBuffer.fieldIndex,
        fieldName: this._dataBuffer.fieldName,
        fftLength: magnitudeLength,
        fftOutput: magnitudes,
        maxNoiseFrequency: maxNoiseFrequency,
        blackBoxRate: this._blackBoxRate,
    };

    return fftData;
};

/**
 * Compute PSD for data samples by Welch method follow Python code
 * It is good to use power at 2 values for pointsPerSegment.
 * For short data length, set pointsPerSegment same samples.length to extend samples count for power at 2 value inside _fft_segmented
 */
GraphSpectrumCalc._psd = function (samples, pointsPerSegment, overlapCount, scaling = "density") {
    const { userSettings } = useSettingsStore();
    // Compute FFT for samples segments
    const fftOutput = this._fft_segmented(samples, pointsPerSegment, overlapCount);

    const dataCount = fftOutput[0].length;
    const segmentsCount = fftOutput.length;
    const psdOutput = new Float64Array(dataCount);

    // Compute power scale coef
    let scale = 1;
    if (userSettings.analyserHanning) {
        const window = Array(pointsPerSegment).fill(1);
        this._hanningWindow(window, pointsPerSegment);
        if (scaling === "density") {
            let skSum = 0;
            for (const value of window) {
                skSum += value ** 2;
            }
            scale = 1 / (this._blackBoxRate * skSum);
        } else if (scaling === "spectrum") {
            let sum = 0;
            for (const value of window) {
                sum += value;
            }
            scale = 1 / sum ** 2;
        }
    } else if (scaling === "density") {
        scale = 1 / pointsPerSegment;
    } else if (scaling === "spectrum") {
        scale = 1 / pointsPerSegment ** 2;
    }

    // Compute average for scaled power
    let min = 1e6,
        max = -1e6;
    // Early exit if no segments were processed
    if (segmentsCount === 0) {
        return {
            psdOutput: new Float64Array(0),
            min: 0,
            max: 0,
            maxNoiseFrequency: 0,
        };
    }
    const maxFrequency = this._blackBoxRate / 2;
    const noise50HzIdx = (50 / maxFrequency) * dataCount;
    const noise3HzIdx = (3 / maxFrequency) * dataCount;
    let maxNoiseIdx = 0;
    let maxNoise = -100;
    for (let i = 0; i < dataCount; i++) {
        psdOutput[i] = 0;
        for (let j = 0; j < segmentsCount; j++) {
            let p = scale * fftOutput[j][i] ** 2;
            if (i !== 0) {
                const even = dataCount % 2 === 0;
                if (!even || (even && i !== dataCount - 1)) {
                    p *= 2;
                }
            }
            psdOutput[i] += p;
        }

        const min_avg = 1e-7; // limit min value for -70db
        let avg = psdOutput[i] / segmentsCount;
        avg = Math.max(avg, min_avg);
        psdOutput[i] = 10 * Math.log10(avg);
        if (i > noise3HzIdx) {
            // Miss big zero freq magnitude
            min = Math.min(psdOutput[i], min);
            max = Math.max(psdOutput[i], max);
        }
        if (i > noise50HzIdx && psdOutput[i] > maxNoise) {
            maxNoise = psdOutput[i];
            maxNoiseIdx = i;
        }
    }

    const maxNoiseFrequency = (maxNoiseIdx / dataCount) * maxFrequency;

    return {
        psdOutput: psdOutput,
        min: min,
        max: max,
        maxNoiseFrequency: maxNoiseFrequency,
    };
};

/**
 * Compute FFT for samples segments by lenghts as pointsPerSegment with overlapCount overlap points count
 * It is good to use power at 2 values for pointsPerSegment.
 * For short data length, set pointsPerSegment same samples.length to extend samples count for power at 2 value inside _fft_segmented
 */
GraphSpectrumCalc._fft_segmented = function (samples, pointsPerSegment, overlapCount) {
    const { userSettings } = useSettingsStore();
    const samplesCount = samples.length;
    const output = [];

    for (let i = 0; i <= samplesCount - pointsPerSegment; i += pointsPerSegment - overlapCount) {
        let fftInput = samples.slice(i, i + pointsPerSegment);

        if (userSettings.analyserHanning) {
            this._hanningWindow(fftInput, pointsPerSegment);
        }

        let fftLength;
        if (pointsPerSegment === samplesCount) {
            // Extend the one segment input on power at 2 size
            const fftSize = this.getNearPower2Value(pointsPerSegment);
            const power2Input = new Float64Array(fftSize);
            power2Input.set(fftInput);
            fftInput = power2Input;
            fftLength = fftSize / 2;
        } else {
            fftLength = Math.floor(pointsPerSegment / 2);
        }

        const fftComplex = this._fft(fftInput);
        const magnitudes = new Float64Array(fftLength);
        for (let i = 0; i < fftLength; i++) {
            const re = fftComplex[2 * i];
            const im = fftComplex[2 * i + 1];
            magnitudes[i] = Math.hypot(re, im);
        }
        output.push(magnitudes);
    }

    return output;
};
