import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";

/**
 * Named settings over MSP.
 *
 * MSP2_CLI_SETTING and MSP2_CLI_SETTING_INFO reach the same value table the CLI does, but as
 * ordinary MSP requests. The difference that matters is the failure mode: the firmware answers a
 * write it refuses with MSP_RESULT_ERROR, so a caller can tell "the FC said no" from "the FC said
 * something I could not parse". Over the text CLI every answer is prose and a refusal is only a
 * line that happens to begin with `###ERROR`, which is why that path can never safely roll a
 * change back.
 *
 * Both messages are gated on USE_CLI in the firmware. A build without them — or one predating
 * them — answers `unsupported`, which these helpers report the same way as a setting that does not
 * exist: `null`. Callers therefore probe rather than version-gate.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// MSP2_CLI_SETTING_INFO prefixes its body with the total length of the block being windowed.
const INFO_HEADER_BYTES = 2;

function encodeText(text) {
    return Array.from(encoder.encode(text));
}

function decodeBody(response, skipBytes = 0) {
    const view = response?.data;
    if (!view || view.byteLength <= skipBytes) {
        return "";
    }

    return decoder.decode(new Uint8Array(view.buffer, view.byteOffset + skipBytes, view.byteLength - skipBytes));
}

// A refused request comes back through the decoder as `unsupported`, not as a rejected promise.
function refused(response) {
    return !response || response.unsupported === 1;
}

// Replies are `name = value`, and `get` matches on substring, so the body can name several
// settings. Only the line naming this one exactly carries its value.
function valueOf(text, setting) {
    for (const line of text.split("\n")) {
        const separator = line.indexOf("=");
        if (separator === -1) {
            continue;
        }
        if (line.slice(0, separator).trim() === setting) {
            return line.slice(separator + 1).trim();
        }
    }

    return null;
}

// The info block is `key=value` lines: pgn, type, then min/max for a numeric setting or values for
// a lookup one.
function parseInfo(text) {
    const fields = {};
    for (const line of text.split("\n")) {
        const separator = line.indexOf("=");
        if (separator === -1) {
            continue;
        }
        fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }

    const min = Number(fields.min);
    const max = Number(fields.max);

    return {
        type: fields.type ?? null,
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
        values: fields.values
            ? fields.values
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
            : null,
    };
}

/**
 * Read one setting.
 * @param {string} setting name as the firmware knows it
 * @returns {Promise<string|null>} its value, or null when this build has no such setting
 */
export async function getSetting(setting) {
    const response = await MSP.promise(MSPCodes.MSP2_CLI_SETTING, encodeText(setting));
    if (refused(response)) {
        return null;
    }

    return valueOf(decodeBody(response), setting);
}

/**
 * Write one setting.
 * @param {string} setting name as the firmware knows it
 * @param {string|number} value
 * @returns {Promise<string>} the value the firmware echoed back
 * @throws {Error} when the firmware refuses the write
 */
export async function setSetting(setting, value) {
    const response = await MSP.promise(MSPCodes.MSP2_CLI_SETTING, encodeText(`${setting} = ${value}`));
    if (refused(response)) {
        throw new Error(`The flight controller refused ${setting} = ${value}`);
    }

    // The echo is best-effort: the firmware acknowledges a write it could not fit a confirmation
    // for, so an empty body here means "written", not "ignored".
    return valueOf(decodeBody(response), setting) ?? String(value);
}

/**
 * Read a setting's bounds, so the app can offer exactly what this build accepts rather than
 * carrying its own copy of a firmware table.
 * @param {string} setting name as the firmware knows it
 * @returns {Promise<{type: string|null, min: number|null, max: number|null, values: string[]|null}|null>}
 */
export async function getSettingInfo(setting) {
    let offset = 0;
    let total = 0;
    let text = "";

    // The body is a window into a block that may be longer than one MSP payload, so page until it
    // is all in. The firmware reports the full length in every reply.
    do {
        const request = [...encodeText(setting), 0, offset & 0xff, (offset >> 8) & 0xff];
        const response = await MSP.promise(MSPCodes.MSP2_CLI_SETTING_INFO, request);
        if (refused(response)) {
            return null;
        }

        const view = response.data;
        if (!view || view.byteLength < INFO_HEADER_BYTES) {
            return null;
        }

        total = view.getUint16(0, true);

        const received = view.byteLength - INFO_HEADER_BYTES;
        if (received <= 0) {
            break;
        }

        text += decodeBody(response, INFO_HEADER_BYTES);
        offset += received;
    } while (offset < total);

    return parseInfo(text);
}
