import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ---------------------------------------------------------------------------
// Regression tests for the DFU open-failure path.
//
// On Linux the kernel exposes a USB device node the user can only read unless a
// udev rule grants write access for that vendor ID. WebUSB `open()` then fails
// with a SecurityError ("Access denied"), which reads as a configurator bug
// unless the udev cause is spelled out — see a fresh X32 bootloader (0x3997).
// On Windows the same error means a non-WinUSB driver is bound to the device.
//
// Every failure has to land in the flash status and hand the flasher back to
// idle, otherwise the tab sits on "Please wait" with the Flash button loading.
//
// The teardown that follows a failed open must also stay quiet: no interface was
// ever claimed, so releasing one is a no-op rather than a TypeError on a null
// device.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
vi.mock("../../src/js/utils/checkCompatibility", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/js/utils/checkCompatibility")>()),
    getOS: vi.fn(),
}));
// Prevent the module-bottom `new WebUsbDfuTransport()` from touching navigator.usb.
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

import { UsbDfuProtocol, type DfuConnectOptions, type DfuTransport } from "../../src/js/protocols/usbdfu";
import { gui_log } from "../../src/js/gui_log";
import { getOS, type OperatingSystem } from "../../src/js/utils/checkCompatibility";

const { default: RealWebUsbDfuTransport } = await vi.importActual<
    typeof import("../../src/js/protocols/WebUsbDfuTransport")
>("../../src/js/protocols/WebUsbDfuTransport");

const mockedGetOS = vi.mocked(getOS);
const mockedGuiLog = vi.mocked(gui_log);

/** Transport whose open() (or claimInterface(), when `failClaim` is set) rejects, recording the teardown that follows. */
class FailingOpenTransport extends EventTarget {
    released: number[] = [];
    closeCount = 0;

    constructor(
        private readonly error: Error,
        private readonly failClaim = false,
    ) {
        super();
    }

    open(): Promise<void> {
        return this.failClaim ? Promise.resolve() : Promise.reject(this.error);
    }

    claimInterface(): Promise<void> {
        return Promise.reject(this.error);
    }

    releaseInterface(interfaceNumber: number): Promise<void> {
        this.released.push(interfaceNumber);
        return Promise.resolve();
    }

    close(): Promise<void> {
        this.closeCount++;
        return Promise.resolve();
    }

    getConnectedDevice(): null {
        return null;
    }
}

const namedError = (name: string, message: string): Error => Object.assign(new Error(message), { name });
const accessDenied = () => namedError("SecurityError", "Failed to execute 'open' on 'USBDevice': Access denied.");
const disconnected = () => namedError("NetworkError", "The device was disconnected.");

const flashMessageTypes = { INVALID: "INVALID" };

type FlasherHooks = Pick<DfuConnectOptions, "flashingMessage" | "resetFlashingState">;

function createDfu(transport: FailingOpenTransport, hooks: FlasherHooks = {}): UsbDfuProtocol {
    const dfu = new UsbDfuProtocol(transport as unknown as DfuTransport);
    dfu.connectedDevice = { path: "usb_test", displayName: "DFU" };
    dfu.options = { erase_chip: false, exitDfu: false, flashMessageTypes, ...hooks };
    return dfu;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

/** Drive openDevice() and let its promise chain (including cleanup) settle. */
async function runOpen(transport: FailingOpenTransport, hooks: FlasherHooks = {}): Promise<UsbDfuProtocol> {
    const dfu = createDfu(transport, hooks);
    dfu.openDevice();
    await settle();
    return dfu;
}

/** Records the flasher hook calls in order, so tests can check the message lands before the reset. */
function recordFlasherHooks() {
    const calls: unknown[][] = [];
    const hooks: FlasherHooks = {
        flashingMessage: vi.fn((message: string | null, type?: string) => calls.push(["message", message, type])),
        resetFlashingState: vi.fn(() => {
            calls.push(["reset"]);
        }),
    };
    return { calls, hooks };
}

const loggedMessages = () => mockedGuiLog.mock.calls.map(([message]) => message);

describe("DFU open failure diagnostics", () => {
    beforeEach(() => {
        // usbdfu releases the connect lock through the connection store.
        setActivePinia(createPinia());
        vi.clearAllMocks();
    });

    it("points at udev rules when Linux denies access to the device node", async () => {
        mockedGetOS.mockReturnValue("Linux");

        await runOpen(new FailingOpenTransport(accessDenied()));

        expect(loggedMessages()).toContain("usbDeviceOpenFail");
        expect(loggedMessages()).toContain("usbDeviceUdevNotice");
    });

    it("omits the udev hint on platforms that have no udev", async () => {
        mockedGetOS.mockReturnValue("Windows");

        await runOpen(new FailingOpenTransport(accessDenied()));

        expect(loggedMessages()).toContain("usbDeviceOpenFail");
        expect(loggedMessages()).not.toContain("usbDeviceUdevNotice");
    });

    it("omits the udev hint for open failures that are not access denials", async () => {
        mockedGetOS.mockReturnValue("Linux");

        await runOpen(new FailingOpenTransport(disconnected()));

        expect(loggedMessages()).toContain("usbDeviceOpenFail");
        expect(loggedMessages()).not.toContain("usbDeviceUdevNotice");
    });

    it("closes the device during cleanup after a failed open", async () => {
        mockedGetOS.mockReturnValue("Linux");
        const transport = new FailingOpenTransport(accessDenied());

        await runOpen(transport);

        expect(transport.released).toEqual([0]);
        expect(transport.closeCount).toBe(1);
    });

    it.each<[OperatingSystem, () => Error, string]>([
        ["Linux", accessDenied, "dfuDeviceAccessDeniedLinux"],
        ["Windows", accessDenied, "dfuDeviceAccessDeniedWindows"],
        ["MacOS", accessDenied, "dfuDeviceOpenFailed"],
        ["Windows", disconnected, "dfuDeviceOpenFailed"],
    ])("reports the failure in the flash status on %s and releases the flasher", async (os, makeError, key) => {
        mockedGetOS.mockReturnValue(os);
        const { calls, hooks } = recordFlasherHooks();

        await runOpen(new FailingOpenTransport(makeError()), hooks);

        expect(calls).toEqual([["message", key, "INVALID"], ["reset"]]);
    });

    it("gives the access-denied hint when claiming the interface is refused", async () => {
        mockedGetOS.mockReturnValue("Windows");
        const { calls, hooks } = recordFlasherHooks();

        await runOpen(new FailingOpenTransport(accessDenied(), true), hooks);

        expect(calls).toEqual([["message", "dfuDeviceAccessDeniedWindows", "INVALID"], ["reset"]]);
    });

    it("reports a device that has gone before it could be opened", async () => {
        const { calls, hooks } = recordFlasherHooks();
        const dfu = new UsbDfuProtocol(new FailingOpenTransport(accessDenied()) as unknown as DfuTransport);
        vi.spyOn(dfu, "getDevices").mockResolvedValue([]);

        await dfu.connect("usb_gone", null, { ...hooks, flashMessageTypes });

        expect(calls.at(-2)).toEqual(["message", "dfuDeviceOpenFailed", "INVALID"]);
        expect(calls.at(-1)).toEqual(["reset"]);
        expect(dfu._connecting).toBe(false);
    });

    it.each([
        [false, 1],
        [true, 0],
    ])("leaving DFU with succeeded=%s resets the flasher %i time(s)", (succeeded, resets) => {
        const { hooks } = recordFlasherHooks();
        const dfu = createDfu(new FailingOpenTransport(accessDenied()), hooks);
        vi.spyOn(dfu, "clearStatus").mockImplementation((callback) => callback([]));
        vi.spyOn(dfu, "loadAddress").mockImplementation((_address, callback) => callback([]));
        vi.spyOn(dfu, "controlTransfer").mockImplementation((...args) => args[6]({ status: "ok" }));

        dfu.leave(succeeded);

        expect(hooks.resetFlashingState).toHaveBeenCalledTimes(resets);
    });

    it("treats releaseInterface as a no-op when no device was ever opened", async () => {
        const transport = new RealWebUsbDfuTransport();
        transport.usbDevice = null;

        await expect(transport.releaseInterface(0)).resolves.toBeUndefined();
    });
});
