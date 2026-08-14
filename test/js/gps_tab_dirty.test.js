import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";
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

const { useDirtyState } = await import("../../src/composables/useDirtyState");
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
 * The shape GpsTab composes its Save button from: its own settings snapshot ORed with the shared
 * serial store's dirty flag.
 *
 * A port assignment made on a feature tab is unsaved work on that tab. When the tab's dirty state
 * knew nothing about it, the Save button stayed disabled while the change sat in the store and
 * reappeared, unexplained, on the Ports tab.
 */
function hostTabDirtyState(store, serializeSettings) {
    const { dirty: settingsDirty, markClean, takeSnapshot } = useDirtyState(serializeSettings);
    return {
        dirty: computed(() => settingsDirty.value || store.dirty),
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
        const { dirty, markClean } = hostTabDirtyState(store, serialize);
        markClean();

        expect(dirty.value).toBe(false);
    });

    it("goes dirty when a port is assigned, so Save is reachable", () => {
        const { dirty, markClean } = hostTabDirtyState(store, serialize);
        markClean();

        store.assign("GPS", 1);

        expect(dirty.value).toBe(true);
    });

    it("goes dirty when MSP is toggled on the chosen port", () => {
        const { dirty, markClean } = hostTabDirtyState(store, serialize);
        markClean();

        store.portById(1).msp = true;

        expect(dirty.value).toBe(true);
    });

    it("goes dirty for the tab's own settings too", () => {
        const { dirty, markClean } = hostTabDirtyState(store, serialize);
        markClean();

        settings.provider = 2;

        expect(dirty.value).toBe(true);
    });

    it("goes clean again once both the settings and the ports are saved", async () => {
        const { dirty, markClean, takeSnapshot } = hostTabDirtyState(store, serialize);
        markClean();

        settings.provider = 2;
        store.assign("GPS", 1);
        expect(dirty.value).toBe(true);

        // What GpsTab.saveConfig does: snapshot, write the serial config, then mark clean.
        const snapshot = takeSnapshot();
        await store.writeConfig();
        markClean(snapshot);

        expect(dirty.value).toBe(false);
    });

    it("stays dirty when only the serial write happened and settings still differ", async () => {
        const { dirty, markClean } = hostTabDirtyState(store, serialize);
        markClean();

        store.assign("GPS", 1);
        await store.writeConfig();

        expect(store.dirty).toBe(false);
        settings.provider = 2;
        expect(dirty.value).toBe(true);
    });

    it("stays dirty when the FC rejects the serial write", async () => {
        const { dirty, markClean } = hostTabDirtyState(store, serialize);
        markClean();

        store.assign("GPS", 1);
        mspPromise.mockImplementation((code) =>
            Promise.resolve(code === MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG ? { unsupported: 1 } : {}),
        );

        await expect(store.writeConfig()).rejects.toThrow();

        expect(dirty.value).toBe(true);
    });
});
