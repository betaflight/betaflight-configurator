// Ported from am32-firmware/am32-configurator/src/mcu.ts.

export default class Mcu {
    static variants = {
        "1F06": {
            name: "STM32F051",
            signature: "0x1f06",
            page_size: 1024,
            flash_size: 65536,
            flash_offset: "0x08000000",
            firmware_start: "0x1000",
            eeprom_offset: "0x7c00",
        },
        3506: {
            name: "ARM64K",
            signature: "0x3506",
            page_size: 1024,
            flash_size: 65536,
            flash_offset: "0x08000000",
            firmware_start: "0x1000",
            eeprom_offset: "0xf800",
        },
        1506: {
            name: "NXP ESC_8KB_PAGE",
            signature: "0x1506",
            page_size: 1024,
            flash_size: 65536,
            flash_offset: "0x08000000",
            firmware_start: "0x4000",
            eeprom_offset: "0xe000",
        },
    };

    static RESET_DELAY_MS = 5000;
    static LAYOUT_SIZE = 0xb8;
    static BOOT_LOADER_VERSION_OFFSET = 0x00c0;
    static BOOT_LOADER_VERSION_SIZE = 1;
    static PORT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    static PIN_CHARACTERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];

    static parseBootLoaderPin(pin) {
        const port = pin >> 4;
        const pinNumber = pin & 0x0f;
        if (Mcu.PORT_CHARACTERS[port] && Mcu.PIN_CHARACTERS[pinNumber]) {
            return [true, `P${Mcu.PORT_CHARACTERS[port]}${Mcu.PIN_CHARACTERS[pinNumber]}`];
        }
        return [false, ""];
    }

    static getVariant(signature) {
        const key = signature.toString(16).toUpperCase();
        const mcu = Mcu.variants[key];
        if (!mcu) {
            throw new Error(`AM32 MCU signature ${key} is not supported by the bundled AM32 configurator map.`);
        }
        return mcu;
    }

    constructor(signature) {
        this.mcu = Mcu.getVariant(signature);
        this.info = null;
    }

    setInfo(info) {
        this.info = info;
    }

    getInfo() {
        return this.info;
    }

    getName() {
        return this.mcu.name;
    }

    getFlashSize() {
        return this.mcu.flash_size;
    }

    getFlashOffset() {
        return Number.parseInt(this.mcu.flash_offset, 16);
    }

    getEepromOffset() {
        return Number.parseInt(this.mcu.eeprom_offset, 16);
    }

    getPageSize() {
        return this.mcu.page_size;
    }

    getFirmwareStart() {
        if (!this.mcu.firmware_start) {
            throw new Error("AM32 MCU does not have firmware start address");
        }
        return Number.parseInt(this.mcu.firmware_start, 16);
    }
}
