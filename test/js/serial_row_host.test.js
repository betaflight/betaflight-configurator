import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { loadPortsEnv, makeRow, mspPromise, resetPortsEnv, savedFunctions } from "./helpers/serialPorts";

// What the six feature tabs used to spell out for themselves. The invariants here are the ones
// that are invisible until a user loses an edit, so they are asserted rather than commented.
const { useSerialRowHost, useSerialPortsStore, MSPCodes, NO_PORT } = await loadPortsEnv();

/** A host tab with one GPS row, as GpsTab mounts it. */
function host(...rows) {
    const refs = rows.map((row) => ref(row));
    return { refs, ...useSerialRowHost(refs) };
}

const gpsRow = () => makeRow({ serialFunction: "GPS", baudField: "gps_baudrate" });
const blackboxRow = () => makeRow({ serialFunction: "BLACKBOX" });

/** Make the serial write come back as a firmware rejection. */
const rejectSerialWrite = () =>
    mspPromise.mockImplementation((code) =>
        Promise.resolve(code === MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG ? { unsupported: 1 } : {}),
    );

const serialWrites = () => mspPromise.mock.calls.filter((c) => c[0] === MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG).length;

describe("useSerialRowHost", () => {
    let store;

    beforeEach(async () => {
        store = await resetPortsEnv();
    });

    describe("what the tab's Save button reads", () => {
        it("is clean before a row is mounted", () => {
            expect(host().serialRowsPending.value).toBe(false);
        });

        it("is clean while the row is untouched", () => {
            expect(host(gpsRow()).serialRowsPending.value).toBe(false);
        });

        it("goes dirty on the row's edit", () => {
            const row = gpsRow();
            const { serialRowsPending } = host(row);

            row.selectPort(1);

            expect(serialRowsPending.value).toBe(true);
        });

        it("goes dirty when any one of several rows is edited", () => {
            const rx = gpsRow();
            const telemetry = makeRow({ group: "telemetry" });
            const { serialRowsPending } = host(rx, telemetry);

            telemetry.selectFunction("TELEMETRY_MAVLINK");

            expect(serialRowsPending.value).toBe(true);
        });

        // Applying moves the edit from the row into the store, which is not the same as saving it.
        it("stays dirty between applying the edit and the write landing", () => {
            const row = gpsRow();
            const { serialRowsPending, applySerialRows } = host(row);
            row.selectPort(1);

            applySerialRows();

            expect(serialRowsPending.value).toBe(true);
        });

        it("goes clean once the write lands", async () => {
            const row = gpsRow();
            const { serialRowsPending, saveSerialRows } = host(row);
            row.selectPort(1);

            await saveSerialRows();

            expect(serialRowsPending.value).toBe(false);
        });
    });

    // The bug this exists to prevent: apply() clears the pending flag, so a save that reads it
    // afterwards decides it has nothing to write and the user's port assignment is dropped.
    describe("applySerialRows reports what it applied", () => {
        it("returns true for an edit, having pushed it into the shared store", () => {
            const row = gpsRow();
            const { applySerialRows } = host(row);
            row.selectPort(1);
            expect(store.portById(1).sensor).toEqual(""); // nothing shared until now

            expect(applySerialRows()).toBe(true);
            expect(store.portById(1).sensor).toEqual("GPS");
        });

        it("returns false when no row was touched, and changes nothing", () => {
            const { applySerialRows } = host(gpsRow());

            expect(applySerialRows()).toBe(false);
            expect(store.dirty).toBe(false);
        });

        it("applies every row it hosts", () => {
            const gps = gpsRow();
            const blackbox = blackboxRow();
            const { applySerialRows } = host(gps, blackbox);

            gps.selectPort(1);
            blackbox.selectPort(2);
            applySerialRows();

            expect(store.portById(1).sensor).toEqual("GPS");
            expect(store.portById(2).peripheral).toEqual("BLACKBOX");
        });
    });

    describe("saveSerialRows", () => {
        it("writes the port array once, however many rows were edited", async () => {
            const gps = gpsRow();
            const blackbox = blackboxRow();
            const { saveSerialRows } = host(gps, blackbox);
            gps.selectPort(1);
            blackbox.selectPort(2);

            expect(await saveSerialRows()).toBe(true);

            expect(serialWrites()).toEqual(1);
            expect(savedFunctions(1)).toContain("GPS");
            expect(savedFunctions(2)).toContain("BLACKBOX");
            expect(store.dirty).toBe(false);
        });

        // An untouched tab must not spend a serial write - and on the tabs that reboot only when
        // the serial config changed, must not spend a reboot either.
        it("writes nothing when no row was touched", async () => {
            const { saveSerialRows } = host(gpsRow());

            expect(await saveSerialRows()).toBe(false);

            expect(serialWrites()).toEqual(0);
        });

        it("writes a cleared port too, so removing an assignment is a change like any other", async () => {
            store.assign("GPS", 1);
            const row = gpsRow();
            const { saveSerialRows } = host(row);

            row.selectPort(NO_PORT);

            expect(await saveSerialRows()).toBe(true);
            expect(savedFunctions(1)).not.toContain("GPS");
        });

        // The host tab abandons its own save on this, rather than persisting settings against a
        // serial config the FC refused.
        it("throws the FC's rejection through to the host tab", async () => {
            const row = gpsRow();
            const { saveSerialRows } = host(row);
            row.selectPort(1);
            rejectSerialWrite();

            await expect(saveSerialRows()).rejects.toThrow(/rejected/i);
            expect(store.dirty).toBe(true);
        });
    });

    // Reported on the PR: apply() has already emptied the row by the time the FC refuses the
    // write, so a host that only asked its rows would show a clean tab with a disabled Save over
    // an edit that never reached the board.
    describe("a write the FC rejected", () => {
        it("leaves the tab dirty, so Save stays reachable", async () => {
            const row = gpsRow();
            const { serialRowsPending, saveSerialRows } = host(row);
            row.selectPort(1);
            rejectSerialWrite();

            await expect(saveSerialRows()).rejects.toThrow();

            expect(row.hasPendingChange.value).toBe(false); // the row itself is empty...
            expect(serialRowsPending.value).toBe(true); // ...but the tab still owes a write
        });

        it("is retried by the next Save, with no further edit needed", async () => {
            const row = gpsRow();
            const { serialRowsPending, saveSerialRows } = host(row);
            row.selectPort(1);
            rejectSerialWrite();
            await expect(saveSerialRows()).rejects.toThrow();

            mspPromise.mockImplementation(() => Promise.resolve({}));
            expect(await saveSerialRows()).toBe(true);

            expect(savedFunctions(1)).toContain("GPS");
            expect(serialRowsPending.value).toBe(false);
            expect(store.dirty).toBe(false);
        });

        it("does not make an untouched tab owe a write", async () => {
            const { serialRowsPending, saveSerialRows } = host(gpsRow());
            rejectSerialWrite();

            expect(await saveSerialRows()).toBe(false);

            expect(serialRowsPending.value).toBe(false);
        });
    });

    describe("resetSerialRows", () => {
        it("drops every pending edit without touching the store", () => {
            const gps = gpsRow();
            const blackbox = blackboxRow();
            const { serialRowsPending, resetSerialRows } = host(gps, blackbox);
            gps.selectPort(1);
            blackbox.selectPort(2);

            resetSerialRows();

            expect(serialRowsPending.value).toBe(false);
            expect(store.dirty).toBe(false);
            expect(store.portById(1).sensor).toEqual("");
        });
    });

    // Firmware retired the function mask as a write path in API 1.49 (betaflight#15573): each
    // feature owns its port on its own parameter group there, and useFeaturePort writes it over
    // the CLI. These rows write the mask, so from 1.49 they are not the control - the host reads
    // this to drop its own heading or box along with them.
    describe("which firmware these rows are for", () => {
        it("is the control below API 1.49", async () => {
            await resetPortsEnv({ apiVersion: "1.48.0" });

            expect(host(gpsRow()).serialRowsAvailable.value).toBe(true);
        });

        it("stands aside from 1.49, where the mask is a read-only view", async () => {
            await resetPortsEnv({ apiVersion: "1.49.0" });

            expect(host(gpsRow()).serialRowsAvailable.value).toBe(false);
        });
    });

    describe("loadSerialPorts", () => {
        it("refetches a clean store, so a fresh tab mount sees what the FC has", async () => {
            const { loadSerialPorts } = host();

            await loadSerialPorts();

            expect(mspPromise).toHaveBeenCalledWith(MSPCodes.MSP2_COMMON_SERIAL_CONFIG);
        });

        it("leaves an edit made on another tab alone", async () => {
            // The store outlives the component, so an unsaved Ports-tab edit is still in it.
            useSerialPortsStore().assign("GPS", 1);
            const { loadSerialPorts } = host();

            await loadSerialPorts();

            expect(store.portById(1).sensor).toEqual("GPS");
        });

        it("discards it when the user explicitly asks for a refresh", async () => {
            useSerialPortsStore().assign("GPS", 1);
            const { loadSerialPorts } = host();

            await loadSerialPorts({ force: true });

            expect(store.portById(1).sensor).toEqual("");
            expect(store.dirty).toBe(false);
        });
    });
});
