import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Characterization — pins the reconnect behavior of
// useMspCliSession.scheduleReconnect()/cancelScheduledReconnect(). We mock the
// collaborators it reaches into (GUI's timeout registry and serial_backend) so
// we can observe exactly when the reconnect fires.
//
// Behavior (what this pins): scheduleReconnect() splits by transport.
// - Serial (re-enumerating) targets: a single named timeout ("msp_cli_reconnect")
//   that, after RECONNECT_DELAY_MS (500ms), calls disconnect() exactly once —
//   NOT a retry loop; reconnection is auto-connect's job on device re-enumeration.
//   A second scheduleReconnect() replaces (de-bounces) the pending one.
// - Bluetooth/manual targets (never re-enumerate, so auto-connect would never
//   fire): delegate to serial_backend.scheduleRebootReconnect(), which drives
//   the flush -> drop-stale-link -> retry cycle itself.
// ---------------------------------------------------------------------------

const { GUI, connectDisconnect, disconnect, scheduleRebootReconnect } = vi.hoisted(() => {
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
        disconnect: vi.fn(),
        scheduleRebootReconnect: vi.fn(),
    };
});

vi.mock("../../src/js/gui", () => ({
    __esModule: true,
    default: GUI,
}));

vi.mock("../../src/js/serial_backend", () => ({
    __esModule: true,
    connectDisconnect,
    disconnect,
    scheduleRebootReconnect,
    // Mirror the real predicate — scheduleReconnect branches on it.
    isDrivenRebootTarget: (port) => typeof port === "string" && (port.startsWith("bluetooth") || port === "manual"),
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

import { scheduleReconnect, cancelScheduledReconnect, saveAndReconnect } from "../../src/composables/useMspCliSession";
import MSP from "../../src/js/msp";
import PortHandler from "../../src/js/port_handler";
import { getConnectionState, __resetConnectionStateForTests, State } from "../../src/js/connection_state.js";

describe("useMspCliSession.scheduleReconnect (characterization)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        GUI._timers.clear();
        __resetConnectionStateForTests();
        // Auto-Connect on is the reconnect path these cases characterize; the off case is
        // covered explicitly below. A real selected port is needed for the reconnect window.
        PortHandler.portPicker.selectedPort = "serial_0";
        PortHandler.portPicker.autoConnect = true;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("drops the stale link once after 500ms (one-shot, not a retry loop; reconnect is auto-connect's job)", () => {
        scheduleReconnect();

        // Nothing fires before the 500ms delay.
        vi.advanceTimersByTime(499);
        expect(disconnect).not.toHaveBeenCalled();

        // Fires exactly once at the delay boundary.
        vi.advanceTimersByTime(1);
        expect(disconnect).toHaveBeenCalledTimes(1);

        // No further calls — it is a single timeout, not an interval. And it never connects
        // explicitly (that would target the stale pre-reboot id).
        vi.advanceTimersByTime(10000);
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(connectDisconnect).not.toHaveBeenCalled();
    });

    it("de-bounces: a second scheduleReconnect replaces the pending one (still one disconnect)", () => {
        scheduleReconnect();
        vi.advanceTimersByTime(300);

        // Re-scheduling removes the prior timeout and starts a fresh 500ms window.
        scheduleReconnect();
        expect(GUI.timeout_remove).toHaveBeenCalledWith("msp_cli_reconnect");

        // The first (replaced) timer would have fired at 500ms from the start (i.e. 200ms
        // from now) — prove it does NOT, because it was cancelled.
        vi.advanceTimersByTime(200);
        expect(disconnect).not.toHaveBeenCalled();

        // Only the second timer fires, exactly once.
        vi.advanceTimersByTime(300);
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("cancelScheduledReconnect removes the pending timeout so nothing fires", () => {
        scheduleReconnect();
        cancelScheduledReconnect();

        vi.advanceTimersByTime(10000);
        expect(disconnect).not.toHaveBeenCalled();
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

    it("a late cancel (after the timer fired) does NOT abort a live connect", () => {
        PortHandler.portPicker.selectedPort = "serial_0";

        scheduleReconnect();
        expect(getConnectionState().state).toBe(State.RECONNECTING);

        // The timer drops the stale link; auto-connect (external) then reconnects to the
        // re-enumerated device, advancing the phase (RECONNECTING -> CONNECTING -> HANDSHAKING).
        // Simulate that transition here.
        vi.advanceTimersByTime(500);
        expect(disconnect).toHaveBeenCalledTimes(1);
        getConnectionState().setPhase(State.CONNECTING);

        // A late cancel (e.g. leaving the Presets tab mid-handshake) must NOT force the live
        // connect to IDLE — the connect flow owns the phase now and settles it itself.
        cancelScheduledReconnect();
        expect(getConnectionState().state).toBe(State.CONNECTING);
    });

    it("bluetooth target: delegates to serial_backend's driven reboot cycle (BLE never re-enumerates)", () => {
        // Regression (#5209 follow-up): a BLE device stays on the port list across an FC
        // reboot — no removedDevice/addedDevice cycle fires — so the passive drop-and-wait
        // path would never reconnect. scheduleReconnect must hand BLE to the driven
        // flush/disconnect/retry cycle instead.
        PortHandler.portPicker.selectedPort = "bluetooth_x81jPGap0DdYcGTJyKZWyw==";

        scheduleReconnect();

        expect(scheduleRebootReconnect).toHaveBeenCalledTimes(1);

        // The passive one-shot must NOT also run — the driven cycle owns the disconnect
        // (via disconnectForReboot, without the MSP round-trip a rebooting FC can't answer).
        vi.advanceTimersByTime(10000);
        expect(disconnect).not.toHaveBeenCalled();
        expect(connectDisconnect).not.toHaveBeenCalled();
    });

    it("with Auto-Connect OFF: drops the stale link and does NOT reconnect (no reconnect window)", () => {
        PortHandler.portPicker.autoConnect = false;

        scheduleReconnect();
        // Auto-Connect off means the user opted out of auto-reconnect: no reconnect window.
        expect(getConnectionState().isReconnecting).toBe(false);

        vi.advanceTimersByTime(500);
        // It disconnects the stale link but must NOT attempt a reconnect (which would race the
        // reboot and pop a spurious "failed to open" dialog).
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(connectDisconnect).not.toHaveBeenCalled();
    });

    it("treats a save-reboot connection-closed drain as success, not an error", async () => {
        PortHandler.portPicker.autoConnect = false;
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        // `save` reboots the FC: the port closes before it replies, so the in-flight command is
        // drained with the tagged connection-closed error.
        MSP.send_cli_command.mockImplementation((_cmd, cb) => {
            const err = new Error("Serial connection closed");
            err.connectionClosed = true;
            cb([], err);
        });

        const result = await saveAndReconnect();

        expect(result.ok).toBe(true);
        expect(errSpy).not.toHaveBeenCalled();
        errSpy.mockRestore();
    });

    it("still reports a genuine save failure", async () => {
        PortHandler.portPicker.autoConnect = false;
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        MSP.send_cli_command.mockImplementation((_cmd, cb) => {
            cb([], new Error("###ERROR: bad command"));
        });

        const result = await saveAndReconnect();

        expect(result.ok).toBe(false);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});
