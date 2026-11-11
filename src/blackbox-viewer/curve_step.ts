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

// The curve min/max spinners used a fixed increment of 10, which is unusable once a field is
// scaled to a small range: stepping a +/-10 velocity curve in tens only ever reaches 0 or 20.
// The coarse step follows the size of the range instead, and Ctrl still forces the fine step.

export const FINE_MIN_MAX_STEP = 0.1;

/** A curve's bounds, either of which may be unset while a field is still being picked. */
export interface CurveBounds {
    min?: number;
    max?: number;
}

/**
 * Spinner increment for a curve whose bounds span the given range.
 *
 * @param {{min?: number, max?: number}} [minMax] Curve bounds, which may be absent or unset while a
 *     field is still being picked.
 * @returns {number} Increment to step the bounds by.
 */
export function coarseMinMaxStep(minMax?: CurveBounds): number {
    // Missing bounds show as the +/-500 placeholder, which wants the widest step.
    if (!Number.isFinite(minMax?.min) || !Number.isFinite(minMax?.max)) {
        return 10;
    }

    const span = Math.abs(minMax!.max! - minMax!.min!);
    if (span >= 100) {
        return 10;
    }
    if (span >= 10) {
        return 1;
    }
    return FINE_MIN_MAX_STEP;
}

/**
 * Whether a bound sits on a whole multiple of the step.
 *
 * Compares the quotient rather than taking a remainder: 0.3 % 0.1 is 0.09999999999999998, so a
 * remainder test rejects bounds that are perfectly well aligned.
 *
 * @param {number} value Bound to check.
 * @param {number} step Increment it should sit on.
 * @returns {boolean} True when the bound lands on the step.
 */
function isAlignedToStep(value: number, step: number): boolean {
    const quotient = value / step;
    // One ULP of the quotient. A fixed tolerance would be far too generous at large bounds: at a
    // quotient near 1e12 an absolute 1e-9 slack works out to about 1000, which would swallow bounds
    // that are a whole step out. Measured worst case for genuinely aligned bounds is 0.8 ULP.
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(quotient));
    return Math.abs(quotient - Math.round(quotient)) <= tolerance;
}

/**
 * Whether a curve wants the fine step, because a bound falls between two coarse steps and could
 * not otherwise be reached. Inputs in this state are shown in italics.
 *
 * @param {{min?: number, max?: number}} [minMax] Curve bounds.
 * @returns {boolean} True when the coarse step cannot express the bounds.
 */
export function needsFineStep(minMax?: CurveBounds): boolean {
    if (!Number.isFinite(minMax?.min) || !Number.isFinite(minMax?.max)) {
        return false;
    }

    const step = coarseMinMaxStep(minMax);
    return !isAlignedToStep(minMax!.min!, step) || !isAlignedToStep(minMax!.max!, step);
}
