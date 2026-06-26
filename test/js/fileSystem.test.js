import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileSystem, { buildAcceptTypes, normalizeExtensions } from "../../src/js/FileSystem";

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

// In jsdom, window.showOpenFilePicker / showSaveFilePicker are undefined and
// isAndroid() is false, so the FileSystem wrapper takes its <input>/<a download>
// fallback paths (the same ones used by Firefox and WebKit-based Tauri webviews).
describe("FileSystem fallback (no File System Access API)", () => {
    let clickSpy;
    let downloaded;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
        // jsdom does not implement object URLs; save the originals so they can be
        // restored (vi.restoreAllMocks() does not touch direct global assignment).
        originalCreateObjectURL = URL.createObjectURL;
        originalRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:mock");
        URL.revokeObjectURL = vi.fn();
        downloaded = [];
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
            downloaded.push({ download: this.download });
        });
    });

    afterEach(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        vi.restoreAllMocks();
    });

    it("uses the fallback path because the pickers are unavailable in jsdom", () => {
        expect(window.showOpenFilePicker).toBeUndefined();
        expect(window.showSaveFilePicker).toBeUndefined();
    });

    it("pickSaveFile returns a download descriptor instead of an OS save dialog", async () => {
        const file = await FileSystem.pickSaveFile("config.txt", "Text", ".txt");
        expect(file.name).toBe("config.txt");
        expect(file._download).toMatchObject({ name: "config.txt", chunks: [] });
    });

    it("pickSaveFile appends the extension when the suggested name has none", async () => {
        const file = await FileSystem.pickSaveFile("config", "Text", ".txt");
        expect(file.name).toBe("config.txt");
    });

    it("writeFile triggers a browser download for a fallback descriptor", async () => {
        const file = await FileSystem.pickSaveFile("dump.txt", "Text", ".txt");
        await FileSystem.writeFile(file, "hello");
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(downloaded[0].download).toBe("dump.txt");
    });

    it("buffers streamed chunks and downloads them on close", async () => {
        const file = await FileSystem.pickSaveFile("log.csv", "CSV", ".csv");
        const writable = await FileSystem.openFile(file);
        await FileSystem.writeChunck(writable, new Blob(["a"]));
        await FileSystem.writeChunck(writable, new Blob(["b"]));
        expect(clickSpy).not.toHaveBeenCalled();
        await FileSystem.closeFile(writable);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(downloaded[0].download).toBe("log.csv");
    });

    it("reads a fallback (input-selected) file straight from its blob", async () => {
        // jsdom's Blob lacks .text(); real browser/WebKit File objects have it,
        // so stub the blob to verify the descriptor routing and delegation.
        const blob = { text: vi.fn().mockResolvedValue("chirp") };
        const descriptor = { name: "x.txt", _blob: blob };
        expect(await FileSystem.readFile(descriptor)).toBe("chirp");
        expect(blob.text).toHaveBeenCalledTimes(1);
        expect(await FileSystem.readFileAsBlob(descriptor)).toBe(blob);
    });

    it("aborts the open fallback when focus returns with no selection (cancel-less webviews)", async () => {
        vi.useFakeTimers();
        try {
            // Don't trigger a real file dialog when the input is clicked.
            vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

            const pending = FileSystem.pickOpenFile("Text", ".txt");

            // Simulate the dialog closing with no file: focus returns to the
            // window and the dismissal timer elapses.
            globalThis.dispatchEvent(new Event("focus"));
            vi.advanceTimersByTime(500);

            await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        } finally {
            vi.useRealTimers();
        }
    });
});
