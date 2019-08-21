'use strict';

var ConfigInserter = function () {
}

const CUSTOM_DEFAULTS_POINTER_ADDRESS = 0x08002800;
const BLOCK_SIZE = 16384;

function seek(firmware, address) {
    var index = 0;
    for (; index < firmware.data.length && address >= firmware.data[index].address + firmware.data[index].bytes; index++);

    var result = {
        lineIndex: index
    };

    if (firmware.data[index] && address >= firmware.data[index].address) {
        result.byteIndex = address - firmware.data[index].address;
    }

    return result;
}

function readUint32(firmware, index) {
    var result = 0;
    for (var position = 0; position < 4; position++) {
        result += firmware.data[index.lineIndex].data[index.byteIndex++] << (8 * position);
        if (index.byteIndex >= firmware.data[index.lineIndex].bytes) {
            index.lineIndex++;
            index.byteIndex = 0;
        }
    }

    return result;
}

function getCustomDefaultsArea(firmware) {
    var result = {};

    var index = seek(firmware, CUSTOM_DEFAULTS_POINTER_ADDRESS);

    if (index.byteIndex === undefined) {
        return;
    }

    var result = {};

    result.startAddress = readUint32(firmware, index);
    result.endAddress = readUint32(firmware, index);

    return result;
}

function generateData(firmware, input, startAddress) {
    var address = startAddress;

    var index = seek(firmware, address);

    if (index.byteIndex !== undefined) {
        throw new Error('Configuration area in firmware not free.');
    }

    var inputIndex = 0;
    while (inputIndex < input.length) {
        var remaining = input.length - inputIndex;
        var line = {
            address: address,
            bytes: BLOCK_SIZE > remaining ? remaining : BLOCK_SIZE,
            data: []
        };

        if (firmware.data[index.lineIndex] && (line.address + line.bytes) > firmware.data[index.lineIndex].address) {
            throw new Error("Aborting data generation, free area too small.");
        }

        for (var i = 0; i < line.bytes; i++) {
            line.data.push(input.charCodeAt(inputIndex++));
        }

        address = address + line.bytes;

        firmware.data.splice(index.lineIndex++, 0, line);
    }

    firmware.bytes_total += input.length;
}

function microtime() {
    var now = new Date().getTime() / 1000;

    return now;
}

ConfigInserter.prototype.insertConfig = function (firmware, input) {
    var time_parsing_start = microtime(); // track time

    var customDefaultsArea = getCustomDefaultsArea(firmware);

    if (!customDefaultsArea || customDefaultsArea.endAddress - customDefaultsArea.startAddress === 0) {
        return false;
    } else if (input.length >= customDefaultsArea.endAddress - customDefaultsArea.startAddress) {
        throw new Error(`Custom defaults area too small (${customDefaultsArea.endAddress - customDefaultsArea.startAddress} bytes), ${input.length + 1} bytes needed.`);
    }

    generateData(firmware, input, customDefaultsArea.startAddress);

    console.log('Custom defaults inserted in: ' + (microtime() - time_parsing_start).toFixed(4) + ' seconds.');

    return true;
}
