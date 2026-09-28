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
 * Builds a portable, self-contained JSON description of a magnetometer
 * calibration: the hard-iron offsets, the soft-iron (ellipsoid) correction, the
 * solved mounting alignment, the geomagnetic reference captured at the time, and
 * a derived `downstream_fusion` block for external log-analysis tools that want
 * to apply this calibration in physical units. The configurator only produces
 * the file; nothing in the configurator reads it back.
 *
 * This module is the single home for the export shape and its helpers; the test
 * suite asserts against the same builders so the tested shape cannot drift from
 * the shipped shape.
 */
import { matrixToEuler } from "./magCharacterization.js";
import { ALIGNMENT_MATRICES } from "./magAlignment.js";

type Vec3 = { x: number; y: number; z: number };
type Mat3 = number[][];

/** ZYX Euler angles in degrees. */
export interface EulerAngles {
    roll: number;
    pitch: number;
    yaw: number;
}

/** The ellipsoid fit as fitEllipsoid() reports it. */
export interface EllipsoidParams {
    center: Vec3;
    W_inv: Mat3;
    radius: number;
    residual: number;
}

/** Geomagnetic reference for the capture location (WMM). */
export interface GeoReference {
    declination: number;
    inclination: number;
    fieldStrength: number;
}

/** Per-axis solver residuals; reserved for future per-axis noise, pass null today. */
export interface SolverResiduals {
    xyRms?: number | null;
    zRms?: number | null;
}

/**
 * A solve result, kept deliberately loose: it may carry a preset or a raw
 * `alignment`, Euler angles either as `euler_zyx_deg` or `customAngles`, and an
 * `error` flag. Only the fields the builders read are declared.
 */
export interface SolverResult {
    preset?: number;
    alignment?: number;
    label?: string;
    euler_zyx_deg?: EulerAngles;
    customAngles?: EulerAngles;
    quality?: {
        meanResidualDeg?: number | null;
        sampleCount?: number | null;
        frobNorm?: number | null;
        cost?: number | null;
    };
    error?: unknown;
}

/** The FC configuration active during capture, passed through verbatim. */
export interface CapturedUnder {
    alignment: number;
    custom_angles: EulerAngles | null;
    mag_zero: Vec3 | null;
    mag_zero_known: boolean;
}

/** Soft-iron sanity gates: the per-check values plus an overall verdict. */
export interface MagQualityBounds {
    field_strength_mg: number | null;
    field_strength_ok: boolean | null;
    soft_iron_offdiag_ratio: number | null;
    soft_iron_offdiag_ok: boolean | null;
    soft_iron_anisotropy: number | null;
    soft_iron_anisotropy_ok: boolean | null;
    bounds_ok: boolean;
}

/** The WMM earth-field vector in the NED world frame, in Gauss. */
export interface EarthFieldNedGauss {
    n: number;
    e: number;
    d: number;
}

/** The `downstream_fusion` block: a seed + noise model for a 3-axis mag filter. */
export interface DownstreamFusion {
    frame: "FRD";
    nt_per_corrected_unit: number | null;
    gauss_per_corrected_unit: number | null;
    earth_field_ned_gauss: EarthFieldNedGauss | null;
    mag_noise_gauss: {
        sigma: number | null;
        sigma_xy: number | null;
        sigma_z: number | null;
    };
    quality_bounds: MagQualityBounds;
}

export interface BuildCharacterizationModelArgs {
    solverResult: SolverResult | null;
    capturedUnder: CapturedUnder | null;
    ellipsoidParams: EllipsoidParams | null;
    calibrationOffsets: Vec3 | null;
    geoReference: GeoReference | null;
    gpsFix: boolean;
    gpsLat: number;
    gpsLon: number;
    qualityAssessment?: object | null;
}

/** The exported calibration model — a plain, JSON-serializable object. */
export interface CharacterizationModel {
    $schema: string;
    version: string;
    captured_under: CapturedUnder | null;
    ellipsoid_correction: {
        center: Vec3;
        soft_iron: Mat3;
        radius: number;
        residual_rms: number;
    } | null;
    geo_reference: {
        latitude_deg: number | null;
        longitude_deg: number | null;
        declination_deg: number | null;
        inclination_deg: number | null;
        field_strength_nt: number | null;
    };
    alignment: {
        preset: number | undefined;
        label: string | undefined;
        euler_zyx_deg: EulerAngles;
    } | null;
    hard_iron: Vec3 | null;
    quality: {
        mean_residual_deg: number | null;
        sample_count: number | null;
        frob_norm: number | null;
        cost: number | null;
    } | null;
    quality_assessment: object | null;
    downstream_fusion: DownstreamFusion;
}

// ALIGNMENT_MATRICES comes from the untyped JS module keyed by the 1..8 preset ids.
const alignmentMatrices = ALIGNMENT_MATRICES as Record<number, Mat3>;

export const MODEL_SCHEMA_VERSION = "2.2";
export const MODEL_SCHEMA_URL = `https://betaflight.com/blackbox/mag-characterization-model/${MODEL_SCHEMA_VERSION}`;

/** Normalize a heading to [0, 360). */
export function normalizeHeading(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** Signed wrapped heading error in (-180, 180]. */
export function signedHeadingError(actual: number, expected: number | null | undefined): number {
    if (expected === null || expected === undefined) {
        return 0;
    }
    let diff = actual - expected;
    while (diff > 180) {
        diff -= 360;
    }
    while (diff < -180) {
        diff += 360;
    }
    return diff;
}

/** ZYX Euler angles (degrees) for a solver result, presets included. */
export function getEulerAngles(solverResultVal: SolverResult | null): EulerAngles {
    if (!solverResultVal) {
        return { roll: 0, pitch: 0, yaw: 0 };
    }
    const preset = solverResultVal.preset ?? solverResultVal.alignment;
    if (preset === 9 && solverResultVal.euler_zyx_deg) {
        return { ...solverResultVal.euler_zyx_deg };
    }
    if (preset === 9 && solverResultVal.customAngles) {
        const { roll, pitch, yaw } = solverResultVal.customAngles;
        return { roll, pitch, yaw };
    }
    if (typeof preset === "number" && preset >= 1 && preset <= 8 && alignmentMatrices[preset]) {
        return matrixToEuler(alignmentMatrices[preset]);
    }
    return { roll: 0, pitch: 0, yaw: 0 };
}

/**
 * Soft-iron sanity bounds.
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
 * @param softIron - the W_inv soft-iron matrix
 * @param fieldNt - local field strength (nanotesla)
 */
export function computeMagQualityBounds(softIron: Mat3 | null, fieldNt: number | null): MagQualityBounds {
    const fieldMg = fieldNt != null ? fieldNt / 100 : null; // 1 milliGauss = 100 nT
    const fieldOk = fieldMg != null ? fieldMg >= 150 && fieldMg <= 950 : null;

    let offdiagRatio: number | null = null;
    let anisotropy: number | null = null;
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

/**
 * Build the `downstream_fusion` block — everything a 3-axis magnetometer filter
 * needs to consume this calibration as a seed + noise model, not just a heading
 * correction. Every value is DERIVED from data the calibration already produced;
 * nothing here needs extra capture.
 *
 * Why each field exists (for a consumer that fuses 3-axis mag against a
 * WMM-seeded earth-field state):
 *  - nt/gauss_per_corrected_unit: the ellipsoid fit lands corrected samples on
 *    a sphere of magnitude `radius`, which physically equals the local field.
 *    So one corrected unit = field/radius nanotesla. This lets the estimator
 *    fuse mag in PHYSICAL units against a WMM earth field, instead of guessing
 *    a scale.
 *  - earth_field_ned_gauss: the WMM earth-field vector in the NED world frame,
 *    ready to SEED the estimator's earth-field state (no WMM re-implementation
 *    downstream).
 *  - mag_noise_gauss: the estimator's measurement noise R, set from THIS
 *    calibration's MEASURED residual (isotropic from the ellipsoid fit). A
 *    good calibration earns tight mag trust; a marginal one is auto-downweighted.
 *  - quality_bounds: independent sanity gates (computeMagQualityBounds).
 *  - frame: the body frame of center/soft_iron/hard_iron and of the live magADC
 *    the estimator applies them to (FRD — firmware-verified).
 *
 * @param solverResiduals - unused currently, kept for future per-axis noise; pass null for now
 */
export function computeDownstreamFusion(
    ellipsoidParams: EllipsoidParams | null,
    geoReference: GeoReference | null,
    solverResiduals: SolverResiduals | null,
): DownstreamFusion {
    const fieldNt = geoReference?.fieldStrength ?? null;
    const radius = ellipsoidParams?.radius ?? null;
    const softIron = ellipsoidParams?.W_inv ?? null;
    const epResidual = ellipsoidParams?.residual ?? null;

    let ntPerUnit: number | null = null;
    let gaussPerUnit: number | null = null;
    if (fieldNt != null && radius != null && Math.abs(radius) > 1e-9) {
        ntPerUnit = fieldNt / radius;
        gaussPerUnit = ntPerUnit / 1e5; // 1 Gauss = 1e5 nT
    }

    let earthFieldNedGauss: EarthFieldNedGauss | null = null;
    if (fieldNt != null && geoReference?.inclination != null && geoReference?.declination != null) {
        const incl = (geoReference.inclination * Math.PI) / 180;
        const decl = (geoReference.declination * Math.PI) / 180;
        const bTotalG = fieldNt / 1e5; // nT to Gauss
        const bH = bTotalG * Math.cos(incl);
        earthFieldNedGauss = {
            n: bH * Math.cos(decl),
            e: bH * Math.sin(decl),
            d: bTotalG * Math.sin(incl),
        };
    }

    const scaleNoise = (r: number | null | undefined): number | null =>
        r != null && gaussPerUnit != null ? Math.abs(r) * gaussPerUnit : null;

    return {
        frame: "FRD",
        nt_per_corrected_unit: ntPerUnit,
        gauss_per_corrected_unit: gaussPerUnit,
        earth_field_ned_gauss: earthFieldNedGauss,
        mag_noise_gauss: {
            sigma: scaleNoise(epResidual),
            sigma_xy: scaleNoise(solverResiduals?.xyRms ?? null),
            sigma_z: scaleNoise(solverResiduals?.zRms ?? null),
        },
        quality_bounds: computeMagQualityBounds(softIron, fieldNt),
    };
}

/**
 * Build the calibration model object.
 *
 * Frame conventions: `captured_under` is the FC configuration active during
 * capture; `ellipsoid_correction` (center, soft_iron) is expressed in that
 * CAPTURE frame; `hard_iron` is expressed in the PROPOSED alignment frame
 * (the literal `set mag_calibration` values). All are in the FRD body frame
 * (see `downstream_fusion.frame`).
 *
 * @param gpsLat - raw MSP value (deg x 1e7)
 * @param gpsLon - raw MSP value (deg x 1e7)
 */
export function buildCharacterizationModel({
    solverResult,
    capturedUnder,
    ellipsoidParams,
    calibrationOffsets,
    geoReference,
    gpsFix,
    gpsLat,
    gpsLon,
    qualityAssessment = null,
}: BuildCharacterizationModelArgs): CharacterizationModel {
    const sr = solverResult;
    const ep = ellipsoidParams;

    let alignmentBlock: CharacterizationModel["alignment"] = null;
    if (sr && !sr.error) {
        alignmentBlock = {
            preset: sr.preset ?? sr.alignment,
            label: sr.label,
            euler_zyx_deg: getEulerAngles(sr),
        };
    }

    let qualityBlock: CharacterizationModel["quality"] = null;
    if (sr && !sr.error) {
        qualityBlock = {
            mean_residual_deg: sr.quality?.meanResidualDeg ?? null,
            sample_count: sr.quality?.sampleCount ?? null,
            frob_norm: sr.quality?.frobNorm ?? null,
            cost: sr.quality?.cost ?? null,
        };
    }

    return {
        $schema: MODEL_SCHEMA_URL,
        version: MODEL_SCHEMA_VERSION,
        captured_under: capturedUnder ?? null,
        ellipsoid_correction: ep
            ? {
                  center: { x: ep.center.x, y: ep.center.y, z: ep.center.z },
                  soft_iron: ep.W_inv,
                  radius: ep.radius,
                  residual_rms: ep.residual,
              }
            : null,
        geo_reference: {
            latitude_deg: gpsFix ? gpsLat / 10000000 : null,
            longitude_deg: gpsFix ? gpsLon / 10000000 : null,
            declination_deg: geoReference?.declination ?? null,
            inclination_deg: geoReference?.inclination ?? null,
            field_strength_nt: geoReference?.fieldStrength ?? null,
        },
        alignment: alignmentBlock,
        hard_iron: calibrationOffsets ?? null,
        quality: qualityBlock,
        quality_assessment: qualityAssessment,
        downstream_fusion: computeDownstreamFusion(ep, geoReference, null),
    };
}
