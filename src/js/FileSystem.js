import { isAndroid } from "./utils/checkCompatibility";
import CapacitorFile from "./protocols/CapacitorFile";

const EXTENSION_MIME_MAP = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".hex": "application/octet-stream",
    ".uf2": "application/octet-stream",
    ".bbl": "application/octet-stream",
    ".mcm": "application/octet-stream",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".lua": "text/plain",
    ".csv": "text/csv",
};

function mimeForExtension(ext) {
    if (!ext) return "*/*";
    const lower = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return EXTENSION_MIME_MAP[lower] || "*/*";
}

function normalizeExtensions(extension) {
    if (Array.isArray(extension)) {
        return extension;
    }
    return extension ? [extension] : [];
}

class FileSystem {
    _createFile(fileHandle) {
        return {
            name: fileHandle.name,
            _fileHandle: fileHandle,
        };
    }

    // ---------------------------------------------------------------
    // pickSaveFile
    // ---------------------------------------------------------------

    async pickSaveFile(suggestedName, description, extension) {
        if (isAndroid()) {
            return this._androidPickSaveFile(suggestedName, description, extension);
        }

        const fileHandle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [
                {
                    description: description,
                    accept: {
                        "application/unknown": extension,
                    },
                },
            ],
        });

        if (!fileHandle) {
            return null;
        }

        const file = this._createFile(fileHandle);

        if (await this.verifyPermission(file, true)) {
            return file;
        }
    }

    async _androidPickSaveFile(suggestedName, description, extension) {
        const extensions = normalizeExtensions(extension);
        const mimeType = extensions.length > 0 ? mimeForExtension(extensions[0]) : "*/*";

        const result = await CapacitorFile.saveFile(suggestedName, mimeType, extensions);
        if (!result) {
            return null;
        }

        return {
            name: result.name,
            _fileHandle: result.fileId,
        };
    }

    // ---------------------------------------------------------------
    // pickOpenFile
    // ---------------------------------------------------------------

    async pickOpenFile(description, extension) {
        if (isAndroid()) {
            return this._androidPickOpenFile(description, extension);
        }

        const fileHandle = await window.showOpenFilePicker({
            multiple: false,
            types: [
                {
                    description: description,
                    accept: {
                        "application/unknown": extension,
                    },
                },
            ],
        });

        const file = this._createFile(fileHandle[0]);

        if (await this.verifyPermission(file, false)) {
            return file;
        }
    }

    async _androidPickOpenFile(description, extension) {
        const extensions = normalizeExtensions(extension);
        const mimeType = extensions.length > 0 ? mimeForExtension(extensions[0]) : "*/*";

        const result = await CapacitorFile.openFile(mimeType, extensions);
        if (!result) {
            return null;
        }

        return {
            name: result.name,
            _fileHandle: result.fileId,
        };
    }

    // ---------------------------------------------------------------
    // verifyPermission  (web only — Android SAF grants implicitly)
    // ---------------------------------------------------------------

    async verifyPermission(file, withWrite) {
        const fileHandle = file._fileHandle;

        const opts = {};
        opts.mode = withWrite ? "readwrite" : "read";

        if ((await fileHandle.queryPermission(opts)) === "granted") {
            console.log("The user has %s permissions for the file: %s", opts.mode, fileHandle.name);
            return true;
        }

        if ((await fileHandle.requestPermission(opts)) === "granted") {
            console.log("Request %s permissions for the file: %s", opts.mode, fileHandle.name);
            return true;
        }

        console.error("The user has no permission for file: ", fileHandle.name);
        throw new Error("The user has no %s permission for file: %s", opts.mode, fileHandle.name);
    }

    // ---------------------------------------------------------------
    // writeFile
    // ---------------------------------------------------------------

    async writeFile(file, contents) {
        if (isAndroid()) {
            return this._androidWriteFile(file, contents);
        }

        const fileHandle = file._fileHandle;

        const writable = await fileHandle.createWritable();
        await writable.write(contents);
        await writable.close();
    }

    async _androidWriteFile(file, contents) {
        const fileId = file._fileHandle;

        if (typeof contents === "string") {
            await CapacitorFile.writeFile(fileId, contents, "utf8");
        } else {
            // Uint8Array, ArrayBuffer, or Blob → convert to hex
            const bytes = await this._toUint8Array(contents);
            const hex = CapacitorFile.uint8ArrayToHexString(bytes);
            await CapacitorFile.writeFile(fileId, hex, "hex");
        }
    }

    // ---------------------------------------------------------------
    // readFile
    // ---------------------------------------------------------------

    async readFile(file) {
        if (isAndroid()) {
            return CapacitorFile.readFile(file._fileHandle);
        }

        const fileHandle = file._fileHandle;

        const fileReader = await fileHandle.getFile();
        return await fileReader.text();
    }

    // ---------------------------------------------------------------
    // readFileAsBlob
    // ---------------------------------------------------------------

    async readFileAsBlob(file) {
        if (isAndroid()) {
            return this._androidReadFileAsBlob(file);
        }

        const fileHandle = file._fileHandle;

        return await fileHandle.getFile();
    }

    async _androidReadFileAsBlob(file) {
        const hex = await CapacitorFile.readFileAsHex(file._fileHandle);
        const bytes = CapacitorFile.hexStringToUint8Array(hex);

        // Determine MIME type from file name extension
        const ext = file.name ? `.${file.name.split(".").pop()}` : "";
        const mimeType = mimeForExtension(ext);

        return new Blob([bytes], { type: mimeType });
    }

    // ---------------------------------------------------------------
    // openFile  (streaming — returns a writable token)
    // ---------------------------------------------------------------

    async openFile(file) {
        if (isAndroid()) {
            // Return the fileId as the "writable" token.
            // The native OutputStream is lazy-opened on the first writeChunk.
            return file._fileHandle;
        }

        const fileHandle = file._fileHandle;

        const options = { keepExistingData: false };
        return await fileHandle.createWritable(options);
    }

    // ---------------------------------------------------------------
    // writeChunck  (streaming — writes one chunk)
    // ---------------------------------------------------------------

    async writeChunck(writable, chunk) {
        if (isAndroid()) {
            return this._androidWriteChunk(writable, chunk);
        }

        await writable.write(chunk);
    }

    async _androidWriteChunk(fileId, chunk) {
        // chunk is a Blob (wrapping DataView for binary, or string for text)
        const buffer = await chunk.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const hex = CapacitorFile.uint8ArrayToHexString(bytes);
        await CapacitorFile.writeChunk(fileId, hex, "hex");
    }

    // ---------------------------------------------------------------
    // closeFile  (streaming — closes the writable)
    // ---------------------------------------------------------------

    async closeFile(writable) {
        if (isAndroid()) {
            await CapacitorFile.closeFile(writable);
            return;
        }

        await writable.close();
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    async _toUint8Array(data) {
        if (data instanceof Uint8Array) {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        }
        if (data instanceof Blob) {
            const buffer = await data.arrayBuffer();
            return new Uint8Array(buffer);
        }
        // Last resort: treat as string
        return new TextEncoder().encode(String(data));
    }
}

export default new FileSystem();
