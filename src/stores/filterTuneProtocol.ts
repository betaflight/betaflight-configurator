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
 * Filter autotune (firmware USE_FILTER_AUTOTUNE, flight mode FILTER TUNE) and the stored frame map:
 * MSP2_FILTER_TUNE_STATUS, MSP2_FRAME_MAP, and the MSP2_SET_FRAME_WIZARD ops that act on them.
 * Payload version 1.
 */

import { peakInfo, type MotorPeak } from "./frameWizardProtocol";

export const FILTER_TUNE_VERSION = 1;
export const FILTER_TUNE_MOTORS = 4;
export const FILTER_TUNE_ORDERS = 5;

export const OP_REVERT_FILTERS = 4;
export const OP_FORGET_FRAME_MAP = 5;

export const FILTER_TUNE_STATES = [
    "noFrameMap",
    "idle",
    "waitingHover",
    "collecting",
    "ready",
    "applied",
    "discarded",
    "noTelemetry",
    "partial", // disarmed with the mode on and too few frames: the next flight with the mode on adds to them
    "exciting", // the noise is in: a roll then pitch sweep in ANGLE, sticks centred, for the crossover
    "bitbang", // DShot bitbang has no timer (a pin such as the LED strip took it): the motors get no signal
    "loopSlow", // the PID loop ran below 90 % of its set rate in flight: nothing is applied
] as const;
export type FilterTuneState = (typeof FILTER_TUNE_STATES)[number];

const FRAME_MAP_VERSION_1 = 1;
const FRAME_MAP_VERSION_2 = 2; // the motor profile follows the modes
const SPIN_CHECKED = 1 << 7; // frame map v2 spin byte: the check was made; bits 0-3 the motors against the pattern

export const FRAME_MAP_PART_TAPS = 1; // bit 0
export const FRAME_MAP_PART_MOTORS = 1 << 1;

/** 1x spread over the motors at or under this, with no motor standing out, reads as all OK. */
export const HARMONIC_OK_SPREAD_DB = 3;

export interface FilterSettings {
    rpmWeights: [number, number, number];
    rpmQ: number;
    dynNotchCount: number;
    lpf2Hz: number;
    notch1Hz: number;
    notch1CutoffHz: number;
}

export interface CurrentFilterSettings extends FilterSettings {
    lpf1StaticHz: number;
    lpf1DynMinHz: number;
}

export interface ResidualPeak {
    hz: number;
    db: number;
    /** A static notch candidate: it stays put while the motors change speed. */
    fixed: boolean;
    /** Matches a mode in the frame map. */
    inMap: boolean;
}

export interface FilterTuneStatus {
    state: FilterTuneState;
    hasFrameMap: boolean;
    hasTelemetry: boolean;
    modeOn: boolean;
    enoughFrames: boolean;
    backupPresent: boolean;
    appliedThisBoot: boolean;
    frames: number;
    minFrames: number;
    sampleHz: number;
    /** Per motor, harmonic strength over the floor, dB, orders 1x..5x. */
    harmonics: number[][];
    /** 1x left after the RPM filter, dB. */
    residual1x: number;
    score: number;
    /** Index of a motor whose 1x stands out (props, balance), null when none does. */
    badMotor: number | null;
    peaks: ResidualPeak[];
    proposed: FilterSettings;
    current: CurrentFilterSettings;
    /**
     * Raw gyro noise 600 Hz..0.8 x Nyquist (rotation lines left out) against the median of 100..600 Hz, dB;
     * null with firmware that does not send it.
     */
    highBandDb: number | null;
    /** Why the autotune set gyro LPF2 the way it did; null with firmware that does not send it. */
    lpf2Basis: Lpf2Basis | null;
    /** RPM filter fade range, Hz: proposed and current; null with firmware that does not send it. */
    rpmFade: { proposed: number; current: number } | null;
    /** How far the RPM notches miss the motors' lines, as a fraction; null with firmware that does not send it. */
    trackError: number | null;
    /** How the FC tells the pilot in flight (enough data, discarded); null with firmware that does not send it. */
    signals: FilterTuneSignals | null;
    /** Frames brought from earlier flights of this session (in frames already), and how many flights; null
     * with firmware that does not carry them. */
    carried: { frames: number; flights: number } | null;
    /** The D-term filters the autotune picked with LPF2; null with firmware that does not send them. */
    dterm: DtermTune | null;
    /**
     * PID profiles (from 0): the current one, where the D-term filters go, and the one they went to (null: not
     * applied, or reverted); null with firmware that does not send them.
     */
    pidProfile: { current: number; applied: number | null } | null;
    /** The sweep for the crossover and the motor heat the D-term pick is held to; null with older firmware. */
    sweep: SweepResult | null;
    /** The PID loop rate, Hz: measured while armed (0: not armed yet) and set. */
    loop: { measuredHz: number; setHz: number } | null;
}

export const SWEEP_PHASES = ["none", "roll", "settle", "pitch", "done", "aborted"] as const;
export const SWEEP_ENDS = ["none", "sticks", "throttle", "attitude", "rate", "mode"] as const;

export interface SweepResult {
    phase: (typeof SWEEP_PHASES)[number];
    /** Why it was stopped (phase aborted). */
    end: (typeof SWEEP_ENDS)[number];
    /** The sweep's rate amplitude, °/s. */
    amplitudeDps: number;
    /** Crossover, Hz (null: not measured), and phase margin, °. */
    crossoverHz: { roll: number | null; pitch: number | null };
    phaseMarginDeg: { roll: number; pitch: number };
    /** Motor noise index measured, and predicted for the filters now. */
    noiseIndex: number;
    noiseIndexNow: number;
    /** Motor heat from the ripple, K: with the stock filters, with the pick; and the budget over stock. */
    heatStockK: number;
    heatPickK: number;
    heatBudgetK: number;
}

export interface DtermTune {
    /** The D-term filter cutoffs scaled by this; null: D left as it is (nothing met the limits). */
    mult: number | null;
    /** dterm_lpf1_dyn_min_hz, dterm_lpf1_dyn_max_hz, dterm_lpf2_static_hz now. */
    current: { dynMinHz: number; dynMaxHz: number; lpf2Hz: number };
    /** P+D delay at 50 Hz, µs: with the pick and with the stock filters. */
    delayUs: number;
    stockDelayUs: number;
    /** D input and motor noise with the pick, % of the stock filters. */
    inputPct: number;
    noisePct: number;
}

export interface FilterTuneSignals {
    /** A buzzer is set up: beeps. */
    beeper: boolean;
    /** The LED strip is on with LEDs: the whole strip in the state's colour. */
    ledStrip: boolean;
    /** The OSD is on with a display: a FILTER TUNE message. */
    osd: boolean;
}

export const LPF2_BASIS = ["harmonics", "off", "highBand", "highPeak", "dterm"] as const;
export type Lpf2Basis = (typeof LPF2_BASIS)[number] | "noData";

export interface FrameMapMode {
    hz: number;
    fromTaps: boolean;
    fromMotors: boolean;
    /** The USB cable's own mode (stored by a taps run with its cable step), kept apart from the frame's. */
    fromCable: boolean;
    /**
     * A tap mode few taps saw even at its best point (the FC on its soft mount, the hand, a loose part):
     * not a frame mode the filters count on. Cleared when the motors drive it too.
     */
    unstable: boolean;
    /**
     * A motor mode only the last motor run found (the one before did not, within 6 %): it may be the support
     * or the grip the craft was held by. The filter autotune counts on modes the motor runs repeat.
     */
    motorOnce: boolean;
}

/** Which way down was in the craft's axes (x, y, z, each -1..1) when the last motor run started. */
export interface RunGravity {
    x: number;
    y: number;
    z: number;
}

export interface FrameMap {
    hasTaps: boolean;
    hasMotors: boolean;
    modes: FrameMapMode[];
    /** Payload v2: the motor run's peaks per motor as stored with the map (so they survive a restart). */
    motors: MotorPeak[][] | null;
    /** Payload v2: the motor run's two rotation speeds, Hz. */
    rotationHz: [number, number] | null;
    /** Payload v2: the motor run's spin check, null when none was made. */
    spinWrongMask: number | null;
    /** Payload v2, appended later: how the craft was held in the last motor run; null with older firmware. */
    runGravity: RunGravity | null;
}

export type HeldAs = "flat" | "side" | "noseUp";

/** How the craft was held: the axis down was nearest (flat on its frame, on its side, or nose up / down). */
export function heldAs(g: RunGravity): HeldAs {
    const [x, y, z] = [Math.abs(g.x), Math.abs(g.y), Math.abs(g.z)];
    if (z >= x && z >= y) {
        return "flat";
    }
    return y >= x ? "side" : "noseUp";
}

class Reader {
    private offset = 0;

    constructor(private readonly bytes: Uint8Array) {}

    get remaining(): number {
        return this.bytes.length - this.offset;
    }

    u8(): number {
        if (this.offset >= this.bytes.length) {
            throw new RangeError("filter tune payload too short");
        }
        return this.bytes[this.offset++];
    }

    u16(): number {
        return this.u8() | (this.u8() << 8);
    }

    s16(): number {
        const v = this.u16();
        return v >= 0x8000 ? v - 0x10000 : v;
    }
}

function toBytes(data: ArrayBufferView | ArrayLike<number>): Uint8Array {
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return Uint8Array.from(data);
}

function readSettings(r: Reader): FilterSettings {
    const rpmWeights: [number, number, number] = [r.u8(), r.u8(), r.u8()];
    return {
        rpmWeights,
        rpmQ: r.u16(),
        dynNotchCount: r.u8(),
        lpf2Hz: r.u16(),
        notch1Hz: r.u16(),
        notch1CutoffHz: r.u16(),
    };
}

// The status payload grows at its end with each firmware version: every block is read only when it is there.

function readLpf2Basis(r: Reader): { highBandDb: number | null; lpf2Basis: Lpf2Basis | null } {
    if (r.remaining < 3) {
        return { highBandDb: null, lpf2Basis: null };
    }
    const highBandDb = r.s16() / 10;
    return { highBandDb, lpf2Basis: LPF2_BASIS[r.u8()] ?? "noData" };
}

/** The RPM filter fade range and the notch tracking error. */
function readRpmFade(r: Reader): { rpmFade: FilterTuneStatus["rpmFade"]; trackError: number | null } {
    if (r.remaining < 6) {
        return { rpmFade: null, trackError: null };
    }
    const rpmFade = { proposed: r.u16(), current: r.u16() };
    return { rpmFade, trackError: r.u16() / 1e5 };
}

function readSignals(r: Reader): FilterTuneSignals | null {
    if (r.remaining < 1) {
        return null;
    }
    const bits = r.u8();
    return { beeper: (bits & 1) !== 0, ledStrip: (bits & 2) !== 0, osd: (bits & 4) !== 0 };
}

function readCarried(r: Reader): FilterTuneStatus["carried"] {
    return r.remaining >= 3 ? { frames: r.u16(), flights: r.u8() } : null;
}

function readDterm(r: Reader): DtermTune | null {
    if (r.remaining < 13) {
        return null;
    }
    const mult10 = r.u8();
    const current = { dynMinHz: r.u16(), dynMaxHz: r.u16(), lpf2Hz: r.u16() };
    const delayUs = r.u16();
    const stockDelayUs = r.u16();
    return { mult: mult10 ? mult10 / 10 : null, current, delayUs, stockDelayUs, inputPct: r.u8(), noisePct: r.u8() };
}

function readPidProfile(r: Reader): FilterTuneStatus["pidProfile"] {
    if (r.remaining < 2) {
        return null;
    }
    const current = r.u8();
    const applied = r.u8();
    return { current, applied: applied === 0xff ? null : applied };
}

/** The PID loop rate: measured while armed (0 before) and set. */
function readLoop(r: Reader): FilterTuneStatus["loop"] {
    return r.remaining >= 4 ? { measuredHz: r.u16(), setHz: r.u16() } : null;
}

function readSweep(r: Reader): SweepResult | null {
    if (r.remaining < 19) {
        return null;
    }
    const phase = SWEEP_PHASES[r.u8()] ?? "none";
    const end = SWEEP_ENDS[r.u8()] ?? "none";
    const amplitudeDps = r.u16() / 10;
    const hz = (v: number) => (v ? v / 10 : null);
    const crossoverHz = { roll: hz(r.u16()), pitch: hz(r.u16()) };
    const phaseMarginDeg = { roll: r.u8(), pitch: r.u8() };
    const noiseIndex = r.u16() / 10;
    const noiseIndexNow = r.u16() / 10;
    const heatStockK = r.u16() / 100;
    const heatPickK = r.u16() / 100;
    return {
        phase,
        end,
        amplitudeDps,
        crossoverHz,
        phaseMarginDeg,
        noiseIndex,
        noiseIndexNow,
        heatStockK,
        heatPickK,
        heatBudgetK: r.u8() / 10,
    };
}

/** @returns null for a payload this host does not understand. */
export function parseFilterTuneStatus(data: ArrayBufferView | ArrayLike<number>): FilterTuneStatus | null {
    const r = new Reader(toBytes(data));
    try {
        if (r.u8() !== FILTER_TUNE_VERSION) {
            return null;
        }
        const stateCode = r.u8();
        const flags = r.u8();
        const frames = r.u16();
        const minFrames = r.u16();
        const sampleHz = r.u16();
        const harmonics: number[][] = [];
        for (let m = 0; m < FILTER_TUNE_MOTORS; m++) {
            const row: number[] = [];
            for (let h = 0; h < FILTER_TUNE_ORDERS; h++) {
                row.push(r.s16() / 10);
            }
            harmonics.push(row);
        }
        const residual1x = r.s16() / 10;
        const score = r.u8();
        const bad = r.u8();
        const peaks: ResidualPeak[] = [];
        for (let n = r.u8(); n > 0; n--) {
            const hz = r.u16() / 10;
            const db = r.u16() / 10;
            const peakFlags = r.u8();
            peaks.push({ hz, db, fixed: (peakFlags & 1) !== 0, inMap: (peakFlags & 2) !== 0 });
        }
        const proposed = readSettings(r);
        const current: CurrentFilterSettings = { ...readSettings(r), lpf1StaticHz: r.u16(), lpf1DynMinHz: r.u16() };
        const basis = readLpf2Basis(r);
        const fade = readRpmFade(r);
        const signals = readSignals(r);
        const carried = readCarried(r);
        const dterm = readDterm(r);
        const pidProfile = readPidProfile(r);
        const sweep = readSweep(r);
        const loop = readLoop(r);
        return {
            state: FILTER_TUNE_STATES[stateCode] ?? "idle",
            hasFrameMap: (flags & 1) !== 0,
            hasTelemetry: (flags & 2) !== 0,
            modeOn: (flags & 4) !== 0,
            enoughFrames: (flags & 8) !== 0,
            backupPresent: (flags & 16) !== 0,
            appliedThisBoot: (flags & 32) !== 0,
            frames,
            minFrames,
            sampleHz,
            harmonics,
            residual1x,
            score,
            badMotor: bad < FILTER_TUNE_MOTORS ? bad : null,
            peaks,
            proposed,
            current,
            highBandDb: basis.highBandDb,
            lpf2Basis: basis.lpf2Basis,
            rpmFade: fade.rpmFade,
            trackError: fade.trackError,
            signals,
            carried,
            dterm,
            pidProfile,
            sweep,
            loop,
        };
    } catch {
        return null;
    }
}

/** @returns null for a payload this host does not understand. */
export function parseFrameMap(data: ArrayBufferView | ArrayLike<number>): FrameMap | null {
    const r = new Reader(toBytes(data));
    try {
        const version = r.u8();
        if (version !== FRAME_MAP_VERSION_1 && version !== FRAME_MAP_VERSION_2) {
            return null;
        }
        const parts = r.u8();
        const modes: FrameMapMode[] = [];
        for (let n = r.u8(); n > 0; n--) {
            const hz = r.u16() / 10;
            const src = r.u8();
            modes.push({
                hz,
                fromTaps: (src & 1) !== 0,
                fromMotors: (src & 2) !== 0,
                fromCable: (src & 4) !== 0,
                unstable: (src & 8) !== 0,
                motorOnce: (src & 0x10) !== 0,
            });
        }
        let motors: MotorPeak[][] | null = null;
        let rotationHz: [number, number] | null = null;
        let spinWrongMask: number | null = null;
        let runGravity: RunGravity | null = null;
        if (version === FRAME_MAP_VERSION_2) {
            motors = [];
            for (let m = 0; m < FILTER_TUNE_MOTORS; m++) {
                const peaks: MotorPeak[] = [];
                for (let n = r.u8(); n > 0; n--) {
                    const hz = r.u16() / 10;
                    const gain = r.u16() / 1e4;
                    peaks.push({ hz, gain, ...peakInfo(r.u8()) });
                }
                motors.push(peaks);
            }
            rotationHz = [r.u16() / 10, r.u16() / 10];
            const spin = r.u8();
            spinWrongMask = spin & SPIN_CHECKED ? spin & 0x0f : null;
            if (r.remaining >= 3) {
                const s8 = () => ((r.u8() << 24) >> 24) / 100;
                runGravity = { x: s8(), y: s8(), z: s8() };
            }
        }
        return {
            hasTaps: (parts & FRAME_MAP_PART_TAPS) !== 0,
            hasMotors: (parts & FRAME_MAP_PART_MOTORS) !== 0,
            modes,
            motors,
            rotationHz,
            spinWrongMask,
            runGravity,
        };
    } catch {
        return null;
    }
}

export const encodeRevertFilters = (): number[] => [OP_REVERT_FILTERS];
export const encodeForgetFrameMap = (): number[] => [OP_FORGET_FRAME_MAP];

export interface MotorHarmonics {
    /** 1x..5x over the floor, dB (the RPM filter covers 1x-3x; 4x and 5x set gyro LPF2). */
    orders: number[];
    standsOut: boolean;
}

export interface HarmonicSummary {
    motors: MotorHarmonics[];
    /** Max minus min 1x over the motors, dB. */
    spread1x: number;
    allOk: boolean;
    score: number;
}

/** Per-motor 1x..3x and the verdict: all OK when the 1x spread is small and no motor stands out. */
export function harmonicSummary(status: FilterTuneStatus): HarmonicSummary | null {
    if (status.frames === 0) {
        return null;
    }
    const firsts = status.harmonics.map((row) => row[0]);
    const spread1x = Math.round((Math.max(...firsts) - Math.min(...firsts)) * 10) / 10;
    return {
        motors: status.harmonics.map((row, m) => ({
            orders: [...row],
            standsOut: status.badMotor === m,
        })),
        spread1x,
        allOk: spread1x <= HARMONIC_OK_SPREAD_DB && status.badMotor === null,
        score: status.score,
    };
}
