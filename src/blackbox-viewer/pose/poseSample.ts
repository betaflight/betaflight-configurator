/**
 * PoseSample — core type definitions for the body-pose reconstruction pipeline.
 *
 * The estimator produces PoseSampleInternal objects. Serializers consume them
 * through the PoseTrack IR and project them into output formats (KML, CSV, GPX, JSON).
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) → world(NED), scalar-first [w, x, y, z]
 */

/** Geodetic coordinates (WGS84) */
export interface LLA {
  lat: number;
  lon: number;
  alt: number; // metres MSL
}

/** Euler angles in degrees (ZYX intrinsic, body FRD → world NED) */
export interface Euler {
  /** ZYX roll: atan2(R[2][1], R[2][2]) * 180/π */
  rollDeg: number;
  /** ZYX pitch: -asin(R[2][0]) * 180/π (negative = nose UP) */
  pitchDeg: number;
  /** Geographic yaw: atan2(col0.E, col0.N) * 180/π, 0=North, clockwise positive */
  headingDeg: number;
  /** Tilt from upright: acos(R[2][2]) * 180/π. 0=level, 180=inverted */
  tiltDeg: number;
}

/**
 * Internal per-instant record produced by the estimator.
 * These are the raw samples that populate a PoseTrack.
 */
export interface PoseSampleInternal {
  /** Time in microseconds since FC boot */
  tUs: number;
  /** Position in world NED [n, e, d] metres */
  p: [number, number, number];
  /** Velocity in world NED [vn, ve, vd] m/s */
  v: [number, number, number];
  /** Attitude quaternion body→world [w, x, y, z] */
  q: [number, number, number, number];
  /** Geodetic coordinates (null if origin not set) */
  lla: LLA | null;
  /** 3×3 position covariance in NED (m²) */
  covPos: number[][];
  /** 3×3 velocity covariance in NED ((m/s)²) */
  covVel: number[][];
  /** 3×3 attitude covariance (rad²) */
  covAtt: number[][];
  /** Pre-computed Euler angles (added at sample build time) */
  euler?: Euler;
  /** Optional per-sample diagnostic metadata */
  diagnostics?: Record<string, unknown>;
}

/** 3-vector helper */
export type Vec3 = [number, number, number];

/** 4-element quaternion [w, x, y, z] */
export type Quat = [number, number, number, number];
