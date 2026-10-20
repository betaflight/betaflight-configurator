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

/**
 * Frame test wizard payloads (firmware USE_FRAME_WIZARD, MSP2_SET_FRAME_WIZARD / _STATUS / _RESULT).
 * The flight controller does all the work; the host starts it, polls the status (which is the
 * keepalive) and reads the result. Only payload version 4 is understood.
 */

export const FRAME_WIZARD_VERSION = 4;

export const POINT_COUNT = 6; // arm 1-4, frame, USB cable
export const POINT_FRAME = 4;
export const POINT_CABLE = 5;
export const MOTOR_COUNT = 4;
export const RESPONSE_BINS = 128; // MSP2_FRAME_WIZARD_RESPONSE: per axis, log spaced 20 Hz..f1
export const TAPS_NEEDED = 5; // per point, and exactly this many on the cable

export const PHASES = ["idle", "taps", "beep", "motors", "analyse", "done", "aborted", "cable"] as const;
export type WizardPhase = (typeof PHASES)[number];

/** Last tap: a point index 0..5, or one of these. */
export const LABEL_NONE = -2;
export const LABEL_UNKNOWN = -1;
export const LABEL_PENDING = 7; // collecting the first taps, before the session scales exist
export const LABEL_CLIPPED = 8; // a sensor hit full scale

export const END_NONE = 0;
export const END_DONE = 1;

export const OP_ABORT = 0;
export const OP_START = 1;
export const OP_KEEPALIVE = 2;

export const START_FLAG_SKIP_TAPS = 1 << 0; // the motor run alone
export const START_FLAG_FIXED_BASES = 1 << 1;
export const START_FLAG_TAPS_ONLY = 1 << 3; // the cable, frame and arms by taps, done before any motor

/** The two parts of the frame test, each run on its own. */
export type RunKind = "taps" | "motors";

export function startParamsFor(kind: RunKind): StartParams {
    return { ...DEFAULT_START, flags: kind === "taps" ? START_FLAG_TAPS_ONLY : START_FLAG_SKIP_TAPS };
}

const AXES = ["roll", "pitch", "yaw"] as const;
export type Axis = (typeof AXES)[number];

export interface WizardStatus {
    version: number;
    phase: WizardPhase;
    counts: number[];
    confirmed: number[];
    beeped: number;
    seq: number;
    label: number;
    spin: number;
    fcMs: number;
    loopHz: number;
    rpmTelemetry: boolean;
    accPresent: boolean;
    accCalibrated: boolean;
    /** Taps phase only: the FC collects taps without labels until they come from several directions. */
    learning: boolean;
    live: number[];
    /** Point of the last too-strong tap, null when unknown. */
    clippedPoint: number | null;
    endReason: number;
}

export interface PointMode {
    hz: number;
    taps: number;
    cable: boolean;
}

export interface MotorPeak {
    hz: number;
    gain: number;
    axis: Axis | null;
    /** 2 = present at both speeds, 1 = one (a rotation line hid it at the other). */
    speeds: number;
    cable: boolean;
}

export interface WizardResult {
    phase: WizardPhase;
    points: PointMode[][];
    motors: MotorPeak[][];
    rotationHz: [number, number];
    rpmMask: boolean;
    basesByRpm: boolean;
    speedLimited: boolean;
    noCable: boolean;
    baseCommand: [number, number];
    f1Hz: number;
    sessionTaps: number;
    clippedTaps: number;
    /** Points done by tap count without a confirmed mode. */
    noModeMask: number;
    amplitude: number[];
}

export interface StartParams {
    base1: number;
    base2: number;
    amplitude: number;
    sweepS: number;
    maxCommand: number;
    flags: number;
    rot1Hz: number;
    rot2Hz: number;
    clipPct: number;
}

// The same defaults as the firmware; 0 for the rotation targets and the clip share keeps the FC's own.
export const DEFAULT_START: StartParams = {
    base1: 1150,
    base2: 1300,
    amplitude: 40,
    sweepS: 15,
    maxCommand: 1700,
    flags: 0,
    rot1Hz: 0,
    rot2Hz: 0,
    clipPct: 0,
};

class Reader {
    private offset = 0;

    constructor(private readonly bytes: Uint8Array) {}

    get remaining(): number {
        return this.bytes.length - this.offset;
    }

    u8(): number {
        if (this.remaining < 1) {
            throw new RangeError("frame wizard payload too short");
        }
        return this.bytes[this.offset++];
    }

    u16(): number {
        return this.u8() | (this.u8() << 8);
    }

    u32(): number {
        return (this.u16() + this.u16() * 0x10000) >>> 0;
    }
}

function toBytes(data: ArrayBufferView | ArrayLike<number>): Uint8Array {
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return Uint8Array.from(data);
}

function phaseName(code: number): WizardPhase {
    return PHASES[code] ?? "idle";
}

export function encodeStart(params: StartParams = DEFAULT_START): number[] {
    const out: number[] = [];
    const u8 = (v: number) => out.push(v & 0xff);
    const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
    u8(OP_START);
    u16(params.base1);
    u16(params.base2);
    u16(params.amplitude);
    u8(params.sweepS);
    u16(params.maxCommand);
    u8(params.flags);
    u16(params.rot1Hz);
    u16(params.rot2Hz);
    u8(params.clipPct);
    return out;
}

export function encodeAbort(): number[] {
    return [OP_ABORT];
}

export function encodeKeepalive(): number[] {
    return [OP_KEEPALIVE];
}

/** @returns null for a payload this host does not understand (older firmware). */
export function parseStatus(data: ArrayBufferView | ArrayLike<number>): WizardStatus | null {
    const r = new Reader(toBytes(data));
    try {
        const version = r.u8();
        if (version < FRAME_WIZARD_VERSION) {
            return null;
        }
        const phase = phaseName(r.u8());
        const counts: number[] = [];
        const confirmed: number[] = [];
        for (let i = 0; i < POINT_COUNT; i++) {
            counts.push(r.u8());
            confirmed.push(r.u8());
        }
        const beeped = r.u8();
        const seq = r.u16();
        const label = r.u8() - 2;
        const spin = r.u8();
        const fcMs = r.u32();
        const loopHz = r.u16();
        const flags = r.u8();
        const live: number[] = [];
        for (let m = 0; m < MOTOR_COUNT; m++) {
            live.push(r.u8());
        }
        const clipped = r.u8();
        const endReason = r.u8();
        return {
            version,
            phase,
            counts,
            confirmed,
            beeped,
            seq,
            label,
            spin,
            fcMs,
            loopHz,
            rpmTelemetry: (flags & 1) !== 0,
            accPresent: (flags & 2) !== 0,
            accCalibrated: (flags & 4) !== 0,
            learning: (flags & 8) !== 0,
            live,
            clippedPoint: clipped < POINT_COUNT ? clipped : null,
            endReason,
        };
    } catch {
        return null;
    }
}

/** @returns null for a payload this host does not understand (older firmware). */
export function parseResult(data: ArrayBufferView | ArrayLike<number>): WizardResult | null {
    const r = new Reader(toBytes(data));
    try {
        if (r.u8() < FRAME_WIZARD_VERSION) {
            return null;
        }
        const phase = phaseName(r.u8());
        const points: PointMode[][] = [];
        for (let p = 0; p < POINT_COUNT; p++) {
            const modes: PointMode[] = [];
            for (let n = r.u8(); n > 0; n--) {
                const hz = r.u16() / 10;
                const taps = r.u8();
                modes.push({ hz, taps, cable: (r.u8() & 1) !== 0 });
            }
            points.push(modes);
        }
        const motors: MotorPeak[][] = [];
        for (let m = 0; m < MOTOR_COUNT; m++) {
            const peaks: MotorPeak[] = [];
            for (let n = r.u8(); n > 0; n--) {
                const hz = r.u16() / 10;
                const gain = r.u16() / 10000;
                const axisByte = r.u8();
                peaks.push({
                    hz,
                    gain,
                    axis: AXES[axisByte & 0x0f] ?? null,
                    speeds: (axisByte >> 4) & 0x3,
                    cable: (axisByte & 0x80) !== 0,
                });
            }
            motors.push(peaks);
        }
        const rotationHz: [number, number] = [r.u16() / 10, r.u16() / 10];
        const flags = r.u8();
        const baseCommand: [number, number] = [r.u16(), r.u16()];
        r.u16(); // automatic amplitude headroom per speed: the per-motor amplitudes below say it better
        r.u16();
        const f1Hz = r.u16();
        const sessionTaps = r.u8();
        const clippedTaps = r.u8();
        const noModeMask = r.u8();
        const amplitude: number[] = [];
        for (let m = 0; m < MOTOR_COUNT; m++) {
            amplitude.push(r.u8());
        }
        return {
            phase,
            points,
            motors,
            rotationHz,
            rpmMask: (flags & 1) !== 0,
            basesByRpm: (flags & 2) !== 0,
            speedLimited: (flags & 4) !== 0,
            noCable: (flags & 8) !== 0,
            baseCommand,
            f1Hz,
            sessionTaps,
            clippedTaps,
            noModeMask,
            amplitude,
        };
    } catch {
        return null;
    }
}

export const isTapPhase = (phase: WizardPhase): boolean => phase === "taps" || phase === "cable";
export const isActivePhase = (phase: WizardPhase): boolean =>
    phase === "cable" || phase === "taps" || phase === "beep" || phase === "motors" || phase === "analyse";
export const isMotorPhase = (phase: WizardPhase): boolean =>
    phase === "beep" || phase === "motors" || phase === "analyse";

export type StepState = "pending" | "active" | "done" | "error";

export interface ChecklistStep {
    /** "acc", "cable", "frame", "arm1".."arm4", "motor1".."motor4" */
    id: string;
    state: StepState;
    count: number;
    /** Ring fill, 0..1. */
    progress: number;
    /** The last tap on this point was too strong. */
    clipped: boolean;
    /** The FC is still learning from the first taps: this point has no label yet. */
    learning?: boolean;
}

export interface ChecklistContext {
    /** The wizard was started in this session (else the status is an earlier session's, or idle). */
    started: boolean;
    /** Before the start: the link is a USB serial port, so the FC will ask for the cable taps. */
    usbLink: boolean;
}

/** Cable taps were skipped by the FC (not on USB): it marks the point beeped without any tap. */
export function cableSkipped(status: WizardStatus): boolean {
    return status.phase !== "cable" && (status.beeped & (1 << POINT_CABLE)) !== 0 && status.counts[POINT_CABLE] === 0;
}

function tapStep(id: string, point: number, status: WizardStatus | null, started: boolean): ChecklistStep {
    const count = started && status ? status.counts[point] : 0;
    const done = started && status !== null && (status.beeped & (1 << point)) !== 0;
    // while the FC learns from the first taps no point has a label: they all wait, greyed
    const learning = started && status !== null && point !== POINT_CABLE && status.phase === "taps" && status.learning;
    if (learning) {
        return { id, state: "pending", count: 0, progress: 0, clipped: false, learning: true };
    }
    const tapping =
        started && status !== null && (point === POINT_CABLE ? status.phase === "cable" : status.phase === "taps");
    const clipped =
        tapping && status !== null && status.label === LABEL_CLIPPED && status.clippedPoint === point && !done;
    return {
        id,
        state: done ? "done" : clipped ? "error" : tapping ? "active" : "pending",
        count,
        progress: done ? 1 : Math.min(count / TAPS_NEEDED, 1),
        clipped,
    };
}

/** Phase 1 checklist: accelerometer, cable (on USB), frame, arms. */
export function tapChecklist(status: WizardStatus | null, ctx: ChecklistContext): ChecklistStep[] {
    const accOk = status?.accPresent === true && status.accCalibrated;
    const steps: ChecklistStep[] = [
        {
            id: "acc",
            state: accOk ? "done" : status ? "error" : "pending",
            count: 0,
            progress: accOk ? 1 : 0,
            clipped: false,
        },
    ];
    const withCable = ctx.started && status ? !cableSkipped(status) : ctx.usbLink;
    if (withCable) {
        steps.push(tapStep("cable", POINT_CABLE, status, ctx.started));
    }
    steps.push(tapStep("frame", POINT_FRAME, status, ctx.started));
    for (let arm = 0; arm < 4; arm++) {
        steps.push(tapStep(`arm${arm + 1}`, arm, status, ctx.started));
    }
    return steps;
}

/** Phase 2 checklist: the motors, all swept at once. */
export function motorChecklist(status: WizardStatus | null, ctx: ChecklistContext): ChecklistStep[] {
    const steps: ChecklistStep[] = [];
    for (let m = 0; m < MOTOR_COUNT; m++) {
        const running = ctx.started && status !== null && (status.phase === "motors" || status.phase === "analyse");
        const done = ctx.started && status?.phase === "done";
        steps.push({
            id: `motor${m + 1}`,
            state: done ? "done" : running ? "active" : "pending",
            count: ctx.started && status ? status.live[m] : 0,
            progress: done ? 1 : running && status ? status.spin / 100 : 0,
            clipped: false,
        });
    }
    return steps;
}

/**
 * FC frequencies are in the FC's own clock (HSI on some boards, a few % off): the ratio of the FC
 * time to the host time over the session corrects them. 1 when the session was too short to tell.
 */
export function clockFactor(fcMs0: number, hostMs0: number, fcMs1: number, hostMs1: number): number {
    const hostSpan = hostMs1 - hostMs0;
    const fcSpan = (fcMs1 - fcMs0) >>> 0;
    if (hostSpan < 10000 || fcSpan === 0) {
        return 1;
    }
    const factor = fcSpan / hostSpan;
    return factor > 0.9 && factor < 1.1 ? factor : 1;
}

export interface Resonance {
    hz: number;
    /** Tap points (arms 0-3, frame 4) where the mode was confirmed; the cable point is left out. */
    points: number[];
    motors: number[];
    /** Places seen, out of 5 tap points and 4 motors. */
    score: number;
}

export interface ResonanceSummary {
    /** Rings on a tap and is driven by the motors: the frame resonances that matter in flight. */
    frameAndMotors: Resonance[];
    tapsOnly: Resonance[];
    motorsOnly: Resonance[];
    /** The highest scoring of all, null when nothing qualifies. */
    main: Resonance | null;
}

// Peaks this close are one resonance: neighbours within 4 % (3 Hz at the bottom), a group at most 10 % wide.
const MERGE_REL = 0.04;
const MERGE_MIN_HZ = 3;
const GROUP_MAX_REL = 0.1;
/** A resonance seen in fewer places is left to the details. */
export const SUMMARY_MIN_SCORE = 3;

/** Peaks this close are one resonance (see MERGE_REL, GROUP_MAX_REL); sorted by frequency. */
function groupByHz<T extends { hz: number }>(input: T[]): T[][] {
    const peaks = [...input].sort((a, b) => a.hz - b.hz);
    const groups: T[][] = [];
    for (const peak of peaks) {
        const group = groups.at(-1);
        const prev = group?.at(-1);
        if (
            group &&
            prev &&
            peak.hz - prev.hz <= Math.max(MERGE_MIN_HZ, MERGE_REL * peak.hz) &&
            peak.hz - group[0].hz <= GROUP_MAX_REL * group[0].hz
        ) {
            group.push(peak);
        } else {
            groups.push([peak]);
        }
    }
    return groups;
}

function medianHz(group: { hz: number }[]): number {
    const sorted = group.map((p) => p.hz).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Merges the confirmed tap modes of every point and the peaks of every motor into resonances of the
 * craft. Cable modes are dropped, and so is the cable point: it rings the craft's modes too.
 */
export function summarizeResonances(result: WizardResult, minScore = SUMMARY_MIN_SCORE): ResonanceSummary {
    const peaks: { hz: number; point?: number; motor?: number }[] = [];
    result.points.forEach((modes, point) => {
        if (point !== POINT_CABLE) {
            modes.filter((m) => !m.cable).forEach((m) => peaks.push({ hz: m.hz, point }));
        }
    });
    result.motors.forEach((list, motor) =>
        list.filter((p) => !p.cable).forEach((p) => peaks.push({ hz: p.hz, motor })),
    );
    const groups = groupByHz(peaks);

    const resonances: Resonance[] = groups.map((group) => {
        const hz = medianHz(group);
        const points = [...new Set(group.flatMap((p) => (p.point === undefined ? [] : [p.point])))].sort(
            (a, b) => a - b,
        );
        const motors = [...new Set(group.flatMap((p) => (p.motor === undefined ? [] : [p.motor])))].sort(
            (a, b) => a - b,
        );
        return { hz, points, motors, score: points.length + motors.length };
    });

    const kept = resonances.filter((r) => r.score >= minScore);
    const main = kept.reduce<Resonance | null>((best, r) => (!best || r.score > best.score ? r : best), null);
    return {
        frameAndMotors: kept.filter((r) => r.points.length > 0 && r.motors.length > 0),
        tapsOnly: kept.filter((r) => r.motors.length === 0),
        motorsOnly: kept.filter((r) => r.points.length === 0),
        main,
    };
}

/** One tap of the session as the FC kept it: label (point index, or a LABEL_* code) and peaks. */
export interface SessionTap {
    seq: number;
    label: number;
    peaksHz: number[];
}

/** The features the FC classified a tap by. */
export interface SessionTapFeatures {
    seq: number;
    r: number;
    yawShare: number;
    push: number;
    pushZ: number;
    accPeakZ: number;
    directionDeg: number;
    rWithYaw: number;
}

export interface SessionPage<T> {
    total: number;
    first: number;
    taps: T[];
}

/** MSP2_FRAME_WIZARD_TAPS pages from 0 (first tap index): u8 total, u8 first, u8 n, n x {u16 seq, i8 label, u8 nPeaks, 8 x u16 Hz*10}. */
export const TAPS_PAGE_FEATURES = 100; // request first = 100 + page: 8 taps a page with their features

export function parseTapsPage(data: ArrayBufferView | ArrayLike<number>): SessionPage<SessionTap> | null {
    const bytes = toBytes(data);
    const r = new Reader(bytes);
    try {
        const total = r.u8();
        const first = r.u8();
        const taps: SessionTap[] = [];
        for (let n = r.u8(); n > 0; n--) {
            const seq = r.u16();
            const label = (r.u8() << 24) >> 24;
            const nPeaks = r.u8();
            const peaks: number[] = [];
            for (let k = 0; k < 8; k++) {
                peaks.push(r.u16() / 10);
            }
            taps.push({ seq, label, peaksHz: peaks.slice(0, nPeaks) });
        }
        return { total, first, taps };
    } catch {
        return null;
    }
}

/** Feature pages (first = 100 + page): u8 total, u8 first, u8 n, n x {u16 seq, 7 x f32}. */
export function parseFeaturesPage(data: ArrayBufferView | ArrayLike<number>): SessionPage<SessionTapFeatures> | null {
    const bytes = toBytes(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    try {
        const total = view.getUint8(0);
        const first = view.getUint8(1);
        const n = view.getUint8(2);
        const taps: SessionTapFeatures[] = [];
        let o = 3;
        for (let i = 0; i < n; i++) {
            const f = (k: number) => view.getFloat32(o + 2 + 4 * k, true);
            taps.push({
                seq: view.getUint16(o, true),
                r: f(0),
                yawShare: f(1),
                push: f(2),
                pushZ: f(3),
                accPeakZ: f(4),
                directionDeg: f(5),
                rWithYaw: f(6),
            });
            o += 30;
        }
        return { total, first, taps };
    } catch {
        return null;
    }
}

/**
 * A motor that excites a shared resonance this much more than the motors' median stands out (a loose
 * motor or mount). Softer is no fault: a motor near a node of a mode barely drives it, and bench levels
 * without props differ by several dB from motor to motor for that reason alone.
 */
export const MOTOR_LOUD_DB = 10;

export interface SharedMotorResonance {
    hz: number;
    /** Per motor, dB relative to the loudest motor there; null when this motor shows no peak there. */
    relDb: (number | null)[];
}

export interface MotorRunSummary {
    /** Resonances at least three motors excite. */
    shared: SharedMotorResonance[];
    /** Per motor, its loudest peak. */
    strongestHz: (number | null)[];
    /** Per motor: it responds unlike the others at a shared resonance. */
    standsOut: boolean[];
    allOk: boolean;
    /** The loudest excess over the median, for the verdict. */
    worst: { motor: number; hz: number; db: number } | null;
}

/**
 * How alike the four motors excite the frame in the motor run: the resonances most of them share, each
 * motor's level there (dB from the gain) against the loudest, and which motor stands out (10 dB or more
 * over the median at a shared resonance). Cable modes are left out: a resonance whose peaks the FC all
 * marked as the cable's (one other motors drive as the frame's stays, see modeSpectrum). Null when the run
 * found no motor peaks.
 */
export function motorRunSummary(result: WizardResult): MotorRunSummary | null {
    const peaks = result.motors.flatMap((list, motor) =>
        list.filter((p) => p.gain > 0).map((p) => ({ hz: p.hz, motor, db: 20 * Math.log10(p.gain), cable: p.cable })),
    );
    if (!peaks.some((p) => !p.cable)) {
        return null;
    }
    const strongestHz = result.motors.map((list) => {
        const own = list.filter((p) => !p.cable && p.gain > 0);
        return own.length ? own.reduce((a, b) => (b.gain > a.gain ? b : a), own[0]).hz : null;
    });
    const standsOut = [false, false, false, false];
    let worst: MotorRunSummary["worst"] = null;
    const shared: SharedMotorResonance[] = [];
    for (const group of groupByHz(peaks)) {
        if (group.every((p) => p.cable)) {
            continue;
        }
        const perMotor: (number | null)[] = [0, 1, 2, 3].map((m) => {
            const own = group.filter((p) => p.motor === m).map((p) => p.db);
            return own.length ? Math.max(...own) : null;
        });
        const present = perMotor.filter((v): v is number => v !== null);
        if (present.length < 3) {
            continue;
        }
        const hz = medianHz(group);
        const loudest = Math.max(...present);
        const sorted = [...present].sort((a, b) => a - b);
        const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[1] + sorted[2]) / 2;
        perMotor.forEach((db, m) => {
            if (db === null) {
                return;
            }
            const off = db - median;
            if (off >= MOTOR_LOUD_DB) {
                standsOut[m] = true;
            }
            if (off > 0 && (!worst || off > worst.db)) {
                worst = { motor: m, hz, db: Math.round(off * 10) / 10 };
            }
        });
        shared.push({ hz, relDb: perMotor.map((db) => (db === null ? null : Math.round((db - loudest) * 10) / 10)) });
    }
    return { shared, strongestHz, standsOut, allOk: !standsOut.some(Boolean), worst };
}

/**
 * The USB cable's own modes in a run: the modes and peaks the FC marked as cable modes (a cable peak with no
 * frame mode near it). The cable point's other modes are the frame's: a tap on the cable rings it too.
 */
export function cableModesHz(result: WizardResult | null): number[] {
    if (!result) {
        return [];
    }
    return [
        ...result.points.flatMap((modes) => modes.filter((m) => m.cable).map((m) => m.hz)),
        ...result.motors.flatMap((list) => list.filter((p) => p.cable).map((p) => p.hz)),
    ];
}

/** Within the merge distance of one of these frequencies (the same rule that groups resonances). */
export function nearAnyHz(hz: number, list: number[]): boolean {
    return list.some((other) => Math.abs(other - hz) <= Math.max(MERGE_MIN_HZ, MERGE_REL * Math.max(hz, other)));
}

/**
 * How much a mode matters for flight, from what drives it and how hard. Unrated: no motor run to judge it
 * by (taps give no level over MSP), only how many tap points rang there.
 */
export type ModeSeverity = "serious" | "notable" | "minor" | "unrated" | "cable" | "unstable";

export interface SpectrumLine {
    hz: number;
    /** The loudest motor there against the loudest peak of the run, dB (<= 0); null when no motor drives it. */
    levelDb: number | null;
    severity: ModeSeverity;
    /** Tap points (arms 0-3, frame 4) that rang there. */
    points: number[];
    motors: number[];
    /**
     * The taps found it: at these points in the last run, or (after a motor run, whose result holds no taps)
     * in the taps part of the frame map.
     */
    tapped: boolean;
    /** A motor peak only the frame map has, from an earlier motor run (the last run was taps only). */
    storedFrom: "motors" | null;
    /**
     * Motors whose peak here the FC took for the USB cable's, in a mode other motors drive as the frame's:
     * kept a frame mode, the disagreement shown on hover.
     */
    cableMotors: number[];
    /** Per motor, its level here against the loudest peak of the run, dB; null where it shows no peak. */
    motorDb: (number | null)[];
}

/** Within this of the loudest peak and seen in 3+ places: the resonance the filters must deal with. */
export const SERIOUS_DB = -6;
/** Within this, driven by the motors: worth a look. Lower, or not driven at all: not a concern. */
export const NOTABLE_DB = -12;

/** The modes the stored frame map adds: their source bits, no level. */
export interface MapModeRef {
    hz: number;
    fromTaps?: boolean;
    fromMotors?: boolean;
    fromCable: boolean;
    unstable: boolean;
}

/**
 * The run's modes as one spectrum, by frequency: the tap modes of every point and the motor peaks grouped
 * like the summary does, each with the loudest motor's level there and how much it matters. The cable's own
 * modes and the modes the FC marked unstable are kept, marked apart; frame map modes the run did not see
 * are added without a level.
 */
export function modeSpectrum(result: WizardResult | null, mapModes: MapModeRef[] = []): SpectrumLine[] {
    const peaks: { hz: number; point?: number; motor?: number; db?: number; cable: boolean }[] = [];
    result?.points.forEach((modes, point) => {
        // the cable point rings the frame's modes too: only its own (cable) modes are its
        modes
            .filter((m) => point !== POINT_CABLE || m.cable)
            .forEach((m) => peaks.push({ hz: m.hz, point: point === POINT_CABLE ? undefined : point, cable: m.cable }));
    });
    result?.motors.forEach((list, motor) =>
        list
            .filter((p) => p.gain > 0)
            .forEach((p) => peaks.push({ hz: p.hz, motor, db: 20 * Math.log10(p.gain), cable: p.cable })),
    );
    const motorRun = result?.motors.some((list) => list.length > 0) ?? false;
    const frameDb = peaks.filter((p) => !p.cable && p.db !== undefined).map((p) => p.db as number);
    const loudest = frameDb.length ? Math.max(...frameDb) : 0;

    const lines: SpectrumLine[] = groupByHz(peaks).map((group) => {
        const hz = medianHz(group);
        const points = [...new Set(group.flatMap((p) => (p.point === undefined ? [] : [p.point])))].sort(
            (a, b) => a - b,
        );
        const motors = [...new Set(group.flatMap((p) => (p.motor === undefined ? [] : [p.motor])))].sort(
            (a, b) => a - b,
        );
        const dbs = group.filter((p) => p.db !== undefined).map((p) => p.db as number);
        const motorDb = [0, 1, 2, 3].map((m) => {
            const own = group.filter((p) => p.motor === m).map((p) => p.db as number);
            return own.length ? Math.round((Math.max(...own) - loudest) * 10) / 10 : null;
        });
        const levelDb = dbs.length ? Math.round((Math.max(...dbs) - loudest) * 10) / 10 : null;
        const near = mapModes.filter((m) => nearAnyHz(m.hz, [hz]));
        // The FC's own marks decide; one motor peak it left the frame's keeps the mode the frame's (the cable
        // step names a cable mode by elimination, so a frame mode the arm taps missed can end up there). The
        // map's cable entries only speak for the taps (firmware that marked no motor peak).
        const mapCable = near.length > 0 && near.every((m) => m.fromCable);
        const cable = group.every((p) => p.cable) || (mapCable && motors.length === 0);
        const cableMotors = cable
            ? []
            : [...new Set(group.filter((p) => p.cable && p.motor !== undefined).map((p) => p.motor as number))].sort(
                  (a, b) => a - b,
              );
        // the FC clears the mark when the motors drive the mode too
        const unstable = motors.length === 0 && near.length > 0 && near.every((m) => m.unstable && !m.fromCable);
        // a motor run's result has no taps: the map's taps part says the frame rang there (one place, at least)
        const mapTapped = points.length === 0 && near.some((m) => m.fromTaps && !m.fromCable);
        const score = points.length + motors.length + (mapTapped ? 1 : 0);
        return {
            hz,
            levelDb,
            severity: severityOf(levelDb, score, cable, unstable, motorRun),
            points,
            motors,
            tapped: points.length > 0 || mapTapped,
            storedFrom: null,
            cableMotors,
            motorDb,
        };
    });

    for (const mode of mapModes) {
        if (!lines.some((line) => nearAnyHz(line.hz, [mode.hz]))) {
            // a tap mode the motors do not drive (after a motor run), or a motor peak of an earlier motor run
            const tapped = Boolean(mode.fromTaps);
            const severity: ModeSeverity = mode.fromCable
                ? "cable"
                : mode.unstable
                  ? "unstable"
                  : tapped
                    ? severityOf(null, 1, false, false, motorRun)
                    : "unrated";
            lines.push({
                hz: mode.hz,
                levelDb: null,
                severity,
                points: [],
                motors: [],
                tapped,
                storedFrom: tapped || mode.fromCable ? null : "motors",
                cableMotors: [],
                motorDb: [null, null, null, null],
            });
        }
    }
    return lines.sort((a, b) => a.hz - b.hz);
}

/** Driven by at least this many motors (or found by the taps): a mode of the frame, not of one motor. */
export const FRAME_MIN_MOTORS = 3;

/**
 * A mode of the frame: the taps found it, most motors drive it, or it is strong enough to matter to the
 * filters whoever drives it (two motors of one pair can ring a mode of their arms near the strongest). Only a
 * weak peak of one or two motors that no tap found belongs to those motors (their mount, arm or the motor
 * itself) and goes with them, not here.
 */
export const isFrameMode = (line: SpectrumLine): boolean =>
    line.tapped ||
    line.motors.length === 0 ||
    line.motors.length >= FRAME_MIN_MOTORS ||
    (line.levelDb !== null && line.levelDb >= NOTABLE_DB);

export interface MotorOwnPeak {
    hz: number;
    /** Against the loudest peak of the run, dB. */
    db: number;
    severity: ModeSeverity;
}

/** Per motor, the peaks of its own (not frame modes, not the cable's), loudest first. */
export function motorOwnPeaks(lines: SpectrumLine[]): MotorOwnPeak[][] {
    return [0, 1, 2, 3].map((m) =>
        lines
            .filter((line) => !isFrameMode(line) && line.severity !== "cable" && line.motorDb[m] !== null)
            .map((line) => ({ hz: line.hz, db: line.motorDb[m] as number, severity: line.severity }))
            .sort((a, b) => b.db - a.db),
    );
}

function severityOf(
    levelDb: number | null,
    score: number,
    cable: boolean,
    unstable: boolean,
    motorRun: boolean,
): ModeSeverity {
    if (cable) {
        return "cable";
    }
    if (unstable) {
        return "unstable";
    }
    if (levelDb === null) {
        return motorRun ? "minor" : "unrated"; // rings on a tap; with a motor run, the motors do not drive it
    }
    if (levelDb >= SERIOUS_DB && score >= SUMMARY_MIN_SCORE) {
        return "serious";
    }
    return levelDb >= NOTABLE_DB ? "notable" : "minor";
}
