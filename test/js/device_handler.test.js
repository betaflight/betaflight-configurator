import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// device_handler.js pulls in ConfigStorage, the serial facade, the DFU protocol,
// the EventBus and compatibility probes. We mock each so the singleton loads in
// isolation and we can exercise selectActivePort() directly.
//
// This file pins behavior around the "preset -> virtual" regression: after a
// save/reboot with expert mode + showVirtualMode enabled, if the real port is
// transiently gone, selectActivePort() must NOT silently pick the "virtual"
// device. The durable fix gates the expert-mode virtual/manual fallback on
// getConnectionState().isReconnecting being false — see the tests below.
// ---------------------------------------------------------------------------

const { serial, dfuProtocol, isExpertModeEnabled } = vi.hoisted(() => {
    return {
        serial: {
            connected: false,
            connectionId: null,
            getConnectedDevice: vi.fn(() => null),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getDevices: vi.fn(async () => []),
            requestPermissionDevice: vi.fn(),
        },
        dfuProtocol: {
            usbDevice: null,
            getConnectedDevice: vi.fn(() => null),
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

import DeviceHandler from "../../src/js/device_handler";
import { getConnectionState, __resetConnectionStateForTests } from "../../src/js/connection_state.js";

// "Reconnect in progress" is now the connection state being in REBOOTING/RECONNECTING
// while the previously-selected port stays put (was a frozen reconnect token, and
// before that DeviceHandler.pinnedReconnectTarget). Helper to simulate it: select the
// device, then enter the reconnect window.
function pinReconnectTarget(path) {
    DeviceHandler.devicePicker.selectedDevice = path;
    getConnectionState().requestReboot();
}

function resetPortHandler() {
    vi.clearAllMocks();
    __resetConnectionStateForTests();
    serial.connected = false;
    serial.connectionId = null;
    dfuProtocol.usbDevice = null;
    isExpertModeEnabled.mockReturnValue(true);
    DeviceHandler.currentSerialPorts = [];
    DeviceHandler.currentUsbPorts = [];
    DeviceHandler.currentBluetoothPorts = [];
    DeviceHandler.showVirtualMode = false;
    DeviceHandler.showManualMode = false;
    DeviceHandler.devicePicker.selectedDevice = "noselection";
}

describe("DeviceHandler.selectActivePort — preset/reboot -> virtual regression", () => {
    beforeEach(() => {
        resetPortHandler();
    });

    // FIXED behavior. While a reconnect is in progress (isReconnecting), the rebooting device
    // is only transiently gone from the lists. selectActivePort() must NOT hijack the selection
    // with the expert-mode "virtual" fallback; it keeps the previously-selected real target so
    // the device re-selects itself once it re-enumerates.
    it("does NOT select 'virtual' when the real port is transiently gone during a reboot (expert + showVirtualMode on)", () => {
        // Reboot in progress: the real serial device has briefly dropped off the list, and the
        // connection state is in the reconnect window aimed at the device we are reconnecting to.
        DeviceHandler.currentSerialPorts = [];
        DeviceHandler.currentUsbPorts = [];
        DeviceHandler.currentBluetoothPorts = [];
        pinReconnectTarget("/dev/ttyACM0");

        // Expert mode + virtual mode are both enabled (the regression's precondition).
        isExpertModeEnabled.mockReturnValue(true);
        DeviceHandler.showVirtualMode = true;

        const selected = DeviceHandler.selectActivePort();

        // The selection must not be hijacked to "virtual" mid-reboot — it stays on the pinned target.
        expect(selected).not.toBe("virtual");
        expect(DeviceHandler.devicePicker.selectedDevice).not.toBe("virtual");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("/dev/ttyACM0");
    });

    // Companion: when NO reconnect is in progress (isReconnecting false), the normal startup
    // expert-mode fallback still surfaces "virtual". This pins that the guard is scoped to the
    // reconnect window and does not break ordinary virtual-mode selection.
    it("still falls back to 'virtual' on normal startup (no reconnect pinned)", () => {
        DeviceHandler.currentSerialPorts = [];
        __resetConnectionStateForTests(); // IDLE => not reconnecting
        isExpertModeEnabled.mockReturnValue(true);
        DeviceHandler.showVirtualMode = true;

        const selected = DeviceHandler.selectActivePort();

        expect(selected).toBe("virtual");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("virtual");
    });

    // The same guard applies to the "manual" fallback during a reconnect.
    it("does NOT select 'manual' while a reconnect is pinned (expert + showManualMode on)", () => {
        DeviceHandler.currentSerialPorts = [];
        pinReconnectTarget("bluetooth-0011");
        isExpertModeEnabled.mockReturnValue(true);
        DeviceHandler.showManualMode = true;

        const selected = DeviceHandler.selectActivePort();

        expect(selected).not.toBe("manual");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("bluetooth-0011");
    });

    it("does NOT select 'virtual' when expert mode is off (even if showVirtualMode is on)", () => {
        DeviceHandler.currentSerialPorts = [];
        isExpertModeEnabled.mockReturnValue(false);
        DeviceHandler.showVirtualMode = true;

        const selected = DeviceHandler.selectActivePort();

        expect(selected).not.toBe("virtual");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("noselection");
    });

    // Regression for the connected-device highlight: getConnectedDevice() returns
    // transport-specific values (raw Web Serial ports, native handles, strings) that never
    // equal the wrapper objects in currentSerialPorts, so the old object-identity match was
    // dead for every transport. Matching on the stable connectionId (== device path) fixes it.
    it("selects the connected serial device by connectionId, not object identity", () => {
        const connected = { path: "/dev/ttyACM0", displayName: "Betaflight STM32" };
        DeviceHandler.currentSerialPorts = [{ path: "/dev/ttyUSB9", displayName: "other" }, connected];
        serial.connected = true;
        serial.connectionId = "/dev/ttyACM0";
        // Transport returns something that is NOT the wrapper object held in the list.
        serial.getConnectedDevice.mockReturnValue({ rawHandle: true });

        const selected = DeviceHandler.selectActivePort();

        expect(selected).toBe("/dev/ttyACM0");
    });

    // BLE-connected devices live in currentBluetoothPorts, not currentSerialPorts, but
    // still carry connectionId == path. The connected lookup must search both lists.
    it("selects the connected Bluetooth device by connectionId", () => {
        const connected = { path: "bluetooth_ab12", displayName: "Betaflight BLE" };
        DeviceHandler.currentBluetoothPorts = [connected];
        serial.connected = true;
        serial.connectionId = "bluetooth_ab12";
        serial.getConnectedDevice.mockReturnValue({ rawBleHandle: true });

        const selected = DeviceHandler.selectActivePort();

        expect(selected).toBe("bluetooth_ab12");
    });
});

describe("DeviceHandler show* setters", () => {
    beforeEach(() => {
        resetPortHandler();
    });

    // setShowAllSerialDevices must refresh the active selection like its siblings
    // (setShowVirtualMode / setShowManualMode) — toggling the filter changes which
    // devices are visible, so the active device has to be re-evaluated.
    it("setShowAllSerialDevices triggers selectActivePort, matching the other show* setters", () => {
        const spy = vi.spyOn(DeviceHandler, "selectActivePort");

        DeviceHandler.setShowAllSerialDevices(true);

        expect(DeviceHandler.showAllSerialDevices).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);

        spy.mockRestore();
    });
});
