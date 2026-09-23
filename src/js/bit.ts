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
 * Bit helpers for the 32-bit masks the firmware sends over MSP — feature flags, beeper
 * disable masks, gyro enable masks, OSD warning flags.
 *
 * All three go through JavaScript's bitwise operators, which coerce to **signed** 32-bit.
 * Two consequences that are easy to trip over and are relied on today:
 *
 * - `bit_set(0, 31)` is `-2147483648`, not `2147483648`. Reads still round-trip —
 *   `bit_check(bit_set(0, 31), 31)` is `true`, and a mask arriving from MSP as an unsigned
 *   `2147483648` also reads correctly, because `>>` coerces to int32 first. But the *value*
 *   returned by `bit_set` is negative, so anything that stores or re-transmits it needs
 *   `>>> 0` to get back to unsigned. Nothing hits this yet: the highest bit in use is
 *   feature bit 28.
 * - Shift counts are taken mod 32, so `bit_check(1, 32)` is `bit_check(1, 0)` — an
 *   out-of-range bit silently wraps rather than throwing or returning false.
 *
 * `bit_check` uses `>>` rather than `>>>` and it makes no difference: bit 0 of the shifted
 * value is bit `bit` of `num` under either operator, so the sign-extension fill never reaches
 * the position the parity test looks at. Left as `>>` because that is what it has always been.
 */

export function bit_check(num: number, bit: number): boolean {
    return (num >> bit) % 2 != 0;
}

export function bit_set(num: number, bit: number): number {
    return num | (1 << bit);
}

export function bit_clear(num: number, bit: number): number {
    return num & ~(1 << bit);
}
