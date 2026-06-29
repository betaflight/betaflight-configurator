import { describe, expect, it, vi } from "vitest";
import {
    ConnectionState,
    State,
    getConnectionState,
    __resetConnectionStateForTests,
} from "../../src/js/connection_state.js";

// ---------------------------------------------------------------------------
// Thin connection-status holder: phase + reconnect token + linkOpen /
// intentionalDisconnect flags + a subscribe/snapshot read-model. No transition
// table — phase is set explicitly; the token is kept only while a reconnect is
// in flight and cleared on settle.
// ---------------------------------------------------------------------------

const make = () => new ConnectionState();

describe("phase + readiness", () => {
    it("starts IDLE / not-ready and exposes a snapshot", () => {
        const c = make();
        expect(c.state).toBe(State.IDLE);
        expect(c.isReady).toBe(false);
        expect(c.snapshot()).toEqual({ state: State.IDLE, isReady: false, token: null });
    });

    it("setPhase moves the phase and CONNECTED/CLI are ready", () => {
        const c = make();
        c.setPhase(State.CONNECTING);
        expect(c.state).toBe(State.CONNECTING);
        expect(c.isReady).toBe(false);
        c.setPhase(State.CONNECTED);
        expect(c.isReady).toBe(true);
        c.setPhase(State.CLI);
        expect(c.isReady).toBe(true);
    });
});

describe("reconnect token lifecycle", () => {
    it("is frozen-immutable and a second freeze is ignored", () => {
        const c = make();
        const first = c.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        expect(Object.isFrozen(first)).toBe(true);
        expect(() => {
            first.opaqueId = "x";
        }).toThrow();
        const second = c.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_9" });
        expect(second).toBe(first);
        expect(c.getReconnectToken().opaqueId).toBe("serial_0");
    });

    it("survives the reconnect-active phases, clears on settle", () => {
        const c = make();
        c.setPhase(State.REBOOTING);
        c.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        c.setPhase(State.RECONNECTING);
        c.setPhase(State.CONNECTING);
        c.setPhase(State.HANDSHAKING);
        expect(c.getReconnectToken()).not.toBeNull(); // preserved across the whole reconnect
        c.setPhase(State.CONNECTED); // settle (success)
        expect(c.getReconnectToken()).toBeNull();
    });

    it("clears the token on settling to IDLE / FLASHING / FAILED too", () => {
        for (const settle of [State.IDLE, State.FLASHING, State.FAILED, State.DISCONNECTING]) {
            const c = make();
            c.setPhase(State.RECONNECTING);
            c.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
            c.setPhase(settle);
            expect(c.getReconnectToken()).toBeNull();
        }
    });
});

describe("reboot / reconnect window", () => {
    it("requestReboot enters REBOOTING and rejects a re-entrant reboot", () => {
        const c = make();
        c.setPhase(State.CONNECTED);
        expect(c.requestReboot()).toBe(true);
        expect(c.state).toBe(State.REBOOTING);
        expect(c.requestReboot()).toBe(false);
        c.reconnectStarted();
        expect(c.state).toBe(State.RECONNECTING);
        expect(c.requestReboot()).toBe(false);
    });

    it("reconnectStarted only advances from REBOOTING", () => {
        const c = make();
        c.setPhase(State.CONNECTED);
        c.reconnectStarted();
        expect(c.state).toBe(State.CONNECTED); // no-op outside REBOOTING
    });

    it("concludeReboot settles to CONNECTED / IDLE and clears the token", () => {
        const c = make();
        c.requestReboot();
        c.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        c.concludeReboot(true);
        expect(c.state).toBe(State.CONNECTED);
        expect(c.getReconnectToken()).toBeNull();

        c.requestReboot();
        c.concludeReboot(false);
        expect(c.state).toBe(State.IDLE);
    });

    it("notifyClosed settles a live session but leaves a reboot in progress", () => {
        const connected = make();
        connected.setPhase(State.CONNECTED);
        connected.notifyClosed();
        expect(connected.state).toBe(State.IDLE);

        const rebooting = make();
        rebooting.requestReboot();
        rebooting.reconnectStarted();
        rebooting.notifyClosed(); // reboot owns the lifecycle — untouched
        expect(rebooting.state).toBe(State.RECONNECTING);
    });
});

describe("flashing", () => {
    it("begin/end FLASHING and isFlashing", () => {
        const c = make();
        c.setPhase(State.CONNECTED);
        expect(c.beginDeviceReplacement()).toBe(true);
        expect(c.state).toBe(State.FLASHING);
        expect(c.isFlashing).toBe(true);
        c.endFlashing();
        expect(c.state).toBe(State.IDLE);
        expect(c.isFlashing).toBe(false);
    });
});

describe("operational flags", () => {
    it("intentional-disconnect mark/clear/consume (read-and-reset)", () => {
        const c = make();
        expect(c.consumeIntentionalDisconnect()).toBe(false);
        c.markIntentionalDisconnect();
        expect(c.consumeIntentionalDisconnect()).toBe(true);
        expect(c.consumeIntentionalDisconnect()).toBe(false);
        c.markIntentionalDisconnect();
        c.clearIntentionalDisconnect();
        expect(c.consumeIntentionalDisconnect()).toBe(false);
    });

    it("linkOpen set / toggle", () => {
        const c = make();
        expect(c.linkOpen).toBe(false);
        c.setLinkOpen(true);
        expect(c.linkOpen).toBe(true);
        expect(c.toggleLinkOpen()).toBe(false);
        expect(c.toggleLinkOpen()).toBe(true);
    });
});

describe("shutdown (pagehide)", () => {
    it("collapses to IDLE and clears token + linkOpen from any phase", () => {
        const c = make();
        c.requestReboot();
        c.freezeReconnectToken({ transportType: "serial", opaqueId: "serial_0" });
        c.setLinkOpen(true);
        c.shutdown();
        expect(c.state).toBe(State.IDLE);
        expect(c.getReconnectToken()).toBeNull();
        expect(c.linkOpen).toBe(false);
    });
});

describe("read-model", () => {
    it("notifies subscribers on each phase change; unsubscribe stops it", () => {
        const c = make();
        const seen = [];
        const unsub = c.subscribe((snap) => seen.push(snap.state));
        c.setPhase(State.CONNECTING);
        c.setPhase(State.CONNECTED);
        unsub();
        c.setPhase(State.DISCONNECTING);
        expect(seen).toEqual([State.CONNECTING, State.CONNECTED]);
    });

    it("a throwing subscriber does not break the holder", () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const c = make();
        c.subscribe(() => {
            throw new Error("boom");
        });
        expect(() => c.setPhase(State.CONNECTING)).not.toThrow();
        expect(c.state).toBe(State.CONNECTING);
        err.mockRestore();
    });
});

describe("singleton", () => {
    it("getConnectionState is stable until reset", () => {
        __resetConnectionStateForTests();
        const a = getConnectionState();
        expect(getConnectionState()).toBe(a);
        __resetConnectionStateForTests();
        expect(getConnectionState()).not.toBe(a);
    });
});
