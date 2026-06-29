import { describe, expect, it, vi } from "vitest";
import {
    ConnectionState,
    State,
    getConnectionState,
    __resetConnectionStateForTests,
} from "../../src/js/connection_state.js";

// ---------------------------------------------------------------------------
// Thin connection-status holder: current + previous phase, linkOpen /
// intentionalDisconnect flags, and a subscribe/snapshot read-model. No
// transition table and no reconnect token — phase is set explicitly, and a
// reconnect just re-uses the previously-selected port.
// ---------------------------------------------------------------------------

const make = () => new ConnectionState();

describe("phase + readiness", () => {
    it("starts IDLE / not-ready and exposes a snapshot", () => {
        const c = make();
        expect(c.state).toBe(State.IDLE);
        expect(c.isReady).toBe(false);
        expect(c.snapshot()).toEqual({ state: State.IDLE, previousState: State.IDLE, isReady: false });
    });

    it("remembers the previous phase across a transition", () => {
        const c = make();
        c.setPhase(State.CONNECTING);
        c.setPhase(State.CONNECTED);
        expect(c.state).toBe(State.CONNECTED);
        expect(c.previousState).toBe(State.CONNECTING);
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

    it("isReconnecting covers the whole connect/reconnect window, false once settled", () => {
        const c = make();
        expect(c.isReconnecting).toBe(false);
        // The reboot retry passes through these phases; the guard must hold across all of them.
        for (const phase of [State.REBOOTING, State.RECONNECTING, State.CONNECTING, State.HANDSHAKING]) {
            c.setPhase(phase);
            expect(c.isReconnecting).toBe(true);
        }
        c.setPhase(State.CONNECTED);
        expect(c.isReconnecting).toBe(false);
        c.setPhase(State.IDLE);
        expect(c.isReconnecting).toBe(false);
    });

    it("concludeReboot settles to CONNECTED on success / IDLE on failure", () => {
        const c = make();
        c.requestReboot();
        c.concludeReboot(true);
        expect(c.state).toBe(State.CONNECTED);

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
    it("collapses to IDLE and clears linkOpen from any phase", () => {
        const c = make();
        c.requestReboot();
        c.setLinkOpen(true);
        c.shutdown();
        expect(c.state).toBe(State.IDLE);
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
