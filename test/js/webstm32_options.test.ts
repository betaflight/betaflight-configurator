import { afterEach, describe, expect, it, vi } from "vitest";

const messages: string[] = [];

vi.mock("../../src/js/gui", () => {
    const flasher = {
        FLASH_MESSAGE_TYPES: { NEUTRAL: 0, VALID: 1, INVALID: 2, ACTION: 3, FLASHING: 4, ERASING: 5 },
        flashingMessage: (message: string) => {
            messages.push(message);
            return flasher;
        },
        flashProgress: () => flasher,
    };
    return { default: { connect_lock: false }, TABS: { firmware_flasher: flasher } };
});
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (k: string) => k } }));
vi.mock("../../src/js/serial", () => ({
    serial: { connect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
}));

import STM32 from "../../src/js/protocols/webstm32";
import { serial } from "../../src/js/serial";

const hex = { data: [{ address: 0x08000000, bytes: 4, data: [1, 2, 3, 4] }], bytes_total: 4 };

// Runs the erase step (upload_procedure(4)) against a bootloader stub that ACKs everything.
function erase(eraseChip: boolean, extended: boolean) {
    messages.length = 0;
    const stm32 = STM32 as unknown as Record<string, unknown>;
    const upload = (stm32.upload_procedure as (step: number) => void).bind(STM32);
    const sent: number[][] = [];
    stm32.send = (bytes: number[], _n: number, cb: (d: number[]) => void) => {
        sent.push([...bytes]);
        cb([0x79]);
    };
    stm32.upload_procedure = (step: number) => (step === 4 ? upload(step) : undefined);
    stm32.hex = hex;
    stm32.page_size = 2048;
    stm32.useExtendedErase = extended;
    stm32.mspOptions = { no_reboot: false, reboot_baud: false, erase_chip: eraseChip };
    upload(4);
    return { messages: [...messages], sent };
}

describe("webstm32 honours the flashing options", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.mocked(serial.connect).mockClear();
    });

    it("opens the bootloader port directly when the reboot sequence is skipped", () => {
        const mspConnect = vi.spyOn(STM32.mspConnector, "connect").mockImplementation(() => {});

        STM32.connect("serial_1", 115200, hex as never, { no_reboot: true, erase_chip: false });

        expect(serial.connect).toHaveBeenCalledWith(
            "serial_1",
            expect.objectContaining({ baudRate: 115200 }),
            undefined,
        );
        expect(mspConnect).not.toHaveBeenCalled();
    });

    it("reboots through MSP otherwise", () => {
        const mspConnect = vi.spyOn(STM32.mspConnector, "connect").mockImplementation(() => {});

        STM32.connect("serial_1", 115200, hex as never, { no_reboot: false, reboot_baud: 115200, erase_chip: false });

        expect(mspConnect).toHaveBeenCalledTimes(1);
        expect(serial.connect).not.toHaveBeenCalled();
    });

    it("erases the whole chip when asked, and only the image's pages otherwise", () => {
        expect(erase(true, false).messages).toContain("stm32GlobalErase");
        expect(erase(false, false).messages).not.toContain("stm32GlobalErase");
        expect(erase(true, true).messages).toContain("stm32GlobalEraseExtended");
        expect(erase(false, true).messages).toContain("stm32LocalEraseExtended");
    });
});
