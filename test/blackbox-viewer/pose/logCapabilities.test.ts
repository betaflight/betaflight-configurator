/**
 * Unit tests for analyzeLogCapabilities — fast, no estimator run.
 */
import { describe, it, expect } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeLogCapabilities,
  type FlightLogHandle,
} from '../../../src/blackbox-viewer/pose/logCapabilities.js';
import { loadFlightLogFromBuffer } from '../../../src/blackbox-viewer/pose/flightIngestion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('analyzeLogCapabilities', () => {
  it('reports all missing for null/undefined', () => {
    const c = analyzeLogCapabilities(null);
    expect(c.canGenerate).toBe(false);
    expect(c.gyro).toBe(false);
    expect(c.missing.length).toBeGreaterThanOrEqual(6);
    expect(c.missing).toContain('Gyroscope');
    expect(c.missing).toContain('Magnetometer');
    expect(c.missing).toContain('GPS lock at takeoff');
  });

  it('canGenerate is false when mag is missing', () => {
    const fake = makeFakeLog({
      gyro: true,
      accel: true,
      mag: false,
      baro: true,
      gps: true,
      gpsLocked: true,
      attitude: true,
    });
    const c = analyzeLogCapabilities(fake);
    expect(c.gyro).toBe(true);
    expect(c.mag).toBe(false);
    expect(c.canGenerate).toBe(false);
    expect(c.missing).toContain('Magnetometer');
  });

  it('canGenerate is false when GPS is present but not locked at takeoff', () => {
    const fake = makeFakeLog({
      gyro: true,
      accel: true,
      mag: true,
      baro: true,
      gps: true,
      gpsLocked: false,
      attitude: true,
    });
    const c = analyzeLogCapabilities(fake);
    expect(c.gps).toBe(true);
    expect(c.gpsLockAtTakeoff).toBe(false);
    expect(c.canGenerate).toBe(false);
    expect(c.missing).toContain('GPS lock at takeoff');
  });

  it('canGenerate is true when all six prerequisites are met', () => {
    const fake = makeFakeLog({
      gyro: true,
      accel: true,
      mag: true,
      baro: true,
      gps: true,
      gpsLocked: true,
      attitude: true,
    });
    const c = analyzeLogCapabilities(fake);
    expect(c.canGenerate).toBe(true);
    expect(c.missing).toHaveLength(0);
  });
});

describeIntegration('analyzeLogCapabilities — reference_flight1 real log', () => {
  it('all six prerequisites satisfied on reference_flight1 (canGenerate=true)', async () => {
    const bflPath = path.join(__dirname, '__fixtures__', 'reference_flight1', 'LOG00007.BFL');
    if (!fs.existsSync(bflPath)) {
      console.warn('SKIP: LOG00007.BFL not present');
      return;
    }
    const fl = await loadFlightLogFromBuffer(
      new Uint8Array(fs.readFileSync(bflPath)),
    );
    const c = analyzeLogCapabilities(fl as FlightLogHandle);
    expect(c.gyro).toBe(true);
    expect(c.accel).toBe(true);
    expect(c.mag).toBe(true);
    expect(c.baro).toBe(true);
    expect(c.gps).toBe(true);
    expect(c.gpsLockAtTakeoff).toBe(true);
    expect(c.attitude).toBe(true);
    expect(c.canGenerate).toBe(true);
    expect(c.missing).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FakeLogConfig {
  gyro: boolean;
  accel: boolean;
  mag: boolean;
  baro: boolean;
  gps: boolean;
  gpsLocked: boolean;
  attitude: boolean;
}

/**
 * Build a minimal fake FlightLogHandle that simulates the field-index table
 * and, for GPS, a single chunk with one locked or unlocked frame.
 *
 * The GPS-lock check in analyzeLogCapabilities uses getChunksInTimeRange(0, 1e6)
 * and scans up to 20 frames for GPS_coord != (0,0) + numSat >= 6.
 */
function makeFakeLog(cfg: FakeLogConfig): FlightLogHandle {
  const idxTable: Record<string, number> = {};
  let nextIdx = 1;

  const setField = (name: string, present: boolean) => {
    if (present) idxTable[name] = nextIdx++;
  };

  setField('gyroADC[0]', cfg.gyro);
  setField('gyroADC[1]', cfg.gyro);
  setField('gyroADC[2]', cfg.gyro);
  setField('accSmooth[0]', cfg.accel);
  setField('accSmooth[1]', cfg.accel);
  setField('accSmooth[2]', cfg.accel);
  setField('magADC[0]', cfg.mag);
  setField('magADC[1]', cfg.mag);
  setField('magADC[2]', cfg.mag);
  setField('baroAlt', cfg.baro);
  setField('GPS_coord[0]', cfg.gps);
  setField('GPS_coord[1]', cfg.gps);
  setField('GPS_altitude', cfg.gps);
  setField('GPS_speed', cfg.gps);
  setField('GPS_numSat', cfg.gps);
  setField('imuQuaternion[0]', cfg.attitude);
  setField('imuQuaternion[1]', cfg.attitude);
  setField('imuQuaternion[2]', cfg.attitude);

  return {
    getMainFieldIndexByName(name: string): number | null {
      return idxTable[name] ?? null;
    },
    getChunksInTimeRange() {
      if (!cfg.gps || !idxTable['GPS_coord[0]']) return [];
      // Build a single frame with the GPS fields.
      const frame: number[] = [];
      frame[0] = 0; // time

      if (cfg.gpsLocked) {
        // Non-zero lat/lon, sufficient sats, valid altitude.
        frame[idxTable['GPS_coord[0]']] = Math.round(45.0 * 1e7); // lat
        frame[idxTable['GPS_coord[1]']] = Math.round(-73.0 * 1e7); // lon
        frame[idxTable['GPS_altitude']] = 150; // 15.0 m
        frame[idxTable['GPS_speed']] = 0;
        frame[idxTable['GPS_numSat']] = 8;
      } else {
        // Zero position or low satellites.
        frame[idxTable['GPS_coord[0]']] = 0;
        frame[idxTable['GPS_coord[1]']] = 0;
        frame[idxTable['GPS_altitude']] = 0;
        frame[idxTable['GPS_speed']] = 0;
        frame[idxTable['GPS_numSat']] = 2;
      }

      return [{ frames: [frame] }];
    },
  };
}
