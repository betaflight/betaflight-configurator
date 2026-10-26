/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
/** The handlers registered through `listen`, by event name. */
const listeners = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());
const unlisten = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
        listeners.set(name, handler);
        return unlisten;
    }),
}));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/protocols/devices", () => ({
    bluetoothDevices: [
        { name: "HM-10", serviceUuid: "svc-hm10", writeCharacteristic: "w1", readCharacteristic: "r1" },
        {
            name: "CC2541",
            serviceUuid: "svc-cc2541",
            writeCharacteristic: "w2",
            readCharacteristic: "r2",
            susceptibleToCrcCorruption: true,
        },
    ],
}));

const { default: TauriBle } = await import("../../src/js/protocols/TauriBle");

/** Answers each Rust command the transport issues; an Error rejects, anything unlisted resolves to undefined. */
function mockCommands(answers: Record<string, unknown>) {
    invoke.mockImplementation((cmd: string) => {
        const answer = answers[cmd];
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    });
}

function eventDetails(target: EventTarget, type: string): unknown[] {
    const details: unknown[] = [];
    target.addEventListener(type, (e) => details.push((e as CustomEvent).detail));
    return details;
}

function connectArgs(): { id: string; devices: { serviceUuid: string }[] } {
    const call = invoke.mock.calls.find(([cmd]) => cmd === "ble_connect");
    if (!call) {
        throw new Error("ble_connect was not invoked");
    }
    return call[1];
}

beforeEach(() => {
    invoke.mockReset();
    unlisten.mockReset();
    listeners.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("TauriBle.getDevices", () => {
    it("lists scanned peripherals under a bluetooth_ path, named by id when the name is empty", async () => {
        mockCommands({
            ble_scan: [
                { id: "uuid-1", name: "FC" },
                { id: "uuid-2", name: "" },
            ],
        });
        const ble = new TauriBle();

        const devices = await ble.getDevices();

        expect(devices.map((d) => [d.path, d.displayName])).toEqual([
            ["bluetooth_uuid-1", "FC"],
            ["bluetooth_uuid-2", "uuid-2"],
        ]);
    });

    it("keeps the previous list when a scan fails", async () => {
        mockCommands({ ble_scan: [{ id: "uuid-1", name: "FC" }] });
        const ble = new TauriBle();
        await ble.getDevices();

        mockCommands({ ble_scan: new Error("adapter off") });

        expect((await ble.getDevices()).map((d) => d.path)).toEqual(["bluetooth_uuid-1"]);
    });

    it("requestPermissionDevice returns the first scanned device, or null", async () => {
        mockCommands({ ble_scan: [] });
        expect(await new TauriBle().requestPermissionDevice()).toBeNull();

        mockCommands({ ble_scan: [{ id: "uuid-1", name: "FC" }] });
        expect((await new TauriBle().requestPermissionDevice())?.path).toBe("bluetooth_uuid-1");
    });
});

describe("TauriBle.connect", () => {
    it("connects by the scanned id, hands Rust the GATT table, and reports success", async () => {
        mockCommands({ ble_scan: [{ id: "uuid-1", name: "FC" }], ble_connect: { serviceUuid: "svc-cc2541" } });
        const ble = new TauriBle();
        await ble.getDevices();
        const connects = eventDetails(ble, "connect");

        expect(await ble.connect("bluetooth_uuid-1")).toBe(true);

        expect(connectArgs().id).toBe("uuid-1");
        expect(connectArgs().devices.map((d) => d.serviceUuid)).toEqual(["svc-hm10", "svc-cc2541"]);
        expect(ble.connected).toBe(true);
        expect(ble.connectionId).toBe("bluetooth_uuid-1");
        expect(ble.deviceDescription?.name).toBe("CC2541");
        expect(ble.getConnectedDevice()?.displayName).toBe("FC");
        expect(connects).toEqual([true]);
    });

    it("derives the id from an unscanned path", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();

        await ble.connect("bluetooth_uuid-9");

        expect(connectArgs().id).toBe("uuid-9");
        expect(ble.getConnectedDevice()).toEqual(expect.objectContaining({ path: "bluetooth_uuid-9" }));
    });

    it("forwards notification bytes as receive events", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");
        const received = eventDetails(ble, "receive");

        listeners.get("ble-data")?.({ payload: [1, 2, 3] });

        expect(received).toEqual([new Uint8Array([1, 2, 3])]);
    });

    it("counts each received chunk once", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");

        listeners.get("ble-data")?.({ payload: [1, 2, 3] });

        expect(ble.bytesReceived).toBe(3);
    });

    it("reports failure and drops its listeners when Rust cannot connect", async () => {
        mockCommands({ ble_connect: new Error("no such peripheral") });
        const ble = new TauriBle();
        const connects = eventDetails(ble, "connect");

        expect(await ble.connect("bluetooth_uuid-1")).toBe(false);

        expect(ble.connected).toBe(false);
        expect(connects).toEqual([false]);
        expect(unlisten).toHaveBeenCalledTimes(2);
    });
});

describe("TauriBle.disconnect", () => {
    it("clears the connection and reports a clean close", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");
        const disconnects = eventDetails(ble, "disconnect");

        expect(await ble.disconnect()).toBe(true);

        expect(ble.connected).toBe(false);
        expect(ble.connectionId).toBe(false);
        expect(ble.getConnectedDevice()).toBeNull();
        expect(disconnects).toEqual([true]);
    });

    it("reports a failed close", async () => {
        mockCommands({ ble_disconnect: new Error("busy") });
        const ble = new TauriBle();
        const disconnects = eventDetails(ble, "disconnect");

        expect(await ble.disconnect()).toBe(false);
        expect(disconnects).toEqual([false]);
    });
});

describe("TauriBle.send", () => {
    it("sends nothing while disconnected", async () => {
        const ble = new TauriBle();
        const cb = vi.fn();

        expect(await ble.send(new Uint8Array([1, 2]), cb)).toEqual({ bytesSent: 0 });

        expect(invoke).not.toHaveBeenCalled();
        expect(cb).toHaveBeenCalledWith({ error: "BLE peripheral is not connected", bytesSent: 0 });
    });

    it("writes the bytes as a number array and reports the count", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");
        const cb = vi.fn();

        expect(await ble.send(new Uint8Array([7, 8, 9]).buffer, cb)).toEqual({ bytesSent: 3 });

        expect(invoke).toHaveBeenCalledWith("ble_send", { data: [7, 8, 9] });
        expect(cb).toHaveBeenCalledWith({ error: null, bytesSent: 3 });
        expect(ble.bytesSent).toBe(3);
    });

    it("reports 0 bytes when the write fails", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");
        const failure = new Error("write failed");
        mockCommands({ ble_send: failure });
        const cb = vi.fn();

        expect(await ble.send(new Uint8Array([1]), cb)).toEqual({ bytesSent: 0 });
        expect(cb).toHaveBeenCalledWith({ error: failure, bytesSent: 0 });
    });
});

describe("TauriBle.shouldBypassCrc", () => {
    it("bypasses only a 0xff checksum on a connected module that corrupts CRCs", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-cc2541" } });
        const ble = new TauriBle();
        expect(ble.shouldBypassCrc(0xff)).toBe(false); // not connected yet

        await ble.connect("bluetooth_uuid-1");

        expect(ble.shouldBypassCrc(0x12)).toBe(false);
        expect(ble.shouldBypassCrc(0xff)).toBe(true);
    });

    it("does not bypass when the computed checksum is 0xff too", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-cc2541" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");

        expect(ble.shouldBypassCrc(0xff, 0x12)).toBe(true);
        expect(ble.shouldBypassCrc(0xff, 0xff)).toBe(false);
    });

    it("stops bypassing once disconnected, even when a failed close kept the module's description", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-cc2541" }, ble_disconnect: new Error("busy") });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");

        await ble.disconnect();

        expect(ble.deviceDescription?.name).toBe("CC2541");
        expect(ble.shouldBypassCrc(0xff)).toBe(false);
    });

    it("never bypasses for a module that is not susceptible", async () => {
        mockCommands({ ble_connect: { serviceUuid: "svc-hm10" } });
        const ble = new TauriBle();
        await ble.connect("bluetooth_uuid-1");

        expect(ble.shouldBypassCrc(0xff)).toBe(false);
    });
});
