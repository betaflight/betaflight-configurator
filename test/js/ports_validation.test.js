import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import FC from "../../src/js/fc";
import { validatePortsConfig } from "../../src/composables/ports/usePortsValidation";
import { SERIAL_VALIDATION_CODE as CODE } from "../../src/js/utils/serialConfigValidation";

// Minimal Ports-tab port model, matching what usePortsState produces.
const port = (identifier, overrides = {}) => ({
    identifier,
    msp: false,
    rxSerial: false,
    telemetry: "",
    sensor: "",
    peripheral: "",
    gps_baudrate: "AUTO",
    telemetry_baudrate: "AUTO",
    blackbox_baudrate: "AUTO",
    ...overrides,
});

// VCP(MSP) + a UART sharing Serial RX with LTM telemetry. This is valid only when
// the RX/telemetry share branch is available, i.e. when the target has telemetry
// and the provider supports the share (SBUS).
const rxTelemetrySharePorts = () => [port(20, { msp: true }), port(51, { rxSerial: true, telemetry: "TELEMETRY_LTM" })];

const SBUS = 2;

const codes = (result) => result.errors.map((e) => e.code);

describe("validatePortsConfig — build-option derived telemetry capability", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        FC.RX_CONFIG.serialrx_provider = SBUS;
    });

    it("treats telemetry as present when build options were not reported (RX share valid)", () => {
        // Fresh FC: no api version / empty build options -> fail open to hasTelemetry:true.
        const result = validatePortsConfig(rxTelemetrySharePorts());
        expect(result.valid).toBe(true);
    });

    it("treats telemetry as present when the build reports a telemetry protocol", () => {
        FC.CONFIG.apiVersion = "1.47.0";
        FC.CONFIG.buildOptions = ["USE_GPS", "USE_TELEMETRY_LTM"];

        const result = validatePortsConfig(rxTelemetrySharePorts());
        expect(result.valid).toBe(true);
    });

    it("rejects the RX/telemetry share on a reported no-telemetry target", () => {
        FC.CONFIG.apiVersion = "1.47.0";
        FC.CONFIG.buildOptions = ["USE_GPS"]; // reported, but no telemetry protocol

        const result = validatePortsConfig(rxTelemetrySharePorts());
        expect(result.valid).toBe(false);
        expect(codes(result)).toContain(CODE.INVALID_FUNCTION_COMBINATION);
    });

    it("still honours serialrx_provider (share rejected for an unsupported provider)", () => {
        FC.RX_CONFIG.serialrx_provider = 9; // CRSF: not an RX/telemetry share provider

        const result = validatePortsConfig(rxTelemetrySharePorts());
        expect(result.valid).toBe(false);
        expect(codes(result)).toContain(CODE.INVALID_FUNCTION_COMBINATION);
    });
});
