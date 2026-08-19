import { describe, expect, it } from "vitest";
import {
    SERIAL_FUNCTION as F,
    validateSerialConfig,
    normalizeSerialConfig,
    isSoftSerialPort,
    popcount32,
    SERIAL_VALIDATION_CODE as CODE,
} from "../../../src/js/utils/serialConfigValidation";

// serialrx_provider (SerialRXType) values used by the vectors.
const PROVIDER = {
    SPEKTRUM1024: 15,
    SPEKTRUM2048: 1,
    SBUS: 2,
    IBUS: 7,
    CRSF: 9,
    MAVLINK: 16,
};

// Convenience: build a raw port from an identifier + function mask.
const p = (identifier, functionMask = 0, extra = {}) => ({ identifier, functionMask, ...extra });

const codes = (result) => result.errors.map((e) => e.code);

describe("popcount32 / isSoftSerialPort", () => {
    it("counts bits", () => {
        expect(popcount32(0)).toBe(0);
        expect(popcount32(F.MSP)).toBe(1);
        expect(popcount32(F.MSP | F.BLACKBOX | F.VTX_MSP)).toBe(3);
    });

    it("identifies softserial ports (30-31 only)", () => {
        expect(isSoftSerialPort(30)).toBe(true);
        expect(isSoftSerialPort(31)).toBe(true);
        expect(isSoftSerialPort(29)).toBe(false);
        expect(isSoftSerialPort(32)).toBe(false);
        expect(isSoftSerialPort(51)).toBe(false);
    });
});

describe("validateSerialConfig — firmware isSerialConfigValid mirror", () => {
    it("1: VCP with MSP only is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
        expect(r.errors).toEqual([]);
    });

    it("2: VCP MSP + UART GPS is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.GPS)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("3: MSP | BLACKBOX share is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.MSP | F.BLACKBOX)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("4: MSP | SMARTPORT share is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.MSP | F.TELEMETRY_SMARTPORT)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("5: RX_SERIAL | LTM with SBUS provider is valid (RX share)", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.RX_SERIAL | F.TELEMETRY_LTM)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("6: RX_SERIAL | LTM with CRSF provider is invalid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.RX_SERIAL | F.TELEMETRY_LTM)], PROVIDER.CRSF);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.INVALID_FUNCTION_COMBINATION);
    });

    it("7: RX_SERIAL | SMARTPORT is invalid (SMARTPORT not in shareable subset)", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.RX_SERIAL | F.TELEMETRY_SMARTPORT)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.INVALID_FUNCTION_COMBINATION);
    });

    it("8: RX_SERIAL | IBUS telemetry with IBUS provider is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.RX_SERIAL | F.TELEMETRY_IBUS)], PROVIDER.IBUS);
        expect(r.valid).toBe(true);
    });

    it("9: RX_SERIAL | IBUS telemetry with SBUS provider is invalid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.RX_SERIAL | F.TELEMETRY_IBUS)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.INVALID_FUNCTION_COMBINATION);
    });

    it("10: RX_SERIAL | VTX_MSP is valid regardless of provider", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.RX_SERIAL | F.VTX_MSP)], PROVIDER.CRSF);
        expect(r.valid).toBe(true);
    });

    it("11: GPS | BLACKBOX share is invalid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.GPS | F.BLACKBOX)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.INVALID_FUNCTION_COMBINATION);
    });

    it("12: VTX_MSP alone on a port is invalid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.VTX_MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.VTX_MSP_NOT_SHARED);
    });

    it("13: MSP | VTX_MSP on the VCP is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP | F.VTX_MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("14: VCP without MSP is invalid", () => {
        const r = validateSerialConfig([p(20, 0), p(51, F.MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.VCP_REQUIRES_MSP);
    });

    it("15: no MSP port anywhere is invalid", () => {
        const r = validateSerialConfig([p(51, F.GPS), p(52, F.BLACKBOX)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.NO_MSP_PORT);
    });

    it("16: four MSP ports is invalid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.MSP), p(52, F.MSP), p(53, F.MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.TOO_MANY_MSP_PORTS);
    });

    it("17: exactly three MSP ports is valid", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.MSP), p(52, F.MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("18: softserial-only MSP strips MSP first -> NO_MSP_PORT + stripped notice", () => {
        const r = validateSerialConfig([p(30, F.MSP)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.NO_MSP_PORT);
        expect(r.notices.map((n) => n.code)).toContain(CODE.SOFTSERIAL_FUNCTION_STRIPPED);
    });

    it("19: softserial GPS baud > 19200 is clamped to index 2 with a notice", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(30, F.GPS, { gps_baudrateIndex: 5 })], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
        expect(r.notices.map((n) => n.code)).toContain(CODE.SOFTSERIAL_BAUD_CLAMPED);
        const softserial = r.normalizedPorts.find((port) => port.identifier === 30);
        expect(softserial.gps_baudrateIndex).toBe(2);
    });

    it("20: MSP | GPS | BLACKBOX is valid (documents the rule-6(a) loophole)", () => {
        const r = validateSerialConfig([p(20, F.MSP), p(51, F.MSP | F.GPS | F.BLACKBOX)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("21: eight shared bits (exactly at the ceiling) is valid", () => {
        const eightBits =
            F.MSP |
            F.BLACKBOX |
            F.VTX_MSP |
            F.TELEMETRY_FRSKY_HUB |
            F.TELEMETRY_HOTT |
            F.TELEMETRY_LTM |
            F.TELEMETRY_SMARTPORT |
            F.TELEMETRY_MAVLINK;
        expect(popcount32(eightBits)).toBe(8);
        const r = validateSerialConfig([p(20, F.MSP), p(51, eightBits)], PROVIDER.SBUS);
        expect(r.valid).toBe(true);
    });

    it("22: nine shared bits exceeds the ceiling -> TOO_MANY_FUNCTIONS", () => {
        const nineBits =
            F.MSP |
            F.BLACKBOX |
            F.VTX_MSP |
            F.TELEMETRY_FRSKY_HUB |
            F.TELEMETRY_HOTT |
            F.TELEMETRY_LTM |
            F.TELEMETRY_SMARTPORT |
            F.TELEMETRY_MAVLINK |
            F.GPS;
        const r = validateSerialConfig([p(20, F.MSP), p(51, nineBits)], PROVIDER.SBUS);
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.TOO_MANY_FUNCTIONS);
    });

    it("23: with hasTelemetry:false the ceiling drops to 3", () => {
        const eightBits =
            F.MSP |
            F.BLACKBOX |
            F.VTX_MSP |
            F.TELEMETRY_FRSKY_HUB |
            F.TELEMETRY_HOTT |
            F.TELEMETRY_LTM |
            F.TELEMETRY_SMARTPORT |
            F.TELEMETRY_MAVLINK;
        const r = validateSerialConfig([p(20, F.MSP), p(51, eightBits)], PROVIDER.SBUS, {
            hasTelemetry: false,
        });
        expect(r.valid).toBe(false);
        expect(codes(r)).toContain(CODE.TOO_MANY_FUNCTIONS);
    });
});

describe("normalizeSerialConfig", () => {
    it("does not mutate the input ports", () => {
        const input = [p(30, F.MSP | F.GPS, { gps_baudrateIndex: 5 })];
        const snapshot = JSON.parse(JSON.stringify(input));
        normalizeSerialConfig(input);
        expect(input).toEqual(snapshot);
    });

    it("leaves non-softserial ports untouched", () => {
        const { ports, notices } = normalizeSerialConfig([p(51, F.MSP | F.RX_SERIAL, { gps_baudrateIndex: 5 })]);
        expect(ports[0].functionMask).toBe(F.MSP | F.RX_SERIAL);
        expect(ports[0].gps_baudrateIndex).toBe(5);
        expect(notices).toEqual([]);
    });
});
