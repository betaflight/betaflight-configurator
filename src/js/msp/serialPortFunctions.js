import semver from "semver";
import { bit_check, bit_set } from "../bit";
import { API_VERSION_1_49 } from "../data_storage";

/**
 * Serial function bit layout, mirroring 'serialPortFunction_e' in 'src/main/io/serial.h'.
 *
 * A leaf module on purpose: MSPHelper reaches serial_backend, which reaches the tab registry, which
 * reaches every tab - so anything importing MSPHelper to read a bit layout drags the whole app in
 * behind it and closes an import cycle. This has no dependencies beyond semver and two constants,
 * so the serial-ports store and the components above it can use it directly.
 */

// Bits up to 18 mean the same thing on every firmware this app supports.
export const SERIAL_PORT_FUNCTIONS_STABLE = {
    MSP: 0,
    GPS: 1,
    TELEMETRY_FRSKY: 2,
    TELEMETRY_HOTT: 3,
    TELEMETRY_LTM: 4,
    TELEMETRY_SMARTPORT: 5,
    RX_SERIAL: 6,
    BLACKBOX: 7,
    TELEMETRY_MAVLINK: 9,
    ESC_SENSOR: 10,
    TBS_SMARTAUDIO: 11,
    TELEMETRY_IBUS: 12,
    IRC_TRAMP: 13,
    RUNCAM_DEVICE_CONTROL: 14, // support communitate with RunCam Device
    LIDAR_TF: 15, // FUNCTION_LIDAR from 2026.12: the unified serial rangefinder bit, driver from rangefinder_hardware
    FRSKY_OSD: 16,
    VTX_MSP: 17,
    GIMBAL: 18, // added in 2025.12 (API 1.47) and unmoved since
};

/**
 * The serial function bits this app is willing to name on the connected firmware.
 *
 * Bits 19 and 20 are named only from API 1.49. Below that they are deliberately left out, and
 * round-tripped verbatim instead: 2026.6.1 puts LIDAR_NL on 19 and OSD_CUSTOM_TEXT on 20, while
 * master from c18421eb (2026-08-04) puts OSD_CUSTOM_TEXT on 19 - and both answer API 1.48, because
 * that commit shipped two days after the release without bumping API_VERSION_MINOR. Every dev and
 * cloud build flashed in that window reports 1.48 with the newer layout, so no gate can tell them
 * apart and naming either bit there would write a meaning the board does not share. Writing bit 19
 * to a 2026.6.1 board would silently reassign the user's Nooploop rangefinder.
 *
 * From 1.49 the layout is unambiguous: bit 19 is OSD_CUSTOM_TEXT, bit 20 is free, and LIDAR_NL no
 * longer exists - the serial rangefinder is bit 15 with the driver chosen by rangefinder_hardware.
 *
 * Bits left unnamed are not lost; see serialPortUnknownFunctionMask.
 *
 * @param {string} [apiVersion] semver string, e.g. FC.CONFIG.apiVersion
 */
export function serialPortFunctionsFor(apiVersion) {
    const functions = { ...SERIAL_PORT_FUNCTIONS_STABLE };

    if (apiVersion && semver.valid(apiVersion) && semver.gte(apiVersion, API_VERSION_1_49)) {
        functions.OSD_CUSTOM_TEXT = 19;
    }

    return functions;
}

/** Every bit this app can name on the connected firmware, as a mask. */
export function serialPortKnownFunctionMask(apiVersion) {
    let mask = 0;
    for (const bit of Object.values(serialPortFunctionsFor(apiVersion))) {
        mask = bit_set(mask, bit);
    }
    return mask >>> 0;
}

/**
 * The bits of `functionMask` this app cannot name. Firmware adds serial functions faster than the
 * configurator learns their names, so unnamed bits are round-tripped untouched rather than decoded.
 * Without this, opening the Ports tab and saving anything drops a user's gimbal, rangefinder or OSD
 * custom text assignment.
 */
export function serialPortUnknownFunctionMask(functionMask, apiVersion) {
    return ((functionMask || 0) & ~serialPortKnownFunctionMask(apiVersion)) >>> 0;
}

/** Decode a mask into the function names this app knows. Unnamed bits are ignored here. */
export function serialPortFunctionMaskToFunctions(functionMask, apiVersion) {
    const layout = serialPortFunctionsFor(apiVersion);
    return Object.keys(layout).filter((key) => bit_check(functionMask, layout[key]));
}

/**
 * @param {string[]} functions - named functions to encode
 * @param {number} [reservedMask=0] - bits to carry through verbatim, from
 *        {@link serialPortUnknownFunctionMask}
 * @param {string} [apiVersion]
 */
export function serialPortFunctionsToMask(functions, reservedMask = 0, apiVersion = undefined) {
    const layout = serialPortFunctionsFor(apiVersion);
    let mask = 0;

    for (const key of functions) {
        const bitIndex = layout[key];
        if (bitIndex >= 0) {
            mask = bit_set(mask, bitIndex);
        }
    }

    return (mask | reservedMask) >>> 0;
}
