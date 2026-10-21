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
 * The motor run's spin direction check (bench firmware): after the first sweep each motor alone plays a tone,
 * and the yaw it answers with is its rotor's reaction torque, so its sign is the motor's spin direction. In a
 * Quad X motors 1 and 4 turn one way, 2 and 3 the other.
 *
 * MSP2_FRAME_WIZARD_RESPONSE with base = SPIN_CHECK_BASE, payload version 2.
 */

export const SPIN_CHECK_BASE = 2;
export const SPIN_CHECK_VERSION = 2;
const MOTORS = 4;

export interface SpinCheckMotor {
    /** Yaw sign against the strongest motor: +1 / -1, 0 = no answer. */
    yawSign: number;
    /** Phase of the yaw answer, degrees. */
    yawPhaseDeg: number;
    /** |roll|, |pitch|, |yaw|, deg/s per command unit. */
    roll: number;
    pitch: number;
    yaw: number;
}

export interface SpinCheck {
    done: boolean;
    toneHz: number;
    amplitude: number;
    /** Per motor (bit m): against the Quad X pattern by the majority, or no answer. */
    wrongMask: number;
    motors: SpinCheckMotor[];
}

/** @returns null for a payload this host does not understand, or when the FC holds no spin check. */
export function parseSpinCheck(data: ArrayBufferView | ArrayLike<number>): SpinCheck | null {
    const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : Uint8Array.from(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const u8 = () => view.getUint8(o++);
    const s8 = () => view.getInt8(o++);
    const u16 = () => {
        const v = view.getUint16(o, true);
        o += 2;
        return v;
    };
    const s16 = () => {
        const v = view.getInt16(o, true);
        o += 2;
        return v;
    };
    try {
        if (u8() !== SPIN_CHECK_VERSION) {
            return null;
        }
        const done = u8() !== 0;
        if (o >= bytes.length) {
            return null; // the buffers hold the taps, or the filter autotune has them
        }
        const toneHz = u8();
        const amplitude = u16();
        const wrongMask = u8();
        const motors: SpinCheckMotor[] = [];
        for (let m = 0; m < MOTORS; m++) {
            motors.push({
                yawSign: s8(),
                yawPhaseDeg: s16() / 10,
                roll: u16() / 1e4,
                pitch: u16() / 1e4,
                yaw: u16() / 1e4,
            });
        }
        return { done, toneHz, amplitude, wrongMask, motors };
    } catch {
        return null;
    }
}

export interface SpinVerdict {
    /** Every motor answered and turns as Quad X needs (1 and 4 one way, 2 and 3 the other). */
    ok: boolean;
    /** Motors (0-based) that turn against the others' pattern. */
    wrongWay: number[];
    /** Motors (0-based) that gave no yaw answer. */
    silent: number[];
}

/**
 * What the check says. It checks the pairs against each other, not props in against props out: a craft whose
 * every motor turns the other way passes (that is the Motors tab's motor direction setting).
 */
export function spinVerdict(check: SpinCheck): SpinVerdict {
    const silent = check.motors.flatMap((m, i) => (m.yawSign === 0 ? [i] : []));
    const wrongWay = [0, 1, 2, 3].filter((i) => check.wrongMask & (1 << i) && !silent.includes(i));
    return { ok: silent.length === 0 && wrongWay.length === 0, wrongWay, silent };
}

// Quad X seen from above with the props in (Betaflight's default): 1 and 4 turn clockwise, 2 and 3 the other way;
// the Motors tab's props-out switch turns them all around.
export const CLOCKWISE_PROPS_IN = [true, false, false, true];

export interface MotorSpin {
    /** Clockwise seen from above: the one set, or the opposite when the check found the motor turning wrong. */
    cw: boolean;
    /** pending: no check yet; ok: as set; wrong: against the pattern; unknown: gave no yaw answer. */
    state: "pending" | "ok" | "wrong" | "unknown";
}

/** Each motor's spin direction and what the check found (verdict null: no check yet). */
export function motorSpins(verdict: SpinVerdict | null, reversed: boolean): MotorSpin[] {
    return CLOCKWISE_PROPS_IN.map((propsIn, m) => {
        const set = propsIn !== reversed;
        if (!verdict) {
            return { cw: set, state: "pending" };
        }
        if (verdict.silent.includes(m)) {
            return { cw: set, state: "unknown" };
        }
        const wrong = verdict.wrongWay.includes(m);
        return { cw: wrong ? !set : set, state: wrong ? "wrong" : "ok" };
    });
}
