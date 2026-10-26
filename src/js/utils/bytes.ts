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
 * Shared byte/string conversion helpers.
 *
 * Extracted from the transport protocols (CapacitorBle, CapacitorTcp,
 * CapacitorSerial) so the conversions live in a single place.
 */

/**
 * Decode a base64 string into a byte array.
 *
 * @param b64 - The base64-encoded string. Falsy input yields an empty array.
 * @returns The decoded bytes.
 */
export function base64ToUint8Array(b64: string | null | undefined): Uint8Array {
    if (!b64) {
        return new Uint8Array(0);
    }
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        // atob() returns a binary string: every code unit is a single byte (0–255),
        // so codePointAt(i) equals the byte value at i and never exceeds 255.
        bytes[i] = binary.codePointAt(i) as number;
    }
    return bytes;
}

/**
 * Encode a byte array into a base64 string.
 *
 * @param bytes - The bytes to encode.
 * @returns The base64-encoded string.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
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
 * @param hexString - The hex string (two chars per byte). Empty/falsy input yields an empty array.
 * @returns The parsed bytes.
 * @throws If the hex string has an odd length.
 */
export function hexStringToUint8Array(hexString: string | null | undefined): Uint8Array<ArrayBuffer> {
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
 * @param uint8Array - The bytes to format.
 * @returns The hex string (two lowercase chars per byte).
 */
export function uint8ArrayToHexString(uint8Array: Uint8Array): string {
    return Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
