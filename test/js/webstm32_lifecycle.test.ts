import { describe, expect, it, vi } from "vitest";

const { flasher, endFlashing } = vi.hoisted(() => ({
    flasher: {
        FLASH_MESSAGE_TYPES: { NEUTRAL: 0, VALID: 1, INVALID: 2 },
        flashingMessage: () => flasher,
        flashProgress: () => flasher,
        resetFlashingState: vi.fn(),
    },
    endFlashing: vi.fn(),
}));

vi.mock("../../src/js/gui", () => ({
    default: { connect_lock: true, interval_remove: vi.fn() },
    TABS: { firmware_flasher: flasher },
}));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (k: string) => k } }));
vi.mock("../../src/js/connection_state", () => ({ getConnectionState: () => ({ endFlashing }) }));
vi.mock("../../src/js/serial", () => ({
    // Like serial.js, calls the callback as a plain function once the port has closed.
    serial: {
        connectionId: "serial_1",
        disconnect: vi.fn(async (callback?: (result: boolean) => void) => {
            callback?.(true);
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    },
}));

import STM32 from "../../src/js/protocols/webstm32";
import { serial } from "../../src/js/serial";

describe("webstm32 lifecycle", () => {
    it("finishes a flash through the serial disconnect callback", async () => {
        const done = vi.fn();
        STM32.callback = done;
        endFlashing.mockClear();

        STM32.upload_procedure(99);
        await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));

        expect(serial.disconnect).toHaveBeenCalledTimes(1);
        expect(endFlashing).toHaveBeenCalledTimes(1);
    });

    it("resets the flasher tab when the user rejects a board mismatch", () => {
        const reboot = vi.spyOn(STM32, "reboot").mockImplementation(() => {});
        flasher.resetFlashingState.mockClear();

        expect(() => STM32.onAbort()).not.toThrow();

        expect(reboot).toHaveBeenCalledTimes(1);
        expect(flasher.resetFlashingState).toHaveBeenCalledTimes(1);
        expect(STM32.rebootMode).toBe(0);
    });
});
