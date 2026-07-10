/**
 * Log-capability probe — lightweight check of what sensor streams a BBL log
 * carries, and whether all six hard prerequisites for body-pose reconstruction
 * are satisfied.
 *
 * This module does NOT parse the full log. It inspects the field-index table
 * and, for GPS lock, peeks only at the first few GPS frames. It is cheap
 * enough to run on every dialog open.
 *
 * The six hard prerequisites (all must be present for a good reconstruction):
 *  1. Gyroscope        (gyroADC)
 *  2. Accelerometer    (accSmooth)
 *  3. Magnetometer     (magADC)      NOTE: the mag MODEL JSON is OPTIONAL;
 *                                     the FC already fuses mag into attitude.
 *  4. Barometer        (baroAlt)
 *  5. GPS with 3D lock at takeoff    (GPS_coord + GPS_numSat >= 6)
 *  6. Attitude quaternion            (imuQuaternion)
 */

/** Minimum satellites for a reliable 3D fix at takeoff. */
const MIN_SATS_FOR_LOCK = 6;
/** Maximum GPS frames to scan for the takeoff-lock check. */
const MAX_GPS_PEEK_FRAMES = 20;

export interface LogCapabilities {
  /** Gyroscope stream present (gyroADC). */
  gyro: boolean;
  /** Accelerometer stream present (accSmooth). */
  accel: boolean;
  /** Magnetometer stream present (magADC). */
  mag: boolean;
  /** Barometer stream present (baroAlt). */
  baro: boolean;
  /** GPS frames present at all (GPS_coord lat/lon). */
  gps: boolean;
  /** A valid 3D GPS lock was acquired at or before takeoff. */
  gpsLockAtTakeoff: boolean;
  /** Attitude quaternion stream present (imuQuaternion). */
  attitude: boolean;
  /** All six prerequisites satisfied — reconstruction is possible. */
  canGenerate: boolean;
  /** Human-readable list of missing prerequisites. */
  missing: string[];
}

/** Sparse shape of a FlightLog — only the methods we call. */
export interface FlightLogHandle {
  getMainFieldIndexByName(name: string): number | null;
  getChunksInTimeRange(
    startUs: number,
    endUs: number,
  ): Array<{ frames: number[][] }>;
}

/**
 * Peek at the first second of GPS frames and determine whether a valid 3D
 * fix was acquired at or before takeoff (sufficient satellites AND
 * non-trivial position/altitude/speed).
 */
function checkGpsLockAtTakeoff(
  flightLog: FlightLogHandle,
  idx: (name: string) => number | null,
): boolean {
  const idxGpsLat = idx('GPS_coord[0]')!;
  const idxGpsLon = idx('GPS_coord[1]')!;
  const idxGpsAlt = idx('GPS_altitude');
  const idxGpsNumSat = idx('GPS_numSat')!;
  const idxGpsSpeed = idx('GPS_speed');

  let scanned = 0;
  // Scan the first second of log time for GPS frames.
  const chunks = flightLog.getChunksInTimeRange(0, 1_000_000);
  for (const chunk of chunks) {
    if (scanned >= MAX_GPS_PEEK_FRAMES) break;
    for (const frame of chunk.frames) {
      if (scanned >= MAX_GPS_PEEK_FRAMES) break;
      const lat = frame[idxGpsLat] / 1e7;
      const lon = frame[idxGpsLon] / 1e7;
      // Require non-zero position (zero = no fix yet).
      if (lat === 0 && lon === 0) continue;
      const numSatRaw = frame[idxGpsNumSat] ?? 0;
      const numSat = numSatRaw > 100 ? 0 : numSatRaw;
      // A 3D fix also requires non-zero altitude and speed capability.
      const altRaw = idxGpsAlt != null ? frame[idxGpsAlt] : null;
      const speedRaw = idxGpsSpeed != null ? frame[idxGpsSpeed] : null;
      // Consider locked if numSat >= threshold AND position is non-trivial.
      if (numSat >= MIN_SATS_FOR_LOCK && (altRaw != null || speedRaw != null)) {
        return true;
      }
      scanned++;
    }
  }
  return false;
}

/**
 * Determine whether a log can produce a good body-pose KML.
 *
 * @param flightLog A FlightLog instance (or compatible handle).
 * @returns A capabilities report with all six prerequisites and the overall
 *          `canGenerate` decision.
 */
export function analyzeLogCapabilities(
  flightLog: FlightLogHandle | null | undefined,
): LogCapabilities {
  const caps: LogCapabilities = {
    gyro: false,
    accel: false,
    mag: false,
    baro: false,
    gps: false,
    gpsLockAtTakeoff: false,
    attitude: false,
    canGenerate: false,
    missing: [],
  };

  if (!flightLog) {
    caps.missing = [
      'Gyroscope',
      'Accelerometer',
      'Magnetometer',
      'Barometer',
      'GPS',
      'GPS lock at takeoff',
      'Attitude (quaternion)',
    ];
    return caps;
  }

  const idx = (n: string) => flightLog.getMainFieldIndexByName(n);

  const hasGyro = [idx('gyroADC[0]'), idx('gyroADC[1]'), idx('gyroADC[2]')].every(
    (i) => i != null,
  );
  const hasAccel = [
    idx('accSmooth[0]'),
    idx('accSmooth[1]'),
    idx('accSmooth[2]'),
  ].every((i) => i != null);
  const hasMag = [idx('magADC[0]'), idx('magADC[1]'), idx('magADC[2]')].every(
    (i) => i != null,
  );
  const hasQuat = [
    idx('imuQuaternion[0]'),
    idx('imuQuaternion[1]'),
    idx('imuQuaternion[2]'),
  ].every((i) => i != null);
  const hasBaro = idx('baroAlt') != null;
  const hasGpsPos = idx('GPS_coord[0]') != null && idx('GPS_coord[1]') != null;
  const hasGpsNumSat = idx('GPS_numSat') != null;

  caps.gyro = hasGyro;
  caps.accel = hasAccel;
  caps.mag = hasMag;
  caps.baro = hasBaro;
  caps.gps = hasGpsPos;
  caps.attitude = hasQuat;

  // --- GPS lock at takeoff ---
  caps.gpsLockAtTakeoff =
    hasGpsPos && hasGpsNumSat ? checkGpsLockAtTakeoff(flightLog, idx) : false;

  // --- Compute canGenerate + missing ---
  const missing: string[] = [];
  if (!caps.gyro) missing.push('Gyroscope');
  if (!caps.accel) missing.push('Accelerometer');
  if (!caps.mag) missing.push('Magnetometer');
  if (!caps.baro) missing.push('Barometer');
  if (!caps.gps) missing.push('GPS');
  if (caps.gps && !caps.gpsLockAtTakeoff) missing.push('GPS lock at takeoff');
  if (!caps.attitude) missing.push('Attitude (quaternion)');

  caps.missing = missing;
  caps.canGenerate = missing.length === 0;

  return caps;
}
