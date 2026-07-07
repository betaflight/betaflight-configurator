import { describe, expect, it } from "vitest";
import { computed } from "vue";
import {
    ConnectionState,
    State,
    getConnectionState,
    __resetConnectionStateForTests,
} from "../../src/js/connection_state.js";

// ---------------------------------------------------------------------------
// Connection-status holder: current phase + linkOpen / intentionalDisconnect
// flags. No transition table and no reconnect token — phase is set explicitly,
// and a reconnect just re-uses the previously-selected port. State lives in Vue
// refs, so the getters are both synchronously readable and reactively trackable.
// ---------------------------------------------------------------------------

const make = () => new ConnectionState();

describe("phase + readiness", () => {
    it("starts IDLE / not-ready", () => {
        const c = make();
        expect(c.state).toBe(State.IDLE);
        expect(c.isReady).toBe(false);
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

    it("is reactive: a computed over a getter tracks setPhase with no manual bridge", () => {
        const c = make();
        const phase = computed(() => c.state);
        const ready = computed(() => c.isReady);
        expect(phase.value).toBe(State.IDLE);
        expect(ready.value).toBe(false);
        c.setPhase(State.CONNECTED);
        expect(phase.value).toBe(State.CONNECTED);
        expect(ready.value).toBe(true);
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

describe("singleton", () => {
    it("getConnectionState is stable until reset", () => {
        __resetConnectionStateForTests();
        const a = getConnectionState();
        expect(getConnectionState()).toBe(a);
        __resetConnectionStateForTests();
        expect(getConnectionState()).not.toBe(a);
    });
});
