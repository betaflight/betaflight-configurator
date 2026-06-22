/**
 * Shared utilities for NOTAM data.
 *
 * NotamItem shape:
 * {
 *   id:          string        NOTAM identifier, e.g. "0/2345"
 *   type:        "NOTAM" | "TFR" | "SUA" | "SNOWTAM" | "ASHTAM"
 *   location:    string        ICAO code or coordinate description
 *   startTime:   Date | null
 *   endTime:     Date | null   null means PERM
 *   isPermanent: boolean
 *   lowerAlt:    string | null e.g. "SFC", "1000FT MSL"
 *   upperAlt:    string | null e.g. "3000FT MSL", "UNL"
 *   body:        string        plain-text description (E-field or equivalent)
 *   rawText:     string | null original raw NOTAM text
 *   source:      string        "faa" | "openaip"
 * }
 */

// ICAO Q-code prefixes that map to specific airspace notice types
const QCODE_TYPE_MAP = [
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
 * @param {string | null | undefined} qcode
 * @returns {"NOTAM" | "TFR" | "SUA" | "SNOWTAM" | "ASHTAM"}
 */
export function classifyFromQcode(qcode) {
    if (!qcode) return "NOTAM";
    const upper = String(qcode).toUpperCase();
    for (const [prefix, type] of QCODE_TYPE_MAP) {
        if (upper.includes(prefix)) return type;
    }
    if (upper.includes("SNOWTAM")) return "SNOWTAM";
    if (upper.includes("ASHTAM")) return "ASHTAM";
    return "NOTAM";
}

/**
 * Get the display status of a NOTAM item.
 * @param {object} item NotamItem
 * @returns {"active" | "future" | "expired"}
 */
export function getNotamStatus(item) {
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
 * @param {object[]} items
 * @returns {object[]}
 */
export function sortNotams(items) {
    const order = { active: 0, future: 1, expired: 2 };
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
export function nmToKm(nm) {
    return nm * 1.852;
}

/** Convert kilometres to nautical miles. */
export function kmToNm(km) {
    return km / 1.852;
}

/**
 * Parse a date string from ICAO NOTAM format (YYMMDDHHMM) or ISO 8601.
 * @param {string | null | undefined} str
 * @returns {Date | null}
 */
export function parseNotamDate(str) {
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
