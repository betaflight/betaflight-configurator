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
    };

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
    };
};

Clipboard._configureClipboardAsCordova = function() {

    console.log('Cordova Clipboard available');

    this.available = true;
    this.readAvailable = true;
    this.writeAvailable = true;

    this.writeText = function(text, onSuccess, onError) {
        cordova.plugins.clipboard.copy(text, onSuccess, onError);
    };

    this.readText = function(onSuccess, onError) {
        cordova.plugins.clipboard.paste(onSuccess, onError);
    };

};

Clipboard._configureClipboardAsOther = function() {

    console.warn('NO Clipboard available');

    this.available = false;
    this.readAvailable = false;
    this.writeAvailable = false;

    this.writeText = function(text, onSuccess, onError) {
        onError('Clipboard not available');
    };

    this.readText = function(onSuccess, onError) {
        onError('Clipboard not available');
    };
};

if (GUI.isNWJS()){
    Clipboard._configureClipboardAsNwJs(GUI.nwGui);
} else if (GUI.isCordova()) {
    Clipboard._configureClipboardAsCordova();
} else {
    Clipboard._configureClipboardAsOther();
}
