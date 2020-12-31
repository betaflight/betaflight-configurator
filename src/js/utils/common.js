'use strict';

function microtime() {
    return new Date().getTime() / 1000;
}

function millitime() {
    return new Date().getTime();
}

const DEGREE_TO_RADIAN_RATIO = Math.PI / 180;

function degToRad(degrees) {
    return degrees * DEGREE_TO_RADIAN_RATIO;
}

function bytesToSize(bytes) {

    let outputBytes;

    if (bytes < 1024) {
        outputBytes = `${bytes} Bytes`;
    } else if (bytes < 1048576) {
        outputBytes = `${(bytes / 1024).toFixed(3)} KB`;
    } else if (bytes < 1073741824) {
        outputBytes = `${(bytes / 1048576).toFixed(3)} MB`;
    } else {
        outputBytes = `${(bytes / 1073741824).toFixed(3)} GB`;
    }

    return outputBytes;
}

/*
 *  checkChromeRuntimeError() has to be called after each chrome API call
 */

 function checkChromeRuntimeError() {
    if (chrome.runtime.lastError) {
        console.error(`Chrome API Error: ${chrome.runtime.lastError.message}.\n Traced ${(new Error).stack}`);
        return true;
    }
    return false;
}

const majorFirmwareVersions = {
    '1.43': '4.2.*',
    '1.42': '4.1.*',
    '1.41': '4.0.*',
    '1.40': '3.5.*',
    '1.39': '3.4.*',
    '1.37': '3.3.0',
    '1.36': '3.2.*',
    '1.31': '3.1.0',
};

function generateVirtualApiVersions() {
    const firmwareVersionDropdown = document.getElementById('firmware-version-dropdown');
    const max = semver.minor(CONFIGURATOR.API_VERSION_MAX_SUPPORTED);

    for (let i = max; i > 0; i--) {
        const option = document.createElement("option");
        const verNum = `1.${i}`;
        option.value = `${verNum}.0`;
        option.text = `MSP: ${verNum} `;

        if (majorFirmwareVersions.hasOwnProperty(verNum)) {
            option.text += ` | Firmware: ${majorFirmwareVersions[verNum]}`;
        } else if (i === max) {
            option.text += ` | Latest Firmware`;
        }

        firmwareVersionDropdown.appendChild(option);
    }
}
