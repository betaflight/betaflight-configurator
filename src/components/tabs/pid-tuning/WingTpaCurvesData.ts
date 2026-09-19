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

import type { WingConfig } from "../../../stores/fc.types";

import { getCssVar } from "../../../js/utils/common";

export interface TpaCurvePoint {
    /** Airspeed in m/s. */
    speed: number;
    /** PID multiplier at that speed. */
    multiplier: number;
}

export interface TpaChartCurve {
    data: TpaCurvePoint[];
    color: string;
    active: boolean;
}

export function getTpaHyperbolicCurve(wingConfig: WingConfig, motorKv: number): TpaChartCurve[] {
    // The list of charts curves
    const chartCurves: TpaChartCurve[] = [
        {
            data: generateHyperbolicCurve(wingConfig, motorKv),
            color: getCssVar("--chart-curve-color-1", "#d55e00"),
            active: true,
        },
    ];

    return chartCurves;
}

// Compute Wings maximal speed to follow BF firmware formulas (pid_init.c)
function computeMaximalSpeed(wingConfig: WingConfig, motorKv: number): number {
    const G_ACCELERATION = 9.80665;
    let maxSpeed: number;
    if (wingConfig.tpa_speed_type === 1) {
        if (wingConfig.tpa_speed_adv_mass === 0 || wingConfig.tpa_speed_adv_drag_k === 0) {
            return 1;
        }
        const propPitch = wingConfig.tpa_speed_adv_prop_pitch / 100;
        const craftMass = wingConfig.tpa_speed_adv_mass / 1000;
        const dragCoef = wingConfig.tpa_speed_adv_drag_k / 10000;
        const motorThrust = wingConfig.tpa_speed_adv_thrust / 1000;
        const maxVoltage = wingConfig.tpa_speed_max_voltage / 100;

        const maxFallSpeed = Math.sqrt((craftMass * G_ACCELERATION) / dragCoef);

        const propMaxSpeed = (2.54 / 100 / 60) * propPitch * motorKv * maxVoltage;
        const inversePropMaxSpeed = propMaxSpeed > 0 ? 1 / propMaxSpeed : 0;

        const twr = motorThrust / craftMass;
        const a = dragCoef;
        const b = craftMass * twr * G_ACCELERATION * inversePropMaxSpeed;
        const c = -craftMass * (twr + 1) * G_ACCELERATION;

        const D = b * b - 4 * a * c;
        const maxDiveSpeed = D >= 0 ? (-b + Math.sqrt(D)) / (2 * a) : 0;
        maxSpeed = Math.max(maxFallSpeed, maxDiveSpeed);
    } else {
        if (wingConfig.tpa_speed_basic_gravity === 0) {
            return 1;
        }
        const basicGravity = wingConfig.tpa_speed_basic_gravity / 100;
        const basicDelay = wingConfig.tpa_speed_basic_delay / 1000;

        const twr = 1 / (basicGravity * basicGravity);
        const massDragRatio = (2 / Math.log(3)) * (2 / Math.log(3)) * twr * G_ACCELERATION * basicDelay * basicDelay;
        maxSpeed = Math.sqrt(massDragRatio * twr * G_ACCELERATION + G_ACCELERATION);
    }

    return Math.max(maxSpeed, 1);
}

function scaleRange(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
    if (fromMax - fromMin === 0) {
        return toMin;
    }
    return toMin + ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin);
}

// Hyperbolic curve definition
function generateHyperbolicCurve(wingConfig: WingConfig, motorKv: number): TpaCurvePoint[] {
    const steps = 100;
    const data: TpaCurvePoint[] = [];
    const stallThrottle = wingConfig.tpa_curve_stall_throttle / 100;
    const pidStallThrottle = wingConfig.tpa_curve_pid_thr0 / 100;
    const pidFullThrottle = Math.max(wingConfig.tpa_curve_pid_thr100, 1) / 100;
    const curveExpo = wingConfig.tpa_curve_expo / 10;
    const maximalSpeed = computeMaximalSpeed(wingConfig, motorKv);

    // Guard against edge cases
    if (stallThrottle >= 1 || pidStallThrottle === pidFullThrottle) {
        const multiplier = pidStallThrottle;
        for (let i = 0; i <= steps; i++) {
            const x = i / steps;
            data.push({
                speed: x * maximalSpeed,
                multiplier: multiplier,
            });
        }
        return data;
    }

    for (let i = 0; i <= steps; i++) {
        const x = i / steps;
        let curveValue: number;
        if (x < stallThrottle) {
            curveValue = pidStallThrottle;
        } else {
            const expoDivider = curveExpo - 1;
            const expo = Math.abs(expoDivider) > 1e-3 ? 1 / expoDivider : 1e3;
            const xShifted = scaleRange(x, stallThrottle, 1, 0, 1);
            const base = 1 + (Math.pow(pidStallThrottle / pidFullThrottle, 1 / expo) - 1) * xShifted;
            const divisor = Math.pow(base, expo);
            curveValue = pidStallThrottle / divisor;
        }
        data.push({
            speed: x * maximalSpeed,
            multiplier: curveValue,
        });
    }
    return data;
}

export default getTpaHyperbolicCurve;
