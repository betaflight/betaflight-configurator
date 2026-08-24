// The curve min/max spinners used a fixed increment of 10, which is unusable once a field is
// scaled to a small range: stepping a +/-10 velocity curve in tens only ever reaches 0 or 20.
// The coarse step follows the size of the range instead, and Ctrl still forces the fine step.

export const FINE_MIN_MAX_STEP = 0.1;

/**
 * Spinner increment for a curve whose bounds span the given range.
 *
 * @param {{min: number, max: number}} minMax Curve bounds.
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
