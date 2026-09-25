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

// input = string
// result = if hex file is valid, result is an object
//          if hex file wasn't valid (crc check failed on any of the lines), result will be null
export default async function read_hex_file(input: string): Promise<ParsedHex | null> {
    console.time(TIME_LABEL);

    const data = input.split("\n");

    // check if there is an empty line in the end of hex file, if there is, remove it
    if (data[data.length - 1] == "") {
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
        // each byte is represnted by two chars
        const byte_count = parseInt(data[i].substr(1, 2), 16);
        const address = parseInt(data[i].substr(3, 4), 16);
        const record_type = parseInt(data[i].substr(7, 2), 16);
        const content = data[i].substr(9, byte_count * 2); // still in string format
        const checksum = parseInt(data[i].substr(9 + byte_count * 2, 2), 16); // (this is a 2's complement value)

        switch (record_type) {
            case 0x00: {
                // data record
                if (address !== next_address || next_address === 0) {
                    result.data.push({ address: extended_linear_address + address, bytes: 0, data: [] });
                }

                // store address for next comparison
                next_address = address + byte_count;

                // process data
                let crc =
                    byte_count + parseInt(data[i].substr(3, 2), 16) + parseInt(data[i].substr(5, 2), 16) + record_type;
                for (let needle = 0; needle < byte_count * 2; needle += 2) {
                    // * 2 because of 2 hex chars per 1 byte
                    const num = parseInt(content.substr(needle, 2), 16); // get one byte in hex and convert it to decimal
                    const data_block = result.data.length - 1;

                    result.data[data_block].data.push(num);
                    result.data[data_block].bytes++;

                    crc += num;
                    result.bytes_total++;
                }

                // change crc to 2's complement
                crc = (~crc + 1) & 0xff;

                // verify
                if (crc != checksum) {
                    hexfile_valid = false;
                }
                break;
            }
            case 0x01: // end of file record
                result.end_of_file = true;
                break;
            case 0x02: // extended segment address record
                // not implemented
                if (parseInt(content, 16) != 0) {
                    // ignore if segment is 0
                    console.log("extended segment address record found - NOT IMPLEMENTED !!!");
                }
                break;
            case 0x03: // start segment address record
                // not implemented
                if (parseInt(content, 16) != 0) {
                    // ignore if segment is 0
                    console.log("start segment address record found - NOT IMPLEMENTED !!!");
                }
                break;
            case 0x04: // extended linear address record
                // input address is UNSIGNED
                extended_linear_address =
                    ((parseInt(content.substr(0, 2), 16) << 24) | (parseInt(content.substr(2, 2), 16) << 16)) >>> 0;
                break;
            case 0x05: // start linear address record
                result.start_linear_address = parseInt(content, 16);
                break;
        }
    }

    console.timeEnd(TIME_LABEL);

    if (result.end_of_file && hexfile_valid) {
        return result;
    }

    return null;
}
