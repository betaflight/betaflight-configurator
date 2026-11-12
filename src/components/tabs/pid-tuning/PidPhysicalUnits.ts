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
 * Firmware gain scaling (flight/pid.h). The PID sum is in 0.1% of motor range, so
 * Kp is per-mille per deg/s, Ki per-mille per deg, Kd and Kf per-mille per deg/s².
 */
export const PTERM_SCALE = 0.032029;
export const ITERM_SCALE = 0.244381;
export const DTERM_SCALE = 0.000529;
export const FEEDFORWARD_SCALE = 0.013754;

/** Motor output, in percent, commanded by P for a 100 deg/s rate error. */
export function pMotorPercentPer100Dps(p: number): number {
    return (PTERM_SCALE * p * 100) / 10;
}

/** Time for I to build the same output as P under a constant error (Kp/Ki), in ms. */
export function iResetTimeMs(p: number, i: number): number | null {
    return p > 0 && i > 0 ? (1000 * PTERM_SCALE * p) / (ITERM_SCALE * i) : null;
}

/** How far ahead a D gain projects the gyro rate when damping (Kd/Kp), in ms. */
export function dLeadTimeMs(p: number, d: number): number | null {
    return p > 0 ? (1000 * DTERM_SCALE * d) / (PTERM_SCALE * p) : null;
}

/** How far ahead of the stick feedforward drives the motors (Kf/Kp), in ms. */
export function feedforwardLeadTimeMs(p: number, f: number): number | null {
    return p > 0 ? (1000 * FEEDFORWARD_SCALE * (f / 100)) / (PTERM_SCALE * p) : null;
}
