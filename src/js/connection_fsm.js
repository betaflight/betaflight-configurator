/**
 * connection_fsm.js — the single owner of connection lifecycle + intent.
 *
 * A hand-rolled finite state machine (state enum + explicit transition table)
 * that owns:
 *   - the current lifecycle state,
 *   - the FROZEN reconnect token (captured at reboot/connect start; never
 *     re-derived from the live port picker during a reconnect),
 *   - a single AbortController-based reboot/reconnect loop (replaces the five
 *     duplicated timeout/interval orchestrators), and
 *   - a snapshot read-model that `useConnectionStore` (S2b) subscribes to.
 *
 * Deliberately a PLAIN module: NO Vue/Pinia/serial_backend imports, so it has no
 * init-order hazard and is fully unit-testable in isolation. Transports are
 * reached only through dependency-injected callbacks passed to runReconnect().
 *
 * Illegal transitions throw in dev (surfacing missed wiring) and log+ignore in
 * prod (never wedge a user's connection over a programming slip).
 *
 * Slice S2a: the FSM + transition table + abortable reconnect loop, with full
 * unit tests. The live call-site rewiring (serial_backend, gui.js, useReboot,
 * useMspCliSession, stores/connection.js, useCli.js) lands in S2b. The RAII
 * connect_lock and lifecycle-flag ownership land in S4.
 */

/** Lifecycle states. */
export const State = Object.freeze({
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    HANDSHAKING: "HANDSHAKING",
    CONNECTED: "CONNECTED",
    CLI: "CLI", // ready, reduced-capability (CLI-only) session
    REBOOTING: "REBOOTING",
    RECONNECTING: "RECONNECTING",
    DISCONNECTING: "DISCONNECTING",
    FLASHING: "FLASHING", // flasher owns the port; connect/reboot hard-blocked
    FAILED: "FAILED",
});

/** Events that drive transitions. */
export const Event = Object.freeze({
    CONNECT: "CONNECT", // begin opening a link
    HANDSHAKE: "HANDSHAKE", // link open, begin the MSP handshake
    READY: "READY", // readiness reached (full-MSP or virtual) -> CONNECTED
    CLI_READY: "CLI_READY", // readiness reached as CLI-only -> CLI
    REBOOT: "REBOOT", // first-class reboot request
    RECONNECT: "RECONNECT", // reboot issued, begin waiting for the device
    DISCONNECT: "DISCONNECT", // user/intentional teardown
    CLOSED: "CLOSED", // teardown finished / link gone
    FAIL: "FAIL", // unrecoverable error
    FLASH_START: "FLASH_START",
    FLASH_END: "FLASH_END",
    RESET: "RESET", // FAILED/terminal -> IDLE
});

/**
 * Transition table: state -> { event -> nextState }. Any (state, event) pair
 * absent here is an illegal transition. This is the SOLE authority on what may
 * happen next — reentrancy is rejected by omission (e.g. REBOOT is absent from
 * REBOOTING/RECONNECTING, so a second reboot mid-reconnect is rejected, not
 * silently widening the old loop's window).
 */
const TRANSITIONS = Object.freeze({
    [State.IDLE]: {
        [Event.CONNECT]: State.CONNECTING,
        [Event.FLASH_START]: State.FLASHING,
    },
    [State.CONNECTING]: {
        [Event.HANDSHAKE]: State.HANDSHAKING,
        [Event.READY]: State.CONNECTED,
        [Event.CLI_READY]: State.CLI,
        [Event.DISCONNECT]: State.DISCONNECTING,
        [Event.FAIL]: State.FAILED,
        [Event.CLOSED]: State.IDLE,
    },
    [State.HANDSHAKING]: {
        [Event.READY]: State.CONNECTED,
        [Event.CLI_READY]: State.CLI,
        [Event.DISCONNECT]: State.DISCONNECTING,
        [Event.FAIL]: State.FAILED,
        [Event.CLOSED]: State.IDLE,
    },
    [State.CONNECTED]: {
        [Event.REBOOT]: State.REBOOTING,
        [Event.DISCONNECT]: State.DISCONNECTING,
        [Event.FLASH_START]: State.FLASHING,
        [Event.CLI_READY]: State.CLI,
        [Event.CLOSED]: State.DISCONNECTING, // lost link -> teardown
        [Event.FAIL]: State.FAILED,
    },
    [State.CLI]: {
        [Event.REBOOT]: State.REBOOTING,
        [Event.DISCONNECT]: State.DISCONNECTING,
        [Event.READY]: State.CONNECTED, // CLI -> full session
        [Event.CLOSED]: State.DISCONNECTING,
        [Event.FAIL]: State.FAILED,
    },
    [State.REBOOTING]: {
        [Event.RECONNECT]: State.RECONNECTING,
        [Event.DISCONNECT]: State.DISCONNECTING, // abort the reboot
        [Event.FAIL]: State.FAILED,
        // REBOOT intentionally absent: reject re-entrant reboot.
    },
    [State.RECONNECTING]: {
        [Event.CONNECT]: State.CONNECTING, // device reappeared, reopen
        [Event.DISCONNECT]: State.DISCONNECTING,
        [Event.CLOSED]: State.IDLE, // gave up
        [Event.FAIL]: State.FAILED,
        // REBOOT intentionally absent.
    },
    [State.DISCONNECTING]: {
        [Event.CLOSED]: State.IDLE,
        [Event.RESET]: State.IDLE,
    },
    [State.FLASHING]: {
        [Event.FLASH_END]: State.IDLE,
        [Event.FAIL]: State.FAILED,
        // CONNECT/REBOOT/RECONNECT intentionally absent: hard-blocked.
    },
    [State.FAILED]: {
        [Event.RESET]: State.IDLE,
        [Event.DISCONNECT]: State.DISCONNECTING,
        [Event.CLOSED]: State.IDLE,
    },
});

/** States that count as "ready" (a usable connection from the user's view). */
const READY_STATES = Object.freeze(new Set([State.CONNECTED, State.CLI]));

/**
 * Readiness quality (S3): consumers must not read a half-populated FC.CONFIG, so
 * the FSM records HOW ready a connection is. FULLY_READY = the full MSP chain
 * completed (finishOpen) or virtual; CLI_ONLY = CLI/version-mismatch session
 * with only a CLI subset usable.
 */
export const Quality = Object.freeze({
    NONE: "NONE",
    FULLY_READY: "FULLY_READY",
    CLI_ONLY: "CLI_ONLY",
});

function detectDev() {
    try {
        // Vite injects import.meta.env.DEV; guarded so non-Vite contexts (tests,
        // node) don't throw on the bare reference.
        return Boolean(import.meta?.env?.DEV);
    } catch {
        return false;
    }
}

export class ConnectionFsm {
    constructor({ strict } = {}) {
        this._state = State.IDLE;
        // Throw on illegal transitions in dev; log+ignore in prod.
        this._strict = strict ?? detectDev();
        this._quality = Quality.NONE;
        this._token = null;
        this._abort = null;
        this._listeners = new Set();
        this.logHead = "[CONNECTION-FSM]";
    }

    get state() {
        return this._state;
    }

    get isReady() {
        return READY_STATES.has(this._state);
    }

    get quality() {
        return this._quality;
    }

    /** Whether `event` is a legal transition from the current state. */
    can(event) {
        return Boolean(TRANSITIONS[this._state]?.[event]);
    }

    /**
     * Apply an event. Returns the new state. On an illegal transition: throws in
     * strict/dev mode, otherwise logs and returns the unchanged state.
     */
    dispatch(event) {
        const next = TRANSITIONS[this._state]?.[event];
        if (!next) {
            const msg = `${this.logHead} illegal transition: ${this._state} -(${event})-> ?`;
            if (this._strict) {
                throw new Error(msg);
            }
            console.warn(msg);
            return this._state;
        }

        const prev = this._state;
        this._state = next;

        // Readiness quality follows the entry edge (S3): full-MSP/virtual vs CLI.
        if (event === Event.READY) {
            this._quality = Quality.FULLY_READY;
        } else if (event === Event.CLI_READY) {
            this._quality = Quality.CLI_ONLY;
        } else if (!READY_STATES.has(next)) {
            this._quality = Quality.NONE;
        }

        // Token lifecycle: cleared whenever we settle into IDLE; a fresh
        // CONNECTED (not via a reconnect) also drops a stale token.
        if (next === State.IDLE) {
            this._token = null;
        }

        this._notify(prev, event);
        return next;
    }

    // ---- Frozen reconnect token -------------------------------------------

    /**
     * Freeze the reconnect token. Once frozen it is IMMUTABLE until cleared
     * (on reaching IDLE) — so device enumeration during REBOOTING can never
     * change the target. A second freeze while a token is held is ignored.
     * @param {object} token - { transportType, opaqueId, baud, isVirtual }
     */
    freezeReconnectToken(token) {
        if (this._token) {
            return this._token; // already frozen; do not let enumeration mutate it
        }
        // Defensive copy so callers can't mutate the frozen token in place.
        this._token = Object.freeze({ ...token });
        return this._token;
    }

    getReconnectToken() {
        return this._token;
    }

    clearReconnectToken() {
        this._token = null;
    }

    // ---- Reboot intent (S2b consolidation bridge) -------------------------

    /**
     * Mark a reboot as begun. Returns false if a reboot/reconnect is already in
     * flight (reentrancy). NOTE (S2b): the FSM is not yet driven by the live
     * connect/disconnect handlers — that wiring, which makes this rejection
     * AUTHORITATIVE, lands in S4. Until then this is observability + a soft
     * reentrancy signal; the actual overlap guard remains stopRebootReconnect().
     * A reboot implies a live FC, so from any non-reboot state we adopt REBOOTING.
     */
    requestReboot() {
        if (this._state === State.REBOOTING || this._state === State.RECONNECTING) {
            return false;
        }
        const prev = this._state;
        this._state = State.REBOOTING;
        this._notify(prev, Event.REBOOT);
        return true;
    }

    /** Mark the reconnect wait as started (REBOOTING -> RECONNECTING). */
    reconnectStarted() {
        if (this._state === State.REBOOTING) {
            const prev = this._state;
            this._state = State.RECONNECTING;
            this._notify(prev, Event.RECONNECT);
        }
    }

    /**
     * Settle a reboot window: reconnected -> CONNECTED, else -> IDLE (giving up
     * clears the frozen token). Best-effort during the S2b migration.
     */
    concludeReboot(reconnected) {
        const prev = this._state;
        this._state = reconnected ? State.CONNECTED : State.IDLE;
        this._quality = reconnected ? Quality.FULLY_READY : Quality.NONE;
        if (this._state === State.IDLE) {
            this._token = null;
        }
        this._notify(prev, reconnected ? Event.READY : Event.CLOSED);
    }

    /**
     * Settle the FSM on a link close (S4). Called from the single teardown
     * convergence point (onClosed) for BOTH intentional and unexpected
     * disconnects. During a reboot the link drop is expected and the reconnect
     * still owns the lifecycle, so we leave REBOOTING/RECONNECTING untouched —
     * the reboot's concludeReboot settles it. Otherwise -> IDLE.
     */
    notifyClosed() {
        if (this._state === State.REBOOTING || this._state === State.RECONNECTING) {
            return;
        }
        if (this._state === State.IDLE) {
            return;
        }
        const prev = this._state;
        this._state = State.IDLE;
        this._quality = Quality.NONE;
        this._token = null;
        this._notify(prev, Event.CLOSED);
    }

    /**
     * Enter the FLASHING state (S4/S8). The flasher grabs the raw port, so while
     * flashing the FSM hard-blocks connect/reconnect/reboot (those events are
     * absent from the FLASHING row of the table). Returns false if flashing
     * cannot be entered from the current state.
     */
    beginFlashing() {
        if (this._state === State.FLASHING) {
            return true;
        }
        const prev = this._state;
        // Flashing can start from a disconnected idle OR from a connected board
        // (Save-and-flash). Adopt FLASHING directly; the migration singleton is
        // non-strict so this never throws on an unmodeled prior state.
        this._state = State.FLASHING;
        this._quality = Quality.NONE;
        this._token = null;
        this._notify(prev, Event.FLASH_START);
        return true;
    }

    /** Leave FLASHING back to IDLE (S4/S8). */
    endFlashing() {
        if (this._state !== State.FLASHING) {
            return;
        }
        this._state = State.IDLE;
        this._notify(State.FLASHING, Event.FLASH_END);
    }

    /** Whether connect/reconnect/reboot are currently hard-blocked (FLASHING). */
    get isFlashing() {
        return this._state === State.FLASHING;
    }

    // ---- Abort plumbing ----------------------------------------------------

    /** Start a fresh abortable operation (reboot/reconnect). */
    beginOperation() {
        this._abort = new AbortController();
        return this._abort.signal;
    }

    /** Abort the in-flight reboot/reconnect (user disconnect, flash start). */
    abort() {
        this._abort?.abort();
    }

    /**
     * S5: hard shutdown for page unload (pagehide). Cancels any in-flight
     * reboot/reconnect loop and forces the FSM to IDLE regardless of the current
     * state (ungated by isConnected/lock) — a page unload mid-reconnect or while
     * locked must still tear everything down. The caller force-closes the
     * transport; this just collapses the FSM and aborts the loop.
     */
    shutdown() {
        this.abort();
        const prev = this._state;
        this._state = State.IDLE;
        this._quality = Quality.NONE;
        this._token = null;
        if (prev !== State.IDLE) {
            this._notify(prev, Event.CLOSED);
        }
    }

    get signal() {
        return this._abort?.signal ?? null;
    }

    get aborted() {
        return Boolean(this._abort?.signal.aborted);
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
            quality: this._quality,
            token: this._token,
        };
    }

    _notify(prev, event) {
        const snap = this.snapshot();
        for (const listener of this._listeners) {
            try {
                listener(snap, { prev, event });
            } catch (error) {
                console.error(`${this.logHead} subscriber threw:`, error);
            }
        }
    }

    // ---- Reboot / reconnect loop ------------------------------------------

    /**
     * Single AbortController-based reboot+reconnect orchestrator. Replaces the
     * five duplicated timeout/interval loops. Pure w.r.t. transports: every
     * transport-specific action is injected, so this is fully unit-testable.
     *
     * Sequence: REBOOTING -> RECONNECTING, then poll resolveTarget() until the
     * device's CURRENT path is resolvable (handles a CDC path change), open it,
     * wait for readiness, settle to CONNECTED. Honors the AbortController and a
     * per-transport timeout policy with an overall deadline.
     *
     * @param {object} deps
     * @param {() => (string|null)} deps.resolveTarget - current path or null
     * @param {(path: string) => Promise<boolean>} deps.open - open that path
     * @param {() => boolean} deps.isReady - has readiness been reached
     * @param {{initialDelay:number,maxDelay:number,deadline:number}} deps.policy
     * @param {(ms:number, signal:AbortSignal)=>Promise<void>} [deps.wait] - injectable sleep
     * @param {()=>number} [deps.now] - injectable clock
     * @returns {Promise<boolean>} true if reconnected, false on give-up/abort
     */
    async runReconnect(deps) {
        const { resolveTarget, open, isReady, policy } = deps;
        const wait = deps.wait ?? defaultWait;
        const now = deps.now ?? Date.now;

        const signal = this.beginOperation();
        // CONNECTED/CLI -> REBOOTING -> RECONNECTING.
        if (this._state === State.CONNECTED || this._state === State.CLI) {
            this.dispatch(Event.REBOOT);
        }
        if (this._state === State.REBOOTING) {
            this.dispatch(Event.RECONNECT);
        }

        const start = now();
        let delay = policy.initialDelay;

        while (!signal.aborted) {
            if (now() - start > policy.deadline) {
                console.warn(`${this.logHead} reconnect deadline exceeded`);
                this.dispatch(Event.CLOSED); // RECONNECTING -> IDLE (gave up)
                return false;
            }

            const path = resolveTarget();
            if (path != null) {
                // Device is back. RECONNECTING -> CONNECTING and open it.
                if (this._state === State.RECONNECTING) {
                    this.dispatch(Event.CONNECT);
                }
                let opened = false;
                try {
                    opened = await open(path);
                } catch (error) {
                    console.warn(`${this.logHead} reconnect open failed:`, error);
                    opened = false;
                }
                if (signal.aborted) {
                    break;
                }
                if (opened && isReady()) {
                    this.dispatch(Event.READY); // CONNECTING -> CONNECTED
                    return true;
                }
                // Open failed or not ready: fall back to RECONNECTING and retry.
                if (this._state === State.CONNECTING) {
                    this.dispatch(Event.CLOSED); // CONNECTING -> IDLE
                    // Re-enter the reconnect wait from IDLE via CONNECT->...?
                    // Simpler: treat a failed reopen as a retry by re-priming
                    // the loop through RECONNECTING.
                    this._state = State.RECONNECTING;
                }
            }

            try {
                await wait(delay, signal);
            } catch {
                break; // aborted during wait
            }
            delay = Math.min(delay * 2, policy.maxDelay);
        }

        // Aborted.
        if (this._state === State.RECONNECTING || this._state === State.CONNECTING) {
            this.dispatch(Event.DISCONNECT); // -> DISCONNECTING
            this.dispatch(Event.CLOSED); // -> IDLE
        }
        return false;
    }
}

/** Default abortable sleep. Rejects if the signal aborts mid-wait. */
function defaultWait(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error("aborted"));
            return;
        }
        const id = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(id);
                reject(new Error("aborted"));
            },
            { once: true },
        );
    });
}

/** Default per-transport timeout policy (ms). Tuned per transport in S2b. */
export const DEFAULT_POLICY = Object.freeze({ initialDelay: 250, maxDelay: 2000, deadline: 30000 });

// Lazily-constructed singleton so there is no module-init-order hazard.
let _instance = null;

/** The process-wide connection FSM. */
export function getConnectionFsm() {
    if (!_instance) {
        // Non-strict during the migration: until EVERY connect/disconnect/reboot
        // writer is routed through the FSM (completed in S7), a live dispatch can
        // legitimately arrive in a state the table doesn't yet model. Non-strict
        // logs+ignores those instead of throwing and wedging a real connection.
        // Unit tests construct `new ConnectionFsm({ strict: true })` directly, so
        // the transition table is still verified strictly. Flip this to strict
        // (the default dev behavior) in S7 once all writers are rerouted.
        _instance = new ConnectionFsm({ strict: false });
    }
    return _instance;
}

/** Test helper: drop the singleton so each test starts clean. */
export function __resetConnectionFsmForTests() {
    _instance = null;
}
