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

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MSPCodes from "../../src/js/msp/MSPCodes";

const FC_TUNING = {
    slider_pids_mode: 2,
    slider_master_multiplier: 100,
    slider_roll_pitch_ratio: 100,
    slider_i_gain: 100,
    slider_d_gain: 100,
    slider_pi_gain: 100,
    slider_dmax_gain: 100,
    slider_feedforward_gain: 100,
    slider_pitch_pi_gain: 100,
    slider_dterm_filter: 1,
    slider_dterm_filter_multiplier: 100,
    slider_gyro_filter: 1,
    slider_gyro_filter_multiplier: 100,
};

const FC_FILTERS = {
    dterm_lowpass_hz: 75,
    dterm_lowpass2_hz: 150,
    dterm_lowpass_dyn_min_hz: 75,
    dterm_lowpass_dyn_max_hz: 150,
    gyro_lowpass_hz: 250,
    gyro_lowpass2_hz: 500,
    gyro_lowpass_dyn_min_hz: 250,
    gyro_lowpass_dyn_max_hz: 500,
};

const { mspCalls, written } = vi.hoisted(() => ({
    mspCalls: [] as number[],
    written: { tuning: null as Record<string, unknown> | null, filters: null as Record<string, unknown> | null },
}));

vi.mock("@/js/msp", async () => {
    const { useFlightControllerStore } = await import("../../src/stores/fc");
    const codes = (await import("../../src/js/msp/MSPCodes")).default;
    return {
        default: {
            promise: vi.fn(async (code: number) => {
                mspCalls.push(code);
                const fcStore = useFlightControllerStore();
                if (code === codes.MSP_SIMPLIFIED_TUNING) {
                    Object.assign(fcStore.tuningSliders, FC_TUNING);
                    Object.assign(fcStore.filterConfig, FC_FILTERS);
                }
                if (code === codes.MSP_SET_SIMPLIFIED_TUNING) {
                    written.tuning = { ...fcStore.tuningSliders };
                    written.filters = { ...fcStore.filterConfig };
                }
            }),
        },
    };
});

vi.mock("@/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: vi.fn(() => []) },
}));

vi.mock("@/composables/useTuningSliders", async () => {
    const { useFlightControllerStore } = await import("../../src/stores/fc");
    return {
        validateTuningSliders: vi.fn(async () => {
            const fcStore = useFlightControllerStore();
            fcStore.tuningSliders.slider_pids_valid = 1;
            fcStore.tuningSliders.slider_dterm_valid = 1;
        }),
    };
});

import { useAutotune } from "../../src/composables/useAutotune";

const PROPOSED = {
    slider_master_multiplier: 110,
    slider_pi_gain: 105,
    slider_i_gain: 95,
    slider_d_gain: 120,
    slider_feedforward_gain: 100,
    slider_dterm_filter_multiplier: 90,
};

describe("autotune applyGains", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        mspCalls.length = 0;
        written.tuning = null;
        written.filters = null;
    });

    it("writes the FC's own tuning and filters when the PID Tuning tab was never opened", async () => {
        await useAutotune().applyGains(PROPOSED);

        expect(mspCalls.indexOf(MSPCodes.MSP_SIMPLIFIED_TUNING)).toBeGreaterThanOrEqual(0);
        expect(mspCalls.indexOf(MSPCodes.MSP_SIMPLIFIED_TUNING)).toBeLessThan(
            mspCalls.indexOf(MSPCodes.MSP_SET_SIMPLIFIED_TUNING),
        );
        expect(written.tuning).toMatchObject({ ...FC_TUNING, ...PROPOSED });
        expect(written.filters).toMatchObject(FC_FILTERS);
        expect(mspCalls.at(-1)).toBe(MSPCodes.MSP_EEPROM_WRITE);
    });
});
