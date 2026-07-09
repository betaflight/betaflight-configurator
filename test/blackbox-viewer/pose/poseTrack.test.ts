/**
 * PoseTrack IR unit tests.
 *
 * Tests: construction, sampleAt() interpolation, round-trip through JSON serializer,
 * and finiteness guards.
 */

import { describe, it, expect } from 'vitest';
import { createPoseTrack, resamplePoseTrack } from '../../../src/blackbox-viewer/pose/poseTrack.js';
import { poseTrackToJson, poseTrackFromJson } from '../../../src/blackbox-viewer/pose/serializers/jsonSerializer.js';
import type { PoseSampleInternal, LLA, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

function makeSample(
  tUs: number,
  p: [number, number, number],
  v: [number, number, number],
  q: Quat,
  lla: LLA | null,
): PoseSampleInternal {
  return {
    tUs,
    p,
    v,
    q,
    lla,
    covPos: [[1e-4, 0, 0], [0, 1e-4, 0], [0, 0, 1e-4]],
    covVel: [[1e-4, 0, 0], [0, 1e-4, 0], [0, 0, 1e-4]],
    covAtt: [[0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.01]],
  };
}

describe('PoseTrack IR', () => {
  it('constructs with meta and samples', () => {
    const samples = [
      makeSample(0, [0, 0, 0], [0, 0, 0], [1, 0, 0, 0], { lat: 48, lon: -71, alt: 200 }),
      makeSample(1000000, [10, 0, 0], [10, 0, 0], [1, 0, 0, 0], { lat: 48.00009, lon: -71, alt: 200 }),
    ];

    const track = createPoseTrack({
      samples,
      georefOrigin: { lat: 48, lon: -71, alt: 200 },
      source: { log: 'test' },
    });

    expect(track.meta.schemaVersion).toBe(1);
    expect(track.meta.frame).toBe('body=FRD, world=NED');
    expect(track.meta.georefOrigin.lat).toBe(48);
    expect(track.meta.units.pos).toBe('m');
    expect(track.samples).toHaveLength(2);
    expect(track.sampleAt).toBeInstanceOf(Function);
  });

  it('sampleAt interpolates position and velocity (lerp)', () => {
    const samples = [
      makeSample(0, [0, 0, 0], [0, 0, 0], [1, 0, 0, 0], { lat: 48, lon: -71, alt: 200 }),
      makeSample(1000000, [10, 0, 0], [10, 0, 0], [1, 0, 0, 0], { lat: 48.00009, lon: -71, alt: 200 }),
    ];

    const track = createPoseTrack({ samples, georefOrigin: { lat: 48, lon: -71, alt: 200 }, source: {} });

    const mid = track.sampleAt(500000);
    expect(mid).not.toBeNull();
    expect(mid!.p[0]).toBeCloseTo(5, 1);
    expect(mid!.v[0]).toBeCloseTo(5, 1);
    expect(mid!.lla!.lat).toBeCloseTo(48.000045, 6);
  });

  it('sampleAt interpolates attitude (slerp)', () => {
    const halfTurn = Math.PI / 4; // 45°
    const q0: Quat = [1, 0, 0, 0];
    const q1: Quat = [Math.cos(halfTurn), 0, 0, Math.sin(halfTurn)]; // 90° yaw
    const samples = [
      makeSample(0, [0, 0, 0], [0, 0, 0], q0, null),
      makeSample(1000000, [0, 0, 0], [0, 0, 0], q1, null),
    ];

    const track = createPoseTrack({ samples, georefOrigin: { lat: 0, lon: 0, alt: 0 }, source: {} });

    const mid = track.sampleAt(500000);
    expect(mid).not.toBeNull();
    const expected: Quat = [Math.cos(halfTurn / 2), 0, 0, Math.sin(halfTurn / 2)];
    expect(mid!.q[0]).toBeCloseTo(expected[0], 4);
    expect(mid!.q[3]).toBeCloseTo(expected[3], 4);
  });

  it('sampleAt clamps to endpoints', () => {
    const samples = [
      makeSample(100, [0, 0, 0], [0, 0, 0], [1, 0, 0, 0], null),
      makeSample(200, [10, 0, 0], [10, 0, 0], [1, 0, 0, 0], null),
    ];

    const track = createPoseTrack({ samples, georefOrigin: { lat: 0, lon: 0, alt: 0 }, source: {} });

    expect(track.sampleAt(0)!.tUs).toBe(100);
    expect(track.sampleAt(50)!.tUs).toBe(100);
    expect(track.sampleAt(300)!.tUs).toBe(200);
    expect(track.sampleAt(1000)!.tUs).toBe(200);
  });

  it('single sample track returns that sample for any query', () => {
    const sample = makeSample(500, [1, 2, 3], [4, 5, 6], [1, 0, 0, 0], { lat: 48, lon: -71, alt: 200 });
    const track = createPoseTrack({ samples: [sample], georefOrigin: { lat: 48, lon: -71, alt: 200 }, source: {} });

    const s = track.sampleAt(0);
    expect(s!.p[0]).toBe(1);
    const s2 = track.sampleAt(99999999);
    expect(s2!.p[0]).toBe(1);
  });

  it('empty track sampleAt returns null', () => {
    const track = createPoseTrack({ samples: [], georefOrigin: { lat: 0, lon: 0, alt: 0 }, source: {} });
    expect(track.sampleAt(500)).toBeNull();
  });

  it('JSON round-trip preserves meta, samples, covariance, and byte-for-byte stable', () => {
    const samples = [
      makeSample(0, [0, 0, 0], [0, 0, 0], [1, 0, 0, 0], { lat: 48.4085, lon: -71.1642, alt: 200.5 }),
      makeSample(500000, [5, 3, -1], [10, 6, -2], [0.866, 0, 0, 0.5], { lat: 48.4086, lon: -71.1641, alt: 199.5 }),
    ];
    samples[0].covPos = [[0.01, 0.002, 0], [0.002, 0.015, -0.001], [0, -0.001, 0.02]];
    samples[0].covAtt = [[0.001, 0.0001, 0], [0.0001, 0.002, 0], [0, 0, 0.0015]];

    const track = createPoseTrack({
      samples,
      georefOrigin: { lat: 48.408, lon: -71.164, alt: 200 },
      source: { log: 'LOG00007.BFL', magModelSchema: '2.1', solverConfig: { test: true } },
    });

    const json1 = poseTrackToJson(track);
    const restored = poseTrackFromJson(json1);
    const json2 = poseTrackToJson(restored);

    expect(json1).toBe(json2);

    expect(restored.meta.schemaVersion).toBe(1);
    expect(restored.meta.georefOrigin.lat).toBe(48.408);
    expect(restored.meta.source.log).toBe('LOG00007.BFL');
    expect(restored.samples).toHaveLength(2);

    expect(restored.samples[0].covPos[0][1]).toBeCloseTo(0.002, 10);
    expect(restored.samples[0].covPos[1][2]).toBeCloseTo(-0.001, 10);
    expect(restored.samples[0].covAtt[0][1]).toBeCloseTo(0.0001, 10);

    expect(restored.sampleAt).toBeInstanceOf(Function);
    const mid = restored.sampleAt(250000);
    expect(mid!.p[0]).toBeCloseTo(2.5, 1);
    expect(mid!.q[0]).not.toBeCloseTo(1, 6);
    expect(mid!.q).not.toBeNull();
  });

  it('resamplePoseTrack downsamples correctly', () => {
    const samples: PoseSampleInternal[] = [];
    for (let i = 0; i < 100; i++) {
      const tUs = i * 10000;
      const yaw = i * 0.01;
      const q: Quat = [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
      samples.push(makeSample(tUs, [i * 0.1, 0, 0], [10, 0, 0], q,
        { lat: 48 + i * 1e-8, lon: -71 + i * 1e-8, alt: 200 }));
    }

    const track = createPoseTrack({
      samples,
      georefOrigin: { lat: 48, lon: -71, alt: 200 },
      source: { log: 'test' },
    });

    const downsampled = resamplePoseTrack(track, 20);
    expect(downsampled.samples.length).toBeGreaterThanOrEqual(20);
    expect(downsampled.samples.length).toBeLessThanOrEqual(22);

    expect(downsampled.samples[0].p[0]).toBeCloseTo(0, 2);
    const midOrig = track.sampleAt(500000);
    const midDown = downsampled.sampleAt(500000);
    expect(Math.abs(midDown!.q[0] - midOrig!.q[0])).toBeLessThan(0.01);
  });

  it('resamplePoseTrack upsamples and round-trips fidelity', () => {
    const samples: PoseSampleInternal[] = [];
    for (let i = 0; i < 50; i++) {
      const tUs = i * 50000;
      samples.push(makeSample(tUs, [i, 0, 0], [10, 0, 0], [1, 0, 0, 0],
        { lat: 48, lon: -71, alt: 200 }));
    }

    const track = createPoseTrack({
      samples,
      georefOrigin: { lat: 48, lon: -71, alt: 200 },
      source: { log: 'test' },
    });

    const upsampled = resamplePoseTrack(track, 100);
    expect(upsampled.samples.length).toBeGreaterThan(track.samples.length);

    const roundTripped = resamplePoseTrack(upsampled, 20);

    for (const s of track.samples) {
      const rt = roundTripped.sampleAt(s.tUs);
      expect(rt).not.toBeNull();
      expect(rt!.p[0]).toBeCloseTo(s.p[0], 2);
    }
  });
});
