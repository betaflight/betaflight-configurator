import { isAndroid } from "./utils/checkCompatibility";
import CapacitorFile from "./protocols/CapacitorFile";

const EXTENSION_MIME_MAP = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".hex": "application/octet-stream",
    ".uf2": "application/octet-stream",
    ".bin": "application/octet-stream",
    ".bbl": "application/octet-stream",
    ".bfl": "application/octet-stream",
    ".cfl": "application/octet-stream",
    ".log": "text/plain",
    ".mcm": "application/octet-stream",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".gpx": "application/gpx+xml",
    ".lua": "text/plain",
    ".csv": "text/csv",
};

function mimeForExtension(ext) {
    if (!ext) return "*/*";
    const lower = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return EXTENSION_MIME_MAP[lower] || "*/*";
}

// `*/*` is not a valid key for the File System Access API `accept` map, so fall
// back to a generic binary type for unknown extensions when building filters.
function mimeForAcceptKey(ext) {
    const mime = mimeForExtension(ext);
    return mime === "*/*" ? "application/octet-stream" : mime;
}

// Normalize an extension (or list of extensions) to a deduplicated array of
// dot-prefixed variants in BOTH lower and upper case. The File System Access
// API matches extensions case-sensitively, so a `.txt` filter would otherwise
// hide a `FOO.TXT` file. Listing both cases keeps the picker case-insensitive.
export function normalizeExtensions(extension) {
    let list = [];
    if (Array.isArray(extension)) {
        list = extension;
    } else if (extension) {
        list = [extension];
    }

    const result = [];
    for (const raw of list) {
        if (!raw) {
            continue;
        }
        const withDot = raw.startsWith(".") ? raw : `.${raw}`;
        const lower = withDot.toLowerCase();
        const upper = withDot.toUpperCase();
        // `lower` is always pushed before `upper`, so if `lower` is new then
        // `upper` cannot already be present — no separate dedup check needed.
        if (!result.includes(lower)) {
            result.push(lower);
            if (upper !== lower) {
                result.push(upper);
            }
        }
    }
    return result;
}

// Build the `types` array for show{Open,Save}FilePicker, grouping the (case
// expanded) extensions under their proper MIME types.
export function buildAcceptTypes(description, extension) {
    const extensions = normalizeExtensions(extension);
    if (extensions.length === 0) {
        return [];
    }
    const accept = {};
    for (const ext of extensions) {
        const mime = mimeForAcceptKey(ext);
        if (!accept[mime]) {
            accept[mime] = [];
        }
        accept[mime].push(ext);
    }
    return [{ description, accept }];
}

// The File System Access API pickers are available in Chromium-based browsers
// and WebView2 (Windows Tauri). They are missing in Firefox and in the
// WebKit-based webviews used by the Tauri desktop build (macOS WKWebView,
// Linux WebKitGTK), where we fall back to a classic <input> / <a download>
// flow so file open/save still works.
function canUseOpenPicker() {
    return typeof globalThis.showOpenFilePicker === "function";
}

function canUseSavePicker() {
    return typeof globalThis.showSaveFilePicker === "function";
}

// Open a file via a hidden <input type=file> and resolve with the selected File
// (or reject with an AbortError when the dialog is dismissed, mirroring
// showOpenFilePicker).
function pickFileViaInput(extension) {
    const accept = normalizeExtensions(extension).join(",");
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        if (accept) {
            input.accept = accept;
        }
        input.style.display = "none";
        document.body.appendChild(input);

        let settled = false;
        let focusTimer = null;
        // Predeclared so `cleanup` can detach it (assigned further below).
        let onFocus = null;

        const cleanup = () => {
            globalThis.removeEventListener("focus", onFocus);
            if (focusTimer) {
                clearTimeout(focusTimer);
            }
            input.remove();
        };

        const settle = (action, value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            action(value);
        };

        const abort = () => {
            const error = new Error("The user aborted a request.");
            error.name = "AbortError";
            settle(reject, error);
        };

        // When focus returns to the window the dialog has closed. Give `change`
        // a moment to fire first; if nothing was selected, treat it as a
        // cancellation. This covers webviews that never fire `cancel`
        // (e.g. older WebKit), which would otherwise leave the promise hanging.
        onFocus = () => {
            focusTimer = setTimeout(() => {
                if (!input.files || input.files.length === 0) {
                    abort();
                }
            }, 500);
        };

        input.addEventListener("change", () => {
            settle(resolve, input.files?.[0] ?? null);
        });

        // Modern webviews fire `cancel` on dismissal; treat it like the
        // AbortError that showOpenFilePicker throws.
        input.addEventListener("cancel", abort);

        // Fallback dismissal detection for webviews without the `cancel` event.
        globalThis.addEventListener("focus", onFocus);

        input.click();
    });
}

// Ensure a suggested name keeps a sensible suffix when downloaded.
function ensureExtension(name, extension) {
    if (name?.includes(".")) {
        return name;
    }
    const [first] = normalizeExtensions(extension);
    return first ? `${name || "download"}${first}` : name || "download";
}

// Save data by triggering a browser download (fallback for showSaveFilePicker).
function downloadViaAnchor(name, contents) {
    let blob;
    if (contents instanceof Blob) {
        blob = contents;
    } else {
        const ext = name?.includes(".") ? `.${name.split(".").pop()}` : "";
        blob = new Blob([contents], { type: mimeForAcceptKey(ext) });
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name || "download";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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

        if (!canUseSavePicker()) {
            return this._fallbackPickSaveFile(suggestedName, extension);
        }

        const fileHandle = await globalThis.showSaveFilePicker({
            suggestedName: suggestedName,
            types: buildAcceptTypes(description, extension),
        });

        if (!fileHandle) {
            return null;
        }

        const file = this._createFile(fileHandle);

        if (await this.verifyPermission(file, true)) {
            return file;
        }
    }

    // Fallback save "handle": there is no OS save dialog without the File System
    // Access API, so we defer to a browser download when the data is written.
    // A `_download` token also carries chunks for the streaming write path.
    _fallbackPickSaveFile(suggestedName, extension) {
        const name = ensureExtension(suggestedName, extension);
        return {
            name,
            _download: { name, chunks: [] },
        };
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

        if (!canUseOpenPicker()) {
            return this._fallbackPickOpenFile(extension);
        }

        const fileHandle = await globalThis.showOpenFilePicker({
            multiple: false,
            types: buildAcceptTypes(description, extension),
        });

        const file = this._createFile(fileHandle[0]);

        if (await this.verifyPermission(file, false)) {
            return file;
        }
    }

    // Fallback open: read the File selected via a hidden <input>. The File is a
    // Blob, so it is carried directly on the descriptor for later reads.
    async _fallbackPickOpenFile(extension) {
        const selected = await pickFileViaInput(extension);
        if (!selected) {
            return null;
        }
        return {
            name: selected.name,
            _blob: selected,
        };
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
        throw new Error(`The user has no ${opts.mode} permission for file: ${fileHandle.name}`);
    }

    // ---------------------------------------------------------------
    // writeFile
    // ---------------------------------------------------------------

    async writeFile(file, contents) {
        if (isAndroid()) {
            return this._androidWriteFile(file, contents);
        }

        if (file._download) {
            downloadViaAnchor(file.name, contents);
            return;
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

        if (file._blob) {
            return await file._blob.text();
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

        if (file._blob) {
            return file._blob;
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
            // The native OutputStream is lazy-opened on the first writeChunck.
            return file._fileHandle;
        }

        if (file._download) {
            // Fallback streaming: buffer chunks in memory; they are downloaded
            // as a single blob on closeFile. The token is the `_download` object.
            file._download.chunks = [];
            return file._download;
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

        if (Array.isArray(writable?.chunks)) {
            writable.chunks.push(chunk);
            return;
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

        if (Array.isArray(writable?.chunks)) {
            downloadViaAnchor(writable.name, new Blob(writable.chunks));
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
