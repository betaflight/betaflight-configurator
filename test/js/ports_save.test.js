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
    isMspRejected: (response) => Boolean(response?.unsupported || response?.crcError),
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

/** Run saveConfig and hand the serial-write callback the given MSP response. */
function saveWithResponse(ports, response) {
    const { saveConfig } = usePortsConfiguration(ports, {}, []);
    saveConfig();
    expect(sendSerialConfig).toHaveBeenCalledTimes(1);
    sendSerialConfig.mock.calls[0][0](response);
}

describe("ports save", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
    });

    describe("rejected serial write (betaflight#15131)", () => {
        it("aborts before the feature write, EEPROM save and reboot", () => {
            saveWithResponse([makePort({ msp: true })], { unsupported: 1 });

            expect(sendMessage).not.toHaveBeenCalled();
            expect(saveAndReboot).not.toHaveBeenCalled();
            expect(guiLog).toHaveBeenCalledWith("portsSaveRejected");
        });

        it("aborts on a corrupt reply rather than assuming success", () => {
            saveWithResponse([makePort({ msp: true })], { crcError: true });

            expect(sendMessage).not.toHaveBeenCalled();
            expect(saveAndReboot).not.toHaveBeenCalled();
        });

        it("continues the save chain when the FC accepts the write", () => {
            saveWithResponse([makePort({ msp: true })], { unsupported: 0, crcError: false });

            expect(sendMessage).toHaveBeenCalledTimes(1);
            expect(guiLog).not.toHaveBeenCalledWith("portsSaveRejected");
        });

        it("treats an absent response (disconnected / virtual mode) as not a rejection", () => {
            saveWithResponse([makePort({ msp: true })], undefined);

            expect(sendMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe("reconstructed port array", () => {
        it("carries the raw function mask through so unnamed bits can be restored", () => {
            const reservedBit = 1 << 19;
            saveWithResponse([makePort({ identifier: 3, sensor: "GPS", functionMask: (1 << 1) | reservedBit })], {});

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual((1 << 1) | reservedBit);
        });

        it("re-emits named functions that no slot could hold", () => {
            // GIMBAL has no rule below API 1.47, so it lands in reservedFunctions rather than
            // being silently dropped on save.
            saveWithResponse([makePort({ identifier: 4, reservedFunctions: ["GIMBAL"] })], {});

            expect(FC.SERIAL_CONFIG.ports[0].functions).toContain("GIMBAL");
        });

        it("keeps every slot's function", () => {
            saveWithResponse(
                [
                    makePort({
                        identifier: 2,
                        msp: true,
                        rxSerial: true,
                        telemetry: "TELEMETRY_MAVLINK",
                        sensor: "GPS",
                        peripheral: "BLACKBOX",
                    }),
                ],
                {},
            );

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

            saveWithResponse([port], {});

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual(0);
            expect(FC.SERIAL_CONFIG.ports[0].functions).toEqual(["GPS"]);
        });
    });

    describe("feature bits", () => {
        it("enables RX_SERIAL, ESC_SENSOR and GPS from port assignments", () => {
            saveWithResponse(
                [
                    makePort({ identifier: 0, rxSerial: true }),
                    makePort({ identifier: 2, sensor: "ESC_SENSOR" }),
                    makePort({ identifier: 3, sensor: "GPS" }),
                ],
                {},
            );

            const features = FC.FEATURE_CONFIG.features;
            expect(features.isEnabled("RX_SERIAL")).toBe(true);
            expect(features.isEnabled("ESC_SENSOR")).toBe(true);
            expect(features.isEnabled("GPS")).toBe(true);
        });

        it("has no BLACKBOX feature bit to toggle", () => {
            // updateFeatures() enables/disables "BLACKBOX", but Features.js carries no such
            // feature - firmware dropped FEATURE_BLACKBOX. Both calls are silent no-ops.
            // Asserted so the dead branch is not mistaken for working behaviour.
            saveWithResponse([makePort({ identifier: 1, peripheral: "BLACKBOX" })], {});

            expect(FC.FEATURE_CONFIG.features.isEnabled("BLACKBOX")).toBe(false);
        });

        it("does not enable a feature from a reserved function it cannot interpret", () => {
            saveWithResponse([makePort({ identifier: 4, reservedFunctions: ["GIMBAL"] })], {});

            expect(FC.FEATURE_CONFIG.features.isEnabled("RX_SERIAL")).toBe(false);
        });
    });
});
