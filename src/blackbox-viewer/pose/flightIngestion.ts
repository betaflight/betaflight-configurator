/**
 * Flight ingestion — parses a Betaflight BBL log into the estimator data contract.
 *
 * Pure, framework-free module. Takes a FlightLog instance (which wraps the BFL
 * parser) and extracts IMU, GPS, baro, quaternion, and magnetometer streams
 * with all unit conversions applied.
 *
 * The output is the canonical data contract consumed by estimatePoses().
 * No Vue/DOM/browser dependencies.
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) → world(NED), scalar-first [w, x, y, z]
 *  - Frame adapter: [qw, qx, -qy, -qz] (180°-about-X quaternion conjugation relabels FLU/NWU→FRD/NED)
 */

import { FlightLogParser } from '../flightlog_parser.js';
import { correctMagToBody } from './mag_correction.js';
import type { Vec3, Quat } from './poseSample.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImuEntry {
  tUs: number;
  gyro: Vec3;
  accel: Vec3;
}

export interface GpsEntry {
  tUs: number;
  lat: number;
  lon: number;
  alt: number | null;
  velNed: Vec3 | null;
  speed?: number;
  course?: number;
  numSat: number;
  /** u-blox iTOW (GPS_msToW) from GPS_time field, in milliseconds.
   *  Undefined if the log does not carry GPS_time (pre-NAV-PVT or NMEA).
   *  The iTOW is the receiver's true fix epoch — it removes FC parse jitter
   *  and allows per-fix position timing independent of velocity timing. */
  gpsTimeItoW?: number;
}

export interface BaroEntry {
  tUs: number;
  alt: number;
}

export interface QuatEntry {
  tUs: number;
  q: Quat;
}

export interface MagRawEntry {
  tUs: number;
  meas: Vec3;
}

export interface MagGaussEntry {
  tUs: number;
  meas: Vec3;
}

export interface CurrentEntry {
  tUs: number;
  amps: number;
}

export interface GpsHome {
  lat: number;
  lon: number;
  alt: number;
}

export interface FieldPresence {
  mag: boolean;
  quat: boolean;
  gpsVelned: boolean;
  baro: boolean;
  current: boolean;
  gps: boolean;
  gyro: boolean;
  accel: boolean;
}

export interface IngestedData {
  imu: ImuEntry[];
  gps: GpsEntry[];
  baro: BaroEntry[];
  quat: QuatEntry[];
  mag: MagRawEntry[];
  current: CurrentEntry[];
  gpsHome: GpsHome | null;
  sysConfig: Record<string, unknown>;
  fieldPresence: FieldPresence;
  stats: { totalTimeUs: number; imuRateHz: number };
}

export interface MagModel {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Mag stream correction
// ---------------------------------------------------------------------------

/**
 * Apply the mag characterization model to a raw ADC mag stream, producing
 * body-frame Gauss vectors for 3-axis ESKF fusion.
 *
 * Delegates correction math to mag_correction.js — does NO correction math itself.
 * Samples that fail ellipsoid correction (zero vector, NaN) are dropped.
 *
 * MAG FRAME ADAPTER — X↔Y SWAP (PROPER ROTATION, det=+1).
 * The QMC5883L calibration wizard produces body vectors in the firmware's
 * native FLU frame. The correct transform to FRD is 90° about +Z:
 * (-Y_FLU, +X_FLU, +Z_FLU).
 */
export function correctMagStream(
  magRaw: MagRawEntry[],
  model: MagModel,
): MagGaussEntry[] {
  const out: MagGaussEntry[] = [];
  for (const m of magRaw) {
    const r = correctMagToBody(m.meas, model);
    if (!r) continue;
    const gpu = r.gaussPerCorrectedUnit as number;
    if (gpu != null && Math.abs(gpu) > 1e-12) {
      const mxFrd = -(r.mBody[1] as number) * gpu; // Y_FLU negated → X_FRD
      const myFrd =  (r.mBody[0] as number) * gpu; // X_FLU → Y_FRD
      const mzFrd =  (r.mBody[2] as number) * gpu; // Z_FLU → Z_FRD
      out.push({
        tUs: m.tUs,
        meas: [mxFrd, myFrd, mzFrd],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------------------------

const FLIGHT_LOG_FIELD_INDEX_TIME = FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME as number;

export interface IngestOpts {
  startUs?: number;
  endUs?: number;
  gpsDecimation?: number;
  /** GPS transport delay in milliseconds (subtracted from GPS timestamps at ingestion).
   *  Default 0. Typical u-blox M10 transport delay ~150-200 ms. */
  gpsDelayMs?: number;
}

/**
 * Parse a BFL log into the estimator input contract.
 */
export function ingestFlightLog(
  flightLog: {
    getMainFieldIndexByName: (name: string) => number | null;
    getSysConfig: () => Record<string, unknown>;
    getChunksInTimeRange: (startUs: number, endUs: number) => Array<{ frames: number[][] }>;
    getGPSHome?: () => GpsHome | null;
  },
  opts: IngestOpts = {},
): IngestedData {
  const {
    startUs = 0,
    endUs = Number.MAX_SAFE_INTEGER,
    gpsDecimation = 1,
    gpsDelayMs = 0,
  } = opts;
  const gpsDecimationStep =
    Number.isInteger(gpsDecimation) && gpsDecimation > 0 ? gpsDecimation : 1;

  const sysConfig = flightLog.getSysConfig();
  const acc1G = (sysConfig.acc_1G as number) || 2048;
  // gyroScale from parser is rad/µs per raw count; multiply by 1e6 to get rad/s
  const gyroScale = ((sysConfig.gyroScale as number) || 1.0) * 1e6;

  const idx = (n: string) => flightLog.getMainFieldIndexByName(n);

  const idxTime = FLIGHT_LOG_FIELD_INDEX_TIME;
  const idxGyro = [idx('gyroADC[0]'), idx('gyroADC[1]'), idx('gyroADC[2]')];
  const idxAccel = [idx('accSmooth[0]'), idx('accSmooth[1]'), idx('accSmooth[2]')];
  const idxMag = [idx('magADC[0]'), idx('magADC[1]'), idx('magADC[2]')];
  const idxQuat = [idx('imuQuaternion[0]'), idx('imuQuaternion[1]'), idx('imuQuaternion[2]')];
  const idxBaro = idx('baroAlt');
  const idxGpsLat = idx('GPS_coord[0]');
  const idxGpsLon = idx('GPS_coord[1]');
  const idxGpsAlt = idx('GPS_altitude');
  const idxGpsSpeed = idx('GPS_speed');
  const idxGpsCourse = idx('GPS_ground_course');
  const idxGpsVelned = [idx('GPS_velned[0]'), idx('GPS_velned[1]'), idx('GPS_velned[2]')];
  const idxGpsNumSat = idx('GPS_numSat');
  const idxGpsTime = idx('GPS_time');
  const hasGpsTime = idxGpsTime != null;
  const gpsHome: GpsHome | null =
    typeof flightLog.getGPSHome === 'function' ? flightLog.getGPSHome() : null;
  const idxCurrent = idx('amperageLatest');

  const hasGyro = idxGyro.every((i) => i != null);
  const hasAccel = idxAccel.every((i) => i != null);
  const hasMag = idxMag.every((i) => i != null);
  const hasQuat = idxQuat.every((i) => i != null);
  const hasBaro = idxBaro != null;
  const hasGpsPos = idxGpsLat != null && idxGpsLon != null;
  const hasGpsVelned = idxGpsVelned.every((i) => i != null);
  const hasCurrent = idxCurrent != null;

  const fieldPresence: FieldPresence = {
    mag: hasMag,
    quat: hasQuat,
    gpsVelned: hasGpsVelned,
    baro: hasBaro,
    current: hasCurrent,
    gps: hasGpsPos,
    gyro: hasGyro,
    accel: hasAccel,
  };

  const imu: ImuEntry[] = [];
  const gps: GpsEntry[] = [];
  const baro: BaroEntry[] = [];
  const quat: QuatEntry[] = [];
  const magRaw: MagRawEntry[] = [];
  const currentSamples: CurrentEntry[] = [];
  let gpsCounter = 0;

  let lastGpsLat: number | null = null;
  let lastGpsLon: number | null = null;
  let lastGpsAlt: number | null = null;

  const chunks = flightLog.getChunksInTimeRange(startUs, endUs);

  for (const chunk of chunks) {
    for (const frame of chunk.frames) {
      const tUs = frame[idxTime];
      if (tUs < startUs || tUs > endUs) continue;

      // ---- IMU ----
      if (hasGyro && hasAccel) {
        const gyroRad: Vec3 = [
          frame[idxGyro[0]!] * gyroScale,
          frame[idxGyro[1]!] * gyroScale,
          frame[idxGyro[2]!] * gyroScale,
        ];
        const accelMs2: Vec3 = [
          (frame[idxAccel[0]!] / acc1G) * 9.80665,
          (frame[idxAccel[1]!] / acc1G) * 9.80665,
          (frame[idxAccel[2]!] / acc1G) * 9.80665,
        ];
        imu.push({ tUs, gyro: gyroRad, accel: accelMs2 });
      }

      // ---- Barometer ----
      if (hasBaro) {
        const baroRaw = frame[idxBaro!];
        if (baroRaw != null) {
          baro.push({ tUs, alt: baroRaw / 100 });
        }
      }

      // ---- FC Quaternion ----
      // Betaflight logs attitude as Hamilton scalar-first [w,x,y,z].
      // Components stored as int16/32767; qw reconstructed from unit-norm.
      //
      // FRAME ADAPTER: re-label the FC's native frame (Forward-Left-Up / North-West-Up)
      // into our Forward-Right-Down / North-East-Down convention. Apply [qw, qx, -qy, -qz].
      // This is conjugation of q by the 180°-about-X quaternion (a proper rotation, det +1),
      // flipping both body Y,Z and world Y,Z. Corrects heading, pitch, and roll together.
      if (hasQuat) {
        const qx = frame[idxQuat[0]!] / 32767;
        const qy = frame[idxQuat[1]!] / 32767;
        const qz = frame[idxQuat[2]!] / 32767;
        const m = qx * qx + qy * qy + qz * qz;
        let qw: number;
        if (m < 1.0) {
          qw = Math.sqrt(1.0 - m);
        } else {
          qw = 0;
        }
        // Frame adapter: negate Y and Z quaternion components (FLU/NWU → FRD/NED)
        const qFixed: Quat = [qw, qx, -qy, -qz];
        quat.push({ tUs, q: qFixed });
      }

      // ---- Magnetometer (raw ADC, later converted through model) ----
      if (hasMag) {
        magRaw.push({
          tUs,
          meas: [frame[idxMag[0]!], frame[idxMag[1]!], frame[idxMag[2]!]],
        });
      }

      // ---- Current ----
      if (hasCurrent) {
        const rawCurrent = frame[idxCurrent!];
        if (rawCurrent != null) {
          currentSamples.push({ tUs, amps: rawCurrent / 100 });
        }
      }

      // ---- GPS ----
      if (hasGpsPos) {
        const lat = frame[idxGpsLat!] / 1e7;
        const lon = frame[idxGpsLon!] / 1e7;
        const altMsl: number | null = frame[idxGpsAlt!] != null ? frame[idxGpsAlt!] / 10 : null;

        if (lat !== 0 && lon !== 0) {
          const changed = lat !== lastGpsLat || lon !== lastGpsLon || altMsl !== lastGpsAlt;
          if (changed) {
            lastGpsLat = lat;
            lastGpsLon = lon;
            lastGpsAlt = altMsl;

            gpsCounter++;
            if (gpsCounter % gpsDecimationStep === 0) {
              let velNed: Vec3 | null = null;
              if (hasGpsVelned) {
                velNed = [
                  frame[idxGpsVelned[0]!] / 100,
                  frame[idxGpsVelned[1]!] / 100,
                  frame[idxGpsVelned[2]!] / 100,
                ];
              }

              const speed = frame[idxGpsSpeed!] != null ? (frame[idxGpsSpeed!] as number) / 100 : 0;
              const course = frame[idxGpsCourse!] != null ? (frame[idxGpsCourse!] as number) / 10 : 0;
              const numSatRaw = frame[idxGpsNumSat!] != null ? (frame[idxGpsNumSat!] as number) : 0;
              const numSat = numSatRaw > 100 ? 0 : numSatRaw;

              // Extract GPS_time (u-blox iTOW) if available.
              // The iTOW is the receiver's true fix epoch in ms GPS-time-of-week.
              // It removes FC parse jitter and enables per-fix position timing
              // independent of velocity (Doppler) timing.
              const gpsTimeItoW: number | undefined =
                hasGpsTime && idxGpsTime != null ? (frame[idxGpsTime] as number) : undefined;

              // Apply GPS transport delay: shift timestamp back so GPS fix at
              // physical time T is associated with keyframe near (T - delay).
              const gpsTUs = tUs - Math.round(gpsDelayMs * 1000);

              gps.push({
                tUs: gpsTUs,
                lat,
                lon,
                alt: altMsl,
                velNed,
                speed,
                course,
                numSat,
                gpsTimeItoW,
              });
            }
          }
        }
      }
    }
  }

  const totalTimeUs = imu.length > 0 ? imu.at(-1)!.tUs - imu[0].tUs : 0;
  const imuRateHz = totalTimeUs > 0 ? imu.length / (totalTimeUs / 1e6) : 0;

  return {
    imu,
    gps,
    baro,
    quat,
    mag: magRaw,
    current: currentSamples,
    gpsHome,
    sysConfig,
    fieldPresence,
    stats: { totalTimeUs, imuRateHz },
  };
}

// ---------------------------------------------------------------------------
// Loaders (Node / headless)
// ---------------------------------------------------------------------------

/**
 * Load a FlightLog from a Uint8Array buffer.
 */
export async function loadFlightLogFromBuffer(logData: Uint8Array): Promise<unknown> {
  const { FlightLog } = await import('../flightlog.js');
  const fl = new (FlightLog as new (data: Uint8Array) => { openLog: (n: number) => void })(logData);
  if (fl.openLog) fl.openLog(0);
  return fl;
}

