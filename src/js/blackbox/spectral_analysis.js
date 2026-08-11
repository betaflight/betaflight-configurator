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
import { clamp } from "../utils/common.js";

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

// Below this frequency the closed-loop response sits at |T| ~ 1, so 1 - T
// approaches zero and the recovered open loop is dominated by noise.
const MIN_OPEN_LOOP_HZ = 2;

// Margin work depends on phase accuracy, so it uses a stricter coherence gate
// than the magnitude-only metrics.
const CROSSOVER_COHERENCE_MIN = 0.5;

const DEFAULT_DTERM_FILTER_HZ = 150;

/**
 * Selectable phase-margin targets.
 *
 * Lower margin means crossover is placed further up the phase curve: a sharper,
 * faster craft with less room before oscillation. Higher margin backs off.
 *
 * The top of the range is bounded by the craft, not by preference. Open-loop
 * phase peaks where the D term's lead is strongest and falls away either side,
 * so the highest margin any craft can be tuned to is 180 + that peak — about
 * 83-85 deg on the 5-inch logs this was developed against, and lower on a craft
 * running less D. `maxAchievablePhaseMarginDeg` reports it. CONSERVATIVE is set
 * below the values measured there so it stays reachable; when a target cannot
 * be met the gain is held rather than guessed.
 */
export const PHASE_MARGIN_PRESETS = {
    AGGRESSIVE: 50,
    NORMAL: 60,
    CONSERVATIVE: 72.5,
};

/**
 * Recommend simplified tuning slider adjustments based on the measured
 * closed-loop transfer function.
 *
 * Gains are set by loop shaping against a phase-margin target rather than a
 * fixed bandwidth in Hz. The achievable crossover frequency is a property of
 * the airframe — prop inertia, motor response and filter phase lag all push it
 * down — so a constant target in Hz cannot suit both a 65 mm whoop and a
 * 10-inch. Targeting margin instead lets the frequency fall out of the
 * measurement, which is self-calibrating across airframe sizes.
 *
 *   - P (pi_gain): loop gain scaled to place crossover where the open loop
 *     still has `targetPhaseMarginDeg` of margin
 *   - I (i_gain): scaled from low-frequency tracking error
 *   - D (d_gain): held (see computeGainScales)
 *   - FF (feedforward_gain): tracks P
 *   - D-term filter: derived from the noise floor, tighten-only
 *
 * All outputs are slider multiplier values (1.0 = default, stored as ×100 integers).
 *
 * @param {{ frequencies: Float64Array, magnitude: Float64Array, phase: Float64Array, coherence: Float64Array, hReal: Float64Array, hImag: Float64Array }} tf
 * @param {object} currentSliders - Current simplified tuning slider values as decimals (1.0 = 100)
 * @param {number} [targetPhaseMarginDeg] - Desired open-loop phase margin in degrees
 * @returns {{ proposed: object, analysis: object }}
 */
export function recommendGains(tf, currentSliders, targetPhaseMarginDeg = PHASE_MARGIN_PRESETS.NORMAL) {
    const openLoop = openLoopResponse(tf);
    const metrics = extractMetrics(tf, openLoop, targetPhaseMarginDeg);
    const scales = computeGainScales(metrics);
    const proposed = buildProposedSliders(currentSliders, scales);
    const analysis = { ...metrics, ...scales };
    return { proposed, analysis };
}

function extractMetrics(tf, openLoop, targetPhaseMarginDeg) {
    const { frequencies, magnitude, coherence } = tf;
    const bandwidthHz = findBandwidth(frequencies, magnitude, coherence);
    const { resonantPeakDb, resonantFreqHz } = findResonantPeak(frequencies, magnitude, coherence);
    const crossover = findOpenLoopCrossover(tf, openLoop);
    const target = findTargetCrossover(tf, openLoop, targetPhaseMarginDeg);
    const lowFreqErrorDb = computeLowFreqError(frequencies, magnitude, coherence);
    const noiseFloorHz = findNoiseFloor(frequencies, coherence);
    const meanCoherence = computeMeanCoherence(frequencies, coherence);
    const loopDelayMs = estimateLoopDelayMs(tf, openLoop);
    const maxAchievablePhaseMarginDeg = findMaxAchievablePhaseMargin(tf, openLoop);

    return {
        bandwidthHz,
        resonantPeakDb,
        resonantFreqHz,
        maxAchievablePhaseMarginDeg,
        // True open-loop crossover and the phase margin there. Both are Number.NaN when
        // no crossing exists inside the coherent band.
        openLoopCrossoverHz: crossover ? crossover.frequencyHz : Number.NaN,
        phaseMarginDeg: crossover ? crossover.phaseMarginDeg : Number.NaN,
        // Highest crossover placeable at the target margin, and the loop-gain
        // change needed to get there.
        targetCrossoverHz: target ? target.frequencyHz : Number.NaN,
        gainToTarget: target ? target.gainScale : Number.NaN,
        lowFreqErrorDb,
        noiseFloorHz,
        meanCoherence,
        loopDelayMs,
        targetPhaseMarginDeg,
    };
}

// ---------------------------------------------------------------------------
// Open loop recovered from the measured closed loop
// ---------------------------------------------------------------------------

/**
 * Recover the open-loop response L from the measured closed loop T:
 *
 *   L = T / (1 - T)
 *
 * With T = a + bi this is [(a - a² - b²) + i·b] / [(1-a)² + b²].
 *
 * Phase margin, gain crossover and loop delay are all open-loop properties.
 * Reading them off the closed-loop response instead gives numbers that look
 * plausible but are not the quantities they are named after: |T| crosses 0 dB
 * only a few Hz up on a well-damped craft, where the closed-loop phase is
 * still near zero, so `180 + phase` lands near 180° for anything stable.
 *
 * Phase is unwrapped upward from MIN_OPEN_LOOP_HZ. Starting from DC would seed
 * the unwrap chain with the ill-conditioned bins where 1 - T approaches zero.
 *
 * @param {object} tf - transfer function from welchTransferFunction()
 * @returns {{ magnitude: Float64Array, phase: Float64Array, startIndex: number }}
 */
export function openLoopResponse(tf) {
    const { frequencies, hReal, hImag } = tf;
    const n = frequencies.length;
    const magnitude = new Float64Array(n).fill(Number.NaN);
    const phase = new Float64Array(n).fill(Number.NaN);

    let startIndex = 0;
    for (let k = 1; k < n; k++) {
        if (frequencies[k] >= MIN_OPEN_LOOP_HZ) {
            startIndex = k;
            break;
        }
    }

    let offset = 0;
    let previousRaw = null;
    for (let k = startIndex; k < n; k++) {
        const a = hReal[k];
        const b = hImag[k];
        const denominator = (1 - a) * (1 - a) + b * b;
        if (!(denominator > 1e-12)) {
            continue;
        }
        const real = (a - a * a - b * b) / denominator;
        const imag = b / denominator;
        magnitude[k] = Math.hypot(real, imag);

        const raw = Math.atan2(imag, real) * (180 / Math.PI);
        if (previousRaw !== null) {
            const delta = raw - previousRaw;
            if (delta > 180) {
                offset -= 360;
            } else if (delta < -180) {
                offset += 360;
            }
        }
        phase[k] = raw + offset;
        previousRaw = raw;
    }

    return { magnitude, phase, startIndex };
}

// Present crossover: where |L| = 1, and the phase margin measured there.
function findOpenLoopCrossover(tf, openLoop) {
    const { frequencies, coherence } = tf;
    for (let k = openLoop.startIndex + 1; k < frequencies.length; k++) {
        if (Number.isNaN(openLoop.magnitude[k]) || Number.isNaN(openLoop.magnitude[k - 1])) {
            continue;
        }
        if (coherence[k] < CROSSOVER_COHERENCE_MIN || coherence[k - 1] < CROSSOVER_COHERENCE_MIN) {
            continue;
        }
        if (openLoop.magnitude[k] <= 1 && openLoop.magnitude[k - 1] > 1) {
            const frac = (1 - openLoop.magnitude[k - 1]) / (openLoop.magnitude[k] - openLoop.magnitude[k - 1]);
            return {
                frequencyHz: frequencies[k - 1] + frac * (frequencies[k] - frequencies[k - 1]),
                phaseMarginDeg: 180 + openLoop.phase[k - 1] + frac * (openLoop.phase[k] - openLoop.phase[k - 1]),
            };
        }
    }
    return null;
}

// Highest crossover placeable while retaining the target margin: the frequency
// where open-loop phase falls to -(180 - targetPhaseMarginDeg). The loop-gain
// change needed to put crossover there is 1/|L| at that frequency.
function findTargetCrossover(tf, openLoop, targetPhaseMarginDeg) {
    const { frequencies, coherence } = tf;
    const wantedPhase = -(180 - targetPhaseMarginDeg);
    for (let k = openLoop.startIndex + 1; k < frequencies.length; k++) {
        if (Number.isNaN(openLoop.phase[k]) || Number.isNaN(openLoop.phase[k - 1])) {
            continue;
        }
        if (coherence[k] < CROSSOVER_COHERENCE_MIN || coherence[k - 1] < CROSSOVER_COHERENCE_MIN) {
            continue;
        }
        if (openLoop.phase[k] <= wantedPhase && openLoop.phase[k - 1] > wantedPhase) {
            const frac = (wantedPhase - openLoop.phase[k - 1]) / (openLoop.phase[k] - openLoop.phase[k - 1]);
            const magnitudeAt = openLoop.magnitude[k - 1] + frac * (openLoop.magnitude[k] - openLoop.magnitude[k - 1]);
            if (!(magnitudeAt > 1e-9)) {
                return null;
            }
            return {
                frequencyHz: frequencies[k - 1] + frac * (frequencies[k] - frequencies[k - 1]),
                gainScale: 1 / magnitudeAt,
            };
        }
    }
    return null;
}

// Ceiling on phase margin for this craft. Open-loop phase peaks where the D
// term's lead is strongest and falls away either side, so no choice of loop
// gain can place crossover at a margin higher than 180 + that peak. Targets
// above it are unreachable, which is why the UI reports this rather than
// silently holding the gain.
function findMaxAchievablePhaseMargin(tf, openLoop) {
    const { frequencies, coherence } = tf;
    let peakPhase = -Infinity;
    for (let k = openLoop.startIndex; k < frequencies.length; k++) {
        if (Number.isNaN(openLoop.phase[k]) || coherence[k] < CROSSOVER_COHERENCE_MIN) {
            continue;
        }
        if (openLoop.phase[k] > peakPhase) {
            peakPhase = openLoop.phase[k];
        }
    }
    return Number.isFinite(peakPhase) ? 180 + peakPhase : Number.NaN;
}

// Effective loop delay from the slope of open-loop phase against frequency:
// phase_deg ~ -360·tau·f, so tau = -slope/360. Reported for diagnosis — it is
// the hard ceiling on crossover that no amount of gain can move.
function estimateLoopDelayMs(tf, openLoop, fLoHz = 20, fHiHz = 140) {
    const { frequencies, coherence } = tf;
    let n = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;
    for (let k = openLoop.startIndex; k < frequencies.length; k++) {
        const f = frequencies[k];
        if (f < fLoHz || f > fHiHz) {
            continue;
        }
        if (Number.isNaN(openLoop.phase[k]) || coherence[k] < CROSSOVER_COHERENCE_MIN) {
            continue;
        }
        n++;
        sumX += f;
        sumY += openLoop.phase[k];
        sumXX += f * f;
        sumXY += f * openLoop.phase[k];
    }
    if (n < 5) {
        return Number.NaN;
    }
    const denominator = n * sumXX - sumX * sumX;
    if (Math.abs(denominator) < 1e-12) {
        return Number.NaN;
    }
    const slope = (n * sumXY - sumX * sumY) / denominator;
    return (-slope / 360) * 1000;
}

// 1. Bandwidth: frequency where closed-loop magnitude crosses -3dB.
// Reported for information only. It is a poor control target: a loop with high
// gain and heavy phase lag stays magnitude-flat well past the point where it
// has any stability margin left, which is why yaw can measure a far higher
// bandwidth than roll or pitch on the same craft while having less margin.
function findBandwidth(frequencies, magnitude, coherence) {
    for (let k = 1; k < frequencies.length; k++) {
        if (coherence[k - 1] < 0.3 || coherence[k] < 0.3) {
            continue;
        }
        if (magnitude[k] <= -3 && magnitude[k - 1] > -3) {
            const frac = (-3 - magnitude[k - 1]) / (magnitude[k] - magnitude[k - 1]);
            return frequencies[k - 1] + frac * (frequencies[k] - frequencies[k - 1]);
        }
    }
    return Number.NaN;
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

// 3. Low-frequency gain error: average magnitude deviation from 0 dB in 2-10 Hz
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

function computeGainScales(metrics) {
    const { gainToTarget, lowFreqErrorDb, noiseFloorHz, resonantPeakDb } = metrics;

    // P (via pi_gain): scale loop gain so crossover lands where the open loop
    // still has the target phase margin. If the phase never falls that far
    // inside the coherent band there is no measured basis for a gain change,
    // so hold rather than guess.
    let piScale = Number.isFinite(gainToTarget) ? gainToTarget : 1;

    // D: held.
    //
    // The previous rule derived D from a "phase margin" computed off the
    // closed-loop response at the closed-loop 0 dB crossing. That crossing sits
    // a few Hz up on a well-damped craft, where closed-loop phase is still near
    // zero, so the figure landed near 180° on anything stable and drove dScale
    // hard negative into its 0.5 clamp. Measured on two independent 5-inch
    // chirp flights it halved the D slider on 6 of 6 axis-flights regardless of
    // the craft.
    //
    // With crossover placed by phase margin, the margin target is met by the
    // gain change alone, so D has nothing left to correct. D shapes the phase
    // curve and therefore sets *where* the margin limit falls — reported as
    // targetCrossoverHz — but choosing to trade damping for more bandwidth is a
    // pilot preference, not something the measurement can settle. Re-enabling
    // an automatic D recommendation needs a sound basis first.
    const dScale = 1;

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
        ffScale *= 0.8;
    } else if (resonantPeakDb > 3) {
        piScale *= 0.9;
    }

    // D-term filter: derive a cutoff hint from where the measurement stops
    // being coherent. NOTE: chirp coherence is NOT a gyro-noise measurement —
    // a clean sweep says nothing about the broadband gyro/motor noise that
    // D-term filtering exists to suppress. On a clean log findNoiseFloor()
    // falls back to the top frequency, which would drive the cutoff up and
    // *reduce* filtering — feeding D-term noise into the motors and risking
    // instability/flyaway on arm. So this may only ever tighten filtering.
    const filterScale = noiseFloorHz / DEFAULT_DTERM_FILTER_HZ;

    // Clamp all to safe range (max 2x change per iteration)
    return {
        piScale: clamp(piScale, 0.5, 2),
        iScale: clamp(iScale, 0.5, 2),
        dScale,
        ffScale: clamp(ffScale, 0.5, 2),
        // Safety: cap at 1.0 — never recommend *less* D-term filtering (see note above).
        filterScale: clamp(filterScale, 0.5, 1),
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
    let start = null;
    for (let i = 0; i < len; i++) {
        if (start === null && response[i] >= 0.1 * ss) {
            start = timeMs[i];
        }
        if (response[i] >= 0.9 * ss) {
            return start === null ? 0 : Math.max(0, timeMs[i] - start);
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

function nextPow2(n) {
    let p = 1;
    while (p < n) {
        p <<= 1;
    }
    return p;
}
