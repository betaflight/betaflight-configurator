import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../src/js/data_storage";
import { GPS_BAUD_RATES } from "../../src/composables/ports/featureBaudRates";
import { PORT_NONE } from "../../src/composables/ports/portNames";
import { buildBaudOptions, buildPortOptions, useFeaturePort } from "../../src/composables/ports/useFeaturePort";

vi.mock("../../src/js/localization", () => ({
    __esModule: true,
    i18n: { getMessage: (key) => key },
}));

const { cliSend } = vi.hoisted(() => ({ cliSend: vi.fn() }));
vi.mock("../../src/composables/useMspCliSession", async (importOriginal) => ({
    ...(await importOriginal()),
    send: cliSend,
}));

const ports = [
    { identifier: 20, functions: ["MSP"] },
    { identifier: 51, functions: [] },
    { identifier: 53, functions: ["RX_SERIAL"] },
];

describe("buildPortOptions", () => {
    const options = () => buildPortOptions(ports, { functionName: "RX_SERIAL", noneLabel: "None" });

    it("offers None first, then the FC's ports in order", () => {
        expect(options().map((option) => option.value)).toEqual([PORT_NONE, 20, 51, 53]);
        expect(options()[0].label).toBe("None");
    });

    it("annotates a port another feature has claimed", () => {
        expect(options().find((option) => option.value === 20).label).toBe("USB VCP (MSP)");
    });

    it("leaves the feature's own claim out of the annotation", () => {
        expect(options().find((option) => option.value === 53).label).toBe("UART3");
        expect(options().find((option) => option.value === 51).label).toBe("UART1");
    });

    it("runs the annotation through the caller's translator", () => {
        const translated = buildPortOptions(ports, {
            functionName: "RX_SERIAL",
            describeFunction: (name) => name.toLowerCase(),
        });

        expect(translated.find((option) => option.value === 20).label).toBe("USB VCP (msp)");
    });

    it("keeps a current assignment the FC did not report, so the select never blanks", () => {
        const withMissing = buildPortOptions(ports, { functionName: "RX_SERIAL", currentIdentifier: 57 });

        expect(withMissing.map((option) => option.value)).toContain(57);
        expect(withMissing.find((option) => option.value === 57).label).toBe("UART7");
    });

    it("does not duplicate a current assignment that is already listed", () => {
        const values = buildPortOptions(ports, { functionName: "RX_SERIAL", currentIdentifier: 53 }).map(
            (option) => option.value,
        );

        expect(values.filter((value) => value === 53)).toHaveLength(1);
        expect(values.filter((value) => value === PORT_NONE)).toHaveLength(1);
    });

    it("copes with no ports at all", () => {
        expect(buildPortOptions(undefined, { functionName: "RX_SERIAL" })).toHaveLength(1);
    });
});

describe("useFeaturePort", () => {
    let scope;
    let port;
    let replies;

    // A `get` for a setting the firmware was not built with is refused; a `set` just succeeds.
    function reply(command) {
        if (replies[command]) {
            return replies[command];
        }
        return command.startsWith("get ") ? ["###ERROR IN get: INVALID NAME###"] : [];
    }

    function withFeature(options, apiVersion = API_VERSION_1_49) {
        FC.CONFIG.apiVersion = apiVersion;
        FC.CONFIG.flightControllerVersion = "4.6.0";
        FC.SERIAL_CONFIG = { ports: [...ports] };

        scope?.stop();
        scope = effectScope();
        scope.run(() => {
            port = useFeaturePort(options);
        });
    }

    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        replies = { "get rx_uart": ["rx_uart = UART3"] };
        cliSend.mockReset();
        cliSend.mockImplementation((command) => Promise.resolve(reply(command)));
        vi.spyOn(MSP, "promise").mockResolvedValue(undefined);
        withFeature({ setting: "rx_uart", functionName: "RX_SERIAL" });
    });

    afterEach(() => {
        scope?.stop();
        scope = undefined;
        vi.restoreAllMocks();
    });

    it("does nothing on firmware that still owns the port through the mask", async () => {
        withFeature({ setting: "rx_uart", functionName: "RX_SERIAL" }, API_VERSION_1_48);

        expect(port.available.value).toBe(false);

        await port.load();
        expect(MSP.promise).not.toHaveBeenCalled();

        port.selectedIdentifier.value = 51;
        await port.write();
        expect(cliSend).not.toHaveBeenCalled();
    });

    it("reads the port from the feature's own setting, not from the mask", async () => {
        // the mask would answer 53 for RX_SERIAL either way, so point the setting somewhere else
        replies["get rx_uart"] = ["rx_uart = UART1"];

        await port.load();

        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP2_COMMON_SERIAL_CONFIG);
        expect(cliSend).toHaveBeenCalledWith("get rx_uart");
        expect(port.selectedIdentifier.value).toBe(51);
        expect(port.changed.value).toBe(false);
    });

    it("resolves the port name against the ports this board reported", async () => {
        // UART3 is both identifier 2 and 53; only the reported list settles which
        await port.load();

        expect(port.selectedIdentifier.value).toBe(53);
    });

    it("reads an unassigned feature as no port", async () => {
        replies["get rx_uart"] = ["rx_uart = NONE"];

        await port.load();

        expect(port.selectedIdentifier.value).toBe(PORT_NONE);
    });

    it("reports itself unsupported when the build has no such setting", async () => {
        withFeature({ setting: "msp_uart_3", functionName: "MSP" });

        await port.load();

        expect(port.supported.value).toBe(false);
        expect(port.available.value).toBe(false);
    });

    it("writes nothing for an instance the build does not have", async () => {
        // the tabs loop write() over all three instances, so an absent one has to be inert
        withFeature({ setting: "msp_uart_3", functionName: "MSP", baud: { setting: "msp_baud_3" } });

        await port.load();
        expect(port.supported.value).toBe(false);

        cliSend.mockClear();
        await expect(port.write()).resolves.toBeUndefined();
        expect(cliSend).not.toHaveBeenCalled();
    });

    it("writes the selection as a CLI set and settles the dirty state", async () => {
        await port.load();
        port.selectedIdentifier.value = 51;

        expect(port.changed.value).toBe(true);

        await port.write();

        expect(cliSend).toHaveBeenCalledWith("set rx_uart = UART1");
        expect(port.changed.value).toBe(false);
    });

    it("clears the assignment with NONE", async () => {
        await port.load();
        port.selectedIdentifier.value = PORT_NONE;

        await port.write();

        expect(cliSend).toHaveBeenCalledWith("set rx_uart = NONE");
    });

    it("writes nothing when the selection has not moved", async () => {
        await port.load();
        cliSend.mockClear();

        await port.write();

        expect(cliSend).not.toHaveBeenCalled();
    });

    it("keeps the change pending when the firmware rejects the set", async () => {
        await port.load();
        port.selectedIdentifier.value = 51;
        cliSend.mockResolvedValue(["###ERROR IN set: INVALID NAME###"]);

        await expect(port.write()).rejects.toThrow(/ERROR/);
        expect(port.changed.value).toBe(true);
    });

    it("offers the baud rates the firmware prints when the feature has no curated list", async () => {
        replies = {
            "get blackbox_uart": ["blackbox_uart = UART3"],
            "get blackbox_baud": [
                "blackbox_baud = 115200",
                "Allowed values: AUTO, 9600, 115200, 230400",
                "Default value: AUTO",
            ],
        };
        withFeature({ setting: "blackbox_uart", functionName: "BLACKBOX", baud: { setting: "blackbox_baud" } });

        await port.load();

        expect(port.selectedBaud.value).toBe("115200");
        expect(port.baudOptions.value.map((option) => option.value)).toEqual(["AUTO", "9600", "115200", "230400"]);
    });

    it("keeps a curated rate list rather than the firmware's", async () => {
        replies = {
            "get gps_uart": ["gps_uart = UART3"],
            "get gps_baud": ["gps_baud = 57600", "Allowed values: AUTO, 9600, 57600"],
        };
        withFeature({
            setting: "gps_uart",
            functionName: "GPS",
            baud: { setting: "gps_baud", rates: GPS_BAUD_RATES },
        });

        await port.load();

        expect(port.baudOptions.value.map((option) => option.value)).not.toContain("AUTO");
    });

    it("carries a protocol beside the port and writes it first", async () => {
        replies = {
            "get telemetry_1_uart": ["telemetry_1_uart = UART3"],
            "get telemetry_1_baud": ["telemetry_1_baud = AUTO", "Allowed values: AUTO, 115200"],
            "get telemetry_1_protocol": [
                "telemetry_1_protocol = SMARTPORT",
                "Allowed values: NONE, FRSKY_HUB, SMARTPORT, MAVLINK",
            ],
        };
        withFeature({
            setting: "telemetry_1_uart",
            functionName: ["TELEMETRY_SMARTPORT", "TELEMETRY_MAVLINK"],
            baud: { setting: "telemetry_1_baud" },
            protocol: { setting: "telemetry_1_protocol" },
        });

        await port.load();

        expect(port.selectedProtocol.value).toBe("SMARTPORT");
        expect(port.protocolOptions.value.map((option) => option.value)).toContain("MAVLINK");

        port.selectedProtocol.value = "MAVLINK";
        port.selectedIdentifier.value = 51;
        cliSend.mockClear();

        await port.write();

        const sent = cliSend.mock.calls.map((call) => call[0]);
        expect(sent).toEqual(["set telemetry_1_protocol = MAVLINK", "set telemetry_1_uart = UART1"]);
    });

    it("leaves a shared bit off its own annotations for every protocol it may claim", async () => {
        const labels = buildPortOptions([{ identifier: 53, functions: ["TELEMETRY_SMARTPORT"] }], {
            functionName: ["TELEMETRY_SMARTPORT", "TELEMETRY_MAVLINK"],
        }).map((option) => option.label);

        expect(labels).toContain("UART3");
    });
});

describe("buildBaudOptions", () => {
    it("offers the feature's rates, labelled as they are sent", () => {
        expect(buildBaudOptions(GPS_BAUD_RATES)).toEqual(GPS_BAUD_RATES.map((rate) => ({ value: rate, label: rate })));
    });

    it("does not offer AUTO for GPS, which the firmware silently reads as 230400", () => {
        expect(GPS_BAUD_RATES).not.toContain("AUTO");
    });

    it("keeps a stored rate the feature no longer offers", () => {
        const values = buildBaudOptions(GPS_BAUD_RATES, "AUTO").map((option) => option.value);

        expect(values).toContain("AUTO");
        expect(values).toHaveLength(GPS_BAUD_RATES.length + 1);
    });

    it("does not duplicate a stored rate that is already offered", () => {
        expect(buildBaudOptions(GPS_BAUD_RATES, "57600")).toHaveLength(GPS_BAUD_RATES.length);
    });

    it("copes with a feature that has no baud of its own", () => {
        expect(buildBaudOptions(undefined)).toEqual([]);
    });
});
