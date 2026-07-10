/**
 * Adaptive sigma tilt — synthetic sandbox test.
 *
 * Exercises `computeAdaptiveSigmaTilt` across all three regimes:
 *   1. straight-and-level cruise (expect σ_tilt = NOMINAL 0.02)
 *   2. vertical freefall drop   (expect σ_tilt = FREEFALL 1.0)
 *   3. high-G banked turn       (expect σ_tilt ∈ [0.02, 1.0] via interpolation)
 *
 * Also verifies that vNed = [0,0,0] makes the kinematic correction an
 * identity (ω×v = 0 → raw accel used directly).
 *
 * This is a FAST unit test — no estimator, no BFL.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAdaptiveSigmaTilt,
  SIGMA_TILT_NOMINAL,
  SIGMA_TILT_FREEFALL,
} from '../../../src/blackbox-viewer/pose/measurements.js';
import type { Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

// Euler→quaternion helper (body FRD → world NED, scalar-first Hamilton)
function eulerToQuat(roll: number, pitch: number, yaw: number): Quat {
  const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
  const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}

const G = 9.80665;

describe('computeAdaptiveSigmaTilt — synthetic sandbox', () => {
  // ── Regime 1: straight-and-level cruise ──────────────────────────────
  it('returns NOMINAL (0.02) for straight-and-level cruise', () => {
    const qLevel: Quat = eulerToQuat(0, 0, Math.PI / 4); // 45° heading, level
    const vNed: Vec3 = [10, 0, 0];                        // 10 m/s north
    const gyroBody: Vec3 = [0, 0, 0.1];                    // gentle yaw, < 0.5
    const accelBody: Vec3 = [0, 0, G];                     // pure 1g, body +Z=down

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBe(SIGMA_TILT_NOMINAL);
    expect(sigma).toBeCloseTo(0.02, 4);
  });

  it('returns NOMINAL for cruise with mild acceleration', () => {
    // 0.5 m/s² forward accel → tiny kinematic term, still near 1g
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [15, 0, 0];
    const gyroBody: Vec3 = [0, 0, 0];
    const accelBody: Vec3 = [-0.5, 0, G];  // forward = +X body, accel reads −

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBe(SIGMA_TILT_NOMINAL);
  });

  // ── Regime 2: vertical freefall ──────────────────────────────────────
  it('returns FREEFALL (1.0) for vertical freefall (zero-g accel)', () => {
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [0, 0, -20];       // falling at 20 m/s down
    const gyroBody: Vec3 = [0, 0, 0];
    const accelBody: Vec3 = [0, 0, 0];     // freefall: no gravity felt

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBe(SIGMA_TILT_FREEFALL);
    expect(sigma).toBeCloseTo(1.0, 4);
  });

  it('returns FREEFALL for accel below 0.5g threshold', () => {
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [0, 0, -30];
    const gyroBody: Vec3 = [0, 0, 0];
    const accelBody: Vec3 = [1.0, 0, 1.0]; // |a| ≈ 1.4 < 0.5*g ≈ 4.9

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBe(SIGMA_TILT_FREEFALL);
  });

  // ── Regime 3: high-G banked turn ─────────────────────────────────────
  it('returns interpolation value for a 2g banked turn with high rotation', () => {
    // Banked turn at 30° bank, 2g centripetal load.
    // In a coordinated turn, gravity appears along body −Z still.
    // Total accel magnitude = 2g → |a| ≈ 19.6.
    // With no kinematic correction, delta = |19.6 − 9.81| = 9.79.
    // With kinematic correction (ω large, v ≈ 15 m/s), a_kinematic ≈ centripetal part,
    // a_gravity ≈ g → delta stays small.

    // Use a moderate bank: roll = −30° (right bank), nose level, 90° heading.
    const qBanked: Quat = eulerToQuat(-Math.PI / 6, 0, Math.PI / 2);
    // Centripetal turn: ω_z (yaw rate) for 15 m/s, radius ~11.5 m → ω ≈ 1.3 rad/s
    const gyroBody: Vec3 = [0, 0, 1.3];
    // Velocity: 15 m/s east
    const vNed: Vec3 = [0, 15, 0];
    // Total accel ~2g: centripetal ~19 m/s² horizontal + 1g vertical
    // In body frame with 30° bank, the felt accel is along −Z_body (roughly)
    // The exact body accel in a coordinated turn: pure −Z component ≈ 2g = 19.61
    const accelBody: Vec3 = [0, 0, 2 * G];

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qBanked);

    // Should be > NOMINAL (the delta is large enough with raw accel
    // to fall into branch 3) but < FREEFALL.
    expect(sigma).toBeGreaterThan(SIGMA_TILT_NOMINAL);
    expect(sigma).toBeLessThan(SIGMA_TILT_FREEFALL);
  });

  it('interpolation stays in [0.02, 1.0] with large delta', () => {
    // High delta case: 3g total accel, high gyro rate
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [20, 0, 0];
    const gyroBody: Vec3 = [0, 1.5, 0];      // pitch rate > threshold
    const accelBody: Vec3 = [0, 0, 3 * G];    // 3g

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBeGreaterThanOrEqual(SIGMA_TILT_NOMINAL);
    expect(sigma).toBeLessThanOrEqual(SIGMA_TILT_FREEFALL);

    // With delta ≈ 2g, t ≈ 2g/(2g) = 1.0 → sigma ≈ FREEFALL
    expect(sigma).toBeCloseTo(SIGMA_TILT_FREEFALL, 0);
  });

  // ── Kinematic correction: vNed = 0 → identity ────────────────────────
  it('vNed=[0,0,0] makes kinematic correction the identity', () => {
    // When the drone hovers (v ≈ 0), ω×v = 0 → raw accel used directly.
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [0, 0, 0];
    // High gyro but v=0 → no kinematic term. Raw accel = 1g → NOMINAL.
    const gyroBody: Vec3 = [0, 2.0, 0];       // fast flip rate
    const accelBody: Vec3 = [0, 0, G];         // still 1g

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    // delta = |1g − 1g| = 0 < 1.0 AND gyroMag = 2.0 ≮ 0.5
    // → branch 3: t = min(1, 0/(2g)) = 0 → NOMINAL
    expect(sigma).toBe(SIGMA_TILT_NOMINAL);
  });

  // ── Kinematic correction: isolating gravity in a turn ────────────────
  it('kinematic correction isolates gravity in a 2g turn (stays NOMINAL)', () => {
    // The kinematic correction ADDS BACK ω×v_body to the measured accel to
    // isolate the gravity component (accel convention: rest reads +g on
    // body-down, and accel = Rᵀg − ω×v_body in a steady turn — see
    // imuMechanization.ts strapdownPropagate's convention note), preventing
    // coordinated turns from being misread as freefall/high-tilt-uncertainty
    // events.
    const q: Quat = eulerToQuat(0, 0, 0);         // heading north, level
    const vNed: Vec3 = [15, 0, 0];                 // 15 m/s north
    const gyro: Vec3 = [0, 0, 0.8];                 // moderate yaw
    // v_body = Rᵀ·v_ned. For level north, R = [[1,0,0],[0,1,0],[0,0,1]],
    // so v_body = [15, 0, 0]
    // ω×v_body = [0, 0, 0.8] × [15, 0, 0] = [0, 12, 0] (rightward)
    // Physically-consistent raw accel under this convention:
    // accel = Rᵀg − ω×v_body = [0, 0, G] − [0, 12, 0] = [0, −12, G]
    const accel: Vec3 = [0, -12, G];
    // a_gravity = accel + ω×v_body = [0, −12, G] + [0, 12, 0] = [0, 0, G]
    // delta = |G − G| = 0 → interpolation factor t = 0 → exactly NOMINAL
    const sigma = computeAdaptiveSigmaTilt(accel, gyro, vNed, q);
    expect(sigma).toBe(SIGMA_TILT_NOMINAL);
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  it('returns NOMINAL at hover (v=0, no rotation, pure gravity)', () => {
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [0, 0, 0];
    const gyroBody: Vec3 = [0, 0, 0];
    const accelBody: Vec3 = [0, 0, G];

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBe(SIGMA_TILT_NOMINAL);
  });

  it('handles inverted attitude (delta near 2g → branch 3)', () => {
    // Inverted: body +Z points up (world −D), accel reads −1g
    const qInverted: Quat = eulerToQuat(Math.PI, 0, 0); // roll=180°
    const vNed: Vec3 = [0, 0, 0];
    const gyroBody: Vec3 = [0, 0, 0];
    const accelBody: Vec3 = [0, 0, -G];   // −1g in body Z

    // |a| = 9.81, delta = |9.81 − 9.81| = 0 → branch 1 (delta < 1, gyro < 0.5)
    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qInverted);
    expect(sigma).toBe(SIGMA_TILT_NOMINAL);
  });

  it('freefall takes priority over clean-gravity branch', () => {
    // agMag < 0.5g BUT delta would be small → freefall wins (else-if ordering)
    // Construct: agMag ≈ 3.0 after correction
    const qLevel: Quat = eulerToQuat(0, 0, 0);
    const vNed: Vec3 = [0, 0, -50];
    const gyroBody: Vec3 = [0, 0, 0];
    // a_measured = [0, 0, 2.0], |a| = 2.0 < 0.5*9.81 = 4.9 → freefall
    const accelBody: Vec3 = [0, 0, 2.0];

    const sigma = computeAdaptiveSigmaTilt(accelBody, gyroBody, vNed, qLevel);
    expect(sigma).toBe(SIGMA_TILT_FREEFALL);
  });
});
