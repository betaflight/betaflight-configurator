// The curve min/max spinners used a fixed increment of 10, which is unusable once a field is
// scaled to a small range: stepping a +/-10 velocity curve in tens only ever reaches 0 or 20.
// The coarse step follows the size of the range instead, and Ctrl still forces the fine step.

export const FINE_MIN_MAX_STEP = 0.1;

/**
 * Spinner increment for a curve whose bounds span the given range.
 *
 * @param {{min?: number, max?: number}} [minMax] Curve bounds, which may be absent or unset while a
 *     field is still being picked.
 * @returns {number} Increment to step the bounds by.
 */
export function coarseMinMaxStep(minMax) {
    // Missing bounds show as the +/-500 placeholder, which wants the widest step.
    if (!Number.isFinite(minMax?.min) || !Number.isFinite(minMax?.max)) {
        return 10;
    }

    const span = Math.abs(minMax.max - minMax.min);
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
function isAlignedToStep(value, step) {
    const quotient = value / step;
    const tolerance = 1e-9 * Math.max(1, Math.abs(quotient));
    return Math.abs(quotient - Math.round(quotient)) <= tolerance;
}

/**
 * Whether a curve wants the fine step, because a bound falls between two coarse steps and could
 * not otherwise be reached. Inputs in this state are shown in italics.
 *
 * @param {{min?: number, max?: number}} [minMax] Curve bounds.
 * @returns {boolean} True when the coarse step cannot express the bounds.
 */
export function needsFineStep(minMax) {
    if (!Number.isFinite(minMax?.min) || !Number.isFinite(minMax?.max)) {
        return false;
    }

    const step = coarseMinMaxStep(minMax);
    return !isAlignedToStep(minMax.min, step) || !isAlignedToStep(minMax.max, step);
}
