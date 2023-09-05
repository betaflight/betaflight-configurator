import semver from "semver";
import { mixerList } from "../model";
import CONFIGURATOR from "../data_storage";
import { gui_log } from "../gui_log";
import $ from "jquery";

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

export function isInt(n) {
    return n % 1 === 0;
}

/*
 *  checkChromeRuntimeError() has to be called after each chrome API call
 */

export function checkChromeRuntimeError() {
    if (chrome.runtime.lastError) {
        console.error(`Chrome API Error: ${chrome.runtime.lastError.message}.\n Traced ${new Error().stack}`);
        gui_log(`Chrome API Error: ${chrome.runtime.lastError.message}.`);
        return true;
    }
    return false;
}

const majorFirmwareVersions = {
    "1.46": "4.5.*",
    "1.45": "4.4.*",
    "1.44": "4.3.*",
    "1.43": "4.2.*",
    "1.42": "4.1.*",
    "1.41": "4.0.*",
};

export function generateVirtualApiVersions() {
    const firmwareVersionDropdown = document.getElementById("firmware-version-dropdown");
    const max = semver.minor(CONFIGURATOR.API_VERSION_MAX_SUPPORTED);
    const min = semver.minor(CONFIGURATOR.API_VERSION_ACCEPTED);

    for (let i = max; i >= min; i--) {
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

export function getMixerImageSrc(mixerIndex, reverseMotorDir) {
    const reverse = reverseMotorDir ? "_reversed" : "";

    return `./resources/motor_order/${mixerList[mixerIndex - 1].image}${reverse}.svg`;
}

export function getTextWidth(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    context.font = getComputedStyle(document.body).font;

    return Math.ceil(context.measureText(text).width);
}

export function urlExists(url) {
    let http = new XMLHttpRequest ();

    http.open('HEAD', url, false);
    http.send();
    return http.status !== 404;
}

/**
 * Returns jquery sorted option list with optional value staying on top of the list.
 *
 * @param {string} optional value staying on top of the list.
 * @return {object} sorted option list.
 */

$.fn.sortSelect = function(text = "") {
    const op = this.children("option");

    op.sort((a, b) => {
        if (a.text === text) {
            return -1;
        }
        if (b.text === text) {
            return 1;
        }
        return a.text.localeCompare(b.text, window.navigator.language, { ignorePunctuation: true });
    });

    return this.empty().append(op);
};
