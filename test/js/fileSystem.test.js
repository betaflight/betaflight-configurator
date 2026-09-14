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

    it("maps video extensions to their video MIME types", () => {
        const [mp4] = buildAcceptTypes("video", ".mp4");
        expect(mp4.accept).toEqual({ "video/mp4": [".mp4", ".MP4"] });
        const [webm] = buildAcceptTypes("video", ["webm"]);
        expect(webm.accept).toEqual({ "video/webm": [".webm", ".WEBM"] });
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

// The File System Access API spec restricts `id` to ASCII alphanumeric, "_",
// "-", max 32 chars, and throws TypeError outside that shape — enforced here
// too, before any platform is reached, so a bad id fails the same way
// everywhere instead of only in the browser path.
describe("pickerId validation", () => {
    // TypeError, matching what the File System Access API itself throws for
    // an invalid `id` — the platform-independent error contract.
    const INVALID_PICKER_ID = { name: "TypeError", message: expect.stringContaining("Invalid pickerId") };

    it("rejects a pickerId with characters outside the spec's allowed set", async () => {
        await expect(FileSystem.pickOpenFile("Text", ".txt", "bad id!")).rejects.toMatchObject(INVALID_PICKER_ID);
        await expect(FileSystem.pickSaveFile("x.txt", "Text", ".txt", "bad id!")).rejects.toMatchObject(
            INVALID_PICKER_ID,
        );
    });

    it("rejects a pickerId over the 32-character limit", async () => {
        const tooLong = "a".repeat(33);
        await expect(FileSystem.pickOpenFile("Text", ".txt", tooLong)).rejects.toMatchObject(INVALID_PICKER_ID);
    });

    it("accepts a pickerId at exactly the 32-character limit", async () => {
        const exactly32 = "a".repeat(32);
        const file = await FileSystem.pickSaveFile("x.txt", "Text", ".txt", exactly32);
        expect(file.name).toBe("x.txt");
    });

    it("accepts hyphens and underscores, the two allowed non-alphanumerics", async () => {
        const file = await FileSystem.pickSaveFile("x.txt", "Text", ".txt", "cli-file_2");
        expect(file.name).toBe("x.txt");
    });

    it("treats an empty pickerId the same as an omitted one, not a validation failure", async () => {
        const file = await FileSystem.pickSaveFile("x.txt", "Text", ".txt", "");
        expect(file.name).toBe("x.txt");
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
        localStorage.removeItem("fileSystemLastDir");
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

    // The native dialog has no "remember this folder" option of its own, so
    // FileSystem persists the last directory per pickerId itself.
    describe("pickerId remembers the last-used folder", () => {
        // Each test below only cares about the `defaultPath` a second
        // pick is offered, given what the first pick resolved to — these
        // two helpers carry the mock-then-call boilerplate that's
        // otherwise identical across every case.
        async function saveAs(name, resolvedPath, pickerId) {
            tauriDialog.save.mockResolvedValueOnce(resolvedPath);
            return FileSystem.pickSaveFile(name, "Files", ".txt", pickerId);
        }

        async function openAs(resolvedPath, pickerId) {
            tauriDialog.open.mockResolvedValueOnce(resolvedPath);
            return FileSystem.pickOpenFile("Files", ".txt", pickerId);
        }

        it.each([
            [
                "/home/pilot/Documents/log.csv",
                "/home/pilot/Documents/notes.csv",
                "cli-file",
                "/home/pilot/Documents/notes.csv",
            ],
            [
                "/home/pilot/firmware/build.hex",
                "/home/pilot/firmware/other.hex",
                "firmware-file",
                "/home/pilot/firmware/other.hex",
            ],
            ["/target.hex", "/other.hex", "firmware-file", "/other.hex"],
            ["C:\\target.hex", "C:\\other.hex", "firmware-file", "C:\\other.hex"],
        ])(
            "starts the save dialog in the folder from a previous pick with the same id (%s -> %s)",
            async (firstPath, secondPath, pickerId, expectedDefaultPath) => {
                const secondName = secondPath.split(/[/\\]/).pop();
                await saveAs("first", firstPath, pickerId);
                await saveAs(secondName, secondPath, pickerId);

                expect(tauriDialog.save).toHaveBeenLastCalledWith(
                    expect.objectContaining({ defaultPath: expectedDefaultPath }),
                );
            },
        );

        it("starts the open dialog in the folder from a previous pick with the same id", async () => {
            await openAs("/home/pilot/firmware/target.hex", "firmware-file");
            await openAs("/home/pilot/firmware/other.hex", "firmware-file");

            expect(tauriDialog.open).toHaveBeenLastCalledWith(
                expect.objectContaining({ defaultPath: "/home/pilot/firmware" }),
            );
        });

        it("keeps separate pickerIds from sharing a remembered folder", async () => {
            await saveAs("build.hex", "/home/pilot/firmware/build.hex", "firmware-file");
            await saveAs("cli.txt", "/home/pilot/logs/cli.txt", "cli-file");

            // Second call is a fresh id: no remembered folder to prefix the name with.
            expect(tauriDialog.save).toHaveBeenLastCalledWith(expect.objectContaining({ defaultPath: "cli.txt" }));
        });

        it("does not remember a folder when no pickerId is given", async () => {
            await saveAs("log.csv", "/home/pilot/Documents/log.csv");
            await saveAs("notes.csv", "/home/pilot/Documents/notes.csv");

            expect(tauriDialog.save).toHaveBeenLastCalledWith(expect.objectContaining({ defaultPath: "notes.csv" }));
        });
    });
});

// Chromium's File System Access API remembers the last-used folder itself,
// scoped per `id` passed to the picker — so pickerId only needs forwarding
// as `id` here, with no directory bookkeeping of our own.
describe("FileSystem picker id (File System Access API)", () => {
    let showOpenFilePicker;
    let showSaveFilePicker;

    function mockHandle(name) {
        return {
            name,
            queryPermission: vi.fn().mockResolvedValue("granted"),
            requestPermission: vi.fn().mockResolvedValue("granted"),
        };
    }

    beforeEach(() => {
        showOpenFilePicker = vi.fn();
        showSaveFilePicker = vi.fn();
        globalThis.showOpenFilePicker = showOpenFilePicker;
        globalThis.showSaveFilePicker = showSaveFilePicker;
    });

    afterEach(() => {
        delete globalThis.showOpenFilePicker;
        delete globalThis.showSaveFilePicker;
    });

    it("pickOpenFile forwards pickerId as the picker's remembered-folder id", async () => {
        showOpenFilePicker.mockResolvedValue([mockHandle("target.hex")]);

        await FileSystem.pickOpenFile("Firmware", ".hex", "firmware-file");

        expect(showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({ id: "firmware-file" }));
    });

    it("pickSaveFile forwards pickerId as the picker's remembered-folder id", async () => {
        showSaveFilePicker.mockResolvedValue(mockHandle("cli.txt"));

        await FileSystem.pickSaveFile("cli.txt", "Text", ".txt", "cli-file");

        expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ id: "cli-file" }));
    });

    it("omits id when no pickerId is given", async () => {
        showOpenFilePicker.mockResolvedValue([mockHandle("dump.txt")]);

        await FileSystem.pickOpenFile("Text", ".txt");

        expect(showOpenFilePicker.mock.calls[0][0]).not.toHaveProperty("id");
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
