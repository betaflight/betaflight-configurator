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

/**
 * Client-side port of betaflight/src/main/config/simplified_tuning.c for virtual mode.
 */

import FC from "./fc";
import type { TuningSliders } from "../stores/fc.types";

/** The tuning-slider values decoded into the multipliers the firmware maths uses. */
export interface SliderFactors {
    pidsMode: number;
    masterMultiplier: number;
    rollPitchRatio: number;
    iGain: number;
    dGain: number;
    piGain: number;
    dMaxGain: number;
    feedforwardGain: number;
    pitchPIGain: number;
    gyroFilterMultiplier: number;
    dtermFilterMultiplier: number;
    gyroFilterEnabled: boolean;
    dtermFilterEnabled: boolean;
}

/** The PID gains computed for one axis. */
export interface AxisPidValues {
    P: number;
    I: number;
    D: number;
    F: number;
    dMax: number;
}

/** Gyro low-pass values, keyed as FILTER_CONFIG holds them; only the enabled filters are set. */
export interface GyroFilterValues {
    gyro_lowpass_dyn_min_hz?: number;
    gyro_lowpass_dyn_max_hz?: number;
    gyro_lowpass_hz?: number;
    gyro_lowpass2_hz?: number;
}

/** D-term low-pass values, keyed as FILTER_CONFIG holds them; only the enabled filters are set. */
export interface DtermFilterValues {
    dterm_lowpass_dyn_min_hz?: number;
    dterm_lowpass_dyn_max_hz?: number;
    dterm_lowpass_hz?: number;
    dterm_lowpass2_hz?: number;
}

const PID_GAIN_MAX = 250;
const F_GAIN_MAX = 1000;
const DYN_LPF_MAX_HZ = 1000;
const LPF_MAX_HZ = 1000;

const GYRO_LPF1_DYN_MIN_HZ_DEFAULT = 250;
const GYRO_LPF1_DYN_MAX_HZ_DEFAULT = 500;
const GYRO_LPF2_HZ_DEFAULT = 500;

const DTERM_LPF1_DYN_MIN_HZ_DEFAULT = 75;
const DTERM_LPF1_DYN_MAX_HZ_DEFAULT = 150;
const DTERM_LPF2_HZ_DEFAULT = 150;

const PID_DEFAULTS = [
    { P: 45, I: 80, D: 30, F: 120 },
    { P: 47, I: 84, D: 34, F: 125 },
    { P: 45, I: 80, D: 0, F: 120 },
];

const D_MAX_DEFAULT = [40, 46, 0];

const FEEDFORWARD_KEYS = ["feedforwardRoll", "feedforwardPitch", "feedforwardYaw"] as const;
const DMAX_KEYS = ["dMaxRoll", "dMaxPitch", "dMaxYaw"] as const;

// The firmware's constrain() takes int arguments, so a float result is
// truncated toward zero before clamping (see common/maths.h). Mirror that here
// so virtual-mode PID/filter values match what a real FC computes.
function constrain(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function sliderFactorsFromTuningSliders(sliders: TuningSliders = FC.TUNING_SLIDERS): SliderFactors {
    return {
        pidsMode: sliders.slider_pids_mode,
        masterMultiplier: sliders.slider_master_multiplier / 100,
        rollPitchRatio: sliders.slider_roll_pitch_ratio / 100,
        iGain: sliders.slider_i_gain / 100,
        dGain: sliders.slider_d_gain / 100,
        piGain: sliders.slider_pi_gain / 100,
        dMaxGain: sliders.slider_dmax_gain / 100,
        feedforwardGain: sliders.slider_feedforward_gain / 100,
        pitchPIGain: sliders.slider_pitch_pi_gain / 100,
        gyroFilterMultiplier: sliders.slider_gyro_filter_multiplier,
        dtermFilterMultiplier: sliders.slider_dterm_filter_multiplier,
        gyroFilterEnabled: !!sliders.slider_gyro_filter,
        dtermFilterEnabled: !!sliders.slider_dterm_filter,
    };
}

function calculateAxisPidValues(factors: SliderFactors, axis: number): AxisPidValues {
    const defaults = PID_DEFAULTS[axis];
    const dMaxDefault = D_MAX_DEFAULT[axis];
    const pitchDGain = axis === 1 ? factors.rollPitchRatio : 1;
    const pitchPiGain = axis === 1 ? factors.pitchPIGain : 1;

    const P = constrain(defaults.P * factors.masterMultiplier * factors.piGain * pitchPiGain, 0, PID_GAIN_MAX);
    const I = constrain(
        defaults.I * factors.masterMultiplier * factors.piGain * factors.iGain * pitchPiGain,
        0,
        PID_GAIN_MAX,
    );
    const D = constrain(defaults.D * factors.masterMultiplier * factors.dGain * pitchDGain, 0, PID_GAIN_MAX);
    const F = constrain(defaults.F * factors.masterMultiplier * pitchPiGain * factors.feedforwardGain, 0, F_GAIN_MAX);

    let dMax = 0;
    if (dMaxDefault > 0) {
        const dMaxScale = factors.dMaxGain + (1 - factors.dMaxGain) * (defaults.D / dMaxDefault);
        dMax = constrain(
            dMaxDefault * factors.masterMultiplier * factors.dGain * pitchDGain * dMaxScale,
            0,
            PID_GAIN_MAX,
        );
    }

    return { P, I, D, F, dMax };
}

export function calculateSimplifiedPidValues(factors: SliderFactors): AxisPidValues[] {
    if (!factors.pidsMode) {
        return [];
    }

    const axes: AxisPidValues[] = [];
    for (let axis = 0; axis <= factors.pidsMode; axis++) {
        axes.push(calculateAxisPidValues(factors, axis));
    }
    return axes;
}

// `multiplier` is the integer slider value (e.g. 100 = 1.0x), matching the
// firmware's simplified_gyro_filter_multiplier. The firmware uses integer
// arithmetic (DEFAULT * multiplier / 100), which the truncating constrain()
// reproduces.
export function calculateSimplifiedGyroFilterValues(multiplier: number): GyroFilterValues {
    const result: GyroFilterValues = {};
    if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz) {
        result.gyro_lowpass_dyn_min_hz = constrain(
            (GYRO_LPF1_DYN_MIN_HZ_DEFAULT * multiplier) / 100,
            0,
            DYN_LPF_MAX_HZ,
        );
        result.gyro_lowpass_dyn_max_hz = constrain(
            (GYRO_LPF1_DYN_MAX_HZ_DEFAULT * multiplier) / 100,
            0,
            DYN_LPF_MAX_HZ,
        );
    }
    if (FC.FILTER_CONFIG.gyro_lowpass_hz) {
        result.gyro_lowpass_hz = constrain((GYRO_LPF1_DYN_MIN_HZ_DEFAULT * multiplier) / 100, 0, DYN_LPF_MAX_HZ);
    }
    if (FC.FILTER_CONFIG.gyro_lowpass2_hz) {
        result.gyro_lowpass2_hz = constrain((GYRO_LPF2_HZ_DEFAULT * multiplier) / 100, 0, LPF_MAX_HZ);
    }
    return result;
}

// `multiplier` is the integer slider value (e.g. 100 = 1.0x), matching the
// firmware's simplified_dterm_filter_multiplier.
export function calculateSimplifiedDtermFilterValues(multiplier: number): DtermFilterValues {
    const result: DtermFilterValues = {};
    if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz) {
        result.dterm_lowpass_dyn_min_hz = constrain(
            (DTERM_LPF1_DYN_MIN_HZ_DEFAULT * multiplier) / 100,
            0,
            DYN_LPF_MAX_HZ,
        );
        result.dterm_lowpass_dyn_max_hz = constrain(
            (DTERM_LPF1_DYN_MAX_HZ_DEFAULT * multiplier) / 100,
            0,
            DYN_LPF_MAX_HZ,
        );
    }
    if (FC.FILTER_CONFIG.dterm_lowpass_hz) {
        result.dterm_lowpass_hz = constrain((DTERM_LPF1_DYN_MIN_HZ_DEFAULT * multiplier) / 100, 0, DYN_LPF_MAX_HZ);
    }
    if (FC.FILTER_CONFIG.dterm_lowpass2_hz) {
        result.dterm_lowpass2_hz = constrain((DTERM_LPF2_HZ_DEFAULT * multiplier) / 100, 0, LPF_MAX_HZ);
    }
    return result;
}

export function applySimplifiedPids(sliders: TuningSliders = FC.TUNING_SLIDERS): void {
    const factors = sliderFactorsFromTuningSliders(sliders);
    const axes = calculateSimplifiedPidValues(factors);

    for (let axis = 0; axis < axes.length; axis++) {
        const { P, I, D, F, dMax } = axes[axis];
        FC.PIDS[axis][0] = P;
        FC.PIDS[axis][1] = I;
        FC.PIDS[axis][2] = D;
        FC.ADVANCED_TUNING[FEEDFORWARD_KEYS[axis]] = F;
        FC.ADVANCED_TUNING[DMAX_KEYS[axis]] = dMax;
    }
}

export function applySimplifiedGyroFilters(sliders: TuningSliders = FC.TUNING_SLIDERS): void {
    if (!sliders.slider_gyro_filter) {
        return;
    }
    Object.assign(FC.FILTER_CONFIG, calculateSimplifiedGyroFilterValues(sliders.slider_gyro_filter_multiplier));
}

export function applySimplifiedDtermFilters(sliders: TuningSliders = FC.TUNING_SLIDERS): void {
    if (!sliders.slider_dterm_filter) {
        return;
    }
    Object.assign(FC.FILTER_CONFIG, calculateSimplifiedDtermFilterValues(sliders.slider_dterm_filter_multiplier));
}

export function validateVirtualSimplifiedTuning(): void {
    const factors = sliderFactorsFromTuningSliders();
    let pidsValid = true;

    if (factors.pidsMode > 0) {
        const expected = calculateSimplifiedPidValues(factors);
        for (let axis = 0; axis < expected.length; axis++) {
            const { P, I, D, F, dMax } = expected[axis];
            pidsValid =
                pidsValid &&
                FC.PIDS[axis][0] === P &&
                FC.PIDS[axis][1] === I &&
                FC.PIDS[axis][2] === D &&
                FC.ADVANCED_TUNING[FEEDFORWARD_KEYS[axis]] === F &&
                FC.ADVANCED_TUNING[DMAX_KEYS[axis]] === dMax;
        }
    }

    let gyroValid = true;
    if (factors.gyroFilterEnabled) {
        const expected = calculateSimplifiedGyroFilterValues(factors.gyroFilterMultiplier);
        gyroValid =
            (!expected.gyro_lowpass_hz || FC.FILTER_CONFIG.gyro_lowpass_hz === expected.gyro_lowpass_hz) &&
            (!expected.gyro_lowpass2_hz || FC.FILTER_CONFIG.gyro_lowpass2_hz === expected.gyro_lowpass2_hz) &&
            (!expected.gyro_lowpass_dyn_min_hz ||
                FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz === expected.gyro_lowpass_dyn_min_hz) &&
            (!expected.gyro_lowpass_dyn_max_hz ||
                FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz === expected.gyro_lowpass_dyn_max_hz);
    }

    let dtermValid = true;
    if (factors.dtermFilterEnabled) {
        const expected = calculateSimplifiedDtermFilterValues(factors.dtermFilterMultiplier);
        dtermValid =
            (!expected.dterm_lowpass_hz || FC.FILTER_CONFIG.dterm_lowpass_hz === expected.dterm_lowpass_hz) &&
            (!expected.dterm_lowpass2_hz || FC.FILTER_CONFIG.dterm_lowpass2_hz === expected.dterm_lowpass2_hz) &&
            (!expected.dterm_lowpass_dyn_min_hz ||
                FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz === expected.dterm_lowpass_dyn_min_hz) &&
            (!expected.dterm_lowpass_dyn_max_hz ||
                FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz === expected.dterm_lowpass_dyn_max_hz);
    }

    FC.TUNING_SLIDERS.slider_pids_valid = pidsValid ? 1 : 0;
    FC.TUNING_SLIDERS.slider_gyro_valid = gyroValid ? 1 : 0;
    FC.TUNING_SLIDERS.slider_dterm_valid = dtermValid ? 1 : 0;
}
