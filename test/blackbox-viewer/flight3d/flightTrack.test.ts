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

import { describe, expect, it } from "vitest";
import {
    buildTrack,
    extractSamples,
    type BaroSample,
    type FlightLogSource,
    type GpsFix,
} from "../../../src/blackbox-viewer/flight3d/flightTrack";

const LAT0 = 48.4;
const LON0 = -71.1;
const ALT0 = 100;
// WGS-84 meters per degree at LAT0, so synthetic positions land where the track's own frame puts them.
const WGS84_A = 6378137;
const WGS84_E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
const SIN0 = Math.sin((LAT0 * Math.PI) / 180);
const M_PER_DEG_LAT = ((WGS84_A * (1 - WGS84_E2)) / (1 - WGS84_E2 * SIN0 * SIN0) ** 1.5) * (Math.PI / 180);
const M_PER_DEG_LON =
    (WGS84_A / Math.sqrt(1 - WGS84_E2 * SIN0 * SIN0)) * Math.cos((LAT0 * Math.PI) / 180) * (Math.PI / 180);

/** Deterministic standard-normal noise so failures reproduce. */
function gaussian(seed: number): () => number {
    let s = seed >>> 0;
    const uniform = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
}

function fixAt(tS: number, n: number, e: number, h: number): GpsFix {
    return { tUs: tS * 1e6, lat: LAT0 + n / M_PER_DEG_LAT, lon: LON0 + e / M_PER_DEG_LON, altM: ALT0 + h };
}

const rms = (errors: number[]) => Math.sqrt(errors.reduce((sum, x) => sum + x * x, 0) / errors.length);

/** 5 min: 5 s parked, a 50 m circle at 20-40 m, back to the takeoff spot, 5 s parked. */
function loopFlight() {
    const duration = 300;
    const height = (t: number) => {
        if (t < 5 || t > duration - 5) {
            return 0;
        }
        const climb = Math.min(1, (t - 5) / 20, (duration - 5 - t) / 20);
        return climb * (30 + 10 * Math.sin(t / 15));
    };
    const horizontal = (t: number) => {
        if (t < 5 || t > duration - 5) {
            return { n: 0, e: 0 };
        }
        const a = (2 * Math.PI * (t - 5)) / (duration - 10);
        return { n: 50 * Math.sin(a), e: 50 * (1 - Math.cos(a)) };
    };
    return { duration, height, horizontal };
}

/** GPS fixes at 10 Hz and baro at 20 Hz for a craft that stays over one spot at `height(t)`. */
function verticalFlight(duration: number, height: (tS: number) => number) {
    const fixes: GpsFix[] = [];
    const baro: BaroSample[] = [];
    for (let t = 0; t <= duration + 1e-9; t += 0.05) {
        if (Math.round(t * 20) % 2 === 0) {
            fixes.push(fixAt(t, 0, 0, height(t)));
        }
        baro.push({ tUs: t * 1e6, altM: 50 + height(t) });
    }
    return { fixes, baro };
}

const heightAboveGround = (track: NonNullable<ReturnType<typeof buildTrack>>) =>
    track.samples.map((s) => s.u - track.groundU);

describe("buildTrack altitude", () => {
    it("keeps a dive below the reference without raising the rest of an unpinned flight", () => {
        const flight = (depth: number) => {
            const { fixes, baro } = verticalFlight(30, (t) =>
                t >= 10 && t <= 20 ? -depth * Math.sin((Math.PI * (t - 10)) / 10) ** 2 : 0,
            );
            return buildTrack(fixes, baro)!;
        };
        const shallow = flight(10);
        const deep = flight(60);
        for (const t of [0, 5, 25, 30]) {
            expect(deep.positionAt(t * 1e6)!.u - deep.groundU).toBeCloseTo(0, 2);
            expect(shallow.positionAt(t * 1e6)!.u - shallow.groundU).toBeCloseTo(0, 2);
        }
        expect(deep.positionAt(15e6)!.u - deep.groundU).toBeLessThan(-59);
    });

    it("smooths barometer steps without losing a fast dive or shifting its time", () => {
        const truth = (t: number) => -30 * Math.exp(-(((t - 10) / 0.8) ** 2));
        const { fixes, baro } = verticalFlight(20, (t) => truth(Math.floor((t + 1e-6) * 10) / 10));
        const track = buildTrack(fixes, baro)!;
        const displayed: number[] = [];
        const held: number[] = [];
        for (let i = 1; i < 399; i++) {
            displayed.push(track.positionAt(i * 50_000)!.u);
            held.push(truth(Math.floor(i / 2) / 10));
        }
        const roughness = (values: number[]) => rms(values.slice(2).map((v, i) => v - 2 * values[i + 1] + values[i]));
        expect(roughness(displayed)).toBeLessThan(roughness(held) / 5);
        const bottom = track.samples.reduce((a, b) => (a.u < b.u ? a : b));
        expect(bottom.u - track.groundU).toBeLessThan(-28);
        expect(Math.abs(bottom.tUs / 1e6 - 10)).toBeLessThan(0.1);
    });

    // Measured on real logs: GPS altitude wandered 5-12 m within minutes while the baro drifted
    // under 2 m, so the drawn height must follow the baro, not the GPS.
    it("follows the barometer when GPS altitude wanders", () => {
        const { duration, height, horizontal } = loopFlight();
        const noise = gaussian(1);
        const fixes: GpsFix[] = [];
        for (let t = 0; t <= duration; t += 0.1) {
            const { n, e } = horizontal(t);
            const wander = 6 * Math.sin((Math.PI * t) / duration) + 2 * Math.sin((2 * Math.PI * t) / 40);
            fixes.push(fixAt(t, n, e, height(t) + wander + noise()));
        }
        const baro: BaroSample[] = [];
        for (let t = 0; t <= duration; t += 0.05) {
            baro.push({ tUs: t * 1e6, altM: 50 + height(t) + (0.5 * t) / duration + 0.2 * noise() });
        }

        const track = buildTrack(fixes, baro, null)!;

        const meanU = track.samples.reduce((sum, s) => sum + s.u, 0) / track.samples.length;
        const meanH = track.samples.reduce((sum, s) => sum + height(s.tUs / 1e6), 0) / track.samples.length;
        expect(rms(track.samples.map((s) => s.u - meanU - (height(s.tUs / 1e6) - meanH)))).toBeLessThan(0.5);
    });

    it("pins takeoff and landing to the ground when the log shows idle throttle there", () => {
        const { duration, height, horizontal } = loopFlight();
        const noise = gaussian(2);
        const fixes: GpsFix[] = [];
        for (let t = 0; t <= duration; t += 0.1) {
            const { n, e } = horizontal(t);
            fixes.push(fixAt(t, n + 0.3 * noise(), e + 0.3 * noise(), height(t) + noise()));
        }
        const baro: BaroSample[] = [];
        for (let t = 0; t <= duration; t += 0.05) {
            baro.push({ tUs: t * 1e6, altM: 50 + height(t) + (1.5 * t) / duration + 0.2 * noise() });
        }

        const track = buildTrack(fixes, baro, { untilUs: 5e6, fromUs: (duration - 5) * 1e6 })!;

        expect(track.pinned).toBe("both");
        expect(rms(track.samples.map((s) => s.u - height(s.tUs / 1e6)))).toBeLessThan(0.3);
    });

    it("keeps a vertical climb that starts with the log instead of levelling it as drift", () => {
        const { fixes, baro } = verticalFlight(10, (t) => 5 * t);
        const track = buildTrack(fixes, baro, { untilUs: null, fromUs: null })!;
        expect(track.pinned).toBe("none");
        expect(Math.max(...heightAboveGround(track))).toBeCloseTo(50, 0);
    });

    it("measures a climb from the ground level seen before takeoff", () => {
        // 3 s idle on the ground, 50 m straight up in 10 s, then back down to land and idle.
        const height = (t: number) => (t < 3 ? 0 : t < 13 ? 5 * (t - 3) : t < 20 ? 50 : t < 30 ? 50 - 5 * (t - 20) : 0);
        const { fixes, baro } = verticalFlight(33, height);
        const track = buildTrack(fixes, baro, { untilUs: 3e6, fromUs: 30e6 })!;
        expect(track.pinned).toBe("both");
        expect(rms(track.samples.map((s) => s.u - height(s.tUs / 1e6)))).toBeLessThan(0.1);
    });

    it("does not take a hover for the ground when the throttle is up", () => {
        const { fixes, baro } = verticalFlight(20, (t) => (t < 5 ? 20 : 20 + 2 * (t - 5)));
        const track = buildTrack(fixes, baro, { untilUs: null, fromUs: null })!;
        expect(track.pinned).toBe("none");
        expect(Math.max(...heightAboveGround(track))).toBeCloseTo(30, 0);
    });

    it("does not take idle throttle while dropping for the ground", () => {
        const { fixes, baro } = verticalFlight(10, (t) => Math.max(0, 30 - 10 * t));
        const track = buildTrack(fixes, baro, { untilUs: 1.5e6, fromUs: null })!;
        expect(track.pinned).toBe("none");
    });

    it("uses GPS altitude when the barometer never changes", () => {
        // A barometer that is not fitted or has failed reads a constant, not a flat flight.
        const { fixes } = verticalFlight(20, (t) => 2 * t);
        const deadBaro = fixes.map((f) => ({ tUs: f.tUs, altM: 0 }));
        const track = buildTrack(fixes, deadBaro)!;
        expect(Math.max(...heightAboveGround(track))).toBeGreaterThan(35);
    });
});

describe("buildTrack horizontal path", () => {
    // Truth is expressed in the same local frame as the track (anchored at its first fix).
    const horizontalError = (
        track: NonNullable<ReturnType<typeof buildTrack>>,
        truth: (tS: number) => { n: number; e: number } | null,
    ) => {
        let worst = 0;
        for (const s of track.samples) {
            const t = truth(s.tUs / 1e6);
            if (!t) {
                continue;
            }
            const f = fixAt(0, t.n, t.e, 0);
            const p = track.toLocal(f.lat, f.lon, f.altM);
            worst = Math.max(worst, Math.hypot(s.n - p.n, s.e - p.e));
        }
        return worst;
    };

    it("draws a tight turn as a curve rather than straight chords between fixes", () => {
        const radius = 8;
        const w = 20 / radius; // 20 m/s
        const circle = (t: number) => ({ n: radius * Math.sin(w * t), e: radius * (1 - Math.cos(w * t)) });
        const fixes: GpsFix[] = [];
        for (let t = 0; t <= 5; t += 0.1) {
            const p = circle(t);
            fixes.push(fixAt(t, p.n, p.e, 10));
        }
        // Skip the first and last interval, where the curve's tangent can only look one way.
        const interior = (t: number) => (t > 0.1 && t < 4.9 ? circle(t) : null);
        // Straight chords between these fixes sag 6 cm inside the circle.
        expect(horizontalError(buildTrack(fixes, null)!, interior)).toBeLessThan(0.01);
    });

    it("passes through every GPS fix, noisy or not", () => {
        const noise = gaussian(7);
        const fixes: GpsFix[] = [];
        for (let t = 0; t <= 60; t = Math.round((t + 0.1 + 0.02 * noise()) * 1000) / 1000) {
            fixes.push(fixAt(t, 8 * t + noise(), 20 * Math.sin(t / 3) + noise(), 10));
        }
        const track = buildTrack(fixes, null)!;
        let worst = 0;
        for (const f of fixes) {
            const drawn = track.positionAt(f.tUs)!;
            const fix = track.toLocal(f.lat, f.lon, f.altM);
            worst = Math.max(worst, Math.hypot(drawn.n - fix.n, drawn.e - fix.e));
        }
        expect(worst).toBeLessThan(0.001);
    });
});

describe("buildTrack GPS handling", () => {
    it("breaks the track across a GPS dropout instead of drawing through it", () => {
        const fixes: GpsFix[] = [];
        for (let t = 0; t <= 60; t += 0.1) {
            if (t > 30 && t < 40) {
                continue;
            }
            fixes.push(fixAt(t, 5 * t, 0, 20));
        }
        const track = buildTrack(fixes, null)!;

        expect(track.gapAfter.some((g) => g === 1)).toBe(true);
        expect(track.positionAt(35e6)).toBeNull();
        expect(track.positionAt(20e6)).not.toBeNull();
        for (const s of track.samples) {
            expect(Number.isFinite(s.n) && Number.isFinite(s.u) && Number.isFinite(s.e)).toBe(true);
        }
    });

    it("rejects a fix that jumps 5 km in 0.1 s", () => {
        const fixes = [0, 0.1, 0.2, 0.3, 0.4].map((t) => fixAt(t, t * 10, 0, 10));
        fixes.splice(2, 0, fixAt(0.15, 5000, 0, 10));
        const track = buildTrack(fixes, null)!;
        expect(Math.max(...track.samples.map((s) => Math.abs(s.n)))).toBeLessThan(10);
    });

    it("returns null for a log with fewer than two usable fixes", () => {
        expect(buildTrack([fixAt(0, 0, 0, 0)], null)).toBeNull();
    });
});

describe("extractSamples", () => {
    const FIELDS = [
        "loopIteration",
        "time",
        "GPS_numSat",
        "GPS_coord[0]",
        "GPS_coord[1]",
        "GPS_altitude",
        "baroAlt",
        "rcCommand[3]",
        "stateFlags",
    ];
    const GPS_FIX_STATE = 0b111; // GPS_FIX_HOME | GPS_FIX | GPS_FIX_EVER

    interface FrameSpec {
        numSat?: number;
        n?: number;
        e?: number;
        baroM?: number;
        throttle?: number;
        state?: number;
    }

    /** Main frames at 50 Hz; GPS values change at 10 Hz and are held in between, like the viewer's merge. */
    function fakeLog(durationS: number, spec: (tS: number, gpsTS: number) => FrameSpec, fields = FIELDS) {
        const frames: number[][] = [];
        for (let i = 0; i <= durationS * 50; i++) {
            const tS = i / 50;
            const s = spec(tS, Math.floor(i / 5) / 10);
            const values: Record<string, number> = {
                loopIteration: i,
                time: tS * 1e6,
                GPS_numSat: s.numSat ?? 10,
                "GPS_coord[0]": Math.round((LAT0 + (s.n ?? 0) / M_PER_DEG_LAT) * 1e7),
                "GPS_coord[1]": Math.round((LON0 + (s.e ?? 0) / M_PER_DEG_LON) * 1e7),
                GPS_altitude: ALT0 * 10,
                baroAlt: Math.round((s.baroM ?? 0) * 100),
                "rcCommand[3]": s.throttle ?? 1400,
                stateFlags: s.state ?? GPS_FIX_STATE,
            };
            frames.push(fields.map((name) => values[name]));
        }
        const log: FlightLogSource = {
            getMainFieldIndexByName: (name) => (fields.includes(name) ? fields.indexOf(name) : undefined),
            getChunksInTimeRange: () => [{ frames }],
            getMinTime: () => 0,
            getMaxTime: () => durationS * 1e6,
        };
        return log;
    }

    const trackOf = (log: FlightLogSource) => {
        const { fixes, baro, idle } = extractSamples(log);
        return buildTrack(fixes, baro, idle)!;
    };

    // Parked for 5 s (the firmware logs no new GPS frame while the position is unchanged), then
    // north at 5 m/s.
    const parkedThenNorth = (gpsT: number) => ({ n: Math.max(0, 5 * (gpsT - 5)) });

    it("keeps a craft that sits still with a valid fix on the map", () => {
        const track = trackOf(fakeLog(10, (_t, gpsT) => parkedThenNorth(gpsT)));
        expect(track.positionAt(2e6)!.n).toBeCloseTo(0, 1);
        expect(track.positionAt(4.8e6)!.n).toBeCloseTo(0, 1); // hasn't started moving early
        expect(track.positionAt(8e6)!.n).toBeCloseTo(15, 0);
    });

    it("shows a GPS loss as a gap", () => {
        const lost = (t: number) => (t >= 2 && t < 7 ? 0 : 10);
        const moved = trackOf(fakeLog(10, (t, gpsT) => ({ ...parkedThenNorth(gpsT), numSat: lost(t) })));
        expect(moved.positionAt(4e6)).toBeNull();
        expect(moved.positionAt(8e6)).not.toBeNull();
        // Same position before and after the loss: still a gap, not a held position.
        const parked = trackOf(fakeLog(10, (t) => ({ numSat: lost(t) })));
        expect(parked.positionAt(4e6)).toBeNull();
    });

    it("shows a lost fix as a gap even while satellites are still counted", () => {
        const track = trackOf(
            fakeLog(10, (t, gpsT) => ({ ...parkedThenNorth(gpsT), state: t >= 2 && t < 7 ? 0b101 : GPS_FIX_STATE })),
        );
        expect(track.positionAt(4e6)).toBeNull();
    });

    it("ignores low-satellite frames even when they carry 0,0 coordinates", () => {
        const log = fakeLog(2, (_t, gpsT) =>
            gpsT < 1 ? { numSat: 3, n: -LAT0 * M_PER_DEG_LAT, e: -LON0 * M_PER_DEG_LON } : { n: 10 * gpsT },
        );
        const { fixes } = extractSamples(log);
        expect(fixes.length).toBeGreaterThan(2);
        expect(fixes.every((f) => f.lat > 40)).toBe(true);
    });

    it("ignores the pressure dip when the motors spool up for takeoff", () => {
        // A real takeoff: the barometer reads 13-16 m below the ground for 0.45 s as the motors
        // spool up (20 Hz readings, cm), then settles on the actual 4 m climb.
        const dip = [79, -580, -681, -1120, -1137, -1475, -1298, -951, -639, 36, 383];
        const baroCm = (t: number) => {
            const k = Math.round((t - 2) * 20);
            return k < 0 ? 160 : k < dip.length ? dip[k] : 410;
        };
        const { baro } = extractSamples(
            fakeLog(6, (t) => ({ baroM: baroCm(Math.floor(t * 20) / 20) / 100, throttle: t < 2 ? 1000 : 1400 })),
        );
        expect(Math.min(...baro!.map((b) => b.altM))).toBeGreaterThan(1.5);
        expect(baro!.at(-1)!.altM).toBeCloseTo(4.1, 1); // the climb itself is kept
    });

    it("preserves a brief in-flight dive instead of classifying it as takeoff pressure wash", () => {
        const track = trackOf(
            fakeLog(20, (_t, gpsT) => ({
                n: 5 * gpsT,
                baroM: -30 * Math.exp(-(((gpsT - 10) / 0.8) ** 2)),
            })),
        );
        expect(track.positionAt(10e6)!.u - track.groundU).toBeLessThan(-28);
        expect(track.positionAt(18e6)!.u - track.groundU).toBeCloseTo(0, 2);
    });

    it("reports idle throttle before takeoff and after touchdown", () => {
        const { idle } = extractSamples(fakeLog(10, (t) => ({ throttle: t >= 2 && t < 8 ? 1400 : 1000 })));
        expect(idle!.untilUs).toBeCloseTo(2e6, -4);
        expect(idle!.fromUs).toBeCloseTo(8e6, -5);
    });

    it("does not read the frames of a log without GPS", () => {
        const fields = FIELDS.filter((f) => !f.startsWith("GPS_"));
        const log = fakeLog(1, () => ({}), fields);
        let reads = 0;
        const { getChunksInTimeRange } = log;
        log.getChunksInTimeRange = (start, end) => {
            reads++;
            return getChunksInTimeRange(start, end);
        };
        expect(extractSamples(log).fixes).toEqual([]);
        expect(reads).toBe(0);
    });

    it("reports no baro or throttle when the log lacks them", () => {
        const fields = FIELDS.filter((f) => f !== "baroAlt" && f !== "rcCommand[3]");
        const { baro, idle } = extractSamples(fakeLog(1, () => ({}), fields));
        expect(baro).toBeNull();
        expect(idle).toBeNull();
    });
});
