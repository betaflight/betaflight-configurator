import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseConnectDeeplink } from "../../src/js/utils/connectDeeplink";

describe("parseConnectDeeplink", () => {
    it("accepts a wss:// target", () => {
        expect(parseConnectDeeplink("?connect=wss://quad.local:5761")).toBe("wss://quad.local:5761");
    });

    it("accepts ws:// and tcp:// targets", () => {
        expect(parseConnectDeeplink("?connect=ws://127.0.0.1:6761")).toBe("ws://127.0.0.1:6761");
        expect(parseConnectDeeplink("?connect=tcp://192.168.4.1:5761")).toBe("tcp://192.168.4.1:5761");
    });

    it("trims surrounding whitespace", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("  wss://host:5761  ")}`)).toBe("wss://host:5761");
    });

    it("preserves a path on the target", () => {
        expect(parseConnectDeeplink("?connect=wss://host:5761/mavlink")).toBe("wss://host:5761/mavlink");
    });

    it("ignores other query parameters", () => {
        expect(parseConnectDeeplink("?foo=bar&connect=wss://host:5761&baz=1")).toBe("wss://host:5761");
    });

    it("returns null when there is no connect parameter", () => {
        expect(parseConnectDeeplink("")).toBeNull();
        expect(parseConnectDeeplink("?other=1")).toBeNull();
    });

    it("rejects a serial device path — it names hardware on one machine only", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("/dev/ttyUSB0")}`)).toBeNull();
        expect(parseConnectDeeplink("?connect=COM3")).toBeNull();
    });

    it("rejects a bare host with no scheme", () => {
        expect(parseConnectDeeplink("?connect=192.168.4.1:5761")).toBeNull();
    });

    it("rejects disallowed schemes", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("http://host:5761")}`)).toBeNull();
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("javascript:alert(1)")}`)).toBeNull();
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("file:///etc/passwd")}`)).toBeNull();
    });

    it("rejects a scheme with no host", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("wss://")}`)).toBeNull();
    });

    it("rejects a target carrying a fragment — the parser drops it before connectFromDeeplink forwards the target", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("wss://host:5761#frag")}`)).toBeNull();
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("wss://host:5761/mavlink#frag")}`)).toBeNull();
    });

    it("rejects an over-long value", () => {
        const target = `wss://${"a".repeat(300)}.local:5761`;
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent(target)}`)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// initializeSerialBackend integration: exercise the whole connectFromDeeplink flow
// (parse -> persist -> select "manual" -> open the transport) rather than poking
// selectedDevice/portOverride by hand, so a regression anywhere along it is caught.
//
// serial_backend.js pulls in a huge import graph (MSP, MSPHelper, FC, localization,
// Analytics, BuildApi, crypto, ...), so every collaborator is mocked to load it in
// isolation — the same manual-target setup used by serial_backend.test.js. Shared
// mutable objects live in vi.hoisted() because vi.mock factories hoist above the
// module-level declarations that would otherwise define them.
// ---------------------------------------------------------------------------
const { GUI, serial, serialHandlers, eventHandlers, setConfig, mspHelperInstance } = vi.hoisted(() => {
    const serialHandlers: Record<string, (event: unknown) => void> = {};
    const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
    return {
        GUI: {
            connect_lock: false,
            connected_to: false,
            connecting_to: false,
            active_tab: "landing",
            allowedTabs: [],
            defaultAllowedTabsWhenDisconnected: ["landing", "firmware_flasher"],
            timeout_kill_all: vi.fn(),
            interval_kill_all: vi.fn(),
            timeout_add: vi.fn(),
            timeout_remove: vi.fn(),
            tab_switch_cleanup: vi.fn((cb: () => void) => cb && cb()),
            showCliPanel: vi.fn(),
            selectDefaultTabWhenConnected: vi.fn(),
        },
        serialHandlers,
        eventHandlers,
        serial: {
            connected: false,
            addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => {
                serialHandlers[type] = handler;
            }),
            removeEventListener: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            forceClose: vi.fn(),
        },
        // ConfigStorage.set — connectFromDeeplink persists the target as portOverride.
        setConfig: vi.fn(),
        mspHelperInstance: {
            setArmingEnabled: vi.fn(),
            process_data: vi.fn(),
            crunch: vi.fn(() => []),
            RESET_TYPES: { CUSTOM_DEFAULTS: 0 },
        },
    };
});

vi.mock("../../src/js/gui.js", () => ({ __esModule: true, default: GUI, TABS: {} }));
vi.mock("../../src/js/serial.js", () => ({ __esModule: true, serial }));
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
vi.mock("../../src/js/msp/MSPHelper", () => ({ __esModule: true, default: vi.fn(() => mspHelperInstance) }));
vi.mock("../../src/js/msp/MSPCodes", () => ({ __esModule: true, default: new Proxy({}, { get: (_t, p) => p }) }));
vi.mock("../../src/js/port_usage", () => ({ __esModule: true, default: { initialize: vi.fn(), reset: vi.fn() } }));
vi.mock("../../src/js/device_handler", () => ({
    __esModule: true,
    default: {
        initialize: vi.fn(),
        devicePickerDisabled: false,
        portAvailable: false,
        isKnownDevicePath: vi.fn(() => false),
        describeDevice: vi.fn((path: string) => ({ path, vendorId: 1155, productId: 22336 })),
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
vi.mock("../../src/js/vue_tab_mounter", () => ({ __esModule: true, unmountVueTab: vi.fn() }));
vi.mock("../../src/js/tab_switch", () => ({ __esModule: true, switchTab: vi.fn() }));
vi.mock("../../src/stores/dialog", () => ({
    __esModule: true,
    useDialogStore: () => ({ activeDialog: null, open: vi.fn(), close: vi.fn(), updateProps: vi.fn() }),
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
            flightControllerIdentifier: "BTFL",
            boardType: 0,
            buildOptions: [],
            buildKey: "",
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
    tracking: { sendEvent: vi.fn(), EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" } },
}));
vi.mock("../../src/js/localization", () => ({ __esModule: true, i18n: { getMessage: (k: string) => k } }));
vi.mock("../../src/js/gui_log", () => ({ __esModule: true, gui_log: vi.fn() }));
vi.mock("../../src/js/Features", () => ({ __esModule: true, default: vi.fn() }));
vi.mock("../../src/js/Beepers", () => ({ __esModule: true, default: vi.fn() }));
vi.mock("../../src/js/VirtualFC", () => ({ __esModule: true, default: { setVirtualConfig: vi.fn() } }));
vi.mock("../../src/js/BuildApi", () => ({ __esModule: true, default: vi.fn() }));
vi.mock("../../src/js/bit.js", () => ({ __esModule: true, bit_check: () => false }));
vi.mock("../../src/js/sensor_helpers", () => ({ __esModule: true, have_sensor: () => false }));
vi.mock("../../src/js/utils/updateTabList", () => ({ __esModule: true, updateTabList: vi.fn() }));
vi.mock("../../src/js/utils/applyExpertMode", () => ({ __esModule: true, applyExpertMode: vi.fn() }));
// get is unused by this flow; set is what connectFromDeeplink persists the target through.
vi.mock("../../src/js/ConfigStorage", () => ({ __esModule: true, get: () => ({}), set: setConfig }));
vi.mock("../../src/js/utils/connection", () => ({ __esModule: true, ispConnected: () => false }));
// Capture the auto-select listener that initializeSerialBackend registers, so the test can
// fire the event asynchronous device discovery raises once it settles on a serial device.
vi.mock("../../src/components/eventBus", () => ({
    __esModule: true,
    EventBus: {
        $on: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
            eventHandlers[name] = cb;
        }),
        $emit: vi.fn(),
    },
}));

import { initializeSerialBackend } from "../../src/js/serial_backend";
import DeviceHandler from "../../src/js/device_handler";
import { __resetConnectionStateForTests } from "../../src/js/connection_state.js";

const DEEPLINK_TARGET = "tcp://192.168.4.1:5761";

// A shared connect link opens the manual connection it names: the address travels as a `?connect=`
// query parameter, is persisted as portOverride and reaches the transport through the "manual"
// pseudo-device. Once connecting, the picker must stay on "manual" even as device enumeration
// finishes and offers a serial port — a deeplink target is not one of the enumerated devices.
describe("initializeSerialBackend — connect deeplink", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(serialHandlers).forEach((k) => delete serialHandlers[k]);
        Object.keys(eventHandlers).forEach((k) => delete eventHandlers[k]);
        GUI.connect_lock = false;
        GUI.connected_to = false;
        GUI.connecting_to = false;
        GUI.active_tab = "landing";
        serial.connected = false;
        DeviceHandler.devicePicker.selectedDevice = "noselection";
        DeviceHandler.devicePicker.portOverride = "/dev/rfcomm0";
        // A discovered serial port would auto-select and connect if the deeplink attempt did not
        // already own the connection — Auto-Connect on makes the guard the only thing suppressing it.
        DeviceHandler.devicePicker.autoConnect = true;
        __resetConnectionStateForTests();
        // Put the target in the URL exactly as a shared link would; connectFromDeeplink reads
        // window.location.search and then strips the parameter via history.replaceState.
        window.history.replaceState(null, "", `/?connect=${DEEPLINK_TARGET}`);
    });

    it("connects to the deeplink target through the manual pseudo-device and holds it through device discovery", async () => {
        initializeSerialBackend();

        // Persisted so the connect UI labels it and a manual reconnect can reuse it.
        expect(setConfig).toHaveBeenCalledWith({ portOverride: DEEPLINK_TARGET });
        // Opened via the "manual" pseudo-device: the picker holds "manual" and the address rides portOverride.
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("manual");
        expect(DeviceHandler.devicePicker.portOverride).toBe(DEEPLINK_TARGET);
        // The transport is opened on the deeplink address, not the picker's device path.
        expect(serial.connect).toHaveBeenCalledTimes(1);
        expect(serial.connect.mock.calls[0][0]).toBe(DEEPLINK_TARGET);
        expect(GUI.connecting_to).toBe(DEEPLINK_TARGET);

        // The connect deeplink is single-use: the parameter must not linger to reconnect on refresh.
        expect(window.location.search).toBe("");

        // Device enumeration is asynchronous; let it settle, then deliver the auto-select event it
        // raises when it finds a serial port. The in-flight deeplink connect (GUI.connecting_to set)
        // must make that listener stand down instead of stealing the connection.
        await Promise.resolve();
        const autoSelect = eventHandlers["device-handler:auto-select-serial-device"];
        expect(autoSelect).toBeTypeOf("function");

        serial.connect.mockClear();
        autoSelect();

        // No competing open, and the selection is still the manual deeplink target.
        expect(serial.connect).not.toHaveBeenCalled();
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("manual");
    });
});
