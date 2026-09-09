import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Regression tests for the DFU open-failure path.
//
// On Linux the kernel exposes a USB device node the user can only read unless a
// udev rule grants write access for that vendor ID. WebUSB `open()` then fails
// with a SecurityError ("Access denied"), which reads as a configurator bug
// unless the udev cause is spelled out — see a fresh X32 bootloader (0x3997).
//
// The teardown that follows a failed open must also stay quiet: no interface was
// ever claimed, so releasing one is a no-op rather than a TypeError on a null
// device.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/gui", () => ({ default: { connect_lock: false } }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
vi.mock("../../src/js/utils/checkCompatibility", () => ({ getOS: vi.fn() }));
// Prevent the module-bottom `new WebUsbDfuTransport()` from touching navigator.usb.
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

const { UsbDfuProtocol } = await import("../../src/js/protocols/usbdfu");
const { gui_log } = await import("../../src/js/gui_log");
const { getOS } = await import("../../src/js/utils/checkCompatibility");
const RealWebUsbDfuTransport = (await vi.importActual("../../src/js/protocols/WebUsbDfuTransport")).default;

/** Transport whose open() always rejects, recording the teardown that follows. */
class FailingOpenTransport extends EventTarget {
    constructor(error) {
        super();
        this.error = error;
        this.released = [];
        this.closeCount = 0;
    }
    open() {
        return Promise.reject(this.error);
    }
    releaseInterface(interfaceNumber) {
        this.released.push(interfaceNumber);
        return Promise.resolve();
    }
    close() {
        this.closeCount++;
        return Promise.resolve();
    }
    getConnectedDevice() {
        return null;
    }
}

const accessDenied = () => {
    const error = new Error("Failed to execute 'open' on 'USBDevice': Access denied.");
    error.name = "SecurityError";
    return error;
};

/** Drive openDevice() and let its promise chain (including cleanup) settle. */
async function runOpen(transport) {
    const dfu = new UsbDfuProtocol(transport);
    dfu.connectedDevice = { path: "usb_test", port: {} };
    dfu.openDevice();
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
    return dfu;
}

describe("DFU open failure diagnostics", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("points at udev rules when Linux denies access to the device node", async () => {
        getOS.mockReturnValue("Linux");

        await runOpen(new FailingOpenTransport(accessDenied()));

        const messages = gui_log.mock.calls.map(([message]) => message);
        expect(messages).toContain("usbDeviceOpenFail");
        expect(messages).toContain("usbDeviceUdevNotice");
    });

    it("omits the udev hint on platforms that have no udev", async () => {
        getOS.mockReturnValue("Windows");

        await runOpen(new FailingOpenTransport(accessDenied()));

        const messages = gui_log.mock.calls.map(([message]) => message);
        expect(messages).toContain("usbDeviceOpenFail");
        expect(messages).not.toContain("usbDeviceUdevNotice");
    });

    it("omits the udev hint for open failures that are not access denials", async () => {
        getOS.mockReturnValue("Linux");
        const error = new Error("The device was disconnected.");
        error.name = "NetworkError";

        await runOpen(new FailingOpenTransport(error));

        const messages = gui_log.mock.calls.map(([message]) => message);
        expect(messages).toContain("usbDeviceOpenFail");
        expect(messages).not.toContain("usbDeviceUdevNotice");
    });

    it("closes the device during cleanup after a failed open", async () => {
        getOS.mockReturnValue("Linux");
        const transport = new FailingOpenTransport(accessDenied());

        await runOpen(transport);

        expect(transport.released).toEqual([0]);
        expect(transport.closeCount).toBe(1);
    });

    it("treats releaseInterface as a no-op when no device was ever opened", async () => {
        const transport = new RealWebUsbDfuTransport();
        transport.usbDevice = null;

        await expect(transport.releaseInterface(0)).resolves.toBeUndefined();
    });
});
