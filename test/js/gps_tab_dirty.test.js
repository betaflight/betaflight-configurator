import { beforeEach, describe, expect, it } from "vitest";
import { computed, reactive } from "vue";
import { fcPort, loadPortsEnv, mspPromise, resetPortsEnv, savedFunctions } from "./helpers/serialPorts";

const { useSerialFunctionRow, MSPCodes } = await loadPortsEnv();
const { useDirtyState } = await import("../../src/composables/useDirtyState");

/**
 * The shape GpsTab composes its Save button from: its own settings snapshot ORed with the serial
 * row's pending edit.
 *
 * A port assignment made on a feature tab is unsaved work on that tab, so the tab's Save must be
 * reachable - but it must also stay out of shared state until that Save runs, or it turns up on
 * the Ports tab having never been saved.
 */
function hostTab(serializeSettings) {
    const { dirty: settingsDirty, markClean, takeSnapshot } = useDirtyState(serializeSettings);
    const row = useSerialFunctionRow(reactive({ serialFunction: "GPS", baudField: "gps_baudrate" }));
    return {
        row,
        dirty: computed(() => settingsDirty.value || row.hasPendingChange.value),
        markClean,
        takeSnapshot,
    };
}

describe("a feature tab hosting a serial row", () => {
    let store;
    let settings;

    beforeEach(async () => {
        settings = { provider: 0 };
        store = await resetPortsEnv({ fcPorts: [fcPort(20, ["MSP"]), fcPort(0), fcPort(1)] });
    });

    const serialize = () => JSON.stringify(settings);

    it("starts clean", () => {
        const { dirty, markClean } = hostTab(serialize);
        markClean();

        expect(dirty.value).toBe(false);
    });

    it("goes dirty when a port is picked, so Save is reachable", () => {
        const { row, dirty, markClean } = hostTab(serialize);
        markClean();

        row.selectPort(1);

        expect(dirty.value).toBe(true);
    });

    it("keeps the pending port out of shared state until saved", () => {
        const { row, markClean } = hostTab(serialize);
        markClean();

        row.selectPort(1);

        expect(store.portById(1).sensor).toEqual("");
        expect(store.dirty).toBe(false);
    });

    it("goes dirty when MSP is toggled on the chosen port", () => {
        const { row, dirty, markClean } = hostTab(serialize);
        markClean();

        row.selectPort(1);
        row.setMsp(true);

        expect(dirty.value).toBe(true);
        expect(store.portById(1).msp).toBe(false);
    });

    it("goes dirty for the tab's own settings too", () => {
        const { dirty, markClean } = hostTab(serialize);
        markClean();

        settings.provider = 2;

        expect(dirty.value).toBe(true);
    });

    it("applies the port and the settings in one save, then goes clean", async () => {
        const { row, dirty, markClean, takeSnapshot } = hostTab(serialize);
        markClean();

        settings.provider = 2;
        row.selectPort(1);
        expect(dirty.value).toBe(true);

        // What GpsTab.saveConfig does: snapshot, apply the row, write, mark clean.
        const snapshot = takeSnapshot();
        row.apply();
        await store.writeConfig();
        markClean(snapshot);

        expect(dirty.value).toBe(false);
        expect(savedFunctions(1)).toEqual(["GPS"]);
    });

    it("leaves nothing behind when the tab goes away unsaved", () => {
        const { row, dirty, markClean } = hostTab(serialize);
        markClean();

        row.selectPort(1);
        // Unmount drops the component and its pending edit with it.
        row.reset();

        expect(dirty.value).toBe(false);
        expect(store.dirty).toBe(false);
        expect(store.portById(1).sensor).toEqual("");
    });

    it("stays dirty when the FC rejects the serial write", async () => {
        const { row, dirty, markClean } = hostTab(serialize);
        markClean();

        row.selectPort(1);
        row.apply();
        mspPromise.mockImplementation((code) =>
            Promise.resolve(code === MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG ? { unsupported: 1 } : {}),
        );

        await expect(store.writeConfig()).rejects.toThrow();

        expect(store.dirty).toBe(true);
        settings.provider = 2;
        expect(dirty.value).toBe(true);
    });
});
