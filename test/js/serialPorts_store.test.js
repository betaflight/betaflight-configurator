import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mspPromise = vi.fn(() => Promise.resolve());
const saveAndReboot = vi.fn(() => Promise.resolve());
const guiLog = vi.fn();

vi.mock("../../src/js/msp", () => ({
    default: {
        promise: (...args) => mspPromise(...args),
    },
}));

vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: {
        crunch: () => [],
        // Bits 19 and 20 are the ones no supported firmware agrees on, so they stand in for
        // "unnamed" here; everything below 19 is a bit this build can name.
        serialPortUnknownFunctionMask: (mask) => (mask || 0) & ~((1 << 19) - 1),
    },
    isMspRejected: (response) => Boolean(response?.unsupported || response?.crcError),
}));

vi.mock("../../src/composables/useReboot", () => ({
    useReboot: () => ({ saveAndReboot }),
}));

vi.mock("../../src/js/gui_log", () => ({ gui_log: (...args) => guiLog(...args) }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/Analytics", () => ({
    tracking: {
        EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" },
        sendSaveAndChangeEvents: vi.fn(),
    },
}));

const { useSerialPortsStore } = await import("../../src/stores/serialPorts");
const FC = (await import("../../src/js/fc")).default;
const CONFIGURATOR = (await import("../../src/js/data_storage")).default;
const Features = (await import("../../src/js/Features")).default;
const MSPCodes = (await import("../../src/js/msp/MSPCodes")).default;

/** An FC-shaped port, as MSPHelper leaves it in FC.SERIAL_CONFIG.ports. */
function fcPort(identifier, functions = [], extra = {}) {
    return {
        identifier,
        functionMask: 0,
        functions,
        msp_baudrate: "115200",
        gps_baudrate: "57600",
        telemetry_baudrate: "AUTO",
        blackbox_baudrate: "115200",
        ...extra,
    };
}

/** Seed the FC with a port array and load it into the store. */
async function load(store, fcPorts) {
    FC.SERIAL_CONFIG.ports = fcPorts;
    await store.loadConfig({ force: true });
}

const DEFAULT_PORTS = [
    fcPort(20, ["MSP"]), // USB VCP
    fcPort(0),
    fcPort(1),
    fcPort(2),
];

async function freshStore(fcPorts = DEFAULT_PORTS) {
    const store = useSerialPortsStore();
    await load(store, fcPorts);
    return store;
}

describe("useSerialPortsStore", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mspPromise.mockImplementation(() => Promise.resolve({}));
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.CONFIG.buildOptions = [];
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
        CONFIGURATOR.connectionValid = true;
    });

    describe("loading", () => {
        it("transforms each FC port into one slot per group", async () => {
            const store = await freshStore([
                fcPort(3, ["MSP", "TELEMETRY_MAVLINK"]),
                fcPort(4, ["GPS"]),
                fcPort(5, ["BLACKBOX"]),
                fcPort(6, ["RX_SERIAL"]),
            ]);

            expect(store.ports.map((p) => p.identifier)).toEqual([3, 4, 5, 6]);
            expect(store.ports[0]).toMatchObject({ msp: true, telemetry: "TELEMETRY_MAVLINK", peripheral: "" });
            expect(store.ports[1]).toMatchObject({ sensor: "GPS" });
            expect(store.ports[2]).toMatchObject({ peripheral: "BLACKBOX" });
            expect(store.ports[3]).toMatchObject({ rxSerial: true });
        });

        it("marks the store loaded and not dirty", async () => {
            const store = await freshStore();

            expect(store.loaded).toBe(true);
            expect(store.dirty).toBe(false);
            expect(store.loadFailed).toBe(false);
        });

        it("reports a failed read instead of leaving consumers on a skeleton", async () => {
            mspPromise.mockImplementation(() => Promise.reject(new Error("timeout")));
            const store = useSerialPortsStore();

            await store.loadConfig({ force: true });

            expect(store.loaded).toBe(false);
            expect(store.loadFailed).toBe(true);
            expect(store.isLoading).toBe(false);
        });

        it("does not clobber unsaved edits on a reload", async () => {
            const store = await freshStore();
            store.assign("GPS", 0);
            expect(store.dirty).toBe(true);

            await store.loadConfig();

            expect(store.portById(0).sensor).toEqual("GPS");
            expect(mspPromise).toHaveBeenCalledTimes(1); // the initial forced load only
        });

        it("reloads a clean store, so a fresh tab mount still refetches", async () => {
            const store = await freshStore();
            await store.loadConfig();

            expect(mspPromise).toHaveBeenCalledTimes(2);
        });

        it("parks a decoded function no slot could hold", async () => {
            // GIMBAL has no rule below API 1.47, so nothing claims it.
            FC.CONFIG.apiVersion = "1.46.0";
            const store = await freshStore([fcPort(4, ["GIMBAL"])]);

            expect(store.ports[0].reservedFunctions).toEqual(["GIMBAL"]);
            expect(store.hasReservedFunctions(store.ports[0])).toBe(true);
        });

        it("flags a port carrying a bit this build cannot name", async () => {
            const store = await freshStore([fcPort(4, [], { functionMask: 1 << 19 })]);

            expect(store.hasReservedFunctions(store.ports[0])).toBe(true);
        });
    });

    describe("dirty tracking", () => {
        it("starts clean and survives a simulated tab switch", async () => {
            const store = await freshStore();
            expect(store.dirty).toBe(false);

            store.assign("GPS", 1);
            expect(store.dirty).toBe(true);

            // A tab switch unmounts the component but not the store.
            const sameStore = useSerialPortsStore();
            expect(sameStore.dirty).toBe(true);
            expect(sameStore.portById(1).sensor).toEqual("GPS");
        });

        it("goes clean again when the edit is undone", async () => {
            const store = await freshStore();

            store.assign("GPS", 1);
            store.clear("GPS");

            expect(store.dirty).toBe(false);
        });

        it("is never dirty before the first load", () => {
            expect(useSerialPortsStore().dirty).toBe(false);
        });
    });

    describe("assign", () => {
        it("places a function in its group's slot", async () => {
            const store = await freshStore();
            const result = store.assign("GPS", 1);

            expect(result).toMatchObject({ assigned: true, blockedBy: null });
            expect(store.portById(1).sensor).toEqual("GPS");
        });

        it("is idempotent", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);
            const result = store.assign("GPS", 1);

            expect(result).toMatchObject({ assigned: true, evicted: [] });
        });

        it("moves a single-instance function rather than duplicating it", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);
            const result = store.assign("GPS", 2);

            expect(store.portById(1).sensor).toEqual("");
            expect(store.portById(2).sensor).toEqual("GPS");
            expect(result.evicted).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "GPS" });
        });

        it("refuses an unknown port", async () => {
            const store = await freshStore();
            expect(store.assign("GPS", 99)).toMatchObject({ assigned: false, blockedBy: "unknownPort" });
        });

        it("refuses a function the firmware build does not support", async () => {
            FC.CONFIG.buildOptions = ["USE_VTX"]; // no USE_GPS
            const store = await freshStore();

            expect(store.assign("GPS", 1)).toMatchObject({ assigned: false, blockedBy: "unsupported" });
            expect(store.portById(1).sensor).toEqual("");
        });

        it("enforces maxPorts for MSP at the firmware's limit of three", async () => {
            const store = await freshStore();
            expect(store.assign("MSP", 0)).toMatchObject({ assigned: true });
            expect(store.assign("MSP", 1)).toMatchObject({ assigned: true });
            // USB VCP already holds the third.
            expect(store.assign("MSP", 2)).toMatchObject({ assigned: false, blockedBy: "maxPorts" });
            expect(store.portById(2).msp).toBe(false);
        });
    });

    describe("eviction matrix", () => {
        it("evicts the sibling within the sensors group", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);
            const result = store.assign("ESC_SENSOR", 1);

            expect(result.evicted).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "GPS" });
            expect(store.portById(1).sensor).toEqual("ESC_SENSOR");
        });

        it("evicts the sibling within the peripherals group", async () => {
            const store = await freshStore();
            store.assign("BLACKBOX", 1);
            const result = store.assign("LIDAR_TF", 1);

            expect(result.evicted).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" });
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });

        it("evicts the sibling within the telemetry group", async () => {
            const store = await freshStore();
            store.assign("TELEMETRY_MAVLINK", 1);
            const result = store.assign("TELEMETRY_SMARTPORT", 1);

            expect(result.evicted).toContainEqual({
                portId: 1,
                portName: "UART2",
                serialFunction: "TELEMETRY_MAVLINK",
            });
            expect(store.portById(1).telemetry).toEqual("TELEMETRY_SMARTPORT");
        });

        it("evicts a peripheral when telemetry takes the port", async () => {
            const store = await freshStore();
            store.assign("BLACKBOX", 1);
            const result = store.assign("TELEMETRY_MAVLINK", 1);

            expect(result.evicted).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" });
            expect(store.portById(1).peripheral).toEqual("");
        });

        it("evicts telemetry when a peripheral takes the port", async () => {
            const store = await freshStore();
            store.assign("TELEMETRY_MAVLINK", 1);
            const result = store.assign("BLACKBOX", 1);

            expect(result.evicted).toContainEqual({
                portId: 1,
                portName: "UART2",
                serialFunction: "TELEMETRY_MAVLINK",
            });
            expect(store.portById(1).telemetry).toEqual("");
        });

        it("reports MSP being turned off by a function that cannot share the port", async () => {
            const store = await freshStore();
            store.assign("MSP", 1);
            const result = store.assign("TELEMETRY_SMARTPORT", 1);

            expect(result.evicted).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "MSP" });
            expect(store.portById(1).msp).toBe(false);
        });

        it("keeps MSP for a function that is sharable with it", async () => {
            const store = await freshStore();
            store.assign("MSP", 1);
            const result = store.assign("TELEMETRY_MAVLINK", 1);

            expect(result.evicted).not.toContainEqual(expect.objectContaining({ serialFunction: "MSP" }));
            expect(store.portById(1).msp).toBe(true);
        });

        it("forces MSP on for an MSP-based peripheral", async () => {
            const store = await freshStore();
            store.assign("VTX_MSP", 1);

            expect(store.portById(1).msp).toBe(true);
        });

        it("previews the same evictions it would apply, without applying them", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            const preview = store.evictionsFor("ESC_SENSOR", 1);
            expect(store.portById(1).sensor).toEqual("GPS"); // untouched

            const applied = store.assign("ESC_SENSOR", 1);
            expect(applied.evicted).toEqual(preview);
        });
    });

    describe("clear", () => {
        it("removes a function from every port", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            const result = store.clear("GPS");

            expect(store.portById(1).sensor).toEqual("");
            expect(result.evicted).toEqual([{ portId: 1, portName: "UART2", serialFunction: "GPS" }]);
        });

        it("removes a function from one port when asked", async () => {
            const store = await freshStore();
            store.assign("MSP", 0);
            store.assign("MSP", 1);

            store.clear("MSP", 1);

            expect(store.portById(0).msp).toBe(true);
            expect(store.portById(1).msp).toBe(false);
        });

        it("takes MSP off USB VCP when asked", async () => {
            // Firmware refuses a config where USB VCP carries no MSP, so this write will be
            // rejected - but the store does not second-guess the user, it lets them make the
            // change and see the rejection.
            const store = await freshStore();

            const result = store.clear("MSP", 20);

            expect(store.portById(20).msp).toBe(false);
            expect(result.evicted).toEqual([{ portId: 20, portName: "USB VCP", serialFunction: "MSP" }]);
        });
    });

    describe("availableFor", () => {
        it("annotates each port with what it currently carries", async () => {
            const store = await freshStore();
            store.assign("TBS_SMARTAUDIO", 1);

            const options = store.availableFor("BLACKBOX");
            const uart2 = options.find((o) => o.portId === 1);

            expect(uart2.occupiedBy).toEqual("TBS_SMARTAUDIO");
            expect(uart2.evicts).toContainEqual({ portId: 1, portName: "UART2", serialFunction: "TBS_SMARTAUDIO" });
        });

        it("marks the port already holding the function as selected", async () => {
            const store = await freshStore();
            store.assign("GPS", 2);

            const options = store.availableFor("GPS");

            expect(options.find((o) => o.portId === 2).selected).toBe(true);
            expect(options.find((o) => o.portId === 1).selected).toBe(false);
        });

        it("disables every port for a function the build does not support", async () => {
            FC.CONFIG.buildOptions = ["USE_VTX"];
            const store = await freshStore();

            const options = store.availableFor("GPS");

            expect(options.every((o) => o.disabled && o.disabledReason === "unsupported")).toBe(true);
        });

        it("disables the remaining ports once MSP is at its limit", async () => {
            const store = await freshStore();
            store.assign("MSP", 0);
            store.assign("MSP", 1);

            const options = store.availableFor("MSP");

            expect(options.find((o) => o.portId === 2)).toMatchObject({ disabled: true, disabledReason: "maxPorts" });
            expect(options.find((o) => o.portId === 0).disabled).toBe(false);
        });
    });

    describe("writeConfig / save", () => {
        const SET_SERIAL = MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG;
        const SET_FEATURES = MSPCodes.MSP_SET_FEATURE_CONFIG;

        /** Which MSP codes were written, in order. */
        const writtenCodes = () => mspPromise.mock.calls.map((c) => c[0]);

        /** Make the serial write come back as a firmware rejection. */
        function rejectSerialWrite() {
            mspPromise.mockImplementation((code) => Promise.resolve(code === SET_SERIAL ? { unsupported: 1 } : {}));
        }

        it("writes the complete port array, never a partial one", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            await store.save();

            expect(FC.SERIAL_CONFIG.ports.map((p) => p.identifier)).toEqual([20, 0, 1, 2]);
            expect(FC.SERIAL_CONFIG.ports.find((p) => p.identifier === 1).functions).toEqual(["GPS"]);
        });

        it("round-trips an untouched load back to the same functions", async () => {
            const original = [fcPort(20, ["MSP"]), fcPort(0, ["RX_SERIAL"]), fcPort(1, ["GPS"])];
            const store = await freshStore(original);

            await store.save();

            expect(FC.SERIAL_CONFIG.ports.map((p) => p.functions)).toEqual([["MSP"], ["RX_SERIAL"], ["GPS"]]);
        });

        it("carries the raw function mask through so unnamed bits can be restored", async () => {
            const store = await freshStore([fcPort(1, ["GPS"], { functionMask: (1 << 1) | (1 << 19) })]);

            await store.save();

            expect(FC.SERIAL_CONFIG.ports[0].functionMask).toEqual((1 << 1) | (1 << 19));
        });

        it("re-emits a named function that no slot could hold", async () => {
            FC.CONFIG.apiVersion = "1.46.0";
            const store = await freshStore([fcPort(4, ["GIMBAL"])]);

            await store.save();

            expect(FC.SERIAL_CONFIG.ports[0].functions).toContain("GIMBAL");
        });

        it("sends exactly one serial write, carrying every port", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            await store.save();

            expect(writtenCodes().filter((c) => c === SET_SERIAL)).toHaveLength(1);
        });

        it("aborts before the feature write, EEPROM save and reboot when the FC rejects it", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);
            rejectSerialWrite();

            const ok = await store.save();

            expect(ok).toBe(false);
            expect(writtenCodes()).not.toContain(SET_FEATURES);
            expect(saveAndReboot).not.toHaveBeenCalled();
            expect(guiLog).toHaveBeenCalledWith("portsSaveRejected");
            expect(store.dirty).toBe(true); // still unsaved, and the user is told
        });

        it("continues the save chain when the FC accepts the write", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            const ok = await store.save();

            expect(ok).toBe(true);
            expect(writtenCodes()).toContain(SET_FEATURES);
            expect(saveAndReboot).toHaveBeenCalledTimes(1);
        });

        it("marks the store clean once the write is accepted", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            await store.save();

            expect(store.dirty).toBe(false);
        });

        it("keeps an edit made while the write is in flight dirty", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            let releaseWrite;
            mspPromise.mockImplementation(() => new Promise((resolve) => (releaseWrite = resolve)));
            const pending = store.save();
            // writeConfig imports MSPHelper dynamically, so the write is not in flight this tick.
            await vi.waitFor(() => expect(releaseWrite).toBeTypeOf("function"));

            store.assign("ESC_SENSOR", 2); // user edits before the write lands
            mspPromise.mockImplementation(() => Promise.resolve({}));
            releaseWrite({});
            await pending;

            expect(store.dirty).toBe(true);
        });

        it("derives the feature bits from the whole array", async () => {
            const store = await freshStore();
            store.assign("RX_SERIAL", 0);
            store.assign("ESC_SENSOR", 1);
            store.assign("GPS", 2);

            await store.save();

            const features = FC.FEATURE_CONFIG.features;
            expect(features.isEnabled("RX_SERIAL")).toBe(true);
            expect(features.isEnabled("ESC_SENSOR")).toBe(true);
            expect(features.isEnabled("GPS")).toBe(true);
        });

        describe("writeConfig", () => {
            it("does not reboot, so a host tab can spend one reboot on everything", async () => {
                const store = await freshStore();
                store.assign("GPS", 1);

                await store.writeConfig();

                expect(saveAndReboot).not.toHaveBeenCalled();
                expect(store.dirty).toBe(false);
            });

            it("throws on rejection so the host tab abandons its own save", async () => {
                const store = await freshStore();
                store.assign("GPS", 1);
                rejectSerialWrite();

                await expect(store.writeConfig()).rejects.toThrow(/rejected/i);
                expect(store.dirty).toBe(true);
            });
        });

        describe("one reboot for edits made across tabs", () => {
            it("applies assignments made before and after a tab switch in a single save", async () => {
                const store = await freshStore();

                // On the GPS tab.
                store.assign("GPS", 1);
                // Tab switch: the component unmounts, the store does not.
                const onAnotherTab = useSerialPortsStore();
                onAnotherTab.assign("TBS_SMARTAUDIO", 2);

                await onAnotherTab.save();

                const saved = FC.SERIAL_CONFIG.ports;
                expect(saved.find((p) => p.identifier === 1).functions).toEqual(["GPS"]);
                expect(saved.find((p) => p.identifier === 2).functions).toEqual(["TBS_SMARTAUDIO"]);
                expect(saveAndReboot).toHaveBeenCalledTimes(1);
                expect(writtenCodes().filter((c) => c === SET_SERIAL)).toHaveLength(1);
            });
        });
    });

    describe("connection lifecycle", () => {
        it("drops every port on disconnect, so the next board starts empty", async () => {
            const store = await freshStore();
            store.assign("GPS", 1);

            CONFIGURATOR.connectionValid = false;
            await Promise.resolve();

            expect(store.ports).toEqual([]);
            expect(store.loaded).toBe(false);
            expect(store.dirty).toBe(false);
        });

        it("does not reset while the connection stays valid", async () => {
            const store = await freshStore();
            CONFIGURATOR.connectionValid = true;
            await Promise.resolve();

            expect(store.loaded).toBe(true);
        });
    });
});
