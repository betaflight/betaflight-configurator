import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    expectSupportsLinkEvents,
    expectTokenShape,
    expectLostOnUnsolicitedDrop,
} from "./helpers/linkEventContract.js";

// ---------------------------------------------------------------------------
// S6d / S1b-Tauri — TauriSerial LinkEvent adapter + path-change re-resolution.
//
// The FATAL case: a Tauri CDC device commonly re-enumerates to a DIFFERENT OS
// path across a reboot (/dev/ttyACM0 -> ACM1). The reconnect token freezes the
// device identity ({path, vid, pid, serialNumber}) and resolveReconnectTarget
// re-derives the current path from the live port list.
// ---------------------------------------------------------------------------

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../../src/js/gui", () => ({ default: { operating_system: "Linux" } }));
vi.mock("../../src/js/protocols/devices", () => ({
    serialDevices: [{ vendorId: 0x0483, productId: 0x5740 }],
    vendorIdNames: { 0x0483: "STM32" },
}));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
});

afterEach(() => vi.resetModules());

async function newTauriSerial() {
    const mod = await import("../../src/js/protocols/TauriSerial.js");
    const ts = new mod.default();
    // Stop the 1s hotplug poll started in the constructor so it doesn't leak.
    ts.stopDeviceMonitoring();
    return ts;
}

const port = (path, serialNumber, vendorId = 0x0483, productId = 0x5740) => ({
    path,
    displayName: `Betaflight ${path}`,
    vendorId,
    productId,
    serialNumber,
});

describe("S6d TauriSerial LinkEvent adapter", () => {
    it("declares LinkEvent support", async () => {
        expectSupportsLinkEvents(await newTauriSerial());
    });

    it("emits open on connect and closed on intentional disconnect", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("/dev/ttyACM0", "SN1")];
        ts.readLoop = vi.fn(); // don't drive the real poll loop

        const events = [];
        ts.addEventListener("open", () => events.push("open"));
        ts.addEventListener("closed", () => events.push("closed"));
        ts.addEventListener("lost", () => events.push("lost"));

        await ts.connect("/dev/ttyACM0", { baudRate: 115200 });
        await ts.disconnect();

        expect(events).toEqual(["open", "closed"]);
    });

    it("emits lost (not closed) on a fatal serial error", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("/dev/ttyACM0", "SN1")];
        ts.readLoop = vi.fn();
        await ts.connect("/dev/ttyACM0", { baudRate: 115200 });

        await expectLostOnUnsolicitedDrop(ts, () => ts.handleFatalSerialError(new Error("Broken pipe")));
    });
});

describe("S6d/S1b-Tauri reconnect token + path-change re-resolution", () => {
    it("freezes {path, vid, pid, serialNumber} as the token identity", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("/dev/ttyACM0", "SN1")];
        ts.readLoop = vi.fn();
        await ts.connect("/dev/ttyACM0", { baudRate: 230400 });

        expectTokenShape(ts, {
            transportType: "serial",
            opaqueId: { path: "/dev/ttyACM0", vendorId: 0x0483, productId: 0x5740, serialNumber: "SN1" },
            baud: 230400,
            isVirtual: false,
        });
    });

    it("(1) returns the same path when it has not changed", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("/dev/ttyACM0", "SN1")];
        const token = { transportType: "serial", opaqueId: { path: "/dev/ttyACM0", serialNumber: "SN1" } };
        expect(ts.resolveReconnectTarget(token)).toBe("/dev/ttyACM0");
    });

    it("(2) follows a CDC path change via a unique serial_number", async () => {
        const ts = await newTauriSerial();
        // Re-enumerated: same device, new path.
        ts.ports = [port("/dev/ttyACM1", "SN1")];
        const token = {
            transportType: "serial",
            opaqueId: { path: "/dev/ttyACM0", vendorId: 0x0483, productId: 0x5740, serialNumber: "SN1" },
        };
        expect(ts.resolveReconnectTarget(token)).toBe("/dev/ttyACM1");
    });

    it("(3) follows a path change via a unique vid/pid when serial_number is empty", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("COM5", "")];
        const token = {
            transportType: "serial",
            opaqueId: { path: "COM3", vendorId: 0x0483, productId: 0x5740, serialNumber: "" },
        };
        expect(ts.resolveReconnectTarget(token)).toBe("COM5");
    });

    it("(4) returns null for two identical FCs with empty serial_number (ambiguous -> re-pick)", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("COM5", ""), port("COM6", "")];
        const token = {
            transportType: "serial",
            opaqueId: { path: "COM3", vendorId: 0x0483, productId: 0x5740, serialNumber: "" },
        };
        expect(ts.resolveReconnectTarget(token)).toBeNull();
    });

    it("prefers serial_number over an ambiguous vid/pid match", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("/dev/ttyACM1", "SN1"), port("/dev/ttyACM2", "SN2")];
        const token = {
            transportType: "serial",
            opaqueId: { path: "/dev/ttyACM0", vendorId: 0x0483, productId: 0x5740, serialNumber: "SN2" },
        };
        expect(ts.resolveReconnectTarget(token)).toBe("/dev/ttyACM2");
    });

    it("returns null for a non-serial token or missing identity", async () => {
        const ts = await newTauriSerial();
        ts.ports = [port("/dev/ttyACM0", "SN1")];
        expect(ts.resolveReconnectTarget({ transportType: "tcp", opaqueId: { path: "/dev/ttyACM0" } })).toBeNull();
        expect(ts.resolveReconnectTarget(null)).toBeNull();
        expect(ts.resolveReconnectTarget({ transportType: "serial" })).toBeNull();
    });
});
