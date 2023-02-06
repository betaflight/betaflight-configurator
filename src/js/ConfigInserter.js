
const CUSTOM_DEFAULTS_POINTER_ADDRESSES = [
	0x08002800, // most STM32 internal-flash-based targets.
	0x901fdfc0, // Memory-mapped EXST targets with a flash vma address of 0x90100000. (e.g. SPRacingH7RF, H7EF)
	0x2407dfc0, // Ram-copy EXST targets (e.g. SPRacingH7EXTREME, H7NANO, H7ZERO, H7CINE, H7NP)
];

const BLOCK_SIZE = 16384;

function seek(firmware, address) {
    let index = 0;
    for (; index < firmware.data.length && address >= firmware.data[index].address + firmware.data[index].bytes; index++) {
        // empty for loop to increment index
    }

    const result = {
        lineIndex: index,
    };

    if (firmware.data[index] && address >= firmware.data[index].address) {
        result.byteIndex = address - firmware.data[index].address;
    }

    return result;
}

function readUint32(firmware, index) {
    let result = 0;
    for (let position = 0; position < 4; position++) {
        result += firmware.data[index.lineIndex].data[index.byteIndex++] << (8 * position);
        if (index.byteIndex >= firmware.data[index.lineIndex].bytes) {
            index.lineIndex++;
            index.byteIndex = 0;
        }
    }

    return result;
}

function getCustomDefaultsArea(firmware, address) {
    const result = {};

    const index = seek(firmware, address);

    if (index.byteIndex === undefined) {
        return;
    }

    result.startAddress = readUint32(firmware, index);
    result.endAddress = readUint32(firmware, index);

	if (result.endAddress <= result.startAddress) {
		return;
	}

    return result;
}

function findCustomDefaultsArea(firmware) {
	for (let index = 0; index < CUSTOM_DEFAULTS_POINTER_ADDRESSES.length; index++) {
		let address = CUSTOM_DEFAULTS_POINTER_ADDRESSES[index];
		let result = getCustomDefaultsArea(firmware, address);
		if (result) {
			return result;
		}
	}
}

function generateData(firmware, input, startAddress) {
    let address = startAddress;

    const index = seek(firmware, address);

    if (index.byteIndex !== undefined) {
        throw new Error('Configuration area in firmware not free.');
    }

    let inputIndex = 0;
    while (inputIndex < input.length) {
        const remaining = input.length - inputIndex;
        const line = {
            address: address,
            bytes: BLOCK_SIZE > remaining ? remaining : BLOCK_SIZE,
            data: [],
        };

        if (firmware.data[index.lineIndex] && (line.address + line.bytes) > firmware.data[index.lineIndex].address) {
            throw new Error("Aborting data generation, free area too small.");
        }

        for (let i = 0; i < line.bytes; i++) {
            line.data.push(input.charCodeAt(inputIndex++));
        }

        address = address + line.bytes;

        firmware.data.splice(index.lineIndex++, 0, line);
    }

    firmware.bytes_total += input.length;
}

const CONFIG_LABEL = `Custom defaults inserted in`;

export default class ConfigInserter {

    insertConfig(firmware, config) {
        console.time(CONFIG_LABEL);

        const input = `# Betaflight\n${config}\0`;
        const customDefaultsArea = findCustomDefaultsArea(firmware);

        if (!customDefaultsArea) {
            return false;
        } else if (input.length >= customDefaultsArea.endAddress - customDefaultsArea.startAddress) {
            throw new Error(`Custom defaults area too small (${customDefaultsArea.endAddress - customDefaultsArea.startAddress} bytes), ${input.length + 1} bytes needed.`);
        }

        generateData(firmware, input, customDefaultsArea.startAddress);

        console.timeEnd(CONFIG_LABEL);

        return true;
    }
}
