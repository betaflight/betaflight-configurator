import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../src/js/data_storage";
import { PORT_NONE } from "../../src/composables/ports/portNames";
import {
    buildPortOptions,
    findFeaturePortIdentifier,
    useFeaturePort,
} from "../../src/composables/ports/useFeaturePort";

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

describe("findFeaturePortIdentifier", () => {
    it("finds the port the feature is assigned to", () => {
        expect(findFeaturePortIdentifier(ports, "RX_SERIAL")).toBe(53);
        expect(findFeaturePortIdentifier(ports, "MSP")).toBe(20);
    });

    it("reports no port when the feature is unassigned", () => {
        expect(findFeaturePortIdentifier(ports, "GPS")).toBe(PORT_NONE);
    });

    it("survives a port list the FC has not filled in", () => {
        expect(findFeaturePortIdentifier([], "RX_SERIAL")).toBe(PORT_NONE);
        expect(findFeaturePortIdentifier(undefined, "RX_SERIAL")).toBe(PORT_NONE);
        expect(findFeaturePortIdentifier([{ identifier: 51 }], "RX_SERIAL")).toBe(PORT_NONE);
    });

    it("takes the first claimant when two ports carry the function", () => {
        const duplicated = [
            { identifier: 51, functions: ["RX_SERIAL"] },
            { identifier: 53, functions: ["RX_SERIAL"] },
        ];

        expect(findFeaturePortIdentifier(duplicated, "RX_SERIAL")).toBe(51);
    });
});

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

    function withApiVersion(apiVersion) {
        FC.CONFIG.apiVersion = apiVersion;
        FC.CONFIG.flightControllerVersion = "4.6.0";
        FC.SERIAL_CONFIG = { ports: [...ports] };

        scope?.stop();
        scope = effectScope();
        scope.run(() => {
            port = useFeaturePort({ setting: "rx_uart", functionName: "RX_SERIAL" });
        });
    }

    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        cliSend.mockReset();
        cliSend.mockResolvedValue([]);
        vi.spyOn(MSP, "promise").mockResolvedValue(undefined);
        withApiVersion(API_VERSION_1_49);
    });

    afterEach(() => {
        scope?.stop();
        scope = undefined;
        vi.restoreAllMocks();
    });

    it("does nothing on firmware that still owns the port through the mask", async () => {
        withApiVersion(API_VERSION_1_48);

        expect(port.available.value).toBe(false);

        await port.load();
        expect(MSP.promise).not.toHaveBeenCalled();

        port.selectedIdentifier.value = 51;
        await port.write();
        expect(cliSend).not.toHaveBeenCalled();
    });

    it("reads the current assignment out of the serial config", async () => {
        await port.load();

        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP2_COMMON_SERIAL_CONFIG);
        expect(port.selectedIdentifier.value).toBe(53);
        expect(port.changed.value).toBe(false);
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

        await port.write();

        expect(cliSend).not.toHaveBeenCalled();
    });

    it("keeps the change pending when the firmware rejects the set", async () => {
        cliSend.mockResolvedValue(["###ERROR: invalid name###"]);

        await port.load();
        port.selectedIdentifier.value = 51;

        await expect(port.write()).rejects.toThrow(/ERROR/);
        expect(port.changed.value).toBe(true);
    });
});
