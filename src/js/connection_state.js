/**
 * connection_state.js — small connection-status holder.
 *
 * Tracks the current lifecycle PHASE plus the PREVIOUS phase, two operational
 * flags serial_backend reads (linkOpen, intentionalDisconnect), and a
 * subscribe()/snapshot() read-model that useConnectionStore mirrors.
 *
 * There is no transition table and no reconnect token: a reconnect simply
 * re-uses the previously-selected port (the device re-enumerates with the same
 * stable id), and selectActivePort() consults isReconnecting to avoid hijacking
 * the selection with the expert-mode virtual/manual fallback mid-reboot. Plain
 * module: NO Vue/Pinia/serial_backend imports.
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

/**
 * Phases during which a connect/reconnect attempt is in flight. selectActivePort()
 * suppresses the expert-mode virtual/manual fallback throughout this whole window —
 * CONNECTING/HANDSHAKING are included because a reboot reconnect passes through them
 * on each retry, and dropping the guard there would let a transient device-list
 * refresh hijack the selection mid-handshake.
 */
const RECONNECTING_STATES = Object.freeze(
    new Set([State.CONNECTING, State.HANDSHAKING, State.REBOOTING, State.RECONNECTING]),
);

export class ConnectionState {
    constructor() {
        this._state = State.IDLE;
        this._prevState = State.IDLE;
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

    get previousState() {
        return this._prevState;
    }

    get isReady() {
        return READY_STATES.has(this._state);
    }

    get isFlashing() {
        return this._state === State.FLASHING;
    }

    /** A connect/reconnect attempt is in flight — keep the current port selected, no fallback. */
    get isReconnecting() {
        return RECONNECTING_STATES.has(this._state);
    }

    /** Set the lifecycle phase, remembering the previous one. */
    setPhase(phase) {
        if (phase === this._state) {
            return;
        }
        this._prevState = this._state;
        this._state = phase;
        this._notify(this._prevState);
    }

    // ---- Reboot / reconnect window ----------------------------------------

    /** Begin a reboot. Returns false if a reboot/reconnect is already in flight. */
    requestReboot() {
        if (this.isReconnecting) {
            return false;
        }
        this.setPhase(State.REBOOTING);
        return true;
    }

    /** Enter the reconnect-wait phase (from a reboot, or a CLI save-and-reconnect). */
    reconnectStarted() {
        this.setPhase(State.RECONNECTING);
    }

    /** Settle a reboot/reconnect window: reconnected -> CONNECTED, else -> IDLE. */
    concludeReboot(reconnected) {
        this.setPhase(reconnected ? State.CONNECTED : State.IDLE);
    }

    /**
     * Settle on a link close, from the single teardown convergence point
     * (onClosed). A reboot's link drop is expected and still owns the lifecycle,
     * so REBOOTING/RECONNECTING are left untouched (their conclude settles them).
     */
    notifyClosed() {
        if (this.isReconnecting || this._state === State.IDLE) {
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
            previousState: this._prevState,
            isReady: this.isReady,
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

export function getConnectionState() {
    if (!_instance) {
        _instance = new ConnectionState();
    }
    return _instance;
}

/** Test helper: drop the singleton so each test starts clean. */
export function __resetConnectionStateForTests() {
    _instance = null;
}
