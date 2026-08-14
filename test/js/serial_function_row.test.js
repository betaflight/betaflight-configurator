import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";

const mspPromise = vi.fn(() => Promise.resolve({}));

vi.mock("../../src/js/msp", () => ({ default: { promise: (...args) => mspPromise(...args) } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: () => [], serialPortUnknownFunctionMask: () => 0 },
    isMspRejected: () => false,
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot: vi.fn() }) }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/Analytics", () => ({
    tracking: { EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" }, sendSaveAndChangeEvents: vi.fn() },
}));
// The row renders through Nuxt UI's USelect, which the Nuxt UI vite plugin resolves at compile
// time and so cannot be stubbed in a DOM mount. The logic under test lives in the composable
// instead; only i18next-vue needs standing in for, and a plain interpolation keeps assertions
// readable.
vi.mock("i18next-vue", () => ({
    useTranslation: () => ({
        t: (key, params) =>
            params
                ? `${key}(${Object.entries(params)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(",")})`
                : key,
    }),
}));

const { useSerialFunctionRow, NO_PORT } = await import("../../src/composables/ports/useSerialFunctionRow");
const { useSerialPortsStore } = await import("../../src/stores/serialPorts");
const FC = (await import("../../src/js/fc")).default;

function fcPort(identifier, functions = []) {
    return {
        identifier,
        functionMask: 0,
        functions,
        msp_baudrate: "115200",
        gps_baudrate: "57600",
        telemetry_baudrate: "AUTO",
        blackbox_baudrate: "115200",
    };
}

/** Props are reactive so a row behaves the way it would inside a component. */
const row = (props) => useSerialFunctionRow(reactive({ baudField: null, ...props }));

const labels = (items) => items.map((i) => i.label);

describe("useSerialFunctionRow", () => {
    let store;

    beforeEach(async () => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mspPromise.mockImplementation(() => Promise.resolve({}));
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.CONFIG.buildOptions = [];

        store = useSerialPortsStore();
        FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0), fcPort(1), fcPort(2)];
        await store.loadConfig({ force: true });
    });

    describe("port options", () => {
        it("offers every port plus an unassigned option", () => {
            const { portItems } = row({ serialFunction: "GPS" });

            expect(labels(portItems.value)).toEqual(["serialPortNone", "USB VCP", "UART1", "UART2", "UART3"]);
        });

        it("annotates a port with the function already on it", () => {
            store.assign("ESC_SENSOR", 1);
            const { portItems } = row({ serialFunction: "GPS" });

            const uart2 = portItems.value.find((i) => i.value === 1);
            expect(uart2.label).toEqual("serialPortOccupiedBy(port=UART2,serialFunction=portsFunction_ESC_SENSOR)");
        });

        it("leaves a free port unannotated", () => {
            const { portItems } = row({ serialFunction: "GPS" });

            expect(portItems.value.find((i) => i.value === 1).label).toEqual("UART2");
        });

        it("reports the port the function is on as the selection", () => {
            store.assign("GPS", 2);
            const { selectedValue } = row({ serialFunction: "GPS" });

            expect(selectedValue.value).toEqual(2);
        });

        it("reports no selection when the function is unassigned", () => {
            const { selectedValue } = row({ serialFunction: "GPS" });

            expect(selectedValue.value).toEqual(NO_PORT);
        });

        it("disables every port for a function the build does not support", () => {
            FC.CONFIG.buildOptions = ["USE_VTX"]; // no USE_GPS
            const { portItems } = row({ serialFunction: "GPS" });

            expect(portItems.value.slice(1).every((i) => i.disabled)).toBe(true);
        });

        it("is disabled until the store has loaded", () => {
            setActivePinia(createPinia());
            const { loaded } = row({ serialFunction: "GPS" });

            expect(loaded.value).toBe(false);
        });
    });

    describe("assignment", () => {
        it("assigns the function to the chosen port", () => {
            const { selectPort } = row({ serialFunction: "GPS" });

            selectPort(0);

            expect(store.portById(0).sensor).toEqual("GPS");
            expect(store.dirty).toBe(true);
        });

        it("clears the function when the unassigned option is chosen", () => {
            store.assign("GPS", 0);
            const { selectPort } = row({ serialFunction: "GPS" });

            selectPort(NO_PORT);

            expect(store.portById(0).sensor).toEqual("");
        });
    });

    describe("eviction warnings", () => {
        it("warns about the function it displaced", () => {
            store.assign("ESC_SENSOR", 1);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(1);

            expect(evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "ESC_SENSOR" }]);
        });

        it("does not warn about the function the user is moving", () => {
            store.assign("GPS", 0);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(1);

            expect(evictions.value).toEqual([]);
        });

        it("does not warn when clearing the function", () => {
            store.assign("GPS", 0);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(NO_PORT);

            expect(evictions.value).toEqual([]);
        });

        it("does not warn when nothing was displaced", () => {
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(0);

            expect(evictions.value).toEqual([]);
        });

        it("warns about MSP being turned off by a function that cannot share the port", () => {
            store.assign("MSP", 1);
            const { selectPort, evictions } = row({ serialFunction: "TELEMETRY_SMARTPORT" });

            selectPort(1);

            expect(evictions.value).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "MSP" });
        });

        it("replaces the previous warning rather than accumulating", () => {
            store.assign("ESC_SENSOR", 1);
            const { selectPort, evictions } = row({ serialFunction: "GPS" });

            selectPort(1);
            expect(evictions.value).toHaveLength(1);

            selectPort(2);
            expect(evictions.value).toEqual([]);
        });
    });

    describe("MSP on the chosen port", () => {
        it("reflects the chosen port's MSP setting", () => {
            store.assign("MSP", 1);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(1);

            expect(r.msp.value).toBe(true);
        });

        it("enables MSP on the chosen port", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);
            expect(r.msp.value).toBe(false);

            r.setMsp(true);

            expect(store.portById(1).msp).toBe(true);
            expect(r.msp.value).toBe(true);
        });

        it("disables MSP on the chosen port", () => {
            store.assign("MSP", 1);
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);

            r.setMsp(false);

            expect(store.portById(1).msp).toBe(false);
        });

        it("follows the selection from one port to another", () => {
            store.assign("MSP", 1);
            const r = row({ serialFunction: "GPS" });

            r.selectPort(1);
            expect(r.msp.value).toBe(true);

            r.selectPort(2);
            expect(r.msp.value).toBe(false);
        });

        it("is unavailable until a port is chosen", () => {
            const r = row({ serialFunction: "GPS" });

            expect(r.mspDisabled.value).toBe(true);
            expect(() => r.setMsp(true)).not.toThrow();
        });

        it("cannot be switched off for USB VCP, which firmware requires to keep MSP", () => {
            const r = row({ serialFunction: "BLACKBOX" });
            r.selectPort(20);

            expect(r.mspDisabled.value).toBe(true);

            r.setMsp(false);

            expect(store.portById(20).msp).toBe(true);
        });

        it("exposes the MSP baudrate of the chosen port and writes it back", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);

            expect(r.mspBaudrate.value).toEqual("115200");
            expect(labels(r.mspBaudItems.value)).toContain("115200");

            r.setMspBaudrate("9600");

            expect(store.portById(1).msp_baudrate).toEqual("9600");
        });

        it("marks the store dirty, so the change reaches the save", () => {
            const r = row({ serialFunction: "GPS" });
            r.selectPort(1);
            r.setMsp(true);

            expect(store.dirty).toBe(true);
        });
    });

    describe("baudrate", () => {
        it("is absent for a function with no baudrate", () => {
            const { hasBaudField, baudItems } = row({ serialFunction: "ESC_SENSOR" });

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        it("reads the assigned port's value", () => {
            store.assign("GPS", 0);
            const { hasBaudField, baudrate } = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            expect(hasBaudField.value).toBe(true);
            expect(baudrate.value).toEqual("57600");
        });

        it("writes back to the assigned port", () => {
            store.assign("GPS", 0);
            const { setBaudrate } = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            setBaudrate("115200");

            expect(store.portById(0).gps_baudrate).toEqual("115200");
        });

        it("does nothing when the function is unassigned", () => {
            const { baudrate, setBaudrate } = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            expect(baudrate.value).toEqual("");
            expect(() => setBaudrate("115200")).not.toThrow();
        });

        it("offers the list matching the field", () => {
            const { baudItems } = row({ serialFunction: "GPS", baudField: "gps_baudrate" });

            expect(labels(baudItems.value)).toContain("AUTO");
            expect(labels(baudItems.value)).toContain("115200");
        });
    });
});
