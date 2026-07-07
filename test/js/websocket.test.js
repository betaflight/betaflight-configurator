import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Websocket from "../../src/js/protocols/WebSocket";

// Minimal stand-in for the browser WebSocket: the protocol assigns the on* handlers
// directly, so tests can capture and invoke them like the platform would.
class FakeWebSocket {
    constructor(url, protocols) {
        this.url = url;
        this.protocols = protocols;
        this.close = vi.fn();
        this.send = vi.fn();
    }
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
        socket.addEventListener("connect", (e) => connected(e.detail));

        await socket.connect("tcp://localhost:5761");

        expect(connected).toHaveBeenCalledWith(false);
        errSpy.mockRestore();
    });

    it("a superseded socket's late onclose neither closes the new socket nor signals disconnect", async () => {
        const socket = new Websocket();

        await socket.connect("ws://localhost:5761");
        const first = socket.ws;
        // Capture the handler as the platform would hold it, before it is detached.
        const firstOnClose = first.onclose;

        await socket.connect("ws://localhost:5761");
        const second = socket.ws;

        const disconnected = vi.fn();
        socket.addEventListener("disconnect", disconnected);

        // The reboot retry loop abandons attempt A and starts attempt B; A's socket
        // then fails late. Its close must not tear down B's session.
        await firstOnClose.call(first, {});
        expect(disconnected).not.toHaveBeenCalled();
        expect(second.close).not.toHaveBeenCalled();

        // The CURRENT socket's close still tears down normally.
        await second.onclose({});
        expect(disconnected).toHaveBeenCalledTimes(1);
        expect(second.close).toHaveBeenCalled();
    });
});
