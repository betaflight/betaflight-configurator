import { mixerList } from "../model";

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

export function getMixerImageSrc(mixerIndex, reverseMotorDir) {
    const reverse = reverseMotorDir ? "_reversed" : "";

    return `./resources/motor_order/${mixerList[mixerIndex - 1].image}${reverse}.svg`;
}

export function getTextWidth(text) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    context.font = getComputedStyle(document.body).font;

    return Math.ceil(context.measureText(text).width);
}

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
