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
}

export interface FilterTuneSignals {
    /** A buzzer is set up: beeps. */
    beeper: boolean;
    /** The LED strip is on with LEDs: the whole strip in the state's colour. */
    ledStrip: boolean;
    /** The OSD is on with a display: a FILTER TUNE message. */
    osd: boolean;
}

export const LPF2_BASIS = ["harmonics", "off", "highBand", "highPeak"] as const;
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
        // appended later: the LPF2 decision's basis (absent from older firmware)
        let highBandDb: number | null = null;
        let lpf2Basis: Lpf2Basis | null = null;
        if (r.remaining >= 3) {
            highBandDb = r.s16() / 10;
            const basis = r.u8();
            lpf2Basis = LPF2_BASIS[basis] ?? "noData";
        }
        // appended later still: the RPM filter fade range and the notch tracking error, then the in-flight signals
        let rpmFade: FilterTuneStatus["rpmFade"] = null;
        let trackError: number | null = null;
        if (r.remaining >= 6) {
            rpmFade = { proposed: r.u16(), current: r.u16() };
            trackError = r.u16() / 1e5;
        }
        let signals: FilterTuneSignals | null = null;
        if (r.remaining >= 1) {
            const bits = r.u8();
            signals = { beeper: (bits & 1) !== 0, ledStrip: (bits & 2) !== 0, osd: (bits & 4) !== 0 };
        }
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
            highBandDb,
            lpf2Basis,
            rpmFade,
            trackError,
            signals,
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
            });
        }
        let motors: MotorPeak[][] | null = null;
        let rotationHz: [number, number] | null = null;
        let spinWrongMask: number | null = null;
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
        }
        return {
            hasTaps: (parts & FRAME_MAP_PART_TAPS) !== 0,
            hasMotors: (parts & FRAME_MAP_PART_MOTORS) !== 0,
            modes,
            motors,
            rotationHz,
            spinWrongMask,
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
