
class FileSystem {

    _createFile(fileHandle) {
        return {
            name: fileHandle.name,
            _fileHandle: fileHandle,
        };
    }

    async pickSaveFile(suggestedName, description, extension) {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [{
                description: description,
                accept: {
                    "application/unknown": extension,
                },
            }],
        });

        const file = this._createFile(fileHandle);

        if (await this.verifyPermission(file, true)) {
            return file;
        }
    }

    async pickOpenFile(description, extension) {
        const fileHandle = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: description,
                accept: {
                    "application/unknown": extension,
                },
            }],
        });

        const file = this._createFile(fileHandle[0]);

        if (await this.verifyPermission(file, false)) {
            return file;
        }
    }

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

    async writeFile(file, contents) {
        const fileHandle = file._fileHandle;

        const writable = await fileHandle.createWritable();
        await writable.write(contents);
        await writable.close();
    }


    async readFile(file) {
        const fileHandle = file._fileHandle;

        const fileReader = await fileHandle.getFile();
        return await fileReader.text();
    }

    async readFileAsBlob(file) {
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
