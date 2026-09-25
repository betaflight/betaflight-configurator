import { beforeEach, describe, expect, it } from "vitest";
import { FONT } from "../../src/js/utils/osdFont.js";

const LINES_PER_CHAR = FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE;
const MAX7456_HEADER = FONT.constants.HEADERS.max7456;
const SMALL_HEADER = FONT.constants.HEADERS.fbsmall;

const STANDARD_GEOMETRY = { charWidth: 12, charHeight: 18, glyphWidth: 12, glyphHeight: 18 };

// Small font glyphs are drawn into a fixed 8x12 character cell whatever their mode.
function smallGeometry(glyphWidth, glyphHeight) {
    return { charWidth: 8, charHeight: 12, glyphWidth, glyphHeight };
}

function toLine(byte) {
    return byte.toString(2).padStart(8, "0");
}

// Build one 64 line character slot from a list of bytes, padding with transparent (01) pixels.
function charLines(bytes) {
    const lines = bytes.map(toLine);
    while (lines.length < LINES_PER_CHAR) {
        lines.push("01010101");
    }
    return lines;
}

// Build a complete font file: the parser requires all 256 character slots, so pad with blank characters.
function buildFile(header, chars) {
    const allChars = [...chars];
    while (allChars.length < FONT.constants.MAX_CHAR_COUNT) {
        allChars.push([]);
    }
    return [header, ...allChars.flatMap(charLines)].join("\n");
}

// Count the coloured pixels in a rendered data URI.
function countRects(uri, fill) {
    return (uri.match(new RegExp(`fill='${fill}'`, "g")) || []).length;
}

function svgSize(uri) {
    const match = uri.match(/<svg width='(\d+)' height='(\d+)'/);
    return { width: Number(match[1]), height: Number(match[2]) };
}

describe("FONT small font parsing", () => {
    beforeEach(() => {
        FONT.data = null;
        FONT.initData();
    });

    it("still parses a MAX7456 font as 12x18 glyphs", () => {
        // Character 1: a single white pixel top left (10 followed by transparent).
        const file = buildFile(MAX7456_HEADER, [[], [0b10010101]]);

        FONT.parseMCMFontFile(file);

        expect(FONT.data.format).toBe(FONT.constants.FORMATS.MAX7456);
        expect(FONT.isSmallFont()).toBe(false);
        expect(FONT.getCharGeometry(1)).toEqual(STANDARD_GEOMETRY);
        const uri = FONT.draw(1);
        expect(svgSize(uri)).toEqual({ width: 12, height: 18 });
        expect(countRects(uri, "white")).toBe(1);
        expect(uri).toContain("<rect x='0' y='0'");
    });

    it("rejects an unknown header", () => {
        expect(() => FONT.parseMCMFontFile(buildFile("NOT_A_FONT", [[], []]))).toThrow();
    });

    it("rejects a file with missing character data", () => {
        const file = [MAX7456_HEADER, ...charLines([])].join("\n");

        expect(() => FONT.parseMCMFontFile(file)).toThrow();
    });

    it("rejects a line that is not eight binary digits", () => {
        const file = buildFile(MAX7456_HEADER, [[], []]).replace("01010101", "0101010x");

        expect(() => FONT.parseMCMFontFile(file)).toThrow();
    });

    it("keeps the previous font when a file is rejected", () => {
        FONT.parseMCMFontFile(buildFile(SMALL_HEADER, [[0], [0b10010101]]));

        expect(() => FONT.parseMCMFontFile(buildFile("NOT_A_FONT", [[], []]))).toThrow();

        expect(FONT.data.format).toBe(FONT.constants.FORMATS.FB_SMALL);
        expect(FONT.data.characters.length).toBe(FONT.constants.MAX_CHAR_COUNT);
        expect(countRects(FONT.draw(1), "white")).toBe(1);
    });

    it("accepts Windows line endings", () => {
        const file = buildFile(MAX7456_HEADER, [[], [0b10010101]]).replaceAll("\n", "\r\n");

        FONT.parseMCMFontFile(file);

        expect(FONT.data.characters.length).toBe(FONT.constants.MAX_CHAR_COUNT);
        expect(countRects(FONT.draw(1), "white")).toBe(1);
    });

    it("sizes small font glyphs from the mode table in character 0", () => {
        // Mode table: char 1 -> mode 0 (8x8), char 2 -> mode 1 (8x12), char 3 -> mode 2 (16x8),
        // char 4 -> mode 3 (16x12). Byte 0 holds chars 0..3, byte 1 holds chars 4..7.
        const modeByte0 = (0 << 0) | (0 << 2) | (1 << 4) | (2 << 6);
        const modeByte1 = 3 << 0;
        const file = buildFile(SMALL_HEADER, [[modeByte0, modeByte1], [], [], [], []]);

        FONT.parseMCMFontFile(file);

        expect(FONT.data.format).toBe(FONT.constants.FORMATS.FB_SMALL);
        expect(FONT.isSmallFont()).toBe(true);
        expect(FONT.getCharGeometry(1)).toEqual(smallGeometry(8, 8));
        expect(FONT.getCharGeometry(2)).toEqual(smallGeometry(8, 12));
        expect(FONT.getCharGeometry(3)).toEqual(smallGeometry(16, 8));
        expect(FONT.getCharGeometry(4)).toEqual(smallGeometry(16, 12));
    });

    it("draws every small font glyph into an 8x12 image", () => {
        // Chars 1..3 in modes 0, 1 and 2; the image size follows the cell, not the glyph.
        const file = buildFile(SMALL_HEADER, [[(0 << 2) | (1 << 4) | (2 << 6)], [], [], []]);

        FONT.parseMCMFontFile(file);

        expect(svgSize(FONT.draw(1))).toEqual({ width: 8, height: 12 });
        expect(svgSize(FONT.draw(2))).toEqual({ width: 8, height: 12 });
        expect(svgSize(FONT.draw(3))).toEqual({ width: 8, height: 12 });
    });

    it("renders the mode table slot as an empty image", () => {
        const file = buildFile(SMALL_HEADER, [[0xff, 0xff], []]);

        FONT.parseMCMFontFile(file);

        expect(countRects(FONT.draw(0), "white")).toBe(0);
        expect(countRects(FONT.draw(0), "black")).toBe(0);
    });

    it("lays out small glyph rows using the mode's bytes per row", () => {
        // Char 1 in mode 0: 2 bytes per row, 8 rows. Row 0 = white at x=0, row 1 = black at x=4
        // (first pixel of the second byte).
        const file = buildFile(SMALL_HEADER, [
            [0],
            [0b10010101, 0b01010101, 0b01010101, 0b00010101],
        ]);

        FONT.parseMCMFontFile(file);

        const uri = FONT.draw(1);
        expect(uri).toContain("<rect x='0' y='0' width='1' height='1' fill='white'/>");
        expect(uri).toContain("<rect x='4' y='1' width='1' height='1' fill='black'/>");
        expect(countRects(uri, "white")).toBe(1);
        expect(countRects(uri, "black")).toBe(1);
    });

    it("lays out wide glyph rows using four bytes per row", () => {
        // Char 1 in mode 2 (16x8): 4 bytes per row. Row 0 = white at x=12 (first pixel of the
        // fourth byte), row 1 = black at x=0.
        const file = buildFile(SMALL_HEADER, [
            [2 << 2],
            [0b01010101, 0b01010101, 0b01010101, 0b10010101, 0b00010101, 0b01010101, 0b01010101, 0b01010101],
        ]);

        FONT.parseMCMFontFile(file);

        const uri = FONT.draw(1);
        expect(uri).toContain("<rect x='12' y='0' width='1' height='1' fill='white'/>");
        expect(uri).toContain("<rect x='0' y='1' width='1' height='1' fill='black'/>");
        expect(countRects(uri, "white")).toBe(1);
        expect(countRects(uri, "black")).toBe(1);
    });

    it("keeps logo characters at 12x18 in a small font", () => {
        const chars = Array.from({ length: FONT.constants.SMALL_FONT.LOGO_START + 1 }, () => []);
        chars[0] = [0xff, 0xff, 0xff, 0xff];
        const file = buildFile(SMALL_HEADER, chars);

        FONT.parseMCMFontFile(file);

        expect(FONT.getCharGeometry(FONT.constants.SMALL_FONT.LOGO_START)).toEqual(STANDARD_GEOMETRY);
        expect(svgSize(FONT.draw(FONT.constants.SMALL_FONT.LOGO_START))).toEqual({ width: 12, height: 18 });
        expect(FONT.getCharGeometry(1)).toEqual(smallGeometry(16, 12));
    });
});
