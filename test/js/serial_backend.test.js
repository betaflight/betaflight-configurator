import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
            updateProps: vi.fn(),
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

vi.mock("../../src/js/device_handler", () => ({
    __esModule: true,
    default: {
        initialize: vi.fn(),
        devicePickerDisabled: false,
        portAvailable: false,
        isKnownDevicePath: vi.fn(() => false),
        // The reboot window captures which device it waits for; the cycle asks whether it is back.
        describeDevice: vi.fn((path) => ({ path, vendorId: 1155, productId: 22336 })),
        findDescribedDevice: vi.fn(() => undefined),
        devicePicker: {
            selectedDevice: "/dev/ttyACM0",
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
            buildKey: "",
            targetCapabilities: 0,
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

import {
    connectDisconnect,
    disconnect,
    initializeSerialBackend,
    reinitializeConnection,
} from "../../src/js/serial_backend";
import DeviceHandler from "../../src/js/device_handler";
import CONFIGURATOR from "../../src/js/data_storage";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import FC from "../../src/js/fc";
import { EventBus } from "../../src/components/eventBus";
import { __resetConnectionStateForTests, getConnectionState } from "../../src/js/connection_state.js";

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
    GUI.active_tab = "landing";
    GUI.allowedTabs = [];
    serial.connected = false;
    dialogStore.activeDialog = null;
    // Restore the port picker (the reboot test mutates these).
    DeviceHandler.devicePicker.selectedDevice = "/dev/ttyACM0";
    DeviceHandler.devicePicker.autoConnect = false;
    // Restore CONFIGURATOR flags the reboot/virtual tests mutate.
    CONFIGURATOR.virtualMode = false;
    CONFIGURATOR.connectionValid = false;
    // The reboot tests drive the connection state into REBOOTING/RECONNECTING via
    // reinitializeConnection(); reset the singleton so a later case can't inherit a
    // non-IDLE phase (and a stale isReconnecting) from execution order.
    __resetConnectionStateForTests();
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

// Drive the module into a "connected" state for a VIRTUAL port. beginConnect passes
// onOpenVirtual as serial.connect's third argument (only for the virtual port); the default
// mock ignores it, so here we make serial.connect invoke that callback once, which sets
// module isConnected = true (and CONFIGURATOR.virtualMode).
function establishVirtualConnection() {
    DeviceHandler.devicePicker.selectedDevice = "virtual";
    CONFIGURATOR.virtualMode = true;
    serial.connect.mockImplementationOnce((_port, _opts, onOpenVirtual) => {
        onOpenVirtual?.();
    });
    connectDisconnect();
    expect(serial.connect).toHaveBeenCalled();
}

// Granting permission from the Connect button starts two connects: the addedDevice event that
// requestPermissionDevice() raises reaches the auto-select listener, and ConnectButton then
// connects again when the await returns. The second open() on the same SerialPort throws
// InvalidStateError, and its "Connection failed" dialog hides that the first open worked.
describe("serial_backend connectDisconnect — attempt already in flight", () => {
    beforeEach(() => {
        resetMocks();
    });

    it("does not start a second connect while one is in flight", () => {
        connectDisconnect();

        expect(serial.connect).toHaveBeenCalledTimes(1);
        expect(GUI.connecting_to).toBe("/dev/ttyACM0");

        connectDisconnect();

        expect(serial.connect).toHaveBeenCalledTimes(1);
    });

    it("connects again once the attempt has settled", () => {
        connectDisconnect();
        GUI.connecting_to = false;

        connectDisconnect();

        expect(serial.connect).toHaveBeenCalledTimes(2);
    });
});

describe("serial_backend disconnect convergence", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("UNEXPECTED disconnect runs the shared UI teardown", () => {
        establishConnection();

        // Sanity: connect path registered a disconnect handler.
        expect(typeof serialHandlers.disconnect).toBe("function");

        // Pre-teardown baseline. Simulate leaving a connected tab so teardown takes the
        // blank-and-replace path (unmount old tab, switch to landing).
        GUI.active_tab = "configuration";
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

    it("repeated disconnects while already on landing do NOT blank the content (no stuck black screen)", () => {
        // Reproduces the unstable-BLE burst: after the first teardown we sit on the
        // landing tab, and each further unexpected disconnect must not unmount it — an
        // unmount here previously left a blank content area that switchTab() would not
        // remount (it no-ops on the same tab).
        establishConnection();
        GUI.active_tab = "landing";
        unmountVueTab.mockClear();

        serialHandlers.disconnect({ detail: true });
        serialHandlers.disconnect({ detail: true });

        expect(unmountVueTab).not.toHaveBeenCalled();
    });

    it("does NOT dismiss an active RebootDialog on an unexpected disconnect (reboot owns its modal)", () => {
        establishConnection();
        dialogStore.close.mockClear();
        // A reboot's own port-drop lands in onClosed; it must not close the reboot progress
        // modal — the reboot flow (showRebootDialog's timer / closeRebootDialog) owns it.
        dialogStore.activeDialog = { type: "RebootDialog" };

        serialHandlers.disconnect({ detail: true });

        expect(dialogStore.close).not.toHaveBeenCalled();
    });

    it("DOES dismiss a non-reboot modal on an unexpected disconnect", () => {
        establishConnection();
        dialogStore.close.mockClear();
        dialogStore.activeDialog = { type: "InformationDialog" };

        serialHandlers.disconnect({ detail: true });

        expect(dialogStore.close).toHaveBeenCalled();
    });

    it("clears the dead connection's handshake watchdogs on an UNEXPECTED disconnect", () => {
        establishConnection();
        GUI.timeout_remove.mockClear();

        serialHandlers.disconnect({ detail: true });

        // GUI.timeout_add does not de-duplicate names, so a stale watchdog left armed
        // here would later fire into a healthy successor connection.
        expect(GUI.timeout_remove).toHaveBeenCalledWith("connecting");
        expect(GUI.timeout_remove).toHaveBeenCalledWith("connectAttempt");
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

// The failure dialog follows who started the attempt, not the lifecycle phase. A reboot
// reconnect is one instance of that rule, not a special case.
describe("serial_backend connect-failure dialog", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    function infoDialogCount() {
        return dialogStore.open.mock.calls.filter((c) => c[0] === "InformationDialog").length;
    }

    it("shows the dialog when a user-initiated connect fails to open", () => {
        connectDisconnect();
        expect(serial.connect).toHaveBeenCalled();

        serialHandlers.connect({ detail: false }); // open failed -> onOpen(false) -> abortConnection

        expect(infoDialogCount()).toBe(1);
    });

    it("still shows the dialog for a user-initiated failure while Auto-Connect is ON", () => {
        // A port held by another application fails every time; no device event retries it.
        DeviceHandler.devicePicker.autoConnect = true;

        connectDisconnect();
        serialHandlers.connect({ detail: false });

        expect(infoDialogCount()).toBe(1);
    });

    it("stays silent when an app-initiated open fails, and recovers on the next device event", () => {
        // The port vanished between the list refresh and the open (issue #5368).
        DeviceHandler.devicePicker.autoConnect = true;

        connectDisconnect({ automatic: true });
        expect(serial.connect).toHaveBeenCalled();

        serialHandlers.connect({ detail: false }); // port vanished -> abortConnection

        expect(infoDialogCount()).toBe(0);
        // Torn down, so the next event can attempt again and the UI is not stuck mid-connect.
        expect(GUI.connecting_to).toBe(false);
        expect(DeviceHandler.devicePickerDisabled).toBe(false);

        serial.connect.mockClear();
        connectDisconnect({ automatic: true });
        expect(serial.connect).toHaveBeenCalled();
        serialHandlers.connect({ detail: true });
        expect(GUI.connected_to).toBe("/dev/ttyACM0");
        expect(infoDialogCount()).toBe(0);
    });

    it("reports an app-initiated failure AFTER the link opened (handshake rejected)", () => {
        // A handshake rejected after the open is terminal, whoever started the attempt.
        DeviceHandler.devicePicker.autoConnect = true;

        connectDisconnect({ automatic: true });
        serialHandlers.connect({ detail: true }); // opened -> linkOpen, HANDSHAKING
        dialogStore.open.mockClear();

        // FC.CONFIG is module state on the mock; resetMocks() does not restore it.
        const apiVersion = FC.CONFIG.apiVersion;
        try {
            FC.CONFIG.apiVersion = "0.0.0";
            MSP.send_message.mock.calls.at(-1)?.[3]?.(); // MSP_API_VERSION callback -> abortConnection
        } finally {
            FC.CONFIG.apiVersion = apiVersion;
        }

        expect(infoDialogCount()).toBe(1);
    });

    it("reports a handshake rejected synchronously, inside onOpen", () => {
        // MSP.send_message calls back synchronously when the link dropped again, so
        // abortConnection runs before connectHandler returns.
        DeviceHandler.devicePicker.autoConnect = true;
        const apiVersion = FC.CONFIG.apiVersion;

        try {
            connectDisconnect({ automatic: true });
            dialogStore.open.mockClear();

            MSP.send_message.mockImplementationOnce((_code, _data, _sent, callback) => {
                FC.CONFIG.apiVersion = "0.0.0";
                callback?.();
            });

            serialHandlers.connect({ detail: true });

            expect(infoDialogCount()).toBe(1);
        } finally {
            FC.CONFIG.apiVersion = apiVersion;
        }
    });

    it("stays silent when a reboot reconnect's open fails (the loop retries)", () => {
        // The retry loop drives the attempt, so a premature open is expected and silent.
        DeviceHandler.devicePicker.autoConnect = true;
        getConnectionState().reconnectStarted(); // RECONNECTING
        dialogStore.open.mockClear();

        connectDisconnect({ automatic: true }); // beginConnect preserves RECONNECTING
        expect(serial.connect).toHaveBeenCalled();

        serialHandlers.connect({ detail: false }); // premature failed open -> abortConnection

        expect(infoDialogCount()).toBe(0);
        expect(GUI.connecting_to).toBe(false);
    });

    it("makes no automatic attempt at all with Auto-Connect OFF", () => {
        // Why abortConnection() no longer tests autoConnect: with it off nothing connects on
        // the app's own initiative, so every failure left is a user's to see.
        initializeSerialBackend();
        const autoSelect = EventBus.$on.mock.calls.find(
            (c) => c[0] === "device-handler:auto-select-serial-device",
        )?.[1];
        expect(autoSelect).toBeTypeOf("function");

        DeviceHandler.devicePicker.autoConnect = false;
        serial.connect.mockClear();
        autoSelect();
        expect(serial.connect).not.toHaveBeenCalled();

        // With it on the same listener connects, and its failure stays silent.
        DeviceHandler.devicePicker.autoConnect = true;
        dialogStore.open.mockClear();
        autoSelect();
        expect(serial.connect).toHaveBeenCalled();

        serialHandlers.connect({ detail: false });
        expect(infoDialogCount()).toBe(0);
    });
});

describe("serial_backend BLE Save-and-Reboot reconnect", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("keeps the BLE link open at the flush delay (soft reset) and re-handshakes on it (auto-connect on)", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "bluetooth_1";
            DeviceHandler.devicePicker.autoConnect = true;
            establishConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();
            switchTab.mockClear();

            reinitializeConnection();

            // Nothing happens until the reboot command has had time to flush.
            expect(serial.disconnect).not.toHaveBeenCalled();

            // After the flush delay the app-level state resets (back to landing) but the
            // GATT session is deliberately KEPT — dropping and re-establishing it is what
            // produces deaf sessions on Linux/BlueZ.
            vi.advanceTimersByTime(1500);
            expect(serial.disconnect).not.toHaveBeenCalled();
            expect(switchTab).toHaveBeenCalledWith("landing", { mode: "disconnected" });

            // Then the retry loop re-handshakes over the kept session.
            vi.advanceTimersByTime(1000);
            expect(serial.connect).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("forces connectionValid false on reboot so the dialog waits for a real reconnect", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "bluetooth_1";
            DeviceHandler.devicePicker.autoConnect = true;
            establishConnection();
            // A BLE link survives the reboot command, so connectionValid is still true when
            // the reboot starts. If left stale-true, the reboot dialog's check-timer would
            // conclude the reboot and null the shared reconnect window before the retry loop
            // arms — no reconnect ever runs. reinitializeConnection must reset it.
            CONFIGURATOR.connectionValid = true;

            reinitializeConnection();

            expect(CONFIGURATOR.connectionValid).toBe(false);
        } finally {
            vi.advanceTimersByTime(30000); // drain the loop
            vi.useRealTimers();
        }
    });

    it("does not auto-reconnect when auto-connect is off (clean disconnect only)", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "bluetooth_1";
            DeviceHandler.devicePicker.autoConnect = false;
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
            DeviceHandler.devicePicker.selectedDevice = "bluetooth_1";
            DeviceHandler.devicePicker.autoConnect = true;
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
});

// ---------------------------------------------------------------------------
// removedDevice listener — exercises the REAL inline predicate registered by
// initializeSerialBackend (serial.addEventListener("removedDevice", ...)). The
// handler is captured in serialHandlers.removedDevice by the serial mock, so we
// fire it directly and observe whether the disconnect branch of connectDisconnect
// runs. beginDisconnect() calls mspHelper.setArmingEnabled exactly once, so that
// call is our proxy for "a disconnect was triggered".
// ---------------------------------------------------------------------------
describe("serial_backend removedDevice matching is device-specific", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
        // initializeSerialBackend registers the real removedDevice listener on the
        // serial mock, capturing the handler in serialHandlers.removedDevice.
        initializeSerialBackend();
    });

    // Each test establishes a real connection (so module isConnected === true and
    // the disconnect branch is reachable), then tears it down via the captured
    // disconnect handler so module-private state does not leak into later tests.
    it("removing a DIFFERENT device does NOT disconnect the active connection", () => {
        establishConnection();
        GUI.connected_to = "serial_1"; // device B is the active connection
        mspHelperInstance.setArmingEnabled.mockClear();

        expect(typeof serialHandlers.removedDevice).toBe("function");
        serialHandlers.removedDevice({ detail: { path: "serial_0" } });

        expect(mspHelperInstance.setArmingEnabled).not.toHaveBeenCalled();

        serialHandlers.disconnect({ detail: true }); // teardown
    });

    it("removing the CONNECTED device DOES disconnect", () => {
        establishConnection();
        GUI.connected_to = "serial_1";
        mspHelperInstance.setArmingEnabled.mockClear();

        serialHandlers.removedDevice({ detail: { path: "serial_1" } });

        // beginDisconnect -> setArmingEnabled with the finishClose callback.
        expect(mspHelperInstance.setArmingEnabled).toHaveBeenCalledTimes(1);

        // Run finishClose to complete the disconnect and reset module state.
        mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.();
    });

    it("a null/empty removal detail never triggers a disconnect", () => {
        establishConnection();
        GUI.connected_to = "serial_1";
        mspHelperInstance.setArmingEnabled.mockClear();

        serialHandlers.removedDevice({ detail: undefined });
        serialHandlers.removedDevice({ detail: {} });
        serialHandlers.removedDevice({ detail: { path: "" } });

        expect(mspHelperInstance.setArmingEnabled).not.toHaveBeenCalled();

        serialHandlers.disconnect({ detail: true }); // teardown
    });

    it("an empty removal path does not match connected_to === false", () => {
        establishConnection();
        GUI.connected_to = false; // guard against the pre-fix empty-path bug
        mspHelperInstance.setArmingEnabled.mockClear();

        serialHandlers.removedDevice({ detail: { path: "" } });

        expect(mspHelperInstance.setArmingEnabled).not.toHaveBeenCalled();

        serialHandlers.disconnect({ detail: true }); // teardown
    });
});

// ---------------------------------------------------------------------------
// reinitializeConnection reboot contract per transport. These are the only net over the
// serial/USB and virtual reboot paths, which this PR also touches (the connectionValid
// reset). They assert the contract — command sent or not, self-driven loop or not,
// connectionValid forced invalid — so a regression on those paths is caught.
// ---------------------------------------------------------------------------
describe("serial_backend reinitializeConnection — serial/USB reboot path", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("sends MSP_SET_REBOOT, forces connectionValid false, and leaves a live serial link alone", () => {
        vi.useFakeTimers();
        try {
            // Plain USB/serial path: not bluetooth, not manual, not virtual.
            DeviceHandler.devicePicker.selectedDevice = "/dev/ttyACM0";
            DeviceHandler.devicePicker.autoConnect = true;
            CONFIGURATOR.virtualMode = false;
            CONFIGURATOR.connectionValid = true; // established before the reboot
            establishConnection();

            MSP.send_message.mockClear();
            serial.disconnect.mockClear();
            serial.connect.mockClear();

            reinitializeConnection();

            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);
            // The reboot forces the connection invalid so the cycle waits for a real reconnect.
            expect(CONFIGURATOR.connectionValid).toBe(false);

            // A serial link that is still open after the flush means the FC did not reboot, or
            // the OS has not noticed yet. Dropping it would tear down a working connection and
            // throw the user off the tab they just opened — the CLI-tab exit path does exactly
            // this. The transport owns that link; only driven targets are dropped here.
            vi.advanceTimersByTime(1500);
            expect(serial.disconnect).not.toHaveBeenCalled();
        } finally {
            vi.advanceTimersByTime(30000); // drain the window
            vi.useRealTimers();
        }
    });

    // Serial used to have no owner: the reconnect depended on an addedDevice event reaching the
    // auto-select listener. That listener is still the fast path, but the cycle now backstops it
    // and ends the window either way.
    it("reconnects a serial target from the cycle when no device event arrives", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "/dev/ttyACM0";
            DeviceHandler.devicePicker.autoConnect = true;
            CONFIGURATOR.connectionValid = true;
            establishConnection();

            reinitializeConnection();
            serialHandlers.disconnect({ detail: true }); // the FC's re-enumeration drops the link
            serial.connect.mockClear();

            vi.advanceTimersByTime(1500 + 1000); // flush, then the first retry tick
            expect(serial.connect).toHaveBeenCalled();
        } finally {
            vi.advanceTimersByTime(30000); // drain the window
            vi.useRealTimers();
        }
    });

    it("a user disconnect during the reboot cancels the cycle and closes the window", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "/dev/ttyACM0";
            DeviceHandler.devicePicker.autoConnect = true;
            CONFIGURATOR.connectionValid = true;
            establishConnection();

            reinitializeConnection();
            disconnect(); // user hits Disconnect mid-reboot
            mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.(); // complete the close
            serial.connect.mockClear();

            vi.advanceTimersByTime(30000);

            expect(serial.connect).not.toHaveBeenCalled();
            expect(getConnectionState().isRebootWindowOpen).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    // Auto-Connect off: nothing reconnects, so the wait ends as soon as there is nothing left
    // to wait for. For serial that is the port coming back — the user can reconnect to a device
    // that is actually there. (Was shouldConcludeRebootDialog's serial branch.)
    it("with Auto-Connect off, ends the window when OUR device is back — not any port", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "/dev/ttyACM0";
            DeviceHandler.devicePicker.autoConnect = false;
            DeviceHandler.portAvailable = true; // other serial ports are present throughout
            DeviceHandler.isKnownDevicePath.mockReturnValue(true); // and one shares our path shape
            DeviceHandler.findDescribedDevice.mockReturnValue(undefined); // but ours is away
            CONFIGURATOR.connectionValid = true;
            establishConnection();

            reinitializeConnection();
            serialHandlers.disconnect({ detail: true });
            serial.connect.mockClear(); // establishConnection's own open

            vi.advanceTimersByTime(1500 + 3000); // flush plus several ticks
            expect(getConnectionState().isRebootWindowOpen).toBe(true); // ours is gone: keep waiting

            DeviceHandler.findDescribedDevice.mockReturnValue({ path: "serial_9" }); // back, new id
            vi.advanceTimersByTime(1000);
            expect(getConnectionState().isRebootWindowOpen).toBe(false);
            expect(serial.connect).not.toHaveBeenCalled(); // nothing auto-reconnects
        } finally {
            DeviceHandler.portAvailable = false;
            DeviceHandler.isKnownDevicePath.mockReturnValue(false);
            DeviceHandler.findDescribedDevice.mockReturnValue(undefined);
            vi.useRealTimers();
        }
    });

    // The window is shared: another owner can conclude it first. A closed window reads as
    // NOT expired, so a loop testing expiry alone would spin forever.
    it("stops when another owner concludes the window", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.selectedDevice = "/dev/ttyACM0";
            DeviceHandler.devicePicker.autoConnect = true;
            CONFIGURATOR.connectionValid = true;
            establishConnection();

            reinitializeConnection();
            serialHandlers.disconnect({ detail: true });
            vi.advanceTimersByTime(1500); // into the retry phase

            getConnectionState().concludeReboot(false); // another owner settles it
            serial.connect.mockClear();

            vi.advanceTimersByTime(30000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("serial_backend reinitializeConnection — virtualMode reboot path", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("toggles immediately then reconnects after 500ms when auto-connect is on (no MSP_SET_REBOOT)", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.autoConnect = true;
            establishVirtualConnection();

            MSP.send_message.mockClear();
            serial.disconnect.mockClear();
            mspHelperInstance.setArmingEnabled.mockClear();

            reinitializeConnection();

            // Virtual path just toggles the link — no reboot command.
            expect(MSP.send_message).not.toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);
            expect(mspHelperInstance.setArmingEnabled).toHaveBeenCalledTimes(1);
            // Mocked setArmingEnabled doesn't auto-invoke its callback — drive it to finish the close.
            mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.();
            expect(serial.disconnect).toHaveBeenCalledTimes(1);

            // A single follow-up toggle 500ms later (one-shot, not a retry loop).
            serial.connect.mockClear();
            vi.advanceTimersByTime(500);
            expect(serial.connect).toHaveBeenCalledTimes(1);

            serial.connect.mockClear();
            vi.advanceTimersByTime(20000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("toggles once and schedules no reconnect when auto-connect is off", () => {
        vi.useFakeTimers();
        try {
            DeviceHandler.devicePicker.autoConnect = false;
            establishVirtualConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();
            mspHelperInstance.setArmingEnabled.mockClear();

            reinitializeConnection();

            expect(mspHelperInstance.setArmingEnabled).toHaveBeenCalledTimes(1);
            mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.();
            expect(serial.disconnect).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(20000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("serial_backend MSP unresponsive-FC teardown", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    afterEach(() => {
        // These cases drive MSP.last_received_timestamp directly; clear the singleton so a
        // later test can't inherit stale traffic state.
        MSP.last_received_timestamp = null;
    });

    it("registers MSP.onTimeout on connect and clears it on teardown", () => {
        establishConnection();
        expect(typeof MSP.onTimeout).toBe("function");

        serialHandlers.disconnect({ detail: true }); // teardown -> resetConnection
        expect(MSP.onTimeout).toBeNull();
    });

    it("drops the link and shows a dialog when the FC has gone fully silent", () => {
        establishConnection();
        getConnectionState().setLinkOpen(true);
        serial.disconnect.mockClear();
        dialogStore.open.mockClear();

        // last_received_timestamp older than DEAD_LINK_TIMEOUT (5 s): no inbound bytes for the
        // whole window, so the link classifies as dead.
        MSP.last_received_timestamp = Date.now() - 10_000;

        // MSP.onTimeout hook — fired after an errorAware request exhausts MAX_RETRIES.
        MSP.onTimeout(MSPCodes.MSP_ANALOG);

        // Teardown runs via finishClose -> serial.disconnect, with no MSP round-trip to the dead FC.
        expect(serial.disconnect).toHaveBeenCalledTimes(1);

        // The protocol "disconnect" event drives onClosed, which raises the notice only after
        // the close settles (so it is not clobbered by onClosed's dialog dismissal).
        serialHandlers.disconnect({ detail: true });
        expect(dialogStore.open).toHaveBeenCalledWith(
            "InformationDialog",
            expect.objectContaining({ title: "connectionLostTitle", text: "connectionLostUnresponsive" }),
            expect.anything(),
        );
    });

    it("keeps the link up when the FC is still sending data (slow, not dead)", () => {
        establishConnection();
        getConnectionState().setLinkOpen(true);
        serial.disconnect.mockClear();

        // last_received_timestamp inside DEAD_LINK_TIMEOUT: inbound traffic just arrived, so the
        // exhausted request is a latency spike, not a dead link.
        MSP.last_received_timestamp = Date.now();

        MSP.onTimeout(MSPCodes.MSP_ANALOG);

        expect(serial.disconnect).not.toHaveBeenCalled();
    });

    it("ignores the timeout hook when not connected", () => {
        establishConnection();
        getConnectionState().setLinkOpen(false);
        serial.disconnect.mockClear();

        MSP.onTimeout(MSPCodes.MSP_ANALOG);

        expect(serial.disconnect).not.toHaveBeenCalled();
    });
});
