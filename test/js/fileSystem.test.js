import { describe, expect, it } from "vitest";
import { buildAcceptTypes, normalizeExtensions } from "../../src/js/FileSystem";

describe("normalizeExtensions", () => {
    it("expands a single extension to both lower and upper case", () => {
        expect(normalizeExtensions(".txt")).toEqual([".txt", ".TXT"]);
    });

    it("adds a leading dot when missing", () => {
        expect(normalizeExtensions("json")).toEqual([".json", ".JSON"]);
    });

    it("expands every entry of an array", () => {
        expect(normalizeExtensions([".hex", ".uf2", ".bin"])).toEqual([".hex", ".HEX", ".uf2", ".UF2", ".bin", ".BIN"]);
    });

    it("deduplicates extensions already supplied in both cases", () => {
        expect(normalizeExtensions([".bbl", ".BBL"])).toEqual([".bbl", ".BBL"]);
    });

    it("returns an empty array for empty input", () => {
        expect(normalizeExtensions(undefined)).toEqual([]);
        expect(normalizeExtensions([])).toEqual([]);
        expect(normalizeExtensions("")).toEqual([]);
    });
});

describe("buildAcceptTypes", () => {
    it("groups case-expanded extensions under their MIME type", () => {
        expect(buildAcceptTypes("Files", ".txt")).toEqual([
            {
                description: "Files",
                accept: { "text/plain": [".txt", ".TXT"] },
            },
        ]);
    });

    it("groups multiple extensions by their respective MIME types", () => {
        const [type] = buildAcceptTypes("images", ["png", "bmp"]);
        expect(type.accept).toEqual({
            "image/png": [".png", ".PNG"],
            "image/bmp": [".bmp", ".BMP"],
        });
    });

    it("falls back to application/octet-stream for unknown extensions (never */*)", () => {
        const [type] = buildAcceptTypes("custom", ".xyz");
        expect(type.accept).toEqual({ "application/octet-stream": [".xyz", ".XYZ"] });
    });

    it("returns an empty types array when no extension is given", () => {
        expect(buildAcceptTypes("anything", undefined)).toEqual([]);
    });
});
