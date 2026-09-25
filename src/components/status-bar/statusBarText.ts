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
 * Where a trailing "(...)" group starts in `s`, which must not end in whitespace: the leftmost
 * "(" after the last ")" but one, so the group holds no ")" of its own. With `afterSpace`, the
 * group must follow whitespace and the result is where that whitespace starts. -1 when there is
 * no such group.
 *
 * This is `/\([^)]*\)$/` and `/\s+\([^)]*\)$/` without the regex backtracking.
 */
function trailingGroupStart(s: string, afterSpace: boolean): number {
    const close = s.length - 1;
    if (close < 0 || s[close] !== ")") {
        return -1;
    }

    const previousClose = s.lastIndexOf(")", close - 1);
    for (let open = s.indexOf("(", previousClose + 1); open !== -1 && open < close; open = s.indexOf("(", open + 1)) {
        if (!afterSpace) {
            return open;
        }
        let start = open;
        while (start > 0 && /\s/.test(s[start - 1])) {
            start--;
        }
        if (start < open) {
            return start;
        }
    }
    return -1;
}

/**
 * Shorter target for the status bar when not in expert mode, e.g.
 * "MFGID/TARGETNAME(MCUNAME)" -> "TARGETNAME"
 */
export function shortenTargetDisplay(name: unknown): string {
    if (!name || typeof name !== "string") {
        return "";
    }
    let s = name.trim();
    const i = s.indexOf("/");
    if (i >= 0) {
        s = s.slice(i + 1);
    }
    const group = trailingGroupStart(s, false);
    return (group === -1 ? s : s.slice(0, group)).trim();
}

/**
 * Drop trailing (git/revision) segments from a display version string, e.g.
 * "25.1.0 (a1b2c3d)" or "4.5.0 (a1b2c3d)" for non–expert status text.
 */
export function stripVersionDisplay(version: unknown): string {
    if (!version || typeof version !== "string") {
        return "";
    }
    let s = version.trim();
    for (let group = trailingGroupStart(s, true); group !== -1; group = trailingGroupStart(s, true)) {
        s = s.slice(0, group).trim();
    }
    return s;
}
