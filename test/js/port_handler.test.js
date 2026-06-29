import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// port_handler.js pulls in ConfigStorage, the serial facade, the DFU protocol,
// the EventBus and compatibility probes. We mock each so the singleton loads in
// isolation and we can exercise selectActivePort() directly.
//
// This file pins behavior around the "preset -> virtual" regression: after a
// save/reboot with expert mode + showVirtualMode enabled, if the real port is
// transiently gone, selectActivePort() must NOT silently pick the "virtual"
// device. The durable fix (S1a) gates the expert-mode virtual/manual fallback on
// PortHandler.pinnedReconnectTarget being null — see the tests below.
// ---------------------------------------------------------------------------

const { serial, dfuProtocol, isExpertModeEnabled } = vi.hoisted(() => {
    return {
        serial: {
            connected: false,
            getConnectedPort: vi.fn(() => null),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getDevices: vi.fn(async () => []),
            requestPermissionDevice: vi.fn(),
        },
        dfuProtocol: {
            usbDevice: null,
            getConnectedPort: vi.fn(() => null),
            getDevices: vi.fn(async () => []),
            requestPermission: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        },
        isExpertModeEnabled: vi.fn(() => true),
    };
});

vi.mock("../../src/js/serial.js", () => ({
    __esModule: true,
    serial,
}));

vi.mock("../../src/js/protocols/usbdfu", () => ({
    __esModule: true,
    default: dfuProtocol,
    UsbDfuProtocol: class {},
}));

vi.mock("../../src/js/protocols/CapacitorDfuTransport", () => ({
    __esModule: true,
    default: class {},
}));

vi.mock("../../src/js/utils/isExpertModeEnabled", () => ({
    __esModule: true,
    isExpertModeEnabled,
}));

vi.mock("../../src/components/eventBus", () => ({
    __esModule: true,
    EventBus: { $on: vi.fn(), $emit: vi.fn() },
}));

vi.mock("../../src/js/ConfigStorage", () => ({
    __esModule: true,
    get: (key, fallback) => ({ [key]: fallback }),
}));

vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    __esModule: true,
    checkCompatibility: vi.fn(),
    checkBluetoothSupport: () => true,
    checkSerialSupport: () => true,
    checkUsbSupport: () => true,
    isAndroid: () => false,
}));

import PortHandler from "../../src/js/port_handler";
import { getConnectionState, __resetConnectionStateForTests } from "../../src/js/connection_state.js";

// "Reconnect in progress" is now the connection state holding a frozen reconnect token (was
// PortHandler.pinnedReconnectTarget). Helper to simulate it with a path-only token.
function pinReconnectTarget(path) {
    getConnectionState().freezeReconnectToken({ transportType: "unknown", opaqueId: path, baud: 0, isVirtual: false });
}

function resetPortHandler() {
    vi.clearAllMocks();
    __resetConnectionStateForTests();
    serial.connected = false;
    dfuProtocol.usbDevice = null;
    isExpertModeEnabled.mockReturnValue(true);
    PortHandler.currentSerialPorts = [];
    PortHandler.currentUsbPorts = [];
    PortHandler.currentBluetoothPorts = [];
    PortHandler.showVirtualMode = false;
    PortHandler.showManualMode = false;
    PortHandler.portPicker.selectedPort = "noselection";
}

describe("PortHandler.selectActivePort — preset/reboot -> virtual regression", () => {
    beforeEach(() => {
        resetPortHandler();
    });

    // S1a FIXED behavior. While a reconnect is in progress (pinnedReconnectTarget set), the
    // rebooting device is only transiently gone from the lists. selectActivePort() must NOT
    // hijack the selection with the expert-mode "virtual" fallback; it keeps aiming at the
    // pinned real target so the device re-selects itself once it re-enumerates.
    it("does NOT select 'virtual' when the real port is transiently gone during a reboot (expert + showVirtualMode on)", () => {
        // Reboot in progress: the real serial device has briefly dropped off the list, and
        // serial_backend has pinned the device we are reconnecting to.
        PortHandler.currentSerialPorts = [];
        PortHandler.currentUsbPorts = [];
        PortHandler.currentBluetoothPorts = [];
        pinReconnectTarget("/dev/ttyACM0");

        // Expert mode + virtual mode are both enabled (the regression's precondition).
        isExpertModeEnabled.mockReturnValue(true);
        PortHandler.showVirtualMode = true;

        const selected = PortHandler.selectActivePort();

        // The selection must not be hijacked to "virtual" mid-reboot — it stays on the pinned target.
        expect(selected).not.toBe("virtual");
        expect(PortHandler.portPicker.selectedPort).not.toBe("virtual");
        expect(PortHandler.portPicker.selectedPort).toBe("/dev/ttyACM0");
    });

    // Companion: when NO reconnect is in progress (pinnedReconnectTarget null), the normal
    // startup expert-mode fallback still surfaces "virtual". This pins that the guard is
    // scoped to the reconnect window and does not break ordinary virtual-mode selection.
    it("still falls back to 'virtual' on normal startup (no reconnect pinned)", () => {
        PortHandler.currentSerialPorts = [];
        __resetConnectionStateForTests(); // no reconnect token => not reconnecting
        isExpertModeEnabled.mockReturnValue(true);
        PortHandler.showVirtualMode = true;

        const selected = PortHandler.selectActivePort();

        expect(selected).toBe("virtual");
        expect(PortHandler.portPicker.selectedPort).toBe("virtual");
    });

    // The same guard applies to the "manual" fallback during a reconnect.
    it("does NOT select 'manual' while a reconnect is pinned (expert + showManualMode on)", () => {
        PortHandler.currentSerialPorts = [];
        pinReconnectTarget("bluetooth-0011");
        isExpertModeEnabled.mockReturnValue(true);
        PortHandler.showManualMode = true;

        const selected = PortHandler.selectActivePort();

        expect(selected).not.toBe("manual");
        expect(PortHandler.portPicker.selectedPort).toBe("bluetooth-0011");
    });

    it("does NOT select 'virtual' when expert mode is off (even if showVirtualMode is on)", () => {
        PortHandler.currentSerialPorts = [];
        isExpertModeEnabled.mockReturnValue(false);
        PortHandler.showVirtualMode = true;

        const selected = PortHandler.selectActivePort();

        expect(selected).not.toBe("virtual");
        expect(PortHandler.portPicker.selectedPort).toBe("noselection");
    });
});
