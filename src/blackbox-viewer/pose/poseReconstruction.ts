/**
 * Pose reconstruction — the format-agnostic core entry point.
 *
 * `reconstructPose` runs the full pipeline (ingest log -> apply mag correction
 * / estimate heading bias -> choose origin -> ESKF forward pass + RTS smoother)
 * and returns the PoseTrack intermediate representation. It does NOT pick an
 * output format: callers serialize the result themselves (KML, CSV, JSON, GPX)
 * or sample it at arbitrary timestamps via samplePosesAt(). This is the seam
 * that lets the project be used as a library, not only through the KML button.
 *
 * It runs synchronously on the calling thread. The UI path (generatePoseKml)
 * keeps its own Web Worker wrapper for responsiveness; both share the input
 * preparation below so there is exactly one place that decides origin, mag
 * handling, and the model-free heading-bias estimate.
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) -> world(NED), scalar-first [w, x, y, z]
 */

import { ingestFlightLog, correctMagStream } from './flightIngestion.js';
import type { IngestedData, MagGaussEntry } from './flightIngestion.js';
import { loadMagCharacterizationModel } from './mag_model.js';
import { computeMagHeadingBias } from './rawMagBias.js';
import {
  calibrateInFlightMag,
  buildMagGaussStream,
  exportMagModelFromFlight,
} from './inFlightMagCal.js';
import type { MagCoverage, InFlightMagModel } from './inFlightMagCal.js';
import { estimatePoseTrack } from './estimatorLoop.js';
import type {
  EstimatorData,
  EstimatorOrigin,
  EstimatorOpts,
  MagModelInput,
} from './estimatorLoop.js';
import type { PoseTrack } from './poseTrack.js';

/** Default estimator output rate (Hz). The path is reconstructed at this rate;
 *  callers can resample or sample at arbitrary timestamps afterwards. */
export const DEFAULT_OUTPUT_HZ = 20;
/** Default upper bound on the quaternion-prior yaw sigma (rad) at level flight. */
export const DEFAULT_SIGMA_YAW_MAX = 0.1;

/** Mag optimization mode. */
export type MagMode = 'off' | 'auto' | 'manual';

/** Everything the estimator needs, derived once from the raw log + optional model. */
export interface ReconstructionInputs {
  /** Ingested sensor streams, with `mag` converted to Gauss when a model was
   *  supplied, or left empty (no per-sample mag fusion) otherwise. */
  data: EstimatorData;
  /** Reconstruction origin: GPS home if logged, else the first valid GPS fix. */
  origin: EstimatorOrigin;
  /** The mag model passed to the estimator, only when it carries a usable earth
   *  field; null on the model-free path. */
  magModelForEst: MagModelInput | null;
  /** Model-free heading-bias estimate (rad). Non-zero only on the model-free
   *  path when the raw-mag in-flight calibration produced a valid estimate. */
  rawMagBiasRad: number;
  /** The in-flight calibration's full model (for export via UI, null if
   *  AUTO failed or mode is not AUTO). */
  inFlightModelForExport: InFlightMagModel | null;
  /** AUTO coverage level (only meaningful when magMode = 'auto'). */
  coverage: MagCoverage | null;
  /** Human-readable calibration message (for UI display). */
  calMessage: string | null;
}

/**
 * Prepare estimator inputs from a parsed flight log.
 *
 * Mag handling has three modes controlled by `magMode`:
 *  - **off:** No mag factor. FC quaternion heading as-is (already Mahony+mag fused).
 *    magGauss=[], magModelForEst=null, rawMagBiasRad=0.
 *  - **auto:** Run in-flight ellipsoid calibration → build a full model object
 *    → correct the raw mag stream through `correctMagStream` (identical to MANUAL's
 *    path). If the fit is invalid, fall back to OFF with a message — never silently
 *    apply a bad cal.
 *  - **manual:** Load the user-supplied characterization model (from configurator
 *    bench cal or flight-exported) → correct through `correctMagStream`.
 *
/**
 * Detects the mag double-count risk: true when the BFL log's `mag_hardware` header
 * indicates Betaflight's onboard Mahony filter had a physical magnetometer
 * active (so the FC quaternion already incorporates mag-derived yaw
 * correction) AND this pipeline is ALSO about to fuse its own, separate mag
 * factor (manual model loaded, or AUTO's in-flight calibration succeeded).
 */
export function detectMagDoubleCountRisk(
  sysConfig: Record<string, unknown> | undefined,
  magModelForEst: MagModelInput | null,
): boolean {
  const onboardMagActive = Boolean((sysConfig as { mag_hardware?: number } | undefined)?.mag_hardware);
  const ownMagFactorActive = magModelForEst != null;
  return onboardMagActive && ownMagFactorActive;
}

/**
 * @param flightLog A parsed FlightLog (the same object the UI holds).
 * @param magModel  Optional parsed mag characterization model JSON (schema 2.x).
 *                  Only consulted in MANUAL mode.
 * @param magMode   Mag optimization mode.
 */
export function prepareReconstruction(
  flightLog: unknown,
  magModel: Record<string, unknown> | null = null,
  magMode: MagMode = 'auto',
): ReconstructionInputs {
  if (!flightLog) throw new Error('No flight log is loaded.');
  if (magModel != null && typeof magModel !== 'object') {
    throw new Error('Mag model must be a parsed JSON object.');
  }
  if (!['off', 'auto', 'manual'].includes(magMode)) {
    throw new Error(`Unknown magMode: ${magMode}. Expected off, auto, or manual.`);
  }

  const data: IngestedData = ingestFlightLog(
    flightLog as Parameters<typeof ingestFlightLog>[0],
  );

  let magGauss: MagGaussEntry[] = [];
  let magModelForEst: MagModelInput | null = null;
  let rawMagBiasRad = 0;
  let inFlightModelForExport: InFlightMagModel | null = null;
  let coverage: MagCoverage | null = null;
  let calMessage: string | null = null;

  if (magMode === 'off') {
    // OFF: No mag factor. FC quaternion heading used as-is.
    calMessage = 'Mag optimization: OFF (FC quaternion heading only).';
  } else if (magMode === 'auto') {
    // AUTO: Run in-flight ellipsoid calibration → route through correctMagStream.
    if (data.mag.length > 0 && data.quat.length > 0) {
      const inFlightCal = calibrateInFlightMag(data.mag, data.quat);
      if (inFlightCal && inFlightCal.valid && inFlightCal.rawModel) {
        // Route through correctMagStream — the identical path MANUAL uses
        magGauss = correctMagStream(
          data.mag,
          inFlightCal.rawModel as unknown as Parameters<typeof correctMagStream>[1],
        );
        magModelForEst = inFlightCal.syntheticModel;
        inFlightModelForExport = inFlightCal.rawModel;
        coverage = inFlightCal.coverage;
        calMessage = inFlightCal.message;
        console.log(
          '[MAG] AUTO (in-flight + correctMagStream): ' + inFlightCal.message,
        );
      } else {
        // Full 9-parameter ellipsoid fit failed (usually insufficient 3D
        // attitude coverage -- most survey flights are mostly-level and never
        // provide enough diversity to observe the full soft-iron matrix).
        // Before falling all the way to OFF (discarding the magnetometer entirely),
        // try a coarser hard-iron-only ladder tier: `computeMagHeadingBias`
        // fits just a 3-parameter hard-iron sphere center (needs far less
        // attitude diversity than a 9-parameter ellipsoid) and derives a
        // single scalar heading-bias correction, applied via the existing
        // rawMagBiasRad path (estimatorLoop.ts already supports this -- see
        // EstimatorOpts.rawMagBiasRad's doc comment -- it was wired for
        // manual/diagnostic use but never actually reached from AUTO's
        // failure path before this change; `computeMagHeadingBias` was
        // imported here but never called, a dead import).
        const headingBias = computeMagHeadingBias(data.mag, data.quat);
        if (headingBias.valid) {
          rawMagBiasRad = headingBias.biasRad;
          coverage = 'marginal';
          calMessage =
            '[MAG] AUTO 9-param ellipsoid fit FAILED' +
            (inFlightCal ? ': ' + inFlightCal.message : '') +
            ' — falling back to hard-iron-only heading-bias correction: ' +
            headingBias.message;
          console.log(calMessage);
        } else {
          // Hard-iron-only tier also failed — fall back to OFF (pure FC
          // quaternion heading, no mag correction at all).
          coverage = inFlightCal?.coverage ?? 'insufficient';
          calMessage =
            '[MAG] AUTO calibration FAILED at both ladder tiers (9-param: ' +
            (inFlightCal?.message ?? 'n/a') +
            '; hard-iron-only: ' + headingBias.message +
            ') — falling back to OFF.';
          console.log(calMessage);
        }
      }
    }
  } else if (magMode === 'manual') {
    // MANUAL: Load user-supplied model → correct through correctMagStream.
    if (magModel) {
      // Detect in-flight model format: version='in-flight' and has raw ellipsoid
      const isInFlightModel =
        (magModel as any).version === 'in-flight' &&
        (magModel as any).ellipsoid?.center != null &&
        (magModel as any).fusion?.gaussPerCorrectedUnit != null;

      if (isInFlightModel) {
        // Use in-flight model directly — it's already shaped for correctMagStream
        magGauss = correctMagStream(
          data.mag,
          magModel as Parameters<typeof correctMagStream>[1],
        );
        if ((magModel as any).fusion?.earthFieldNedGauss) {
          magModelForEst = magModel as unknown as MagModelInput;
        }
        calMessage = '[MAG] MANUAL: in-flight model loaded.';
        coverage = ((magModel as any)._origin?.coverage as MagCoverage) ?? 'good';
      } else {
        // Configurator bench model — run through loadMagCharacterizationModel
        const mr = loadMagCharacterizationModel(
          magModel as Parameters<typeof loadMagCharacterizationModel>[0],
        );
        if (mr.model) {
          magGauss = correctMagStream(
            data.mag,
            mr.model as Parameters<typeof correctMagStream>[1],
          );
          if (mr.model.fusion?.earthFieldNedGauss) {
            magModelForEst = mr.model as unknown as MagModelInput;
          }
          calMessage = '[MAG] MANUAL: user-supplied model loaded.';
          coverage = 'good';
        } else {
          calMessage = '[MAG] MANUAL: model failed validation — falling back to OFF.';
          console.log(calMessage);
        }
      }
    } else {
      calMessage = '[MAG] MANUAL: no model provided — falling back to OFF.';
      console.log(calMessage);
    }
  }

  // GPS home if available, otherwise the first valid GPS fix. For a flight armed
  // and held static at the launch point these are equivalent.
  const origin: EstimatorOrigin = data.gpsHome || {
    lat: data.gps[0]?.lat ?? 0,
    lon: data.gps[0]?.lon ?? 0,
    alt: data.gps[0]?.alt ?? 0,
  };

  // Double-count audit: the FC quaternion is the output of Betaflight's
  // onboard Mahony filter, which fuses its OWN magnetometer reading
  // (imuMahonyAHRSupdate's imuCalcMagErr) whenever `mag_hardware` is
  // non-zero (a physical mag sensor is configured and active) -- this is
  // logged in the BFL header and was already parsed into sysConfig by the
  // existing blackbox parser, but the estimator pipeline never read it before
  // this change. When BOTH the FC quaternion (via the quat-prior/accel-tilt
  // fusion) AND our own separate mag factor (manual/auto mode) are active,
  // the SAME physical magnetic-field measurement is being fused through two
  // channels: once indirectly (baked into the FC's own yaw estimate) and once
  // directly (our mag factor). This is a real, structural double-counting
  // risk, distinct from (and a plausible contributor to) the FC-quat-prior
  // double-counting already investigated above.
  //
  // Full resolution (properly modeling the correlation between the FC's own
  // mag-derived yaw and our independent mag factor) would need the same
  // real-data validation rigor and was out of scope for the time available.
  // As a conservative, documented mitigation: when onboard mag is
  // detected AND our own mag factor is active, widen sigmaYawMax by a modest,
  // fixed factor (1.3x) to partially account for the acknowledged (but not
  // fully modeled) correlation -- NOT a substitute for properly resolving it.
  const doubleCountRisk = detectMagDoubleCountRisk(data.sysConfig, magModelForEst);
  if (doubleCountRisk) {
    console.log(
      '[MAG-AUDIT] Onboard mag_hardware is active AND this pipeline is also fusing its own ' +
        'mag factor (mode=' + magMode + ') -- the FC quaternion already incorporates this same ' +
        'magnetometer via Betaflight\'s onboard Mahony fusion, so yaw information is being fused ' +
        'through two correlated channels. Widening sigmaYawMax by 1.3x as a conservative, partial ' +
        'mitigation (not a complete fix).',
    );
  }

  return {
    data: { ...data, mag: magGauss },
    origin,
    magModelForEst,
    rawMagBiasRad,
    inFlightModelForExport,
    coverage,
    calMessage,
    doubleCountRisk,
  };
}

/** Options for reconstructPose. All estimator knobs pass through; `magModel` is
 *  the raw parsed JSON (mag correction + earth field are derived internally). */
export interface ReconstructOpts extends Omit<EstimatorOpts, 'magModel' | 'onProgress'> {
  magModel?: Record<string, unknown> | null;
  /** Mag optimization mode. Default: 'auto' (in-flight ellipsoid cal). */
  magMode?: MagMode;
}

/**
 * Reconstruct a body-pose track from a parsed flight log.
 *
 * @param flightLog A parsed FlightLog.
 * @param opts      Output rate, mag model, and any estimator overrides.
 * @returns The reconstructed PoseTrack (full state, covariance, interpolating
 *          accessor). Serialize it, resample it, or call samplePosesAt() on it.
 */
export function reconstructPose(flightLog: unknown, opts: ReconstructOpts = {}): PoseTrack {
  const {
    magModel = null,
    magMode = 'auto',
    outputHz = DEFAULT_OUTPUT_HZ,
    sigmaYawMax = DEFAULT_SIGMA_YAW_MAX,
    ...estimatorOpts
  } = opts;

  const prep = prepareReconstruction(flightLog, magModel, magMode);

  // See prepareReconstruction's double-count audit comment: a conservative,
  // partial mitigation, not a full fix.
  const effectiveSigmaYawMax = prep.doubleCountRisk ? sigmaYawMax * 1.3 : sigmaYawMax;

  return estimatePoseTrack(prep.data, prep.origin, {
    outputHz,
    sigmaYawMax: effectiveSigmaYawMax,
    ...estimatorOpts,
    // Derived inputs always win over caller overrides — they are computed from
    // this specific log and must match the mag branch chosen above.
    magModel: prep.magModelForEst,
    rawMagBiasRad: prep.rawMagBiasRad,
  });
}
