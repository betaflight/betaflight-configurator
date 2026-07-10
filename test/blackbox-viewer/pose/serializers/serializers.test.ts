/**
 * Serializer tests — verify KML, JSON, CSV, GPX outputs over PoseTrack IR.
 */

import { describe, it, expect } from 'vitest';
import { createPoseTrack } from '../../../../src/blackbox-viewer/pose/poseTrack.js';
import { poseTrackToKml } from '../../../../src/blackbox-viewer/pose/serializers/kmlSerializer.js';
import { poseTrackToJson, poseTrackFromJson } from '../../../../src/blackbox-viewer/pose/serializers/jsonSerializer.js';
import { poseTrackToCsv } from '../../../../src/blackbox-viewer/pose/serializers/csvSerializer.js';
import { poseTrackToGpx } from '../../../../src/blackbox-viewer/pose/serializers/gpxSerializer.js';
import type { PoseSampleInternal, Euler, LLA } from '../../../../src/blackbox-viewer/pose/poseSample.js';
import type { PoseTrack } from '../../../../src/blackbox-viewer/pose/poseTrack.js';

function makeSample(
  tUs: number,
  p: [number, number, number],
  v: [number, number, number],
  q: [number, number, number, number],
  lla: LLA,
  euler?: Euler,
): PoseSampleInternal {
  return {
    tUs,
    p,
    v,
    q,
    lla,
    covPos: [
      [0.01, 0, 0],
      [0, 0.01, 0],
      [0, 0, 0.01],
    ],
    covVel: [
      [0.01, 0, 0],
      [0, 0.01, 0],
      [0, 0, 0.01],
    ],
    covAtt: [
      [0.001, 0, 0],
      [0, 0.001, 0],
      [0, 0, 0.001],
    ],
    euler: euler || { rollDeg: 0, pitchDeg: 0, headingDeg: 0, tiltDeg: 0 },
  };
}

function makeTrack(): PoseTrack {
  const samples: PoseSampleInternal[] = [
    makeSample(0, [0, 0, 0], [10, 0, 0], [1, 0, 0, 0], { lat: 48.408, lon: -71.164, alt: 200 }),
    makeSample(500000, [5, 0, 0], [10, 0, 0], [0.9659, 0, 0, 0.2588], {
      lat: 48.408045,
      lon: -71.16394,
      alt: 200,
    }),
  ];
  return createPoseTrack({
    samples,
    georefOrigin: { lat: 48.408, lon: -71.164, alt: 200 },
    source: { log: 'test' },
  });
}

describe('Serializers', () => {
  it('KML produces valid XML with triad elements', () => {
    const track = makeTrack();
    const kml = poseTrackToKml(track, { everyN: 1, showPath: true, showTriads: true });

    expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<altitudeMode>absolute</altitudeMode>');
    expect(kml).toContain('#noseStyle');
    expect(kml).toContain('#rightStyle');
    expect(kml).toContain('#upStyle');
    expect(kml).toContain('<Folder><name>Body Axes</name>');
    expect(kml).toContain('<Folder><name>Fused Path</name>');
    expect(kml).toContain('</kml>');
  });

  it('KML with no triads still emits path', () => {
    const track = makeTrack();
    const kml = poseTrackToKml(track, {
      showTriads: false,
      showPath: true,
      showRawGps: false,
    });
    expect(kml).toContain('Fused Path');
    expect(kml).not.toContain('Body Axes');
  });

  it('KML with raw GPS layer', () => {
    const track = makeTrack();
    const kml = poseTrackToKml(track, {
      showRawGps: true,
      rawGps: [{ lat: 48.408, lon: -71.164, alt: 200 }],
      everyN: 100,
    });
    expect(kml).toContain('Raw GPS');
    expect(kml).toContain('#gpsStyle');
  });

  it('CSV produces valid tabular output', () => {
    const track = makeTrack();
    const csv = poseTrackToCsv(track);
    expect(csv).toContain(
      'tMs,lat,lon,altMsl,qw,qx,qy,qz,rollDeg,pitchDeg,headingDeg,tiltDeg,vn,ve,vd,sigmaPos,sigmaAtt',
    );
    expect(csv).toContain('48.408000'); // first lat
    expect(csv.trim().split('\n')).toHaveLength(3); // header + 2 rows
  });

  it('GPX produces valid XML with euler extensions', () => {
    const track = makeTrack();
    const gpx = poseTrackToGpx(track);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('xmlns:pose="https://betaflight.com/pose/v1"');
    expect(gpx).toContain('<trkpt lat="48.408"');
    expect(gpx).toContain('<ele>200</ele>');
    // <time> is intentionally omitted when no absolute UTC anchor is available
    // to avoid emitting semantically incorrect 1970-epoch timestamps.
    expect(gpx).not.toContain('<time>1970');
    expect(gpx).toContain('<extensions>');
    expect(gpx).toContain('<pose:rollDeg>');
    expect(gpx).toContain('<pose:headingDeg>');
  });

  it('JSON round-trip preserves data', () => {
    const track = makeTrack();
    const json = poseTrackToJson(track);
    const restored = poseTrackFromJson(json);
    expect(restored.samples).toHaveLength(2);
    expect(restored.samples[0].lla!.lat).toBe(48.408);
    expect(restored.meta.frame).toBe('body=FRD, world=NED');
    // Euler round-trips through JSON
    expect(restored.samples[0].euler).toBeDefined();
    expect(restored.samples[0].euler!.rollDeg).toBe(0);
  });

  it('JSON deserialization throws on a malformed sample (q length 3)', () => {
    const track = makeTrack();
    const json = poseTrackToJson(track);
    const parsed = JSON.parse(json);
    parsed.samples[0].q = [1, 0, 0]; // malformed: quaternion needs 4 components
    expect(() => poseTrackFromJson(JSON.stringify(parsed))).toThrow(/Invalid PoseTrack JSON/);
  });
});
