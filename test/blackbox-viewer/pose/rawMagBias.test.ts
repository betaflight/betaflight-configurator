/**
 * Unit tests for model-free raw-mag heading-bias estimator.
 *
 * Tests the hard-iron sphere fit, coverage check, and bias computation
 * on synthetic data where the correct answer is known.
 */

import { describe, it, expect } from 'vitest';
import {
  fitHardIron,
  checkHeadingCoverage,
  tiltCompensatedMagHeadingDeg,
  computeMagHeadingBias,
} from '../../../src/blackbox-viewer/pose/rawMagBias.js';
import type { HardIronResult, CoverageCheck } from '../../../src/blackbox-viewer/pose/rawMagBias.js';
import { quatFromAxisAngle, quatMultiply } from '../../../src/blackbox-viewer/pose/imuMechanization.js';
import type { Vec3, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';
import { seededRng } from './testHelpers.js';

// ---------------------------------------------------------------------------
// Hard-iron sphere fit
// ---------------------------------------------------------------------------

describe('fitHardIron', () => {
  it('returns invalid for fewer than 20 samples', () => {
    const samples: Vec3[] = Array.from({ length: 19 }, () => [1, 1, 1] as Vec3);
    const r = fitHardIron(samples);
    expect(r.valid).toBe(false);
  });

  it('recovers known center and radius from noise-free data', () => {
    // Generate points on a sphere with center [500, 200, -100] and radius 1200
    const cx = 500, cy = 200, cz = -100, R = 1200;
    const rng = seededRng(0x1a2b3c4d);
    const samples: Vec3[] = [];
    for (let i = 0; i < 200; i++) {
      const theta = rng() * 2 * Math.PI;
      const phi = Math.acos(2 * rng() - 1);
      const x = cx + R * Math.sin(phi) * Math.cos(theta);
      const y = cy + R * Math.sin(phi) * Math.sin(theta);
      const z = cz + R * Math.cos(phi);
      samples.push([x, y, z]);
    }

    const r = fitHardIron(samples);
    expect(r.valid).toBe(true);
    expect(r.center[0]).toBeCloseTo(cx, -1); // within ~10 counts
    expect(r.center[1]).toBeCloseTo(cy, -1);
    expect(r.center[2]).toBeCloseTo(cz, -1);
    expect(r.radius).toBeCloseTo(R, -1);
    expect(r.rms).toBeLessThan(1.0);
  });

  it('handles data with noise', () => {
    const cx = 300, cy = -400, cz = 800, R = 1000;
    const rng = seededRng(0xdeadbeef);
    const noise = () => (rng() - 0.5) * 30; // ±15 ADC noise
    const samples: Vec3[] = [];
    for (let i = 0; i < 500; i++) {
      const theta = rng() * 2 * Math.PI;
      const phi = Math.acos(2 * rng() - 1);
      const x = cx + R * Math.sin(phi) * Math.cos(theta) + noise();
      const y = cy + R * Math.sin(phi) * Math.sin(theta) + noise();
      const z = cz + R * Math.cos(phi) + noise();
      samples.push([x, y, z]);
    }

    const r = fitHardIron(samples);
    expect(r.valid).toBe(true);
    expect(r.center[0]).toBeCloseTo(cx, -1); // within ~10 ADC
    expect(r.center[1]).toBeCloseTo(cy, -1);
    expect(r.center[2]).toBeCloseTo(cz, -1);
    // RMS should reflect the noise level (~15 ADC)
    expect(r.rms).toBeGreaterThan(5);
    expect(r.rms).toBeLessThan(40);
  });
});

// ---------------------------------------------------------------------------
// Coverage check
// ---------------------------------------------------------------------------

describe('checkHeadingCoverage', () => {
  it('returns insufficient for empty data', () => {
    const r = checkHeadingCoverage([]);
    expect(r.sufficient).toBe(false);
  });

  it('returns sufficient for full 360° coverage', () => {
    const quats: Array<{ tUs: number; q: Quat }> = [];
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      const q = quatFromAxisAngle([0, 0, 1] as Vec3, rad);
      quats.push({ tUs: deg * 1000, q });
    }
    const r = checkHeadingCoverage(quats);
    expect(r.sufficient).toBe(true);
    expect(r.spreadDeg).toBeGreaterThanOrEqual(349); // floating point: 350° coverage
  });

  it('returns insufficient for narrow heading range', () => {
    const quats: Array<{ tUs: number; q: Quat }> = [];
    for (let deg = 0; deg <= 45; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const q = quatFromAxisAngle([0, 0, 1] as Vec3, rad);
      quats.push({ tUs: deg * 1000, q });
    }
    const r = checkHeadingCoverage(quats);
    expect(r.sufficient).toBe(false);
    expect(r.spreadDeg).toBeLessThan(90);
  });
});

// ---------------------------------------------------------------------------
// Tilt-compensated mag heading
// ---------------------------------------------------------------------------

describe('tiltCompensatedMagHeadingDeg', () => {
  it('returns 0° when mag points forward and drone is level', () => {
    // Level drone pointing North: q = [1, 0, 0, 0]
    const q: Quat = [1, 0, 0, 0];
    // Mag pointing forward (X positive): mag = [1, 0, 0]
    const mag: Vec3 = [1, 0, 0];
    const h = tiltCompensatedMagHeadingDeg(mag, q);
    expect(Math.abs(h)).toBeLessThan(1); // ~0°
  });

  it('returns ~−90° when mag points right and drone is level', () => {
    const q: Quat = [1, 0, 0, 0];
    // Mag pointing right (Y positive in FRD). In leveled frame:
    //   m = [0, 1, 0], atan2(−1, 0) = −90° (equivalent to 270° heading)
    const mag: Vec3 = [0, 1, 0];
    const h = tiltCompensatedMagHeadingDeg(mag, q);
    // −90° (270°) — the mag pointing right means the field is East of the drone
    expect(h).toBeCloseTo(-90, 0);
  });

  it('handles nose-down pitch correctly', () => {
    // Nose down 45° (positive pitch) — drone tilted forward
    const pitch45 = quatFromAxisAngle([0, 1, 0] as Vec3, 45 * Math.PI / 180);
    const q = pitch45;
    // Mag still pointing forward in body frame
    const mag: Vec3 = [1, 0, 0];
    const h = tiltCompensatedMagHeadingDeg(mag, q);
    // After tilt compensation, heading should still be 0° (mag is in the XZ plane)
    expect(Math.abs(h)).toBeLessThan(5);
  });

  it('handles roll correctly', () => {
    // Roll right 30°
    const roll30 = quatFromAxisAngle([1, 0, 0] as Vec3, 30 * Math.PI / 180);
    const q = roll30;
    // Mag pointing forward
    const mag: Vec3 = [1, 0, 0];
    const h = tiltCompensatedMagHeadingDeg(mag, q);
    expect(Math.abs(h)).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// computeMagHeadingBias — synthetic check
// ---------------------------------------------------------------------------

describe('computeMagHeadingBias', () => {
  it('detects insufficient coverage and returns invalid', () => {
    // Build synthetic data with narrow heading range
    const magRaw: Array<{ tUs: number; meas: Vec3 }> = [];
    const fcQuat: Array<{ tUs: number; q: Quat }> = [];
    const hiCenter: Vec3 = [100, 200, -50];

    const rng1 = seededRng(0xabcdef01);
    for (let i = 0; i < 200; i++) {
      const deg = (i / 200) * 45; // 0-45° only — narrow
      const rad = (deg * Math.PI) / 180;
      const q = quatFromAxisAngle([0, 0, 1] as Vec3, rad);
      fcQuat.push({ tUs: i * 50_000, q });

      // Mag on sphere around hiCenter
      const theta = rng1() * 2 * Math.PI;
      const phi = Math.acos(2 * rng1() - 1);
      const R = 800;
      magRaw.push({
        tUs: i * 50_000,
        meas: [
          hiCenter[0] + R * Math.sin(phi) * Math.cos(theta),
          hiCenter[1] + R * Math.sin(phi) * Math.sin(theta),
          hiCenter[2] + R * Math.cos(phi),
        ],
      });
    }

    const r = computeMagHeadingBias(magRaw, fcQuat);
    expect(r.valid).toBe(false);
    expect(r.coverage.sufficient).toBe(false);
  });

  it('produces valid bias for full-coverage synthetic data', () => {
    const magRaw: Array<{ tUs: number; meas: Vec3 }> = [];
    const fcQuat: Array<{ tUs: number; q: Quat }> = [];
    const hiCenter: Vec3 = [500, -200, 300];

    const rng2 = seededRng(0xfeedface);
    // Generate a flight with full 360° heading coverage
    for (let i = 0; i < 360; i++) {
      const deg = i; // 0–359°
      const rad = (deg * Math.PI) / 180;
      // Add some pitch variation
      const pitchDeg = 10 * Math.sin(deg * 3 * Math.PI / 180);
      const rollDeg = 5 * Math.cos(deg * 2 * Math.PI / 180);
      const qYaw = quatFromAxisAngle([0, 0, 1] as Vec3, rad);
      const qPitch = quatFromAxisAngle([0, 1, 0] as Vec3, pitchDeg * Math.PI / 180);
      const qRoll = quatFromAxisAngle([1, 0, 0] as Vec3, rollDeg * Math.PI / 180);
      const q = quatMultiply(qYaw, quatMultiply(qPitch, qRoll));
      fcQuat.push({ tUs: i * 50_000, q });

      // Mag: sphere around hiCenter, but with a heading-consistent component
      const phi = Math.acos(2 * rng2() - 1);
      const theta = rng2() * 2 * Math.PI;
      const R = 900;
      magRaw.push({
        tUs: i * 50_000,
        meas: [
          hiCenter[0] + R * Math.sin(phi) * Math.cos(theta),
          hiCenter[1] + R * Math.sin(phi) * Math.sin(theta),
          hiCenter[2] + R * Math.cos(phi),
        ],
      });
    }

    const r = computeMagHeadingBias(magRaw, fcQuat);
    console.log(`  ${r.message}`);
    expect(r.valid).toBe(true);
    expect(r.coverage.sufficient).toBe(true);
    expect(r.coverage.spreadDeg).toBeGreaterThanOrEqual(299); // near-360° coverage
    expect(r.hardIronCenter[0]).toBeCloseTo(hiCenter[0], -1);
    expect(r.hardIronCenter[1]).toBeCloseTo(hiCenter[1], -1);
    expect(r.hardIronCenter[2]).toBeCloseTo(hiCenter[2], -1);
  });
});
