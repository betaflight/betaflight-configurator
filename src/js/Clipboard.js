// naming BFClipboard to avoid conflict with Clipboard API
class BFClipboard {
    constructor() {
        this.available = false;
        this.readAvailable = false;
        this.writeAvailable = false;
        this.writeText = null;
        this.readText = null;
    }
    writeText(text, onSuccess, onError) {
        navigator.clipboard
            .writeText(text)
            .then(() => onSuccess?.(text), onError);
    }
    readText(onSuccess, onError) {
        navigator.clipboard
            .readText()
            .then((text) => onSuccess?.(text), onError);
    }
}

export default new BFClipboard();
