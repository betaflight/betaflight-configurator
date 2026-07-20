/**
 * Pose estimation Web Worker.
 *
 * Runs the heavy ESKF forward pass + RTS smoother off the main thread.
 * Receives already-ingested data (IngestedData), runs estimation,
 * and posts progress events and the final PoseTrack back to the main thread.
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) -> world(NED), scalar-first [w, x, y, z]
 */

import { estimatePoseTrack } from './estimatorLoop.js';
import type { EstimatorData, EstimatorOrigin, EstimatorOpts } from './estimatorLoop.js';
import type { PoseTrackMeta } from './poseTrack.js';
import type { PoseSampleInternal } from './poseSample.js';

interface EstimateRequest {
  type: 'estimate';
  data: EstimatorData;
  origin: EstimatorOrigin;
  opts: EstimatorOpts;
}

interface ProgressMessage {
  type: 'progress';
  phase: string;
  iteration?: number;
  totalIterations?: number;
  fraction?: number;
  detail?: string;
}

interface ResultMessage {
  type: 'result';
  meta: PoseTrackMeta;
  samples: PoseSampleInternal[];
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

type WorkerMessage = ProgressMessage | ResultMessage | ErrorMessage;

self.onmessage = async (e: MessageEvent<EstimateRequest>) => {
  if (e.data.type !== 'estimate') return;

  const { data, origin, opts } = e.data;

  const onProgress = (ev: {
    phase: string;
    iteration?: number;
    totalIterations?: number;
    fraction?: number;
    detail?: string;
  }) => {
    const msg: ProgressMessage = { type: 'progress', ...ev };
    self.postMessage(msg);
  };

  try {
    const track = estimatePoseTrack(data, origin, {
      ...opts,
      onProgress,
    });
    // Only post plain-data fields; sampleAt() is a function and cannot be
    // cloned by structuredClone (used internally by postMessage). The main
    // thread rebuilds the full PoseTrack via createPoseTrack().
    const payload = { meta: track.meta, samples: track.samples };
    // Dev-time clone-safety guard: catch any future regression where a
    // non-serializable value sneaks into the payload before it hits postMessage.
    if (typeof structuredClone === 'function') {
      structuredClone(payload); // throws DataCloneError if not serializable
    }
    const msg: ResultMessage = { type: 'result', ...payload };
    self.postMessage(msg);
  } catch (err) {
    const msg: ErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
