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

import FC from "@/js/fc";
import MSP, { type MspResponse } from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import CONFIGURATOR from "@/js/data_storage";
import {
    applySimplifiedPids,
    applySimplifiedGyroFilters,
    applySimplifiedDtermFilters,
    validateVirtualSimplifiedTuning,
} from "@/js/simplifiedTuning";

// ── Constants ────────────────────────────────────────────────────────────────

export const NON_EXPERT_SLIDER_MIN = 70;
export const NON_EXPERT_SLIDER_MAX = 140;
export const NON_EXPERT_SLIDER_MIN_GYRO = 50;
export const NON_EXPERT_SLIDER_MAX_GYRO = 150;
export const NON_EXPERT_SLIDER_MIN_DTERM = 80;
export const NON_EXPERT_SLIDER_MAX_DTERM = 120;

// ── Types ────────────────────────────────────────────────────────────────────

/** PID slider positions as the UI shows them: gains as decimals (0.0-2.0), the mode as-is. */
export interface PidSliderPositions {
    pidsMode: number;
    dGain: number;
    piGain: number;
    feedforwardGain: number;
    dMaxGain: number;
    iGain: number;
    rollPitchRatio: number;
    pitchPIGain: number;
    masterMultiplier: number;
}

export interface GyroFilterSliderPosition {
    sliderGyroFilter: number;
    sliderGyroFilterMultiplier: number;
}

export interface DTermFilterSliderPosition {
    sliderDTermFilter: number;
    sliderDTermFilterMultiplier: number;
}

// ── Pure utilities ───────────────────────────────────────────────────────────

export function scaleSliderValue(value: number): number {
    if (value > 1) {
        return Math.round(((value - 1) * 2 + 1) * 10) / 10;
    }
    return value;
}

export function downscaleSliderValue(value: number): number {
    if (value > 1) {
        return (value - 1) / 2 + 1;
    }
    return value;
}

// ── Initialization helpers (read FC.TUNING_SLIDERS → plain objects) ──────────

export function readPidSliderPositions(): PidSliderPositions {
    return {
        pidsMode: FC.TUNING_SLIDERS.slider_pids_mode,
        dGain: FC.TUNING_SLIDERS.slider_d_gain / 100,
        piGain: FC.TUNING_SLIDERS.slider_pi_gain / 100,
        feedforwardGain: FC.TUNING_SLIDERS.slider_feedforward_gain / 100,
        dMaxGain: FC.TUNING_SLIDERS.slider_dmax_gain / 100,
        iGain: FC.TUNING_SLIDERS.slider_i_gain / 100,
        rollPitchRatio: FC.TUNING_SLIDERS.slider_roll_pitch_ratio / 100,
        pitchPIGain: FC.TUNING_SLIDERS.slider_pitch_pi_gain / 100,
        masterMultiplier: FC.TUNING_SLIDERS.slider_master_multiplier / 100,
    };
}

export function readGyroFilterSliderPosition(): GyroFilterSliderPosition {
    return {
        sliderGyroFilter: FC.TUNING_SLIDERS.slider_gyro_filter,
        sliderGyroFilterMultiplier: FC.TUNING_SLIDERS.slider_gyro_filter_multiplier / 100,
    };
}

export function readDTermFilterSliderPosition(): DTermFilterSliderPosition {
    return {
        sliderDTermFilter: FC.TUNING_SLIDERS.slider_dterm_filter,
        sliderDTermFilterMultiplier: FC.TUNING_SLIDERS.slider_dterm_filter_multiplier / 100,
    };
}

// ── MSP actions ──────────────────────────────────────────────────────────────

/**
 * Write slider values to FC.TUNING_SLIDERS and ask the FC to compute the
 * resulting PID values.  Returns a promise that resolves after FC.PIDS and
 * FC.ADVANCED_TUNING have been updated by the MSP response handler.
 *
 * @param s  Slider values (all decimals 0.0-2.0)
 */
export function calculateNewPids(s: PidSliderPositions): Promise<MspResponse | undefined> {
    FC.TUNING_SLIDERS.slider_pids_mode = s.pidsMode;
    FC.TUNING_SLIDERS.slider_d_gain = Math.round(s.dGain * 100);
    FC.TUNING_SLIDERS.slider_pi_gain = Math.round(s.piGain * 100);
    FC.TUNING_SLIDERS.slider_feedforward_gain = Math.round(s.feedforwardGain * 100);
    FC.TUNING_SLIDERS.slider_dmax_gain = Math.round(s.dMaxGain * 100);
    FC.TUNING_SLIDERS.slider_i_gain = Math.round(s.iGain * 100);
    FC.TUNING_SLIDERS.slider_roll_pitch_ratio = Math.round(s.rollPitchRatio * 100);
    FC.TUNING_SLIDERS.slider_pitch_pi_gain = Math.round(s.pitchPIGain * 100);
    FC.TUNING_SLIDERS.slider_master_multiplier = Math.round(s.masterMultiplier * 100);

    // In virtual mode there is no FC to crunch the sliders, so compute the
    // resulting PID/feedforward/D-max values client-side (port of the firmware's
    // simplified_tuning.c) and resolve immediately.
    if (CONFIGURATOR.virtualMode) {
        applySimplifiedPids();
        return Promise.resolve(undefined);
    }

    return MSP.promise(
        MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID,
        mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID),
    ).catch((error: unknown) => {
        console.error("Failed to calculate simplified PIDs:", error);
        return undefined;
    });
}

/**
 * Write the gyro filter slider position to FC.TUNING_SLIDERS and compute the
 * resulting gyro lowpass cutoffs.  Returns a promise that resolves after
 * FC.FILTER_CONFIG has been updated.
 *
 * @param multiplier  Gyro filter multiplier (decimal, e.g. 1.0)
 */
export function calculateNewGyroFilters(multiplier: number): Promise<MspResponse | undefined> {
    FC.TUNING_SLIDERS.slider_gyro_filter = 1;
    FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = Math.round(multiplier * 100);

    if (CONFIGURATOR.virtualMode) {
        applySimplifiedGyroFilters();
        return Promise.resolve(undefined);
    }

    return MSP.promise(
        MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO,
        mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO),
    ).catch((error: unknown) => {
        console.error("Failed to calculate simplified gyro filters:", error);
        return undefined;
    });
}

/**
 * Write the D-term filter slider position to FC.TUNING_SLIDERS and compute the
 * resulting D-term lowpass cutoffs.  Returns a promise that resolves after
 * FC.FILTER_CONFIG has been updated.
 *
 * @param multiplier  D-term filter multiplier (decimal, e.g. 1.0)
 */
export function calculateNewDTermFilters(multiplier: number): Promise<MspResponse | undefined> {
    FC.TUNING_SLIDERS.slider_dterm_filter = 1;
    FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = Math.round(multiplier * 100);

    if (CONFIGURATOR.virtualMode) {
        applySimplifiedDtermFilters();
        return Promise.resolve(undefined);
    }

    return MSP.promise(
        MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM,
        mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM),
    ).catch((error: unknown) => {
        console.error("Failed to calculate simplified D-term filters:", error);
        return undefined;
    });
}

/**
 * Validate that the current FC PID/filter values match what the sliders would
 * produce.  After the MSP response, FC.TUNING_SLIDERS is patched so that
 * invalid slider modes are set to 0 (sliders off).  Returns a promise.
 */
export function validateTuningSliders(): Promise<void> {
    const patchInvalidSliders = () => {
        if (!FC.TUNING_SLIDERS.slider_pids_valid) {
            FC.TUNING_SLIDERS.slider_pids_mode = 0;
        }
        if (!FC.TUNING_SLIDERS.slider_gyro_valid) {
            FC.TUNING_SLIDERS.slider_gyro_filter = 0;
        }
        if (!FC.TUNING_SLIDERS.slider_dterm_valid) {
            FC.TUNING_SLIDERS.slider_dterm_filter = 0;
        }
    };

    // In virtual mode, compare the stored PID/filter values against what the
    // sliders would produce client-side instead of asking the FC.
    if (CONFIGURATOR.virtualMode) {
        validateVirtualSimplifiedTuning();
        patchInvalidSliders();
        return Promise.resolve();
    }

    return MSP.promise(MSPCodes.MSP_VALIDATE_SIMPLIFIED_TUNING)
        .then(patchInvalidSliders)
        .catch((error: unknown) => {
            console.error("Failed to validate tuning sliders:", error);
            return undefined;
        });
}
