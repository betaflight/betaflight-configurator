import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// S0 -> S2b characterization — CLI-vs-Vue reboot PARITY (divergence removed).
//
// BEFORE S2b there were two divergent reboot implementations:
//   1. serial_backend.reinitializeConnection() + rebootReconnect() — flush+retry.
//   2. gui.js GuiControl.reinitializeConnection() — a legacy one-shot that sent
//      MSP_SET_REBOOT itself and emitted a single "connection:toggle" with NO
//      retry loop (so a toggle into a still-booting FC was never retried).
//
// S2b removes divergence by deleting gui.js's implementation: it now simply
// emits "reboot:request", the single canonical event that serial_backend's
// orchestrator handles. This test — which previously PINNED the divergence —
// now asserts the PARITY: gui.js delegates and runs no reboot logic of its own.
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

    it("emits a single reboot:request and runs NO reboot logic of its own", () => {
        vi.useFakeTimers();
        try {
            GUI.reinitializeConnection();

            // Delegation: exactly one reboot:request, emitted synchronously.
            expect(rebootRequests()).toBe(1);

            // gui.js no longer sends the reboot command or toggles the link itself —
            // serial_backend's single orchestrator owns all of that now.
            expect(MSP.send_message).not.toHaveBeenCalled();
            expect(toggleCalls()).toBe(0);

            // And crucially: no legacy one-shot timer / retry loop hiding in gui.js.
            vi.advanceTimersByTime(30000);
            expect(toggleCalls()).toBe(0);
            expect(rebootRequests()).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("delegates identically regardless of port type or auto-connect (no per-case divergence)", () => {
        for (const setup of [
            { selectedPort: "bluetooth_1", autoConnect: true, virtualMode: false },
            { selectedPort: "/dev/ttyACM0", autoConnect: true, virtualMode: false },
            { selectedPort: "manual", autoConnect: false, virtualMode: false },
            { selectedPort: "virtual", autoConnect: true, virtualMode: true },
        ]) {
            vi.clearAllMocks();
            PortHandler.portPicker.selectedPort = setup.selectedPort;
            PortHandler.portPicker.autoConnect = setup.autoConnect;
            CONFIGURATOR.virtualMode = setup.virtualMode;

            GUI.reinitializeConnection();

            // Same single delegation in every case — the whole point of S2b.
            expect(rebootRequests()).toBe(1);
            expect(MSP.send_message).not.toHaveBeenCalled();
            expect(toggleCalls()).toBe(0);
        }
    });
});
