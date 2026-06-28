import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// port_handler.js pulls in ConfigStorage, the serial facade, the DFU protocol,
// the EventBus and compatibility probes. We mock each so the singleton loads in
// isolation and we can exercise selectActivePort() directly.
//
// This file pins behavior around the "preset -> virtual" regression: after a
// save/reboot with expert mode + showVirtualMode enabled, if the real port is
// transiently gone, selectActivePort() must NOT silently pick the "virtual"
// device. See the it.fails test below.
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

function resetPortHandler() {
    vi.clearAllMocks();
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

    // DESIRED behavior (S1 target). On THIS branch selectActivePort still falls back
    // to "virtual" whenever expert mode + showVirtualMode are on and no real port is
    // listed — which happens transiently during a save/reboot, hijacking the selection.
    // The body asserts the FIXED behavior, so it fails today and auto-flips green when
    // S1 lands. // flips to it() in S1
    it.fails(
        "does NOT select 'virtual' when the real port is transiently gone during a reboot (expert + showVirtualMode on)",
        () => {
            // Reboot in progress: the real serial device has briefly dropped off the list.
            PortHandler.currentSerialPorts = [];
            PortHandler.currentUsbPorts = [];
            PortHandler.currentBluetoothPorts = [];

            // Expert mode + virtual mode are both enabled (the regression's precondition).
            isExpertModeEnabled.mockReturnValue(true);
            PortHandler.showVirtualMode = true;

            const selected = PortHandler.selectActivePort();

            // The selection must not be hijacked to "virtual" mid-reboot.
            expect(selected).not.toBe("virtual");
            expect(PortHandler.portPicker.selectedPort).not.toBe("virtual");
        },
    );

    // Characterization companion (always green): documents that TODAY the very same
    // preconditions DO produce "virtual". This is the current bug, pinned so the
    // direction of the fix is unambiguous. When S1 lands, this characterization is
    // expected to be updated alongside the it.fails -> it() flip above.
    it("currently DOES fall back to 'virtual' under those preconditions (documents the bug)", () => {
        PortHandler.currentSerialPorts = [];
        isExpertModeEnabled.mockReturnValue(true);
        PortHandler.showVirtualMode = true;

        const selected = PortHandler.selectActivePort();

        expect(selected).toBe("virtual");
        expect(PortHandler.portPicker.selectedPort).toBe("virtual");
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
