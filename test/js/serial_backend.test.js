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
    scheduleRebootReconnect,
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

// Drive the module into a "connected" state for a VIRTUAL port. beginConnect
// passes onOpenVirtual as serial.connect's third argument (only for the virtual
// port); the default mock ignores it, so here we make serial.connect invoke that
// callback once, which sets module isConnected = true (and CONFIGURATOR.virtualMode).
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

    it("still drops the surviving link at the flush delay when Auto-Connect is off (no retry will ride it)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_1";
            PortHandler.portPicker.autoConnect = false;
            establishConnection();

            serial.disconnect.mockClear();

            reinitializeConnection();
            vi.advanceTimersByTime(1500);

            // Nothing is going to reconnect, so keeping the GATT session open would just
            // hold the adapter hostage — hard disconnect.
            expect(serial.disconnect).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("aims the BLE/manual retry at the same (previously-selected) port", () => {
        vi.useFakeTimers();
        __resetConnectionStateForTests();
        try {
            // The BLE/manual reboot path runs rebootReconnect's retry loop, which
            // reconnects to the SAME device — the selection stays put across the
            // reboot (no token, no path re-resolution; it re-enumerates with the
            // same stable id).
            PortHandler.portPicker.selectedPort = "manual";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            serial.connect.mockClear();

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> disconnectForReboot
            vi.advanceTimersByTime(1000); // first retry tick

            // The retry reconnects to the still-selected device.
            expect(PortHandler.portPicker.selectedPort).toBe("manual");
            expect(serial.connect).toHaveBeenCalled();
        } finally {
            __resetConnectionStateForTests();
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

    it("drops a stalled handshake quickly on a RE-ESTABLISHED session and keeps retrying", () => {
        vi.useFakeTimers();
        try {
            // Use a REAL timeout registry: the reboot-aware handshake watchdog must actually fire.
            GUI.timeout_add.mockImplementation((_name, code, timeout) => setTimeout(code, timeout));

            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> soft reset (link kept)

            serial.connect.mockClear();
            serial.disconnect.mockClear();
            mspHelperInstance.setArmingEnabled.mockClear();

            vi.advanceTimersByTime(1000); // first retry tick -> connect attempt
            expect(serial.connect).toHaveBeenCalledTimes(1);

            // The attempt opens but never answers MSP. serial.connected stays false in this
            // mock, i.e. the kept link is gone (adapter dropped it; this is a re-established
            // session) — the stall must HARD-drop it for the next retry.
            serialHandlers.connect({ detail: true });

            // The reboot-aware stall timeout (3s, not the generic 10s) drops the dead link...
            vi.advanceTimersByTime(3000);
            expect(serial.disconnect).toHaveBeenCalled();
            // ...without the arming MSP round-trip a silent FC can never answer...
            expect(mspHelperInstance.setArmingEnabled).not.toHaveBeenCalled();

            // ...and the loop is still alive: the next tick reconnects.
            serial.connect.mockClear();
            vi.advanceTimersByTime(1000);
            expect(serial.connect).toHaveBeenCalledTimes(1);
        } finally {
            GUI.timeout_add.mockReset();
            vi.useRealTimers();
        }
    });

    it("a stalled handshake on the KEPT BLE session keeps riding it (no transport drop)", () => {
        vi.useFakeTimers();
        try {
            GUI.timeout_add.mockImplementation((_name, code, timeout) => setTimeout(code, timeout));

            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();
            // The kept-link stall branch checks the transport is genuinely still open.
            serial.connected = true;

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> soft reset, rebootLinkKept

            serial.connect.mockClear();
            serial.disconnect.mockClear();

            vi.advanceTimersByTime(1000); // retry rides the kept session
            expect(serial.connect).toHaveBeenCalledTimes(1);
            serialHandlers.connect({ detail: true }); // opens, FC still booting: MSP silent

            // Stall fires — but the session predates the reboot (known-good), so it is NOT
            // dropped; only the app-level state resets and the loop re-handshakes (the
            // retry tick can land on the same instant as the stall, so count totals).
            vi.advanceTimersByTime(3000);
            expect(serial.disconnect).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1000);
            expect(serial.connect).toHaveBeenCalledTimes(2);
        } finally {
            GUI.timeout_add.mockReset();
            serial.connected = false;
            vi.useRealTimers();
        }
    });

    it("BLE retries continue past the 10s serial window (driven reboots get the longer window)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush

            // Fail every open synchronously so the loop keeps ticking (abortConnection
            // resets connecting_to on the connect:false event).
            serial.connect.mockImplementation(() => {
                serialHandlers.connect({ detail: false });
            });

            serial.connect.mockClear();
            vi.advanceTimersByTime(10000); // ~11.5s after the reboot — past the old window
            expect(serial.connect).toHaveBeenCalled();

            // The loop still ends: no more attempts once the 20s driven window closes.
            vi.advanceTimersByTime(10000); // ~21.5s
            serial.connect.mockClear();
            vi.advanceTimersByTime(5000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            serial.connect.mockReset();
            vi.useRealTimers();
        }
    });

    it("re-derives the kept-link flag at tick time: an unheard transport drop is not soft-ridden", () => {
        vi.useFakeTimers();
        try {
            GUI.timeout_add.mockImplementation((_name, code, timeout) => setTimeout(code, timeout));
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();
            serial.connected = true;

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> soft reset (link kept)

            // The kept link drops while serial_backend's disconnect listener is detached
            // (between attempts): nobody hears it, but the protocol truth flips.
            serial.connected = false;

            serial.connect.mockClear();
            serial.disconnect.mockClear();
            vi.advanceTimersByTime(1000); // tick re-derives the flag, then really reconnects
            expect(serial.connect).toHaveBeenCalledTimes(1);

            // The RE-ESTABLISHED session opens but stays MSP-silent (deaf).
            serial.connected = true;
            serialHandlers.connect({ detail: true });

            // The stall must HARD-drop it — soft-riding a re-established session would
            // burn the rest of the window on a deaf link.
            vi.advanceTimersByTime(3000);
            expect(serial.disconnect).toHaveBeenCalled();
        } finally {
            // Drain the reboot loop to conclusion so its module-level state
            // (rebootReconnectTimerId, rebootLinkKept) doesn't leak into later tests.
            vi.advanceTimersByTime(30000);
            GUI.timeout_add.mockReset();
            serial.connected = false;
            vi.useRealTimers();
        }
    });

    it("a slow-but-progressing handshake is granted another stall slice; a silent one is dropped", () => {
        vi.useFakeTimers();
        try {
            GUI.timeout_add.mockImplementation((_name, code, timeout) => setTimeout(code, timeout));
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> soft reset

            serial.disconnect.mockClear();
            vi.advanceTimersByTime(1000); // retry tick -> attempt
            serialHandlers.connect({ detail: true }); // opens; stall watchdog armed (3s)

            // Bytes arrive during the first slice: the FC is answering, just slowly
            // (e.g. a BLE bridge chunking MSP into small GATT frames).
            serialHandlers.receive({ detail: { data: new Uint8Array([36]) } });

            // The progressing handshake must NOT be dropped at the 3s deadline...
            vi.advanceTimersByTime(3000);
            expect(serial.disconnect).not.toHaveBeenCalled();

            // ...but a slice with NO traffic is a genuine stall — dropped for retry.
            vi.advanceTimersByTime(3000);
            expect(serial.disconnect).toHaveBeenCalled();
        } finally {
            // Drain the reboot loop to conclusion so its module-level state
            // (rebootReconnectTimerId, rebootLinkKept) doesn't leak into later tests.
            vi.advanceTimersByTime(30000);
            GUI.timeout_add.mockReset();
            vi.useRealTimers();
        }
    });

    it("window expiry leaves an in-flight attempt alone (no disconnect under a live connect)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();
            serial.connected = true;

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // soft reset (link kept)

            // The first tick starts an attempt that never resolves: serial.connect is a
            // no-op mock, so GUI.connecting_to stays set and later ticks skip.
            serial.disconnect.mockClear();
            vi.advanceTimersByTime(25000); // past the 20s window

            // releaseKeptRebootLink must not tear the device out from under the live
            // connect coroutine; the attempt's own watchdogs own the cleanup.
            expect(serial.disconnect).not.toHaveBeenCalled();
        } finally {
            serial.connected = false;
            vi.useRealTimers();
        }
    });

    it("drops a kept BLE link for real when the reboot window expires without reconnecting", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();
            serial.connected = true; // the kept GATT session stays open underneath

            reinitializeConnection();
            vi.advanceTimersByTime(1500); // flush -> soft reset (link kept)

            // Every retry fails to open, so no attempt is live when the window closes.
            serial.connect.mockImplementation(() => {
                serialHandlers.connect({ detail: false });
            });
            serial.disconnect.mockClear();

            vi.advanceTimersByTime(25000); // past the 20s driven window

            // The kept transport must not linger open behind a "disconnected" UI.
            expect(serial.disconnect).toHaveBeenCalled();
        } finally {
            serial.connect.mockReset();
            serial.connected = false;
            vi.useRealTimers();
        }
    });

    it("mid-loop failed opens do NOT pop the connection-failed dialog (loop is the ground truth)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            reinitializeConnection();
            vi.advanceTimersByTime(1500);

            serial.connect.mockImplementation(() => {
                serialHandlers.connect({ detail: false });
            });
            dialogStore.open.mockClear();

            // Several failed attempts: after the first, the phase has left
            // REBOOTING/RECONNECTING (onOpen/abort advanced it), so only the live
            // rebootReconnectTimerId check keeps these silent.
            vi.advanceTimersByTime(4000);
            const failureDialogs = dialogStore.open.mock.calls.filter(([type]) => type === "InformationDialog");
            expect(failureDialogs).toHaveLength(0);
        } finally {
            serial.connect.mockReset();
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

// ---------------------------------------------------------------------------
// scheduleRebootReconnect — the reconnect driver for reboots initiated OUTSIDE
// serial_backend (CLI `save`/`exit` via useMspCliSession). The FC is already
// rebooting, so it must NOT send MSP_SET_REBOOT, but it must still drive the
// same flush -> drop-stale-link -> retry cycle as a BLE/manual Save & Reboot —
// BLE and manual/TCP links never re-enumerate, so auto-connect alone would
// never reconnect them.
// ---------------------------------------------------------------------------
describe("serial_backend scheduleRebootReconnect (externally-initiated reboot)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("drives the BLE disconnect/reconnect cycle without sending MSP_SET_REBOOT", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = true;
            establishConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();
            MSP.send_message.mockClear();

            scheduleRebootReconnect();

            // The CLI `save` already rebooted the FC — no reboot command may be sent.
            expect(MSP.send_message).not.toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);

            // The reconnect window is held so selectActivePort keeps the BLE selection.
            expect(getConnectionState().isReconnecting).toBe(true);

            // After the flush delay the surviving BLE link is soft-reset (GATT session kept —
            // re-establishing it is what yields deaf sessions on Linux/BlueZ)...
            vi.advanceTimersByTime(1500);
            expect(serial.disconnect).not.toHaveBeenCalled();

            // ...and the retry loop re-handshakes over it, aimed at the same device.
            vi.advanceTimersByTime(1000);
            expect(serial.connect).toHaveBeenCalled();
            expect(PortHandler.portPicker.selectedPort).toBe("bluetooth_x81jPGap0DdYcGTJyKZWyw==");
        } finally {
            vi.useRealTimers();
        }
    });

    it("honors Auto-Connect off: drops the stale link, no reconnect attempts", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";
            PortHandler.portPicker.autoConnect = false;
            establishConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();

            scheduleRebootReconnect();
            vi.advanceTimersByTime(1500);
            expect(serial.disconnect).toHaveBeenCalled();

            vi.advanceTimersByTime(10000);
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
// Characterization — pins CURRENT reboot behavior for the serial/USB path
// and the virtualMode path of reinitializeConnection(). These assert what the
// code does TODAY (not the desired end-state) so later refactor slices have a
// regression net. If a later slice intentionally changes this behavior, these
// tests are expected to be updated alongside that change.
// ---------------------------------------------------------------------------
describe("serial_backend reinitializeConnection — serial/USB reboot path (characterization)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("sends MSP_SET_REBOOT and does NOT self-drive disconnect/connect on a timer", () => {
        vi.useFakeTimers();
        try {
            // Plain USB/serial path: not bluetooth, not manual, not virtual.
            PortHandler.portPicker.selectedPort = "/dev/ttyACM0";
            PortHandler.portPicker.autoConnect = true;
            CONFIGURATOR.virtualMode = false;
            establishConnection();

            MSP.send_message.mockClear();
            serial.disconnect.mockClear();
            serial.connect.mockClear();

            const ts = reinitializeConnection(true); // suppressDialog: skip DOM modal

            // The reboot command is sent to the FC.
            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);
            // reinitializeConnection returns the reboot timestamp.
            expect(typeof ts).toBe("number");

            // Unlike the BLE/manual path, the serial path relies on the real protocol
            // "disconnect" event from the cable dropping — it does NOT schedule its own
            // disconnect or a reconnect retry loop. Advancing all timers proves no
            // serial.disconnect()/serial.connect() is driven from here.
            vi.advanceTimersByTime(20000);
            expect(serial.disconnect).not.toHaveBeenCalled();
            expect(serial.connect).not.toHaveBeenCalled();

            // Tear down: this test leaves the module "connected" (the real cable
            // disconnect never fired). Reset module isConnected so it does not leak
            // into the next describe block.
            serialHandlers.disconnect({ detail: true });
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("serial_backend reinitializeConnection — virtualMode reboot path (characterization)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMocks();
    });

    it("toggles connectDisconnect immediately (disconnect branch), then reconnects after 500ms when auto-connect is on", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.autoConnect = true;
            establishVirtualConnection();

            // No MSP_SET_REBOOT is sent for the virtual path — it just toggles the link.
            MSP.send_message.mockClear();
            serial.disconnect.mockClear();
            mspHelperInstance.setArmingEnabled.mockClear();

            reinitializeConnection();

            // Immediate toggle: isConnected is true so connectDisconnect takes the
            // disconnect branch (beginDisconnect -> setArmingEnabled with a finishClose
            // callback). The mocked setArmingEnabled does not auto-invoke its callback,
            // so drive it to complete the disconnect (virtualMode -> onClosed resets state).
            expect(MSP.send_message).not.toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);
            expect(mspHelperInstance.setArmingEnabled).toHaveBeenCalledTimes(1);
            mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.();
            expect(serial.disconnect).toHaveBeenCalledTimes(1);

            // A single follow-up toggle is scheduled 500ms later (one-shot, not a retry loop).
            // After teardown isConnected is false, so it takes the connect branch.
            serial.connect.mockClear();
            vi.advanceTimersByTime(500);
            expect(serial.connect).toHaveBeenCalledTimes(1);

            // No further toggles fire after the single 500ms shot.
            serial.connect.mockClear();
            vi.advanceTimersByTime(20000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("toggles connectDisconnect once and schedules no reconnect when auto-connect is off", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.autoConnect = false;
            establishVirtualConnection();

            serial.disconnect.mockClear();
            serial.connect.mockClear();
            mspHelperInstance.setArmingEnabled.mockClear();

            reinitializeConnection();

            // Immediate disconnect branch only; complete it via the finishClose callback.
            expect(mspHelperInstance.setArmingEnabled).toHaveBeenCalledTimes(1);
            mspHelperInstance.setArmingEnabled.mock.calls.at(-1)?.[2]?.();
            expect(serial.disconnect).toHaveBeenCalledTimes(1);

            // Auto-connect off: no 500ms reconnect is scheduled.
            vi.advanceTimersByTime(20000);
            expect(serial.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
