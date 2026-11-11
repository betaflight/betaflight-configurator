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

/** The video export region marked on the graph; `null` is an unset bound. */
export interface MarkedRange {
    in: number | null;
    out: number | null;
}

/** Sets the in point, clearing an out point that would no longer follow it. */
export function withInTime(range: MarkedRange, time: number | null): MarkedRange {
    const clearsOut = time !== null && range.out !== null && range.out <= time;
    return { in: time, out: clearsOut ? null : range.out };
}

/** Sets the out point, clearing an in point that would no longer precede it. */
export function withOutTime(range: MarkedRange, time: number | null): MarkedRange {
    const clearsIn = time !== null && range.in !== null && range.in >= time;
    return { in: clearsIn ? null : range.in, out: time };
}
