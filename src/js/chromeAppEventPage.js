/*
    If an id is also specified and a window with a matching id has been shown before, the remembered bounds of the window will be used instead.
*/
'use strict';

function startApplication() {
    chrome.app.window.create('main.html', {
        id: 'main-window',
        frame: 'chrome',
        innerBounds: {
            minWidth: 1024,
            minHeight: 550,
        },
    }, function (createdWindow) {
        if (getChromeVersion() >= 54) {
            createdWindow.icon = 'images/bf_icon_128.png';
        }
    });
}

chrome.app.runtime.onLaunched.addListener(startApplication);

function getChromeVersion () {
    const raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);

    return raw ? parseInt(raw[2], 10) : false;
}
