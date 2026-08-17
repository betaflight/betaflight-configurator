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
    // [[frequencyHz, coherence, hReal, hImag], ...] — overwrite individual bins
    // to model a log that is clean apart from a few bad ones.
    badBins = [],
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

    for (const [freqHz, coh, re, im] of badBins) {
        const k = Math.round(freqHz / binHz);
        coherenceArr[k] = coh;
        hReal[k] = re;
        hImag[k] = im;
        magnitude[k] = 20 * Math.log10(Math.hypot(re, im));
        phase[k] = Math.atan2(im, re) * (180 / Math.PI);
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

    it("keeps one noisy bin out of the unwrap chain", () => {
        // The unwrap offset is cumulative, so a single bin far enough from its
        // neighbours applies a +/-360 that then persists into every bin above it,
        // including bins whose own coherence is fine. Gating at the point of use
        // is not enough; the bad bin has to be kept out of the chain itself.
        // T = 0.2 + 0.3i at 12 Hz is an ordinary noisy-bin value and shifted
        // everything above it by a full turn.
        const clean = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const dirty = makeSyntheticTf({ crossoverHz: 20, delayMs: 3, badBins: [[12, 0.05, 0.2, 0.3]] });

        const cleanL = openLoopResponse(clean);
        const dirtyL = openLoopResponse(dirty);

        const at50 = Math.round(50 / 0.5);
        const at200 = Math.round(200 / 0.5);
        expect(dirtyL.phase[at50]).toBeCloseTo(cleanL.phase[at50], 6);
        expect(dirtyL.phase[at200]).toBeCloseTo(cleanL.phase[at200], 6);

        // The bad bin itself contributes nothing rather than a wrong value.
        expect(Number.isNaN(dirtyL.phase[Math.round(12 / 0.5)])).toBe(true);
    });

    it("leaves every reported metric unchanged when a bin goes noisy", () => {
        const clean = recommendGains(makeSyntheticTf({ crossoverHz: 20, delayMs: 3 }), SLIDERS).analysis;
        const dirty = recommendGains(
            makeSyntheticTf({ crossoverHz: 20, delayMs: 3, badBins: [[12, 0.05, 0.2, 0.3]] }),
            SLIDERS,
        ).analysis;

        for (const key of [
            "openLoopCrossoverHz",
            "phaseMarginDeg",
            "targetCrossoverHz",
            "maxAchievablePhaseMarginDeg",
            "loopDelayMs",
            "piScale",
        ]) {
            expect(dirty[key]).toBeCloseTo(clean[key], 6);
        }
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

    it("holds every slider on a log that was never coherent, filtering included", () => {
        // The D-term filter recommendation has its own path to the sliders and
        // needs its own guard. findNoiseFloor() looks for where coherence falls
        // away; on a log where it was never there, the first bin above 20 Hz
        // qualifies, which read as a 20 Hz noise floor and cut the D-term filter
        // multiplier to its 0.5 clamp — a clamp presented as a measurement, the
        // same defect as the D rule this file replaced.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3, coherence: 0.2 });
        const { analysis, proposed } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL);

        expect(Number.isNaN(analysis.noiseFloorHz)).toBe(true);
        expect(analysis.filterScale).toBe(1);
        for (const key of Object.keys(proposed)) {
            expect(proposed[key]).toBe(100);
        }
    });

    it("still finds the noise floor once the sweep is coherent below it", () => {
        // Coherent to 60 Hz, noise above. That is a real floor and must still
        // tighten filtering.
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        for (let k = 0; k < tf.frequencies.length; k++) {
            if (tf.frequencies[k] > 60) {
                tf.coherence[k] = 0.1;
            }
        }
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL);
        expect(analysis.noiseFloorHz).toBeCloseTo(60.5, 1);
        expect(analysis.filterScale).toBeLessThan(1);
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

    it("never returns a gain it has not checked against the bound", () => {
        // Ms is not monotonic in gain. On this craft the lightly damped 40 Hz
        // mode sits where reducing gain brings |L| back towards 1 with the phase
        // already past -180, so Ms is 2.66 at gain 0.5 against 1.16 at gain 1.0.
        // An upward scan that breaks at the first violation seeded its answer
        // with GAIN_SCALE_MIN and returned it without ever evaluating it —
        // reporting the worst gain in range as the robustness bound.
        const tf = makeSyntheticTf({ crossoverHz: 15, delayMs: 3, resonanceHz: 40, resonanceZeta: 0.05 });
        for (const target of Object.values(PHASE_MARGIN_PRESETS)) {
            const { analysis } = recommendGains(tf, SLIDERS, target);
            expect(analysis.predictedSensitivityPeakDb).toBeLessThanOrEqual(6.1);
            expect(analysis.piScale).toBeGreaterThan(0.5);
        }
    });

    it("reports when the per-pass clamp stops the recommendation being delivered", () => {
        // A craft far below its crossover limit asks for more than a 2x change,
        // which one pass of the sliders cannot express. targetCrossoverHz is
        // still the craft's limit, but the applied gain does not reach it, so
        // that has to be visible rather than implied.
        const tf = makeSyntheticTf({ crossoverHz: 3, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.AGGRESSIVE);

        expect(analysis.gainClamped).toBe(true);
        expect(analysis.requestedGain).toBeGreaterThan(2);
        expect(analysis.gainClampLimit).toBe(2);
        expect(analysis.piScale).toBe(2);
    });

    it("reports the lower bound when the craft is asked to back off past it", () => {
        // The clamp bites at both ends. A craft running far more gain than its
        // delay supports asks for a large reduction, and the bound that holds it
        // is GAIN_SCALE_MIN — quoting the 2x upper bound there would be nonsense.
        const tf = makeSyntheticTf({ crossoverHz: 200, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.CONSERVATIVE);

        expect(analysis.gainClamped).toBe(true);
        expect(analysis.requestedGain).toBeLessThan(0.5);
        expect(analysis.gainClampLimit).toBe(0.5);
        expect(analysis.piScale).toBe(0.5);
    });

    it("does not report a clamp when the recommendation fits in one pass", () => {
        const tf = makeSyntheticTf({ crossoverHz: 20, delayMs: 3 });
        const { analysis } = recommendGains(tf, SLIDERS, PHASE_MARGIN_PRESETS.NORMAL);
        expect(analysis.gainClamped).toBe(false);
        expect(analysis.sensitivityUnreachable).toBe(false);
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
    it("holds D, including when robustness is what limited the gain", () => {
        // D is the other lever in principle, but it only adds lead below its own
        // filter cutoff, its real limit is noise a chirp cannot see, and
        // slider_d_gain is one value across axes while this analysis is per-axis
        // (yaw conventionally runs no D at all). The gain reduction carries the
        // correction instead.
        for (const cfg of [
            { crossoverHz: 20, delayMs: 3 },
            { crossoverHz: 20, delayMs: 8 },
            { crossoverHz: 20, delayMs: 3, resonanceHz: 70, resonanceZeta: 0.2 },
            { crossoverHz: 40, delayMs: 2, resonanceHz: 120, resonanceZeta: 0.05 },
        ]) {
            for (const target of Object.values(PHASE_MARGIN_PRESETS)) {
                const { analysis, proposed } = recommendGains(makeSyntheticTf(cfg), SLIDERS, target);
                expect(analysis.dScale).toBe(1);
                expect(proposed.slider_d_gain).toBe(100);
            }
        }
    });

    it("still reports which constraint limited the gain", () => {
        const fragile = recommendGains(
            makeSyntheticTf({ crossoverHz: 20, delayMs: 3, resonanceHz: 70, resonanceZeta: 0.2 }),
            SLIDERS,
            PHASE_MARGIN_PRESETS.AGGRESSIVE,
        ).analysis;
        expect(fragile.sensitivityBinds).toBe(true);

        const clean = recommendGains(makeSyntheticTf({ crossoverHz: 20, delayMs: 3 }), SLIDERS).analysis;
        expect(clean.sensitivityBinds).toBe(false);
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
