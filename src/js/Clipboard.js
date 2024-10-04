// naming BFClipboard to avoid conflict with Clipboard API
class BFClipboard {
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
