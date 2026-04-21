import { Capacitor } from "@capacitor/core";

const logHead = "[CAPACITORFILE]";
const BetaflightFile = Capacitor?.Plugins?.BetaflightFile;

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
     * @param {string} mimeType  MIME type filter, e.g. "text/plain"
     * @param {string[]} extensions  File extensions, e.g. [".hex", ".uf2"]
     * @returns {{ fileId: string, name: string } | null}  null when cancelled
     */
    async openFile(mimeType, extensions) {
        try {
            const result = await BetaflightFile.openFile({ mimeType, extensions });
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
     * @param {string} fileName   Suggested file name
     * @param {string} mimeType   MIME type, e.g. "application/octet-stream"
     * @param {string[]} extensions  File extensions
     * @returns {{ fileId: string, name: string } | null}  null when cancelled
     */
    async saveFile(fileName, mimeType, extensions) {
        try {
            const result = await BetaflightFile.saveFile({ fileName, mimeType, extensions });
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
     * @returns {{ directoryUri: string, name: string } | null}
     */
    async pickDirectory() {
        try {
            const result = await BetaflightFile.pickDirectory();
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
     * @returns {{ uri: string, name: string }[]}
     */
    async getPersistedDirectories() {
        try {
            const result = await BetaflightFile.getPersistedDirectories();
            return result.directories || [];
        } catch (error) {
            console.error(`${logHead} getPersistedDirectories error:`, error);
            throw error;
        }
    }

    /**
     * Release a previously persisted directory permission.
     * @param {string} directoryUri
     */
    async releaseDirectory(directoryUri) {
        try {
            await BetaflightFile.releaseDirectory({ directoryUri });
        } catch (error) {
            console.error(`${logHead} releaseDirectory error:`, error);
            throw error;
        }
    }

    /**
     * Read entire file as UTF-8 string.
     * @param {string} fileId
     * @returns {string}
     */
    async readFile(fileId) {
        try {
            const result = await BetaflightFile.readFile({ fileId });
            return result.data;
        } catch (error) {
            console.error(`${logHead} readFile error:`, error);
            throw error;
        }
    }

    /**
     * Read entire file as binary, returned as hex string.
     * The caller converts to Blob/Uint8Array as needed.
     * @param {string} fileId
     * @returns {string}  hex-encoded bytes
     */
    async readFileAsHex(fileId) {
        try {
            const result = await BetaflightFile.readFileAsBlob({ fileId });
            return result.data;
        } catch (error) {
            console.error(`${logHead} readFileAsHex error:`, error);
            throw error;
        }
    }

    /**
     * Atomic write — writes entire content and closes.
     * @param {string} fileId
     * @param {string} data       String content (utf8) or hex-encoded bytes
     * @param {string} encoding   "utf8" (default) or "hex"
     */
    async writeFile(fileId, data, encoding = "utf8") {
        try {
            await BetaflightFile.writeFile({ fileId, data, encoding });
        } catch (error) {
            console.error(`${logHead} writeFile error:`, error);
            throw error;
        }
    }

    /**
     * Streaming write — appends a chunk to an open file.
     * The native OutputStream is lazy-opened on the first call.
     * @param {string} fileId
     * @param {string} data       String content (utf8) or hex-encoded bytes
     * @param {string} encoding   "utf8" (default) or "hex"
     */
    async writeChunk(fileId, data, encoding = "utf8") {
        try {
            await BetaflightFile.writeChunk({ fileId, data, encoding });
        } catch (error) {
            console.error(`${logHead} writeChunk error:`, error);
            throw error;
        }
    }

    /**
     * Close a streaming file session and release the fileId.
     * @param {string} fileId
     */
    async closeFile(fileId) {
        try {
            await BetaflightFile.closeFile({ fileId });
        } catch (error) {
            console.error(`${logHead} closeFile error:`, error);
            throw error;
        }
    }

    // -----------------------------------------------------------
    // Hex string helpers (same as CapacitorSerial)
    // -----------------------------------------------------------

    hexStringToUint8Array(hexString) {
        if (!hexString || hexString.length === 0) {
            return new Uint8Array(0);
        }
        if (hexString.length & 1) {
            throw new Error(`Hex string has odd length: ${hexString.length}`);
        }
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
            bytes[i / 2] = Number.parseInt(hexString.substring(i, i + 2), 16);
        }
        return bytes;
    }

    uint8ArrayToHexString(uint8Array) {
        return Array.from(uint8Array)
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }
}

export default new CapacitorFile();
