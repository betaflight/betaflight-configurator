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

import { afterEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
    openFile: vi.fn(),
    saveFile: vi.fn(),
    pickDirectory: vi.fn(),
    getPersistedDirectories: vi.fn(),
    releaseDirectory: vi.fn(),
    readFile: vi.fn(),
    readFileAsBlob: vi.fn(),
    writeFile: vi.fn(),
    writeChunk: vi.fn(),
    closeFile: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { Plugins: { BetaflightFile: plugin } } }));

const { default: CapacitorFile } = await import("../../src/js/protocols/CapacitorFile");

afterEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(plugin)) {
        mock.mockReset();
    }
});

describe("CapacitorFile pickers", () => {
    it("opens a file with the filter and returns its id and name", async () => {
        plugin.openFile.mockResolvedValue({ fileId: "f1", name: "fw.hex", extra: 1 });

        expect(await CapacitorFile.openFile("application/octet-stream", [".hex"])).toEqual({
            fileId: "f1",
            name: "fw.hex",
        });
        expect(plugin.openFile).toHaveBeenCalledWith({ mimeType: "application/octet-stream", extensions: [".hex"] });
    });

    it("saves under the suggested name", async () => {
        plugin.saveFile.mockResolvedValue({ fileId: "f2", name: "dump.txt" });

        expect(await CapacitorFile.saveFile("dump.txt", "text/plain", [".txt"])).toEqual({
            fileId: "f2",
            name: "dump.txt",
        });
        expect(plugin.saveFile).toHaveBeenCalledWith({
            fileName: "dump.txt",
            mimeType: "text/plain",
            extensions: [".txt"],
        });
    });

    it("picks a directory", async () => {
        plugin.pickDirectory.mockResolvedValue({ directoryUri: "content://tree/1", name: "Logs" });

        expect(await CapacitorFile.pickDirectory()).toEqual({ directoryUri: "content://tree/1", name: "Logs" });
    });

    it("returns null from every picker the user cancels", async () => {
        plugin.openFile.mockResolvedValue({ cancelled: true });
        plugin.saveFile.mockResolvedValue({ cancelled: true });
        plugin.pickDirectory.mockResolvedValue({ cancelled: true });

        expect(await CapacitorFile.openFile("*/*", [])).toBeNull();
        expect(await CapacitorFile.saveFile("a", "*/*", [])).toBeNull();
        expect(await CapacitorFile.pickDirectory()).toBeNull();
    });
});

describe("CapacitorFile directories", () => {
    it("lists persisted directories, and none when the plugin omits the list", async () => {
        const directories = [{ uri: "content://tree/1", name: "Logs" }];
        plugin.getPersistedDirectories.mockResolvedValueOnce({ directories }).mockResolvedValueOnce({});

        expect(await CapacitorFile.getPersistedDirectories()).toEqual(directories);
        expect(await CapacitorFile.getPersistedDirectories()).toEqual([]);
    });

    it("releases a directory by its URI", async () => {
        plugin.releaseDirectory.mockResolvedValue({ success: true });

        await CapacitorFile.releaseDirectory("content://tree/1");

        expect(plugin.releaseDirectory).toHaveBeenCalledWith({ directoryUri: "content://tree/1" });
    });
});

describe("CapacitorFile reads and writes", () => {
    it("reads text with readFile and bytes, as hex, with readFileAsBlob", async () => {
        plugin.readFile.mockResolvedValue({ data: "hello" });
        plugin.readFileAsBlob.mockResolvedValue({ data: "0a0b" });

        expect(await CapacitorFile.readFile("f1")).toBe("hello");
        expect(await CapacitorFile.readFileAsHex("f1")).toBe("0a0b");
        expect(plugin.readFileAsBlob).toHaveBeenCalledWith({ fileId: "f1" });
    });

    it("writes and streams as utf8 unless told otherwise", async () => {
        await CapacitorFile.writeFile("f1", "text");
        await CapacitorFile.writeFile("f1", "0a", "hex");
        await CapacitorFile.writeChunk("f2", "more");
        await CapacitorFile.writeChunk("f2", "0b", "hex");
        await CapacitorFile.closeFile("f2");

        expect(plugin.writeFile.mock.calls).toEqual([
            [{ fileId: "f1", data: "text", encoding: "utf8" }],
            [{ fileId: "f1", data: "0a", encoding: "hex" }],
        ]);
        expect(plugin.writeChunk.mock.calls).toEqual([
            [{ fileId: "f2", data: "more", encoding: "utf8" }],
            [{ fileId: "f2", data: "0b", encoding: "hex" }],
        ]);
        expect(plugin.closeFile).toHaveBeenCalledWith({ fileId: "f2" });
    });

    it("logs a native failure and rethrows it", async () => {
        const failure = new Error("no permission");
        plugin.writeFile.mockRejectedValue(failure);
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(CapacitorFile.writeFile("f1", "x")).rejects.toBe(failure);

        expect(logged).toHaveBeenCalledWith("[CAPACITORFILE] writeFile error:", failure);
    });
});
