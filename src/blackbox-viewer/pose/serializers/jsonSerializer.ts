/**
 * JSON serializer for PoseTrack IR — lossless round-trip.
 *
 * poseTrackToJson / poseTrackFromJson are thin wrappers over JSON.stringify/parse.
 * The restored track has the full state, covariance, provenance, and interpolating accessor.
 */

import { type PoseTrack, createPoseTrack } from '../poseTrack.js';
import type { PoseSampleInternal } from '../poseSample.js';

/**
 * Serialize a PoseTrack to a JSON string (deterministic, byte-stable).
 */
export function poseTrackToJson(track: PoseTrack): string {
  // Strip the sampleAt function before serializing
  const serializable = {
    meta: track.meta,
    samples: track.samples.map((s) => ({
      tUs: s.tUs,
      p: s.p,
      v: s.v,
      q: s.q,
      lla: s.lla,
      covPos: s.covPos,
      covVel: s.covVel,
      covAtt: s.covAtt,
      euler: s.euler,
      diagnostics: s.diagnostics,
    })),
  };
  return JSON.stringify(serializable);
}

/**
 * Deserialize a JSON string back to a full PoseTrack with interpolating sampleAt.
 */
export function poseTrackFromJson(json: string): PoseTrack {
  const parsed = JSON.parse(json);

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.meta ||
    !parsed.meta.georefOrigin ||
    !Array.isArray(parsed.samples)
  ) {
    throw new Error('Invalid PoseTrack JSON payload.');
  }
  if (parsed.meta.schemaVersion !== undefined && parsed.meta.schemaVersion !== 1) {
    throw new Error(`Unsupported PoseTrack schemaVersion: ${parsed.meta.schemaVersion}`);
  }

  const isNumArray = (v: unknown, len: number): v is number[] =>
    Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x));

  const samples: PoseSampleInternal[] = (parsed.samples || []).map(
    (s: Record<string, unknown>, i: number) => {
      if (typeof s.tUs !== 'number' || !Number.isFinite(s.tUs)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i} has a non-finite tUs.`);
      }
      if (!isNumArray(s.p, 3)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i}'s p is not a 3-number array.`);
      }
      if (!isNumArray(s.v, 3)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i}'s v is not a 3-number array.`);
      }
      if (!isNumArray(s.q, 4)) {
        throw new Error(`Invalid PoseTrack JSON: sample ${i}'s q is not a 4-number array.`);
      }
      return {
        tUs: s.tUs,
        p: s.p as [number, number, number],
        v: s.v as [number, number, number],
        q: s.q as [number, number, number, number],
        lla: s.lla as PoseSampleInternal['lla'],
        covPos: s.covPos as number[][],
        covVel: s.covVel as number[][],
        covAtt: s.covAtt as number[][],
        euler: s.euler as PoseSampleInternal['euler'],
        diagnostics: s.diagnostics as PoseSampleInternal['diagnostics'],
      };
    },
  );

  return createPoseTrack({
    samples,
    georefOrigin: parsed.meta.georefOrigin,
    source: parsed.meta.source,
  });
}
