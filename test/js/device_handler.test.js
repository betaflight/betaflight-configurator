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

const { serial, dfuProtocol, isExpertModeEnabled, TauriDfuTransportMock } = vi.hoisted(() => {
    return {
        TauriDfuTransportMock: class {},
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
    // Captures the transport it wraps so the createDfuProtocol() routing tests can
    // assert which transport was chosen; the listener API is what DeviceHandler's
    // constructor touches.
    UsbDfuProtocol: class {
        constructor(transport) {
            this.transport = transport;
            this.usbDevice = null;
            this.getConnectedDevice = vi.fn(() => null);
            this.getDevices = vi.fn(async () => []);
            this.requestPermission = vi.fn();
            this.addEventListener = vi.fn();
            this.removeEventListener = vi.fn();
        }
    },
}));

vi.mock("../../src/js/protocols/CapacitorDfuTransport", () => ({
    __esModule: true,
    default: class {},
}));

vi.mock("../../src/js/protocols/TauriDfuTransport", () => ({
    __esModule: true,
    default: TauriDfuTransportMock,
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
    isTauri: () => true,
    isTauriAndroid: () => false,
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

    // Bridges found over mDNS live in currentTcpPorts under a tcp:// path.
    it("selects the connected bridge by connectionId", () => {
        const connected = { path: "tcp://10.1.1.208:5761", displayName: "betaflight-bridge-f8a260" };
        DeviceHandler.currentTcpPorts = [connected];
        serial.connected = true;
        serial.connectionId = "tcp://10.1.1.208:5761";
        serial.getConnectedDevice.mockReturnValue({ rawSocket: true });

        const selected = DeviceHandler.selectActivePort();

        expect(selected).toBe("tcp://10.1.1.208:5761");
    });
});

// Regression. On Linux the FC gives two ports quickly, because udev and ModemManager remove
// the CDC-ACM node and add it again. Only the second port stays in the list after the refresh.
// The addedDevice event of the first port put a dead path in the selection. Auto-connect then
// used that path and failed with "[WEBSERIAL] Device not found: serial_5".
describe("DeviceHandler.selectActivePort — stale addedDevice suggestion", () => {
    beforeEach(() => {
        resetPortHandler();
    });

    it("ignores a suggested device that is no longer in the refreshed lists", () => {
        const ghost = { path: "serial_5", displayName: "Betaflight STM Electronics" };
        const real = { path: "serial_6", displayName: "Betaflight STM Electronics" };
        // The refresh removed the first port. The list holds the second port only.
        DeviceHandler.currentSerialPorts = [real];

        const selected = DeviceHandler.selectActivePort(ghost);

        expect(selected).not.toBe("serial_5");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("serial_6");
    });

    it("still honours a suggested device that is present in the refreshed lists", () => {
        const real = { path: "serial_6", displayName: "Betaflight STM Electronics" };
        DeviceHandler.currentSerialPorts = [real];

        const selected = DeviceHandler.selectActivePort(real);

        expect(selected).toBe("serial_6");
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("serial_6");
    });

    // Only the suggestion can select a device that the AT32/CP210/SPR/STM filter does not
    // match. The check on the suggestion must not apply that filter too.
    it("honours a present suggestion whose displayName does not match the device filter", () => {
        const odd = { path: "serial_7", displayName: "Betaflight VID:1234 PID:5678" };
        DeviceHandler.currentSerialPorts = [odd];

        const selected = DeviceHandler.selectActivePort(odd);

        expect(selected).toBe("serial_7");
    });

    it("falls through to 'noselection' when the only suggestion is a ghost", () => {
        DeviceHandler.currentSerialPorts = [];
        isExpertModeEnabled.mockReturnValue(false);

        const selected = DeviceHandler.selectActivePort({ path: "serial_5", displayName: "Betaflight STM" });

        expect(selected).toBeUndefined();
        expect(DeviceHandler.devicePicker.selectedDevice).toBe("noselection");
    });
});

// A rebooting device usually comes back under a NEW path — the browser mints a fresh
// SerialPort object — so "is it back?" cannot be a path comparison, and it must not degrade
// into "is anything back?" either.
describe("DeviceHandler reboot-target identity", () => {
    beforeEach(() => {
        resetPortHandler();
    });

    const fc = { path: "serial_6", displayName: "Betaflight STM Electronics", vendorId: 1155, productId: 22336 };
    const other = { path: "serial_2", displayName: "Betaflight CP210", vendorId: 4292, productId: 60000 };

    it("describes a listed device, and nothing for one that is not listed", () => {
        DeviceHandler.currentSerialPorts = [fc];

        expect(DeviceHandler.describeDevice("serial_6")).toEqual({
            path: "serial_6",
            vendorId: 1155,
            productId: 22336,
        });
        expect(DeviceHandler.describeDevice("serial_99")).toBeNull();
    });

    it("finds the device again under a new path, by make", () => {
        const target = { path: "serial_6", vendorId: 1155, productId: 22336 };
        DeviceHandler.currentSerialPorts = [other, { ...fc, path: "serial_13" }];

        expect(DeviceHandler.findDescribedDevice(target)?.path).toBe("serial_13");
    });

    it("does not match on absent USB ids — a port without them is not 'the same make'", () => {
        // SerialPortInfo has usbVendorId/usbProductId for USB ports only. Two platform-native
        // ports (built-in COM, Bluetooth SPP) both carry undefined, and undefined === undefined
        // would pair them up.
        const target = { path: "serial_6", vendorId: undefined, productId: undefined };
        DeviceHandler.currentSerialPorts = [{ path: "serial_1", displayName: "COM3" }];

        expect(DeviceHandler.findDescribedDevice(target)).toBeUndefined();
    });

    it("does not mistake another device for it", () => {
        const target = { path: "serial_6", vendorId: 1155, productId: 22336 };
        DeviceHandler.currentSerialPorts = [other];

        expect(DeviceHandler.findDescribedDevice(target)).toBeUndefined();
        expect(DeviceHandler.findDescribedDevice(null)).toBeUndefined();
    });

    it("selectActivePort prefers the rebooted device over another that just appeared", () => {
        // The burst case: our FC comes back as serial_13 while an unrelated device is added
        // too. Without the preference the selection follows whichever event arrived last.
        DeviceHandler.currentSerialPorts = [other, { ...fc, path: "serial_13" }];
        getConnectionState().requestReboot(10000, { path: "serial_6", vendorId: 1155, productId: 22336 });

        const selected = DeviceHandler.selectActivePort(other);

        expect(selected).toBe("serial_13");
    });

    it("is a preference, not a lock: an unrecognised return still gets selected", () => {
        // A board that comes back as something else (different USB descriptor) must not be
        // locked out — the normal rules still apply when the target is not found.
        DeviceHandler.currentSerialPorts = [other];
        getConnectionState().requestReboot(10000, { path: "serial_6", vendorId: 1155, productId: 22336 });

        expect(DeviceHandler.selectActivePort(other)).toBe("serial_2");
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

describe("createDfuProtocol routing", () => {
    // dfuProtocol is chosen at module scope, so exercising the Tauri Android branch
    // needs a fresh module graph with isTauriAndroid flipped before the re-import.
    it("wraps the Tauri transport on Tauri Android", async () => {
        vi.resetModules();
        vi.doMock("../../src/js/utils/checkCompatibility.js", () => ({
            __esModule: true,
            checkCompatibility: vi.fn(),
            checkBluetoothSupport: () => true,
            checkSerialSupport: () => true,
            checkUsbSupport: () => true,
            isAndroid: () => false,
            isTauri: () => true,
            isTauriAndroid: () => true,
        }));

        try {
            const { default: handler } = await import("../../src/js/device_handler");

            expect(handler.dfuProtocol).not.toBe(dfuProtocol);
            expect(handler.dfuProtocol.transport).toBeInstanceOf(TauriDfuTransportMock);
        } finally {
            vi.doUnmock("../../src/js/utils/checkCompatibility.js");
            vi.resetModules();
        }
    });
});
