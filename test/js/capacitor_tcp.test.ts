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

const { plugin, listeners } = vi.hoisted(() => {
    const listeners: Record<string, (event: Record<string, string>) => void> = {};
    return {
        listeners,
        plugin: {
            addListener: vi.fn(async (name: string, listener: (event: Record<string, string>) => void) => {
                listeners[name] = listener;
                return { remove: vi.fn() };
            }),
            connect: vi.fn(),
            send: vi.fn(),
            disconnect: vi.fn(),
        },
    };
});
vi.mock("@capacitor/core", () => ({ Capacitor: { Plugins: { BetaflightTcp: plugin } } }));

const { default: CapacitorTcp } = await import("../../src/js/protocols/CapacitorTcp");

describe("CapacitorTcp", () => {
    let tcp: InstanceType<typeof CapacitorTcp>;

    beforeEach(() => {
        plugin.connect.mockResolvedValue({ success: true });
        plugin.send.mockResolvedValue({ success: true });
        plugin.disconnect.mockResolvedValue({ success: true });
        tcp = new CapacitorTcp();
    });

    afterEach(() => {
        vi.clearAllMocks();
        plugin.connect.mockReset();
        plugin.send.mockReset();
        plugin.disconnect.mockReset();
    });

    it("connects to the bare host and keeps host:port, IPv6 bracketed", async () => {
        const connected = vi.fn();
        tcp.addEventListener("connect", connected);

        await tcp.connect("tcp://[fe80::1]:23");

        expect(plugin.connect).toHaveBeenCalledWith({ ip: "fe80::1", port: 23 });
        expect(tcp.connected).toBe(true);
        expect(tcp.address).toBe("[fe80::1]:23");
        expect(connected.mock.calls[0][0].detail).toBe("[fe80::1]:23");
    });

    it("defaults to the bridge port", async () => {
        await tcp.connect("tcp://10.0.0.1");

        expect(plugin.connect).toHaveBeenCalledWith({ ip: "10.0.0.1", port: 5761 });
    });

    it("reports a connect the plugin does not confirm as false", async () => {
        plugin.connect.mockResolvedValue({});
        const connected = vi.fn();
        tcp.addEventListener("connect", connected);

        await tcp.connect("tcp://10.0.0.1:5761");

        expect(tcp.connected).toBe(false);
        expect(connected.mock.calls[0][0].detail).toBe(false);
    });

    it("decodes received base64 into bytes and counts them", () => {
        const received = vi.fn();
        tcp.addEventListener("receive", received);

        listeners.dataReceived({ data: btoa("\x01\x02\x03") });

        expect(received.mock.calls[0][0].detail).toEqual(new Uint8Array([1, 2, 3]));
        expect(tcp.bytesReceived).toBe(3);
    });

    it("sends nothing while disconnected", async () => {
        expect(await tcp.send(new Uint8Array([1]))).toEqual({ bytesSent: 0 });

        expect(plugin.send).not.toHaveBeenCalled();
    });

    it("sends base64 and reports the byte count", async () => {
        await tcp.connect("tcp://10.0.0.1:5761");
        const cb = vi.fn();

        expect(await tcp.send(new Uint8Array([1, 2, 3]).buffer, cb)).toEqual({ bytesSent: 3 });

        expect(plugin.send).toHaveBeenCalledWith({ data: btoa("\x01\x02\x03") });
        expect(cb).toHaveBeenCalledWith({ error: null, bytesSent: 3 });
        expect(tcp.bytesSent).toBe(3);
    });

    it("reports 0 bytes when the plugin does not confirm the send", async () => {
        await tcp.connect("tcp://10.0.0.1:5761");
        plugin.send.mockResolvedValue({});
        const cb = vi.fn();

        expect(await tcp.send(new Uint8Array([1]), cb)).toEqual({ bytesSent: 0 });

        expect(cb).toHaveBeenCalledWith({ error: expect.any(Error), bytesSent: 0 });
        expect(tcp.bytesSent).toBe(0);
    });

    it.each(["dataReceivedError", "connectionClosed"])("disconnects on %s", async (event) => {
        await tcp.connect("tcp://10.0.0.1:5761");
        const disconnected = vi.fn();
        tcp.addEventListener("disconnect", disconnected);

        listeners[event]({ error: "reset", reason: "peer_closed" });
        await vi.waitFor(() => expect(disconnected).toHaveBeenCalled());

        expect(plugin.disconnect).toHaveBeenCalled();
        expect(tcp.connected).toBe(false);
        expect(disconnected.mock.calls[0][0].detail).toBe(true);
    });

    it("reports a failed connect when the native listeners could not be registered", async () => {
        const failure = new Error("bridge not ready");
        plugin.addListener.mockRejectedValueOnce(failure);
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const unheard = new CapacitorTcp();
        const connected = vi.fn();
        unheard.addEventListener("connect", connected);

        await unheard.connect("tcp://10.0.0.1:5761");

        expect(plugin.connect).not.toHaveBeenCalled();
        // The two listeners that did register are removed again.
        const registered = plugin.addListener.mock.results.slice(-2).map((result) => result.value);
        for (const registration of registered) {
            expect((await registration).remove).toHaveBeenCalledTimes(1);
        }
        expect(unheard.connected).toBe(false);
        expect(connected.mock.calls[0][0].detail).toBe(false);
        expect(logged).toHaveBeenCalledWith("[TCP] Failed to register the native listeners:", failure);
        logged.mockRestore();
    });
});
