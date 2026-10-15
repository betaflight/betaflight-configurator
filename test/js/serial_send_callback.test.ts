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

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SerialProtocol } from "../../src/js/serial";

// ---------------------------------------------------------------------------
// serial.send() callback contract.
//
// The facade used to pass `callback` down into the protocol AND invoke it
// itself. Every transport fires the callback on each of its own exit paths, so
// the caller's callback ran twice per send. That is not cosmetic: AutoBackup
// passes `onClose` as a send callback, so a double call disconnected twice and
// logged "serial port closed" twice.
//
// The contract pinned here: the facade is the single owner of the callback.
// Protocols are handed no callback and are the single source of the byte count.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    isAndroid: () => false,
    isTauri: () => false,
    isTauriMacOS: () => false,
}));

const stub = (tag: string) =>
    ({
        [tag]: class extends EventTarget {},
    })[tag];

vi.mock("../../src/js/protocols/WebSerial", () => ({ default: stub("WebSerial") }));
vi.mock("../../src/js/protocols/WebBluetooth", () => ({ default: stub("WebBluetooth") }));
vi.mock("../../src/js/protocols/WebSocket", () => ({ default: stub("Websocket") }));
vi.mock("../../src/js/protocols/VirtualSerial", () => ({ default: stub("VirtualSerial") }));
vi.mock("../../src/js/protocols/CapacitorSerial", () => ({ default: stub("CapacitorSerial") }));
vi.mock("../../src/js/protocols/CapacitorBle", () => ({ default: stub("CapacitorBle") }));
vi.mock("../../src/js/protocols/CapacitorTcp", () => ({ default: stub("CapacitorTcp") }));
vi.mock("../../src/js/protocols/TauriSerial", () => ({ default: stub("TauriSerial") }));
vi.mock("../../src/js/protocols/TauriTcp", () => ({ default: stub("TauriTcp") }));
vi.mock("../../src/js/protocols/TauriBle", () => ({ default: stub("TauriBle") }));

let serial: typeof import("../../src/js/serial").serial;
// The singleton builds its slot table at module load.
async function loadSerial(): Promise<void> {
    vi.resetModules();
    ({ serial } = await import("../../src/js/serial"));
}

/**
 * A transport that behaves like the real ones: it fires whatever callback it is
 * handed, on every exit path. If the facade still passed one down, that is what
 * would produce the second invocation.
 */
type SendCallback = (result: { error: unknown; bytesSent: number }) => void;

interface FakeProtocol {
    receivedCallbacks: (SendCallback | undefined)[];
    send?: (data: unknown, cb?: SendCallback) => Promise<{ bytesSent: number }>;
}

function fakeProtocol({ bytesSent = 0, throws = false, hasSend = true } = {}): FakeProtocol & SerialProtocol {
    const proto: FakeProtocol = { receivedCallbacks: [] };
    if (hasSend) {
        proto.send = vi.fn(async (_data: unknown, cb?: SendCallback) => {
            proto.receivedCallbacks.push(cb);
            cb?.({ error: null, bytesSent });
            if (throws) {
                throw new Error("write failed");
            }
            return { bytesSent };
        });
    }
    // Only send() is ever called on it.
    return proto as FakeProtocol & SerialProtocol;
}

describe("serial.send callback contract", () => {
    beforeEach(async () => {
        await loadSerial();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("invokes the callback exactly once on a successful send", async () => {
        serial._protocol = fakeProtocol({ bytesSent: 12 });
        const callback = vi.fn();

        await serial.send(new Uint8Array(12), callback);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("hands the protocol no callback, so it cannot fire a second one", async () => {
        const proto = fakeProtocol({ bytesSent: 4 });
        serial._protocol = proto;

        await serial.send(new Uint8Array(4), vi.fn());

        expect(proto.receivedCallbacks).toEqual([undefined]);
    });

    it("reports the protocol's real byte count, not zero", async () => {
        serial._protocol = fakeProtocol({ bytesSent: 64 });
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array(64), callback);

        expect(result).toEqual({ bytesSent: 64 });
        expect(callback).toHaveBeenCalledWith({ bytesSent: 64 });
    });

    it("invokes the callback exactly once when the protocol throws", async () => {
        serial._protocol = fakeProtocol({ bytesSent: 8, throws: true });
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array(8), callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ bytesSent: 0 });
        expect(result).toEqual({ bytesSent: 0 });
    });

    it("invokes the callback exactly once in virtual mode, which has no send method", async () => {
        // VirtualSerial defines no send(); the guarded call yields undefined and
        // the facade reports zero bytes quietly. Virtual mode sends constantly,
        // so this path must not log an error per send.
        serial._protocol = fakeProtocol({ hasSend: false });
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array(3), callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ bytesSent: 0 });
        expect(console.error).not.toHaveBeenCalled();
    });
});

type WebBluetoothModule = typeof import("../../src/js/protocols/WebBluetooth");
type Characteristic = NonNullable<InstanceType<WebBluetoothModule["default"]>["writeCharacteristic"]>;
type Device = NonNullable<InstanceType<WebBluetoothModule["default"]>["device"]>;

describe("WebBluetooth.send return value", () => {
    // The facade's `?? { bytesSent: 0 }` is now the only value the caller sees,
    // so a transport that returns undefined would silently report every send as
    // zero bytes and break the msp.js bytesSent === byteLength check.
    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the byte count written, not undefined", async () => {
        const { default: WebBluetooth } = await vi.importActual<WebBluetoothModule>(
            "../../src/js/protocols/WebBluetooth",
        );
        const ble = new WebBluetooth();
        ble.writeCharacteristic = { writeValue: vi.fn().mockResolvedValue(undefined) } as unknown as Characteristic;
        ble.device = { gatt: { connected: true } } as unknown as Device;
        ble.writeQueue = Promise.resolve();

        const result = await ble.send(new Uint8Array(20));

        expect(result).toEqual({ bytesSent: 20 });
        expect(ble.bytesSent).toBe(20);
    });

    it("returns zero bytes when there is no write characteristic", async () => {
        const { default: WebBluetooth } = await vi.importActual<WebBluetoothModule>(
            "../../src/js/protocols/WebBluetooth",
        );
        const ble = new WebBluetooth();
        ble.writeCharacteristic = null;

        expect(await ble.send(new Uint8Array(5))).toEqual({ bytesSent: 0 });
    });

    it("returns zero bytes without writing when the GATT server is disconnected", async () => {
        const { default: WebBluetooth } = await vi.importActual<WebBluetoothModule>(
            "../../src/js/protocols/WebBluetooth",
        );
        const ble = new WebBluetooth();
        const writeValue = vi.fn();
        ble.writeCharacteristic = { writeValue } as unknown as Characteristic;
        ble.device = { gatt: { connected: false } } as unknown as Device;

        expect(await ble.send(new Uint8Array(5))).toEqual({ bytesSent: 0 });
        expect(writeValue).not.toHaveBeenCalled();
    });
});
