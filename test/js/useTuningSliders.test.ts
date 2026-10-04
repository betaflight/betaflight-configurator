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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simplified = vi.hoisted(() => ({
    applySimplifiedPids: vi.fn(),
    applySimplifiedGyroFilters: vi.fn(),
    applySimplifiedDtermFilters: vi.fn(),
    validateVirtualSimplifiedTuning: vi.fn(),
}));

vi.mock("../../src/js/simplifiedTuning", () => simplified);

import {
    calculateNewDTermFilters,
    calculateNewGyroFilters,
    calculateNewPids,
    downscaleSliderValue,
    readDTermFilterSliderPosition,
    readGyroFilterSliderPosition,
    readPidSliderPositions,
    scaleSliderValue,
    validateTuningSliders,
    type PidSliderPositions,
} from "../../src/composables/useTuningSliders";
import CONFIGURATOR from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { mspHelper } from "../../src/js/msp/MSPHelper";

const positions: PidSliderPositions = {
    pidsMode: 2,
    dGain: 1.1,
    piGain: 0.85,
    feedforwardGain: 1.25,
    dMaxGain: 0.9,
    iGain: 1.5,
    rollPitchRatio: 1,
    pitchPIGain: 1.05,
    masterMultiplier: 1.35,
};

describe("useTuningSliders", () => {
    beforeEach(() => {
        FC.resetState();
        CONFIGURATOR.virtualMode = false;
        vi.spyOn(MSP, "promise").mockResolvedValue(undefined);
        vi.spyOn(mspHelper, "crunch").mockReturnValue([0xaa]);
    });

    afterEach(() => {
        CONFIGURATOR.virtualMode = false;
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    describe("slider scaling", () => {
        it("doubles the distance above 1, rounded to one decimal", () => {
            expect(scaleSliderValue(1.25)).toBe(1.5);
            expect(scaleSliderValue(1.333)).toBe(1.7);
        });

        it("leaves values at or below 1 alone", () => {
            expect(scaleSliderValue(1)).toBe(1);
            expect(scaleSliderValue(0.6)).toBe(0.6);
            expect(downscaleSliderValue(0.6)).toBe(0.6);
        });

        it("downscale undoes scale above 1", () => {
            expect(downscaleSliderValue(scaleSliderValue(1.25))).toBe(1.25);
        });
    });

    describe("reading slider positions", () => {
        it("turns the FC's percentages into decimals, leaving the mode as-is", () => {
            Object.assign(FC.TUNING_SLIDERS, {
                slider_pids_mode: 2,
                slider_d_gain: 110,
                slider_pi_gain: 85,
                slider_feedforward_gain: 125,
                slider_dmax_gain: 90,
                slider_i_gain: 150,
                slider_roll_pitch_ratio: 100,
                slider_pitch_pi_gain: 105,
                slider_master_multiplier: 135,
            });

            expect(readPidSliderPositions()).toEqual(positions);
        });

        it("reads the gyro and D-term filter sliders the same way", () => {
            Object.assign(FC.TUNING_SLIDERS, {
                slider_gyro_filter: 1,
                slider_gyro_filter_multiplier: 120,
                slider_dterm_filter: 0,
                slider_dterm_filter_multiplier: 80,
            });

            expect(readGyroFilterSliderPosition()).toEqual({ sliderGyroFilter: 1, sliderGyroFilterMultiplier: 1.2 });
            expect(readDTermFilterSliderPosition()).toEqual({
                sliderDTermFilter: 0,
                sliderDTermFilterMultiplier: 0.8,
            });
        });
    });

    describe("calculateNewPids", () => {
        it("writes the positions back as rounded percentages", async () => {
            // 0.57 * 100 is 56.99999999999999 in floating point: the write must round, not truncate.
            await calculateNewPids({ ...positions, dGain: 0.57 });

            expect(FC.TUNING_SLIDERS).toMatchObject({
                slider_pids_mode: 2,
                slider_d_gain: 57,
                slider_pi_gain: 85,
                slider_feedforward_gain: 125,
                slider_dmax_gain: 90,
                slider_i_gain: 150,
                slider_roll_pitch_ratio: 100,
                slider_pitch_pi_gain: 105,
                slider_master_multiplier: 135,
            });
        });

        it("round-trips through readPidSliderPositions", async () => {
            await calculateNewPids(positions);

            expect(readPidSliderPositions()).toEqual(positions);
        });

        it("asks the FC to compute the PIDs from the written sliders", async () => {
            let slidersAtCrunch: number | undefined;
            vi.mocked(mspHelper.crunch).mockImplementation(() => {
                slidersAtCrunch = FC.TUNING_SLIDERS.slider_master_multiplier;
                return [0xaa];
            });

            await calculateNewPids(positions);

            expect(slidersAtCrunch).toBe(135);
            expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID, [0xaa]);
            expect(simplified.applySimplifiedPids).not.toHaveBeenCalled();
        });

        it("computes client-side in virtual mode, without MSP", async () => {
            CONFIGURATOR.virtualMode = true;

            await calculateNewPids(positions);

            expect(simplified.applySimplifiedPids).toHaveBeenCalledOnce();
            expect(MSP.promise).not.toHaveBeenCalled();
        });

        it("logs and resolves when the FC request fails", async () => {
            const error = vi.spyOn(console, "error").mockImplementation(() => {});
            vi.mocked(MSP.promise).mockRejectedValue(new Error("timeout"));

            await expect(calculateNewPids(positions)).resolves.toBeUndefined();
            expect(error).toHaveBeenCalledOnce();
        });
    });

    describe.each([
        {
            name: "calculateNewGyroFilters",
            run: calculateNewGyroFilters,
            code: MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO,
            apply: simplified.applySimplifiedGyroFilters,
            mode: "slider_gyro_filter",
            multiplier: "slider_gyro_filter_multiplier",
        },
        {
            name: "calculateNewDTermFilters",
            run: calculateNewDTermFilters,
            code: MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM,
            apply: simplified.applySimplifiedDtermFilters,
            mode: "slider_dterm_filter",
            multiplier: "slider_dterm_filter_multiplier",
        },
    ] as const)("$name", ({ run, code, apply, mode, multiplier }) => {
        it("turns the slider on and writes the multiplier as a rounded percentage", async () => {
            FC.TUNING_SLIDERS[mode] = 0;

            await run(1.155);

            expect(FC.TUNING_SLIDERS[mode]).toBe(1);
            expect(FC.TUNING_SLIDERS[multiplier]).toBe(116);
            expect(MSP.promise).toHaveBeenCalledWith(code, [0xaa]);
            expect(apply).not.toHaveBeenCalled();
        });

        it("computes client-side in virtual mode, without MSP", async () => {
            CONFIGURATOR.virtualMode = true;

            await run(1);

            expect(apply).toHaveBeenCalledOnce();
            expect(MSP.promise).not.toHaveBeenCalled();
        });

        it("logs and resolves when the FC request fails", async () => {
            const error = vi.spyOn(console, "error").mockImplementation(() => {});
            vi.mocked(MSP.promise).mockRejectedValue(new Error("timeout"));

            await expect(run(1)).resolves.toBeUndefined();
            expect(error).toHaveBeenCalledOnce();
        });
    });

    describe("validateTuningSliders", () => {
        function startAllOn() {
            Object.assign(FC.TUNING_SLIDERS, { slider_pids_mode: 2, slider_gyro_filter: 1, slider_dterm_filter: 1 });
        }

        it("switches off each slider the FC reports invalid, and only those", async () => {
            startAllOn();
            vi.mocked(MSP.promise).mockImplementation(async () => {
                Object.assign(FC.TUNING_SLIDERS, { slider_pids_valid: 0, slider_gyro_valid: 1, slider_dterm_valid: 0 });
                return undefined;
            });

            await validateTuningSliders();

            expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_VALIDATE_SIMPLIFIED_TUNING);
            expect(FC.TUNING_SLIDERS).toMatchObject({
                slider_pids_mode: 0,
                slider_gyro_filter: 1,
                slider_dterm_filter: 0,
            });
        });

        it("patches from the FC's answer, not the validity flags from before the request", async () => {
            startAllOn();
            Object.assign(FC.TUNING_SLIDERS, { slider_pids_valid: 0, slider_gyro_valid: 0, slider_dterm_valid: 0 });
            vi.mocked(MSP.promise).mockImplementation(async () => {
                Object.assign(FC.TUNING_SLIDERS, { slider_pids_valid: 1, slider_gyro_valid: 1, slider_dterm_valid: 1 });
                return undefined;
            });

            await validateTuningSliders();

            expect(FC.TUNING_SLIDERS).toMatchObject({
                slider_pids_mode: 2,
                slider_gyro_filter: 1,
                slider_dterm_filter: 1,
            });
        });

        it("validates client-side in virtual mode, then patches", async () => {
            CONFIGURATOR.virtualMode = true;
            startAllOn();
            simplified.validateVirtualSimplifiedTuning.mockImplementation(() => {
                Object.assign(FC.TUNING_SLIDERS, { slider_pids_valid: 1, slider_gyro_valid: 0, slider_dterm_valid: 1 });
            });

            await validateTuningSliders();

            expect(MSP.promise).not.toHaveBeenCalled();
            expect(FC.TUNING_SLIDERS).toMatchObject({
                slider_pids_mode: 2,
                slider_gyro_filter: 0,
                slider_dterm_filter: 1,
            });
        });

        it("leaves the sliders alone and resolves when the FC request fails", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            startAllOn();
            Object.assign(FC.TUNING_SLIDERS, { slider_pids_valid: 0, slider_gyro_valid: 0, slider_dterm_valid: 0 });
            vi.mocked(MSP.promise).mockRejectedValue(new Error("timeout"));

            await expect(validateTuningSliders()).resolves.toBeUndefined();

            expect(FC.TUNING_SLIDERS).toMatchObject({
                slider_pids_mode: 2,
                slider_gyro_filter: 1,
                slider_dterm_filter: 1,
            });
        });
    });
});
