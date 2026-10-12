import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../src/composables/useDialog", () => ({ useDialog: () => ({}) }));

import { useFirmwareFlashing } from "../../src/composables/useFirmwareFlashing";
import { useConnectionStore } from "../../src/stores/connection";

function listeners(flashOnConnect = false) {
    const { setupFlashingEventListeners } = useFirmwareFlashing({
        flashingMessage: vi.fn(),
        flashProgress: vi.fn(),
        FLASH_MESSAGE_TYPES: {
            NEUTRAL: "NEUTRAL",
            VALID: "VALID",
            INVALID: "INVALID",
            ACTION: "ACTION",
            ERASING: "ERASING",
            FLASHING: "FLASHING",
            VERIFYING: "VERIFYING",
        },
        $t: (key) => key,
    });
    const options = {
        getFlashOnConnect: () => flashOnConnect,
        onBoardChange: vi.fn(),
        clearBufferedFirmware: vi.fn(),
        startFlashing: vi.fn(),
        initiateFlashing: vi.fn(),
    };
    return { ...setupFlashingEventListeners(options), options };
}

describe("useFirmwareFlashing reboot to bootloader", () => {
    let connectionStore: ReturnType<typeof useConnectionStore>;

    beforeEach(() => {
        setActivePinia(createPinia());
        connectionStore = useConnectionStore();
        connectionStore.connectLock = false;
        connectionStore.bootloaderRebootMode = 0;
    });

    it("flashes the board once it re-appears in DFU after a pending reboot", () => {
        const { detectedUsbDevice, options } = listeners();
        connectionStore.connectLock = true;
        connectionStore.bootloaderRebootMode = 1;

        detectedUsbDevice("usb_1");

        expect(options.startFlashing).toHaveBeenCalledTimes(1);
        expect(connectionStore.bootloaderRebootMode).toBe(0);
        expect(connectionStore.connectLock).toBe(false);
    });

    it("ignores a USB device while locked with no reboot pending", () => {
        const { detectedUsbDevice, options } = listeners(true);
        connectionStore.connectLock = true;

        detectedUsbDevice("usb_1");

        expect(options.startFlashing).not.toHaveBeenCalled();
        expect(options.initiateFlashing).not.toHaveBeenCalled();
        expect(connectionStore.connectLock).toBe(true);
    });

    it("keeps the board selection while the board drops off the bus to reboot", async () => {
        const { onDeviceRemoved, options } = listeners();
        connectionStore.bootloaderRebootMode = 4;

        await onDeviceRemoved("serial_1");

        expect(options.onBoardChange).not.toHaveBeenCalled();
    });
});
