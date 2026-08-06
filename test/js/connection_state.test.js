import { describe, expect, it } from "vitest";
import { computed } from "vue";
import {
    ConnectionState,
    State,
    getConnectionState,
    __resetConnectionStateForTests,
} from "../../src/js/connection_state.js";

// ---------------------------------------------------------------------------
// Connection-status holder: current phase + linkOpen / intentionalDisconnect /
// attempt-origin flags. No transition table and no reconnect token — phase is set
// explicitly, and a reconnect just re-uses the previously-selected port.
// ---------------------------------------------------------------------------

const make = () => new ConnectionState();

describe("phase + readiness", () => {
    it("starts IDLE", () => {
        const c = make();
        expect(c.state).toBe(State.IDLE);
    });

    it("setPhase moves the phase", () => {
        const c = make();
        c.setPhase(State.CONNECTING);
        expect(c.state).toBe(State.CONNECTING);
        c.setPhase(State.CONNECTED);
        expect(c.state).toBe(State.CONNECTED);
    });

    it("is reactive: a computed over a getter tracks setPhase with no manual bridge", () => {
        const c = make();
        const phase = computed(() => c.state);
        expect(phase.value).toBe(State.IDLE);
        c.setPhase(State.CONNECTED);
        expect(phase.value).toBe(State.CONNECTED);
    });
});

describe("attempt origin / failure reporting", () => {
    it("attemptStarted enters CONNECTING", () => {
        const c = make();
        c.attemptStarted();
        expect(c.state).toBe(State.CONNECTING);
    });

    // Both reboot-owned phases. Each case needs its own instance —
    // requestReboot() is a no-op once a phase is in flight.
    it.each([
        ["REBOOTING", (c) => c.requestReboot(), State.REBOOTING],
        [
            "RECONNECTING",
            (c) => {
                c.requestReboot();
                c.reconnectStarted();
            },
            State.RECONNECTING,
        ],
    ])("attemptStarted keeps a reboot reconnect's own phase (%s)", (_label, enterPhase, expected) => {
        const c = make();
        c.setPhase(State.CONNECTED);
        enterPhase(c);

        c.attemptStarted(true);

        expect(c.state).toBe(expected);
    });

    it("reports a user-initiated failure, stays quiet about the app's own", () => {
        const c = make();

        c.attemptStarted(); // the user pressed Connect
        expect(c.failureIsUserFacing).toBe(true);

        c.attemptStarted(true); // a device event / the retry loop
        expect(c.failureIsUserFacing).toBe(false);
    });

    it("reports an automatic attempt's failure once the link had opened", () => {
        // Terminal: no retry turns a rejected handshake into a working connection.
        const c = make();
        c.attemptStarted(true);
        c.setLinkOpen(true);

        expect(c.failureIsUserFacing).toBe(true);
    });
});

describe("reboot / reconnect window", () => {
    it("requestReboot enters REBOOTING and does not re-enter once reconnecting", () => {
        const c = make();
        c.setPhase(State.CONNECTED);
        c.requestReboot();
        expect(c.state).toBe(State.REBOOTING);
        c.reconnectStarted();
        expect(c.state).toBe(State.RECONNECTING);
        c.requestReboot(); // already in flight — must not reset the phase
        expect(c.state).toBe(State.RECONNECTING);
    });

    it("isReconnecting covers the whole connect/reconnect window, false once settled", () => {
        const c = make();
        expect(c.isReconnecting).toBe(false);
        // The reboot retry passes through these phases; the guard must hold across all of them.
        for (const phase of [State.REBOOTING, State.RECONNECTING, State.CONNECTING, State.HANDSHAKING]) {
            c.setPhase(phase);
            expect(c.isReconnecting).toBe(true);
        }
        // The settled and failed phases exist to be outside that set: a failed open never
        // reaches notifyClosed (the transport reports connect:false, not a disconnect), so
        // FAILED is what lets selectActivePort stop aiming at the dead port.
        for (const phase of [State.CONNECTED, State.CLI, State.FAILED, State.IDLE]) {
            c.setPhase(phase);
            expect(c.isReconnecting).toBe(false);
        }
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

    it("notifyClosed settles an unexpected drop mid-handshake to IDLE (not stuck)", () => {
        const c = make();
        c.setPhase(State.CONNECTING);
        c.notifyClosed();
        expect(c.state).toBe(State.IDLE);

        c.setPhase(State.HANDSHAKING);
        c.notifyClosed();
        expect(c.state).toBe(State.IDLE);
    });
});

describe("flashing", () => {
    it("beginDeviceReplacement enters FLASHING; endFlashing returns to IDLE", () => {
        const c = make();
        c.setPhase(State.CONNECTED);
        c.beginDeviceReplacement();
        expect(c.state).toBe(State.FLASHING);
        expect(c.isFlashing).toBe(true);
        c.endFlashing();
        expect(c.state).toBe(State.IDLE);
        expect(c.isFlashing).toBe(false);
    });
});

describe("operational flags", () => {
    it("intentional-disconnect mark / peek / clear / consume (read-and-reset)", () => {
        const c = make();
        expect(c.intentionalDisconnect).toBe(false);
        expect(c.consumeIntentionalDisconnect()).toBe(false);
        c.markIntentionalDisconnect();
        expect(c.intentionalDisconnect).toBe(true); // peek does not reset
        expect(c.intentionalDisconnect).toBe(true);
        expect(c.consumeIntentionalDisconnect()).toBe(true);
        expect(c.consumeIntentionalDisconnect()).toBe(false);
        c.markIntentionalDisconnect();
        c.clearIntentionalDisconnect();
        expect(c.consumeIntentionalDisconnect()).toBe(false);
    });

    it("linkOpen set", () => {
        const c = make();
        expect(c.linkOpen).toBe(false);
        c.setLinkOpen(true);
        expect(c.linkOpen).toBe(true);
        c.setLinkOpen(false);
        expect(c.linkOpen).toBe(false);
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

describe("singleton", () => {
    it("getConnectionState is stable until reset", () => {
        __resetConnectionStateForTests();
        const a = getConnectionState();
        expect(getConnectionState()).toBe(a);
        __resetConnectionStateForTests();
        expect(getConnectionState()).not.toBe(a);
    });
});
