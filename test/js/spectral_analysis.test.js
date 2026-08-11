import { describe, expect, it } from "vitest";
import { openLoopResponse, recommendGains, PHASE_MARGIN_PRESETS } from "../../src/js/blackbox/spectral_analysis.js";

/**
 * Build a synthetic transfer function from an analytic open loop.
 *
 * Plant: L(jw) = K * e^(-jw*tau) / (jw)
 *   |L|  = K / w
 *   <L   = -90deg - w*tau (in degrees)
 *
 * An integrator plus pure delay is the standard first approximation of a rate
 * loop, and both crossover and phase margin are available in closed form, so
 * the recovered values can be checked against exact answers.
 */
function makeSyntheticTf({ crossoverHz, delayMs, maxHz = 500, binHz = 0.5, coherence = 1 }) {
    const K = 2 * Math.PI * crossoverHz; // |L| = 1 exactly at crossoverHz
    const tau = delayMs / 1000;
    const numBins = Math.floor(maxHz / binHz) + 1;

    const frequencies = new Float64Array(numBins);
    const magnitude = new Float64Array(numBins);
    const phase = new Float64Array(numBins);
    const coherenceArr = new Float64Array(numBins);
    const hReal = new Float64Array(numBins);
    const hImag = new Float64Array(numBins);

    for (let k = 0; k < numBins; k++) {
        const f = k * binHz;
        frequencies[k] = f;
        coherenceArr[k] = coherence;

        if (k === 0) {
            // DC: L is unbounded, T -> 1
            hReal[k] = 1;
            hImag[k] = 0;
            magnitude[k] = 0;
            phase[k] = 0;
            continue;
        }

        const w = 2 * Math.PI * f;
        const lMag = K / w;
        const lPhase = -Math.PI / 2 - w * tau;
        const lRe = lMag * Math.cos(lPhase);
        const lIm = lMag * Math.sin(lPhase);

        // T = L / (1 + L)
        const denRe = 1 + lRe;
        const denIm = lIm;
        const den = denRe * denRe + denIm * denIm;
        const tRe = (lRe * denRe + lIm * denIm) / den;
        const tIm = (lIm * denRe - lRe * denIm) / den;

        hReal[k] = tRe;
        hImag[k] = tIm;
        magnitude[k] = 20 * Math.log10(Math.hypot(tRe, tIm));
        phase[k] = Math.atan2(tIm, tRe) * (180 / Math.PI);
    }

    return { frequencies, magnitude, phase, coherence: coherenceArr, hReal, hImag };
}

const SLIDERS = {
    masterMultiplier: 1,
    piGain: 1,
    iGain: 1,
    dGain: 1,
    feedforwardGain: 1,
    dtermFilterMultiplier: 1,
};

describe("openLoopResponse", () => {
    it("recovers |L| = 1 at the true crossover", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const L = openLoopResponse(tf);
        const k = Math.round(20 / 0.5);
        expect(L.magnitude[k]).toBeCloseTo(1, 2);
    });

    it("recovers open-loop phase, not closed-loop phase", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const L = openLoopResponse(tf);
        const k = Math.round(20 / 0.5);
        // -90deg - w*tau at 20 Hz with tau = 3 ms
        const expected = -90 - 2 * Math.PI * 20 * 0.003 * (180 / Math.PI);
        expect(L.phase[k]).toBeCloseTo(expected, 1);
    });

    it("skips the ill-conditioned bins below 2 Hz where T approaches 1", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const L = openLoopResponse(tf);
        expect(tf.frequencies[L.startIndex]).toBeGreaterThanOrEqual(2);
        expect(Number.isNaN(L.magnitude[0])).toBe(true);
    });
});

describe("recommendGains phase margin", () => {
    it("reports the true open-loop phase margin", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS);
        // PM = 90 - w_c*tau, in degrees
        const expected = 90 - 2 * Math.PI * 20 * 0.003 * (180 / Math.PI);
        expect(analysis.openLoopCrossoverHz).toBeCloseTo(20, 0);
        expect(analysis.phaseMarginDeg).toBeCloseTo(expected, 0);
    });

    it("does not report a margin near 180 degrees for a stable craft", () => {
        // Regression guard. Deriving phase margin from the closed-loop response
        // at the closed-loop 0 dB crossing returned ~163 deg on real 5-inch
        // logs whose true margin was 60-78 deg.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS);
        expect(analysis.phaseMarginDeg).toBeLessThan(120);
    });

    it("estimates loop delay from the open-loop phase slope", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS);
        expect(analysis.loopDelayMs).toBeCloseTo(3, 1);
    });
});

describe("recommendGains gain scaling", () => {
    it("scales loop gain to place crossover at the target margin", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, 50);

        // Phase reaches -130 deg where w*tau = 40 deg
        const wStar = (40 * Math.PI) / 180 / 0.003;
        const fStar = wStar / (2 * Math.PI);
        expect(analysis.targetCrossoverHz).toBeCloseTo(fStar, 0);

        // |L| = K/w, so the gain needed to move crossover to w* is w*/K
        expect(analysis.gainToTarget).toBeCloseTo(wStar / (2 * Math.PI * 20), 1);
    });

    it("is self-calibrating across airframes: a slower craft gets a lower target", () => {
        const fast = recommendGains(makeSyntheticTf({ crossoverHz: 20, delayMs: 2 }), SLIDERS, 50).analysis;
        const slow = recommendGains(makeSyntheticTf({ crossoverHz: 20, delayMs: 8 }), SLIDERS, 50).analysis;
        // More loop delay must lower the achievable crossover, with no
        // airframe size passed in anywhere.
        expect(slow.targetCrossoverHz).toBeLessThan(fast.targetCrossoverHz);
    });

    it("holds gain when the phase never reaches the margin limit in band", () => {
        // Very low delay: phase stays above -130 deg across the whole sweep,
        // so there is no measured basis for a gain change.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 0, maxHz: 40 });
        const { analysis } = recommendGains(tf, SLIDERS, 50);
        expect(Number.isNaN(analysis.targetCrossoverHz)).toBe(true);
        expect(analysis.piScale).toBe(1);
    });
});

describe("phase margin presets", () => {
    it("orders the presets from sharpest to softest", () => {
        expect(PHASE_MARGIN_PRESETS.AGGRESSIVE).toBeLessThan(PHASE_MARGIN_PRESETS.NORMAL);
        expect(PHASE_MARGIN_PRESETS.NORMAL).toBeLessThan(PHASE_MARGIN_PRESETS.CONSERVATIVE);
    });

    it("asks for more gain the sharper the target", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const aggressive = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.AGGRESSIVE).analysis;
        const normal = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL).analysis;
        const conservative = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.CONSERVATIVE).analysis;

        expect(aggressive.piScale).toBeGreaterThan(normal.piScale);
        expect(normal.piScale).toBeGreaterThan(conservative.piScale);
        expect(aggressive.targetCrossoverHz).toBeGreaterThan(conservative.targetCrossoverHz);
    });

    it("keeps every preset reachable on a craft with a typical phase peak", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        for (const target of Object.values(PHASE_MARGIN_PRESETS)) {
            const { analysis } = recommendGains(tf, SLIDERS, target);
            expect(Number.isFinite(analysis.targetCrossoverHz)).toBe(true);
        }
    });
});

describe("achievable phase margin ceiling", () => {
    it("reports the ceiling set by the open-loop phase peak", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS);
        // Phase peaks at the bottom of the analysed band (2 Hz) for this plant:
        // PM_max = 180 + (-90 - w*tau)
        const expected = 90 - 2 * Math.PI * 2 * 0.003 * (180 / Math.PI);
        expect(analysis.maxAchievablePhaseMarginDeg).toBeCloseTo(expected, 0);
    });

    it("holds the gain when the target exceeds the ceiling", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, 95);
        expect(analysis.maxAchievablePhaseMarginDeg).toBeLessThan(95);
        expect(Number.isNaN(analysis.targetCrossoverHz)).toBe(true);
        expect(analysis.piScale).toBe(1);
    });
});

describe("recommendGains safety", () => {
    it("holds D rather than driving it to the clamp", () => {
        // The previous rule returned dScale 0.5 on 6 of 6 axis-flights across
        // two independent 5-inch logs, regardless of the craft.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis, proposed } = recommendGains(tf, SLIDERS, 50);
        expect(analysis.dScale).toBe(1);
        expect(proposed.slider_d_gain).toBe(100);
    });

    it("never recommends less D-term filtering", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, 50);
        expect(analysis.filterScale).toBeLessThanOrEqual(1);
    });

    it("keeps every scale within the per-pass clamp", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, 50);
        for (const key of ["piScale", "iScale", "ffScale"]) {
            expect(analysis[key]).toBeGreaterThanOrEqual(0.5);
            expect(analysis[key]).toBeLessThanOrEqual(2);
        }
    });
});
