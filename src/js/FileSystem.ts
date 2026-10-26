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

import { isAndroid, isTauriDesktop } from "./utils/checkCompatibility";
import CapacitorFile from "./protocols/CapacitorFile";
import { hexStringToUint8Array, uint8ArrayToHexString } from "./utils/bytes";
import { get as getConfig, set as setConfig } from "./ConfigStorage";

/** One extension (".txt" or "txt") or a list of them. */
export type FileExtensions = string | readonly string[] | null | undefined;

/**
 * What writeFile accepts. Views are typed over ArrayBufferLike because the
 * firmware bytes are; nothing in the app creates a SharedArrayBuffer, which
 * Blob and the File System Access API would reject.
 */
export type FileContents = string | Blob | ArrayBuffer | ArrayBufferView;

// The File System Access API parts that lib.dom does not declare (Chromium only).
interface PickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
}

interface PickerHandle extends FileSystemFileHandle {
    queryPermission(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

interface FilePickerGlobals {
    showOpenFilePicker?: (options: {
        multiple?: boolean;
        types?: PickerAcceptType[];
        id?: string;
    }) => Promise<PickerHandle[]>;
    showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: PickerAcceptType[];
        id?: string;
    }) => Promise<PickerHandle>;
}

const pickerGlobals = globalThis as typeof globalThis & FilePickerGlobals;

/** The <a download> fallback's pending download; it is also the streaming token. */
interface PendingDownload {
    name: string;
    chunks: Blob[];
}

/**
 * A file picked by pickOpenFile/pickSaveFile. Which of the private fields is
 * set depends on the platform; callers only read `name` and pass the object back.
 */
export interface PickedFile {
    name: string;
    /** Web: a File System Access handle. Android: the SAF file id. */
    _fileHandle?: PickerHandle | string;
    /** Tauri desktop: the native path. */
    _tauriPath?: string;
    /** <input type=file> fallback: the selected File. */
    _blob?: Blob;
    /** <a download> fallback (save only). */
    _download?: PendingDownload;
}

/** Tauri streaming token: each chunk is a separate append to the path. */
interface TauriWriter {
    _tauriPath: string;
    _appending: boolean;
}

/** What openFile returns and writeChunck/closeFile take. Android's is the SAF file id. */
export type FileWriter = FileSystemWritableFileStream | TauriWriter | PendingDownload | string;

// Android hands back the SAF file id in `_fileHandle`, the web a handle; the
// platform check in each caller decides which one it is.
function androidFileId(file: PickedFile): string {
    return file._fileHandle as string;
}

function webHandle(file: PickedFile): PickerHandle {
    return file._fileHandle as PickerHandle;
}

function isTauriWriter(writable: FileWriter): writable is TauriWriter {
    return typeof writable === "object" && Boolean((writable as Partial<TauriWriter>)._tauriPath);
}

function isPendingDownload(writable: FileWriter): writable is PendingDownload {
    return typeof writable === "object" && Array.isArray((writable as Partial<PendingDownload>).chunks);
}

const EXTENSION_MIME_MAP: Record<string, string | undefined> = {
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
    ".mp4": "video/mp4",
    ".webm": "video/webm",
};

function mimeForExtension(ext: string): string {
    if (!ext) return "*/*";
    const lower = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return EXTENSION_MIME_MAP[lower] || "*/*";
}

// `*/*` is not a valid key for the File System Access API `accept` map, so fall
// back to a generic binary type for unknown extensions when building filters.
function mimeForAcceptKey(ext: string): string {
    const mime = mimeForExtension(ext);
    return mime === "*/*" ? "application/octet-stream" : mime;
}

// Normalize an extension (or list of extensions) to a deduplicated array of
// dot-prefixed variants in BOTH lower and upper case. The File System Access
// API matches extensions case-sensitively, so a `.txt` filter would otherwise
// hide a `FOO.TXT` file. Listing both cases keeps the picker case-insensitive.
export function normalizeExtensions(extension: FileExtensions): string[] {
    let list: readonly string[] = [];
    if (Array.isArray(extension)) {
        list = extension;
    } else if (typeof extension === "string" && extension) {
        list = [extension];
    }

    const result: string[] = [];
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
export function buildAcceptTypes(description: string | undefined, extension: FileExtensions): PickerAcceptType[] {
    const extensions = normalizeExtensions(extension);
    if (extensions.length === 0) {
        return [];
    }
    const accept: Record<string, string[]> = {};
    for (const ext of extensions) {
        const mime = mimeForAcceptKey(ext);
        accept[mime] ??= [];
        accept[mime].push(ext);
    }
    return [{ description, accept }];
}

// Native dialogs (Tauri) take bare extensions ("csv"), not the dot-prefixed form
// the File System Access API uses. GTK matches its filter patterns
// case-sensitively, so open filters keep the upper-case variants that
// `normalizeExtensions` adds; a save filter only supplies the suffix to append,
// so it stays lower case.
export function buildNativeFilters(
    description: string | undefined,
    extension: FileExtensions,
    keepCaseVariants = true,
): { name: string; extensions: string[] }[] {
    const extensions = normalizeExtensions(extension)
        .map((ext) => ext.slice(1))
        .filter((ext) => keepCaseVariants || ext === ext.toLowerCase());
    if (extensions.length === 0) {
        return [];
    }
    return [{ name: description || "Files", extensions }];
}

// The File System Access API pickers are available in Chromium-based browsers
// and WebView2 (Windows Tauri). They are missing in Firefox and in the
// WebKit-based webviews used by the Tauri desktop build (macOS WKWebView,
// Linux WebKitGTK), where we fall back to a classic <input> / <a download>
// flow so file open still works.
function canUseOpenPicker() {
    return typeof pickerGlobals.showOpenFilePicker === "function";
}

function canUseSavePicker() {
    return typeof pickerGlobals.showSaveFilePicker === "function";
}

// The Tauri dialog and fs plugins, loaded on demand so that web and mobile
// builds never pull them in. Desktop only — they are registered in
// src-tauri/src/lib.rs behind `#[cfg(desktop)]`.
let tauriPlugins: Promise<{
    dialog: typeof import("@tauri-apps/plugin-dialog");
    fs: typeof import("@tauri-apps/plugin-fs");
}> | null = null;
function loadTauriPlugins() {
    tauriPlugins ??= Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]).then(
        ([dialog, fs]) => ({ dialog, fs }),
    );
    return tauriPlugins;
}

// The rejection showOpenFilePicker/showSaveFilePicker produce on dismissal, which
// callers of this module already recognize.
function abortError(): Error {
    const error = new Error("The user aborted a request.");
    error.name = "AbortError";
    return error;
}

// Native dialogs hand back an absolute path; the descriptors this module returns
// carry the bare file name, like the File System Access handles do.
function baseName(path: string): string {
    const parts = String(path).split(/[/\\]/);
    return parts.at(-1) || String(path);
}

// Directory portion of a native path, in its original separator style. A
// filesystem root ("/", "\", "C:\") must keep its trailing separator — dropping
// it turns "C:\" into "C:", a drive-relative path rather than the drive root.
function dirName(path: string): string {
    const str = String(path);
    const cut = Math.max(str.lastIndexOf("/"), str.lastIndexOf("\\"));
    if (cut < 0) {
        return "";
    }
    if (cut === 0) {
        return str[0];
    }
    if (cut === 2 && /^[A-Za-z]:[/\\]/.test(str)) {
        return str.slice(0, 3);
    }
    return str.slice(0, cut);
}

// Append a file name to a remembered directory, keeping that directory's own
// separator style (native paths on the same OS never mix "/" and "\").
function joinPath(dir: string | undefined, name: string): string {
    if (!dir) {
        return name;
    }
    const sep = dir.includes("\\") ? "\\" : "/";
    return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}

// The File System Access API's `id` option only accepts this shape and
// throws `TypeError` otherwise; enforced here too so an invalid id fails the
// same way on every platform instead of only in the browser.
const PICKER_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function assertValidPickerId(pickerId: string | undefined): void {
    if (pickerId && !PICKER_ID_PATTERN.test(pickerId)) {
        throw new TypeError(`Invalid pickerId "${pickerId}": must be 1-32 ASCII letters, digits, "_" or "-".`);
    }
}

// Per-pickerId last-used directory, for platforms (Tauri) whose native dialog
// has no equivalent of the File System Access API's `id` option — that option
// makes the browser itself remember the last folder per id, so only the
// desktop dialog path needs this.
const LAST_DIR_STORAGE_KEY = "fileSystemLastDir";

function getLastDir(pickerId: string | undefined): string | undefined {
    if (!pickerId) {
        return undefined;
    }
    return getConfig<Record<string, string>>(LAST_DIR_STORAGE_KEY, {})[LAST_DIR_STORAGE_KEY]?.[pickerId];
}

function setLastDir(pickerId: string | undefined, path: string): void {
    if (!pickerId) {
        return;
    }
    const dir = dirName(path);
    if (!dir) {
        return;
    }
    const dirs = getConfig<Record<string, string>>(LAST_DIR_STORAGE_KEY, {})[LAST_DIR_STORAGE_KEY] || {};
    setConfig({ [LAST_DIR_STORAGE_KEY]: { ...dirs, [pickerId]: dir } });
}

// Open a file via a hidden <input type=file> and resolve with the selected File
// (or reject with an AbortError when the dialog is dismissed, mirroring
// showOpenFilePicker).
function pickFileViaInput(extension: FileExtensions): Promise<File | null> {
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
        let focusTimer: ReturnType<typeof setTimeout> | null = null;
        // Predeclared so `cleanup` can detach it (assigned further below).
        let onFocus: (() => void) | null = null;

        const cleanup = () => {
            if (onFocus) {
                globalThis.removeEventListener("focus", onFocus);
            }
            if (focusTimer) {
                clearTimeout(focusTimer);
            }
            input.remove();
        };

        const settle = <T>(action: (value: T) => void, value: T) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            action(value);
        };

        const abort = () => {
            settle(reject, abortError());
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
function ensureExtension(name: string | undefined, extension: FileExtensions): string {
    if (name?.includes(".")) {
        return name;
    }
    const [first] = normalizeExtensions(extension);
    return first ? `${name || "download"}${first}` : name || "download";
}

// Save data by triggering a browser download (fallback for showSaveFilePicker).
function downloadViaAnchor(name: string | undefined, contents: FileContents): void {
    let blob: Blob;
    if (contents instanceof Blob) {
        blob = contents;
    } else {
        const ext = name?.includes(".") ? `.${name.split(".").pop()}` : "";
        blob = new Blob([contents as BlobPart], { type: mimeForAcceptKey(ext) });
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
    _createFile(fileHandle: PickerHandle): PickedFile {
        return {
            name: fileHandle.name,
            _fileHandle: fileHandle,
        };
    }

    // ---------------------------------------------------------------
    // pickSaveFile
    // ---------------------------------------------------------------

    // `pickerId` groups related pickers (e.g. "firmware" vs "cli") so each
    // remembers its own last-used folder instead of sharing one. Android has
    // no equivalent: the Capacitor SAF plugin exposes no last-directory
    // option, so `pickerId` is validated but otherwise ignored on that platform.
    async pickSaveFile(
        suggestedName: string,
        description: string | undefined,
        extension: FileExtensions,
        pickerId?: string,
    ): Promise<PickedFile | null | undefined> {
        assertValidPickerId(pickerId);

        if (isAndroid()) {
            return this._androidPickSaveFile(suggestedName, description, extension);
        }

        if (isTauriDesktop()) {
            return this._tauriPickSaveFile(suggestedName, description, extension, pickerId);
        }

        if (!canUseSavePicker()) {
            return this._fallbackPickSaveFile(suggestedName, extension);
        }

        const fileHandle = await pickerGlobals.showSaveFilePicker!({
            suggestedName: suggestedName,
            types: buildAcceptTypes(description, extension),
            ...(pickerId ? { id: pickerId } : {}),
        });

        if (!fileHandle) {
            return null;
        }

        const file = this._createFile(fileHandle);

        if (await this.verifyPermission(file, true)) {
            return file;
        }
    }

    // The native save dialog. It only picks a path — nothing is created on disk
    // until the data is written — so the descriptor carries the path alone.
    async _tauriPickSaveFile(
        suggestedName: string,
        description: string | undefined,
        extension: FileExtensions,
        pickerId: string | undefined,
    ): Promise<PickedFile> {
        const { dialog } = await loadTauriPlugins();

        const name = ensureExtension(suggestedName, extension);
        const path = await dialog.save({
            defaultPath: joinPath(getLastDir(pickerId), name),
            filters: buildNativeFilters(description, extension, false),
        });

        if (!path) {
            throw abortError();
        }

        setLastDir(pickerId, path);

        return { name: baseName(path), _tauriPath: path };
    }

    // Fallback save "handle": there is no OS save dialog without the File System
    // Access API, so we defer to a browser download when the data is written.
    // A `_download` token also carries chunks for the streaming write path.
    _fallbackPickSaveFile(suggestedName: string, extension: FileExtensions): PickedFile {
        const name = ensureExtension(suggestedName, extension);
        return {
            name,
            _download: { name, chunks: [] },
        };
    }

    async _androidPickSaveFile(
        suggestedName: string,
        _description: string | undefined,
        extension: FileExtensions,
    ): Promise<PickedFile | null> {
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

    // `pickerId` groups related pickers (e.g. "firmware" vs "cli") so each
    // remembers its own last-used folder instead of sharing one. Android has
    // no equivalent: the Capacitor SAF plugin exposes no last-directory
    // option, so `pickerId` is validated but otherwise ignored on that platform.
    /** @returns null/undefined when cancelled or denied */
    async pickOpenFile(
        description: string | undefined,
        extension: FileExtensions,
        pickerId?: string,
    ): Promise<PickedFile | null | undefined> {
        assertValidPickerId(pickerId);

        if (isAndroid()) {
            return this._androidPickOpenFile(description, extension);
        }

        if (isTauriDesktop()) {
            return this._tauriPickOpenFile(description, extension, pickerId);
        }

        if (!canUseOpenPicker()) {
            return this._fallbackPickOpenFile(extension);
        }

        const fileHandle = await pickerGlobals.showOpenFilePicker!({
            multiple: false,
            types: buildAcceptTypes(description, extension),
            ...(pickerId ? { id: pickerId } : {}),
        });

        const file = this._createFile(fileHandle[0]);

        if (await this.verifyPermission(file, false)) {
            return file;
        }
    }

    async _tauriPickOpenFile(
        description: string | undefined,
        extension: FileExtensions,
        pickerId: string | undefined,
    ): Promise<PickedFile> {
        const { dialog } = await loadTauriPlugins();

        const lastDir = getLastDir(pickerId);
        const path = await dialog.open({
            multiple: false,
            directory: false,
            filters: buildNativeFilters(description, extension),
            ...(lastDir ? { defaultPath: lastDir } : {}),
        });

        if (!path) {
            throw abortError();
        }

        setLastDir(pickerId, path);

        return { name: baseName(path), _tauriPath: path };
    }

    // Fallback open: read the File selected via a hidden <input>. The File is a
    // Blob, so it is carried directly on the descriptor for later reads.
    async _fallbackPickOpenFile(extension: FileExtensions): Promise<PickedFile | null> {
        const selected = await pickFileViaInput(extension);
        if (!selected) {
            return null;
        }
        return {
            name: selected.name,
            _blob: selected,
        };
    }

    async _androidPickOpenFile(
        _description: string | undefined,
        extension: FileExtensions,
    ): Promise<PickedFile | null> {
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

    async verifyPermission(file: PickedFile, withWrite: boolean): Promise<boolean> {
        const fileHandle = webHandle(file);

        const opts: { mode: "read" | "readwrite" } = { mode: withWrite ? "readwrite" : "read" };

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

    async writeFile(file: PickedFile, contents: FileContents): Promise<void> {
        if (isAndroid()) {
            return this._androidWriteFile(file, contents);
        }

        if (file._tauriPath) {
            return this._tauriWriteFile(file as PickedFile & { _tauriPath: string }, contents);
        }

        if (file._download) {
            downloadViaAnchor(file.name, contents);
            return;
        }

        const fileHandle = webHandle(file);

        const writable = await fileHandle.createWritable();
        await writable.write(contents as FileSystemWriteChunkType);
        await writable.close();
    }

    async _tauriWriteFile(file: PickedFile & { _tauriPath: string }, contents: FileContents): Promise<void> {
        const { fs } = await loadTauriPlugins();

        if (typeof contents === "string") {
            await fs.writeTextFile(file._tauriPath, contents);
        } else {
            await fs.writeFile(file._tauriPath, await this._toUint8Array(contents));
        }
    }

    async _androidWriteFile(file: PickedFile, contents: FileContents): Promise<void> {
        const fileId = androidFileId(file);

        if (typeof contents === "string") {
            await CapacitorFile.writeFile(fileId, contents, "utf8");
        } else {
            // Uint8Array, ArrayBuffer, or Blob → convert to hex
            const bytes = await this._toUint8Array(contents);
            const hex = uint8ArrayToHexString(bytes);
            await CapacitorFile.writeFile(fileId, hex, "hex");
        }
    }

    // ---------------------------------------------------------------
    // readFile
    // ---------------------------------------------------------------

    async readFile(file: PickedFile): Promise<string> {
        if (isAndroid()) {
            return CapacitorFile.readFile(androidFileId(file));
        }

        if (file._tauriPath) {
            const { fs } = await loadTauriPlugins();
            return await fs.readTextFile(file._tauriPath);
        }

        if (file._blob) {
            return await file._blob.text();
        }

        const fileHandle = webHandle(file);

        const fileReader = await fileHandle.getFile();
        return await fileReader.text();
    }

    // ---------------------------------------------------------------
    // readFileAsBlob
    // ---------------------------------------------------------------

    async readFileAsBlob(file: PickedFile): Promise<Blob> {
        if (isAndroid()) {
            return this._androidReadFileAsBlob(file);
        }

        if (file._tauriPath) {
            return this._tauriReadFileAsBlob(file as PickedFile & { _tauriPath: string });
        }

        if (file._blob) {
            return file._blob;
        }

        const fileHandle = webHandle(file);

        return await fileHandle.getFile();
    }

    async _tauriReadFileAsBlob(file: PickedFile & { _tauriPath: string }): Promise<Blob> {
        const { fs } = await loadTauriPlugins();
        const bytes = await fs.readFile(file._tauriPath);

        const ext = file.name ? `.${file.name.split(".").pop()}` : "";
        return new Blob([bytes], { type: mimeForExtension(ext) });
    }

    async _androidReadFileAsBlob(file: PickedFile): Promise<Blob> {
        const hex = await CapacitorFile.readFileAsHex(androidFileId(file));
        const bytes = hexStringToUint8Array(hex);

        // Determine MIME type from file name extension
        const ext = file.name ? `.${file.name.split(".").pop()}` : "";
        const mimeType = mimeForExtension(ext);

        return new Blob([bytes], { type: mimeType });
    }

    // ---------------------------------------------------------------
    // openFile  (streaming — returns a writable token)
    // ---------------------------------------------------------------

    async openFile(file: PickedFile): Promise<FileWriter> {
        if (isAndroid()) {
            // Return the fileId as the "writable" token.
            // The native OutputStream is lazy-opened on the first writeChunck.
            return androidFileId(file);
        }

        if (file._tauriPath) {
            // No file handle is held open: each chunk is appended in its own fs
            // call, which ships the bytes as the raw IPC body. A held handle
            // would have to send them as a JSON array of numbers instead, which
            // is far too slow for multi-megabyte blackbox dumps.
            return { _tauriPath: file._tauriPath, _appending: false };
        }

        if (file._download) {
            // Fallback streaming: buffer chunks in memory; they are downloaded
            // as a single blob on closeFile. The token is the `_download` object.
            file._download.chunks = [];
            return file._download;
        }

        const fileHandle = webHandle(file);

        const options = { keepExistingData: false };
        return await fileHandle.createWritable(options);
    }

    // ---------------------------------------------------------------
    // writeChunck  (streaming — writes one chunk)
    // ---------------------------------------------------------------

    async writeChunck(writable: FileWriter, chunk: Blob): Promise<void> {
        if (isAndroid()) {
            return this._androidWriteChunk(writable as string, chunk);
        }

        if (isTauriWriter(writable)) {
            return this._tauriWriteChunk(writable, chunk);
        }

        if (isPendingDownload(writable)) {
            writable.chunks.push(chunk);
            return;
        }

        await (writable as FileSystemWritableFileStream).write(chunk);
    }

    async _tauriWriteChunk(writable: TauriWriter, chunk: Blob): Promise<void> {
        const { fs } = await loadTauriPlugins();
        const bytes = await this._toUint8Array(chunk);

        // The first chunk truncates whatever was at the path; the rest append.
        await fs.writeFile(writable._tauriPath, bytes, { append: writable._appending, create: true });
        writable._appending = true;
    }

    async _androidWriteChunk(fileId: string, chunk: Blob): Promise<void> {
        // chunk is a Blob (wrapping DataView for binary, or string for text)
        const buffer = await chunk.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const hex = uint8ArrayToHexString(bytes);
        await CapacitorFile.writeChunk(fileId, hex, "hex");
    }

    // ---------------------------------------------------------------
    // closeFile  (streaming — closes the writable)
    // ---------------------------------------------------------------

    async closeFile(writable: FileWriter): Promise<void> {
        if (isAndroid()) {
            await CapacitorFile.closeFile(writable as string);
            return;
        }

        if (isTauriWriter(writable)) {
            if (!writable._appending) {
                // Nothing was streamed. The File System Access API creates the
                // file when the picker returns, so an aborted save still leaves
                // an empty file behind; do the same here.
                const { fs } = await loadTauriPlugins();
                await fs.writeFile(writable._tauriPath, new Uint8Array(), { create: true });
                writable._appending = true;
            }
            return;
        }

        if (isPendingDownload(writable)) {
            downloadViaAnchor(writable.name, new Blob(writable.chunks));
            return;
        }

        await (writable as FileSystemWritableFileStream).close();
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    async _toUint8Array(data: FileContents): Promise<Uint8Array> {
        if (data instanceof Uint8Array) {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        }
        // DataView and the other typed arrays: view the same bytes, don't copy.
        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
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
