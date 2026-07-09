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
import PortHandler from "../../src/js/port_handler";
import CONFIGURATOR from "../../src/js/data_storage";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
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
    PortHandler.portPicker.selectedPort = "/dev/ttyACM0";
    PortHandler.portPicker.autoConnect = false;
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
    PortHandler.portPicker.selectedPort = "virtual";
    CONFIGURATOR.virtualMode = true;
    serial.connect.mockImplementationOnce((_port, _opts, onOpenVirtual) => {
        onOpenVirtual?.();
    });
    connectDisconnect();
    expect(serial.connect).toHaveBeenCalled();
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

describe("serial_backend connect-failure dialog", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("shows the connection-failed dialog when a user-initiated connect fails to open", () => {
        // IDLE -> connectDisconnect -> beginConnect (CONNECTING). A failed open is a genuine
        // user-facing failure, so the dialog must appear.
        connectDisconnect();
        expect(serial.connect).toHaveBeenCalled();

        serialHandlers.connect({ detail: false }); // open failed -> onOpen(false) -> abortConnection

        const infoDialogs = dialogStore.open.mock.calls.filter((c) => c[0] === "InformationDialog");
        expect(infoDialogs).toHaveLength(1);
    });

    it("stays silent when a reboot reconnect's open fails with auto-connect on (device still re-enumerating)", () => {
        // The preset/CLI save-and-reboot reconnect window: scheduleReconnect() put the phase
        // in RECONNECTING. A premature connect attempt (fired before the rebooting device is
        // back) fails to open — but auto-connect recovers on re-enumeration, so this must NOT
        // pop a "Failed to open serial port" dialog. (The reported spurious-dialog bug.)
        PortHandler.portPicker.autoConnect = true;
        getConnectionState().reconnectStarted(); // RECONNECTING
        dialogStore.open.mockClear();

        connectDisconnect(); // beginConnect preserves RECONNECTING
        expect(serial.connect).toHaveBeenCalled();

        serialHandlers.connect({ detail: false }); // premature failed open -> abortConnection

        const infoDialogs = dialogStore.open.mock.calls.filter((c) => c[0] === "InformationDialog");
        expect(infoDialogs).toHaveLength(0);
        // The attempt is still torn down so auto-connect can re-fire (connecting_to cleared).
        expect(GUI.connecting_to).toBe(false);
    });

    it("still shows the dialog on a reboot reconnect failure when auto-connect is OFF (nothing retries)", () => {
        // Without auto-connect there is no auto-recovery, so a failed reconnect open is a real
        // dead end the user must be told about — suppression must NOT apply.
        PortHandler.portPicker.autoConnect = false;
        getConnectionState().reconnectStarted(); // RECONNECTING
        dialogStore.open.mockClear();

        connectDisconnect();
        serialHandlers.connect({ detail: false });

        const infoDialogs = dialogStore.open.mock.calls.filter((c) => c[0] === "InformationDialog");
        expect(infoDialogs).toHaveLength(1);
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
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = true;
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
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = true;
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

    it("sends MSP_SET_REBOOT, forces connectionValid false, and does NOT self-drive disconnect/connect", () => {
        vi.useFakeTimers();
        try {
            // Plain USB/serial path: not bluetooth, not manual, not virtual.
            PortHandler.portPicker.selectedPort = "/dev/ttyACM0";
            PortHandler.portPicker.autoConnect = true;
            CONFIGURATOR.virtualMode = false;
            CONFIGURATOR.connectionValid = true; // established before the reboot
            establishConnection();

            MSP.send_message.mockClear();
            serial.disconnect.mockClear();
            serial.connect.mockClear();

            const ts = reinitializeConnection(true); // suppressDialog: skip DOM modal

            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);
            expect(typeof ts).toBe("number");
            // The reboot forces the connection invalid so the dialog/loop wait for a real reconnect.
            expect(CONFIGURATOR.connectionValid).toBe(false);

            // Unlike the BLE/manual path, serial relies on the real protocol "disconnect" event
            // from the cable dropping — it does NOT self-schedule a disconnect or reconnect loop.
            vi.advanceTimersByTime(20000);
            expect(serial.disconnect).not.toHaveBeenCalled();
            expect(serial.connect).not.toHaveBeenCalled();

            serialHandlers.disconnect({ detail: true }); // teardown (cable-drop never fired)
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
            PortHandler.portPicker.autoConnect = true;
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
            PortHandler.portPicker.autoConnect = false;
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
