import $ from 'jquery';

import GUI from './gui';
import serial from './serial';
import PortHandler from './port_handler';

const URI_SCHEME = 'btfltcp://';
let uriSchemeHandlerActive = false;

export async function handleURIScheme(enabled = false) {
    if (!enabled) {
        if (uriSchemeHandlerActive) {
            if (GUI.isNWJS()) {
                unhandleNWJSOpenEvents();
            } else if (GUI.isCordova()) {
                unhandleCordovaOpenEvents();
            }
            console.log(`Stopped listening for ${URI_SCHEME} URI scheme invocations/events`);
        }
        uriSchemeHandlerActive = false;
        return;
    }

    console.log(`Listening for ${URI_SCHEME} URI scheme invocations/events`);

    if (GUI.isNWJS()) {
        handleNWJSArgv();
        handleNWJSOpenEvents();
    } else if (GUI.isCordova()) {
        handleCordovaOpenEvents();
    }
    uriSchemeHandlerActive = true;
}

function connectTcp(connectionString, eventType) {
    if (!connectionString) {
        return;
    }

    console.log(`Processing ${eventType} with connection string "${connectionString}"`);

    // NOTE: On some platforms a trailing slash is added automatically (it needs to be excluded)
    const connectionStringRegex = new RegExp(`^.*${URI_SCHEME}(.+?)/?$`);

    const url = connectionString.match(connectionStringRegex)?.[1];
    if (!url) {
        console.log(`Invalid ${URI_SCHEME} connection string "${connectionString}" from ${eventType}`);
        return;
    }

    const tcpUrl = `tcp://${url}`;
    if (!serial.tcpUrlRegex.exec(tcpUrl)) {
        console.log(`Invalid ${URI_SCHEME} TCP URL ${tcpUrl} (from ${eventType} with connection string "${connectionString}")`);
        return;
    }

    console.log(`Connecting to ${tcpUrl} (from ${eventType} with connection string "${connectionString}")`);

    // Explicitly add the 'manual' select option if the port options haven't loaded yet
    // (e.g. during a cold start)
    if ($('#port [value="manual"]').length === 0){
        PortHandler.addManualPortSelectOption();
    }

    $('#port').val('manual').trigger('change');
    $('#port-override').val(tcpUrl).trigger('change');
    $('div.connect_controls a.connect').trigger('click');
}


function handleNWJSArgv() {
    const connectionString = (nw?.App?.argv || []).at(-1) || '';

    if (connectionString) {
        connectTcp(connectionString, 'cold start');
    }
}

function nwOpenEventListener(connectionString) {
    connectTcp(connectionString, 'NW.js "open" event');
}

function handleNWJSOpenEvents() {
    nw?.App?.on('open', nwOpenEventListener);
}

function unhandleNWJSOpenEvents() {
    try {
        if (nw?.App?.onOpen.hasListener(nwOpenEventListener)) {
            nw?.App?.onOpen?.removeListener(nwOpenEventListener);
        }
    } catch (err) {
        console.error('Could not remove the nw.App open event listener:', err);
    }
}

function handleCordovaOpenEvents() {
    // based on https://www.npmjs.com/package/cordova-plugin-customurlscheme
    window.handleOpenURL = (url) => {
        connectTcp(url, 'Android deep link event');
    };
}

function unhandleCordovaOpenEvents() {
    delete window.handleOpenURL;
}
