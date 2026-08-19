/**
 * Pure, DOM-free mirror of the firmware's `isSerialConfigValid()`
 * (src/main/io/serial.c:510-580), `telemetryCheckRxPortShared()`
 * (src/main/telemetry/telemetry.c:152-181) and the softserial fixups it applies
 * first. The firmware SILENTLY wipes the whole serial config back to defaults on
 * an invalid layout (src/main/config/config.c:231 -> PG_RESET(serialConfig)), on
 * every save and boot, with no error shown. So we must reject exactly what the
 * firmware rejects before sending — no stricter, no looser.
 *
 * That means replicating the firmware's known permissiveness (the rule-6(a)
 * loophole below): do NOT tighten it, or the UI blocks layouts the FC accepts.
 */

export const SERIAL_FUNCTION = {
    MSP: 1 << 0,
    GPS: 1 << 1,
    TELEMETRY_FRSKY_HUB: 1 << 2,
    TELEMETRY_HOTT: 1 << 3,
    TELEMETRY_LTM: 1 << 4,
    TELEMETRY_SMARTPORT: 1 << 5,
    RX_SERIAL: 1 << 6,
    BLACKBOX: 1 << 7,
    TELEMETRY_MAVLINK: 1 << 9,
    ESC_SENSOR: 1 << 10,
    VTX_SMARTAUDIO: 1 << 11,
    TELEMETRY_IBUS: 1 << 12,
    VTX_TRAMP: 1 << 13,
    RCDEVICE: 1 << 14,
    LIDAR: 1 << 15,
    FRSKY_OSD: 1 << 16,
    VTX_MSP: 1 << 17,
    GIMBAL: 1 << 18,
    OSD_CUSTOM_TEXT: 1 << 19,
};

const F = SERIAL_FUNCTION;

const TELEMETRY_SHAREABLE_MASK = F.TELEMETRY_FRSKY_HUB | F.TELEMETRY_LTM | F.TELEMETRY_MAVLINK;

const TELEMETRY_PORT_FUNCTIONS_MASK = TELEMETRY_SHAREABLE_MASK | F.TELEMETRY_HOTT | F.TELEMETRY_SMARTPORT;

const ALL_FUNCTIONS_SHARABLE_WITH_MSP = F.BLACKBOX | F.VTX_MSP | TELEMETRY_PORT_FUNCTIONS_MASK;

export const SERIAL_PORT_IDENTIFIER = {
    USB_VCP: 20,
    SOFTSERIAL_FIRST: 30,
    SOFTSERIAL_LAST: 31,
};

export const MAX_MSP_PORT_COUNT = 3;

// baudRates enum in the firmware: BAUD_AUTO=0, BAUD_9600=1, BAUD_19200=2, ...
const BAUD_19200_INDEX = 2;

// serialrx_provider values (SerialRXType, src/main/rx/rx.h) for which the
// firmware permits an RX + telemetry share.
const RX_TELEMETRY_SHARE_PROVIDERS = new Set([
    15, // SPEKTRUM1024
    1, // SPEKTRUM2048
    2, // SBUS
    3, // SUMD
    4, // SUMH
    5, // XBUS_MODE_B
    6, // XBUS_MODE_B_RJ01
    7, // IBUS
    16, // MAVLINK
]);
const SERIALRX_IBUS = 7;

/**
 * Error / notice codes surfaced to callers. The UI maps these to i18n strings.
 */
export const SERIAL_VALIDATION_CODE = {
    VCP_REQUIRES_MSP: "VCP_REQUIRES_MSP",
    VTX_MSP_NOT_SHARED: "VTX_MSP_NOT_SHARED",
    TOO_MANY_FUNCTIONS: "TOO_MANY_FUNCTIONS",
    INVALID_FUNCTION_COMBINATION: "INVALID_FUNCTION_COMBINATION",
    NO_MSP_PORT: "NO_MSP_PORT",
    TOO_MANY_MSP_PORTS: "TOO_MANY_MSP_PORTS",
    SOFTSERIAL_FUNCTION_STRIPPED: "SOFTSERIAL_FUNCTION_STRIPPED",
    SOFTSERIAL_BAUD_CLAMPED: "SOFTSERIAL_BAUD_CLAMPED",
};

export function popcount32(value) {
    let v = value >>> 0;
    let count = 0;
    while (v) {
        v &= v - 1;
        count++;
    }
    return count;
}

export function isSoftSerialPort(identifier) {
    return (
        identifier >= SERIAL_PORT_IDENTIFIER.SOFTSERIAL_FIRST && identifier <= SERIAL_PORT_IDENTIFIER.SOFTSERIAL_LAST
    );
}

// Mirror of telemetryCheckRxPortShared() (src/main/telemetry/telemetry.c:152).
function isRxTelemetryShareAllowed(mask, serialRxProvider) {
    if (mask & F.RX_SERIAL && mask & TELEMETRY_SHAREABLE_MASK && RX_TELEMETRY_SHARE_PROVIDERS.has(serialRxProvider)) {
        return true;
    }
    if (mask & F.TELEMETRY_IBUS && mask & F.RX_SERIAL && serialRxProvider === SERIALRX_IBUS) {
        return true;
    }
    if (mask & F.RX_SERIAL && mask & F.VTX_MSP) {
        return true;
    }
    return false;
}

/**
 * Mirror of the firmware's softserial fixups (serial.c:526-535). The firmware
 * MUTATES the config here rather than rejecting it, so we must apply the same
 * normalisation before counting MSP ports — otherwise our MSP count disagrees
 * with the firmware's. We return a normalised copy plus notices instead of
 * mutating, so the caller decides whether to apply and inform.
 *
 * @param {Array<object>} ports
 * @returns {{ports: Array, notices: Array}}
 */
export function normalizeSerialConfig(ports) {
    const notices = [];
    const normalized = ports.map((port) => {
        if (!isSoftSerialPort(port.identifier)) {
            return { ...port };
        }
        const next = { ...port };

        if (next.functionMask & (F.MSP | F.RX_SERIAL)) {
            next.functionMask = (next.functionMask & ~(F.MSP | F.RX_SERIAL)) >>> 0;
            notices.push({
                identifier: port.identifier,
                code: SERIAL_VALIDATION_CODE.SOFTSERIAL_FUNCTION_STRIPPED,
            });
        }

        for (const key of ["gps_baudrateIndex", "blackbox_baudrateIndex", "telemetry_baudrateIndex"]) {
            if (next[key] > BAUD_19200_INDEX) {
                next[key] = BAUD_19200_INDEX;
                notices.push({
                    identifier: port.identifier,
                    code: SERIAL_VALIDATION_CODE.SOFTSERIAL_BAUD_CLAMPED,
                    field: key,
                });
            }
        }
        return next;
    });

    return { ports: normalized, notices };
}

/**
 * Mirror of isSerialConfigValid() (src/main/io/serial.c:510).
 *
 * Two deliberate, safe deviations from a literal transcription:
 *  - The firmware returns false on the first failure; we collect ALL failures
 *    so the UI can highlight every offending row at once. Same verdict.
 *  - The firmware mutates softserial config in place; we return a normalised
 *    copy plus notices instead.
 *
 * @param {Array<{identifier:number, functionMask:number,
 *   gps_baudrateIndex?:number, blackbox_baudrateIndex?:number,
 *   telemetry_baudrateIndex?:number}>} rawPorts
 * @param {number} serialRxProvider  FC.RX_CONFIG.serialrx_provider
 * @param {object} [options]
 * @param {boolean} [options.hasTelemetry=true]  build has USE_TELEMETRY
 * @param {boolean} [options.hasVtxMsp=true]     build has USE_VTX_MSP
 * @returns {{valid:boolean, errors:Array, notices:Array, normalizedPorts:Array}}
 */
export function validateSerialConfig(rawPorts, serialRxProvider, options = {}) {
    const { hasTelemetry = true, hasVtxMsp = true } = options;

    const { ports, notices } = normalizeSerialConfig(rawPorts);
    const errors = [];

    const sharableWithMsp = hasTelemetry ? ALL_FUNCTIONS_SHARABLE_WITH_MSP : F.BLACKBOX | F.VTX_MSP;

    // 8 with telemetry, 3 without.
    const maxSharedBits = popcount32(F.MSP | sharableWithMsp);

    let mspPortCount = 0;

    for (const port of ports) {
        const mask = port.functionMask >>> 0;

        if (mask & F.MSP) {
            mspPortCount++;
        }

        // Rule 3 — VCP must carry MSP.
        if (port.identifier === SERIAL_PORT_IDENTIFIER.USB_VCP && !(mask & F.MSP)) {
            errors.push({
                identifier: port.identifier,
                code: SERIAL_VALIDATION_CODE.VCP_REQUIRES_MSP,
            });
        }

        const bitCount = popcount32(mask);

        // Rule 4 — VTX (MSP) cannot be the only function on the port.
        if (hasVtxMsp && mask & F.VTX_MSP && bitCount === 1) {
            errors.push({
                identifier: port.identifier,
                code: SERIAL_VALIDATION_CODE.VTX_MSP_NOT_SHARED,
            });
        }

        if (bitCount > 1) {
            // Rule 5 — hard ceiling on how many functions may share one port.
            if (bitCount > maxSharedBits) {
                errors.push({
                    identifier: port.identifier,
                    code: SERIAL_VALIDATION_CODE.TOO_MANY_FUNCTIONS,
                    params: { max: maxSharedBits, count: bitCount },
                });
                continue;
            }

            // Rule 6 — the share must match one of the two supported patterns.
            // NOTE (rule-6(a) loophole): the firmware only checks that MSP is
            // present AND at least one shareable bit is present; it never
            // verifies the *remaining* bits are shareable. So e.g.
            // MSP | GPS | BLACKBOX passes. We deliberately keep this loophole.
            const mspShare = mask & F.MSP && mask & sharableWithMsp;
            const rxShare = hasTelemetry && isRxTelemetryShareAllowed(mask, serialRxProvider);

            if (!mspShare && !rxShare) {
                errors.push({
                    identifier: port.identifier,
                    code: SERIAL_VALIDATION_CODE.INVALID_FUNCTION_COMBINATION,
                });
            }
        }
    }

    // Rule 7 — MSP port count.
    if (mspPortCount === 0) {
        errors.push({
            identifier: null,
            code: SERIAL_VALIDATION_CODE.NO_MSP_PORT,
        });
    } else if (mspPortCount > MAX_MSP_PORT_COUNT) {
        errors.push({
            identifier: null,
            code: SERIAL_VALIDATION_CODE.TOO_MANY_MSP_PORTS,
            params: { max: MAX_MSP_PORT_COUNT, count: mspPortCount },
        });
    }

    return { valid: errors.length === 0, errors, notices, normalizedPorts: ports };
}
