import { describe, expect, it } from "vitest";
import {
    base64ToUint8Array,
    uint8ArrayToBase64,
    hexStringToUint8Array,
    uint8ArrayToHexString,
} from "../../src/js/utils/bytes.js";

describe("bytes base64 helpers", () => {
    it("round-trips a representative byte array including 0 and 255", () => {
        const original = new Uint8Array([0, 1, 2, 127, 128, 200, 254, 255]);
        const b64 = uint8ArrayToBase64(original);
        const decoded = base64ToUint8Array(b64);
        expect(decoded).toEqual(original);
    });

    it("encodes a known array to a known base64 string", () => {
        // "Man" -> "TWFu"
        const bytes = new Uint8Array([77, 97, 110]);
        expect(uint8ArrayToBase64(bytes)).toBe("TWFu");
    });

    it("returns an empty Uint8Array for an empty string", () => {
        expect(base64ToUint8Array("")).toEqual(new Uint8Array(0));
    });

    it("returns an empty Uint8Array for undefined (the falsy guard)", () => {
        expect(base64ToUint8Array(undefined)).toEqual(new Uint8Array(0));
    });
});

describe("bytes hex helpers", () => {
    it("round-trips a representative byte array including 0 and 255", () => {
        const original = new Uint8Array([0, 1, 2, 127, 128, 200, 254, 255]);
        const hex = uint8ArrayToHexString(original);
        const decoded = hexStringToUint8Array(hex);
        expect(decoded).toEqual(original);
    });

    it("produces lowercase zero-padded two-char-per-byte output", () => {
        const bytes = new Uint8Array([0, 15, 255]);
        expect(uint8ArrayToHexString(bytes)).toBe("000fff");
    });

    it("parses hex back to the correct byte values", () => {
        expect(hexStringToUint8Array("000fff")).toEqual(new Uint8Array([0, 15, 255]));
    });

    it("returns an empty Uint8Array for an empty string", () => {
        expect(hexStringToUint8Array("")).toEqual(new Uint8Array(0));
    });

    it("returns an empty Uint8Array for undefined (the falsy guard)", () => {
        expect(hexStringToUint8Array(undefined)).toEqual(new Uint8Array(0));
    });

    it("throws on an odd-length hex string", () => {
        expect(() => hexStringToUint8Array("abc")).toThrow();
    });
});
