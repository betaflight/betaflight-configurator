import { describe, it, expect } from 'vitest';
import {
  createRng,
  randn,
  generateCircularTrajectory,
  generateStraightTrajectory,
  generateDynamicTrajectory,
  generateSensorStreams,
} from './synthetic.js';
import { llhToNed } from '../../../src/blackbox-viewer/pose/geodesy.js';

describe('synthetic — PRNG', () => {
  it('same seed gives same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds give different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    const vals = new Set<number>();
    for (let i = 0; i < 100; i++) vals.add(a());
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (vals.has(b())) same++;
    }
    expect(same).toBeLessThan(10);
  });

  it('randn produces approximately normal distribution', () => {
    const rng = createRng(123);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(randn(rng, 5, 2));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const std = Math.sqrt(
      samples.reduce((s, v) => s + (v - mean) * (v - mean), 0) / samples.length,
    );
    expect(mean).toBeCloseTo(5, 1);
    expect(std).toBeCloseTo(2, 1);
  });
});

describe('synthetic — circular trajectory', () => {
  it('produces the requested number of samples', () => {
    const traj = generateCircularTrajectory({ durationS: 2, freqHz: 50 });
    expect(traj.length).toBe(100);
  });

  it('starts near origin at t=0', () => {
    const traj = generateCircularTrajectory({ radiusM: 50, speedMs: 15, durationS: 1 });
    const p = traj[0].pNed;
    expect(p.n).toBeCloseTo(0, 1);
    expect(p.e).toBeCloseTo(0, 1);
  });

  it('produces valid quaternions (unit norm)', () => {
    const traj = generateCircularTrajectory({ durationS: 1 });
    for (const pose of traj) {
      const norm = Math.sqrt(
        pose.q[0] ** 2 + pose.q[1] ** 2 + pose.q[2] ** 2 + pose.q[3] ** 2,
      );
      expect(norm).toBeCloseTo(1, 5);
    }
  });

  it('heading increases monotonically (CCW circle)', () => {
    const traj = generateCircularTrajectory({ durationS: 5 });
    for (let i = 1; i < traj.length; i++) {
      const dh = ((traj[i].heading - traj[i - 1].heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      expect(dh).toBeGreaterThan(0);
    }
  });
});

describe('synthetic — straight trajectory', () => {
  it('moves at constant speed in the heading direction', () => {
    const traj = generateStraightTrajectory({
      speedMs: 10,
      headingDeg: 90,
      durationS: 3,
    });

    const p0 = traj[0].pNed;
    const pEnd = traj[traj.length - 1].pNed;

    expect(pEnd.e).toBeGreaterThan(25);
    expect(Math.abs(pEnd.n)).toBeLessThan(1);
    expect(pEnd.e - p0.e).toBeCloseTo(30, 0);
  });
});

describe('synthetic — GPS altitude round-trip', () => {
  it('GPS↔NED round-trips through test origin to < 20 cm (flat-earth vs WGS84 tolerance)', () => {
    const origin = { lat: 48.408, lon: -71.164, alt: 200 };
    const { traj } = generateDynamicTrajectory({ freqHz: 200 });
    const sensorData = generateSensorStreams(traj, { origin });

    let maxAbsErr = 0;
    for (const gps of sensorData.gps) {
      const ned = llhToNed(gps.lat, gps.lon, gps.alt, origin.lat, origin.lon, origin.alt);
      const tS = gps.tUs / 1e6;
      let best = traj[0];
      let bestDt = Math.abs(best.t - tS);
      for (let i = 1; i < traj.length; i++) {
        const dt = Math.abs(traj[i].t - tS);
        if (dt < bestDt) { bestDt = dt; best = traj[i]; }
      }
      const err = Math.abs(ned.n - best.pNed.n) + Math.abs(ned.e - best.pNed.e) + Math.abs(ned.d - best.pNed.d);
      if (err > maxAbsErr) maxAbsErr = err;
    }
    expect(maxAbsErr).toBeLessThan(0.2);
  });
});
