/**
 * Shared byte/string conversion helpers.
 *
 * Extracted from the transport protocols (CapacitorBle, CapacitorTcp,
 * CapacitorSerial) so the conversions live in a single place.
 */

/**
 * Decode a base64 string into a byte array.
 *
 * @param {string} b64 - The base64-encoded string. Falsy input yields an empty array.
 * @returns {Uint8Array} The decoded bytes.
 */
export function base64ToUint8Array(b64) {
    if (!b64) {
        return new Uint8Array(0);
    }
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        // atob() returns a binary string: every code unit is a single byte (0–255),
        // so codePointAt(i) equals the byte value at i and never exceeds 255.
        bytes[i] = binary.codePointAt(i);
    }
    return bytes;
}

/**
 * Encode a byte array into a base64 string.
 *
 * @param {Uint8Array} bytes - The bytes to encode.
 * @returns {string} The base64-encoded string.
 */
export function uint8ArrayToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        // Each byte is 0–255, so fromCodePoint produces the matching single-byte binary-string char for btoa().
        binary += String.fromCodePoint(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Parse a hex string into a byte array.
 *
 * @param {string} hexString - The hex string (two chars per byte). Empty/falsy input yields an empty array.
 * @returns {Uint8Array} The parsed bytes.
 * @throws {Error} If the hex string has an odd length.
 */
export function hexStringToUint8Array(hexString) {
    if (!hexString || hexString.length === 0) {
        return new Uint8Array(0);
    }

    if (hexString.length & 1) {
        throw new Error(`Hex string has odd length: ${hexString.length}`);
    }

    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        bytes[i / 2] = Number.parseInt(hexString.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Format a byte array as a hex string.
 *
 * @param {Uint8Array} uint8Array - The bytes to format.
 * @returns {string} The hex string (two lowercase chars per byte).
 */
export function uint8ArrayToHexString(uint8Array) {
    return Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
