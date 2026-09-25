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

/**
 * OSD Font and Symbol utilities.
 *
 * Extracted from the legacy osd.js monolith.
 * FONT handles MAX7456 font file parsing, rendering, and upload.
 * SYM defines the character symbol constants used by OSD elements.
 */

import { i18n } from "../localization";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { gui_log } from "../gui_log";
import FileSystem from "../FileSystem";

// ---------------------------------------------------------------------------
// SYM — OSD character symbol constants
// ---------------------------------------------------------------------------

const SYMBOL_CODES = {
    BLANK: 0x20,
    VOLT: 0x06,
    RSSI: 0x01,
    LINK_QUALITY: 0x7b,
    AH_RIGHT: 0x02,
    AH_LEFT: 0x03,
    THR: 0x04,
    FLY_M: 0x9c,
    ON_M: 0x9b,
    AH_CENTER_LINE: 0x72,
    AH_CENTER: 0x73,
    AH_CENTER_LINE_RIGHT: 0x74,
    AH_BAR9_0: 0x80,
    AH_DECORATION: 0x13,
    LOGO: 0xa0,
    AMP: 0x9a,
    MAH: 0x07,
    METRE: 0xc,
    FEET: 0xf,
    KPH: 0x9e,
    MPH: 0x9d,
    MPS: 0x9f,
    FTPS: 0x99,
    SPEED: 0x70,
    TOTAL_DIST: 0x71,
    GPS_SAT_L: 0x1e,
    GPS_SAT_R: 0x1f,
    GPS_LAT: 0x89,
    GPS_LON: 0x98,
    HOMEFLAG: 0x11,
    PB_START: 0x8a,
    PB_FULL: 0x8b,
    PB_EMPTY: 0x8d,
    PB_END: 0x8e,
    PB_CLOSE: 0x8f,
    BATTERY: 0x96,
    ARROW_NORTH: 0x68,
    ARROW_SOUTH: 0x60,
    ARROW_EAST: 0x64,
    ARROW_SMALL_UP: 0x75,
    ARROW_SMALL_RIGHT: 0x77,
    HEADING_LINE: 0x1d,
    HEADING_DIVIDED_LINE: 0x1c,
    HEADING_N: 0x18,
    HEADING_S: 0x19,
    HEADING_E: 0x1a,
    HEADING_W: 0x1b,
    TEMPERATURE: 0x7a,
    TEMP_F: 0x0d,
    TEMP_C: 0x0e,
    STICK_OVERLAY_SPRITE_HIGH: 0x08,
    STICK_OVERLAY_SPRITE_MID: 0x09,
    STICK_OVERLAY_SPRITE_LOW: 0x0a,
    STICK_OVERLAY_CENTER: 0x0b,
    STICK_OVERLAY_VERTICAL: 0x16,
    STICK_OVERLAY_HORIZONTAL: 0x17,
    BBLOG: 0x10,
    ALTITUDE: 0x7f,
    PITCH: 0x15,
    ROLL: 0x14,
    KM: 0x7d,
    MILES: 0x7e,
};

type SymbolName = keyof typeof SYMBOL_CODES;

/** The symbol codes are only present once loadSymbols() has run. */
const SYM: Partial<Record<SymbolName, number>> & { loadSymbols(): void } = {
    loadSymbols() {
        Object.assign(SYM, SYMBOL_CODES);
    },
};

// ---------------------------------------------------------------------------
// FONT — MAX7456 font file handling
// ---------------------------------------------------------------------------

export interface FontData {
    /** default font file name */
    loaded_font_file: string;
    /** one of FONT.constants.FORMATS */
    format: string;
    /** array of array of image bytes ready to upload to fc */
    characters_bytes: number[][];
    /** array of array of image bits by character */
    characters: number[][];
    /** an array of base64 encoded image strings by character */
    character_image_urls: string[];
    /** for debugging; set by parseMCMFontFile */
    hexstring?: string[];
}

/** Anything with a jQuery-style `val(n)` setter, e.g. a progress bar. */
interface ProgressSink {
    val(value: number): unknown;
}

const FORMATS = {
    MAX7456: "max7456",
    FB_SMALL: "fbsmall",
};

/** Header line of an .mcm file, keyed by format **/
const HEADERS: Record<string, string> = {
    max7456: "MAX7456",
    fbsmall: "FBOSD_SMALL",
};

const FONT = {
    /** Set by initData(). */
    data: undefined as FontData | undefined,

    /** FONT.data, for code that runs only after FONT.initData(). */
    requireData(): FontData {
        if (!FONT.data) {
            throw new Error("FONT.initData() has not been called");
        }
        return FONT.data;
    },

    initData() {
        if (FONT.data) {
            return;
        }
        FONT.data = {
            loaded_font_file: "default",
            format: "max7456",
            characters_bytes: [],
            characters: [],
            character_image_urls: [],
        };
    },

    constants: {
        MAX_CHAR_COUNT: 256,
        FORMATS,
        HEADERS,
        SIZES: {
            /** NVM ram size for one font char, actual character bytes **/
            MAX_NVM_FONT_CHAR_SIZE: 54,
            /** NVM ram field size for one font char, last 10 bytes dont matter **/
            MAX_NVM_FONT_CHAR_FIELD_SIZE: 64,
            CHAR_HEIGHT: 18,
            CHAR_WIDTH: 12,
        },
        /**
         * Small font for framebuffer OSD (FB_OSD) devices. The file keeps the .mcm layout of
         * 64 bytes per character, but each glyph is stored as `bpc` bytes per row (4 pixels per byte) for
         * `rows` rows, top left aligned. The size of each character is chosen from four modes by a 2 bit
         * entry in a table held in the character 0 slot: byte ch >> 2, bits 2 * (ch & 3). Characters from
         * LOGO_START up keep the 12x18 layout so the boot logo tiles are unchanged.
         * See getCharMode() in the firmware's target/PICO/osd/osd_elements_pico.c.
         */
        SMALL_FONT: {
            MODES: [
                { bpc: 2, rows: 8 },
                { bpc: 2, rows: 12 },
                { bpc: 4, rows: 8 },
                { bpc: 4, rows: 12 },
            ],
            LOGO_START: 0xa0,
        },
    },

    isSmallFont(): boolean {
        return FONT.data?.format === FONT.constants.FORMATS.FB_SMALL;
    },

    /**
     * Pixel dimensions of one character's glyph, as stored in FONT.data.characters.
     * @param charAddress Character index into a FONT array.
     */
    getCharGeometry(charAddress: number): {
        charWidth: number;
        charHeight: number;
        glyphWidth: number;
        glyphHeight: number;
    } {
        const standard = {
            charWidth: FONT.constants.SIZES.CHAR_WIDTH,
            charHeight: FONT.constants.SIZES.CHAR_HEIGHT,
            glyphWidth: FONT.constants.SIZES.CHAR_WIDTH,
            glyphHeight: FONT.constants.SIZES.CHAR_HEIGHT,
        };
        if (!FONT.isSmallFont() || charAddress >= FONT.constants.SMALL_FONT.LOGO_START) {
            return standard;
        }
        const modeTable = FONT.requireData().characters_bytes[0];
        if (!modeTable) {
            return standard;
        }
        const modeIndex = (modeTable[charAddress >> 2] >> (2 * (charAddress & 3))) & 0x3;
        const mode = FONT.constants.SMALL_FONT.MODES[modeIndex];
        // char width, height fixed at 8, 12 for osd preview canvas purposes
        // (compromise - font and osd previews will truncate wide glyphs for now)
        return { charWidth: 8, charHeight: 12, glyphWidth: 4 * mode.bpc, glyphHeight: mode.rows };
    },

    pushChar(fontCharacterBytes: number[], fontCharacterBits: number[]): void {
        // Only push full characters onto the stack.
        if (fontCharacterBytes.length !== FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE) {
            return;
        }
        const data = FONT.requireData();
        data.characters_bytes.push(fontCharacterBytes.slice(0));
        data.characters.push(fontCharacterBits.slice(0));
        FONT.draw(data.characters.length - 1);
    },

    /**
     * Parses a `.mcm` font file into character bitmaps.
     *
     * MCM is the standard font format for MAX7456 analog OSD chips. Each file
     * starts with a "MAX7456" header line, followed by binary-encoded lines
     * (8 ASCII '0'/'1' chars per line) that define 256 font characters, each
     * 12×18 pixels with 2-bit colour depth (black, white, transparent).
     *
     * A small font for the FB OSD uses the same file layout with a
     * different header line; see FONT.constants.SMALL_FONT for how its glyphs differ.
     *
     * @param dataFontFile - Raw text contents of a `.mcm` file.
     * @returns Parsed character bitmap arrays.
     */
    parseMCMFontFile(dataFontFile: string): number[][] {
        const data = dataFontFile.trim().split(/\r?\n/);

        // make sure the font file is valid
        const header = (data.shift() ?? "").trim();
        const format = Object.keys(FONT.constants.HEADERS).find((key) => FONT.constants.HEADERS[key] === header);
        if (!format) {
            const msg = "that font file doesnt have a valid header, giving up";
            console.debug(msg);
            throw new Error(msg);
        }
        const expectedRows = FONT.constants.MAX_CHAR_COUNT * FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE;
        if (data.length !== expectedRows || data.some((line) => !/^[01]{8}$/.test(line))) {
            throw new Error("that font file has invalid or incomplete character data, giving up");
        }
        // File validated, clear local data and load in new chars.
        const font = FONT.requireData();
        font.characters.length = 0;
        font.characters_bytes.length = 0;
        font.character_image_urls.length = 0;
        font.format = format;
        const characterBits: number[] = [];
        const characterBytes: number[] = [];
        // hexstring is for debugging
        const hexstring: string[] = [];
        font.hexstring = hexstring;
        for (const line of data) {
            // hexstring is for debugging
            hexstring.push(`0x${Number.parseInt(line, 2).toString(16)}`);
            // every 64 bytes (line) is a char, we're counting chars though, which are 2 bits
            if (characterBits.length === FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE * (8 / 2)) {
                FONT.pushChar(characterBytes, characterBits);
                characterBits.length = 0;
                characterBytes.length = 0;
            }
            for (let y = 0; y < 8; y = y + 2) {
                const v = Number.parseInt(line.slice(y, y + 2), 2);
                characterBits.push(v);
            }
            characterBytes.push(Number.parseInt(line, 2));
        }
        // push the last char
        FONT.pushChar(characterBytes, characterBits);

        return font.characters;
    },

    /**
     * Opens a system file picker filtered to `.mcm` files and parses the selected
     * MAX7456 font file into memory.
     *
     * @returns Resolves after the font file has been parsed.
     */
    openFontFile(): Promise<void> {
        return new Promise(function (resolve, reject) {
            const suffix = "mcm";
            FileSystem.pickOpenFile(
                i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
                `.${suffix}`,
                "osd-font-file",
            )
                .then((file) => {
                    // A cancelled picker yields no file; readFile rejected on it before, and still does.
                    if (!file) {
                        reject(new Error("no font file was picked"));
                        return;
                    }
                    FileSystem.readFile(file)
                        .then((contents: string) => {
                            FONT.parseMCMFontFile(contents);
                            FONT.requireData().loaded_font_file = file.name;
                            resolve();
                        })
                        .catch(reject);
                })
                .catch((error) => {
                    console.error("could not load whole font file:", error);
                    reject(error);
                });
        });
    },

    draw(charAddress: number): string {
        if (!FONT.data?.character_image_urls) {
            return "";
        }
        let cached = FONT.data.character_image_urls[charAddress];
        if (!cached) {
            cached = FONT.data.character_image_urls[charAddress] = characterBitmapDataUri(charAddress);
        }
        return cached;
    },

    msp: {
        encode(charAddress: number): number[] {
            return [charAddress].concat(
                FONT.requireData().characters_bytes[charAddress].slice(0, FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE),
            );
        },
    },

    upload($progress: ProgressSink): Promise<void> {
        const characters = FONT.requireData().characters;
        return characters
            .reduce<Promise<unknown>>(
                (p, _x, i) =>
                    p.then(() => {
                        $progress.val((i / characters.length) * 100);
                        return MSP.promise(MSPCodes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
                    }),
                Promise.resolve(),
            )
            .then(function () {
                console.log(`Uploaded all ${characters.length} characters`);
                gui_log(i18n.getMessage("osdSetupUploadingFontEnd", { length: characters.length }));
            })
            .catch((error) => {
                console.error("Font upload failed:", error);
                gui_log(i18n.getMessage("osdSetupUploadingFontFailed"));
                throw error;
            });
    },

    symbol(hexVal: number | string | null | undefined): string {
        if (hexVal === "" || hexVal === null || hexVal === undefined) {
            return "";
        }
        const cp = Number(hexVal);
        if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || !Number.isInteger(cp)) {
            return "";
        }
        return String.fromCodePoint(cp);
    },
};

/**
 * Gets a character bitmap as a data URI.
 * (Uses only single quotes so it can be embedded within double quotes)
 * @param charAddress Character index into a FONT array.
 * @returns Data URI.
 */
function characterBitmapDataUri(charAddress: number): string {
    const characters = FONT.requireData().characters;
    // Validate input
    if (!characters[charAddress]) {
        return "";
    }

    // Create data URI prefix and SVG wrapper
    const { charWidth, charHeight, glyphWidth, glyphHeight } = FONT.getCharGeometry(charAddress);
    const lines = [
        "data:image/svg+xml;utf8,",
        `<svg width='${charWidth}' height='${charHeight}' xmlns='http://www.w3.org/2000/svg'>`,
    ];

    // In a small font, character 0 holds the mode table rather than a glyph.
    if (FONT.isSmallFont() && charAddress === 0) {
        lines.push("</svg>");
        return lines.join("");
    }

    // Create a rect for each visible pixel
    for (let y = 0; y < glyphHeight; y++) {
        for (let x = 0; x < glyphWidth; x++) {
            const color = characters[charAddress][y * glyphWidth + x];
            let fill = null;
            if (color === 0) {
                fill = "black";
            } else if (color === 2) {
                fill = "white";
            }
            if (fill) {
                lines.push(`<rect x='${x}' y='${y}' width='1' height='1' fill='${fill}'/>`);
            }
        }
    }

    // Close SVG wrapper and return data URI
    lines.push("</svg>");
    return lines.join("");
}

export { FONT, SYM };
