import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSerialConfig = vi.fn();
const crunch = vi.fn(() => []);
const sendMessage = vi.fn();
const saveAndReboot = vi.fn(() => Promise.resolve());
const guiLog = vi.fn();

vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: {
        sendSerialConfig: (...args) => sendSerialConfig(...args),
        crunch: (...args) => crunch(...args),
    },
}));

vi.mock("../../src/js/msp", () => ({
    default: { send_message: (...args) => sendMessage(...args) },
}));

vi.mock("../../src/composables/useReboot", () => ({
    useReboot: () => ({ saveAndReboot }),
}));

vi.mock("../../src/js/gui_log", () => ({
    gui_log: (...args) => guiLog(...args),
}));

vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (key) => key },
}));

vi.mock("../../src/js/Analytics", () => ({
    tracking: {
        EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" },
        sendSaveAndChangeEvents: vi.fn(),
    },
}));

const { usePortsConfiguration } = await import("../../src/composables/ports/usePortsConfiguration");
const FC = (await import("../../src/js/fc")).default;
const Features = (await import("../../src/js/Features")).default;

function makePort(overrides = {}) {
    return {
        identifier: 0,
        functionMask: 0,
        reservedFunctions: [],
        msp: false,
        rxSerial: false,
        telemetry: "",
        sensor: "",
        peripheral: "",
        msp_baudrate: "115200",
        telemetry_baudrate: "AUTO",
        gps_baudrate: "AUTO",
        blackbox_baudrate: "AUTO",
        ...overrides,
    };
}

/** Run saveConfig and let the serial write complete. */
function save(ports) {
    const { saveConfig } = usePortsConfiguration(ports, {}, []);
    saveConfig();
    expect(sendSerialConfig).toHaveBeenCalledTimes(1);
    sendSerialConfig.mock.calls[0][0]();
}

describe("ports save", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
    });

    describe("reconstructed port array", () => {
        it("carries the raw function mask through so unnamed bits can be restored", () => {
            const reservedBit = 1 << 25;
            save([makePort({ identifier: 3, sensor: "GPS", functionMask: (1 << 1) | reservedBit })]);

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual((1 << 1) | reservedBit);
        });

        it("re-emits named functions that no slot could hold", () => {
            // A port has one peripheral slot, so a second peripheral the FC reported lands in
            // reservedFunctions rather than being silently dropped on save.
            save([makePort({ identifier: 4, peripheral: "VTX_MSP", reservedFunctions: ["FRSKY_OSD"] })]);

            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual(["VTX_MSP", "FRSKY_OSD"]);
        });

        it("keeps every slot's function", () => {
            save([
                makePort({
                    identifier: 2,
                    msp: true,
                    rxSerial: true,
                    telemetry: "TELEMETRY_MAVLINK",
                    sensor: "GPS",
                    peripheral: "BLACKBOX",
                }),
            ]);

            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual([
                "MSP",
                "RX_SERIAL",
                "TELEMETRY_MAVLINK",
                "GPS",
                "BLACKBOX",
            ]);
        });

        it("tolerates a port with no reserved data", () => {
            const port = makePort({ identifier: 1, sensor: "GPS" });
            delete port.functionMask;
            delete port.reservedFunctions;

            save([port]);

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual(0);
            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual(["GPS"]);
        });
    });

    describe("MSP under a preserved function", () => {
        // VTX_MSP is the peripheral firmware lets share a port with MSP. When the FC reports it
        // alongside another peripheral, only one fits the row's slot and the other is preserved -
        // and the save writes it back, so clearing MSP under it would produce a combination
        // serialPortFunctionsConflict() refuses.
        const rules = [
            { name: "FRSKY_OSD", groups: ["peripherals"], maxPorts: 1, displayName: "FrSky OSD" },
            { name: "TELEMETRY_HOTT", groups: ["telemetry"], maxPorts: 1, displayName: "HoTT" },
        ];

        it("keeps MSP when a preserved peripheral needs it", () => {
            const port = makePort({ msp: true, peripheral: "FRSKY_OSD", reservedFunctions: ["VTX_MSP"] });
            const { onPeripheralChange } = usePortsConfiguration([port], {}, rules);

            onPeripheralChange(port);

            expect(port.msp).toBe(true);
        });

        it("still clears MSP when nothing preserved needs it", () => {
            const port = makePort({ msp: true, peripheral: "FRSKY_OSD" });
            const { onPeripheralChange } = usePortsConfiguration([port], {}, rules);

            onPeripheralChange(port);

            expect(port.msp).toBe(false);
        });

        it("keeps MSP when a telemetry pick would otherwise clear it", () => {
            const port = makePort({ msp: true, telemetry: "TELEMETRY_HOTT", reservedFunctions: ["VTX_MSP"] });
            const { onTelemetryChange } = usePortsConfiguration([port], {}, rules);

            onTelemetryChange(port);

            expect(port.msp).toBe(true);
        });

        it("still clears MSP for a telemetry function that cannot share it", () => {
            const port = makePort({ msp: true, telemetry: "TELEMETRY_HOTT" });
            const { onTelemetryChange } = usePortsConfiguration([port], {}, rules);

            onTelemetryChange(port);

            expect(port.msp).toBe(false);
        });
    });

    describe("feature bits", () => {
        it("enables RX_SERIAL, ESC_SENSOR and GPS from port assignments", () => {
            save([
                makePort({ identifier: 0, rxSerial: true }),
                makePort({ identifier: 2, sensor: "ESC_SENSOR" }),
                makePort({ identifier: 3, sensor: "GPS" }),
            ]);

            const features = FC.FEATURE_CONFIG.features;
            expect(features.isEnabled("RX_SERIAL")).toBe(true);
            expect(features.isEnabled("ESC_SENSOR")).toBe(true);
            expect(features.isEnabled("GPS")).toBe(true);
        });

        it("does not enable a feature from a reserved function it cannot interpret", () => {
            save([makePort({ identifier: 4, reservedFunctions: ["FRSKY_OSD"] })]);

            expect(FC.FEATURE_CONFIG.features.isEnabled("RX_SERIAL")).toBe(false);
        });
    });
});
