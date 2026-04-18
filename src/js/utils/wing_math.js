// Pure math utilities for wing tuning visualizations.
// Ported from bf-wing-mixer/src/components/TpaCurvePanel.jsx and SpaPanel.jsx.
// No framework dependencies — safe to use from any Vue/JS context.

/**
 * Hyperbolic TPA curve from Limon's PR #13805.
 *
 * @param {number} x - normalized throttle 0.0–1.0
 * @param {number} stallThrottle - tpa_curve_stall_throttle (0–100, stored as %)
 * @param {number} pidThr0 - tpa_curve_pid_thr0 (uint16, e.g. 200 = 2.0×)
 * @param {number} pidThr100 - tpa_curve_pid_thr100 (uint16, e.g. 70 = 0.7×)
 * @param {number} expoParam - tpa_curve_expo (int8, divided by 10 in formula)
 * @returns {number} PID multiplier factor (e.g. 2.0 at stall, 0.7 at max)
 */
export function tpaCurveHyperbolic(x, stallThrottle, pidThr0, pidThr100, expoParam) {
    const thrStall = stallThrottle / 100;
    const pThr0 = pidThr0 / 100;

    if (x <= thrStall) {
        return pThr0;
    }

    const expoDivider = expoParam / 10 - 1;
    const expo = Math.abs(expoDivider) > 1e-3 ? 1 / expoDivider : 1e3;

    const pThr100 = pidThr100 / 100;
    const xShifted = (x - thrStall) / (1 - thrStall);
    const base = 1 + (Math.pow(pThr0 / pThr100, 1 / expo) - 1) * xShifted;
    const divisor = Math.pow(base, expo);

    return pThr0 / divisor;
}

/**
 * Build an array of `(throttle%, pidMultiplier%)` points for the TPA curve.
 */
export function computeTpaCurve(stallThrottle, pidThr0, pidThr100, expo, points = 100) {
    const result = [];
    for (let i = 0; i <= points; i++) {
        const x = i / points;
        const multiplier = tpaCurveHyperbolic(x, stallThrottle, pidThr0, pidThr100, expo);
        result.push({ throttle: x * 100, multiplier: multiplier * 100 });
    }
    return result;
}

/**
 * SPA smooth step-down transition curve, matching Limon's PR #13719.
 *
 * Returns y ∈ [0, 1]:
 *   1.0 (full PID) when setpoint < leftLimit (center - width/2)
 *   0.0 (attenuated) when setpoint > rightLimit (center + width/2)
 *   Smooth cubic transition (3t² - 2t³) between the two.
 */
export const SPA_SETPOINT_MAX = 1000;

export function spaSmoothStepDown(setpoint, center, width) {
    const leftLimit = center - width / 2;
    const rightLimit = center + width / 2;
    if (setpoint <= leftLimit) {
        return 1;
    }
    if (setpoint >= rightLimit) {
        return 0;
    }
    const t = (setpoint - leftLimit) / Math.max(1e-6, width);
    const smooth = t * t * (3 - 2 * t);
    return 1 - smooth;
}

export function computeSpaCurve(center, width, points = 100, maxSetpoint = SPA_SETPOINT_MAX) {
    const result = [];
    for (let i = 0; i <= points; i++) {
        const setpoint = (i / points) * maxSetpoint;
        result.push({ setpoint, multiplier: spaSmoothStepDown(setpoint, center, width) });
    }
    return result;
}
