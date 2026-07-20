/**
 * Per-sample magnetometer correction using a characterization model.
 *
 * Pipeline:
 *   1. m_c = W_inv × (m_raw − center)      — ellipsoid correction to unit sphere
 *   2. m_b = alignment × m_c                — sensor-to-body rotation
 *   3. m_leveled = undoRollPitch(m_b, r, p) — level to horizontal plane
 *   4. h_mag = atan2(−m_leveled[1], m_leveled[0]) — magnetic heading
 *   5. weight = cos(inclination) × sin(dip) — heading quality weight
 */

import { mat3mulVec } from "../../js/utils/magAlignment.js";

// Levels a body vector using Ry(−pitch)·Rx(−roll) — the INVERSE convention of
// src/js/utils/magAlignment.js's undoRollPitch (Ry(+pitch)·Rx(+roll)). The two
// call sites feed opposite angle conventions; they are NOT interchangeable.
// Reconciling the conventions is tracked as follow-up work — until then this
// stays private to the pose heading path, under a distinct name so the shared
// util can't be substituted by accident.
function levelBodyVectorInverse(v, rollRad, pitchRad) {
    const cr = Math.cos(-rollRad);
    const sr = Math.sin(-rollRad);
    const cp = Math.cos(-pitchRad);
    const sp = Math.sin(-pitchRad);

    const x1 = v[0] * cp + v[1] * (sp * sr) + v[2] * (sp * cr);
    const y1 = v[0] * 0 + v[1] * cr + v[2] * -sr;
    const z1 = v[0] * -sp + v[1] * (cp * sr) + v[2] * (cp * cr);

    return [x1, y1, z1];
}

/**
 * Apply ellipsoid correction to a raw mag reading.
 * m_clean = W_inv × (m_raw − center)
 */
function applyEllipsoidCorrection(raw, { center, W_inv }) {
    const dx = raw[0] - center.x;
    const dy = raw[1] - center.y;
    const dz = raw[2] - center.z;
    return [
        W_inv[0][0] * dx + W_inv[0][1] * dy + W_inv[0][2] * dz,
        W_inv[1][0] * dx + W_inv[1][1] * dy + W_inv[1][2] * dz,
        W_inv[2][0] * dx + W_inv[2][1] * dy + W_inv[2][2] * dz,
    ];
}

/**
 * Compute the heading quality weight based on local field geometry:
 * cos²(inclination), the squared horizontal field fraction.
 *
 * @param {MagModel} model - Characterization model with geoReference
 * @returns {number} weight in [0, 1]
 */
function computeHeadingWeight(model) {
    const { inclination } = model.geoReference;
    const cosI = Math.cos((inclination * Math.PI) / 180);
    if (cosI <= 0) {
        return 0;
    }
    // cos²(inclination): squared horizontal field fraction. Equator → 1
    // (max heading information), poles → 0 (field is vertical, no heading).
    return cosI * cosI;
}

/**
 * Apply ellipsoid + alignment correction to a raw mag reading and return the
 * body-frame vector on the unit sphere. This is the entrance the 3-axis ESKF
 * imports for magnetometer fusion — the EKF handles leveling and heading
 * internally, so undoRollPitch and atan2 are NOT applied here.
 *
 * The returned vector is on the unit sphere (W_inv maps the ellipsoid to a
 * sphere of radius 1). The ADC→Gauss scale factor is returned separately for
 * consumers that need physical units (e.g. |B| magnitude gates).
 *
 * @param {number[3]} magRaw - Raw mag ADC values from the log [x, y, z]
 * @param {MagModel} model - Loaded characterization model
 * @returns {{ mBody: number[3], gaussPerCorrectedUnit: number|null }|null}
 */
export function correctMagToBody(magRaw, model) {
    if (!magRaw || magRaw.length < 3) {
        return null;
    }
    if (magRaw[0] === 0 && magRaw[1] === 0 && magRaw[2] === 0) {
        return null;
    }

    // Step 1: Ellipsoid correction — maps to unit sphere (radius = 1)
    const mCorrected = applyEllipsoidCorrection(magRaw, model.ellipsoid);

    // Step 2: Sensor → body alignment
    const mBody = mat3mulVec(model.alignment.matrix, mCorrected);

    // ADC→Gauss scale factor from the fusion block (computed or native)
    const gaussPerUnit = model.fusion?.gaussPerCorrectedUnit ?? null;

    return {
        mBody,
        gaussPerCorrectedUnit: gaussPerUnit,
    };
}

/**
 * Apply the full mag correction pipeline for a single sample.
 *
 * Internally calls correctMagToBody for steps 1–2, then applies
 * undoRollPitch + atan2 for heading extraction. The heading path matches
 * the shipped Configurator implementation exactly.
 *
 * @param {number[3]} magRaw - Raw mag ADC values from the log [x, y, z]
 * @param {number} rollRad - Roll angle in radians
 * @param {number} pitchRad - Pitch angle in radians
 * @param {MagModel} model - Loaded characterization model
 * @returns {{ heading: number, weight: number, magCorrected: number[3] }|null}
 */
export function correctMagSample(magRaw, rollRad, pitchRad, model) {
    const bodyResult = correctMagToBody(magRaw, model);
    if (!bodyResult) {
        return null;
    }

    // Step 3: Level to horizontal frame
    const mLeveled = levelBodyVectorInverse(bodyResult.mBody, rollRad, pitchRad);

    // Step 4: NED heading (atan2 of -East / North)
    const hMag = Math.atan2(-mLeveled[1], mLeveled[0]);

    // Step 5: Analytic fusion weight
    const weight = computeHeadingWeight(model);

    return {
        heading: hMag,
        weight,
        magCorrected: bodyResult.mBody, // body-frame corrected (same as old magCorrected)
    };
}

/**
 * Compute the fused heading using phasor fusion of mag + GPS headings.
 * Avoids the 0°/360° singularity via atan2 blending.
 *
 * @param {number} hMag - Magnetic heading in radians
 * @param {number} weight - Mag weight [0,1]
 * @param {number} hGps - GPS heading in radians (or null if unavailable)
 * @returns {number} Fused heading in radians
 */
export function fuseHeading(hMag, weight, hGps) {
    if (hGps == null || weight >= 1.0) {
        return hMag;
    }
    if (weight <= 0) {
        return hGps;
    }

    const x = weight * Math.cos(hMag) + (1 - weight) * Math.cos(hGps);
    const y = weight * Math.sin(hMag) + (1 - weight) * Math.sin(hGps);
    return Math.atan2(y, x);
}
