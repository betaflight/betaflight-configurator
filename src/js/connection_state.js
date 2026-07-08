/**
 * connection_state.js — connection-status holder.
 *
 * Tracks the current lifecycle PHASE plus two operational flags serial_backend
 * reads (linkOpen, intentionalDisconnect). State lives in Vue `ref`s so both
 * plain callers (read the getters synchronously) and Vue consumers (a `computed`
 * that reads a getter automatically tracks the underlying ref) stay in sync with
 * no hand-rolled observer — same approach as data_storage.js. Leaf module: it
 * imports only `vue` (no Pinia, no serial_backend), so the serial/port layer can
 * import it without a cycle or an active-pinia requirement.
 *
 * There is no transition table and no reconnect token: a reconnect simply
 * re-uses the previously-selected port (the device re-enumerates with the same
 * stable id), and selectActivePort() consults isReconnecting to avoid hijacking
 * the selection with the expert-mode virtual/manual fallback mid-reboot.
 */
import { ref } from "vue";

/** Lifecycle phases (read-model values). */
export const State = Object.freeze({
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    HANDSHAKING: "HANDSHAKING",
    CONNECTED: "CONNECTED",
    CLI: "CLI", // ready, reduced-capability (CLI-only) session
    REBOOTING: "REBOOTING",
    RECONNECTING: "RECONNECTING",
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

/**
 * Phases a reboot genuinely owns: the link drop during these is expected and their
 * own conclude settles them, so notifyClosed() must leave them alone. A close during
 * any other in-flight phase (CONNECTING/HANDSHAKING) is an unexpected drop and settles
 * to IDLE.
 */
const REBOOT_OWNED_STATES = Object.freeze(new Set([State.REBOOTING, State.RECONNECTING]));

export class ConnectionState {
    constructor() {
        this._state = ref(State.IDLE);
        // The next close is user-initiated (so the disconnect handler doesn't run
        // the unexpected-disconnect teardown on top of the intentional one).
        this._intentionalDisconnect = ref(false);
        // A transport link is currently open (was serial_backend's `isConnected`).
        this._linkOpen = ref(false);
        this.logHead = "[CONNECTION]";
    }

    get state() {
        return this._state.value;
    }

    get isReady() {
        return READY_STATES.has(this._state.value);
    }

    get isFlashing() {
        return this._state.value === State.FLASHING;
    }

    /** A connect/reconnect attempt is in flight — keep the current port selected, no fallback. */
    get isReconnecting() {
        return RECONNECTING_STATES.has(this._state.value);
    }

    /**
     * A reboot-driven reconnect is in progress (REBOOTING/RECONNECTING), as opposed to a
     * fresh user-initiated connect (CONNECTING/HANDSHAKING). A failed open in this window is
     * expected flakiness — the device is briefly gone while it re-enumerates — so callers
     * suppress the user-facing "connection failed" dialog and let auto-connect recover.
     */
    get isRebootReconnecting() {
        return REBOOT_OWNED_STATES.has(this._state.value);
    }

    /** Set the lifecycle phase. */
    setPhase(phase) {
        this._state.value = phase;
    }

    // ---- Reboot / reconnect window ----------------------------------------

    /** Begin a reboot. No-op if a reboot/reconnect is already in flight. */
    requestReboot() {
        if (this.isReconnecting) {
            return;
        }
        this.setPhase(State.REBOOTING);
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
     * Settle on a link close, from the single teardown convergence point (onClosed).
     * A reboot's link drop is expected and still owns the lifecycle, so REBOOTING/
     * RECONNECTING are left untouched (their conclude settles them). Any other in-flight
     * phase — including an unexpected drop mid-CONNECTING/HANDSHAKING — settles to IDLE.
     */
    notifyClosed() {
        if (this._state.value === State.IDLE || REBOOT_OWNED_STATES.has(this._state.value)) {
            return;
        }
        this.setPhase(State.IDLE);
    }

    // ---- Flashing ----------------------------------------------------------

    /** Stand the reconnect down and hand the raw port to the flasher (enter FLASHING). */
    beginDeviceReplacement() {
        this.setPhase(State.FLASHING);
    }

    /** Leave FLASHING back to IDLE. */
    endFlashing() {
        if (this._state.value === State.FLASHING) {
            this.setPhase(State.IDLE);
        }
    }

    // ---- Operational flags -------------------------------------------------

    markIntentionalDisconnect() {
        this._intentionalDisconnect.value = true;
    }

    clearIntentionalDisconnect() {
        this._intentionalDisconnect.value = false;
    }

    /** Non-destructive peek: is the next close expected to be intentional? */
    get intentionalDisconnect() {
        return this._intentionalDisconnect.value;
    }

    /** Read-and-reset: was the close that just happened intentional? */
    consumeIntentionalDisconnect() {
        const wasIntentional = this._intentionalDisconnect.value;
        this._intentionalDisconnect.value = false;
        return wasIntentional;
    }

    get linkOpen() {
        return this._linkOpen.value;
    }

    setLinkOpen(open) {
        this._linkOpen.value = Boolean(open);
    }

    toggleLinkOpen() {
        this._linkOpen.value = !this._linkOpen.value;
        return this._linkOpen.value;
    }

    /** Hard shutdown for page unload (pagehide): collapse to IDLE, ungated. */
    shutdown() {
        this._linkOpen.value = false;
        if (this._state.value !== State.IDLE) {
            this.setPhase(State.IDLE);
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
