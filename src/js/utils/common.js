import { mixerList } from "../model";

export function millitime() {
    return new Date().getTime();
}

const DEGREE_TO_RADIAN_RATIO = Math.PI / 180;
const RADIAN_TO_DEGREE_RATIO = 180 / Math.PI;

export function degToRad(degrees) {
    return degrees * DEGREE_TO_RADIAN_RATIO;
}

export function radToDeg(radians) {
    return radians * RADIAN_TO_DEGREE_RATIO;
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export const METERS_TO_FEET = 3.28084;

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

/**
 * Image for a mixer, by its 1-based FC id. Empty when there is no such mixer — the id is 0
 * until MSP_MIXER_CONFIG arrives, and a tab can render before that. model.js guards the same
 * lookup the same way.
 * @param {number} mixerIndex - FC.MIXER_CONFIG.mixer (1-based)
 * @param {boolean} reverseMotorDir - reversed-motor variant
 * @returns {string} the image path, or "" when the mixer is not known yet
 */
export function getMixerImageSrc(mixerIndex, reverseMotorDir) {
    const mixer = mixerList[mixerIndex - 1];

    if (!mixer) {
        return "";
    }

    const reverse = reverseMotorDir ? "_reversed" : "";

    return `./resources/motor_order/${mixer.image}${reverse}.svg`;
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
const HTML_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => HTML_ESCAPE[c]);
}
