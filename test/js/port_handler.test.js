import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// isExpertModeEnabled gates the virtual/manual fallback in selectActivePort; force it on so
// the fallback branch is reachable in these tests.
vi.mock("../../src/js/utils/isExpertModeEnabled", () => ({
    __esModule: true,
    isExpertModeEnabled: () => true,
}));

// Keep the heavy connection/DFU dependencies inert — selectActivePort only reads a few flags.
vi.mock("../../src/js/serial.js", () => ({
    __esModule: true,
    serial: { connected: false, getConnectedPort: () => undefined },
}));
vi.mock("../../src/js/protocols/usbdfu", () => ({
    __esModule: true,
    default: { usbDevice: null, getConnectedPort: () => null },
    UsbDfuProtocol: class {},
}));
vi.mock("../../src/js/protocols/CapacitorDfuTransport", () => ({ __esModule: true, default: class {} }));
vi.mock("../../src/js/ConfigStorage", () => ({ __esModule: true, get: () => ({}) }));
vi.mock("../../src/components/eventBus", () => ({ __esModule: true, EventBus: { $emit: vi.fn() } }));
vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    __esModule: true,
    checkCompatibility: () => {},
    checkBluetoothSupport: () => false,
    checkSerialSupport: () => false,
    checkUsbSupport: () => false,
    isAndroid: () => false,
}));

import PortHandler from "../../src/js/port_handler";

describe("PortHandler.selectActivePort virtual/manual fallback guard", () => {
    beforeEach(() => {
        PortHandler.currentSerialPorts = [];
        PortHandler.currentUsbPorts = [];
        PortHandler.currentBluetoothPorts = [];
        PortHandler.showVirtualMode = true;
        PortHandler.showManualMode = false;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("does NOT demote a real, transiently-absent selection to virtual (FC reboot)", () => {
        // Simulates the USB port disappearing while the FC reboots after a save / preset-apply.
        PortHandler.portPicker.selectedPort = "/dev/ttyACM0";

        PortHandler.selectActivePort();

        expect(PortHandler.portPicker.selectedPort).toBe("noselection");
        expect(PortHandler.portPicker.selectedPort).not.toBe("virtual");
    });

    it("still falls back to virtual on a fresh start (no prior real selection)", () => {
        PortHandler.portPicker.selectedPort = "noselection";

        PortHandler.selectActivePort();

        expect(PortHandler.portPicker.selectedPort).toBe("virtual");
    });

    it("keeps virtual when already on virtual and no real device appears", () => {
        PortHandler.portPicker.selectedPort = "virtual";

        PortHandler.selectActivePort();

        expect(PortHandler.portPicker.selectedPort).toBe("virtual");
    });
});
