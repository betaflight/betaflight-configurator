import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileSystem, { buildAcceptTypes, buildNativeFilters, normalizeExtensions } from "../../src/js/FileSystem";

// The Tauri plugins are loaded on demand and only exist inside a Tauri shell, so
// stub them for the desktop-path tests below.
const tauriDialog = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
const tauriFs = vi.hoisted(() => ({
    writeFile: vi.fn(),
    writeTextFile: vi.fn(),
    readFile: vi.fn(),
    readTextFile: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => tauriDialog);
vi.mock("@tauri-apps/plugin-fs", () => tauriFs);

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

describe("buildNativeFilters", () => {
    it("strips the leading dot the native dialogs don't take", () => {
        expect(buildNativeFilters("Text", ".txt")).toEqual([{ name: "Text", extensions: ["txt", "TXT"] }]);
    });

    it("drops the upper-case variants when they are not wanted (save dialogs)", () => {
        expect(buildNativeFilters("Text", ".txt", false)).toEqual([{ name: "Text", extensions: ["txt"] }]);
    });

    it("keeps every extension of a multi-extension filter", () => {
        const [filter] = buildNativeFilters("Firmware", ["hex", "uf2"], false);
        expect(filter.extensions).toEqual(["hex", "uf2"]);
    });

    it("returns no filter at all when no extension is given", () => {
        expect(buildNativeFilters("anything", undefined)).toEqual([]);
    });
});

// The Tauri desktop build routes through the native dialog + fs plugins: its
// WebKit webviews have neither the File System Access API nor working
// `<a download>` blob downloads.
describe("FileSystem on Tauri desktop", () => {
    beforeEach(() => {
        globalThis.__TAURI_INTERNALS__ = {};
    });

    afterEach(() => {
        delete globalThis.__TAURI_INTERNALS__;
        vi.resetAllMocks();
    });

    it("pickSaveFile returns a path descriptor from the native save dialog", async () => {
        tauriDialog.save.mockResolvedValue("/home/pilot/Documents/log.csv");

        const file = await FileSystem.pickSaveFile("log.csv", "CSV file", ".csv");

        expect(file).toEqual({ name: "log.csv", _tauriPath: "/home/pilot/Documents/log.csv" });
        expect(tauriDialog.save).toHaveBeenCalledWith({
            defaultPath: "log.csv",
            filters: [{ name: "CSV file", extensions: ["csv"] }],
        });
    });

    it("takes the bare file name off a Windows path", async () => {
        tauriDialog.save.mockResolvedValue("C:\\Users\\pilot\\Documents\\log.csv");

        const file = await FileSystem.pickSaveFile("log.csv", "CSV file", ".csv");

        expect(file.name).toBe("log.csv");
    });

    it("rejects with an AbortError when the save dialog is dismissed", async () => {
        tauriDialog.save.mockResolvedValue(null);

        await expect(FileSystem.pickSaveFile("log.csv", "CSV file", ".csv")).rejects.toMatchObject({
            name: "AbortError",
        });
    });

    it("rejects with an AbortError when the open dialog is dismissed", async () => {
        tauriDialog.open.mockResolvedValue(null);

        await expect(FileSystem.pickOpenFile("CSV file", ".csv")).rejects.toMatchObject({ name: "AbortError" });
    });

    it("pickOpenFile keeps the case variants so case-sensitive GTK filters still match", async () => {
        tauriDialog.open.mockResolvedValue("/home/pilot/log.bbl");

        const file = await FileSystem.pickOpenFile("Blackbox log", ".bbl");

        expect(file).toEqual({ name: "log.bbl", _tauriPath: "/home/pilot/log.bbl" });
        expect(tauriDialog.open).toHaveBeenCalledWith({
            multiple: false,
            directory: false,
            filters: [{ name: "Blackbox log", extensions: ["bbl", "BBL"] }],
        });
    });

    it("writeFile sends text as text and everything else as bytes", async () => {
        const file = { name: "dump.txt", _tauriPath: "/tmp/dump.txt" };

        await FileSystem.writeFile(file, "hello");
        expect(tauriFs.writeTextFile).toHaveBeenCalledWith("/tmp/dump.txt", "hello");

        await FileSystem.writeFile(file, new Uint8Array([1, 2, 3]));
        expect(tauriFs.writeFile).toHaveBeenCalledWith("/tmp/dump.txt", new Uint8Array([1, 2, 3]));

        // A view over part of a larger buffer must write its own bytes only,
        // never the whole backing buffer.
        const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);

        await FileSystem.writeFile(file, new DataView(backing.buffer, 2, 3));
        expect(Array.from(tauriFs.writeFile.mock.lastCall[1])).toEqual([1, 2, 3]);

        await FileSystem.writeFile(file, backing.subarray(2, 5));
        expect(Array.from(tauriFs.writeFile.mock.lastCall[1])).toEqual([1, 2, 3]);
    });

    it("streams chunks straight to disk, truncating on the first and appending after", async () => {
        const writable = await FileSystem.openFile({ name: "log.bbl", _tauriPath: "/tmp/log.bbl" });

        await FileSystem.writeChunck(writable, new Blob([new Uint8Array([1])]));
        await FileSystem.writeChunck(writable, new Blob([new Uint8Array([2])]));
        await FileSystem.closeFile(writable);

        expect(tauriFs.writeFile.mock.calls).toEqual([
            ["/tmp/log.bbl", new Uint8Array([1]), { append: false, create: true }],
            ["/tmp/log.bbl", new Uint8Array([2]), { append: true, create: true }],
        ]);
    });

    it("closing without a single chunk still leaves an empty file, as the picker would", async () => {
        const writable = await FileSystem.openFile({ name: "log.bbl", _tauriPath: "/tmp/log.bbl" });

        await FileSystem.closeFile(writable);

        expect(tauriFs.writeFile).toHaveBeenCalledWith("/tmp/log.bbl", new Uint8Array(), { create: true });
    });

    it("reads a picked file as text and as a typed blob", async () => {
        const file = { name: "font.mcm", _tauriPath: "/tmp/font.mcm" };
        tauriFs.readTextFile.mockResolvedValue("MAX7456");
        tauriFs.readFile.mockResolvedValue(new Uint8Array([1, 2]));

        expect(await FileSystem.readFile(file)).toBe("MAX7456");

        const blob = await FileSystem.readFileAsBlob(file);
        expect(blob.type).toBe("application/octet-stream");
        expect(blob.size).toBe(2);
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
