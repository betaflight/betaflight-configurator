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

/**
 * connection_state.ts — connection-status holder.
 *
 * Tracks the current lifecycle PHASE plus the operational flags serial_backend reads
 * (linkOpen, intentionalDisconnect, the attempt's origin). Read by the serial, reboot and
 * flashing paths — serial_backend, device_handler, useMspCliSession, useFirmwareFlashing,
 * webstm32; the UI reads the connection store's connectionValid, not this. State lives in Vue
 * `ref`s, so a `computed` over a getter would track it if a consumer ever needs that. Leaf
 * module: at runtime it imports only `vue` (no Pinia, no serial_backend; the device_handler
 * import is type-only), so the serial/port layer can import it without a cycle or an
 * active-pinia requirement.
 *
 * There is no transition table and no reconnect token. A reconnect uses the port from the last
 * selection. selectActivePort() reads isReconnecting and keeps that selection. It does not
 * change the selection to the expert-mode virtual or manual device during a reboot.
 * If the device comes back with a new id, the addedDevice event selects it again. The retry
 * loop then uses the new selection.
 */
import { ref } from "vue";
import type { DeviceDescriptor } from "./device_handler";

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
} as const);

export type Phase = (typeof State)[keyof typeof State];

/** The open reboot reconnect window; see ConnectionState.requestReboot. */
interface RebootWindow {
    startedAt: number;
    durationMs: number;
    target: DeviceDescriptor | null;
}

/**
 * Phases during which a connect/reconnect attempt is in flight. selectActivePort()
 * suppresses the expert-mode virtual/manual fallback throughout this whole window —
 * CONNECTING/HANDSHAKING are included because a reboot reconnect passes through them
 * on each retry, and dropping the guard there would let a transient device-list
 * refresh hijack the selection mid-handshake.
 */
const RECONNECTING_STATES: ReadonlySet<Phase> = Object.freeze(
    new Set<Phase>([State.CONNECTING, State.HANDSHAKING, State.REBOOTING, State.RECONNECTING]),
);

/**
 * Phases a reboot genuinely owns: the link drop during these is expected and their
 * own conclude settles them, so notifyClosed() must leave them alone. A close during
 * any other in-flight phase (CONNECTING/HANDSHAKING) is an unexpected drop and settles
 * to IDLE.
 */
const REBOOT_OWNED_STATES: ReadonlySet<Phase> = Object.freeze(new Set<Phase>([State.REBOOTING, State.RECONNECTING]));

/** The reboot owns this phase. */
function rebootOwns(phase: Phase): boolean {
    return REBOOT_OWNED_STATES.has(phase);
}

export class ConnectionState {
    private readonly _state = ref<Phase>(State.IDLE);
    // The next close is user-initiated (so the disconnect handler doesn't run
    // the unexpected-disconnect teardown on top of the intentional one).
    private readonly _intentionalDisconnect = ref(false);
    // A transport link is currently open (was serial_backend's `isConnected`).
    private readonly _linkOpen = ref(false);
    // The reboot reconnect window: { startedAt, durationMs, target } while a reboot is in
    // progress, null otherwise. Single source of truth for how long the reconnect
    // may take — the retry loop and the reboot dialog read the same snapshot, taken
    // once per reboot.
    private readonly _rebootWindow = ref<RebootWindow | null>(null);
    // The attempt in flight was started by the app, not the user.
    private readonly _automaticAttempt = ref(false);

    get state(): Phase {
        return this._state.value;
    }

    get isFlashing(): boolean {
        return this._state.value === State.FLASHING;
    }

    /** A connect/reconnect attempt is in flight — keep the current port selected, no fallback. */
    get isReconnecting(): boolean {
        return RECONNECTING_STATES.has(this._state.value);
    }

    /**
     * A connect attempt begins. A reboot reconnect keeps its own phase.
     * @param automatic - the app started this attempt, not the user
     */
    attemptStarted(automatic = false): void {
        this._automaticAttempt.value = automatic;
        if (!rebootOwns(this._state.value)) {
            this.setPhase(State.CONNECTING);
        }
    }

    /**
     * Should a failed attempt reach the user? Yes if they asked for it, or if the link had
     * opened — a handshake rejected after the open is terminal. An app-initiated attempt
     * that never opened is retried by the next device event, so it stays quiet.
     */
    get failureIsUserFacing(): boolean {
        return !this._automaticAttempt.value || this._linkOpen.value;
    }

    /** Set the lifecycle phase. */
    setPhase(phase: Phase): void {
        this._state.value = phase;
    }

    // ---- Reboot / reconnect window ----------------------------------------

    /**
     * Begin a reboot: (re)open the reconnect window for `windowMs`. The phase change is
     * a no-op if a reboot/reconnect is already in flight, but the window is always
     * refreshed — a second save inside the window restarts the clock, matching the
     * retry loop's own restart.
     * @param windowMs - how long the reconnect may take
     * @param target - which device is coming back (device_handler's describeDevice output).
     *   Held opaquely: this module knows the window, not devices.
     */
    requestReboot(windowMs = 10000, target: DeviceDescriptor | null = null): void {
        this._rebootWindow.value = { startedAt: Date.now(), durationMs: windowMs, target };
        if (this.isReconnecting) {
            return;
        }
        this.setPhase(State.REBOOTING);
    }

    /** A reboot reconnect window is open (from requestReboot until concludeReboot). */
    get isRebootWindowOpen(): boolean {
        return this._rebootWindow.value !== null;
    }

    /** Duration of the open reboot window (0 if none) — snapshotted at requestReboot. */
    get rebootWindowMs(): number {
        return this._rebootWindow.value?.durationMs ?? 0;
    }

    /** The device the open window is waiting for (null if none, or if it was not identified). */
    get rebootTarget(): DeviceDescriptor | null {
        return this._rebootWindow.value?.target ?? null;
    }

    /** Start timestamp of the open reboot window (0 if none). */
    get rebootWindowStartedAt(): number {
        return this._rebootWindow.value?.startedAt ?? 0;
    }

    /** The open reboot window has run past its duration. False when no window is open. */
    get rebootWindowExpired(): boolean {
        const window = this._rebootWindow.value;
        return window !== null && Date.now() - window.startedAt > window.durationMs;
    }

    /** Enter the reconnect-wait phase (from a reboot, or a CLI save-and-reconnect). */
    reconnectStarted(): void {
        this.setPhase(State.RECONNECTING);
    }

    /** Settle a reboot/reconnect window: reconnected -> CONNECTED, else -> IDLE. */
    concludeReboot(reconnected: boolean): void {
        this._rebootWindow.value = null;
        this.setPhase(reconnected ? State.CONNECTED : State.IDLE);
    }

    /**
     * Settle on a link close, from the single teardown convergence point (onClosed).
     * A reboot's link drop is expected and still owns the lifecycle, so REBOOTING/
     * RECONNECTING are left untouched (their conclude settles them). Any other in-flight
     * phase — including an unexpected drop mid-CONNECTING/HANDSHAKING — settles to IDLE.
     */
    notifyClosed(): void {
        if (this._state.value === State.IDLE || rebootOwns(this._state.value)) {
            return;
        }
        this.setPhase(State.IDLE);
    }

    // ---- Flashing ----------------------------------------------------------

    /** Stand the reconnect down and hand the raw port to the flasher (enter FLASHING). */
    beginDeviceReplacement(): void {
        this.setPhase(State.FLASHING);
    }

    /** Leave FLASHING back to IDLE. */
    endFlashing(): void {
        if (this._state.value === State.FLASHING) {
            this.setPhase(State.IDLE);
        }
    }

    // ---- Operational flags -------------------------------------------------

    markIntentionalDisconnect(): void {
        this._intentionalDisconnect.value = true;
    }

    clearIntentionalDisconnect(): void {
        this._intentionalDisconnect.value = false;
    }

    /** Non-destructive peek: is the next close expected to be intentional? */
    get intentionalDisconnect(): boolean {
        return this._intentionalDisconnect.value;
    }

    /** Read-and-reset: was the close that just happened intentional? */
    consumeIntentionalDisconnect(): boolean {
        const wasIntentional = this._intentionalDisconnect.value;
        this._intentionalDisconnect.value = false;
        return wasIntentional;
    }

    get linkOpen(): boolean {
        return this._linkOpen.value;
    }

    setLinkOpen(open: boolean): void {
        this._linkOpen.value = Boolean(open);
    }

    /** Hard shutdown for page unload (pagehide): collapse to IDLE, ungated. */
    shutdown(): void {
        this._linkOpen.value = false;
        this._rebootWindow.value = null;
        if (this._state.value !== State.IDLE) {
            this.setPhase(State.IDLE);
        }
    }
}

// Lazily-constructed singleton (no module-init-order hazard).
let _instance: ConnectionState | null = null;

export function getConnectionState(): ConnectionState {
    _instance ??= new ConnectionState();
    return _instance;
}

/** Test helper: drop the singleton so each test starts clean. */
export function __resetConnectionStateForTests(): void {
    _instance = null;
}
