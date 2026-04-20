// Shared enum lookup tables for Wing Tuning MSP <-> UI translation.
//
// Array indices MUST match firmware's lookupTable* ordering exactly —
// these are part of the MSP wire contract (see firmware
// `.plan/WIRE_FORMAT.md`, "Append-only rule"). Reordering any entry within
// a minor API version is a wire-format break.
//
// This module is the single source of truth for:
//   - MSPHelper decode (int -> string for FC.WING_TUNING.*)
//   - MSPHelper crunch (string -> int for MSP2_SET_WING_TUNING)
//   - WingTuningTab.vue dropdown options
//
// A firmware enum reorder caught here fixes all three call sites.

export const WING_ENUM_TABLES = {
    // firmware: lookupTableYawType (`cli/settings.c`, #ifdef USE_WING)
    yaw_type: ["RUDDER", "DIFF_THRUST"],

    // firmware: lookupTableTpaMode. "PDS" is appended when USE_WING.
    // Index ordering stays stable across multirotor/wing builds.
    tpa_mode: ["PD", "D", "PDS"],

    // firmware: lookupTableTpaSpeedType (#ifdef USE_WING)
    tpa_speed_type: ["BASIC", "ADVANCED"],

    // firmware: lookupTableTpaCurveType (#ifdef USE_ADVANCED_TPA)
    tpa_curve_type: ["CLASSIC", "HYPERBOLIC"],

    // firmware: lookupTableSpaMode (#ifdef USE_WING).
    // Shared across all three axes (spa_{roll,pitch,yaw}_mode).
    spa_mode: ["OFF", "I_FREEZE", "I", "PID", "PD_I_FREEZE"],
};

/**
 * Decode an enum index to its string label.
 * Unknown indices (e.g. firmware introduced a new value we don't know
 * yet) return "Unknown (N)" rather than throwing — forward-compat.
 *
 * @param {string} table - key into WING_ENUM_TABLES
 * @param {number} index - uint8 from MSP payload
 * @returns {string}
 */
export function enumIndexToString(table, index) {
    const values = WING_ENUM_TABLES[table];
    if (!values) {
        throw new Error(`wingEnumLookups: unknown table "${table}"`);
    }
    if (index >= 0 && index < values.length) {
        return values[index];
    }
    return `Unknown (${index})`;
}

/**
 * Encode a string label to its enum index for crunching into MSP payload.
 * Forward-compat: accepts `Unknown (N)` labels produced by
 * `enumIndexToString` for enum values added in newer firmware, so a user
 * editing other fields can still save without the unknown value blocking
 * the round-trip.
 *
 * @param {string} table - key into WING_ENUM_TABLES
 * @param {string} label - string value from FC.WING_TUNING.*
 * @returns {number} uint8 index
 */
export function enumStringToIndex(table, label) {
    const values = WING_ENUM_TABLES[table];
    if (!values) {
        throw new Error(`wingEnumLookups: unknown table "${table}"`);
    }
    const idx = values.indexOf(label);
    if (idx >= 0) {
        return idx;
    }
    const unknownMatch = /^Unknown \((\d+)\)$/.exec(label);
    if (unknownMatch) {
        const unknownIndex = Number(unknownMatch[1]);
        if (Number.isInteger(unknownIndex) && unknownIndex >= 0 && unknownIndex <= 0xff) {
            return unknownIndex;
        }
    }
    throw new Error(`wingEnumLookups: "${label}" is not a valid ${table} value ` + `(valid: ${values.join(", ")})`);
}
