import { beforeEach, describe, expect, it } from "vitest";
import {
    opticalFlowTransportFor,
    rangefinderTransportFor,
    sensorTransportsFor,
} from "../../src/composables/ports/sensorTransport";
import { fcPort, labels, loadFcPorts, loadPortsEnv, makeRow, resetPortsEnv } from "./helpers/serialPorts";
import { describeSerialRowContract } from "./helpers/serialRowContract";

// SerialFunctionRow renders through Nuxt UI's USelect/USwitch, which the Nuxt UI vite plugin
// resolves at compile time and so cannot be stubbed in a DOM mount. The logic the Sensors tab
// depends on lives in the composable, which is driven directly here.
const { FC, NO_PORT } = await loadPortsEnv();

/** Exactly what SensorsTab.vue renders: one function, no protocol picker, no baudrate. */
const rangefinderRow = () => makeRow({ serialFunction: "LIDAR_TF" });

describe("SensorsTab serial rangefinder row", () => {
    let store;

    beforeEach(async () => {
        store = await resetPortsEnv();
    });

    // The rangefinder shares one peripherals slot per port with blackbox and the VTX protocols,
    // all of which are edited on tabs the user is not looking at while they are here.
    describeSerialRowContract({
        makeRow: rangefinderRow,
        getStore: () => store,
        serialFunction: "LIDAR_TF",
        slot: "peripheral",
        occupant: "BLACKBOX",
    });

    describe("what this tab adds", () => {
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
            await resetPortsEnv({ apiVersion: "1.46.0" });

            expect(labels(rangefinderRow().portItems.value)).toContain("UART1");
        });

        it("reports the port firmware already has the rangefinder on", async () => {
            await loadFcPorts(store, [fcPort(20, ["MSP"]), fcPort(0), fcPort(1, ["LIDAR_TF"])]);

            expect(rangefinderRow().selectedValue.value).toEqual(1);
        });

        it("leaves the sensors slot alone - GPS is not in contention", () => {
            store.assign("GPS", 1);
            const row = rangefinderRow();

            row.selectPort(1);
            row.apply();

            expect(store.portById(1).sensor).toEqual("GPS");
            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
        });
    });

    // The row sits directly under the rangefinder hardware selector, and the two are saved
    // together by saveConfig(). Neither controls the other: firmware picks the driver from
    // rangefinder_hardware and the port only says which UART it runs on.
    describe("pairing with the rangefinder hardware selector", () => {
        it("offers the rangefinder function under its neutral display name", () => {
            const rule = store.functionRules.find((r) => r.name === "LIDAR_TF");

            expect(rule.groups).toContain("peripherals");
            expect(rule.displayName).toEqual("portsFunction_LIDAR_TF");
        });

        it("keeps a port assignment that a hardware-type change does not touch", () => {
            // Changing sonar_hardware is a plain SENSOR_CONFIG edit; it must not disturb the port.
            store.assign("LIDAR_TF", 1);
            const row = rangefinderRow();

            row.apply();

            expect(store.portById(1).peripheral).toEqual("LIDAR_TF");
            expect(row.hasPendingChange.value).toBe(false);
        });

        it("lets the port be cleared independently of the hardware selector", () => {
            store.assign("LIDAR_TF", 1);
            const row = rangefinderRow();

            row.selectPort(NO_PORT);
            row.apply();

            expect(store.ports.every((p) => p.peripheral !== "LIDAR_TF")).toBe(true);
        });
    });
});

// Transport is decided by the selected hardware, not by which sensor is enabled, and both sensors
// are asked. rangefinder_lidarmt.c handles the MT family and delivers MSP2_SENSOR_RANGEFINDER_LIDARMT
// / MSP2_SENSOR_OPTICALFLOW_MT frames, so those need only MSP on their UART - no rangefinder
// function bit. rangefinder_lidartf.c / _nooploop.c / _upt1.c open FUNCTION_LIDAR. HCSR04 is
// pin-driven. Firmware adding a sensor type has to be reflected in sensorTransport.js.
describe("sensor port transport", () => {
    const transports = (rangefinder, opticalFlow) => [...sensorTransportsFor(rangefinder, opticalFlow)];

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
        expect(transports("MTF01", "MT")).toEqual(["msp"]);
    });

    it("asks for MSP for an MT optical flow sensor with no rangefinder at all", () => {
        expect(transports("NONE", "MT")).toEqual(["msp"]);
    });

    it("asks for the serial function for a UPT1 module providing both", () => {
        expect(transports("UPT1", "UPT1")).toEqual(["serial"]);
    });

    it("asks for a serial port for a TF rangefinder with no optical flow", () => {
        expect(transports("TFNOVA", "NONE")).toEqual(["serial"]);
    });

    it("asks for nothing when neither sensor is set", () => {
        expect(transports("NONE", "NONE")).toEqual([]);
    });

    it("asks for both when the two sensors somehow use different transports", () => {
        expect(transports("MTF01", "UPT1").sort()).toEqual(["msp", "serial"]);
    });
});
