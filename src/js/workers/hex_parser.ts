/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

const TIME_LABEL = "HEX_PARSER - File parsed in";

/** One contiguous run of data records. */
export interface HexBlock {
    address: number;
    bytes: number;
    data: number[];
}

export interface ParsedHex {
    data: HexBlock[];
    end_of_file: boolean;
    bytes_total: number;
    start_linear_address: number;
    /** Set by useFirmwareFlashing once ConfigInserter has written the board config into the image. */
    configInserted?: boolean;
}

/** The fields of one ":LLAAAATT<data>CC" record line; each byte is two hex chars. */
interface HexRecord {
    byteCount: number;
    address: number;
    recordType: number;
    /** The data field, still in hex string form. */
    content: string;
    /** 2's complement of the record's byte sum. */
    checksum: number;
}

function hexByte(text: string, start: number) {
    return Number.parseInt(text.slice(start, start + 2), 16);
}

function readRecord(line: string): HexRecord {
    const byteCount = hexByte(line, 1);
    return {
        byteCount,
        address: Number.parseInt(line.slice(3, 7), 16),
        recordType: hexByte(line, 7),
        content: line.slice(9, 9 + byteCount * 2),
        checksum: hexByte(line, 9 + byteCount * 2),
    };
}

/** Appends a data record's bytes to the last block; returns whether its checksum matches. */
function appendData(result: ParsedHex, line: string, record: HexRecord) {
    // Always present: the first data record opens a block (next_address starts at 0).
    const block = result.data.at(-1);
    let crc = record.byteCount + hexByte(line, 3) + hexByte(line, 5) + record.recordType;
    for (let needle = 0; needle < record.byteCount * 2; needle += 2) {
        const num = hexByte(record.content, needle); // get one byte in hex and convert it to decimal

        block?.data.push(num);
        if (block) {
            block.bytes++;
        }

        crc += num;
        result.bytes_total++;
    }

    // change crc to 2's complement
    crc = (~crc + 1) & 0xff;
    return crc == record.checksum;
}

// input = string
// result = if hex file is valid, result is an object
//          if hex file wasn't valid (crc check failed on any of the lines), result will be null
export default async function read_hex_file(input: string): Promise<ParsedHex | null> {
    console.time(TIME_LABEL);

    const data = input.split("\n");

    // check if there is an empty line in the end of hex file, if there is, remove it
    if (data.at(-1) == "") {
        data.pop();
    }

    let hexfile_valid = true; // if any of the crc checks failed, this variable flips to false

    const result: ParsedHex = {
        data: [],
        end_of_file: false,
        bytes_total: 0,
        start_linear_address: 0,
    };

    let extended_linear_address = 0;
    let next_address = 0;

    for (let i = 0; i < data.length && hexfile_valid; i++) {
        const record = readRecord(data[i]);
        const { byteCount: byte_count, address, recordType: record_type, content } = record;

        switch (record_type) {
            case 0x00: // data record
                if (address !== next_address || next_address === 0) {
                    result.data.push({ address: extended_linear_address + address, bytes: 0, data: [] });
                }

                // store address for next comparison
                next_address = address + byte_count;

                hexfile_valid = appendData(result, data[i], record);
                break;
            case 0x01: // end of file record
                result.end_of_file = true;
                break;
            case 0x02: // extended segment address record
                // not implemented
                if (Number.parseInt(content, 16) != 0) {
                    // ignore if segment is 0
                    console.log("extended segment address record found - NOT IMPLEMENTED !!!");
                }
                break;
            case 0x03: // start segment address record
                // not implemented
                if (Number.parseInt(content, 16) != 0) {
                    // ignore if segment is 0
                    console.log("start segment address record found - NOT IMPLEMENTED !!!");
                }
                break;
            case 0x04: // extended linear address record
                // input address is UNSIGNED
                extended_linear_address = ((hexByte(content, 0) << 24) | (hexByte(content, 2) << 16)) >>> 0;
                break;
            case 0x05: // start linear address record
                result.start_linear_address = Number.parseInt(content, 16);
                break;
        }
    }

    console.timeEnd(TIME_LABEL);

    if (result.end_of_file && hexfile_valid) {
        return result;
    }

    return null;
}
