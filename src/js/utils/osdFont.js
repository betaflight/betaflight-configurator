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

const SYM = {};

SYM.loadSymbols = function () {
    SYM.BLANK = 0x20;
    SYM.VOLT = 0x06;
    SYM.RSSI = 0x01;
    SYM.LINK_QUALITY = 0x7b;
    SYM.AH_RIGHT = 0x02;
    SYM.AH_LEFT = 0x03;
    SYM.THR = 0x04;
    SYM.FLY_M = 0x9c;
    SYM.ON_M = 0x9b;
    SYM.AH_CENTER_LINE = 0x72;
    SYM.AH_CENTER = 0x73;
    SYM.AH_CENTER_LINE_RIGHT = 0x74;
    SYM.AH_BAR9_0 = 0x80;
    SYM.AH_DECORATION = 0x13;
    SYM.LOGO = 0xa0;
    SYM.AMP = 0x9a;
    SYM.MAH = 0x07;
    SYM.METRE = 0xc;
    SYM.FEET = 0xf;
    SYM.KPH = 0x9e;
    SYM.MPH = 0x9d;
    SYM.MPS = 0x9f;
    SYM.FTPS = 0x99;
    SYM.SPEED = 0x70;
    SYM.TOTAL_DIST = 0x71;
    SYM.GPS_SAT_L = 0x1e;
    SYM.GPS_SAT_R = 0x1f;
    SYM.GPS_LAT = 0x89;
    SYM.GPS_LON = 0x98;
    SYM.HOMEFLAG = 0x11;
    SYM.PB_START = 0x8a;
    SYM.PB_FULL = 0x8b;
    SYM.PB_EMPTY = 0x8d;
    SYM.PB_END = 0x8e;
    SYM.PB_CLOSE = 0x8f;
    SYM.BATTERY = 0x96;
    SYM.ARROW_NORTH = 0x68;
    SYM.ARROW_SOUTH = 0x60;
    SYM.ARROW_EAST = 0x64;
    SYM.ARROW_SMALL_UP = 0x75;
    SYM.ARROW_SMALL_RIGHT = 0x77;
    SYM.HEADING_LINE = 0x1d;
    SYM.HEADING_DIVIDED_LINE = 0x1c;
    SYM.HEADING_N = 0x18;
    SYM.HEADING_S = 0x19;
    SYM.HEADING_E = 0x1a;
    SYM.HEADING_W = 0x1b;
    SYM.TEMPERATURE = 0x7a;
    SYM.TEMP_F = 0x0d;
    SYM.TEMP_C = 0x0e;
    SYM.STICK_OVERLAY_SPRITE_HIGH = 0x08;
    SYM.STICK_OVERLAY_SPRITE_MID = 0x09;
    SYM.STICK_OVERLAY_SPRITE_LOW = 0x0a;
    SYM.STICK_OVERLAY_CENTER = 0x0b;
    SYM.STICK_OVERLAY_VERTICAL = 0x16;
    SYM.STICK_OVERLAY_HORIZONTAL = 0x17;
    SYM.BBLOG = 0x10;
    SYM.ALTITUDE = 0x7f;
    SYM.PITCH = 0x15;
    SYM.ROLL = 0x14;
    SYM.KM = 0x7d;
    SYM.MILES = 0x7e;
};

// ---------------------------------------------------------------------------
// FONT — MAX7456 font file handling
// ---------------------------------------------------------------------------

const FONT = {};

FONT.initData = function () {
    if (FONT.data) {
        return;
    }
    FONT.data = {
        // default font file name
        loaded_font_file: "default",
        // array of array of image bytes ready to upload to fc
        characters_bytes: [],
        // array of array of image bits by character
        characters: [],
        // an array of base64 encoded image strings by character
        character_image_urls: [],
    };
};

FONT.constants = {
    MAX_CHAR_COUNT: 256,
    SIZES: {
        /** NVM ram size for one font char, actual character bytes **/
        MAX_NVM_FONT_CHAR_SIZE: 54,
        /** NVM ram field size for one font char, last 10 bytes dont matter **/
        MAX_NVM_FONT_CHAR_FIELD_SIZE: 64,
        CHAR_HEIGHT: 18,
        CHAR_WIDTH: 12,
    },
};

FONT.pushChar = function (fontCharacterBytes, fontCharacterBits) {
    // Only push full characters onto the stack.
    if (fontCharacterBytes.length !== FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE) {
        return;
    }
    FONT.data.characters_bytes.push(fontCharacterBytes.slice(0));
    FONT.data.characters.push(fontCharacterBits.slice(0));
    FONT.draw(FONT.data.characters.length - 1);
};

/**
 * Parses a MAX7456 `.mcm` font file into character bitmaps.
 *
 * MCM is the standard font format for MAX7456 analog OSD chips. Each file
 * starts with a "MAX7456" header line, followed by binary-encoded lines
 * (8 ASCII '0'/'1' chars per line) that define 256 font characters, each
 * 12×18 pixels with 2-bit colour depth (black, white, transparent).
 *
 * @param {string} dataFontFile - Raw text contents of a `.mcm` file.
 * @returns {Array} Parsed character bitmap arrays.
 */
FONT.parseMCMFontFile = function (dataFontFile) {
    const data = dataFontFile.trim().split("\n");
    // clear local data
    FONT.data.characters.length = 0;
    FONT.data.characters_bytes.length = 0;
    FONT.data.character_image_urls.length = 0;

    // make sure the font file is valid
    if (data.shift().trim() !== "MAX7456") {
        const msg = "that font file doesnt have the MAX7456 header, giving up";
        console.debug(msg);
        throw new Error(msg);
    }
    const characterBits = [];
    const characterBytes = [];
    // hexstring is for debugging
    FONT.data.hexstring = [];
    for (const line of data) {
        // hexstring is for debugging
        FONT.data.hexstring.push(`0x${Number.parseInt(line, 2).toString(16)}`);
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

    return FONT.data.characters;
};

/**
 * Opens a system file picker filtered to `.mcm` files and parses the selected
 * MAX7456 font file into memory.
 *
 * @returns {Promise<void>} Resolves after the font file has been parsed.
 */
FONT.openFontFile = function () {
    return new Promise(function (resolve, reject) {
        const suffix = "mcm";
        FileSystem.pickOpenFile(
            i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
            `.${suffix}`,
        )
            .then((file) => {
                FONT.data.loaded_font_file = file.name;
                FileSystem.readFile(file)
                    .then((contents) => {
                        FONT.parseMCMFontFile(contents);
                        resolve();
                    })
                    .catch(reject);
            })
            .catch((error) => {
                console.error("could not load whole font file:", error);
                reject(error);
            });
    });
};

/**
 * Gets a character bitmap as a data URI.
 * (Uses only single quotes so it can be embedded within double quotes)
 * @param {number} charAddress Character index into a FONT array.
 * @returns {string} Data URI.
 */
function characterBitmapDataUri(charAddress) {
    // Validate input
    if (!FONT.data.characters[charAddress]) {
        return "";
    }

    // Create data URI prefix and SVG wrapper
    const width = FONT.constants.SIZES.CHAR_WIDTH;
    const height = FONT.constants.SIZES.CHAR_HEIGHT;
    const lines = [
        "data:image/svg+xml;utf8,",
        `<svg width='${width}' height='${height}' xmlns='http://www.w3.org/2000/svg'>`,
    ];

    // Create a rect for each visible pixel
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const color = FONT.data.characters[charAddress][y * width + x];
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

FONT.draw = function (charAddress) {
    if (!FONT.data?.character_image_urls) {
        return "";
    }
    let cached = FONT.data.character_image_urls[charAddress];
    if (!cached) {
        cached = FONT.data.character_image_urls[charAddress] = characterBitmapDataUri(charAddress);
    }
    return cached;
};

FONT.msp = {
    encode(charAddress) {
        return [charAddress].concat(
            FONT.data.characters_bytes[charAddress].slice(0, FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE),
        );
    },
};

FONT.upload = function ($progress) {
    return FONT.data.characters
        .reduce(
            (p, x, i) =>
                p.then(() => {
                    $progress.val((i / FONT.data.characters.length) * 100);
                    return MSP.promise(MSPCodes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
                }),
            Promise.resolve(),
        )
        .then(function () {
            console.log(`Uploaded all ${FONT.data.characters.length} characters`);
            gui_log(i18n.getMessage("osdSetupUploadingFontEnd", { length: FONT.data.characters.length }));
        });
};

FONT.symbol = function (hexVal) {
    if (hexVal === "" || hexVal === null || hexVal === undefined) {
        return "";
    }
    const cp = Number(hexVal);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || !Number.isInteger(cp)) {
        return "";
    }
    return String.fromCodePoint(cp);
};

export { FONT, SYM };
