/**
 * Spectral analysis for chirp-based autotune.
 *
 * Computes the closed-loop transfer function from setpoint (input) to
 * gyro (output) using Welch's cross-spectral method, then derives
 * recommended PID gain adjustments.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ComplexFFT } from "./fft.js";

// ---------------------------------------------------------------------------
// Windowing
// ---------------------------------------------------------------------------

/**
 * Generate a Hanning window of the given size.
 * @param {number} size
 * @returns {Float64Array}
 */
export function hanningWindow(size) {
    const w = new Float64Array(size);
    for (let i = 0; i < size; i++) {
        w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return w;
}

// ---------------------------------------------------------------------------
// Welch cross-spectral density
// ---------------------------------------------------------------------------

/**
 * Compute the transfer function H(f) = Sxy / Sxx using Welch's method.
 *
 * @param {Float32Array} input  - Input signal (e.g. setpoint for one axis)
 * @param {Float32Array} output - Output signal (e.g. gyro for same axis)
 * @param {number} sampleRate   - Samples per second (Hz)
 * @param {number} [segmentSize=1024] - FFT segment size (power of 2 recommended)
 * @param {number} [overlap=0.5] - Overlap fraction between segments
 * @returns {{ frequencies: Float64Array, magnitude: Float64Array, phase: Float64Array, coherence: Float64Array }}
 */
export function welchTransferFunction(input, output, sampleRate, segmentSize = 1024, overlap = 0.5) {
    const N = input.length;
    if (N !== output.length) {
        throw new Error("Input and output arrays must be the same length");
    }
    if (N < 4) {
        throw new Error("Need at least 4 samples to compute a transfer function");
    }

    segmentSize = clampSegmentSize(segmentSize, N);

    const hopSize = Math.max(1, Math.round(segmentSize * (1 - overlap)));
    const numSegments = Math.max(1, Math.floor((N - segmentSize) / hopSize) + 1);
    const numBins = Math.floor(segmentSize / 2) + 1;
    const window = hanningWindow(segmentSize);

    const spectra = accumulateSpectra(input, output, window, segmentSize, numSegments, numBins, hopSize);
    return buildTransferFunction(spectra, sampleRate, segmentSize, numBins, numSegments);
}

function clampSegmentSize(segmentSize, N) {
    if (segmentSize <= N) {
        return segmentSize;
    }
    // Largest pow2 that fits in N (floor), minimum 4
    let fit = nextPow2(N);
    if (fit > N) {
        fit >>= 1;
    }
    return Math.max(fit, 4);
}

function accumulateSpectra(input, output, window, segmentSize, numSegments, numBins, hopSize) {
    const Sxx = new Float64Array(numBins);
    const Syy = new Float64Array(numBins);
    const SxyRe = new Float64Array(numBins);
    const SxyIm = new Float64Array(numBins);

    const fft = new ComplexFFT(segmentSize, false);
    const fftInput = new Float64Array(2 * segmentSize);
    const Xk = new Float64Array(2 * segmentSize);
    const Yk = new Float64Array(2 * segmentSize);

    for (let seg = 0; seg < numSegments; seg++) {
        const offset = seg * hopSize;

        for (let i = 0; i < segmentSize; i++) {
            fftInput[i] = input[offset + i] * window[i];
        }
        fft.simple(Xk, fftInput, "real");

        for (let i = 0; i < segmentSize; i++) {
            fftInput[i] = output[offset + i] * window[i];
        }
        fft.simple(Yk, fftInput, "real");

        for (let k = 0; k < numBins; k++) {
            const xr = Xk[2 * k],
                xi = Xk[2 * k + 1];
            const yr = Yk[2 * k],
                yi = Yk[2 * k + 1];

            Sxx[k] += xr * xr + xi * xi;
            Syy[k] += yr * yr + yi * yi;
            // Sxy = conj(X) * Y
            SxyRe[k] += xr * yr + xi * yi;
            SxyIm[k] += -xi * yr + xr * yi;
        }
    }

    return { Sxx, Syy, SxyRe, SxyIm };
}

function buildTransferFunction(spectra, sampleRate, segmentSize, numBins, numSegments) {
    const { Sxx, Syy, SxyRe, SxyIm } = spectra;
    const frequencies = new Float64Array(numBins);
    const magnitude = new Float64Array(numBins);
    const phase = new Float64Array(numBins);
    const coherence = new Float64Array(numBins);
    const hReal = new Float64Array(numBins);
    const hImag = new Float64Array(numBins);

    const freqBinWidth = sampleRate / segmentSize;

    for (let k = 0; k < numBins; k++) {
        frequencies[k] = k * freqBinWidth;

        if (Sxx[k] < 1e-20) {
            magnitude[k] = -Infinity;
            phase[k] = 0;
            coherence[k] = 0;
            hReal[k] = 0;
            hImag[k] = 0;
            continue;
        }

        const hRe = SxyRe[k] / Sxx[k];
        const hIm = SxyIm[k] / Sxx[k];
        hReal[k] = hRe;
        hImag[k] = hIm;

        magnitude[k] = 20 * Math.log10(Math.hypot(hRe, hIm)); // dB
        phase[k] = Math.atan2(hIm, hRe) * (180 / Math.PI); // degrees

        const sxyMagSq = SxyRe[k] * SxyRe[k] + SxyIm[k] * SxyIm[k];
        const denom = Sxx[k] * Syy[k];
        coherence[k] = denom > 1e-30 ? sxyMagSq / denom : 0;
    }

    return { frequencies, magnitude, phase, coherence, hReal, hImag, numSegments };
}

// ---------------------------------------------------------------------------
// Gain recommendation
// ---------------------------------------------------------------------------

/**
 * Recommend simplified tuning slider adjustments based on the measured
 * closed-loop transfer function.
 *
 * Derives individual P, I, D, feedforward, and filter recommendations from
 * the frequency response characteristics:
 *   - P (pi_gain): controls bandwidth — scaled to reach target -3dB frequency
 *   - I (i_gain): controls low-frequency tracking — scaled from low-freq error
 *   - D (d_gain): controls damping — scaled to reach target phase margin
 *   - FF (feedforward_gain): tracks setpoint changes — scaled with P
 *   - D-term filter: set from noise floor frequency
 *
 * All outputs are slider multiplier values (1.0 = default, stored as ×100 integers).
 *
 * @param {{ frequencies: Float64Array, magnitude: Float64Array, phase: Float64Array, coherence: Float64Array }} tf
 * @param {object} currentSliders - Current simplified tuning slider values as decimals (1.0 = 100)
 * @param {number} [targetBandwidthHz=45] - Desired -3dB bandwidth
 * @param {number} [targetPhaseMarginDeg=50] - Desired phase margin in degrees
 * @returns {{ proposed: object, analysis: object }}
 */
export function recommendGains(tf, currentSliders, targetBandwidthHz = 45, targetPhaseMarginDeg = 50) {
    const metrics = extractMetrics(tf, targetBandwidthHz);
    const scales = computeGainScales(metrics, tf, targetBandwidthHz, targetPhaseMarginDeg);
    const proposed = buildProposedSliders(currentSliders, scales);
    const analysis = { ...metrics, ...scales };
    return { proposed, analysis };
}

function extractMetrics(tf, targetBandwidthHz) {
    const { frequencies, magnitude, phase, coherence } = tf;
    const bandwidthHz = findBandwidth(frequencies, magnitude, coherence, targetBandwidthHz);
    const { resonantPeakDb, resonantFreqHz } = findResonantPeak(frequencies, magnitude, coherence);
    const gainCrossoverHz = findGainCrossover(frequencies, magnitude, coherence);
    const phaseAtCrossover = interpolatePhase(frequencies, phase, gainCrossoverHz);
    const phaseMarginDeg = 180 + phaseAtCrossover;
    const lowFreqErrorDb = computeLowFreqError(frequencies, magnitude, coherence);
    const noiseFloorHz = findNoiseFloor(frequencies, coherence);
    const meanCoherence = computeMeanCoherence(frequencies, coherence);

    return {
        bandwidthHz,
        resonantPeakDb,
        resonantFreqHz,
        gainCrossoverHz,
        phaseMarginDeg,
        lowFreqErrorDb,
        noiseFloorHz,
        meanCoherence,
    };
}

// 1. Bandwidth: frequency where closed-loop magnitude crosses -3dB
function findBandwidth(frequencies, magnitude, coherence, targetBandwidthHz) {
    for (let k = 1; k < frequencies.length; k++) {
        if (coherence[k] < 0.3) {
            continue;
        }
        if (magnitude[k] <= -3 && magnitude[k - 1] > -3) {
            const frac = (-3 - magnitude[k - 1]) / (magnitude[k] - magnitude[k - 1]);
            return frequencies[k - 1] + frac * (frequencies[k] - frequencies[k - 1]);
        }
    }
    let maxFreqAbove3dB = 0;
    for (let k = 1; k < frequencies.length; k++) {
        if (coherence[k] < 0.3) {
            continue;
        }
        if (magnitude[k] > -3 && frequencies[k] > maxFreqAbove3dB) {
            maxFreqAbove3dB = frequencies[k];
        }
    }
    return maxFreqAbove3dB || targetBandwidthHz;
}

// 2. Resonant peak: max magnitude overshoot (indicates underdamping)
function findResonantPeak(frequencies, magnitude, coherence) {
    let resonantPeakDb = -Infinity;
    let resonantFreqHz = 0;
    for (let k = 1; k < frequencies.length; k++) {
        if (coherence[k] < 0.3) {
            continue;
        }
        if (frequencies[k] > 0 && frequencies[k] < 500 && magnitude[k] > resonantPeakDb) {
            resonantPeakDb = magnitude[k];
            resonantFreqHz = frequencies[k];
        }
    }
    return { resonantPeakDb, resonantFreqHz };
}

// 3. Gain crossover: where magnitude crosses 0 dB
function findGainCrossover(frequencies, magnitude, coherence) {
    for (let k = 1; k < frequencies.length; k++) {
        if (coherence[k] < 0.3) {
            continue;
        }
        if (magnitude[k] <= 0 && magnitude[k - 1] > 0) {
            const frac = (0 - magnitude[k - 1]) / (magnitude[k] - magnitude[k - 1]);
            return frequencies[k - 1] + frac * (frequencies[k] - frequencies[k - 1]);
        }
    }
    return 0;
}

// 4. Phase at a chosen crossover frequency (linear interpolation)
function interpolatePhase(frequencies, phase, crossoverHz) {
    if (crossoverHz <= 0) {
        return 0;
    }
    for (let k = 1; k < frequencies.length; k++) {
        if (frequencies[k] >= crossoverHz) {
            const frac = (crossoverHz - frequencies[k - 1]) / (frequencies[k] - frequencies[k - 1]);
            return phase[k - 1] + frac * (phase[k] - phase[k - 1]);
        }
    }
    return 0;
}

// 5. Low-frequency gain error: average magnitude deviation from 0 dB in 2-10 Hz
function computeLowFreqError(frequencies, magnitude, coherence) {
    let sum = 0;
    let count = 0;
    for (let k = 0; k < frequencies.length; k++) {
        if (frequencies[k] >= 2 && frequencies[k] <= 10 && coherence[k] > 0.3) {
            sum += magnitude[k];
            count++;
        }
    }
    return count > 0 ? sum / count : 0;
}

// 6. Noise floor: frequency where coherence drops below 0.5
function findNoiseFloor(frequencies, coherence) {
    for (let k = 1; k < frequencies.length; k++) {
        if (frequencies[k] > 20 && coherence[k] < 0.5) {
            return frequencies[k];
        }
    }
    return frequencies.at(-1);
}

// 7. Overall coherence (measurement quality) in 5-100 Hz
function computeMeanCoherence(frequencies, coherence) {
    let sum = 0;
    let count = 0;
    for (let k = 0; k < frequencies.length; k++) {
        if (frequencies[k] >= 5 && frequencies[k] <= 100) {
            sum += coherence[k];
            count++;
        }
    }
    return count > 0 ? sum / count : 0;
}

function computeGainScales(metrics, tf, targetBandwidthHz, targetPhaseMarginDeg) {
    const { bandwidthHz, gainCrossoverHz, lowFreqErrorDb, noiseFloorHz, resonantPeakDb } = metrics;

    // P (via pi_gain): bandwidth roughly proportional to P gain
    let piScale = bandwidthHz > 0 ? targetBandwidthHz / bandwidthHz : 1;

    // D: predict post-P-change phase margin to couple P and D correctly.
    // Changing P shifts the gain crossover; the phase at the new crossover
    // determines the actual phase margin the system will have after the P
    // adjustment, so D must compensate from *that* predicted margin rather
    // than the currently measured one.
    let dScale = 1;
    const predictedCrossoverHz = gainCrossoverHz * piScale;
    if (predictedCrossoverHz > 0) {
        const predictedPhase = interpolatePhase(tf.frequencies, tf.phase, predictedCrossoverHz);
        const predictedPhaseMargin = 180 + predictedPhase;
        if (predictedPhaseMargin > 0 && predictedPhaseMargin < 180) {
            dScale = 1 + (targetPhaseMarginDeg - predictedPhaseMargin) / 90;
        }
    }

    // I: below 0 dB at low freq → increase, too high → decrease
    let iScale = 1;
    if (lowFreqErrorDb < -1) {
        iScale = 1 + Math.abs(lowFreqErrorDb) * 0.1;
    } else if (lowFreqErrorDb > 2) {
        iScale = 1 - lowFreqErrorDb * 0.05;
    }

    // FF: approximates P adjustment
    let ffScale = piScale;

    // Safety: back off on resonance
    if (resonantPeakDb > 6) {
        piScale *= 0.75;
        dScale *= 0.85;
        ffScale *= 0.8;
    } else if (resonantPeakDb > 3) {
        piScale *= 0.9;
        dScale *= 0.95;
    }

    const defaultFilterHz = 150;
    let filterScale = noiseFloorHz / defaultFilterHz;

    // Clamp all to safe range (max 2x change per iteration)
    return {
        piScale: clamp(piScale, 0.5, 2),
        iScale: clamp(iScale, 0.5, 2),
        dScale: clamp(dScale, 0.5, 2),
        ffScale: clamp(ffScale, 0.5, 2),
        filterScale: clamp(filterScale, 0.5, 2),
    };
}

function buildProposedSliders(currentSliders, scales) {
    const cur = currentSliders;
    const { piScale, iScale, dScale, ffScale, filterScale } = scales;
    return {
        slider_master_multiplier: Math.round(clamp((cur.masterMultiplier ?? 1) * 100, 25, 250)),
        slider_pi_gain: Math.round(clamp((cur.piGain ?? 1) * piScale * 100, 25, 250)),
        slider_i_gain: Math.round(clamp((cur.iGain ?? 1) * iScale * 100, 25, 250)),
        slider_d_gain: Math.round(clamp((cur.dGain ?? 1) * dScale * 100, 25, 250)),
        slider_feedforward_gain: Math.round(clamp((cur.feedforwardGain ?? 1) * ffScale * 100, 25, 250)),
        slider_dterm_filter_multiplier: Math.round(
            clamp((cur.dtermFilterMultiplier ?? 1) * filterScale * 100, 25, 250),
        ),
    };
}

// ---------------------------------------------------------------------------
// Sensitivity function  S = 1 - T
// ---------------------------------------------------------------------------

/**
 * Compute the sensitivity function S(f) = 1 - T(f) from the measured
 * closed-loop transfer function.  Peak |S| indicates robustness:
 * > 6 dB means the tune is fragile.
 *
 * @param {{ frequencies: Float64Array, hReal: Float64Array, hImag: Float64Array, coherence: Float64Array }} tf
 * @returns {{ frequencies: Float64Array, magnitude: Float64Array, phase: Float64Array, coherence: Float64Array, peakDb: number }}
 */
export function computeSensitivity(tf) {
    const { frequencies, hReal, hImag, coherence } = tf;
    const n = frequencies.length;
    const magnitude = new Float64Array(n);
    const phase = new Float64Array(n);
    let peakDb = -Infinity;

    for (let k = 0; k < n; k++) {
        const sRe = 1 - hReal[k];
        const sIm = -hImag[k];
        const mag = Math.hypot(sRe, sIm);
        magnitude[k] = mag > 1e-20 ? 20 * Math.log10(mag) : -Infinity;
        phase[k] = Math.atan2(sIm, sRe) * (180 / Math.PI);
        if (frequencies[k] > 0 && frequencies[k] < 500 && coherence[k] >= 0.3 && magnitude[k] > peakDb) {
            peakDb = magnitude[k];
        }
    }

    return { frequencies, magnitude, phase, coherence, peakDb };
}

// ---------------------------------------------------------------------------
// Step response  (via IFFT of closed-loop transfer function)
// ---------------------------------------------------------------------------

/**
 * Compute the unit step response from the measured closed-loop transfer
 * function.  Returns a time-domain trace (0 – 100 ms) plus key metrics:
 * overshoot %, rise time, and settling time.
 *
 * @param {{ hReal: Float64Array, hImag: Float64Array }} tf
 * @param {number} sampleRate
 * @param {number} segmentSize - FFT size used to compute the transfer function
 * @returns {{ timeMs: Float64Array, response: Float64Array, overshootPct: number, riseTimeMs: number, settlingTimeMs: number }}
 */
export function computeStepResponse(tf, sampleRate, segmentSize) {
    const { hReal, hImag } = tf;
    const numBins = hReal.length;
    const N = segmentSize;

    // Build full Hermitian-symmetric complex spectrum for IFFT
    const spectrum = new Float64Array(2 * N);
    for (let k = 0; k < numBins; k++) {
        spectrum[2 * k] = hReal[k];
        spectrum[2 * k + 1] = hImag[k];
    }
    for (let k = numBins; k < N; k++) {
        const mk = N - k;
        spectrum[2 * k] = hReal[mk];
        spectrum[2 * k + 1] = -hImag[mk];
    }

    // Inverse FFT → impulse response
    const ifft = new ComplexFFT(N, true);
    const result = new Float64Array(2 * N);
    ifft.simple(result, spectrum, "complex");

    // Cumulative sum of impulse response = step response.
    // Use only first half (second half is circular wrap-around).
    const halfN = Math.floor(N / 2);
    const step = new Float64Array(halfN);
    step[0] = result[0] / N;
    for (let i = 1; i < halfN; i++) {
        step[i] = step[i - 1] + result[2 * i] / N;
    }

    // Normalise so target steady-state = 1.0
    const dcGain = Math.hypot(hReal[0], hImag[0]);
    if (dcGain > 1e-10) {
        for (let i = 0; i < halfN; i++) {
            step[i] /= dcGain;
        }
    }

    // Trim to first 100 ms
    const maxTimeMs = 100;
    const dt = 1000 / sampleRate;
    let displayLen = halfN;
    for (let i = 0; i < halfN; i++) {
        if (i * dt > maxTimeMs) {
            displayLen = i;
            break;
        }
    }

    const timeMs = new Float64Array(displayLen);
    const response = new Float64Array(displayLen);
    for (let i = 0; i < displayLen; i++) {
        timeMs[i] = i * dt;
        response[i] = step[i];
    }

    return { timeMs, response, ...stepMetrics(timeMs, response, displayLen) };
}

function stepMetrics(timeMs, response, len) {
    if (len < 2) {
        return { overshootPct: 0, riseTimeMs: 0, settlingTimeMs: 0 };
    }

    const ss = steadyState(response, len);
    if (Math.abs(ss) < 1e-10) {
        return { overshootPct: 0, riseTimeMs: 0, settlingTimeMs: 0 };
    }

    const raw = ((peakValue(response, len) - ss) / ss) * 100;
    const overshootPct = Number.isFinite(raw) ? Math.max(0, raw) : 0;

    return {
        overshootPct,
        riseTimeMs: riseTime(timeMs, response, len, ss),
        settlingTimeMs: settlingTime(timeMs, response, len, ss),
    };
}

function steadyState(response, len) {
    const tailStart = Math.max(1, Math.floor(len * 0.9));
    let sum = 0;
    for (let i = tailStart; i < len; i++) {
        sum += response[i];
    }
    return sum / (len - tailStart);
}

function peakValue(response, len) {
    let peak = -Infinity;
    for (let i = 0; i < len; i++) {
        if (response[i] > peak) {
            peak = response[i];
        }
    }
    return peak;
}

function riseTime(timeMs, response, len, ss) {
    let start = 0;
    for (let i = 0; i < len; i++) {
        if (start === 0 && response[i] >= 0.1 * ss) {
            start = timeMs[i];
        }
        if (response[i] >= 0.9 * ss) {
            return Math.max(0, timeMs[i] - start);
        }
    }
    return 0;
}

function settlingTime(timeMs, response, len, ss) {
    const band = 0.02 * Math.abs(ss);
    for (let i = len - 1; i >= 0; i--) {
        if (Math.abs(response[i] - ss) > band) {
            return i < len - 1 ? timeMs[i + 1] : timeMs[i];
        }
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Spectrogram  (short-time FFT power spectral density)
// ---------------------------------------------------------------------------

/**
 * Compute a spectrogram (time × frequency power map) of a signal.
 * Each cell stores the PSD in dB.  The result is a flat Float64Array
 * indexed as `power[seg * numBins + bin]`.
 *
 * @param {Float32Array} signal     - Time-domain signal (e.g. gyro for one axis)
 * @param {number}       sampleRate - Hz
 * @param {number}       [windowSize=256]
 * @param {number}       [overlap=0.75]
 * @returns {{ timeMs: Float64Array, freqHz: Float64Array, power: Float64Array, numSegments: number, numBins: number }}
 */
export function computeSpectrogram(signal, sampleRate, windowSize = 256, overlap = 0.75) {
    const N = signal.length;
    if (N < 4) {
        return {
            timeMs: new Float64Array(0),
            freqHz: new Float64Array(0),
            power: new Float64Array(0),
            numSegments: 0,
            numBins: 0,
        };
    }
    windowSize = Math.min(windowSize, N);

    const hopSize = Math.max(1, Math.round(windowSize * (1 - overlap)));
    const numSegments = Math.max(1, Math.floor((N - windowSize) / hopSize) + 1);
    const numBins = Math.floor(windowSize / 2) + 1;
    const win = hanningWindow(windowSize);
    const fft = new ComplexFFT(windowSize, false);

    const timeMs = new Float64Array(numSegments);
    const freqHz = new Float64Array(numBins);
    const power = new Float64Array(numSegments * numBins);

    const freqBinWidth = sampleRate / windowSize;
    for (let k = 0; k < numBins; k++) {
        freqHz[k] = k * freqBinWidth;
    }

    const buf = new Float64Array(2 * windowSize);
    const Xk = new Float64Array(2 * windowSize);

    for (let seg = 0; seg < numSegments; seg++) {
        const offset = seg * hopSize;
        timeMs[seg] = ((offset + windowSize / 2) / sampleRate) * 1000;

        for (let i = 0; i < windowSize; i++) {
            buf[i] = signal[offset + i] * win[i];
        }
        fft.simple(Xk, buf, "real");

        const row = seg * numBins;
        for (let k = 0; k < numBins; k++) {
            const re = Xk[2 * k];
            const im = Xk[2 * k + 1];
            power[row + k] = 10 * Math.log10(re * re + im * im + 1e-20);
        }
    }

    return { timeMs, freqHz, power, numSegments, numBins };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function nextPow2(n) {
    let p = 1;
    while (p < n) {
        p <<= 1;
    }
    return p;
}
