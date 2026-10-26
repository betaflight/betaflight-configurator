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

import { Capacitor } from "@capacitor/core";

/** "utf8" carries text, "hex" carries bytes as a hex string. */
export type FileEncoding = "utf8" | "hex";

/** A picker result: the user cancelled, or chose `T`. */
type Picked<T> = { cancelled: true } | ({ cancelled?: undefined } & T);

/** A file the native side opened for this session; `fileId` addresses it in later calls. */
export interface PickedFile {
    fileId: string;
    name: string;
}

export interface PickedDirectory {
    directoryUri: string;
    name: string;
}

export interface PersistedDirectory {
    uri: string;
    name: string;
}

/**
 * The native BetaflightFile Capacitor plugin (BetaflightFilePlugin.java). A call that fails
 * rejects with a message.
 */
interface BetaflightFilePlugin {
    openFile(options: { mimeType: string; extensions: string[] }): Promise<Picked<PickedFile>>;
    saveFile(options: { fileName: string; mimeType: string; extensions: string[] }): Promise<Picked<PickedFile>>;
    pickDirectory(): Promise<Picked<PickedDirectory>>;
    getPersistedDirectories(): Promise<{ directories?: PersistedDirectory[] }>;
    releaseDirectory(options: { directoryUri: string }): Promise<{ success: boolean }>;
    readFile(options: { fileId: string }): Promise<{ data: string }>;
    readFileAsBlob(options: { fileId: string }): Promise<{ data: string }>;
    writeFile(options: { fileId: string; data: string; encoding: FileEncoding }): Promise<{ success: boolean }>;
    writeChunk(options: { fileId: string; data: string; encoding: FileEncoding }): Promise<{ success: boolean }>;
    closeFile(options: { fileId: string }): Promise<{ success: boolean }>;
}

const logHead = "[CAPACITORFILE]";
// `Capacitor.Plugins` is the legacy plugin registry, dropped from Capacitor's typings but
// still populated at runtime with every native plugin, which is where this one is read from.
const BetaflightFile = (Capacitor as typeof Capacitor & { Plugins?: { BetaflightFile?: BetaflightFilePlugin } })
    ?.Plugins?.BetaflightFile;

/**
 * The plugin, for the methods only reached where it exists. Without it a call throws a
 * TypeError, exactly as reading a method off the missing plugin did.
 */
function nativeFile(): BetaflightFilePlugin {
    return BetaflightFile!;
}

/**
 * Capacitor File protocol implementation for Android.
 * Wraps the native BetaflightFile plugin to provide file open/save
 * dialogs via Android's Storage Access Framework (SAF).
 */
class CapacitorFile {
    constructor() {
        if (!BetaflightFile) {
            console.error(`${logHead} Native BetaflightFile plugin is not available`);
        }
    }

    /**
     * Show file-open picker (ACTION_OPEN_DOCUMENT).
     * @param mimeType  MIME type filter, e.g. "text/plain"
     * @param extensions  File extensions, e.g. [".hex", ".uf2"]
     * @returns null when cancelled
     */
    async openFile(mimeType: string, extensions: string[]): Promise<PickedFile | null> {
        try {
            const result = await nativeFile().openFile({ mimeType, extensions });
            if (result.cancelled) {
                return null;
            }
            return { fileId: result.fileId, name: result.name };
        } catch (error) {
            console.error(`${logHead} openFile error:`, error);
            throw error;
        }
    }

    /**
     * Show save-as picker (ACTION_CREATE_DOCUMENT).
     * @param fileName   Suggested file name
     * @param mimeType   MIME type, e.g. "application/octet-stream"
     * @param extensions  File extensions
     * @returns null when cancelled
     */
    async saveFile(fileName: string, mimeType: string, extensions: string[]): Promise<PickedFile | null> {
        try {
            const result = await nativeFile().saveFile({ fileName, mimeType, extensions });
            if (result.cancelled) {
                return null;
            }
            return { fileId: result.fileId, name: result.name };
        } catch (error) {
            console.error(`${logHead} saveFile error:`, error);
            throw error;
        }
    }

    /**
     * Show directory picker (ACTION_OPEN_DOCUMENT_TREE).
     * The returned URI is persisted across app restarts.
     * @returns null when cancelled
     */
    async pickDirectory(): Promise<PickedDirectory | null> {
        try {
            const result = await nativeFile().pickDirectory();
            if (result.cancelled) {
                return null;
            }
            return { directoryUri: result.directoryUri, name: result.name };
        } catch (error) {
            console.error(`${logHead} pickDirectory error:`, error);
            throw error;
        }
    }

    /**
     * List directories whose permissions have been persisted.
     */
    async getPersistedDirectories(): Promise<PersistedDirectory[]> {
        try {
            const result = await nativeFile().getPersistedDirectories();
            return result.directories || [];
        } catch (error) {
            console.error(`${logHead} getPersistedDirectories error:`, error);
            throw error;
        }
    }

    /**
     * Release a previously persisted directory permission.
     */
    async releaseDirectory(directoryUri: string): Promise<void> {
        try {
            await nativeFile().releaseDirectory({ directoryUri });
        } catch (error) {
            console.error(`${logHead} releaseDirectory error:`, error);
            throw error;
        }
    }

    /**
     * Read entire file as UTF-8 string.
     */
    async readFile(fileId: string): Promise<string> {
        try {
            const result = await nativeFile().readFile({ fileId });
            return result.data;
        } catch (error) {
            console.error(`${logHead} readFile error:`, error);
            throw error;
        }
    }

    /**
     * Read entire file as binary, returned as hex string.
     * The caller converts to Blob/Uint8Array as needed.
     * @returns hex-encoded bytes
     */
    async readFileAsHex(fileId: string): Promise<string> {
        try {
            const result = await nativeFile().readFileAsBlob({ fileId });
            return result.data;
        } catch (error) {
            console.error(`${logHead} readFileAsHex error:`, error);
            throw error;
        }
    }

    /**
     * Atomic write — writes entire content and closes.
     * @param data       String content (utf8) or hex-encoded bytes
     * @param encoding   "utf8" (default) or "hex"
     */
    async writeFile(fileId: string, data: string, encoding: FileEncoding = "utf8"): Promise<void> {
        try {
            await nativeFile().writeFile({ fileId, data, encoding });
        } catch (error) {
            console.error(`${logHead} writeFile error:`, error);
            throw error;
        }
    }

    /**
     * Streaming write — appends a chunk to an open file.
     * The native OutputStream is lazy-opened on the first call.
     * @param data       String content (utf8) or hex-encoded bytes
     * @param encoding   "utf8" (default) or "hex"
     */
    async writeChunk(fileId: string, data: string, encoding: FileEncoding = "utf8"): Promise<void> {
        try {
            await nativeFile().writeChunk({ fileId, data, encoding });
        } catch (error) {
            console.error(`${logHead} writeChunk error:`, error);
            throw error;
        }
    }

    /**
     * Close a streaming file session and release the fileId.
     */
    async closeFile(fileId: string): Promise<void> {
        try {
            await nativeFile().closeFile({ fileId });
        } catch (error) {
            console.error(`${logHead} closeFile error:`, error);
            throw error;
        }
    }
}

export default new CapacitorFile();
