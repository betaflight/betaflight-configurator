import { beforeEach, describe, expect, it } from "vitest";
import { fcPort, labels, loadFcPorts, loadPortsEnv, makeRow, resetPortsEnv } from "./helpers/serialPorts";
import { describeSerialRowContract } from "./helpers/serialRowContract";

// OnboardLoggingTab renders the row through Nuxt UI's USelect, which the Nuxt UI vite plugin
// resolves at compile time and so cannot be stubbed in a DOM mount. The behaviour the tab depends
// on lives in the composable, which is what these exercise.
await loadPortsEnv();

/** The row exactly as OnboardLoggingTab.vue mounts it. */
const blackboxRow = () => makeRow({ serialFunction: "BLACKBOX", baudField: "blackbox_baudrate" });

describe("OnboardLogging blackbox serial row", () => {
    let store;

    beforeEach(async () => {
        store = await resetPortsEnv();
    });

    // Blackbox shares the peripherals slot with the VTX protocols and the serial rangefinder, both
    // of which are edited on tabs the user is not looking at while they are here.
    describeSerialRowContract({
        makeRow: blackboxRow,
        getStore: () => store,
        serialFunction: "BLACKBOX",
        slot: "peripheral",
        occupant: "LIDAR_TF",
    });

    describe("what this tab adds", () => {
        it("still lists USB VCP when firmware already put blackbox there", async () => {
            // An OpenLager is wired to a UART, so the list never offers USB VCP - but a config that
            // already logs over it has to stay visible and clearable.
            await loadFcPorts(store, [fcPort(20, ["MSP", "BLACKBOX"]), fcPort(0)]);

            const { portItems, selectedValue } = blackboxRow();

            expect(portItems.value.some((i) => i.value === 20)).toBe(true);
            expect(selectedValue.value).toEqual(20);
        });

        it("previews displacing telemetry, which cannot share the port", () => {
            store.assign("TELEMETRY_MAVLINK", 1);
            const row = blackboxRow();

            row.selectPort(1);

            expect(row.evictions.value).toContainEqual({
                portId: 1,
                portName: "UART2",
                serialFunction: "TELEMETRY_MAVLINK",
            });
        });
    });

    // The acceptance item for this tab: the row carries blackbox_baudrate, not some other list.
    describe("blackbox baudrate", () => {
        it("is present, and offers the blackbox list rather than the GPS one", () => {
            const { hasBaudField, baudItems } = blackboxRow();

            expect(hasBaudField.value).toBe(true);
            expect(labels(baudItems.value)).toContain("AUTO");
            expect(labels(baudItems.value)).toContain("2470000"); // blackbox-only rate
        });

        it("reads the chosen port's value", () => {
            const row = blackboxRow();
            row.selectPort(0);

            expect(row.baudrate.value).toEqual("115200");
        });

        it("holds a change until applied, then writes blackbox_baudrate", () => {
            const row = blackboxRow();
            row.selectPort(0);

            row.setBaudrate("2000000");

            expect(row.baudrate.value).toEqual("2000000");
            expect(store.portById(0).blackbox_baudrate).toEqual("115200");

            row.apply();
            expect(store.portById(0).blackbox_baudrate).toEqual("2000000");
            expect(store.portById(0).gps_baudrate).toEqual("57600"); // untouched
        });

        it("counts as a pending change on its own, so the Save button enables", () => {
            store.assign("BLACKBOX", 0);
            const row = blackboxRow();

            row.setBaudrate("2000000");

            expect(row.hasPendingChange.value).toBe(true);
        });

        it("is empty while blackbox has no port", () => {
            expect(blackboxRow().baudrate.value).toEqual("");
        });
    });
});
