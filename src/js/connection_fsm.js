/**
 * connection_fsm.js — small connection-status holder + reconnect token.
 *
 * History note: this began as a transition-table finite state machine, but the
 * table ended up bypassed more than it was used (every reboot/teardown path set
 * the state directly) and was non-strict in production, so it enforced nothing
 * live. It has been demoted to what it actually is: a thin reactive status
 * holder. It owns:
 *   - the current lifecycle PHASE (a plain value, for the read-model/UI),
 *   - the FROZEN reconnect token (the single reconnect-target authority; captured
 *     at reboot/CLI-reconnect start, re-resolved per-transport, never re-derived
 *     from the live port picker mid-reconnect),
 *   - two operational flags serial_backend reads: linkOpen (a transport link is
 *     open) and intentionalDisconnect (the next close is user-initiated),
 *   - a subscribe()/snapshot() read-model that useConnectionStore mirrors.
 *
 * Behaviour is driven by these values + the LockManager (connect_lock); there is
 * no transition table doing validation — phase is set explicitly by the small
 * set of helpers below. Plain module: NO Vue/Pinia/serial_backend imports.
 */

/** Lifecycle phases (read-model values). */
export const State = Object.freeze({
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    HANDSHAKING: "HANDSHAKING",
    CONNECTED: "CONNECTED",
    CLI: "CLI", // ready, reduced-capability (CLI-only) session
    REBOOTING: "REBOOTING",
    RECONNECTING: "RECONNECTING",
    DISCONNECTING: "DISCONNECTING",
    FLASHING: "FLASHING",
    FAILED: "FAILED",
});

/** Phases that count as "ready" (a usable connection from the user's view). */
const READY_STATES = Object.freeze(new Set([State.CONNECTED, State.CLI]));

/** Phases during which a reconnect is in flight and the frozen token is kept. */
const RECONNECT_ACTIVE = Object.freeze(
    new Set([State.CONNECTING, State.HANDSHAKING, State.REBOOTING, State.RECONNECTING]),
);

export class ConnectionState {
    constructor() {
        this._state = State.IDLE;
        // Frozen reconnect-target identity; kept only while a reconnect is in flight.
        this._token = null;
        // The next close is user-initiated (so the disconnect handler doesn't run
        // the unexpected-disconnect teardown on top of the intentional one).
        this._intentionalDisconnect = false;
        // A transport link is currently open (was serial_backend's `isConnected`).
        this._linkOpen = false;
        this._listeners = new Set();
        this.logHead = "[CONNECTION]";
    }

    get state() {
        return this._state;
    }

    get isReady() {
        return READY_STATES.has(this._state);
    }

    get isFlashing() {
        return this._state === State.FLASHING;
    }

    /**
     * Set the lifecycle phase. The frozen reconnect token is kept only while a
     * reconnect is in flight (CONNECTING/HANDSHAKING/REBOOTING/RECONNECTING) and
     * cleared on settling into any other phase.
     */
    setPhase(phase) {
        const prev = this._state;
        this._state = phase;
        if (!RECONNECT_ACTIVE.has(phase)) {
            this._token = null;
        }
        this._notify(prev);
    }

    // ---- Frozen reconnect token -------------------------------------------

    /**
     * Freeze the reconnect token. Immutable until cleared, so device enumeration
     * mid-reconnect can never change the target. A second freeze is ignored.
     * @param {object} token - { transportType, opaqueId, baud, isVirtual }
     */
    freezeReconnectToken(token) {
        if (this._token) {
            return this._token;
        }
        this._token = Object.freeze({ ...token });
        return this._token;
    }

    getReconnectToken() {
        return this._token;
    }

    clearReconnectToken() {
        this._token = null;
    }

    // ---- Reboot / reconnect window ----------------------------------------

    /** Begin a reboot. Returns false if a reboot/reconnect is already in flight. */
    requestReboot() {
        if (this._state === State.REBOOTING || this._state === State.RECONNECTING) {
            return false;
        }
        this.setPhase(State.REBOOTING);
        return true;
    }

    /** REBOOTING -> RECONNECTING (the reconnect wait has started). */
    reconnectStarted() {
        if (this._state === State.REBOOTING) {
            this.setPhase(State.RECONNECTING);
        }
    }

    /** Settle a reboot window: reconnected -> CONNECTED, else -> IDLE (token cleared either way). */
    concludeReboot(reconnected) {
        this.setPhase(reconnected ? State.CONNECTED : State.IDLE);
    }

    /**
     * Settle on a link close, from the single teardown convergence point
     * (onClosed). A reboot's link drop is expected and still owns the lifecycle,
     * so REBOOTING/RECONNECTING are left untouched (their conclude settles them).
     */
    notifyClosed() {
        if (this._state === State.REBOOTING || this._state === State.RECONNECTING || this._state === State.IDLE) {
            return;
        }
        this.setPhase(State.IDLE);
    }

    // ---- Flashing ----------------------------------------------------------

    /** Enter FLASHING (the flasher owns the raw port). */
    beginFlashing() {
        this.setPhase(State.FLASHING);
        return true;
    }

    /** Leave FLASHING back to IDLE. */
    endFlashing() {
        if (this._state === State.FLASHING) {
            this.setPhase(State.IDLE);
        }
    }

    /** Stand the reconnect down and hand the port to the flasher. */
    beginDeviceReplacement() {
        return this.beginFlashing();
    }

    // ---- Operational flags -------------------------------------------------

    markIntentionalDisconnect() {
        this._intentionalDisconnect = true;
    }

    clearIntentionalDisconnect() {
        this._intentionalDisconnect = false;
    }

    /** Read-and-reset: was the close that just happened intentional? */
    consumeIntentionalDisconnect() {
        const wasIntentional = this._intentionalDisconnect;
        this._intentionalDisconnect = false;
        return wasIntentional;
    }

    get linkOpen() {
        return this._linkOpen;
    }

    setLinkOpen(open) {
        this._linkOpen = Boolean(open);
    }

    toggleLinkOpen() {
        this._linkOpen = !this._linkOpen;
        return this._linkOpen;
    }

    /** Hard shutdown for page unload (pagehide): collapse to IDLE, ungated. */
    shutdown() {
        this._linkOpen = false;
        if (this._state !== State.IDLE) {
            this.setPhase(State.IDLE);
        } else {
            this._token = null;
        }
    }

    // ---- Read-model --------------------------------------------------------

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    snapshot() {
        return {
            state: this._state,
            isReady: this.isReady,
            token: this._token,
        };
    }

    _notify(prev) {
        const snap = this.snapshot();
        for (const listener of this._listeners) {
            try {
                listener(snap, { prev });
            } catch (error) {
                console.error(`${this.logHead} subscriber threw:`, error);
            }
        }
    }
}

// Lazily-constructed singleton (no module-init-order hazard).
let _instance = null;

export function getConnectionFsm() {
    if (!_instance) {
        _instance = new ConnectionState();
    }
    return _instance;
}

/** Test helper: drop the singleton so each test starts clean. */
export function __resetConnectionFsmForTests() {
    _instance = null;
}
