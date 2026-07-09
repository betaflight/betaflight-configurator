/**
 * PoseTrack — the immutable intermediate representation (IR) for body-pose results.
 *
 * This is the single source of truth for all downstream consumers. Every serializer
 * reads from this; none of them shapes it. The IR carries full state, covariance,
 * provenance, and an interpolating accessor.
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) → world(NED), scalar-first [w, x, y, z]
 *
 * Rule: nothing format-specific leaks above the serializer layer.
 */

import type { LLA, PoseSampleInternal, Quat } from './poseSample.js';
import { eulerFromQuat } from './imuMechanization.js';

export const POSE_TRACK_SCHEMA = 1;

// ---------------------------------------------------------------------------
// Quaternion slerp
// ---------------------------------------------------------------------------

/** Spherical linear interpolation between two Hamilton quaternions [w,x,y,z]. */
function slerp(q1: Quat, q2: Quat, t: number): Quat {
  let cosTheta = q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3];
  let _q2 = q2;
  if (cosTheta < 0) {
    // Take the short path
    _q2 = [-q2[0], -q2[1], -q2[2], -q2[3]];
    cosTheta = -cosTheta;
  }
  if (cosTheta > 0.9995) {
    // Linear interpolation for small angles
    const result: Quat = [
      q1[0] + t * (_q2[0] - q1[0]),
      q1[1] + t * (_q2[1] - q1[1]),
      q1[2] + t * (_q2[2] - q1[2]),
      q1[3] + t * (_q2[3] - q1[3]),
    ];
    const n = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
    if (n < 1e-14) return [1, 0, 0, 0];
    return [result[0] / n, result[1] / n, result[2] / n, result[3] / n];
  }
  const theta0 = Math.acos(cosTheta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.sin((1 - t) * theta0) / sinTheta0;
  const s1 = Math.sin(t * theta0) / sinTheta0;
  return [
    s0 * q1[0] + s1 * _q2[0],
    s0 * q1[1] + s1 * _q2[1],
    s0 * q1[2] + s1 * _q2[2],
    s0 * q1[3] + s1 * _q2[3],
  ];
}

// ---------------------------------------------------------------------------
// Binary search
// ---------------------------------------------------------------------------

/** Returns the index of the rightmost sample where sample.tUs <= tUs. */
function findIndexBefore(samples: PoseSampleInternal[], tUs: number): number {
  let lo = 0, hi = samples.length - 1;
  if (tUs <= samples[lo].tUs) return lo;
  if (tUs >= samples[hi].tUs) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tUs <= tUs) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// PoseTrack type
// ---------------------------------------------------------------------------

export interface PoseTrackMeta {
  schemaVersion: number;
  frame: string;
  georefOrigin: LLA;
  units: {
    pos: string;
    vel: string;
    attitude: string;
    time: string;
    covPos: string;
    covVel: string;
    covAtt: string;
  };
  source: Record<string, unknown>;
}

export interface PoseTrack {
  meta: PoseTrackMeta;
  samples: PoseSampleInternal[];
  /** Interpolating accessor — returns a sample at arbitrary tUs using slerp/lerp. */
  sampleAt(tUs: number): PoseSampleInternal | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreatePoseTrackOpts {
  samples: PoseSampleInternal[];
  georefOrigin: LLA;
  source: Record<string, unknown>;
}

/**
 * Create a PoseTrack from estimator output.
 */
export function createPoseTrack({ samples, georefOrigin, source }: CreatePoseTrackOpts): PoseTrack {
  const sorted = [...samples].sort((a, b) => a.tUs - b.tUs);

  const track: PoseTrack = {
    meta: {
      schemaVersion: POSE_TRACK_SCHEMA,
      frame: 'body=FRD, world=NED',
      georefOrigin: { ...georefOrigin },
      units: {
        pos: 'm',
        vel: 'm/s',
        attitude: 'quaternion[w,x,y,z]',
        time: 'us',
        covPos: 'm^2 (3x3 NED)',
        covVel: '(m/s)^2 (3x3 NED)',
        covAtt: 'rad^2 (3x3)',
      },
      source: { ...source },
    },

    samples: sorted,

    sampleAt(tUs: number): PoseSampleInternal | null {
      if (sorted.length === 0) return null;
      if (sorted.length === 1) return sorted[0];

      if (tUs <= sorted[0].tUs) return sorted[0];
      if (tUs >= sorted[sorted.length - 1].tUs) return sorted[sorted.length - 1];

      const i = findIndexBefore(sorted, tUs);
      const j = i + 1;
      if (j >= sorted.length) return sorted[i];

      const si = sorted[i];
      const sj = sorted[j];
      const dt = sj.tUs - si.tUs;
      if (dt <= 0) return si;

      const t = (tUs - si.tUs) / dt;

      // Lerp position
      const p: [number, number, number] = [
        si.p[0] + t * (sj.p[0] - si.p[0]),
        si.p[1] + t * (sj.p[1] - si.p[1]),
        si.p[2] + t * (sj.p[2] - si.p[2]),
      ];

      // Lerp velocity
      const v: [number, number, number] = [
        si.v[0] + t * (sj.v[0] - si.v[0]),
        si.v[1] + t * (sj.v[1] - si.v[1]),
        si.v[2] + t * (sj.v[2] - si.v[2]),
      ];

      // Slerp quaternion
      const q = slerp(si.q, sj.q, t);

      // Lerp LLA if present
      let lla: LLA | null = null;
      if (si.lla && sj.lla) {
        lla = {
          lat: si.lla.lat + t * (sj.lla.lat - si.lla.lat),
          lon: si.lla.lon + t * (sj.lla.lon - si.lla.lon),
          alt: si.lla.alt + t * (sj.lla.alt - si.lla.alt),
        };
      }

      // Lerp covariance
      const lerpCov = (ca: number[][] | null, cb: number[][] | null): number[][] | null => {
        if (!ca || !cb) return ca || cb;
        const n = ca.length;
        const result: number[][] = new Array(n);
        for (let ri = 0; ri < n; ri++) {
          result[ri] = new Array(n);
          for (let ci = 0; ci < n; ci++) {
            result[ri][ci] = ca[ri][ci] + t * (cb[ri][ci] - ca[ri][ci]);
          }
        }
        return result;
      };
      const covPos = lerpCov(si.covPos, sj.covPos);
      const covVel = lerpCov(si.covVel, sj.covVel);
      const covAtt = lerpCov(si.covAtt, sj.covAtt);

      const result: PoseSampleInternal = {
        tUs,
        p,
        v,
        q,
        lla,
        covPos: covPos || [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        covVel: covVel || [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        covAtt: covAtt || [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        // Recompute Euler angles from the interpolated (slerped) quaternion.
        // Without this an interpolated sample would carry no euler, and the CSV
        // and GPX serializers — which read euler for roll/pitch/heading/tilt —
        // would emit blank orientation columns for every off-grid timestamp.
        euler: eulerFromQuat(q),
      };

      // Carry diagnostics from the nearest sample
      if (si.diagnostics && t < 0.5) result.diagnostics = si.diagnostics;
      else if (sj.diagnostics) result.diagnostics = sj.diagnostics;

      return result;
    },
  };

  return track;
}

// ---------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------

/**
 * Resample a PoseTrack to a uniform output rate using slerp/lerp interpolation.
 *
 * Canonical path:
 *  - estimatePoseTrack at high rate for fidelity-critical analysis
 *  - resamplePoseTrack for lightweight replay / consumer delivery
 */
export function resamplePoseTrack(poseTrack: PoseTrack, hz: number): PoseTrack {
  if (!Number.isFinite(hz) || hz <= 0) {
    throw new Error('resamplePoseTrack: hz must be a positive finite number.');
  }
  const { samples, meta } = poseTrack;
  if (!samples || samples.length === 0) {
    return createPoseTrack({
      samples: [],
      georefOrigin: meta.georefOrigin,
      source: meta.source,
    });
  }

  const t0 = samples[0].tUs;
  const t1 = samples[samples.length - 1].tUs;
  const dtUs = 1e6 / hz;
  const count = Math.floor((t1 - t0) / dtUs) + 1;

  const resampled: PoseSampleInternal[] = [];
  for (let i = 0; i < count; i++) {
    const tUs = t0 + i * dtUs;
    const s = poseTrack.sampleAt(tUs);
    if (s) resampled.push(s);
  }

  return createPoseTrack({
    samples: resampled,
    georefOrigin: meta.georefOrigin,
    source: { ...meta.source, resampledFromHz: hz },
  });
}

/**
 * Extract poses at an explicit, caller-supplied list of timestamps.
 *
 * Unlike resamplePoseTrack (which produces a uniform grid), this returns a pose
 * at each timestamp the caller asks for — the offsets may be irregular, in any
 * order, and need not align to the estimator's output grid. Each pose is
 * interpolated (slerp/lerp) and fully populated, including Euler angles, so the
 * result can be serialized to CSV/JSON/GPX directly. Useful when poses must line
 * up with events recorded on a separate timeline.
 *
 * @param track    a reconstructed PoseTrack
 * @param timesUs  timestamps in microseconds, on the same clock as the track's
 *                 samples (FC boot time). Out-of-range values clamp to the
 *                 first/last sample (matching sampleAt).
 * @returns a new PoseTrack whose samples are exactly the requested timestamps,
 *          sorted ascending. Timestamps that cannot be sampled (empty track)
 *          are skipped.
 */
export function samplePosesAt(track: PoseTrack, timesUs: number[]): PoseTrack {
  const samples: PoseSampleInternal[] = [];
  for (const tUs of timesUs) {
    const s = track.sampleAt(tUs);
    if (s) samples.push(s);
  }
  return createPoseTrack({
    samples,
    georefOrigin: track.meta.georefOrigin,
    source: { ...track.meta.source, sampledAtCount: timesUs.length },
  });
}
