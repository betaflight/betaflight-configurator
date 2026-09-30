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
 * Shared utilities for NOTAM data.
 */

export type NotamType = "NOTAM" | "TFR" | "SUA" | "SNOWTAM" | "ASHTAM";
export type NotamStatus = "active" | "future" | "expired";

export interface NotamItem {
    /** NOTAM identifier, e.g. "0/2345" */
    id: string;
    type: NotamType;
    /** ICAO code or coordinate description */
    location: string;
    startTime: Date | null;
    /** null means PERM */
    endTime: Date | null;
    isPermanent: boolean;
    /** e.g. "SFC", "1000FT MSL" */
    lowerAlt: string | null;
    /** e.g. "3000FT MSL", "UNL" */
    upperAlt: string | null;
    /** plain-text description (E-field or equivalent) */
    body: string;
    /** original raw NOTAM text */
    rawText: string | null;
    source: "faa" | "openaip";
}

// ICAO Q-code prefixes that map to specific airspace notice types
const QCODE_TYPE_MAP: [string, NotamType][] = [
    ["QRTCA", "TFR"],
    ["QRTCL", "TFR"],
    ["QRTCS", "TFR"],
    ["QRFXX", "TFR"],
    ["QRSAS", "SUA"],
    ["QRSSA", "SUA"],
    ["QRSUS", "SUA"],
    ["QRSUT", "SUA"],
    ["QSNTW", "SNOWTAM"],
    ["QASHTW", "ASHTAM"],
];

/**
 * Classify a NOTAM type from its Q-code.
 */
export function classifyFromQcode(qcode: string | null | undefined): NotamType {
    if (!qcode) return "NOTAM";
    const upper = String(qcode).toUpperCase();
    for (const [prefix, type] of QCODE_TYPE_MAP) {
        if (upper.includes(prefix)) return type;
    }
    if (upper.includes("SNOWTAM")) return "SNOWTAM";
    if (upper.includes("ASHTAM")) return "ASHTAM";
    return "NOTAM";
}

/** The fields that decide a NOTAM's status and sort order. */
export type NotamTiming = Pick<NotamItem, "startTime" | "endTime" | "isPermanent">;

/**
 * Get the display status of a NOTAM item.
 */
export function getNotamStatus(item: NotamTiming): NotamStatus {
    const now = new Date();
    if (item.isPermanent || item.endTime === null) {
        if (!item.startTime || item.startTime <= now) return "active";
        return "future";
    }
    if (item.startTime && item.startTime > now) return "future";
    if (item.endTime < now) return "expired";
    return "active";
}

/**
 * Sort NOTAMs: active first, then future, then expired.
 * Within each group, sort by start time ascending.
 */
export function sortNotams<T extends NotamTiming>(items: T[]): T[] {
    const order: Record<NotamStatus, number> = { active: 0, future: 1, expired: 2 };
    return [...items].sort((a, b) => {
        const sa = order[getNotamStatus(a)];
        const sb = order[getNotamStatus(b)];
        if (sa !== sb) return sa - sb;
        const ta = a.startTime?.getTime() ?? 0;
        const tb = b.startTime?.getTime() ?? 0;
        return ta - tb;
    });
}

/** Convert nautical miles to kilometres. */
export function nmToKm(nm: number): number {
    return nm * 1.852;
}

/** Convert kilometres to nautical miles. */
export function kmToNm(km: number): number {
    return km / 1.852;
}

/**
 * Parse a date string from ICAO NOTAM format (YYMMDDHHMM) or ISO 8601.
 */
export function parseNotamDate(str: string | null | undefined): Date | null {
    if (!str) return null;
    const s = String(str).trim();
    if (/PERM/i.test(s)) return null;
    // ICAO format: YYMMDDHHMM (10 digits)
    if (/^\d{10}$/.test(s)) {
        const yr = 2000 + Number(s.slice(0, 2));
        const mo = Number(s.slice(2, 4)) - 1;
        const dy = Number(s.slice(4, 6));
        const hr = Number(s.slice(6, 8));
        const mn = Number(s.slice(8, 10));
        const d = new Date(Date.UTC(yr, mo, dy, hr, mn));
        return Number.isNaN(d.getTime()) ? null : d;
    }
    // ISO 8601 and other browser-parseable formats
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}
