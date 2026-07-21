// Ported from am32-firmware/am32-configurator/src/flash.ts.

export default class Flash {
    static getInfo(flash) {
        return {
            meta: {
                signature: (flash.params[1] << 8) | flash.params[0],
                input: flash.params[2],
                interfaceMode: flash.params[3],
                available: true,
                am32: {
                    fileName: null,
                    mcuType: null,
                },
            },
            displayName: "UNKNOWN",
            firmwareName: "UNKNOWN",
            supported: true,
            bootloader: {
                input: 0,
                valid: false,
                pin: "",
                version: 0,
            },
            layoutSize: 0,
            settingsDirty: false,
            settings: {},
            settingsBuffer: new Uint8Array(),
            isSelected: true,
        };
    }

    static fillImage(data, size, flashOffset, char = 0xff) {
        const image = new Uint8Array(size).fill(char);

        for (const block of data.data) {
            const address = block.address - flashOffset;
            if (address >= image.byteLength) {
                return null;
            }
            const clampedLength = Math.min(block.bytes, image.byteLength - address);
            image.set(block.data.slice(0, clampedLength), address);
        }

        return image;
    }

    static parseHex(hexString) {
        const lines = hexString
            .split("\n")
            .map((line) => (line.endsWith("\r") ? line.substring(0, line.length - 1) : line))
            .filter((line, index, all) => line !== "" || index !== all.length - 1);

        const result = {
            data: [],
            endOfFile: false,
            bytes: 0,
            startLinearAddress: 0,
        };

        let extendedLinearAddress = 0;
        let nextAddress = 0;

        for (const line of lines) {
            if (!line.startsWith(":")) {
                return null;
            }

            const byteCount = Number.parseInt(line.substr(1, 2), 16);
            const address = Number.parseInt(line.substr(3, 4), 16);
            const recordType = Number.parseInt(line.substr(7, 2), 16);
            const content = line.substr(9, byteCount * 2);
            const checksum = Number.parseInt(line.substr(9 + byteCount * 2, 2), 16);

            switch (recordType) {
                case 0x00: {
                    if (address !== nextAddress || nextAddress === 0) {
                        result.data.push({
                            address: extendedLinearAddress + address,
                            bytes: 0,
                            data: [],
                        });
                    }

                    nextAddress = address + byteCount;
                    let crc = byteCount + Number.parseInt(line.substr(3, 2), 16) + Number.parseInt(line.substr(5, 2), 16) + recordType;

                    for (let needle = 0; needle < byteCount * 2; needle += 2) {
                        const num = Number.parseInt(content.substr(needle, 2), 16);
                        const blockIndex = result.data.length - 1;
                        result.data[blockIndex].data.push(num);
                        result.data[blockIndex].bytes += 1;
                        crc += num;
                        result.bytes += 1;
                    }

                    crc = (~crc + 1) & 0xff;
                    if (crc !== checksum) {
                        return null;
                    }
                    break;
                }
                case 0x01:
                    result.endOfFile = true;
                    break;
                case 0x02:
                case 0x03:
                    if (Number.parseInt(content, 16) !== 0) {
                        throw new Error("Unsupported AM32 Intel HEX segment address record");
                    }
                    break;
                case 0x04:
                    extendedLinearAddress =
                        (Number.parseInt(content.substr(0, 2), 16) << 24) |
                        (Number.parseInt(content.substr(2, 2), 16) << 16);
                    break;
                case 0x05:
                    result.startLinearAddress = Number.parseInt(content, 16);
                    break;
                default:
                    console.warn("Unknown AM32 HEX record type", recordType);
                    break;
            }
        }

        return result.endOfFile ? result : null;
    }
}
