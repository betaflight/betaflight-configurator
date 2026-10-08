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
import Websocket, { type WebsocketConnectDetail } from "../../src/js/protocols/WebSocket";

// Minimal stand-in for the browser WebSocket: the protocol assigns the on* handlers
// directly, so tests can capture and invoke them like the platform would.
class FakeWebSocket {
    url: string;
    protocols: string[];
    close = vi.fn();
    send = vi.fn();

    constructor(url: string, protocols: string[]) {
        this.url = url;
        this.protocols = protocols;
    }
}

/** The socket the protocol currently holds, which a test cannot reach before connect(). */
function currentSocket(socket: Websocket): WebSocket {
    expect(socket.ws).not.toBeNull();
    return socket.ws as WebSocket;
}

function closeEvent(): CloseEvent {
    return {} as CloseEvent;
}

describe("Websocket protocol — superseded socket guard (manual/SITL reconnect)", () => {
    beforeEach(() => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        // unstubAllGlobals doesn't restore vi.spyOn mocks (e.g. console.error); if a spec
        // aborts before its own mockRestore, the spy would leak into later tests.
        vi.restoreAllMocks();
    });

    it("signals a failed open (connect:false) when the WebSocket constructor throws (e.g. raw tcp://)", async () => {
        // Browsers cannot open raw TCP — a tcp:// manual override throws inside the
        // WebSocket constructor. That must surface as a failed open, not a silent death.
        vi.stubGlobal(
            "WebSocket",
            class {
                constructor() {
                    throw new DOMException("invalid scheme", "SyntaxError");
                }
            },
        );
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const socket = new Websocket();
        const connected = vi.fn();
        socket.addEventListener("connect", (e) => connected((e as CustomEvent<WebsocketConnectDetail>).detail));

        await socket.connect("tcp://localhost:5761");

        expect(connected).toHaveBeenCalledWith(false);
        errSpy.mockRestore();
    });

    it("a superseded socket's late onclose neither closes the new socket nor signals disconnect", async () => {
        const socket = new Websocket();

        await socket.connect("ws://localhost:5761");
        const first = currentSocket(socket);
        // Capture the handler as the platform would hold it, before it is detached.
        const firstOnClose = first.onclose;

        await socket.connect("ws://localhost:5761");
        const second = currentSocket(socket);

        const disconnected = vi.fn();
        socket.addEventListener("disconnect", disconnected);

        // The reboot retry loop abandons attempt A and starts attempt B; A's socket
        // then fails late. Its close must not tear down B's session.
        await firstOnClose?.call(first, closeEvent());
        expect(disconnected).not.toHaveBeenCalled();
        expect(second.close).not.toHaveBeenCalled();

        // The CURRENT socket's close still tears down normally.
        await second.onclose?.call(second, closeEvent());
        expect(disconnected).toHaveBeenCalledTimes(1);
        expect(second.close).toHaveBeenCalled();
    });

    it("onopen marks the transport connected and reports the address it opened", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const socket = new Websocket();
        const connected = vi.fn();
        socket.addEventListener("connect", (e) => connected((e as CustomEvent<WebsocketConnectDetail>).detail));

        await socket.connect("ws://sitl.local:5761");
        const ws = currentSocket(socket);
        ws.onopen?.call(ws, new Event("open"));

        expect(socket.connected).toBe(true);
        expect(connected).toHaveBeenCalledWith({ socketId: "ws://sitl.local:5761" });
    });

    it("onmessage forwards the frame as bytes, but drops it if superseded while the blob decoded", async () => {
        const socket = new Websocket();
        const received = vi.fn();
        socket.addEventListener("receive", (e) => received((e as CustomEvent<Uint8Array>).detail));

        // jsdom's Blob does not survive Node's Response, so decoding is stubbed; that also
        // lets the test hold a decode open across a reconnect.
        let finishDecode: (bytes: Uint8Array) => void = () => {};
        const decode = vi
            .spyOn(socket, "blob2uint")
            .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
            .mockImplementationOnce(() => new Promise((resolve) => (finishDecode = resolve)));

        await socket.connect("ws://localhost:5761");
        const ws = currentSocket(socket);
        const frame = () => new MessageEvent("message", { data: new Blob() });

        await ws.onmessage?.call(ws, frame());
        expect(received).toHaveBeenCalledTimes(1);
        expect(received).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));

        // Start decoding a frame on the old socket, then reconnect before it resolves.
        const stale = ws.onmessage?.call(ws, frame());
        await socket.connect("ws://localhost:5761");
        finishDecode(new Uint8Array([9]));
        await stale;
        expect(decode).toHaveBeenCalledTimes(2);
        expect(received).toHaveBeenCalledTimes(1);
    });

    it("send counts the bytes it wrote and reports them", async () => {
        const socket = new Websocket();
        await socket.connect("ws://localhost:5761");
        const ws = currentSocket(socket);

        const result = await socket.send(new Uint8Array([1, 2, 3, 4]));

        expect(ws.send).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ bytesSent: 4 });
        expect(socket.bytesSent).toBe(4);
    });
});
