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

// Per-pass bounds on any slider multiplier change.
const GAIN_SCALE_MIN = 0.5;
const GAIN_SCALE_MAX = 2;

/**
 * Robustness bound on peak sensitivity, Ms = max |1/(1 + L)|.
 *
 * Ms is the reciprocal of the shortest distance from the Nyquist curve to -1,
 * so it bounds phase and gain margin together: PM >= 2·asin(1/(2·Ms)) and
 * GM >= Ms/(Ms - 1). The usual design range is 1.2 to 2.0; past 2.0 a loop is
 * conventionally called fragile. 2.0 is used here as a hard ceiling on the gain
 * recommendation rather than as a target to reach.
 */
const MAX_SENSITIVITY_PEAK = 2.0;

// Fractional shortfall in allowed gain below which the difference is treated as
// scan resolution rather than a real robustness limit.
const SENSITIVITY_BIND_TOLERANCE = 0.02;

// Resolution of the gain scans used for the sensitivity bound. One step is
// roughly one unit of slider travel, so a finer grid would not survive the
// rounding in buildProposedSliders().
const GAIN_SCAN_STEP = 0.01;

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
    const scales = computeGainScales(metrics, tf, openLoop);
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
    const sensitivityLimitedGain = scanSensitivity(tf, openLoop, MAX_SENSITIVITY_PEAK).withinBound;

    return {
        bandwidthHz,
        resonantPeakDb,
        resonantFreqHz,
        maxAchievablePhaseMarginDeg,
        // Largest loop-gain change over the full per-pass range that keeps peak
        // sensitivity within the robustness bound. Can be below 1 on a craft
        // that is already fragile, and Number.NaN on one where no gain the
        // sliders can express meets the bound at all. Reported as a diagnostic;
        // the gain actually applied is searched against the narrower interval
        // the margin target admits, in computeGainScales().
        sensitivityLimitedGain,
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
 * Bins below the coherence gate are left as Number.NaN and take no part in the
 * unwrap. They have to be excluded here rather than only at the point of use:
 * the unwrap offset is cumulative, so one noisy bin far enough from its
 * neighbours applies a spurious +/-360 that then persists into every bin above
 * it, including bins whose own coherence is fine. Skipping them widens the gap
 * between consecutive accepted bins, which is harmless while the true phase
 * change across the gap stays under 180 deg — a few bins of a rate loop.
 *
 * @param {object} tf - transfer function from welchTransferFunction()
 * @returns {{ magnitude: Float64Array, phase: Float64Array, startIndex: number }}
 */
export function openLoopResponse(tf) {
    const { frequencies, hReal, hImag, coherence } = tf;
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
        if (coherence[k] < CROSSOVER_COHERENCE_MIN) {
            continue;
        }
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

/**
 * Peak sensitivity |S| = |1/(1 + k·L)| over the coherent band, for a loop whose
 * gain has been scaled by `gainScale`.
 *
 * Peak sensitivity is the distance from the Nyquist curve to the -1 point:
 * Ms = 1/(shortest distance). Phase margin only constrains the curve at the
 * single crossover frequency, so a loop can hold a healthy margin there and
 * still pass close to -1 somewhere else — which is exactly what happens above
 * crossover, where loop delay has rolled the phase past -180 while |L| is not
 * yet small. Scaling gain lifts the curve there too, at a frequency the phase
 * margin test never looks at.
 */
function peakSensitivityAtGain(tf, openLoop, gainScale) {
    let peak = 0;
    for (let k = openLoop.startIndex; k < tf.frequencies.length; k++) {
        if (Number.isNaN(openLoop.magnitude[k]) || tf.coherence[k] < CROSSOVER_COHERENCE_MIN) {
            continue;
        }
        const phaseRad = (openLoop.phase[k] * Math.PI) / 180;
        const real = 1 + gainScale * openLoop.magnitude[k] * Math.cos(phaseRad);
        const imag = gainScale * openLoop.magnitude[k] * Math.sin(phaseRad);
        const distance = Math.hypot(real, imag);
        if (distance > 1e-9) {
            const sensitivity = 1 / distance;
            if (sensitivity > peak) {
                peak = sensitivity;
            }
        }
    }
    return peak > 0 ? peak : Number.NaN;
}

/**
 * Walk the gain grid over [GAIN_SCALE_MIN, maxGain] once, returning both answers
 * the recommendation can need:
 *
 *   withinBound - largest gain whose predicted peak sensitivity stays within
 *                 `limit`, or Number.NaN when no gain in range does.
 *   leastBad    - gain with the lowest predicted peak, whatever that peak is.
 *                 Only consulted when withinBound is Number.NaN, on a craft
 *                 fragile beyond what one pass of the sliders can repair.
 *
 * Every candidate is evaluated and the largest passing one kept. An earlier
 * version scanned upward and broke at the first violation, seeding the result
 * with GAIN_SCALE_MIN — which returned the floor as safe without ever checking
 * it, and assumed Ms rises monotonically with gain. It does not: on a craft with
 * a lightly damped mode above crossover, reducing gain can bring |L| back
 * towards 1 at a frequency where the phase is already past -180, so the loop
 * passes closer to -1 than it did at full gain. On a synthetic 15 Hz crossover
 * with a 40 Hz mode at zeta 0.05, Ms is 2.66 at gain 0.5 against 1.16 at gain
 * 1.0, so the break-on-first-violation form returned the worst gain in range and
 * reported it as the bound. Both answers come off the one walk for the same
 * reason they cannot be reasoned about separately: there is no safe direction to
 * assume, so the grid has to be measured either way.
 */
function scanSensitivity(tf, openLoop, limit, maxGain = GAIN_SCALE_MAX) {
    let withinBound = Number.NaN;
    let leastBad = Number.NaN;
    let bestPeak = Infinity;

    for (let gain = GAIN_SCALE_MIN; gain <= maxGain + 1e-9; gain += GAIN_SCAN_STEP) {
        const peak = peakSensitivityAtGain(tf, openLoop, gain);
        if (!Number.isFinite(peak)) {
            // Nothing coherent to judge by; leave the gain untouched.
            const hold = Math.min(1, maxGain);
            return { withinBound: hold, leastBad: hold };
        }
        if (peak <= limit) {
            withinBound = gain;
        }
        if (peak < bestPeak) {
            bestPeak = peak;
            leastBad = gain;
        }
    }

    return { withinBound, leastBad };
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
//
// The 20 Hz floor is deliberate and not derived from the coherent band. Open-loop
// phase peaks where the D term's lead is strongest — around 10-12 Hz on the logs
// this was developed against — and the slope there is set by that lead rather
// than by transport delay, so a window reaching down to the start of the band
// would pull the phase peak into the regression and bias the estimate low. Bins
// are already filtered individually on coherence, so a band that stops short of
// fHiHz simply contributes fewer of them; the 5-bin floor is only reached when
// coherence is poor across the whole window, where Number.NaN is the right answer.
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

// 6. Noise floor: frequency where coherence drops below 0.5, having first been
// above it.
//
// The qualifier matters. Without it a log that was never coherent anywhere
// returns its first bin above 20 Hz, which reads as an extremely low noise floor
// and drives the D-term filter recommendation straight into its tightest clamp —
// a clamp reported as a measurement, on a sweep that measured nothing. Number.NaN
// says there is no floor to find, only noise.
function findNoiseFloor(frequencies, coherence) {
    let everCoherent = false;
    for (let k = 1; k < frequencies.length; k++) {
        if (coherence[k] >= 0.5) {
            everCoherent = true;
        } else if (everCoherent && frequencies[k] > 20) {
            return frequencies[k];
        }
    }
    return everCoherent ? frequencies.at(-1) : Number.NaN;
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

function computeGainScales(metrics, tf, openLoop) {
    const { gainToTarget, lowFreqErrorDb, noiseFloorHz, resonantPeakDb } = metrics;

    // P (via pi_gain) is bounded by two independent conditions.
    //
    // 1. Phase margin: place crossover where the open loop still has the target
    //    margin. If the phase never falls that far inside the coherent band
    //    there is no measured basis for a gain change, so hold rather than guess.
    // 2. Peak sensitivity: keep Ms within MAX_SENSITIVITY_PEAK.
    //
    // The second is not implied by the first. Phase margin constrains the
    // Nyquist curve only at crossover; on a 5-inch measured here the sensitivity
    // peak sits at 66-105 Hz against a 20-50 Hz crossover, where delay has rolled
    // the phase past -180 and |L| is not yet small. Targeting margin alone raised
    // predicted Ms from a healthy 1.5-1.7 to 2.7-3.9 on roll and pitch, which is
    // fragile by a measure this file already computes.
    //
    // The two are combined by searching the admissible interval rather than by
    // taking min() of two independently computed answers. min() would be right
    // only if Ms fell monotonically with gain: it does not, so the gain the
    // margin target asks for can violate the bound even when some higher gain
    // satisfies it, and min() would then return a value never checked against
    // the bound at all.
    const gainForMargin = Number.isFinite(gainToTarget) ? gainToTarget : 1;

    // Safety: back off on a resonant closed-loop peak. Folded in before the
    // robustness search rather than applied to its answer afterwards, so the
    // gain the search verifies is the gain that actually gets applied. Scaling
    // the result down after the fact could land back outside the bound the
    // search exists to enforce, Ms not being monotonic in gain.
    let resonanceBackoff = 1;
    let ffResonanceBackoff = 1;
    if (resonantPeakDb > 6) {
        resonanceBackoff = 0.75;
        ffResonanceBackoff = 0.8;
    } else if (resonantPeakDb > 3) {
        resonanceBackoff = 0.9;
    }

    // The sliders cannot express more than a GAIN_SCALE_MAX change in one pass,
    // so nothing above that is admissible however much margin invites it.
    const requestedGain = gainForMargin * resonanceBackoff;
    const admissibleMax = clamp(requestedGain, GAIN_SCALE_MIN, GAIN_SCALE_MAX);

    // When that clamp bites, targetCrossoverHz is still the correct crossover
    // limit for the craft but is not the crossover the applied gain reaches.
    // Reported so the interface can say so instead of showing a figure the
    // recommendation does not deliver.
    const gainClamped =
        Number.isFinite(gainToTarget) && (requestedGain > GAIN_SCALE_MAX || requestedGain < GAIN_SCALE_MIN);

    // Which end of the per-pass range bit, so a note can quote the bound that
    // actually applied rather than assuming it was the upper one. A craft asking
    // for x0.19 is held by GAIN_SCALE_MIN, and telling it the pass is limited to
    // 2x would be nonsense.
    let gainClampLimit = Number.NaN;
    if (gainClamped) {
        gainClampLimit = requestedGain > GAIN_SCALE_MAX ? GAIN_SCALE_MAX : GAIN_SCALE_MIN;
    }

    // Common case: what the margin target asks for is already within the
    // robustness bound. Take it exactly, rather than off the scan grid.
    let piScale = admissibleMax;
    let sensitivityUnreachable = false;
    if (peakSensitivityAtGain(tf, openLoop, admissibleMax) > MAX_SENSITIVITY_PEAK) {
        const { withinBound, leastBad } = scanSensitivity(tf, openLoop, MAX_SENSITIVITY_PEAK, admissibleMax);
        if (Number.isFinite(withinBound)) {
            piScale = withinBound;
        } else {
            // No admissible gain meets the bound. Take the one that comes
            // closest and flag it, rather than silently applying a gain the
            // robustness test rejects.
            sensitivityUnreachable = true;
            piScale = Number.isFinite(leastBad) ? leastBad : admissibleMax;
        }
    }

    // Which of the two conditions limited the gain, reported so it is visible
    // rather than implied. Judged against the admissible ceiling with a
    // tolerance comfortably above the scan step, so neither the GAIN_SCALE_MAX
    // clamp nor grid resolution alone registers as robustness binding.
    const sensitivityBinds = piScale < admissibleMax * (1 - SENSITIVITY_BIND_TOLERANCE);

    // D: held.
    //
    // When robustness is what holds the gain back, more D is in principle the
    // other lever — it adds phase lead, pulling the curve away from -1. Three
    // things stop that being a recommendation this can make:
    //
    // 1. D only contributes lead below its own filter cutoff. Above it the
    //    differentiator is rolled off and more D adds gain with no lead, moving
    //    the curve toward -1 at the one frequency that matters. Whether that
    //    applies is a per-craft question, and getting it backwards makes things
    //    worse rather than merely failing to help.
    // 2. What ultimately caps D is the broadband gyro and motor noise it
    //    amplifies, which a swept sine cannot see. Same reason the D-term filter
    //    recommendation is capped at tighten-only.
    // 3. slider_d_gain is one value across all axes while this analysis is
    //    per-axis, and yaw conventionally runs no D at all, so a per-axis D
    //    conclusion does not map onto what actually gets written.
    //
    // So the gain reduction carries the robustness correction on its own, which
    // is a lever whose effect is computed exactly rather than estimated.
    const dScale = 1;

    // I: below 0 dB at low freq → increase, too high → decrease
    let iScale = 1;
    if (lowFreqErrorDb < -1) {
        iScale = 1 + Math.abs(lowFreqErrorDb) * 0.1;
    } else if (lowFreqErrorDb > 2) {
        iScale = 1 - lowFreqErrorDb * 0.05;
    }

    // FF: approximates the P adjustment, carrying the same reduction where the
    // robustness search cut the gain back, but with FF's own resonance backoff.
    const robustnessFactor = piScale / admissibleMax;
    const ffScale = gainForMargin * ffResonanceBackoff * robustnessFactor;

    // D-term filter: derive a cutoff hint from where the measurement stops
    // being coherent. NOTE: chirp coherence is NOT a gyro-noise measurement —
    // a clean sweep says nothing about the broadband gyro/motor noise that
    // D-term filtering exists to suppress. On a clean log findNoiseFloor()
    // falls back to the top frequency, which would drive the cutoff up and
    // *reduce* filtering — feeding D-term noise into the motors and risking
    // instability/flyaway on arm. So this may only ever tighten filtering.
    //
    // A sweep with no coherent band anywhere has no noise floor to report, and
    // tightening filtering to the clamp on that basis would be the same mistake
    // as the D rule this replaced: an unconditional clamp presented as a reading.
    // Hold instead.
    const filterScale = Number.isFinite(noiseFloorHz) ? noiseFloorHz / DEFAULT_DTERM_FILTER_HZ : 1;

    // piScale is already inside the per-pass range by construction; the clamp is
    // kept so the invariant holds locally rather than by inspection above.
    const finalPiScale = clamp(piScale, GAIN_SCALE_MIN, GAIN_SCALE_MAX);

    return {
        piScale: finalPiScale,
        // Gain the margin target and resonance backoff asked for, before the
        // per-pass clamp. Reported alongside piScale so the interface can show
        // what was wanted against what was applied.
        requestedGain,
        iScale: clamp(iScale, GAIN_SCALE_MIN, GAIN_SCALE_MAX),
        dScale,
        ffScale: clamp(ffScale, GAIN_SCALE_MIN, GAIN_SCALE_MAX),
        // Safety: cap at 1.0 — never recommend *less* D-term filtering (see note above).
        filterScale: clamp(filterScale, GAIN_SCALE_MIN, 1),
        sensitivityBinds,
        gainClamped,
        gainClampLimit,
        // True when no gain the sliders can express meets the robustness bound.
        // The craft is fragile beyond what one pass can repair, so the value
        // applied is the least bad rather than a compliant one.
        sensitivityUnreachable,
        // Peak sensitivity the recommendation is predicted to land at, reported so
        // the effect of applying it on robustness is visible rather than implied.
        predictedSensitivityPeakDb: 20 * Math.log10(peakSensitivityAtGain(tf, openLoop, finalPiScale)),
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
