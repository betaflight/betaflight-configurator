import { describe, expect, it } from "vitest";
import { responseAccepted } from "../../src/composables/useFcSerialPassthrough.js";

describe("Betaflight serial passthrough acknowledgement", () => {
    it("accepts only an explicit successful MSP response", () => {
        expect(responseAccepted({ unsupported: false, data: new DataView(Uint8Array.of(1).buffer) })).toBe(true);
        expect(responseAccepted({ unsupported: false, data: new DataView(Uint8Array.of(0).buffer) })).toBe(false);
        expect(responseAccepted({ unsupported: true, data: new DataView(Uint8Array.of(1).buffer) })).toBe(false);
    });
});
