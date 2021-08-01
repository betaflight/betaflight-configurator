import semver from "semver";

export function millitime() {
    return new Date().getTime();
}

const DEGREE_TO_RADIAN_RATIO = Math.PI / 180;

export function degToRad(degrees) {
    return degrees * DEGREE_TO_RADIAN_RATIO;
}

export function bytesToSize(bytes) {
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

export function checkChromeRuntimeError() {
    if (chrome.runtime.lastError) {
        console.error(
            `Chrome API Error: ${chrome.runtime.lastError.message}.\n Traced ${
                new Error().stack
            }`
        );
        return true;
    }
    return false;
}

const majorFirmwareVersions = {
    "1.43": "4.2.*",
    "1.42": "4.1.*",
    "1.41": "4.0.*",
    "1.40": "3.5.*",
    "1.39": "3.4.*",
    "1.37": "3.3.0",
    "1.36": "3.2.*",
    "1.31": "3.1.0"
};

export function generateVirtualApiVersions() {
    const firmwareVersionDropdown = document.getElementById(
        "firmware-version-dropdown"
    );
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
export function getMixerImageSrc(mixerIndex, reverseMotorDir, apiVersion)
{
    let reverse = "";

    if (semver.gte(apiVersion, API_VERSION_1_36)) {
        reverse = reverseMotorDir ? "_reversed" : "";
    }

    return `./resources/motor_order/${mixerList[mixerIndex - 1].image}${reverse}.svg`;
}

export function getTextWidth(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    context.font = getComputedStyle(document.body).font;

    return Math.ceil(context.measureText(text).width);
}

// TODO: these are temp binding while transition to module happens
window.degToRad = degToRad;
window.bytesToSize = bytesToSize;
window.checkChromeRuntimeError = checkChromeRuntimeError;
window.generateVirtualApiVersions = generateVirtualApiVersions;
window.getMixerImageSrc = getMixerImageSrc;
window.getTextWidth = getTextWidth;
