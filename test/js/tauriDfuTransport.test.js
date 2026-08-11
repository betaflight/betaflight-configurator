import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../src/js/protocols/devices", () => ({
    usbDevices: {
        filters: [
            { vendorId: 1155, productId: 57105 }, // STM32 DFU
            { vendorId: 11836, productId: 57105 }, // AT32 DFU
        ],
    },
}));

import { invoke } from "@tauri-apps/api/core";
import TauriDfuTransport from "../../src/js/protocols/TauriDfuTransport.js";

const stmDfu = (overrides = {}) => ({
    deviceName: "/dev/bus/usb/001/002",
    vendorId: 1155,
    productId: 57105,
    serialNumber: "STM32SERIAL",
    productName: "STM32 BOOTLOADER",
    manufacturerName: "STMicroelectronics",
    hasPermission: true,
    ...overrides,
});

// Route the mocked invoke per command name, not per call order: the
// constructor bootstraps device monitoring, which would otherwise steal
// ordered mock values.
let handlers;
function installInvoke() {
    handlers = {
        "plugin:dfu|list_devices": async () => [],
    };
    invoke.mockImplementation(async (cmd, args) => {
        if (!handlers[cmd]) {
            throw new Error(`unmocked command: ${cmd}`);
        }
        return handlers[cmd](args);
    });
}

function makeTransport() {
    const transport = new TauriDfuTransport();
    transport.stopDeviceMonitoring();
    return transport;
}

async function makeOpenTransport() {
    const transport = makeTransport();
    handlers["plugin:dfu|open_device"] = async () => null;
    await transport.open(transport.createPort(stmDfu()));
    return transport;
}

beforeEach(() => {
    vi.useFakeTimers();
    installInvoke();
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("TauriDfuTransport enumeration", () => {
    it("getDevices returns only permission-granted devices matching the DFU filters", async () => {
        const transport = makeTransport();
        handlers["plugin:dfu|list_devices"] = async () => [
            stmDfu(),
            stmDfu({ deviceName: "/dev/bus/usb/001/003", serialNumber: "NOPERM", hasPermission: false }),
            { deviceName: "/dev/bus/usb/001/004", vendorId: 1234, productId: 5678, hasPermission: true },
        ];

        const ports = await transport.getDevices();

        expect(ports).toHaveLength(1);
        expect(ports[0].path).toBe("usb_STM32SERIAL");
        expect(ports[0].displayName).toBe("Betaflight STM32 BOOTLOADER");
        expect(ports[0].vendorId).toBe(1155);
        expect(ports[0].port.deviceName).toBe("/dev/bus/usb/001/002");
    });

    it("falls back to the device name for identity when there is no serial number", async () => {
        const transport = makeTransport();
        expect(transport.createPort(stmDfu({ serialNumber: "" })).path).toBe("usb_/dev/bus/usb/001/002");
    });

    it("requestPermission asks natively, re-enumerates for the post-grant identity and dispatches addedDevice once", async () => {
        const transport = makeTransport();
        const requested = [];
        // Before the grant the serial number is unreadable, so the pre-grant
        // snapshot must not be what the returned port is built from.
        let granted = false;
        handlers["plugin:dfu|list_devices"] = async () => [
            granted ? stmDfu() : stmDfu({ hasPermission: false, serialNumber: "" }),
        ];
        handlers["plugin:dfu|request_permission"] = async (args) => {
            requested.push(args.deviceName);
            granted = true;
            return true;
        };
        const added = [];
        transport.addEventListener("addedDevice", (e) => added.push(e.detail));

        const port = await transport.requestPermission();

        expect(requested).toEqual(["/dev/bus/usb/001/002"]);
        expect(port.path).toBe("usb_STM32SERIAL");
        expect(added).toHaveLength(1);
        expect(added[0].path).toBe("usb_STM32SERIAL");
        expect(transport.emitsAddedDeviceOnPermissionGrant).toBe(true);
    });

    it("requestPermission returns null when the user denies", async () => {
        const transport = makeTransport();
        handlers["plugin:dfu|list_devices"] = async () => [stmDfu({ hasPermission: false })];
        handlers["plugin:dfu|request_permission"] = async () => false;
        const added = [];
        transport.addEventListener("addedDevice", (e) => added.push(e.detail));

        expect(await transport.requestPermission()).toBeNull();
        expect(added).toHaveLength(0);
    });

    it("device monitoring dispatches addedDevice/removedDevice on hotplug and drops a removed open device", async () => {
        const transport = new TauriDfuTransport();
        const events = [];
        transport.addEventListener("addedDevice", (e) => events.push(["added", e.detail.path]));
        transport.addEventListener("removedDevice", (e) => events.push(["removed", e.detail.path]));

        handlers["plugin:dfu|list_devices"] = async () => [stmDfu()];
        await vi.advanceTimersByTimeAsync(1000);
        expect(events).toEqual([["added", "usb_STM32SERIAL"]]);

        handlers["plugin:dfu|open_device"] = async () => null;
        await transport.open(transport.createPort(stmDfu()));
        expect(transport.getConnectedDevice()).toBe("usb_STM32SERIAL");

        handlers["plugin:dfu|list_devices"] = async () => [];
        await vi.advanceTimersByTimeAsync(1000);
        expect(events).toEqual([
            ["added", "usb_STM32SERIAL"],
            ["removed", "usb_STM32SERIAL"],
        ]);
        expect(transport.getConnectedDevice()).toBeNull();

        transport.stopDeviceMonitoring();
    });

    it("a failed poll is skipped, not treated as every device detaching", async () => {
        const transport = new TauriDfuTransport();
        const events = [];
        transport.addEventListener("removedDevice", (e) => events.push(e.detail.path));

        handlers["plugin:dfu|list_devices"] = async () => [stmDfu()];
        await vi.advanceTimersByTimeAsync(1000);

        handlers["plugin:dfu|list_devices"] = async () => {
            throw new Error("JNI hiccup");
        };
        await vi.advanceTimersByTimeAsync(1000);

        expect(events).toEqual([]);
        expect(transport.ports).toHaveLength(1);

        transport.stopDeviceMonitoring();
    });

    it("waitForDfuDevice returns only a newly appeared device, not one already in DFU", async () => {
        const transport = makeTransport();
        const alreadyThere = stmDfu({ deviceName: "/dev/bus/usb/001/009", serialNumber: "OLDBOARD" });
        let rebooted = false;
        handlers["plugin:dfu|list_devices"] = async () => (rebooted ? [alreadyThere, stmDfu()] : [alreadyThere]);

        vi.useRealTimers();
        const wait = transport.waitForDfuDevice(2000, 10);
        setTimeout(() => {
            rebooted = true;
        }, 30);
        const port = await wait;

        expect(port.path).toBe("usb_STM32SERIAL");
    });

    it("waitForDfuDevice returns null when no new device appears before the timeout", async () => {
        const transport = makeTransport();
        handlers["plugin:dfu|list_devices"] = async () => [stmDfu()];

        vi.useRealTimers();
        expect(await transport.waitForDfuDevice(50, 10)).toBeNull();
    });
});

describe("TauriDfuTransport control transfers", () => {
    it("forwards the full setup for standard/device descriptor reads (getLangId)", async () => {
        const transport = await makeOpenTransport();
        const calls = [];
        handlers["plugin:dfu|control_transfer_in"] = async (args) => {
            calls.push(args);
            return { status: "ok", data: [4, 3, 0x09, 0x04] };
        };

        const langId = await transport.getLangId();

        expect(langId).toBe(0x0409);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x300,
            index: 0,
            length: 255,
        });
    });

    it("forwards class/interface setups and returns bytes for controlTransferIn", async () => {
        const transport = await makeOpenTransport();
        const calls = [];
        handlers["plugin:dfu|control_transfer_in"] = async (args) => {
            calls.push(args);
            return { status: "ok", data: [0, 0, 0, 4, 0, 0] };
        };

        const result = await transport.controlTransferIn(
            { requestType: "class", recipient: "interface", request: 3, value: 0, index: 0 },
            6,
        );

        expect(result.status).toBe("ok");
        expect(result.data).toBeInstanceOf(Uint8Array);
        expect(Array.from(result.data)).toEqual([0, 0, 0, 4, 0, 0]);
        expect(calls[0]).toMatchObject({ requestType: "class", recipient: "interface", request: 3, length: 6 });
    });

    it("reports a stall as a status from the raw primitive but throws from controlTransferIn", async () => {
        const transport = await makeOpenTransport();
        handlers["plugin:dfu|control_transfer_in"] = async () => ({ status: "stall", data: [] });

        const raw = await transport._rawControlTransferIn(
            { requestType: "standard", recipient: "device", request: 6, value: 0x300, index: 0 },
            255,
        );
        expect(raw.status).toBe("stall");
        expect(raw.data).toHaveLength(0);

        await expect(
            transport.controlTransferIn(
                { requestType: "class", recipient: "interface", request: 3, value: 0, index: 0 },
                6,
            ),
        ).rejects.toThrow(/stall/);
    });

    it("controlTransferOut sends the payload as a plain array and tolerates the state machine's 0-for-no-data", async () => {
        const transport = await makeOpenTransport();
        const calls = [];
        handlers["plugin:dfu|control_transfer_out"] = async (args) => {
            calls.push(args);
            return { status: "ok" };
        };
        const setup = { requestType: "class", recipient: "interface", request: 1, value: 2, index: 0 };

        await transport.controlTransferOut(setup, [0x92, 0x01]);
        await transport.controlTransferOut(setup, 0);

        expect(calls[0].data).toEqual([0x92, 0x01]);
        expect(Array.isArray(calls[0].data)).toBe(true);
        expect(calls[1].data).toEqual([]);
    });
});

describe("TauriDfuTransport lifecycle", () => {
    it("open/claim/release/close drive the plugin commands and close drops connection state", async () => {
        const transport = makeTransport();
        const log = [];
        handlers["plugin:dfu|open_device"] = async (args) => log.push(["open", args.deviceName]);
        handlers["plugin:dfu|claim_interface"] = async (args) => log.push(["claim", args.interfaceNumber]);
        handlers["plugin:dfu|release_interface"] = async (args) => log.push(["release", args.interfaceNumber]);
        handlers["plugin:dfu|close_device"] = async () => log.push(["close"]);

        await transport.open(transport.createPort(stmDfu()));
        expect(transport.getConnectedDevice()).toBe("usb_STM32SERIAL");
        await transport.claimInterface(0);
        await transport.releaseInterface(0);
        await transport.close();

        expect(log).toEqual([["open", "/dev/bus/usb/001/002"], ["claim", 0], ["release", 0], ["close"]]);
        expect(transport.getConnectedDevice()).toBeNull();
    });

    it("teardown after a failed open skips release but still tells the plugin to close", async () => {
        const transport = makeTransport();
        handlers["plugin:dfu|close_device"] = async () => null;
        await transport.releaseInterface(0);
        await transport.close();
        expect(invoke).not.toHaveBeenCalledWith("plugin:dfu|release_interface", expect.anything());
        // close_device is idempotent in Rust, and the JS state may lag the
        // real device state, so close always forwards.
        expect(invoke).toHaveBeenCalledWith("plugin:dfu|close_device", undefined);
    });

    it("a rejected plugin command surfaces as an Error with the native message", async () => {
        const transport = await makeOpenTransport();
        handlers["plugin:dfu|claim_interface"] = async () => {
            // Tauri plugin errors arrive as bare strings, not Error objects.
            throw "claim interface 0 failed: io interface is busy";
        };
        let caught;
        try {
            await transport.claimInterface(0);
        } catch (e) {
            caught = e;
        }
        // usbdfu.js retries claims whose error.message mentions "busy".
        expect(caught).toBeInstanceOf(Error);
        expect(caught.message).toContain("busy");
    });

    it("close invalidates the descriptor cache", async () => {
        const transport = await makeOpenTransport();
        let reads = 0;
        // 9-byte configuration descriptor header with wTotalLength = 9.
        const header = [9, 2, 9, 0, 1, 1, 0, 0x80, 50];
        handlers["plugin:dfu|control_transfer_in"] = async () => {
            reads++;
            return { status: "ok", data: header };
        };
        handlers["plugin:dfu|close_device"] = async () => null;

        await transport.getConfigDescriptor();
        await transport.getConfigDescriptor();
        expect(reads).toBe(2); // header probe + full read, then cached

        await transport.close();
        await transport.open(transport.createPort(stmDfu()));
        await transport.getConfigDescriptor();
        expect(reads).toBe(4); // cache was dropped on close
    });
});
