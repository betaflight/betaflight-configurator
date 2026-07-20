import { describe, it, expect } from 'vitest';
import {
  llhToNed,
  nedToLlh,
  haversine,
  bearing,
  localTangentOffset,
} from '../../../src/blackbox-viewer/pose/geodesy.js';

describe('geodesy — LLH ↔ NED round-trip', () => {
  const lat0 = 48.408;
  const lon0 = -71.164;
  const alt0 = 200;

  it('origin maps to (~0, ~0, ~0) NED', () => {
    const ned = llhToNed(lat0, lon0, alt0, lat0, lon0, alt0);
    expect(ned.n).toBeCloseTo(0, 2);
    expect(ned.e).toBeCloseTo(0, 2);
    expect(ned.d).toBeCloseTo(0, 2);
  });

  it('round-trips through NED and back', () => {
    const pts = [
      { lat: 48.409, lon: -71.163, alt: 220 },
      { lat: 48.407, lon: -71.165, alt: 180 },
      { lat: 48.410, lon: -71.160, alt: 210 },
    ];

    for (const pt of pts) {
      const ned = llhToNed(pt.lat, pt.lon, pt.alt, lat0, lon0, alt0);
      const back = nedToLlh(ned, lat0, lon0, alt0);

      expect(back.lat).toBeCloseTo(pt.lat, 5);
      expect(back.lon).toBeCloseTo(pt.lon, 5);
      expect(back.alt).toBeCloseTo(pt.alt, 1);
    }
  });

  it('NED north-positive is north on the globe', () => {
    const ned = llhToNed(48.409, lon0, alt0, lat0, lon0, alt0);
    expect(ned.n).toBeGreaterThan(50);
  });

  it('NED east-positive is east on the globe', () => {
    const ned = llhToNed(lat0, -71.163, alt0, lat0, lon0, alt0);
    expect(ned.e).toBeGreaterThan(50);
  });

  it('NED down-positive is below the origin', () => {
    const ned = llhToNed(lat0, lon0, 190, lat0, lon0, alt0);
    expect(ned.d).toBeGreaterThan(0);
  });
});

describe('geodesy — haversine', () => {
  it('returns ~111 km for 1 degree of latitude', () => {
    const d = haversine(48, -71, 49, -71);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});

describe('geodesy — bearing', () => {
  it('north is ~0°', () => {
    const b = bearing(48, -71, 49, -71);
    expect(b).toBeLessThan(1);
  });

  it('east is ~90°', () => {
    const b = bearing(48, -71, 48, -70);
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });
});

describe('geodesy — localTangentOffset', () => {
  it('1 metre north gives ~1 / 111320 degrees latitude', () => {
    const { dLat, dLon } = localTangentOffset({ n: 1, e: 0, d: 0 }, 48);
    expect(dLat).toBeCloseTo(1 / 111320, 8);
    expect(dLon).toBeCloseTo(0, 8);
  });

  it('up (negative d) gives positive altitude delta', () => {
    const { dAlt } = localTangentOffset({ n: 0, e: 0, d: -1 }, 48);
    expect(dAlt).toBeCloseTo(1, 5);
  });
});
