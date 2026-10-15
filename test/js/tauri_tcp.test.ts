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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, listen, handlers, unlisten } = vi.hoisted(() => {
    const handlers: Record<string, (event: { payload: unknown }) => void> = {};
    const unlisten = vi.fn();
    return {
        invoke: vi.fn(),
        listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
            handlers[name] = handler;
            return unlisten;
        }),
        handlers,
        unlisten,
    };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

const { default: TauriTcp } = await import("../../src/js/protocols/TauriTcp");

describe("TauriTcp", () => {
    let tcp: InstanceType<typeof TauriTcp>;

    beforeEach(() => {
        invoke.mockResolvedValue([]);
        tcp = new TauriTcp();
        tcp.stopDeviceMonitoring();
    });

    afterEach(() => {
        invoke.mockReset();
        listen.mockClear();
        unlisten.mockClear();
        for (const name of Object.keys(handlers)) {
            delete handlers[name];
        }
    });

    describe("_parseAddress", () => {
        it.each([
            ["tcp://10.0.0.1:1234", "10.0.0.1", 1234],
            ["10.0.0.1:1234", "10.0.0.1", 1234],
            // A special scheme such as http: would drop its default port 80.
            ["10.0.0.1:80", "10.0.0.1", 80],
            ["bridge.local", "bridge.local", 5761],
            ["tcp://[fe80::1]:23", "fe80::1", 23],
        ])("reads %s as %s port %i", (path, host, port) => {
            expect(tcp._parseAddress(path)).toEqual({ host, port });
        });
    });

    it("connects with a bare host, then keeps the canonical tcp:// URL", async () => {
        const connected = vi.fn();
        tcp.addEventListener("connect", connected);

        expect(await tcp.connect("[fe80::1]:23")).toBe(true);

        expect(invoke).toHaveBeenCalledWith("tcp_connect", { ip: "fe80::1", port: 23 });
        expect(tcp.connected).toBe(true);
        expect(tcp.address).toBe("tcp://[fe80::1]:23");
        expect(connected.mock.calls[0][0].detail).toBe("tcp://[fe80::1]:23");
    });

    it("forwards tcp-data as receive bytes and counts them", async () => {
        await tcp.connect("tcp://10.0.0.1:5761");
        const received = vi.fn();
        tcp.addEventListener("receive", received);

        handlers["tcp-data"]({ payload: [1, 2, 3] });

        expect(received.mock.calls[0][0].detail).toEqual(new Uint8Array([1, 2, 3]));
        expect(tcp.bytesReceived).toBe(3);
    });

    it("reports a failed connect as false and removes its listeners", async () => {
        invoke.mockRejectedValueOnce(new Error("refused"));
        const connected = vi.fn();
        tcp.addEventListener("connect", connected);

        expect(await tcp.connect("tcp://10.0.0.1:5761")).toBe(false);

        expect(tcp.connected).toBe(false);
        expect(connected.mock.calls[0][0].detail).toBe(false);
        expect(unlisten).toHaveBeenCalledTimes(2);
    });

    it("sends nothing while disconnected", async () => {
        const cb = vi.fn();

        expect(await tcp.send(new Uint8Array([1, 2]), cb)).toEqual({ bytesSent: 0 });

        expect(invoke).not.toHaveBeenCalledWith("tcp_send", expect.anything());
        expect(cb).not.toHaveBeenCalled();
    });

    it("sends the bytes as a number array and reports their length", async () => {
        await tcp.connect("tcp://10.0.0.1:5761");
        const cb = vi.fn();

        expect(await tcp.send(new Uint8Array([7, 8, 9]).buffer, cb)).toEqual({ bytesSent: 3 });

        expect(invoke).toHaveBeenCalledWith("tcp_send", { data: [7, 8, 9] });
        expect(cb).toHaveBeenCalledWith({ error: null, bytesSent: 3 });
        expect(tcp.bytesSent).toBe(3);
    });

    it("reports 0 bytes when the native send fails", async () => {
        await tcp.connect("tcp://10.0.0.1:5761");
        const failure = new Error("broken pipe");
        invoke.mockRejectedValueOnce(failure);
        const cb = vi.fn();

        expect(await tcp.send(new Uint8Array([1]), cb)).toEqual({ bytesSent: 0 });

        expect(cb).toHaveBeenCalledWith({ error: failure, bytesSent: 0 });
        expect(tcp.bytesSent).toBe(0);
    });

    it("disconnects when the peer closes", async () => {
        await tcp.connect("tcp://10.0.0.1:5761");
        const disconnected = vi.fn();
        tcp.addEventListener("disconnect", disconnected);

        handlers["tcp-closed"]({ payload: null });
        await vi.waitFor(() => expect(disconnected).toHaveBeenCalled());

        expect(invoke).toHaveBeenCalledWith("tcp_disconnect");
        expect(tcp.connected).toBe(false);
        expect(disconnected.mock.calls[0][0].detail).toBe(true);
    });
});
