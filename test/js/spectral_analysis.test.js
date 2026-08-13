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
/**
 * Optionally adds a lightly damped second-order mode at `resonanceHz`, which
 * puts a close approach to -1 above crossover. A plain integrator-plus-delay
 * cannot exercise the sensitivity bound: its Nyquist curve is closest to -1 at
 * crossover, so holding phase margin there is enough and Ms never binds. Real
 * craft are not like that — the D term's lead lifts the phase around 10 Hz and
 * the loop then rolls off steeply, so the peak sensitivity sits well above
 * crossover.
 */
function makeSyntheticTf({
    crossoverHz,
    delayMs,
    maxHz = 500,
    binHz = 0.5,
    coherence = 1,
    resonanceHz = 0,
    resonanceZeta = 0.1,
}) {
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
        let lRe = lMag * Math.cos(lPhase);
        let lIm = lMag * Math.sin(lPhase);

        if (resonanceHz > 0) {
            // Multiply by wn^2 / (wn^2 - w^2 + j·2ζ·wn·w)
            const wn = 2 * Math.PI * resonanceHz;
            const dRe = wn * wn - w * w;
            const dIm = 2 * resonanceZeta * wn * w;
            const dMagSq = dRe * dRe + dIm * dIm;
            const nRe = wn * wn;
            const rRe = (nRe * dRe) / dMagSq;
            const rIm = (-nRe * dIm) / dMagSq;
            const re = lRe * rRe - lIm * rIm;
            const im = lRe * rIm + lIm * rRe;
            lRe = re;
            lIm = im;
        }

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

describe("coherence gate", () => {
    it("rejects bins below the coherence threshold and holds the gain", () => {
        // Same plant, but the measurement is noise. Nothing should be inferred
        // from it: no crossover, no margin, and no gain change.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3, coherence: 0.2 });
        const { analysis, proposed } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL);

        expect(Number.isNaN(analysis.openLoopCrossoverHz)).toBe(true);
        expect(Number.isNaN(analysis.phaseMarginDeg)).toBe(true);
        expect(Number.isNaN(analysis.targetCrossoverHz)).toBe(true);
        expect(analysis.piScale).toBe(1);
        expect(proposed.slider_pi_gain).toBe(100);
    });

    it("accepts the same measurement once coherence is above the gate", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3, coherence: 0.9 });
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL);
        expect(Number.isFinite(analysis.openLoopCrossoverHz)).toBe(true);
        expect(Number.isFinite(analysis.targetCrossoverHz)).toBe(true);
    });
});

describe("peak sensitivity bound", () => {
    const FRAGILE = { crossoverHz: 20, delayMs: 3, resonanceHz: 70, resonanceZeta: 0.2 };

    it("never proposes a gain above what the sensitivity bound allows", () => {
        for (const target of Object.values(PHASE_MARGIN_PRESETS)) {
            const { analysis } = recommendGains(makeSyntheticTf(FRAGILE), SLIDERS, target);
            expect(analysis.piScale).toBeLessThanOrEqual(analysis.sensitivityLimitedGain + 1e-6);
        }
    });

    it("keeps predicted peak sensitivity inside the bound", () => {
        const { analysis } = recommendGains(makeSyntheticTf(FRAGILE), SLIDERS, PHASE_MARGIN_PRESETS.AGGRESSIVE);
        // 2.0 linear is ~6.02 dB
        expect(analysis.predictedSensitivityPeakDb).toBeLessThanOrEqual(6.1);
    });

    it("holds the gain below the margin target when robustness binds", () => {
        const tf = makeSyntheticTf(FRAGILE);
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.AGGRESSIVE);
        expect(analysis.sensitivityBinds).toBe(true);
        expect(analysis.piScale).toBeLessThan(analysis.gainToTarget);
    });

    it("leaves the margin target in charge when robustness is not the limit", () => {
        // No resonance: closest approach to -1 is at crossover, so holding phase
        // margin there is sufficient and Ms never binds.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL);
        expect(analysis.sensitivityBinds).toBe(false);
        expect(analysis.piScale).toBeCloseTo(analysis.gainToTarget, 2);
    });
});

describe("D recommendation", () => {
    it("raises D only when the sensitivity bound is what stopped the gain", () => {
        const fragile = recommendGains(
            makeSyntheticTf({ crossoverHz: 20, delayMs: 3, resonanceHz: 70, resonanceZeta: 0.2 }),
            SLIDERS,
            PHASE_MARGIN_PRESETS.AGGRESSIVE,
        ).analysis;
        expect(fragile.sensitivityBinds).toBe(true);
        expect(fragile.dScale).toBeGreaterThan(1);

        const clean = recommendGains(
            makeSyntheticTf({ crossoverHz: 20, delayMs: 3 }),
            SLIDERS,
            PHASE_MARGIN_PRESETS.NORMAL,
        ).analysis;
        expect(clean.sensitivityBinds).toBe(false);
        expect(clean.dScale).toBe(1);
    });

    it("never reduces D", () => {
        // A chirp cannot see the broadband noise that D amplifies, so there is no
        // evidence on which to ask for less of it.
        for (const cfg of [
            { crossoverHz: 20, delayMs: 3 },
            { crossoverHz: 20, delayMs: 8 },
            { crossoverHz: 20, delayMs: 3, resonanceHz: 70, resonanceZeta: 0.2 },
            { crossoverHz: 40, delayMs: 2, resonanceHz: 120, resonanceZeta: 0.05 },
        ]) {
            for (const target of Object.values(PHASE_MARGIN_PRESETS)) {
                const { analysis } = recommendGains(makeSyntheticTf(cfg), SLIDERS, target);
                expect(analysis.dScale).toBeGreaterThanOrEqual(1);
            }
        }
    });

    it("caps a single pass's D increase", () => {
        const { analysis } = recommendGains(
            makeSyntheticTf({ crossoverHz: 20, delayMs: 3, resonanceHz: 70, resonanceZeta: 0.05 }),
            SLIDERS,
            PHASE_MARGIN_PRESETS.AGGRESSIVE,
        );
        expect(analysis.dScale).toBeLessThanOrEqual(1.25);
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
