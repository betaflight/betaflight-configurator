import { expect, vi } from "vitest";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";

/**
 * The shared environment every serial-port test needs.
 *
 * The port store, the row composable and the tabs that host it all pull in MSP, the reboot
 * composable, gui_log and i18n, none of which a unit test wants for real. Registering those mocks
 * once here keeps the individual files about what they actually assert, and keeps the six test
 * files from drifting apart on what a mocked FC does.
 *
 * The mocks are registered with vi.doMock rather than vi.mock: they are not hoisted, so every
 * consumer has to reach the modules under test through loadPortsEnv() below (which imports them
 * dynamically, after this file has run) rather than a static import.
 */

export const mspPromise = vi.fn(() => Promise.resolve({}));
export const saveAndReboot = vi.fn(() => Promise.resolve());
export const guiLog = vi.fn();

vi.doMock("../../../src/js/msp", () => ({ default: { promise: (...args) => mspPromise(...args) } }));

// Only crunch() is stubbed. The store reads the serial bit layout through serialPortFunctions.js
// and the rejection check through mspErrors.js, both imported directly - stubbing same-named
// members on mspHelper would do nothing, and the real implementations are what these tests want
// exercised anyway.
vi.doMock("../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: () => [] } }));

vi.doMock("../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
vi.doMock("../../../src/js/gui_log", () => ({ gui_log: (...args) => guiLog(...args) }));
vi.doMock("../../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.doMock("../../../src/js/Analytics", () => ({
    tracking: { EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" }, sendSaveAndChangeEvents: vi.fn() },
}));

// The row renders through Nuxt UI's USelect, which the Nuxt UI vite plugin resolves at compile
// time and so cannot be stubbed in a DOM mount; the logic under test lives in the composable
// instead. Only i18next-vue needs standing in for, and a plain interpolation keeps assertions
// readable.
vi.doMock("i18next-vue", () => ({
    useTranslation: () => ({
        t: (key, params) =>
            params
                ? `${key}(${Object.entries(params)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(",")})`
                : key,
    }),
}));

/** An FC-shaped port, as MSPHelper leaves it in FC.SERIAL_CONFIG.ports. */
export function fcPort(identifier, functions = [], extra = {}) {
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

/** USB VCP plus three UARTs, which is what most of these tests want to start from. */
export const defaultFcPorts = () => [fcPort(20, ["MSP"]), fcPort(0), fcPort(1), fcPort(2)];

/** The labels the default port list produces, unassigned option first. */
export const DEFAULT_PORT_LABELS = ["serialPortNone", "UART1", "UART2", "UART3"];

let env;

/**
 * The modules under test, imported after the mocks above are in place.
 *
 * Cached, so a test file and the contract suite it uses share one module graph and therefore one
 * NO_PORT sentinel and one store definition.
 */
export async function loadPortsEnv() {
    if (!env) {
        const [
            rowModule,
            hostModule,
            storeModule,
            rulesModule,
            fcModule,
            featuresModule,
            mspCodesModule,
            configuratorModule,
        ] = await Promise.all([
            import("../../../src/composables/ports/useSerialFunctionRow"),
            import("../../../src/composables/ports/useSerialRowHost"),
            import("../../../src/stores/serialPorts"),
            import("../../../src/composables/ports/usePortsRules"),
            import("../../../src/js/fc"),
            import("../../../src/js/Features"),
            import("../../../src/js/msp/MSPCodes"),
            import("../../../src/js/data_storage"),
        ]);

        env = {
            useSerialFunctionRow: rowModule.useSerialFunctionRow,
            NO_PORT: rowModule.NO_PORT,
            NO_FUNCTION: rowModule.NO_FUNCTION,
            useSerialRowHost: hostModule.useSerialRowHost,
            useSerialPortsStore: storeModule.useSerialPortsStore,
            usePortsRules: rulesModule.usePortsRules,
            FC: fcModule.default,
            Features: featuresModule.default,
            MSPCodes: mspCodesModule.default,
            CONFIGURATOR: configuratorModule.default,
        };
    }
    return env;
}

/**
 * A row exactly as a component mounts it: props reactive, and no baudrate field unless asked for.
 * Only valid once loadPortsEnv() has resolved.
 */
export function makeRow(props) {
    return env.useSerialFunctionRow(reactive({ baudField: null, ...props }));
}

/**
 * A fresh Pinia and a connected FC with nothing loaded yet - for a test that wants to drive the
 * first load itself, e.g. to make it fail.
 */
export function resetPortsState({ apiVersion = "1.48.0" } = {}) {
    const { FC, Features, CONFIGURATOR } = env;

    setActivePinia(createPinia());
    vi.clearAllMocks();
    mspPromise.mockImplementation(() => Promise.resolve({}));
    FC.resetState();
    FC.CONFIG.apiVersion = apiVersion;
    FC.CONFIG.buildOptions = [];
    FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
    CONFIGURATOR.connectionValid = true;
}

/**
 * Reset, then load a port array into a fresh store - the state every one of these files wants in
 * beforeEach.
 *
 * @returns {Promise<object>} the loaded store
 */
export async function resetPortsEnv({ apiVersion, fcPorts = defaultFcPorts() } = {}) {
    resetPortsState({ apiVersion });
    return loadFcPorts(env.useSerialPortsStore(), fcPorts);
}

/** Seed the FC with a port array and load it into the store, as a fresh tab mount would. */
export async function loadFcPorts(store, fcPorts) {
    env.FC.SERIAL_CONFIG.ports = fcPorts;
    await store.loadConfig({ force: true });
    return store;
}

export const labels = (items) => items.map((i) => i.label);
export const values = (items) => items.map((i) => i.value);

/** The functions FC.SERIAL_CONFIG.ports ends up carrying for one port, after a write. */
export const savedFunctions = (identifier) =>
    env.FC.SERIAL_CONFIG.ports.find((p) => p.identifier === identifier).functions;

/**
 * Reka UI reserves the empty string for clearing a select and showing its placeholder, and throws
 * "A <SelectItem /> must have a value prop that is not an empty string" if an item carries it.
 * Every list the row feeds to a USelect has to respect that.
 */
export function expectNoEmptySelectValues(row) {
    for (const list of [row.functionItems, row.portItems, row.baudItems, row.mspBaudItems]) {
        for (const item of list.value) {
            expect(item.value, JSON.stringify(item)).not.toEqual("");
        }
    }
}
