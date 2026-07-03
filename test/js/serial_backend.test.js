import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// serial_backend.js pulls in a very large import graph (MSP, MSPHelper, FC,
// localization, Analytics, BuildApi, crypto, ...). We mock every collaborator
// so the module loads in isolation and we can drive the connect/disconnect
// event handlers directly and observe the UI-teardown side effects.
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted above all module-level declarations, so any
// shared mutable objects they reference must be created with vi.hoisted().
const { GUI, serial, serialHandlers, unmountVueTab, switchTab, dialogStore, mspHelperInstance } = vi.hoisted(() => {
    const serialHandlers = {};
    return {
        // GUI default object — only the members serial_backend touches.
        GUI: {
            connect_lock: false,
            connected_to: false,
            connecting_to: false,
            configuration_loaded: false,
            active_tab: "landing",
            tab_switch_in_progress: false,
            allowedTabs: [],
            defaultAllowedTabsWhenDisconnected: ["landing", "firmware_flasher"],
            defaultAllowedFCTabsWhenConnected: [],
            defaultAllowedTabs: [],
            defaultCloudBuildTabOptions: [],
            pendingTab: null,
            timeout_kill_all: vi.fn(),
            interval_kill_all: vi.fn(),
            timeout_add: vi.fn(),
            timeout_remove: vi.fn(),
            tab_switch_cleanup: vi.fn((cb) => cb && cb()),
            showCliPanel: vi.fn(),
            selectDefaultTabWhenConnected: vi.fn(),
        },
        // serial: capture the connect/disconnect handlers registered by beginConnect.
        serialHandlers,
        serial: {
            connected: false,
            addEventListener: vi.fn((type, handler) => {
                serialHandlers[type] = handler;
            }),
            removeEventListener: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            forceClose: vi.fn(),
        },
        unmountVueTab: vi.fn(),
        switchTab: vi.fn(),
        dialogStore: {
            activeDialog: null,
            open: vi.fn(),
            close: vi.fn(),
        },
        mspHelperInstance: {
            setArmingEnabled: vi.fn(),
            process_data: vi.fn(),
            crunch: vi.fn(() => []),
            RESET_TYPES: { CUSTOM_DEFAULTS: 0 },
        },
    };
});

vi.mock("../../src/js/gui.js", () => ({
    __esModule: true,
    default: GUI,
    TABS: {},
}));

vi.mock("../../src/js/serial.js", () => ({
    __esModule: true,
    serial,
}));

// MSP — send_message is a no-op so onOpen's MSP chain stalls harmlessly
// (its callback never fires, so nothing past MSP_API_VERSION runs).
vi.mock("../../src/js/msp", () => ({
    __esModule: true,
    default: {
        send_message: vi.fn(),
        promise: vi.fn(() => Promise.resolve()),
        listen: vi.fn(),
        clearListeners: vi.fn(),
        disconnect_cleanup: vi.fn(),
        read: vi.fn(),
    },
}));

vi.mock("../../src/js/msp/MSPHelper", () => ({
    __esModule: true,
    default: vi.fn(function () {
        return mspHelperInstance;
    }),
}));

vi.mock("../../src/js/msp/MSPCodes", () => ({
    __esModule: true,
    default: new Proxy({}, { get: (_t, p) => p }),
}));

vi.mock("../../src/js/port_usage", () => ({
    __esModule: true,
    default: { initialize: vi.fn(), reset: vi.fn() },
}));

vi.mock("../../src/js/port_handler", () => ({
    __esModule: true,
    default: {
        initialize: vi.fn(),
        portPickerDisabled: false,
        portAvailable: false,
        portPicker: {
            selectedPort: "/dev/ttyACM0",
            portOverride: "/dev/ttyACM0",
            selectedBauds: 115200,
            autoConnect: false,
            virtualMspVersion: "1.46.0",
        },
    },
}));

vi.mock("../../src/js/vue_tab_mounter", () => ({
    __esModule: true,
    unmountVueTab,
}));

vi.mock("../../src/js/tab_switch", () => ({
    __esModule: true,
    switchTab,
}));

vi.mock("../../src/stores/dialog", () => ({
    __esModule: true,
    useDialogStore: () => dialogStore,
}));

vi.mock("../../src/stores/connection", () => ({
    __esModule: true,
    useConnectionStore: () => ({ liveDataPaused: false }),
}));

vi.mock("../../src/js/fc", () => ({
    __esModule: true,
    default: {
        CONFIG: {
            apiVersion: "1.47.0",
            flightControllerVersion: "",
            flightControllerIdentifier: "BTFL",
            boardType: 0,
            buildOptions: [],
        },
        FEATURE_CONFIG: { features: {} },
        BEEPER_CONFIG: {},
        TARGET_CAPABILITIES_FLAGS: {},
        CONFIGURATION_STATES: {},
        CONFIGURATION_PROBLEM_FLAGS: {},
        resetState: vi.fn(),
    },
}));

vi.mock("../../src/js/data_storage", () => ({
    __esModule: true,
    default: {
        connectionValid: false,
        cliValid: false,
        cliActive: false,
        virtualMode: false,
        API_VERSION_ACCEPTED: "1.46.0",
    },
    API_VERSION_1_45: "1.45.0",
    API_VERSION_1_46: "1.46.0",
    API_VERSION_1_47: "1.47.0",
}));

vi.mock("../../src/js/Analytics", () => ({
    __esModule: true,
    tracking: {
        sendEvent: vi.fn(),
        EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" },
    },
}));

vi.mock("../../src/js/localization", () => ({
    __esModule: true,
    i18n: { getMessage: (k) => k },
}));

vi.mock("../../src/js/gui_log", () => ({
    __esModule: true,
    gui_log: vi.fn(),
}));

// Remaining graph members that get imported but are not central to these tests.
vi.mock("../../src/js/Features", () => ({ __esModule: true, default: vi.fn() }));
vi.mock("../../src/js/Beepers", () => ({ __esModule: true, default: vi.fn() }));
vi.mock("../../src/js/VirtualFC", () => ({
    __esModule: true,
    default: { setVirtualConfig: vi.fn() },
}));
vi.mock("../../src/js/BuildApi", () => ({ __esModule: true, default: vi.fn() }));
vi.mock("../../src/js/bit.js", () => ({ __esModule: true, bit_check: () => false }));
vi.mock("../../src/js/sensor_helpers", () => ({ __esModule: true, have_sensor: () => false }));
vi.mock("../../src/js/utils/updateTabList", () => ({ __esModule: true, updateTabList: vi.fn() }));
vi.mock("../../src/js/utils/applyExpertMode", () => ({ __esModule: true, applyExpertMode: vi.fn() }));
vi.mock("../../src/js/ConfigStorage", () => ({ __esModule: true, get: () => ({}) }));
vi.mock("../../src/js/utils/connection", () => ({ __esModule: true, ispConnected: () => false }));
vi.mock("../../src/components/eventBus", () => ({
    __esModule: true,
    EventBus: { $on: vi.fn(), $emit: vi.fn() },
}));

import { connectDisconnect, disconnect, reinitializeConnection } from "../../src/js/serial_backend";
import PortHandler from "../../src/js/port_handler";

// Reset all mock state and bring the module to a known DISCONNECTED state
// before each test. Because module-private state (isConnected,
// intentionalDisconnect) persists across tests in the same module instance,
// each test that needs a connection establishes it explicitly and tears it
// down so the next test starts clean.
function resetMocks() {
    vi.clearAllMocks();
    Object.keys(serialHandlers).forEach((k) => delete serialHandlers[k]);
    GUI.connect_lock = false;
    GUI.connected_to = false;
    GUI.connecting_to = false;
    GUI.pendingTab = null;
    GUI.allowedTabs = [];
    serial.connected = false;
    dialogStore.activeDialog = null;
    // Restore the port picker (the reboot test mutates these).
    PortHandler.portPicker.selectedPort = "/dev/ttyACM0";
    PortHandler.portPicker.autoConnect = false;
}

// Drive the module into a "connected" state without the heavy MSP chain.
// connectDisconnect() (disconnected branch) -> beginConnect() registers the
// handlers and calls serial.connect(); we then fire the captured "connect"
// handler which calls onOpen() (MSP chain stalls on the mocked no-op
// send_message) and toggleStatus() -> module isConnected becomes true.
function establishConnection() {
    connectDisconnect();
    expect(serial.connect).toHaveBeenCalled();
    // onOpen needs connecting_to so connected_to is set; beginConnect set it.
    serialHandlers.connect({ detail: true });
}

describe("serial_backend disconnect convergence", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("UNEXPECTED disconnect runs the shared UI teardown", () => {
        establishConnection();

        // Sanity: connect path registered a disconnect handler.
        expect(typeof serialHandlers.disconnect).toBe("function");

        // Pre-teardown baseline.
        switchTab.mockClear();
        unmountVueTab.mockClear();
        GUI.connect_lock = true; // simulate an in-progress operation lock
        GUI.connected_to = "/dev/ttyACM0";

        // Fire the protocol "disconnect" event -> disconnectHandler -> onClosed(true).
        serialHandlers.disconnect({ detail: true });

        expect(switchTab).toHaveBeenCalledWith("landing", { mode: "disconnected" });
        expect(unmountVueTab).toHaveBeenCalledTimes(1);
        expect(GUI.connect_lock).toBe(false);
        expect(GUI.connected_to).toBe(false);
    });

    it("UNEXPECTED disconnect does NOT call mspHelper.setArmingEnabled", () => {
        establishConnection();
        mspHelperInstance.setArmingEnabled.mockClear();

        serialHandlers.disconnect({ detail: true });

        expect(mspHelperInstance.setArmingEnabled).not.toHaveBeenCalled();
    });

    it("after an UNEXPECTED disconnect, module isConnected is reset (next action takes connect branch)", () => {
        establishConnection();
        serialHandlers.disconnect({ detail: true });

        // If isConnected were still true, connectDisconnect would take the
        // disconnect branch. It must instead attempt a fresh connect.
        serial.connect.mockClear();
        connectDisconnect();

        expect(serial.connect).toHaveBeenCalled();
    });

    it("INTENTIONAL disconnect does NOT double-fire teardown on the later disconnect event", () => {
        establishConnection();

        switchTab.mockClear();
        unmountVueTab.mockClear();

        // User presses Disconnect -> exported disconnect() -> beginDisconnect()
        // sets intentionalDisconnect = true and (because mspHelper exists)
        // invokes the setArmingEnabled callback synchronously in our mock?
        // Our mock does NOT call the callback, so finishClose runs only when
        // the callback fires. To exercise the guard deterministically, invoke
        // the setArmingEnabled callback ourselves to run finishClose once.
        mspHelperInstance.setArmingEnabled.mockClear();
        disconnect();

        // beginDisconnect should have requested arming-enable with a callback.
        expect(mspHelperInstance.setArmingEnabled).toHaveBeenCalledTimes(1);
        const finishClose = mspHelperInstance.setArmingEnabled.mock.calls[0][2];
        expect(typeof finishClose).toBe("function");

        // Run the intentional teardown (finishClose) once.
        finishClose();
        const switchTabCallsAfterIntentional = switchTab.mock.calls.length;
        expect(switchTabCallsAfterIntentional).toBeGreaterThanOrEqual(1);

        // Now the protocol emits its "disconnect" event on a later microtask.
        // The guard (intentionalDisconnect) should make onClosed skip the
        // unexpected-disconnect teardown -> no ADDITIONAL switchTab call.
        serialHandlers.disconnect({ detail: true });

        expect(switchTab.mock.calls.length).toBe(switchTabCallsAfterIntentional);
    });

    it("a FAILED open does not mark the module connected (reconnect retries keep working)", () => {
        connectDisconnect();
        expect(serial.connect).toHaveBeenCalled();

        // Fire the connect handler with a falsy detail = open failed.
        serialHandlers.connect({ detail: false });

        // isConnected must stay false: the next action attempts a fresh connect,
        // not a disconnect. (Before the fix, connectHandler toggled unconditionally.)
        serial.connect.mockClear();
        connectDisconnect();
        expect(serial.connect).toHaveBeenCalled();
    });
});

describe("serial_backend BLE Save-and-Reboot reconnect", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("drops the stale link after the flush delay, then retries connecting (auto-connect on)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();

            reinitializeConnection();

            // Nothing happens until the reboot command has had time to flush.
            expect(serial.disconnect).not.toHaveBeenCalled();

            // After the flush delay the surviving link is torn down cleanly.
            vi.advanceTimersByTime(1500);
            expect(serial.disconnect).toHaveBeenCalled();

            // Then the retry loop reconnects (device stays listed, so connect-by-path works).
            vi.advanceTimersByTime(1000);
            expect(serial.connect).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not auto-reconnect when auto-connect is off (clean disconnect only)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = false;
            establishConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();

            reinitializeConnection();
            vi.advanceTimersByTime(1500);

            // Stale link dropped...
            expect(serial.disconnect).toHaveBeenCalled();

            // ...but no reconnect attempts over the rest of the reboot window.
            vi.advanceTimersByTime(10000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("an intentional disconnect during the reboot window cancels the reconnect retry", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            reinitializeConnection(); // schedules the reboot reconnect

            // User hits Disconnect before/while the reboot reconnect is pending — it must be
            // cancelled, not resurrect the connection on a later tick.
            disconnect();
            // Complete the disconnect (the mocked setArmingEnabled doesn't auto-invoke its
            // callback) so module-private isConnected resets and doesn't leak into later tests.
            mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.();

            serial.connect.mockClear();
            vi.advanceTimersByTime(15000); // cover flush + the full retry window
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("stops reconnect retries when Auto-Connect is turned off mid-reboot", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> disconnectForReboot, retry armed

            // User turns Auto-Connect off before the first retry tick.
            PortHandler.portPicker.autoConnect = false;
            serial.connect.mockClear();

            vi.advanceTimersByTime(5000); // several retry ticks
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
