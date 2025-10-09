import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { firmware_flasher } from "../../src/js/tabs/firmware_flasher.js";
import { EventBus } from "../../src/components/eventBus.js";

// We'll use fake timers to test debounce and spy EventBus.$off calls

describe("firmware_flasher port change debounce and cleanup", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // ensure no handlers are set
        firmware_flasher.portChangeTimer = null;
        // keep module-scoped handlers intact so tests can call them directly
        // firmware_flasher.detectedUsbDevice etc. are module-scoped and should not be nulled here
    });

    afterEach(() => {
        vi.useRealTimers();
        // restore any spies
        vi.restoreAllMocks();
    });

    it("debounces rapid port changes and invokes AutoDetect.verifyBoard once", async () => {
        // stub AutoDetect.verifyBoard
        const autoDetect = await import("../../src/js/utils/AutoDetect.js");
        const spy = vi.spyOn(autoDetect.default || autoDetect, "verifyBoard").mockImplementation(() => {});

        // Mock dependencies checked by onPortChange
        const GUI = await import("../../src/js/gui.js");
        vi.spyOn(GUI.default || GUI, "connect_lock", "get").mockReturnValue(false);
        const STM32 = await import("../../src/js/protocols/webstm32.js");
        vi.spyOn(STM32.default || STM32, "rebootMode", "get").mockReturnValue(0);
        // Mock jQuery selector for board dropdown
        global.$ = vi.fn(() => ({
            is: vi.fn(() => false),
            val: vi.fn().mockReturnThis(),
            trigger: vi.fn().mockReturnThis(),
        }));

        // simulate three rapid port change events
        firmware_flasher.onPortChange("COM3");
        firmware_flasher.onPortChange("COM4");
        firmware_flasher.onPortChange("COM5");

        // advance timers by less than debounce (should not call verifyBoard yet)
        vi.advanceTimersByTime(200);
        expect(spy).not.toHaveBeenCalled();

        // advance past debounce
        vi.advanceTimersByTime(400);
        expect(spy).toHaveBeenCalledTimes(1);

        spy.mockRestore();
    });

    it("simulates USB attach/detach without physical cable by calling handlers", async () => {
        const autoDetect = await import("../../src/js/utils/AutoDetect.js");
        const spy = vi.spyOn(autoDetect.default || autoDetect, "verifyBoard").mockImplementation(() => {});

        // Mock dependencies checked by detectedSerialDevice
        const GUI = await import("../../src/js/gui.js");
        vi.spyOn(GUI.default || GUI, "connect_lock", "get").mockReturnValue(false);
        const STM32 = await import("../../src/js/protocols/webstm32.js");
        vi.spyOn(STM32.default || STM32, "rebootMode", "get").mockReturnValue(0);

        // Ensure logHead is present to avoid console warnings
        firmware_flasher.logHead = firmware_flasher.logHead || "[FIRMWARE_FLASHER_TEST]";

        // Call the module-scoped serial detection handler directly (simulates driver reporting a serial device)
        // This ensures `isSerial` is true and AutoDetect.verifyBoard is exercised.
        const serialPath = "/dev/ttyUSB0";
        if (typeof firmware_flasher.detectedSerialDevice === "function") {
            firmware_flasher.detectedSerialDevice({ path: serialPath });
        } else if (typeof firmware_flasher.detectedUsbDevice === "function") {
            // fallback: some environments may only expose the usb handler
            firmware_flasher.detectedUsbDevice({ path: serialPath });
        } else {
            // fallback: emit the event the serial port handler would listen for
            EventBus.$emit("port-handler:auto-select-serial-device", { path: serialPath });
        }

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it("cleanup clears timer and unregisters EventBus handlers", () => {
        const offSpy = vi.spyOn(EventBus, "$off");

        // set a fake timer id
        firmware_flasher.portChangeTimer = setTimeout(() => {}, 10000);
        const originalHandlers = {
            detectedUsbDevice: firmware_flasher.detectedUsbDevice,
            detectedSerialDevice: firmware_flasher.detectedSerialDevice,
            onPortChange: firmware_flasher.onPortChange,
            onDeviceRemoved: firmware_flasher.onDeviceRemoved,
        };
        // call cleanup
        firmware_flasher.cleanup();
        // timer should be cleared
        expect(firmware_flasher.portChangeTimer).toBeNull();
        // EventBus.$off should be called for each handler
        expect(offSpy).toHaveBeenCalled();
        expect(offSpy).toHaveBeenCalledTimes(4);
        // Ensure $off was called with the original function references
        expect(offSpy).toHaveBeenCalledWith("port-handler:auto-select-usb-device", originalHandlers.detectedUsbDevice);
        expect(offSpy).toHaveBeenCalledWith(
            "port-handler:auto-select-serial-device",
            originalHandlers.detectedSerialDevice,
        );
        expect(offSpy).toHaveBeenCalledWith("ports-input:change", originalHandlers.onPortChange);
        expect(offSpy).toHaveBeenCalledWith("port-handler:device-removed", originalHandlers.onDeviceRemoved);
        // Handlers should still be defined (not nulled)
        expect(firmware_flasher.detectedUsbDevice).toBeDefined();
        expect(firmware_flasher.detectedSerialDevice).toBeDefined();
        expect(firmware_flasher.onPortChange).toBeDefined();
        expect(firmware_flasher.onDeviceRemoved).toBeDefined();
        offSpy.mockRestore();
    });
});
