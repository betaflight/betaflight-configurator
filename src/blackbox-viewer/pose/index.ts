/**
 * Body-pose reconstruction — public library surface.
 *
 * Import everything a consumer needs from here rather than reaching into
 * individual modules. The typical flow:
 *
 *   import { reconstructPose, samplePosesAt, poseTrackToCsv } from '.../pose';
 *
 *   const track  = reconstructPose(flightLog);          // log -> PoseTrack
 *   const subset = samplePosesAt(track, timestampsUs);  // poses at chosen times
 *   const csv    = poseTrackToCsv(subset);              // or JSON / GPX / KML
 *
 * `reconstructPose` runs synchronously and is format-agnostic; `generatePoseKml`
 * is the convenience wrapper the UI uses (Web Worker + KML in one call).
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) -> world(NED), scalar-first [w, x, y, z]
 */

// --- Reconstruction (log -> PoseTrack) ---
export {
  reconstructPose,
  prepareReconstruction,
  DEFAULT_OUTPUT_HZ,
  DEFAULT_SIGMA_YAW_MAX,
} from './poseReconstruction.js';
export type { ReconstructOpts, ReconstructionInputs } from './poseReconstruction.js';

// --- UI convenience wrapper (Web Worker + KML) ---
export { generatePoseKml } from './poseKmlExport.js';
export type {
  GeneratePoseKmlOpts,
  GeneratePoseKmlResult,
  ProgressEvent,
} from './poseKmlExport.js';

// --- The PoseTrack IR + sampling ---
export {
  createPoseTrack,
  resamplePoseTrack,
  samplePosesAt,
  POSE_TRACK_SCHEMA,
} from './poseTrack.js';
export type { PoseTrack, PoseTrackMeta, CreatePoseTrackOpts } from './poseTrack.js';
export type { PoseSampleInternal, LLA, Euler, Vec3, Quat } from './poseSample.js';

// --- Serializers (PoseTrack -> output formats) ---
export {
  poseTrackToKml,
  poseTrackToCsv,
  poseTrackToJson,
  poseTrackFromJson,
  poseTrackToGpx,
} from './serializers.js';
export type { CsvOpts, GpxOpts } from './serializers.js';

// --- Log capability probe (what a log can produce, and why not) ---
export { analyzeLogCapabilities } from './logCapabilities.js';
export type { LogCapabilities } from './logCapabilities.js';

// --- Shared attitude helper ---
export { eulerFromQuat } from './imuMechanization.js';
