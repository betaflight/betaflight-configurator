import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// A CLI save/exit has already rebooted the FC, so the wait that follows is the same one a
// Save & Reboot runs. These pin that it IS the same one: scheduleReconnect hands every
// transport to serial_backend's reconnect cycle, and cancelScheduledReconnect abandons it.
//
// It used to split by transport — serial got a private 500 ms one-shot and a RECONNECTING
// phase with no window, so a device that never came back left the phase there for good;
// only BLE/manual reached the cycle.
// ---------------------------------------------------------------------------

const { GUI, connectDisconnect, disconnect, scheduleRebootReconnect, cancelRebootReconnect } = vi.hoisted(() => {
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
        cancelRebootReconnect: vi.fn(),
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
    cancelRebootReconnect,
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
import DeviceHandler from "../../src/js/device_handler";
import { __resetConnectionStateForTests } from "../../src/js/connection_state.js";

describe("useMspCliSession.scheduleReconnect", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        GUI._timers.clear();
        __resetConnectionStateForTests();
        // Auto-Connect on is the reconnect path these cases characterize; the off case is
        // covered explicitly below. A real selected port is needed for the reconnect window.
        DeviceHandler.devicePicker.selectedDevice = "serial_0";
        DeviceHandler.devicePicker.autoConnect = true;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each(["serial_0", "bluetooth_x81jPGap0DdYcGTJyKZWyw==", "manual"])(
        "hands %s to the one reconnect cycle",
        (target) => {
            DeviceHandler.devicePicker.selectedDevice = target;

            scheduleReconnect();

            expect(scheduleRebootReconnect).toHaveBeenCalledTimes(1);
            // No private timer of its own: the cycle owns the drop and the retries.
            vi.advanceTimersByTime(10000);
            expect(disconnect).not.toHaveBeenCalled();
            expect(connectDisconnect).not.toHaveBeenCalled();
        },
    );

    it("hands over with Auto-Connect off too — the cycle reads it live and ends the window", () => {
        // Previously this path skipped the window entirely when Auto-Connect was off, which
        // left the dialog and selectActivePort with nothing to settle them.
        DeviceHandler.devicePicker.autoConnect = false;

        scheduleReconnect();

        expect(scheduleRebootReconnect).toHaveBeenCalledTimes(1);
    });

    it("cancelScheduledReconnect abandons the cycle", () => {
        scheduleReconnect();
        cancelScheduledReconnect();

        expect(cancelRebootReconnect).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(10000);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it("treats a save-reboot connection-closed drain as success, not an error", async () => {
        DeviceHandler.devicePicker.autoConnect = false;
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
        DeviceHandler.devicePicker.autoConnect = false;
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
