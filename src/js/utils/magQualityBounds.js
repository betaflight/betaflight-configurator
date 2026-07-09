/**
 * Soft-iron sanity bounds, shared by the live tumble-calibration wizard
 * (magModelExport.js) and the offline blackbox pose engine's mag model
 * loader (blackbox-viewer/pose/mag_model.js) so the two calibration paths
 * can't silently drift onto different acceptance thresholds.
 *
 * Attribution: the numeric acceptance thresholds — field-strength range
 * (150-950 milliGauss) and per-axis soft-iron scale range (0.67-1.5, applied
 * below as a max/min diagonal ratio < 2.24) — originate from ArduPilot's
 * CompassCalibrator (libraries/AP_Compass/CompassCalibrator.cpp, GPLv3). This
 * is an INDEPENDENT reimplementation in JavaScript: no ArduPilot source was
 * copied — only its published threshold values are reused as functional
 * parameters. ArduPilot and this project are both GPLv3, so the reuse is
 * license-compatible.
 *
 * These are scale-invariant ratios on the soft-iron matrix plus a physical
 * field-magnitude range, so they hold whether `soft_iron` is normalized
 * (unit-sphere) or in raw ADC scale. They catch degenerate/pathological fits
 * that a residual-only score can miss (e.g. a near-singular soft-iron matrix).
 *
 * @param {number[][]|null} softIron - the W_inv soft-iron matrix
 * @param {number|null} fieldNt - local field strength (nanotesla)
 * @returns {object} per-check values + booleans + overall bounds_ok
 */
export function computeMagQualityBounds(softIron, fieldNt) {
    const fieldMg = fieldNt != null ? fieldNt / 100 : null; // 1 milliGauss = 100 nT
    const fieldOk = fieldMg != null ? fieldMg >= 150 && fieldMg <= 950 : null;

    let offdiagRatio = null;
    let anisotropy = null;
    if (Array.isArray(softIron) && softIron.length === 3) {
        const diag = [Math.abs(softIron[0][0]), Math.abs(softIron[1][1]), Math.abs(softIron[2][2])];
        const offdiag = [
            Math.abs(softIron[0][1]),
            Math.abs(softIron[0][2]),
            Math.abs(softIron[1][2]),
            Math.abs(softIron[1][0]),
            Math.abs(softIron[2][0]),
            Math.abs(softIron[2][1]),
        ];
        const meanDiag = (diag[0] + diag[1] + diag[2]) / 3;
        const maxDiag = Math.max(...diag);
        const minDiag = Math.min(...diag);
        offdiagRatio = meanDiag > 1e-12 ? Math.max(...offdiag) / meanDiag : null;
        // AP per-axis scale bound 0.67-1.5 => max/min diagonal ratio < 1.5/0.67 ~= 2.24.
        anisotropy = minDiag > 1e-12 ? maxDiag / minDiag : null;
    }
    const offdiagOk = offdiagRatio != null ? offdiagRatio < 1 : null;
    const anisotropyOk = anisotropy != null ? anisotropy < 2.24 : null;
    const boundsOk = [fieldOk, offdiagOk, anisotropyOk].every((b) => b === true);

    return {
        field_strength_mg: fieldMg,
        field_strength_ok: fieldOk,
        soft_iron_offdiag_ratio: offdiagRatio,
        soft_iron_offdiag_ok: offdiagOk,
        soft_iron_anisotropy: anisotropy,
        soft_iron_anisotropy_ok: anisotropyOk,
        bounds_ok: boundsOk,
    };
}
