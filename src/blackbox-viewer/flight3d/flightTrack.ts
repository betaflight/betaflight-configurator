/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { FLIGHT_LOG_FLIGHT_STATE_NAME } from "../flightlog_fielddefs.js";
import { GPS_transform } from "../gps_transform.js";

/** Frame time index in a decoded main frame (FlightLogParser.FLIGHT_LOG_FIELD_INDEX_TIME). */
export const FRAME_TIME_INDEX = 1;

const MIN_SATELLITES = 5; // same "numSat > 4" validity threshold flightlog.js applies to gpsCartesianCoords
const GPS_FIX_FLAG = 1 << FLIGHT_LOG_FLIGHT_STATE_NAME.indexOf("GPS_FIX"); // in stateFlags
const MIN_HOLD_US = 1_000_000;
const MAX_PLAUSIBLE_SPEED = 150; // m/s; faster jumps between fixes are receiver glitches
const BARO_MIN_SPACING_US = 50_000; // about the barometer's own update rate
// Median half-windows. In flight only single-reading glitches are removed, so a real dive of a
// few tenths of a second survives. When the motors spool up for takeoff, prop wash dips the
// reading 10-15 m for under half a second; the wider window applies only there.
const BARO_SPIKE_HALF_US = 80_000;
const TAKEOFF_MEDIAN_HALF_US = 500_000;
const TAKEOFF_WASH_US = 1_000_000; // how long after takeoff the wider window stays in use
const SAMPLE_STEP_US = 40_000; // denser than the 10 Hz fixes so turns are drawn as curves
const GAP_US = 2_000_000;
const GPS_ONLY_ALT_TAU_S = 1;
// Smooths the barometer's stepped readings for display. Wider would round off short dives; the
// local line fit keeps steady climbs and descents unchanged at any width.
const BARO_SMOOTH_SIGMA_S = 0.18;
const IDLE_THROTTLE = 1050; // rcCommand[3] at or below Betaflight's default min_check: stick at idle
const MIN_GROUND_US = 500_000;
const GROUND_RADIUS_M = 2;
const GROUND_SPREAD_M = 2; // idle throttle while dropping more than this is not sitting on the ground
const SAME_SPOT_RADIUS_M = 15;

/** The subset of FlightLog (flightlog.js) this module reads. */
export interface FlightLogSource {
    getMainFieldIndexByName(name: string): number | undefined;
    getChunksInTimeRange(startTime: number, endTime: number): { frames: ArrayLike<number>[] }[];
    getMinTime(): number;
    getMaxTime(): number;
}

export interface GpsFix {
    tUs: number;
    lat: number;
    lon: number;
    altM: number;
}

export interface BaroSample {
    tUs: number;
    altM: number;
}

/**
 * When the throttle sat at idle: from the start of the log until takeoff (`untilUs`) and from
 * touchdown to the end (`fromUs`). Null where the throttle was up.
 */
export interface IdleThrottle {
    untilUs: number | null;
    fromUs: number | null;
}

/** Position in the local frame anchored at the first fix: meters North, Up, East. */
export interface TrackPoint {
    n: number;
    u: number;
    e: number;
}

export interface TrackSample extends TrackPoint {
    tUs: number;
}

export interface FlightTrack {
    origin: { lat: number; lon: number; altM: number };
    samples: TrackSample[];
    /** gapAfter[i] === 1 when GPS was lost between samples i and i + 1. */
    gapAfter: Uint8Array;
    pinned: "none" | "start" | "both";
    /** Flat map reference: takeoff level when pinned, otherwise the first displayed position. */
    groundU: number;
    bounds: { minN: number; maxN: number; minE: number; maxE: number; minU: number; maxU: number };
    /** Geographic extent of the kept fixes. */
    box: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    toLocal(lat: number, lon: number, altM: number): TrackPoint;
    positionAt(tUs: number): TrackPoint | null;
}

type Transform = { WGS_BS(lat: number, lon: number, h: number): { x: number; y: number; z: number } };
const LocalTransform = GPS_transform as unknown as new (
    lat0: number,
    lon0: number,
    h0: number,
    heading: number,
) => Transform;

/**
 * Read GPS fixes, baro altitude and idle-throttle spans from the main frames. The firmware logs GPS
 * only when the position or satellite count changes (GPS_time with them, so it cannot mark a fresh
 * fix) and zeroes the count after 2.5 s of silence: a position repeated under a valid fix is current.
 */
export function extractSamples(flightLog: FlightLogSource): {
    fixes: GpsFix[];
    baro: BaroSample[] | null;
    idle: IdleThrottle | null;
} {
    const index = (name: string) => flightLog.getMainFieldIndexByName(name);
    const iSat = index("GPS_numSat");
    const iLat = index("GPS_coord[0]");
    const iLon = index("GPS_coord[1]");
    const iAlt = index("GPS_altitude");
    const iState = index("stateFlags");
    const iBaro = index("baroAlt");
    const iThrottle = index("rcCommand[3]");

    const fixes: GpsFix[] = [];
    if (iSat === undefined || iLat === undefined || iLon === undefined) {
        return { fixes, baro: null, idle: null }; // no track to draw: skip reading the log
    }
    const baro: BaroSample[] | null = iBaro === undefined ? null : [];
    const heldUntil: number[] = [];
    let current: { lat: number; lon: number; alt: number } | null = null;
    let lastBaroT = -Infinity;
    let takeoffUs: number | null = null;
    let lastThrottleUpUs: number | null = null;
    let firstUs: number | null = null;
    let lastUs = 0;

    for (const chunk of flightLog.getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())) {
        for (const frame of chunk.frames) {
            const tUs = frame[FRAME_TIME_INDEX];
            firstUs ??= tUs;
            lastUs = tUs;

            if (iThrottle !== undefined && frame[iThrottle] > IDLE_THROTTLE) {
                takeoffUs ??= tUs;
                lastThrottleUpUs = tUs;
            }

            if (baro && iBaro !== undefined && tUs - lastBaroT >= BARO_MIN_SPACING_US) {
                const altM = frame[iBaro] / 100;
                if (Number.isFinite(altM)) {
                    baro.push({ tUs, altM });
                    lastBaroT = tUs;
                }
            }

            const lat = frame[iLat];
            const lon = frame[iLon];
            // stateFlags is null until the first slow frame; that is no evidence of a lost fix.
            const hasFix = iState === undefined || frame[iState] == null || (frame[iState] & GPS_FIX_FLAG) !== 0;
            if (!(frame[iSat] >= MIN_SATELLITES) || !hasFix || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                current = null; // a hold never spans lost GPS, even if the same position comes back
                continue;
            }
            const alt = iAlt === undefined ? 0 : frame[iAlt];
            if (current && current.lat === lat && current.lon === lon && current.alt === alt) {
                heldUntil[heldUntil.length - 1] = tUs;
                continue;
            }
            current = { lat, lon, alt };
            fixes.push({ tUs, lat: lat / 1e7, lon: lon / 1e7, altM: alt / 10 });
            heldUntil.push(tUs);
        }
    }

    let idle: IdleThrottle | null = null;
    if (iThrottle !== undefined && firstUs !== null) {
        idle = {
            untilUs: takeoffUs === null ? lastUs : takeoffUs === firstUs ? null : takeoffUs,
            fromUs: lastThrottleUpUs === null ? firstUs : lastThrottleUpUs === lastUs ? null : lastThrottleUpUs,
        };
    }
    const atRest =
        takeoffUs === null
            ? []
            : (baro ?? []).filter((b) => b.tUs >= takeoffUs - MIN_GROUND_US && b.tUs < takeoffUs).map((b) => b.altM);
    const takeoffFromRest =
        takeoffUs !== null &&
        takeoffUs - firstUs! >= MIN_GROUND_US &&
        atRest.length >= 3 &&
        Math.max(...atRest) - Math.min(...atRest) <= GROUND_SPREAD_M;
    return {
        fixes: holdPositions(fixes, heldUntil),
        baro: baro && medianFilter(baro, takeoffFromRest ? takeoffUs : null),
        idle,
    };
}

/** Running median: short everywhere, wide just after a takeoff from rest. */
function medianFilter(samples: BaroSample[], takeoffUs: number | null): BaroSample[] {
    return samples.map(({ tUs }) => {
        const nearTakeoff =
            takeoffUs !== null && tUs >= takeoffUs - TAKEOFF_MEDIAN_HALF_US && tUs <= takeoffUs + TAKEOFF_WASH_US;
        const halfUs = nearTakeoff ? TAKEOFF_MEDIAN_HALF_US : BARO_SPIKE_HALF_US;
        const window = samples
            .slice(upperBound(samples, tUs - halfUs), upperBound(samples, tUs + halfUs))
            .map((b) => b.altM)
            .sort((a, b) => a - b);
        return { tUs, altM: window[window.length >> 1] };
    });
}

/**
 * Repeat a position held for over a second at the receiver's fix interval, until it changed or
 * went invalid, so a craft sitting still stays in place instead of drifting or dropping out as a
 * GPS gap. Shorter holds are missed solutions in flight and are interpolated across.
 */
function holdPositions(fixes: GpsFix[], heldUntil: number[]): GpsFix[] {
    const intervals = fixes.slice(1).map((f, i) => f.tUs - fixes[i].tUs);
    intervals.sort((a, b) => a - b);
    const interval = Math.min(Math.max(intervals[intervals.length >> 1] ?? 0, 50_000), MIN_HOLD_US);
    const held: GpsFix[] = [];
    fixes.forEach((fix, i) => {
        held.push(fix);
        const next = fixes[i + 1];
        const heldToNext = next && heldUntil[i] >= next.tUs - interval;
        // A new position means the craft started moving about one fix interval before it.
        const until = heldToNext ? next.tUs - interval / 2 : heldUntil[i];
        if (until - fix.tUs < MIN_HOLD_US) {
            return;
        }
        for (let t = fix.tUs + interval; t <= until; t += interval) {
            held.push({ ...fix, tUs: t });
        }
    });
    return held;
}

export function buildFlightTrack(flightLog: FlightLogSource): FlightTrack | null {
    const { fixes, baro, idle } = extractSamples(flightLog);
    return buildTrack(fixes, baro, idle);
}

/** Build the display track. Returns null when fewer than two usable fixes exist. */
export function buildTrack(
    allFixes: GpsFix[],
    baro: BaroSample[] | null,
    idle: IdleThrottle | null = null,
): FlightTrack | null {
    if (allFixes.length < 2) {
        return null;
    }
    const origin = { lat: allFixes[0].lat, lon: allFixes[0].lon, altM: allFixes[0].altM };
    const transform = new LocalTransform(origin.lat, origin.lon, origin.altM, 0);
    const toLocal = (lat: number, lon: number, altM: number): TrackPoint => {
        const p = transform.WGS_BS(lat, lon, altM);
        return { n: p.x, u: p.y, e: p.z };
    };

    const fixes: (GpsFix & TrackPoint)[] = [];
    for (const fix of allFixes) {
        const p = { ...fix, ...toLocal(fix.lat, fix.lon, fix.altM) };
        const prev = fixes.at(-1);
        if (prev) {
            const dt = (p.tUs - prev.tUs) / 1e6;
            if (dt <= 0 || Math.hypot(p.n - prev.n, p.e - prev.e) / dt > MAX_PLAUSIBLE_SPEED) {
                continue;
            }
        }
        fixes.push(p);
    }
    if (fixes.length < 2) {
        return null;
    }

    // A barometer that never changes is missing or failed, not a flat flight.
    const hasBaro = !!baro && baro.length >= 2 && baro.some((b) => b.altM !== baro[0].altM);
    const altitude = hasBaro ? baroAltitude(fixes, baro) : smoothGpsAltitude(fixes);

    const samples: TrackSample[] = [];
    const gaps: number[] = [];
    let segmentStart = 0;
    for (let k = 1; k <= fixes.length; k++) {
        const endOfSegment = k === fixes.length || fixes[k].tUs - fixes[k - 1].tUs > GAP_US;
        if (!endOfSegment) {
            continue;
        }
        const segment = fixes.slice(segmentStart, k);
        const velocities = fixVelocities(segment);
        let j = 0;
        const t0 = segment[0].tUs;
        const t1 = segment.at(-1)!.tUs;
        for (let t = t0; ;) {
            while (j < segment.length - 2 && segment[j + 1].tUs <= t) {
                j++;
            }
            const { n, e } = hermite(segment, velocities, j, t);
            samples.push({ tUs: t, n, e, u: altitude(t) });
            if (t === t1) {
                break;
            }
            // Also sample at every fix, so the drawn path goes through each one exactly.
            t = Math.min(t + SAMPLE_STEP_US, segment[j + 1].tUs);
        }
        if (k < fixes.length) {
            gaps.push(samples.length - 1);
        }
        segmentStart = k;
    }
    const gapAfter = new Uint8Array(samples.length);
    for (const i of gaps) {
        gapAfter[i] = 1;
    }

    const pinned = pinToGround(samples, fixes, idle);

    const bounds = {
        minN: Infinity,
        maxN: -Infinity,
        minE: Infinity,
        maxE: -Infinity,
        minU: Infinity,
        maxU: -Infinity,
    };
    for (const s of samples) {
        bounds.minN = Math.min(bounds.minN, s.n);
        bounds.maxN = Math.max(bounds.maxN, s.n);
        bounds.minE = Math.min(bounds.minE, s.e);
        bounds.maxE = Math.max(bounds.maxE, s.e);
        bounds.maxU = Math.max(bounds.maxU, s.u);
        bounds.minU = Math.min(bounds.minU, s.u);
    }
    const groundU = pinned === "none" ? samples[0].u : 0;

    const box = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
    for (const f of fixes) {
        box.minLat = Math.min(box.minLat, f.lat);
        box.maxLat = Math.max(box.maxLat, f.lat);
        box.minLon = Math.min(box.minLon, f.lon);
        box.maxLon = Math.max(box.maxLon, f.lon);
    }

    const positionAt = (tUs: number): TrackPoint | null => {
        if (tUs < samples[0].tUs || tUs > samples.at(-1)!.tUs) {
            return null;
        }
        const i = Math.max(0, upperBound(samples, tUs) - 1);
        const a = samples[i];
        const b = samples[Math.min(i + 1, samples.length - 1)];
        if (b === a || tUs === a.tUs) {
            return { n: a.n, u: a.u, e: a.e };
        }
        if (gapAfter[i]) {
            return null;
        }
        const f = (tUs - a.tUs) / (b.tUs - a.tUs);
        return { n: a.n + (b.n - a.n) * f, u: a.u + (b.u - a.u) * f, e: a.e + (b.e - a.e) * f };
    };

    return { origin, samples, gapAfter, pinned, groundU, bounds, box, toLocal, positionAt };
}

/** Horizontal velocity at each fix, from its neighbours (m/s); the curve's tangents. */
function fixVelocities(segment: TrackSample[]): { vn: number[]; ve: number[] } {
    const slope = (i: number, axis: "n" | "e") => {
        const a = Math.max(0, i - 1);
        const b = Math.min(segment.length - 1, i + 1);
        return b > a ? ((segment[b][axis] - segment[a][axis]) * 1e6) / (segment[b].tUs - segment[a].tUs) : 0;
    };
    return { vn: segment.map((_, i) => slope(i, "n")), ve: segment.map((_, i) => slope(i, "e")) };
}

/**
 * Cubic Hermite position between fixes j and j + 1: through every fix, with arcs instead of corners
 * between them. It shapes the drawing only; it does not remove GPS error.
 */
function hermite(
    segment: TrackSample[],
    v: { vn: number[]; ve: number[] },
    j: number,
    tUs: number,
): { n: number; e: number } {
    const k = Math.min(j + 1, segment.length - 1);
    const h = (segment[k].tUs - segment[j].tUs) / 1e6;
    if (h <= 0) {
        return { n: segment[j].n, e: segment[j].e };
    }
    const s = (tUs - segment[j].tUs) / 1e6 / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    return {
        n: h00 * segment[j].n + h10 * h * v.vn[j] + h01 * segment[k].n + h11 * h * v.vn[k],
        e: h00 * segment[j].e + h10 * h * v.ve[j] + h01 * segment[k].e + h11 * h * v.ve[k],
    };
}

/**
 * Shape from the barometer, level from the median GPS offset: over a flight GPS altitude wanders
 * more than the barometer drifts. Not height above terrain.
 */
function baroAltitude(fixes: (GpsFix & TrackPoint)[], baro: BaroSample[]): (tUs: number) => number {
    const baroT = baro.map((b) => b.tUs);
    const baroA = smoothBaro(baro);
    const offsets = fixes.map((f) => f.u - interpolate(baroT, baroA, f.tUs)).sort((a, b) => a - b);
    const offset = offsets[offsets.length >> 1];
    return (tUs) => interpolate(baroT, baroA, tUs) + offset;
}

/** Gaussian-weighted local line fit: smooths the stepped readings without lag or rounding off climbs. */
function smoothBaro(baro: BaroSample[]): number[] {
    const radiusUs = 3 * BARO_SMOOTH_SIGMA_S * 1e6;
    let lo = 0;
    let hi = 0;
    return baro.map((sample) => {
        while (baro[lo].tUs < sample.tUs - radiusUs) {
            lo++;
        }
        while (hi < baro.length && baro[hi].tUs <= sample.tUs + radiusUs) {
            hi++;
        }
        let weight = 0;
        let time = 0;
        let timeSquared = 0;
        let altitude = 0;
        let timeAltitude = 0;
        for (let k = lo; k < hi; k++) {
            const dt = (baro[k].tUs - sample.tUs) / 1e6;
            const w = Math.exp(-0.5 * (dt / BARO_SMOOTH_SIGMA_S) ** 2);
            weight += w;
            time += w * dt;
            timeSquared += w * dt * dt;
            altitude += w * baro[k].altM;
            timeAltitude += w * dt * baro[k].altM;
        }
        const determinant = weight * timeSquared - time * time;
        return determinant > 1e-12 ? (altitude * timeSquared - timeAltitude * time) / determinant : sample.altM;
    });
}

function smoothGpsAltitude(fixes: (GpsFix & TrackPoint)[]): (tUs: number) => number {
    const fixT = fixes.map((f) => f.tUs);
    const smoothed = zeroPhaseEma(
        fixT,
        fixes.map((f) => f.u),
        GPS_ONLY_ALT_TAU_S,
    );
    return (tUs) => interpolate(fixT, smoothed, tUs);
}

/**
 * Zero the altitude where the craft was on the ground: idle throttle and still, vertically too (a
 * climb or hover is horizontally still). Both ends on the ground at the same spot also remove the
 * drift between them as a ramp. Without that evidence the altitude is left as recorded.
 */
function pinToGround(samples: TrackSample[], fixes: TrackSample[], idle: IdleThrottle | null): FlightTrack["pinned"] {
    const first = fixes[0];
    const last = fixes.at(-1)!;
    const startLevel =
        idle?.untilUs == null ? null : groundLevel(samples, fixes, first, first.tUs, Math.min(idle.untilUs, last.tUs));
    if (startLevel === null) {
        return "none";
    }
    const endLevel =
        idle?.fromUs == null ? null : groundLevel(samples, fixes, last, Math.max(idle.fromUs, first.tUs), last.tUs);
    const sameSpot = Math.hypot(last.n - first.n, last.e - first.e) <= SAME_SPOT_RADIUS_M;
    if (endLevel === null || !sameSpot) {
        for (const s of samples) {
            s.u -= startLevel;
        }
        return "start";
    }
    const t0 = samples[0].tUs;
    const span = samples.at(-1)!.tUs - t0 || 1;
    for (const s of samples) {
        s.u -= startLevel + ((endLevel - startLevel) * (s.tUs - t0)) / span;
    }
    return "both";
}

/** Mean altitude over an idle-throttle window, if the craft stayed put in it. */
function groundLevel(
    samples: TrackSample[],
    fixes: TrackSample[],
    anchor: TrackSample,
    fromUs: number,
    toUs: number,
): number | null {
    const window = fixes.filter((f) => f.tUs >= fromUs && f.tUs <= toUs);
    if (window.length < 3 || window.at(-1)!.tUs - window[0].tUs < MIN_GROUND_US) {
        return null;
    }
    if (window.some((f) => Math.hypot(f.n - anchor.n, f.e - anchor.e) > GROUND_RADIUS_M)) {
        return null;
    }
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (const s of samples) {
        if (s.tUs >= fromUs && s.tUs <= toUs) {
            min = Math.min(min, s.u);
            max = Math.max(max, s.u);
            sum += s.u;
            count++;
        }
    }
    return max - min > GROUND_SPREAD_M ? null : sum / count;
}

function zeroPhaseEma(t: number[], x: number[], tauS: number): number[] {
    const y = x.slice();
    for (let i = 1; i < y.length; i++) {
        const alpha = 1 - Math.exp(-(t[i] - t[i - 1]) / 1e6 / tauS);
        y[i] = y[i - 1] + alpha * (y[i] - y[i - 1]);
    }
    for (let i = y.length - 2; i >= 0; i--) {
        const alpha = 1 - Math.exp(-(t[i + 1] - t[i]) / 1e6 / tauS);
        y[i] = y[i + 1] + alpha * (y[i] - y[i + 1]);
    }
    return y;
}

/** Linear interpolation over sorted `t`, clamped at both ends. */
function interpolate(t: number[], v: number[], at: number): number {
    if (at <= t[0]) {
        return v[0];
    }
    if (at >= t.at(-1)!) {
        return v.at(-1)!;
    }
    const i = upperBound(t, at) - 1;
    const f = (at - t[i]) / (t[i + 1] - t[i]);
    return v[i] + (v[i + 1] - v[i]) * f;
}

/** Index of the first element whose time is greater than `at`. */
export function upperBound(items: number[] | { tUs: number }[], at: number): number {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const item = items[mid];
        const value = typeof item === "number" ? item : item.tUs;
        if (value <= at) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}
