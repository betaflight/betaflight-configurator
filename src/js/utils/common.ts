import { mixerList } from "../model";

export function millitime(): number {
    return new Date().getTime();
}

const DEGREE_TO_RADIAN_RATIO = Math.PI / 180;
const RADIAN_TO_DEGREE_RATIO = 180 / Math.PI;

export function degToRad(degrees: number): number {
    return degrees * DEGREE_TO_RADIAN_RATIO;
}

export function radToDeg(radians: number): number {
    return radians * RADIAN_TO_DEGREE_RATIO;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export const METERS_TO_FEET = 3.28084;

export function bytesToSize(bytes: number): string {
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

export function isInt(n: number): boolean {
    return n % 1 === 0;
}

/**
 * Image for a mixer, by its 1-based FC id. Empty when there is no such mixer — the id is 0
 * until MSP_MIXER_CONFIG arrives, and a tab can render before that. model.js guards the same
 * lookup the same way.
 * @param mixerIndex - FC.MIXER_CONFIG.mixer (1-based)
 * @param reverseMotorDir - reversed-motor variant
 * @returns the image path, or "" when the mixer is not known yet
 */
export function getMixerImageSrc(mixerIndex: number, reverseMotorDir: boolean): string {
    const mixer = mixerList[mixerIndex - 1];

    if (!mixer) {
        return "";
    }

    const reverse = reverseMotorDir ? "_reversed" : "";

    return `./resources/motor_order/${mixer.image}${reverse}.svg`;
}

export function getTextWidth(text: string): number {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
        return 0;
    }

    context.font = getComputedStyle(document.body).font;

    return Math.ceil(context.measureText(text).width);
}

/**
 * Escape a string for safe insertion into HTML.
 */
const HTML_ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export function escapeHtml(s: string): string {
    return String(s).replace(/[&<>"]/g, (c) => HTML_ESCAPE[c]);
}
