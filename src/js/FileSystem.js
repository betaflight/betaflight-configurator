class FileSystem {
    _createFile(fileHandle) {
        return {
            name: fileHandle.name,
            _fileHandle: fileHandle,
        };
    }

    // Create a wrapper for legacy File objects (from input element fallback)
    _createLegacyFile(file) {
        return {
            name: file.name,
            _fileHandle: null,
            _legacyFile: file,
        };
    }

    // Fallback file picker using hidden input element
    _pickOpenFileFallback(extension) {
        return new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            // Convert extension array or string to accept attribute
            if (Array.isArray(extension)) {
                input.accept = extension.join(",");
            } else {
                input.accept = extension;
            }
            input.style.display = "none";
            document.body.appendChild(input);

            input.addEventListener("change", () => {
                const file = input.files[0];
                document.body.removeChild(input);
                if (file) {
                    resolve(this._createLegacyFile(file));
                } else {
                    resolve(null);
                }
            });

            input.addEventListener("cancel", () => {
                document.body.removeChild(input);
                resolve(null);
            });

            input.click();
        });
    }

    // Fallback save using download link
    _pickSaveFileFallback(suggestedName, contents) {
        return new Promise((resolve) => {
            const blob = new Blob([contents], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            resolve(true);
        });
    }

    async pickSaveFile(suggestedName, description, extension) {
        // Check if File System Access API is available
        if (window.showSaveFilePicker) {
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
        } else {
            // Fallback: return a pseudo file object for legacy save
            console.log("File System Access API not available, using fallback for save");
            return {
                name: suggestedName,
                _fileHandle: null,
                _fallbackSave: true,
            };
        }
    }

    async pickOpenFile(description, extension) {
        // Check if File System Access API is available
        if (window.showOpenFilePicker) {
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
        } else {
            // Fallback to traditional file input
            console.log("File System Access API not available, using fallback file picker");
            return await this._pickOpenFileFallback(extension);
        }
    }

    async verifyPermission(file, withWrite) {
        // Legacy files from fallback picker don't need permission verification
        if (file._legacyFile || file._fallbackSave) {
            return true;
        }

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

    async writeFile(file, contents) {
        // Handle fallback save (download)
        if (file._fallbackSave) {
            return await this._pickSaveFileFallback(file.name, contents);
        }

        const fileHandle = file._fileHandle;

        const writable = await fileHandle.createWritable();
        await writable.write(contents);
        await writable.close();
    }

    async readFile(file) {
        // Handle legacy file objects (from fallback picker)
        if (file._legacyFile) {
            return await file._legacyFile.text();
        }

        const fileHandle = file._fileHandle;
        const fileReader = await fileHandle.getFile();
        return await fileReader.text();
    }

    async readFileAsBlob(file) {
        // Handle legacy file objects (from fallback picker)
        if (file._legacyFile) {
            return file._legacyFile;
        }

        const fileHandle = file._fileHandle;
        return await fileHandle.getFile();
    }

    async openFile(file) {
        const fileHandle = file._fileHandle;

        const options = { keepExistingData: false };
        return await fileHandle.createWritable(options);
    }

    async writeChunck(writable, chunk) {
        await writable.write(chunk);
    }

    async closeFile(writable) {
        await writable.close();
    }
}

export default new FileSystem();
