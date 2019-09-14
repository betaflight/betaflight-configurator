'use strict';

/**
 * Encapsulates the Clipboard logic, depending on web or nw
 *
 */
var Clipboard = {
    _nwClipboard: null,
    available : null,
    readAvailable : null,
    writeAvailable : null,
    writeText : null,
    readText : null
};

Clipboard._configureClipboardAsNwJs = function(nwGui) {

    console.log('NW GUI Clipboard available');

    this.available = true;
    this.readAvailable = true;
    this.writeAvailable = true;
    this._nwClipboard = nwGui.Clipboard.get();

    this.writeText = function(text, onSuccess, onError) {
        try {

            this._nwClipboard.set(text, "text");

        } catch (err) {
            if (onError) {
                onError(err);
            }
        }

        if (onSuccess) {
            onSuccess(text);
        }
    }

    this.readText = function(onSuccess, onError) {

        let text = '';
        try {

            text = this._nwClipboard.get("text");

        } catch (err) {
            if (onError) {
                onError(err);
            }
        }

        if (onSuccess) {
            onSuccess(text);
        }
    }
}

Clipboard._configureClipboardAsChrome = function() {

    console.log('Chrome Clipboard available');

    this.available = true;
    this.readAvailable = false; // FIXME: for some reason the read is not working
    this.writeAvailable = true;

    this.writeText = function(text, onSuccess, onError) {
        navigator.clipboard.writeText(text)
        .then(onSuccess)
        .catch(onError);
    }

    this.readText = function(onSuccess, onError) {
        navigator.clipboard.readText()
            .then(onSuccess)
            .catch(onError);
    }

}

Clipboard._configureClipboardAsOther = function() {

    console.warn('NO Clipboard available');

    this.available = false;
    this.readAvailable = false;
    this.writeAvailable = false;

    this.writeText = function(text, onSuccess, onError) {
        onError('Clipboard not available');
    }

    this.readText = function(onSuccess, onError) {
        onError('Clipboard not available');
    }
}


switch (GUI.Mode) {
case GUI_Modes.NWJS:
    Clipboard._configureClipboardAsNwJs(GUI.nwGui);
    break;

case GUI_Modes.ChromeApp:
    Clipboard._configureClipboardAsChrome();
    break;

default:
    Clipboard._configureClipboardAsOther();
}
