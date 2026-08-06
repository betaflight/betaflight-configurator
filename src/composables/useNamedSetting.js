// Generic client for MSP2_CLI_SETTING / MSP2_CLI_SETTING_INFO - reads and writes any
// settings.c CLI variable by name, without needing a dedicated MSP struct field for it.
// Firmware side: src/main/msp/msp.c (MSP2_CLI_SETTING / MSP2_CLI_SETTING_INFO cases) +
// src/main/cli/cli.c (cliGetSettingByName / cliSetSettingByName / cliGetSettingInfoByName).
//
// Intended for CLI-only settings that have no dedicated FC.* field yet (e.g. this fork's
// adrc_* tunables) - anything with a real MSP struct field should keep using that instead,
// since a single MSP_PID_ADVANCED-style exchange is cheaper than one text round-trip per field.
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";

const MAX_INFO_FETCH_ATTEMPTS = 16;

function stringToBytes(str) {
    return Array.from(str, (c) => c.charCodeAt(0));
}

function dataViewToAscii(view, start = 0, end = view.byteLength) {
    let str = "";
    for (let i = start; i < end; i++) {
        str += String.fromCharCode(view.getUint8(i));
    }
    return str;
}

/**
 * Read the current value of a named CLI setting, as its raw string representation
 * (e.g. "60" for a uint16, "CLASSIC" for a lookup/enum, "50,-60,70" for an array).
 * Throws if the setting name doesn't exist on the connected firmware.
 */
export async function getSetting(name) {
    const response = await MSP.promise(MSPCodes.MSP2_CLI_SETTING, stringToBytes(name));
    if (!response || response.unsupported) {
        throw new Error(`Setting "${name}" not found on connected firmware`);
    }
    const text = dataViewToAscii(response.data);
    const eq = text.indexOf("=");
    if (eq === -1) {
        throw new Error(`Unexpected reply reading setting "${name}": "${text}"`);
    }
    return text.slice(eq + 1).trim();
}

/**
 * Set a named CLI setting to `value` (formatted exactly as the CLI `set` command expects,
 * e.g. "125", "CLASSIC", "50,-60,70"). Resolves with the firmware-echoed value (its response
 * clamps/coerces the same way `set name = value` would over the CLI), or throws on rejection
 * (unknown name, out-of-range value, wrong type).
 */
export async function setSetting(name, value) {
    const response = await MSP.promise(MSPCodes.MSP2_CLI_SETTING, stringToBytes(`${name} = ${value}`));
    if (!response || response.unsupported) {
        throw new Error(`Failed to set "${name}" = ${value}`);
    }
    const text = dataViewToAscii(response.data);
    const eq = text.indexOf("=");
    return eq === -1 ? text.trim() : text.slice(eq + 1).trim();
}

function parseSettingInfoText(text) {
    const info = {};
    for (const line of text.split("\n")) {
        if (line.length === 0) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq === -1) {
            continue;
        }
        info[line.slice(0, eq)] = line.slice(eq + 1);
    }
    if (info.pgn !== undefined) {
        info.pgn = Number(info.pgn);
    }
    if (info.min !== undefined) {
        info.min = Number(info.min);
    }
    if (info.max !== undefined) {
        info.max = Number(info.max);
    }
    if (info.length !== undefined) {
        info.length = Number(info.length);
    }
    if (info.values !== undefined) {
        info.values = info.values.split(",");
    }
    return info;
}

/**
 * Fetch self-describing metadata for a named CLI setting: pgn, type ("uint8"/"uint16"/
 * "lookup"/"bitset"/"uint8[]"/"string"/...), min/max (direct numeric types), values
 * (lookup/enum options, as an array of strings), length (array types), and default
 * (the value's default, formatted the same way getSetting()'s reply is).
 *
 * The firmware reply is length-prefixed and windowed (see cliGetSettingInfoByName in cli.c),
 * so this loops requesting successive offsets until the full text has been collected -
 * needed for array settings whose info text can exceed a single MSP frame.
 */
export async function getSettingInfo(name) {
    let text = "";
    let offset = 0;

    for (let attempt = 0; attempt < MAX_INFO_FETCH_ATTEMPTS; attempt++) {
        const payload =
            offset === 0 ? stringToBytes(name) : [...stringToBytes(name), 0, offset & 0xff, (offset >> 8) & 0xff];
        const response = await MSP.promise(MSPCodes.MSP2_CLI_SETTING_INFO, payload);
        if (!response || response.unsupported) {
            throw new Error(`Setting "${name}" not found on connected firmware`);
        }

        const view = response.data;
        const totalLen = view.getUint8(0) | (view.getUint8(1) << 8);
        text += dataViewToAscii(view, 2);

        if (text.length >= totalLen) {
            break;
        }
        offset = text.length;
    }

    return parseSettingInfoText(text);
}
