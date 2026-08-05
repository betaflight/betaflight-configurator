import { beforeEach, describe, expect, it } from "vitest";
import FC from "../../src/js/fc";
import {
    calculateSimplifiedPidValues,
    calculateSimplifiedGyroFilterValues,
    calculateSimplifiedDtermFilterValues,
    applySimplifiedPids,
    applySimplifiedGyroFilters,
    applySimplifiedDtermFilters,
    validateVirtualSimplifiedTuning,
} from "../../src/js/simplifiedTuning";

const DEFAULT_FACTORS = {
    pidsMode: 2,
    masterMultiplier: 1,
    rollPitchRatio: 1,
    iGain: 1,
    dGain: 1,
    piGain: 1,
    dMaxGain: 1,
    feedforwardGain: 1,
    pitchPIGain: 1,
    gyroFilterMultiplier: 100,
    dtermFilterMultiplier: 100,
    gyroFilterEnabled: true,
    dtermFilterEnabled: true,
};

function enableFilterFeatureDetection() {
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 1;
    FC.FILTER_CONFIG.gyro_lowpass_hz = 1;
    FC.FILTER_CONFIG.gyro_lowpass2_hz = 1;
    FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = 1;
    FC.FILTER_CONFIG.dterm_lowpass_hz = 1;
    FC.FILTER_CONFIG.dterm_lowpass2_hz = 1;
}

describe("simplifiedTuning", () => {
    beforeEach(() => {
        FC.resetState();
    });

    describe("calculateSimplifiedPidValues", () => {
        it("returns no axes when pidsMode is 0", () => {
            expect(calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, pidsMode: 0 })).toEqual([]);
        });

        it("returns only roll and pitch axes when pidsMode is 1", () => {
            const axes = calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, pidsMode: 1 });
            expect(axes).toEqual([
                { P: 45, I: 80, D: 30, F: 120, dMax: 40 },
                { P: 47, I: 84, D: 34, F: 125, dMax: 46 },
            ]);
        });

        it("computes exact roll/pitch/yaw PID values for the default (1.0x) sliders", () => {
            const axes = calculateSimplifiedPidValues(DEFAULT_FACTORS);
            expect(axes).toEqual([
                { P: 45, I: 80, D: 30, F: 120, dMax: 40 },
                { P: 47, I: 84, D: 34, F: 125, dMax: 46 },
                { P: 45, I: 80, D: 0, F: 120, dMax: 0 },
            ]);
        });

        it("computes exact PID values for a low (0.5x) slider preset", () => {
            const factors = {
                ...DEFAULT_FACTORS,
                masterMultiplier: 0.5,
                rollPitchRatio: 0.5,
                iGain: 0.5,
                dGain: 0.5,
                piGain: 0.5,
                dMaxGain: 0.5,
                feedforwardGain: 0.5,
                pitchPIGain: 0.5,
            };
            const axes = calculateSimplifiedPidValues(factors);
            expect(axes).toEqual([
                { P: 11, I: 10, D: 7, F: 30, dMax: 8 },
                { P: 5, I: 5, D: 4, F: 15, dMax: 5 },
                { P: 11, I: 10, D: 0, F: 30, dMax: 0 },
            ]);
        });

        it("computes exact PID values for a high (1.8x) slider preset", () => {
            const factors = {
                ...DEFAULT_FACTORS,
                masterMultiplier: 1.8,
                rollPitchRatio: 1.8,
                iGain: 1.8,
                dGain: 1.8,
                piGain: 1.8,
                dMaxGain: 1.8,
                feedforwardGain: 1.8,
                pitchPIGain: 1.8,
            };
            const axes = calculateSimplifiedPidValues(factors);
            expect(axes).toEqual([
                { P: 145, I: 250, D: 97, F: 388, dMax: 155 },
                { P: 250, I: 250, D: 198, F: 729, dMax: 250 },
                { P: 145, I: 250, D: 0, F: 388, dMax: 0 },
            ]);
        });

        it("computes exact PID values for a mixed slider preset", () => {
            const factors = {
                ...DEFAULT_FACTORS,
                masterMultiplier: 1.2,
                piGain: 0.9,
                dGain: 1.3,
                iGain: 1.1,
                feedforwardGain: 0.8,
                dMaxGain: 0.6,
                rollPitchRatio: 0.7,
                pitchPIGain: 1.05,
            };
            const axes = calculateSimplifiedPidValues(factors);
            expect(axes).toEqual([
                { P: 48, I: 95, D: 46, F: 115, dMax: 56 },
                { P: 53, I: 104, D: 37, F: 126, dMax: 44 },
                { P: 48, I: 95, D: 0, F: 115, dMax: 0 },
            ]);
        });

        it("clamps every gain to its firmware-legal maximum at extreme slider values", () => {
            const factors = {
                ...DEFAULT_FACTORS,
                masterMultiplier: 10,
                piGain: 10,
                dGain: 10,
                iGain: 10,
                feedforwardGain: 10,
                dMaxGain: 10,
                rollPitchRatio: 10,
                pitchPIGain: 10,
            };
            const axes = calculateSimplifiedPidValues(factors);
            expect(axes).toEqual([
                { P: 250, I: 250, D: 250, F: 1000, dMax: 250 },
                { P: 250, I: 250, D: 250, F: 1000, dMax: 250 },
                { P: 250, I: 250, D: 0, F: 1000, dMax: 0 },
            ]);
        });

        it("truncates fractional results toward zero instead of rounding", () => {
            const factors = { ...DEFAULT_FACTORS, masterMultiplier: 1.011 };
            const axes = calculateSimplifiedPidValues(factors);
            expect(axes[0]).toEqual({ P: 45, I: 80, D: 30, F: 121, dMax: 40 });
        });

        it("scales roll-axis PID gains proportionally with the master multiplier", () => {
            const sweep = [0.5, 1.0, 1.5, 2.0].map(
                (masterMultiplier) => calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, masterMultiplier })[0],
            );
            expect(sweep).toEqual([
                { P: 22, I: 40, D: 15, F: 60, dMax: 20 },
                { P: 45, I: 80, D: 30, F: 120, dMax: 40 },
                { P: 67, I: 120, D: 45, F: 180, dMax: 60 },
                { P: 90, I: 160, D: 60, F: 240, dMax: 80 },
            ]);
        });

        it("never lowers the roll D term as the D gain slider rises", () => {
            const dValues = [0.5, 0.7, 1.0, 1.3, 1.8].map(
                (dGain) => calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, dGain })[0].D,
            );
            expect(dValues).toEqual([15, 21, 30, 39, 54]);
            for (let i = 1; i < dValues.length; i++) {
                expect(dValues[i]).toBeGreaterThanOrEqual(dValues[i - 1]);
            }
        });

        it("confines pitchPIGain to the pitch axis P/I/F terms", () => {
            const axes = calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, pitchPIGain: 0.5 });
            expect(axes).toEqual([
                { P: 45, I: 80, D: 30, F: 120, dMax: 40 },
                { P: 23, I: 42, D: 34, F: 62, dMax: 46 },
                { P: 45, I: 80, D: 0, F: 120, dMax: 0 },
            ]);
        });

        it("confines rollPitchRatio to the pitch axis D/dMax terms", () => {
            const axes = calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, rollPitchRatio: 0.5 });
            expect(axes).toEqual([
                { P: 45, I: 80, D: 30, F: 120, dMax: 40 },
                { P: 47, I: 84, D: 17, F: 125, dMax: 23 },
                { P: 45, I: 80, D: 0, F: 120, dMax: 0 },
            ]);
        });

        it("collapses dMax to exactly track D when dMaxGain is 0", () => {
            const axes = calculateSimplifiedPidValues({ ...DEFAULT_FACTORS, dMaxGain: 0 });
            expect(axes[0].dMax).toBe(axes[0].D);
            expect(axes[1].dMax).toBe(axes[1].D);
            expect(axes).toEqual([
                { P: 45, I: 80, D: 30, F: 120, dMax: 30 },
                { P: 47, I: 84, D: 34, F: 125, dMax: 34 },
                { P: 45, I: 80, D: 0, F: 120, dMax: 0 },
            ]);
        });

        it("keeps yaw dMax at 0 regardless of slider values, since the yaw dMax default is 0", () => {
            const factors = { ...DEFAULT_FACTORS, masterMultiplier: 1.8, dGain: 1.8, dMaxGain: 1.8 };
            expect(calculateSimplifiedPidValues(factors)[2].dMax).toBe(0);
        });
    });

    describe("calculateSimplifiedGyroFilterValues", () => {
        it("returns no keys when the FC filter config exposes no gyro lowpass fields", () => {
            expect(calculateSimplifiedGyroFilterValues(100)).toEqual({});
        });

        it("computes exact gyro filter cutoffs for the default (100) multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedGyroFilterValues(100)).toEqual({
                gyro_lowpass_dyn_min_hz: 250,
                gyro_lowpass_dyn_max_hz: 500,
                gyro_lowpass_hz: 250,
                gyro_lowpass2_hz: 500,
            });
        });

        it("computes exact gyro filter cutoffs for a half (50) multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedGyroFilterValues(50)).toEqual({
                gyro_lowpass_dyn_min_hz: 125,
                gyro_lowpass_dyn_max_hz: 250,
                gyro_lowpass_hz: 125,
                gyro_lowpass2_hz: 250,
            });
        });

        it("computes exact gyro filter cutoffs for a 150 multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedGyroFilterValues(150)).toEqual({
                gyro_lowpass_dyn_min_hz: 375,
                gyro_lowpass_dyn_max_hz: 750,
                gyro_lowpass_hz: 375,
                gyro_lowpass2_hz: 750,
            });
        });

        it("clamps gyro filter cutoffs to their max Hz at an extreme multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedGyroFilterValues(1000)).toEqual({
                gyro_lowpass_dyn_min_hz: 1000,
                gyro_lowpass_dyn_max_hz: 1000,
                gyro_lowpass_hz: 1000,
                gyro_lowpass2_hz: 1000,
            });
        });
    });

    describe("calculateSimplifiedDtermFilterValues", () => {
        it("returns no keys when the FC filter config exposes no dterm lowpass fields", () => {
            expect(calculateSimplifiedDtermFilterValues(100)).toEqual({});
        });

        it("computes exact dterm filter cutoffs for the default (100) multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedDtermFilterValues(100)).toEqual({
                dterm_lowpass_dyn_min_hz: 75,
                dterm_lowpass_dyn_max_hz: 150,
                dterm_lowpass_hz: 75,
                dterm_lowpass2_hz: 150,
            });
        });

        it("computes exact dterm filter cutoffs for a half (50) multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedDtermFilterValues(50)).toEqual({
                dterm_lowpass_dyn_min_hz: 37,
                dterm_lowpass_dyn_max_hz: 75,
                dterm_lowpass_hz: 37,
                dterm_lowpass2_hz: 75,
            });
        });

        it("clamps dterm filter cutoffs to their max Hz at an extreme multiplier", () => {
            enableFilterFeatureDetection();
            expect(calculateSimplifiedDtermFilterValues(1000)).toEqual({
                dterm_lowpass_dyn_min_hz: 750,
                dterm_lowpass_dyn_max_hz: 1000,
                dterm_lowpass_hz: 750,
                dterm_lowpass2_hz: 1000,
            });
        });
    });

    describe("applySimplifiedPids", () => {
        beforeEach(() => {
            Object.assign(FC.TUNING_SLIDERS, FC.DEFAULT_TUNING_SLIDERS);
        });

        it("writes derived PID/feedforward/dMax values onto FC.PIDS and FC.ADVANCED_TUNING", () => {
            applySimplifiedPids();
            expect(FC.PIDS.slice(0, 3)).toEqual([
                [45, 80, 30],
                [47, 84, 34],
                [45, 80, 0],
            ]);
            expect(FC.ADVANCED_TUNING.feedforwardRoll).toBe(120);
            expect(FC.ADVANCED_TUNING.feedforwardPitch).toBe(125);
            expect(FC.ADVANCED_TUNING.feedforwardYaw).toBe(120);
            expect(FC.ADVANCED_TUNING.dMaxRoll).toBe(40);
            expect(FC.ADVANCED_TUNING.dMaxPitch).toBe(46);
            expect(FC.ADVANCED_TUNING.dMaxYaw).toBe(0);
        });
    });

    describe("applySimplifiedGyroFilters / applySimplifiedDtermFilters", () => {
        beforeEach(() => {
            Object.assign(FC.TUNING_SLIDERS, FC.DEFAULT_TUNING_SLIDERS);
            enableFilterFeatureDetection();
        });

        it("writes derived cutoffs onto FC.FILTER_CONFIG for the default (100) multiplier", () => {
            applySimplifiedGyroFilters();
            applySimplifiedDtermFilters();
            expect(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz).toBe(250);
            expect(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz).toBe(500);
            expect(FC.FILTER_CONFIG.gyro_lowpass_hz).toBe(250);
            expect(FC.FILTER_CONFIG.gyro_lowpass2_hz).toBe(500);
            expect(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz).toBe(75);
            expect(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz).toBe(150);
            expect(FC.FILTER_CONFIG.dterm_lowpass_hz).toBe(75);
            expect(FC.FILTER_CONFIG.dterm_lowpass2_hz).toBe(150);
        });

        it("is a no-op for the gyro filter when its slider is disabled", () => {
            FC.TUNING_SLIDERS.slider_gyro_filter = 0;
            const before = { ...FC.FILTER_CONFIG };
            applySimplifiedGyroFilters();
            expect(FC.FILTER_CONFIG).toEqual(before);
        });

        it("is a no-op for the dterm filter when its slider is disabled", () => {
            FC.TUNING_SLIDERS.slider_dterm_filter = 0;
            const before = { ...FC.FILTER_CONFIG };
            applySimplifiedDtermFilters();
            expect(FC.FILTER_CONFIG).toEqual(before);
        });
    });

    describe("validateVirtualSimplifiedTuning", () => {
        beforeEach(() => {
            Object.assign(FC.TUNING_SLIDERS, FC.DEFAULT_TUNING_SLIDERS);
            enableFilterFeatureDetection();
            applySimplifiedPids();
            applySimplifiedGyroFilters();
            applySimplifiedDtermFilters();
        });

        it("marks pids/gyro/dterm all valid right after applying the sliders they were derived from", () => {
            validateVirtualSimplifiedTuning();
            expect(FC.TUNING_SLIDERS.slider_pids_valid).toBe(1);
            expect(FC.TUNING_SLIDERS.slider_gyro_valid).toBe(1);
            expect(FC.TUNING_SLIDERS.slider_dterm_valid).toBe(1);
        });

        it("marks only pids invalid when FC.PIDS is tampered with independently of the sliders", () => {
            FC.PIDS[0][0] = 1;
            validateVirtualSimplifiedTuning();
            expect(FC.TUNING_SLIDERS.slider_pids_valid).toBe(0);
            expect(FC.TUNING_SLIDERS.slider_gyro_valid).toBe(1);
            expect(FC.TUNING_SLIDERS.slider_dterm_valid).toBe(1);
        });

        it("marks only gyro invalid when FC.FILTER_CONFIG's gyro cutoff is tampered with independently of the sliders", () => {
            FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 999;
            validateVirtualSimplifiedTuning();
            expect(FC.TUNING_SLIDERS.slider_pids_valid).toBe(1);
            expect(FC.TUNING_SLIDERS.slider_gyro_valid).toBe(0);
            expect(FC.TUNING_SLIDERS.slider_dterm_valid).toBe(1);
        });
    });
});
