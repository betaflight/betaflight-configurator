import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";

const mspPromise = vi.fn(() => Promise.resolve({}));

vi.mock("../../src/js/msp", () => ({ default: { promise: (...args) => mspPromise(...args) } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: () => [], serialPortUnknownFunctionMask: () => 0 },
    isMspRejected: (response) => Boolean(response?.unsupported || response?.crcError),
}));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot: vi.fn() }) }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/Analytics", () => ({
    tracking: { EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" }, sendSaveAndChangeEvents: vi.fn() },
}));
// The row calls useTranslation, which needs the plugin registered on an app; the labels are not
// what this file is about.
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key) => key }) }));

const { useDirtyState } = await import("../../src/composables/useDirtyState");
const { useSerialFunctionRow } = await import("../../src/composables/ports/useSerialFunctionRow");
const { useSerialPortsStore } = await import("../../src/stores/serialPorts");
const FC = (await import("../../src/js/fc")).default;
const Features = (await import("../../src/js/Features")).default;
const MSPCodes = (await import("../../src/js/msp/MSPCodes")).default;

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
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mspPromise.mockImplementation(() => Promise.resolve({}));
        FC.resetState();
        FC.CONFIG.apiVersion = "1.48.0";
        FC.CONFIG.buildOptions = [];
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);

        settings = { provider: 0 };
        store = useSerialPortsStore();
        FC.SERIAL_CONFIG.ports = [fcPort(20, ["MSP"]), fcPort(0), fcPort(1)];
        await store.loadConfig({ force: true });
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
        expect(FC.SERIAL_CONFIG.ports.find((p) => p.identifier === 1).functions).toEqual(["GPS"]);
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
