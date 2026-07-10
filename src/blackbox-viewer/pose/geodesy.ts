/**
 * WGS84 geodesy utilities: LLH ↔ ECEF ↔ ENU ↔ NED.
 *
 * The internal world frame is NED (North, East, Down). GPS positions are
 * converted from geodetic (lat/lon/alt MSL) to NED metres via ECEF+ENU,
 * then ENU is converted to NED in a single step.
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 */

import type { LLA, Vec3 } from './poseSample.js';

/** WGS84 semi-major axis (m), flattening, and eccentricity^2 (derived). */
export const WGS84_A = 6378137.0;
export const WGS84_F = 1.0 / 298.257223563;
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** Degrees to radians */
function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Radians to degrees */
function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// ECEF / ENU / NED conversions
// ---------------------------------------------------------------------------

/** Earth-Centered, Earth-Fixed Cartesian position (m). */
export interface EcefPos {
  x: number;
  y: number;
  z: number;
}

/** East-North-Up local tangent-plane position relative to an origin (m). */
export interface EnuPos {
  e: number;
  n: number;
  u: number;
}

/** North-East-Down local tangent-plane position relative to an origin (m),
 *  the estimator's world frame. */
export interface NedPos {
  n: number;
  e: number;
  d: number;
}

/**
 * Geodetic (WGS84) to Earth-Centered-Earth-Fixed.
 */
export function llhToEcef(lat: number, lon: number, alt: number): EcefPos {
  const rlat = deg2rad(lat);
  const rlon = deg2rad(lon);
  const sinLat = Math.sin(rlat);
  const cosLat = Math.cos(rlat);
  const sinLon = Math.sin(rlon);
  const cosLon = Math.cos(rlon);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return {
    x: (N + alt) * cosLat * cosLon,
    y: (N + alt) * cosLat * sinLon,
    z: (N * (1 - WGS84_E2) + alt) * sinLat,
  };
}

/**
 * ECEF to ENU (East, North, Up) local tangent plane about an origin.
 */
export function ecefToEnu(point: EcefPos, lat0: number, lon0: number, alt0: number): EnuPos {
  const origin = llhToEcef(lat0, lon0, alt0);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;

  const rlat0 = deg2rad(lat0);
  const rlon0 = deg2rad(lon0);
  const sinLat = Math.sin(rlat0);
  const cosLat = Math.cos(rlat0);
  const sinLon = Math.sin(rlon0);
  const cosLon = Math.cos(rlon0);

  return {
    e: -sinLon * dx + cosLon * dy,
    n: -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
    u: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz,
  };
}

/**
 * ENU to NED.  NED = (ENU.north, ENU.east, -ENU.up)
 */
export function enuToNed(enu: EnuPos): NedPos {
  return { n: enu.n, e: enu.e, d: -enu.u };
}

/**
 * Geodetic to NED (convenience, wrapping the above).
 */
export function llhToNed(
  lat: number,
  lon: number,
  alt: number,
  lat0: number,
  lon0: number,
  alt0: number,
): NedPos {
  const ecef = llhToEcef(lat, lon, alt);
  const enu = ecefToEnu(ecef, lat0, lon0, alt0);
  return enuToNed(enu);
}

/**
 * NED to geodetic using Bowring's iterative inverse.
 */
export function nedToLlh(
  ned: NedPos,
  lat0: number,
  lon0: number,
  alt0: number,
  iterations = 5,
): LLA {
  const enu: EnuPos = { e: ned.e, n: ned.n, u: -ned.d };

  const originEcef = llhToEcef(lat0, lon0, alt0);
  const rlat0 = deg2rad(lat0);
  const rlon0 = deg2rad(lon0);
  const sinLat = Math.sin(rlat0);
  const cosLat = Math.cos(rlat0);
  const sinLon = Math.sin(rlon0);
  const cosLon = Math.cos(rlon0);

  const enuVec: Vec3 = [enu.e, enu.n, enu.u];
  const RT: number[][] = [
    [-sinLon, -sinLat * cosLon, cosLat * cosLon],
    [cosLon, -sinLat * sinLon, cosLat * sinLon],
    [0, cosLat, sinLat],
  ];

  const x = originEcef.x + RT[0][0] * enuVec[0] + RT[0][1] * enuVec[1] + RT[0][2] * enuVec[2];
  const y = originEcef.y + RT[1][0] * enuVec[0] + RT[1][1] * enuVec[1] + RT[1][2] * enuVec[2];
  const z = originEcef.z + RT[2][0] * enuVec[0] + RT[2][1] * enuVec[1] + RT[2][2] * enuVec[2];

  const iters = Math.max(1, Math.floor(iterations));
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  let N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) ** 2);
  let alt = p / Math.cos(lat) - N;

  for (let i = 0; i < iters; i++) {
    const sinLatI = Math.sin(lat);
    N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatI * sinLatI);
    alt = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - WGS84_E2 * N / (N + alt)));
  }

  const lon = Math.atan2(y, x);

  return {
    lat: rad2deg(lat),
    lon: rad2deg(lon),
    alt,
  };
}

// ---------------------------------------------------------------------------
// Haversine & bearing
// ---------------------------------------------------------------------------

/**
 * Haversine great-circle distance (metres).
 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
    Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Geographic bearing from point A to point B (degrees, 0=North, clockwise).
 */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rlat1 = deg2rad(lat1);
  const rlat2 = deg2rad(lat2);
  const dLon = deg2rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rlat2);
  const x =
    Math.cos(rlat1) * Math.sin(rlat2) -
    Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLon);
  return ((rad2deg(Math.atan2(y, x)) % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// Local tangent offset (for triad endpoint positioning)
// ---------------------------------------------------------------------------

/** Flat-earth-approximation lat/lon/alt deltas (deg, deg, m) for a small NED
 *  offset near a reference point, returned by localTangentOffset. */
export interface LocalTangentOffset {
  dLat: number;
  dLon: number;
  dAlt: number;
}

/**
 * Converts a NED offset vector to lat/lon/alt deltas using the flat-earth
 * approximation, which is exact at the few-metre scale of triad lines.
 */
export function localTangentOffset(offset: NedPos, lat: number): LocalTangentOffset {
  const M_PER_DEG_LAT = 111320;
  const cosLat = Math.cos(deg2rad(lat));
  const dLat = offset.n / M_PER_DEG_LAT;
  const dLon = offset.e / (M_PER_DEG_LAT * cosLat);
  const dAlt = -offset.d;
  return { dLat, dLon, dAlt };
}
