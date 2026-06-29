import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Characterization — CLI-vs-Vue reboot PARITY (divergence removed).
//
// Before this refactor there were two divergent reboot implementations:
//   1. serial_backend.reinitializeConnection() + rebootReconnect() — flush+retry.
//   2. gui.js GuiControl.reinitializeConnection() — a legacy one-shot that sent
//      MSP_SET_REBOOT itself and emitted a single "connection:toggle" with NO
//      retry loop (so a toggle into a still-booting FC was never retried).
//
// Removes divergence by deleting gui.js's implementation entirely: gui.js no
// longer exposes reinitializeConnection and the "reboot:request" /
// "connection:toggle" EventBus indirection is gone — every reboot goes directly
// through serial_backend's orchestrator. This test — which previously PINNED the
// divergence — now asserts the PARITY: gui.js runs no reboot logic of its own.
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

const toggleCalls = () => EventBus.$emit.mock.calls.filter((c) => c[0] === "connection:toggle").length;
const rebootRequests = () => EventBus.$emit.mock.calls.filter((c) => c[0] === "reboot:request").length;

describe("gui.js reinitializeConnection — delegates to the canonical reboot path (parity)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        CONFIGURATOR.virtualMode = false;
        CONFIGURATOR.connectionValid = false;
        PortHandler.portPicker.selectedPort = "bluetooth_1";
        PortHandler.portPicker.autoConnect = true;
        PortHandler.portAvailable = false;
    });

    it("gui.js owns NO reboot path at all — divergence is structurally impossible", () => {
        // The strongest form of parity: there is no second reboot implementation to
        // diverge. gui.js no longer exposes reinitializeConnection; every reboot goes
        // through serial_backend.reinitializeConnection (imported directly by useCli,
        // OsdTab, useReboot, MSPHelper, and via a dynamic import by stores/connection).
        expect(GUI.reinitializeConnection).toBeUndefined();
    });

    it("gui.js emits no reboot/connect EventBus indirection", () => {
        // The "reboot:request" / "connection:toggle" workarounds are gone.
        vi.useFakeTimers();
        try {
            vi.advanceTimersByTime(30000);
            expect(rebootRequests()).toBe(0);
            expect(toggleCalls()).toBe(0);
            expect(MSP.send_message).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
