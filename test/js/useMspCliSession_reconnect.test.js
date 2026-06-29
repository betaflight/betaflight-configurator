import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Characterization — pins the CURRENT one-shot reconnect behavior of
// useMspCliSession.scheduleReconnect()/cancelScheduledReconnect(). We mock the
// two collaborators it reaches into (GUI's timeout registry and serial_backend's
// connectDisconnect) so we can observe exactly when the reconnect fires.
//
// CURRENT behavior (what this pins): scheduleReconnect() registers a single
// named timeout ("msp_cli_reconnect") that, after RECONNECT_DELAY_MS (500ms),
// calls connectDisconnect() exactly once. It is NOT a retry loop, and a second
// scheduleReconnect() replaces (de-bounces) the pending one rather than stacking.
// ---------------------------------------------------------------------------

const { GUI, connectDisconnect } = vi.hoisted(() => {
    return {
        GUI: {
            // Minimal name-keyed timeout registry mirroring gui.js timeout_add/remove.
            _timers: new Map(),
            timeout_add: vi.fn(function (name, code, timeout) {
                GUI.timeout_remove(name);
                const id = setTimeout(() => {
                    GUI._timers.delete(name);
                    code();
                }, timeout);
                GUI._timers.set(name, id);
            }),
            timeout_remove: vi.fn(function (name) {
                const id = GUI._timers.get(name);
                if (id !== undefined) {
                    clearTimeout(id);
                    GUI._timers.delete(name);
                    return true;
                }
                return false;
            }),
        },
        connectDisconnect: vi.fn(),
    };
});

vi.mock("../../src/js/gui", () => ({
    __esModule: true,
    default: GUI,
}));

vi.mock("../../src/js/serial_backend", () => ({
    __esModule: true,
    connectDisconnect,
}));

// Keep the rest of the import graph light — useMspCliSession also imports MSP and FC.
vi.mock("../../src/js/msp", () => ({
    __esModule: true,
    default: { send_cli_command: vi.fn() },
}));
vi.mock("../../src/js/fc", () => ({
    __esModule: true,
    default: { CONFIG: { flightControllerVersion: "4.6.0" } },
}));

import { scheduleReconnect, cancelScheduledReconnect } from "../../src/composables/useMspCliSession";
import PortHandler from "../../src/js/port_handler";
import { getConnectionState, __resetConnectionStateForTests } from "../../src/js/connection_state.js";

describe("useMspCliSession.scheduleReconnect (characterization)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        GUI._timers.clear();
        __resetConnectionStateForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("fires connectDisconnect exactly once after 500ms (one-shot, not a retry loop)", () => {
        scheduleReconnect();

        // Nothing fires before the 500ms delay.
        vi.advanceTimersByTime(499);
        expect(connectDisconnect).not.toHaveBeenCalled();

        // Fires exactly once at the delay boundary.
        vi.advanceTimersByTime(1);
        expect(connectDisconnect).toHaveBeenCalledTimes(1);

        // No further calls — it is a single timeout, not an interval.
        vi.advanceTimersByTime(10000);
        expect(connectDisconnect).toHaveBeenCalledTimes(1);
    });

    it("de-bounces: a second scheduleReconnect replaces the pending one (still one reconnect)", () => {
        scheduleReconnect();
        vi.advanceTimersByTime(300);

        // Re-scheduling removes the prior timeout and starts a fresh 500ms window.
        scheduleReconnect();
        expect(GUI.timeout_remove).toHaveBeenCalledWith("msp_cli_reconnect");

        // The first (replaced) timer would have fired at 500ms from the start (i.e. 200ms
        // from now) — prove it does NOT, because it was cancelled.
        vi.advanceTimersByTime(200);
        expect(connectDisconnect).not.toHaveBeenCalled();

        // Only the second timer fires, exactly once.
        vi.advanceTimersByTime(300);
        expect(connectDisconnect).toHaveBeenCalledTimes(1);
    });

    it("cancelScheduledReconnect removes the pending timeout so connectDisconnect never fires", () => {
        scheduleReconnect();
        cancelScheduledReconnect();

        vi.advanceTimersByTime(10000);
        expect(connectDisconnect).not.toHaveBeenCalled();
    });

    it("cancelScheduledReconnect leaves the reconnect-in-progress window (no sticky reconnect)", () => {
        PortHandler.portPicker.selectedPort = "serial_0";

        // scheduleReconnect enters the reconnect window so selectActivePort keeps the device...
        scheduleReconnect();
        expect(getConnectionState().isReconnecting).toBe(true);

        // ...and cancelling must leave it so selectActivePort's virtual/manual fallback resumes.
        cancelScheduledReconnect();
        expect(getConnectionState().isReconnecting).toBe(false);
    });
});
