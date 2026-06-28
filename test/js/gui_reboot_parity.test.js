import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// S0 / S2 characterization — CLI-vs-Vue BLE reboot PARITY.
//
// There are TWO reboot/reconnect implementations in the tree:
//
//   1. serial_backend.reinitializeConnection() + rebootReconnect()
//      (used by the Vue reboot path / useReboot). For BLE/manual it:
//        - sends MSP_SET_REBOOT,
//        - waits REBOOT_FLUSH_DELAY_MS (1500ms), then disconnectForReboot(),
//        - and RETRIES connecting on an interval (REBOOT_RECONNECT_RETRY_MS)
//          until connectionValid / timeout / auto-connect off.
//      (See "serial_backend BLE Save-and-Reboot reconnect" in serial_backend.test.js.)
//
//   2. gui.js GuiControl.reinitializeConnection() (the legacy/CLI-era path). For
//      BLE/manual it does a SINGLE one-shot:
//        return setTimeout(emitToggle, 1500);
//      It emits "connection:toggle" exactly once after ~1500ms and then stops —
//      there is NO flush-then-retry loop. If that single toggle reconnects to a
//      still-booting FC and gets dropped, nothing retries.
//
// This test pins divergence #2 so S2 (which is expected to unify these two paths)
// has a regression net. It asserts the CURRENT gui.js behavior (one-shot, no retry).
// ---------------------------------------------------------------------------

const { EventBus, PortHandler, CONFIGURATOR, MSP, MSPCodes } = vi.hoisted(() => {
    return {
        EventBus: { $on: vi.fn(), $emit: vi.fn() },
        PortHandler: {
            portPicker: { selectedPort: "bluetooth_1", autoConnect: true },
            portAvailable: false,
        },
        CONFIGURATOR: { virtualMode: false, connectionValid: false },
        MSP: { send_message: vi.fn() },
        MSPCodes: new Proxy({}, { get: (_t, p) => p }),
    };
});

vi.mock("../../src/components/eventBus", () => ({ __esModule: true, EventBus }));
vi.mock("../../src/js/port_handler", () => ({ __esModule: true, default: PortHandler }));
vi.mock("../../src/js/data_storage", () => ({ __esModule: true, default: CONFIGURATOR }));
vi.mock("../../src/js/msp", () => ({ __esModule: true, default: MSP }));
vi.mock("../../src/js/msp/MSPCodes", () => ({ __esModule: true, default: MSPCodes }));
vi.mock("../../src/js/ConfigStorage", () => ({ __esModule: true, get: (key, fallback) => ({ [key]: fallback }) }));
vi.mock("../../src/js/utils/checkCompatibility", () => ({ __esModule: true, getOS: () => "Linux" }));
vi.mock("../../src/js/localization", () => ({ __esModule: true, i18n: { getMessage: (k) => k } }));
vi.mock("../../src/js/gui_log", () => ({ __esModule: true, gui_log: vi.fn() }));
vi.mock("../../src/stores/dialog", () => ({
    __esModule: true,
    useDialogStore: () => ({ open: vi.fn(), close: vi.fn(), updateProps: vi.fn() }),
}));
vi.mock("../../src/js/pinia_instance", () => ({ __esModule: true, pinia: {} }));

import GUI from "../../src/js/gui";

describe("gui.js reinitializeConnection — BLE reboot (CLI-vs-Vue parity / divergence)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        CONFIGURATOR.virtualMode = false;
        CONFIGURATOR.connectionValid = false;
        PortHandler.portPicker.selectedPort = "bluetooth_1";
        PortHandler.portPicker.autoConnect = true;
        PortHandler.portAvailable = false;
    });

    it("emits a SINGLE connection:toggle at ~1500ms with NO retry loop (diverges from serial_backend flush+retry)", () => {
        vi.useFakeTimers();
        try {
            GUI.reinitializeConnection();

            // The reboot command is sent.
            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_SET_REBOOT, false, false);

            // Nothing toggles before the one-shot delay.
            vi.advanceTimersByTime(1499);
            expect(EventBus.$emit).not.toHaveBeenCalledWith("connection:toggle");

            // Exactly one toggle at the 1500ms boundary.
            vi.advanceTimersByTime(1);
            const toggleCalls = () => EventBus.$emit.mock.calls.filter((c) => c[0] === "connection:toggle").length;
            expect(toggleCalls()).toBe(1);

            // Crucially: NO further toggles — unlike serial_backend.rebootReconnect(),
            // gui.js does not retry. (connectionValid never flips here.)
            vi.advanceTimersByTime(30000);
            expect(toggleCalls()).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does NOT toggle at all when auto-connect is off (no manual-reconnect retry either)", () => {
        vi.useFakeTimers();
        try {
            PortHandler.portPicker.autoConnect = false;

            GUI.reinitializeConnection();

            vi.advanceTimersByTime(30000);
            const toggleCalls = EventBus.$emit.mock.calls.filter((c) => c[0] === "connection:toggle").length;
            expect(toggleCalls).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});
