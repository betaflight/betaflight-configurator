import { describe, expect, it, vi, beforeEach } from "vitest";
import FC from "../../src/js/fc";
import { parsePeripherals, usePeripherals } from "../../src/composables/ports/usePeripherals";
import { describeClaim, describeInactiveReason } from "../../src/composables/ports/portClaims";

const { cliSend, loadSerialConfig } = vi.hoisted(() => ({
    cliSend: vi.fn(),
    loadSerialConfig: vi.fn((callback) => callback()),
}));

vi.mock("../../src/composables/useMspCliSession", async (importOriginal) => ({
    ...(await importOriginal()),
    send: cliSend,
}));

vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { loadSerialConfig },
}));

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: (key) => ({ portsClaimMsp: "MSP", portsClaimTelemetry: "Telemetry" })[key] ?? "",
    },
}));

describe("parsePeripherals", () => {
    it("reads serial claims with the active one starred", () => {
        const { serial } = parsePeripherals(["serial UART1: vtx*, osd", "serial UART2: gps"]);

        expect(serial).toEqual([
            {
                portName: "UART1",
                inactiveReason: null,
                claims: [
                    { name: "vtx", active: true },
                    { name: "osd", active: false },
                ],
            },
            { portName: "UART2", inactiveReason: null, claims: [{ name: "gps", active: false }] },
        ]);
    });

    it("reads a port nothing has claimed", () => {
        const { serial } = parsePeripherals(["serial UART4:"]);

        expect(serial).toEqual([{ portName: "UART4", inactiveReason: null, claims: [] }]);
    });

    it("reads the reason a port the board has cannot be opened", () => {
        const { serial } = parsePeripherals(["serial SOFT1 (feature SOFTSERIAL off): vtx", "serial SOFT2 (no pins):"]);

        expect(serial).toEqual([
            {
                portName: "SOFT1",
                inactiveReason: "feature SOFTSERIAL off",
                claims: [{ name: "vtx", active: false }],
            },
            { portName: "SOFT2", inactiveReason: "no pins", claims: [] },
        ]);
    });

    it("reads DroneCAN nodes with health, mode and sensor classes", () => {
        const { canNodes } = parsePeripherals([
            "can node 125: com.you.gps (OK) gps, mag",
            "can node 42: no info (WARNING, INITIALISING)",
        ]);

        expect(canNodes).toEqual([
            { nodeId: 125, name: "com.you.gps", health: "OK", mode: null, sensors: ["gps", "mag"] },
            { nodeId: 42, name: "no info", health: "WARNING", mode: "INITIALISING", sensors: [] },
        ]);
    });

    it("reads sensors detected, enabled and missing", () => {
        const { sensors } = parsePeripherals([
            "gyro 1: ICM42688P* on SPI1",
            "baro: BMP280 on I2C1 @0x76",
            "mag: QMC5883 configured, not detected",
        ]);

        expect(sensors).toEqual([
            { key: "gyro 1", hardware: "ICM42688P", bus: "SPI1", detected: true, enabled: true },
            { key: "baro", hardware: "BMP280", bus: "I2C1 @0x76", detected: true, enabled: false },
            { key: "mag", hardware: "QMC5883", bus: null, detected: false, enabled: false },
        ]);
    });

    it("ignores prompts and unrelated lines", () => {
        const parsed = parsePeripherals(["# peripherals", "", "some banner"]);
        expect(parsed).toEqual({ serial: [], canNodes: [], sensors: [] });
    });
});

describe("describeInactiveReason", () => {
    it("names the feature to enable and the tab that owns it", () => {
        expect(describeInactiveReason("feature SOFTSERIAL off").tab).toBe("configuration");
    });

    it("passes an unknown reason through", () => {
        expect(describeInactiveReason("something new").tab).toBe(null);
    });
});

describe("describeClaim", () => {
    it("resolves instanced claims and owning tabs", () => {
        expect(describeClaim("gps").tab).toBe("gps");
        expect(describeClaim("msp_2")).toEqual({ label: "MSP 2", tab: null });
        expect(describeClaim("telemetry_1").label).toBe("Telemetry 1");
        expect(describeClaim("osd_custom_text").tab).toBe("osd");
    });

    it("passes an unknown claim through by name", () => {
        expect(describeClaim("mystery")).toEqual({ label: "mystery", tab: null });
    });
});

describe("usePeripherals", () => {
    beforeEach(() => {
        FC.resetState();
        FC.CONFIG.flightControllerVersion = "4.6.0";
        cliSend.mockReset();
        loadSerialConfig.mockClear();
    });

    it("builds one tile per reported port, unclaimed ones empty", async () => {
        FC.SERIAL_CONFIG.ports = [{ identifier: 20 }, { identifier: 0 }, { identifier: 1 }];
        cliSend.mockResolvedValue(["serial VCP: msp_1*", "serial UART2: gps"]);

        const peripherals = usePeripherals();
        await peripherals.load();

        expect(peripherals.supported.value).toBe(true);
        expect(peripherals.serialPorts.value).toEqual([
            {
                identifier: 20,
                displayName: "USB VCP",
                inactiveReason: null,
                claims: [{ name: "msp_1", active: true }],
            },
            { identifier: 0, displayName: "UART1", inactiveReason: null, claims: [] },
            {
                identifier: 1,
                displayName: "UART2",
                inactiveReason: null,
                claims: [{ name: "gps", active: false }],
            },
        ]);
    });

    it("tiles a soft serial port the FC cannot open, with the reason", async () => {
        FC.SERIAL_CONFIG.ports = [{ identifier: 20 }];
        cliSend.mockResolvedValue(["serial VCP: msp_1*", "serial SOFT1 (feature SOFTSERIAL off): vtx"]);

        const peripherals = usePeripherals();
        await peripherals.load();

        expect(peripherals.serialPorts.value[1]).toEqual({
            identifier: 30,
            displayName: "SOFTSERIAL1",
            inactiveReason: "feature SOFTSERIAL off",
            claims: [{ name: "vtx", active: false }],
        });
    });

    it("reports unsupported on a build without the command", async () => {
        FC.SERIAL_CONFIG.ports = [{ identifier: 20 }];
        cliSend.mockResolvedValue(["###ERROR IN cli: UNKNOWN COMMAND###"]);

        const peripherals = usePeripherals();
        await peripherals.load();

        expect(peripherals.supported.value).toBe(false);
        expect(peripherals.isLoading.value).toBe(false);
    });
});
