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
// SerialFunctionRow renders through Nuxt UI's USelect/USwitch, which the Nuxt UI vite plugin
// resolves at compile time and so cannot be stubbed in a DOM mount. The logic the Sensors tab
// depends on lives in the composable, which is driven directly here.
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

/** Props reactive, so the row behaves the way it does inside the component. */
const row = (props) => useSerialFunctionRow(reactive({ baudField: null, ...props }));

/** Exactly what SensorsTab.vue renders: one function, no protocol picker, no baudrate. */
const rangefinderRow = () => row({ serialFunction: "LIDAR_TF" });

const labels = (items) => items.map((i) => i.label);

describe("SensorsTab serial rangefinder row", () => {
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

    describe("what the row offers", () => {
        it("offers every real port plus an unassigned option, but never USB VCP", () => {
            const { portItems } = rangefinderRow();

            expect(labels(portItems.value)).toEqual(["serialPortNone", "UART1", "UART2", "UART3"]);
        });

        it("has no protocol picker - the driver comes from rangefinder_hardware, not the port", () => {
            const { hasGroup, activeFunction } = rangefinderRow();

            expect(hasGroup.value).toBe(false);
            expect(activeFunction.value).toEqual("LIDAR_TF");
        });

        it("has no baudrate field", () => {
            const { hasBaudField, baudItems } = rangefinderRow();

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        // The rule carries no dependsOn, so unlike GPS the row must stay usable on a cloud build
        // that reports build options not including a rangefinder key.
        it("stays enabled whatever build options firmware reports", () => {
            FC.CONFIG.buildOptions = ["USE_VTX"];
            const { portItems } = rangefinderRow();

            expect(portItems.value.slice(1).some((i) => i.disabled)).toBe(false);
        });

        it("would still work on 4.5-era firmware, though the tab does not render it there", async () => {
            // Bit 15 exists on 4.5, so the row itself is happy. SensorsTab gates it on
            // showRangefinder, which setupPeripherals only sets under isApi147 - so on 1.46 the
            // rangefinder hardware selector and this row are both hidden and the Ports tab is the
            // only way in. Asserted at the composable level so the name does not overclaim.
            FC.CONFIG.apiVersion = "1.46.0";
            await store.loadConfig({ force: true });

            expect(labels(rangefinderRow().portItems.value)).toContain("UART1");
        });

        it("reports the port firmware already has the rangefinder on", async () => {
            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0), fcPort(1, ["LIDAR_TF"])];
            await store.loadConfig({ force: true });

            expect(rangefinderRow().selectedValue.value).toEqual(1);
        });

        it("reports no selection when no port carries it", () => {
            expect(rangefinderRow().selectedValue.value).toEqual(NO_PORT);
        });

        it("is disabled until the store has loaded", () => {
            setActivePinia(createPinia());

            expect(rangefinderRow().loaded.value).toBe(false);
        });
    });

    // The point of the design: a control on a feature tab must not change shared state until the
    // user saves, or an assignment made here turns up on the Ports tab having never been saved.
    describe("edits are held locally until apply", () => {
        it("leaves the shared store untouched when a port is picked", () => {
            const r = rangefinderRow();

            r.selectPort(1);

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.dirty).toBe(false);
        });

        it("shows the pending choice, so the tab's Save button can light up", () => {
            const r = rangefinderRow();

            r.selectPort(1);

            expect(r.selectedValue.value).toEqual(1);
            expect(r.hasPendingChange.value).toBe(true);
        });

        it("assigns to the peripherals slot only once applied", () => {
            const r = rangefinderRow();
            r.selectPort(1);

            r.apply();

            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
            expect(store.dirty).toBe(true);
            expect(r.hasPendingChange.value).toBe(false);
        });

        it("clears a stale assignment only once applied", () => {
            store.assign("LIDAR_TF", 1);
            const r = rangefinderRow();

            r.selectPort(NO_PORT);
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");

            r.apply();
            expect(store.portById(1).peripheral).toEqual("");
        });

        it("moves the assignment rather than duplicating it", () => {
            store.assign("LIDAR_TF", 1);
            const r = rangefinderRow();

            r.selectPort(2);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.portById(2).peripheral).toEqual("LIDAR_TF");
        });

        it("reports no pending change when the saved port is re-picked", () => {
            store.assign("LIDAR_TF", 1);
            const r = rangefinderRow();

            r.selectPort(1);

            expect(r.hasPendingChange.value).toBe(false);
        });

        it("changes nothing when the tab saves with nothing pending", () => {
            const r = rangefinderRow();

            r.apply();

            expect(store.dirty).toBe(false);
        });

        it("drops the pending edit on reset, the way an unmount drops the component", () => {
            const r = rangefinderRow();
            r.selectPort(1);

            r.reset();

            expect(r.hasPendingChange.value).toBe(false);
            expect(r.selectedValue.value).toEqual(NO_PORT);
            expect(store.portById(1).peripheral).toEqual("");
        });

        it("follows the store when the tab reloads under it", async () => {
            const r = rangefinderRow();
            expect(r.selectedValue.value).toEqual(NO_PORT);

            FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0, ["LIDAR_TF"])];
            await store.loadConfig({ force: true });

            expect(r.selectedValue.value).toEqual(0);
        });
    });

    // C1: the rangefinder shares one peripherals slot per port with blackbox and the VTX
    // protocols, all of which are edited on tabs the user is not looking at (C4).
    describe("contention with the rest of the peripherals slot", () => {
        it("annotates a port with the peripheral already on it", () => {
            store.assign("BLACKBOX", 1);

            const uart2 = rangefinderRow().portItems.value.find((i) => i.value === 1);
            expect(uart2.label).toEqual("serialPortOccupiedBy(port=UART2,serialFunction=portsFunction_BLACKBOX)");
        });

        it("previews evicting blackbox without displacing it", () => {
            store.assign("BLACKBOX", 1);
            const r = rangefinderRow();

            r.selectPort(1);

            expect(r.evictions.value).toEqual([{ portId: 1, portName: "UART2", serialFunction: "BLACKBOX" }]);
            expect(store.portById(1).peripheral).toEqual("BLACKBOX");
        });

        it("displaces blackbox only when the tab saves", () => {
            store.assign("BLACKBOX", 1);
            const r = rangefinderRow();

            r.selectPort(1);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });

        it("previews evicting a VTX protocol on the same slot", () => {
            store.assign("TBS_SMARTAUDIO", 2);
            const r = rangefinderRow();

            r.selectPort(2);

            expect(r.evictions.value).toEqual([{ portId: 2, portName: "UART3", serialFunction: "TBS_SMARTAUDIO" }]);
        });

        it("does not warn about itself when moved to a free port", () => {
            store.assign("LIDAR_TF", 1);
            const r = rangefinderRow();

            r.selectPort(2);

            expect(r.evictions.value).toEqual([]);
        });

        it("leaves the sensors slot alone - GPS is not in contention", () => {
            store.assign("GPS", 1);
            const r = rangefinderRow();

            r.selectPort(1);
            r.apply();

            expect(store.portById(1).sensor).toEqual("GPS");
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });
    });

    // The row sits directly under the rangefinder hardware selector, and the two are saved
    // together by saveConfig(). Neither controls the other: firmware picks the driver from
    // rangefinder_hardware and the port only says which UART it runs on.
    describe("pairing with the rangefinder hardware selector", () => {
        it("offers the rangefinder function under its neutral display name", () => {
            const { functionRules } = store;

            const rule = functionRules.find((r) => r.name === "LIDAR_TF");
            expect(rule.groups).toContain("peripherals");
            expect(rule.displayName).toEqual("portsFunction_LIDAR_TF");
        });

        it("keeps a port assignment that a hardware-type change does not touch", () => {
            // Changing sonar_hardware is a plain SENSOR_CONFIG edit; it must not disturb the port.
            store.assign("LIDAR_TF", 1);
            const r = rangefinderRow();

            r.apply();

            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
            expect(r.hasPendingChange.value).toBe(false);
        });

        it("lets the port be cleared independently of the hardware selector", () => {
            store.assign("LIDAR_TF", 1);
            const r = rangefinderRow();

            r.selectPort(NO_PORT);
            r.apply();

            expect(store.portById(1).peripheral).toEqual("");
            expect(store.ports.every((p) => p.peripheral !== "LIDAR_TF")).toBe(true);
        });
    });

    describe("MSP on the chosen port", () => {
        it("is unavailable until a port is chosen", () => {
            expect(rangefinderRow().mspDisabled.value).toBe(true);
        });

        it("holds an MSP change until applied", () => {
            const r = rangefinderRow();
            r.selectPort(1);

            r.setMsp(true);

            expect(store.portById(1).msp).toBe(false);
            expect(r.hasPendingChange.value).toBe(true);

            r.apply();
            expect(store.portById(1).msp).toBe(true);
        });
    });

    // Reka UI throws "A <SelectItem /> must have a value prop that is not an empty string".
    it("never offers a select item with an empty value", () => {
        const r = rangefinderRow();
        r.selectPort(1);

        for (const list of [r.portItems, r.baudItems, r.mspBaudItems, r.functionItems]) {
            for (const item of list.value) {
                expect(item.value, JSON.stringify(item)).not.toEqual("");
            }
        }
    });
});

// Transport is decided by the selected hardware, not by which sensor is enabled, and both sensors
// are asked. rangefinder_lidarmt.c handles the MT family and delivers MSP2_SENSOR_RANGEFINDER_LIDARMT
// / MSP2_SENSOR_OPTICALFLOW_MT frames, so those need only MSP on their UART - no rangefinder
// function bit. rangefinder_lidartf.c / _nooploop.c / _upt1.c open FUNCTION_LIDAR. HCSR04 is
// pin-driven. Mirrors SensorsTab's sensorTransports; firmware adding a type needs both updated.
describe("sensor port transport", () => {
    const rangefinderTransportFor = (name) => {
        if (!name || name === "NONE" || name === "HCSR04") {
            return "none";
        }
        return /^MTF/.test(name) ? "msp" : "serial";
    };
    const opticalFlowTransportFor = (name) => {
        if (!name || name === "NONE") {
            return "none";
        }
        return name === "MT" ? "msp" : "serial";
    };
    const transports = (rangefinder, opticalFlow) =>
        new Set(
            [rangefinderTransportFor(rangefinder), opticalFlowTransportFor(opticalFlow)].filter((t) => t !== "none"),
        );

    it("routes the MT rangefinder family over MSP", () => {
        for (const name of ["MTF01", "MTF02", "MTF01P", "MTF02P"]) {
            expect(rangefinderTransportFor(name), name).toEqual("msp");
        }
    });

    it("routes TF, Nooploop and UPT1 over the serial rangefinder function", () => {
        for (const name of ["TFMINI", "TF02", "TFNOVA", "NOOPLOOP_F2", "NOOPLOOP_F2MINI", "UPT1"]) {
            expect(rangefinderTransportFor(name), name).toEqual("serial");
        }
    });

    it("needs no port for a pin-driven or absent rangefinder", () => {
        for (const name of ["NONE", "HCSR04", ""]) {
            expect(rangefinderTransportFor(name), name || "(empty)").toEqual("none");
        }
    });

    it("routes MT optical flow over MSP and UPT1 over the serial function", () => {
        expect(opticalFlowTransportFor("MT")).toEqual("msp");
        expect(opticalFlowTransportFor("UPT1")).toEqual("serial");
        expect(opticalFlowTransportFor("NONE")).toEqual("none");
    });

    // The reported case: an MT module providing both sensors wants MSP on its UART, nothing else.
    it("asks only for MSP when an MT module provides both sensors", () => {
        expect([...transports("MTF01", "MT")]).toEqual(["msp"]);
    });

    it("asks for MSP for an MT optical flow sensor with no rangefinder at all", () => {
        expect([...transports("NONE", "MT")]).toEqual(["msp"]);
    });

    it("asks for the serial function for a UPT1 module providing both", () => {
        expect([...transports("UPT1", "UPT1")]).toEqual(["serial"]);
    });

    it("asks for a serial port for a TF rangefinder with no optical flow", () => {
        expect([...transports("TFNOVA", "NONE")]).toEqual(["serial"]);
    });

    it("asks for nothing when neither sensor is set", () => {
        expect([...transports("NONE", "NONE")]).toEqual([]);
    });

    it("asks for both when the two sensors somehow use different transports", () => {
        expect([...transports("MTF01", "UPT1")].sort()).toEqual(["msp", "serial"]);
    });
});
