import { beforeEach, describe, expect, it } from "vitest";
import { fcPort, loadFcPorts, loadPortsEnv, makeRow, resetPortsEnv } from "./helpers/serialPorts";
import { describeSerialRowContract } from "./helpers/serialRowContract";

// MotorsTab renders the row through Nuxt UI's USelect, which the Nuxt UI vite plugin resolves at
// compile time and so cannot be stubbed in a DOM mount. The behaviour the tab depends on lives in
// the composable, so that is what is driven here.
const { FC, NO_PORT } = await loadPortsEnv();

/** The row exactly as MotorsTab.vue mounts it: one function, no protocol picker, no baudrate. */
const escSensorRow = () => makeRow({ serialFunction: "ESC_SENSOR" });

describe("MotorsTab ESC_SENSOR serial row", () => {
    let store;

    beforeEach(async () => {
        store = await resetPortsEnv();
    });

    // ESC_SENSOR and GPS share the one sensors slot on a port, and GPS is edited on a tab the user
    // is not looking at while they are here.
    describeSerialRowContract({
        makeRow: escSensorRow,
        getStore: () => store,
        serialFunction: "ESC_SENSOR",
        slot: "sensor",
        occupant: "GPS",
    });

    describe("what this tab adds", () => {
        it("is a single-function row with no protocol picker", () => {
            const { hasGroup, activeFunction } = escSensorRow();

            expect(hasGroup.value).toBe(false);
            expect(activeFunction.value).toEqual("ESC_SENSOR");
        });

        // ESC telemetry has no per-port baudrate of its own, so MotorsTab passes no baudField.
        it("has no baudrate field", () => {
            const { hasBaudField, baudItems } = escSensorRow();

            expect(hasBaudField.value).toBe(false);
            expect(baudItems.value).toEqual([]);
        });

        it("reports the port firmware already has ESC_SENSOR on", async () => {
            await loadFcPorts(store, [fcPort(20, ["MSP"]), fcPort(0), fcPort(1, ["ESC_SENSOR"])]);

            expect(escSensorRow().selectedValue.value).toEqual(1);
        });

        it("does not warn about MSP, which ESC telemetry can share a port with", () => {
            store.assign("MSP", 1);
            const row = escSensorRow();

            row.selectPort(1);

            expect(row.evictions.value).toEqual([]);
            expect(store.portById(1).msp).toBe(true);
        });
    });

    // This row is MotorsTab's only ESC_SENSOR control - there is no feature switch beside it,
    // because writeConfig() derives the feature bit from the port array and would turn one back
    // off on the next save.
    describe("the feature bit the port assignment implies", () => {
        it("is off while no port carries ESC telemetry", () => {
            expect(store.ports.some((p) => store.portUses(p, "ESC_SENSOR"))).toBe(false);
        });

        it("is on once a port carries it, which is what MotorsTab gates its row on", () => {
            const row = escSensorRow();
            row.selectPort(1);
            row.apply();

            // showEscSensorPort keeps the row visible on an analog protocol whenever this is true,
            // so an assignment can never be stranded with no way to clear it.
            expect(store.ports.some((p) => store.portUses(p, "ESC_SENSOR"))).toBe(true);
        });

        // MotorsTab shows the motor pole count for a port picked here rather than waiting on the
        // feature bit, which only agrees after the save's reboot. That reads selectedValue off the
        // row, so it has to carry the pending pick while the store still has nothing.
        it("names the pending port before apply, while no port carries the function yet", () => {
            const row = escSensorRow();

            row.selectPort(1);

            expect(row.selectedValue.value).toEqual(1);
            expect(store.ports.some((p) => store.portUses(p, "ESC_SENSOR"))).toBe(false);
        });

        it("stays selectable whatever the build reports, since the rule has no build dependency", () => {
            // Unlike GPS or the VTX protocols, ESC_SENSOR carries no dependsOn in usePortsRules,
            // so a cloud build advertising an unrelated option set must not disable the row.
            FC.CONFIG.buildOptions = ["USE_VTX"];
            const { portItems } = escSensorRow();

            expect(portItems.value.slice(1).some((i) => i.disabled)).toBe(false);
            expect(portItems.value[0].value).toEqual(NO_PORT);
        });
    });
});
