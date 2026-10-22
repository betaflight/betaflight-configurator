/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import semver from "semver";
import { FIRMWARE_TYPE_BETAFLIGHT, FIRMWARE_TYPE_CLEANFLIGHT } from "./flightlog_fielddefs";

//Convert a hexadecimal string (that represents a binary 32-bit float) into a float
export function hexToFloat(string: string): number {
    const arr = new Uint32Array(1);
    arr[0] = Number.parseInt(string, 16);

    const floatArr = new Float32Array(arr.buffer);

    return floatArr[0];
}

export function uint32ToFloat(value: number): number {
    const arr = new Uint32Array(1);
    arr[0] = value;

    const floatArr = new Float32Array(arr.buffer);

    return floatArr[0];
}

export function asciiArrayToString(arr: Iterable<number>): string {
    return String.fromCodePoint(...arr);
}

export function asciiStringToByteArray(s: string): number[] {
    const bytes: number[] = [];

    for (let i = 0; i < s.length; i++) {
        bytes.push(s.codePointAt(i) as number);
    }

    return bytes;
}

export function signExtend14Bit(word: number): number {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return word & 0x2000 ? word | 0xffffc000 : word;
}

export function stringHasComma(string: string): boolean {
    /***
     * Checks if the string contains at least one comma.
     *
     * string               is the string to check
     *
     * returns              true if at least one comma is found.
     *                      false if no comma is found.
     ***/
    return string.includes(",");
}

/** One parsed header value: a number where it parses as one, otherwise the text. */
export type HeaderScalar = number | string;
/** What parseCommaSeparatedString() returns: a scalar for one value, a list (padded with `null`) for more. */
export type HeaderValue = HeaderScalar | (HeaderScalar | null)[];

export function parseCommaSeparatedString(string: string, length?: number): HeaderValue {
    /***
     * Parse a comma separated string for individual values.
     *
     * string               is the comma separated string to parse
     * length (optional)    the returned array will be forced to be this long; extra fields will be discarded,
     *                      missing fields will be padded. if length is not specified, then array will be auto
     *                      sized.
     *
     * returns              if the string does not contain a comma, then the first integer/float/string is returned
     *                      else an Array is returned containing all the values up to the length (if specified)
     ***/
    const parts = string.split(",");

    length = length || parts.length; // we can force a length if we like

    if (length < 2) {
        // this is not actually a list, just return the value
        // `parts` is an array here, so indexOf(".") only matches a part that is exactly "." and both
        // branches then give NaN: in effect this always parses the whole string as a float.
        const value = parts.indexOf(".") ? Number.parseFloat(String(parts)) : Number.parseInt(String(parts), 10);
        return Number.isNaN(value) ? string : value;
    }

    // this really is a list; build an array
    const result: (HeaderScalar | null)[] = new Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = i < parts.length ? parseListItem(parts[i]) : null;
    }
    return result;
}

/** One item of a header list: a number where it parses as one, otherwise the text. */
function parseListItem(part: string): HeaderScalar {
    // indexOf(".") is 0 only for an item starting with ".", which parseInt() turns into NaN, so
    // such an item stays text; any other item is parsed as a float.
    const value = part.indexOf(".") ? Number.parseFloat(part) : Number.parseInt(part, 10);
    return Number.isNaN(value) ? part : value;
}

/**
 * Find the index of `item` in `list`, or if `item` is not contained in `list` then return the index
 * of the next-smaller element (or 0 if `item` is smaller than all values in `list`).
 **/
export function binarySearchOrPrevious(list: ArrayLike<number>, item: number): number {
    let min = 0,
        max = list.length,
        mid,
        result = 0;

    while (min < max) {
        mid = Math.floor((min + max) / 2);

        if (list[mid] === item) {
            return mid;
        } else if (list[mid] < item) {
            // This might be the largest element smaller than item, but we have to continue the search right to find out
            result = mid;
            min = mid + 1;
        } else {
            max = mid;
        }
    }

    return result;
}

/**
 * Find the index of `item` in `list`, or if `item` is not contained in `list` then return the index
 * of the next-larger element (or the index of the last item if `item` is larger than all values in `list`).
 */
export function binarySearchOrNext(list: ArrayLike<number>, item: number): number {
    let min = 0,
        max = list.length,
        mid,
        result = list.length - 1;

    while (min < max) {
        mid = Math.floor((min + max) / 2);

        if (list[mid] === item) {
            return mid;
        } else if (list[mid] > item) {
            // This might be the smallest element larger than item, but we have to continue the search left to find out
            max = mid;
            result = mid;
        } else {
            min = mid + 1;
        }
    }

    return result;
}

export function leftPad(value: string | number, pad: string, minLength: number): string {
    let string = `${value}`;

    while (string.length < minLength) {
        string = pad + string;
    }

    return string;
}

export function formatTime(msec: number, displayMsec?: boolean): string {
    // modify function to allow negative times.
    let ms = Math.round(Math.abs(msec));

    let secs = Math.floor(ms / 1000);
    ms %= 1000;

    let mins = Math.floor(secs / 60);
    secs %= 60;

    const hours = Math.floor(mins / 60);
    mins %= 60;

    const sign = msec < 0 ? "-" : "";
    const hoursPart = hours ? `${leftPad(hours, "0", 2)}:` : "";
    const msecPart = displayMsec ? `.${leftPad(ms, "0", 3)}` : "";

    return `${sign}${hoursPart}${leftPad(mins, "0", 2)}:${leftPad(secs, "0", 2)}${msecPart}`;
}

export function stringLoopTime(
    loopTime: number | null | undefined,
    pid_process_denom: number | null | undefined,
    unsynced_fast_pwm: number | null | undefined,
    motor_pwm_rate: number | null | undefined,
): string {
    let returnString = "";
    if (loopTime != null) {
        returnString = `${loopTime}\u03BCS (${Number.parseFloat((1000 / loopTime).toFixed(3))}kHz`;
        if (pid_process_denom != null) {
            returnString += `/${Number.parseFloat((1000 / (loopTime * pid_process_denom)).toFixed(3))}kHz`;
            if (unsynced_fast_pwm != null) {
                if (unsynced_fast_pwm === 0) {
                    returnString += "/SYNCED";
                } else if (motor_pwm_rate != null) {
                    returnString += `/${Number.parseFloat((motor_pwm_rate / 1000).toFixed(3))}kHz`;
                } else {
                    returnString += "UNSYNCED";
                }
            }
        }
        returnString += ")";
    }
    return returnString;
}

/** Parse a typed time (`SS.sss` or `MM:SS.sss`, optionally negative) into microseconds; 0 if unparsable. */
export function stringTimetoMsec(input: string): number {
    try {
        // A null match throws on `.length`, which the catch turns into 0.
        return matchedTimeToMicroseconds(/(-)?(\d+)(\D)*(\d+)*\D*(\d+)*/.exec(input)!);
    } catch {
        return 0;
    }
}

/** Up to three fraction digits as milliseconds ("5" is 500), or 0 when there are none. */
function fractionToMilliseconds(digits: string | undefined): number {
    return Number(digits ? `${digits}00`.slice(0, 3) : 0);
}

function matchedTimeToMicroseconds(matches: RegExpExecArray): number {
    const sign = matches[1] ? -1 : 1;

    if (matches.length <= 2) {
        return sign * (Number(matches[2]) * 1000000);
    }
    // there is a placeholder - either : or .
    if (matches[3] === ":") {
        // time has been entered MM:SS.SSS
        return (
            sign *
            (Number(matches[2]) * 60 * 1000000 +
                Number(matches[4] ? matches[4] : 0) * 1000000 +
                fractionToMilliseconds(matches[5]) * 1000)
        );
    }
    return sign * (Number(matches[2]) * 1000000 + fractionToMilliseconds(matches[4]) * 1000);
}

export function constrain(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
}

export function validate<T>(value: T | null | undefined, defaultValue: T): T {
    return value ?? defaultValue;
}

export interface CornerRadii {
    tl: number;
    tr: number;
    br: number;
    bl: number;
}

export interface RoundRectOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    /** One radius for every corner, or per corner (missing corners are square; the object is filled in). */
    radius?: number | Partial<CornerRadii>;
    fill?: boolean;
    stroke?: boolean;
}

export function roundRect(
    ctx: CanvasRenderingContext2D,
    { x, y, width, height, radius: radiusOption = 5, fill = true, stroke = true }: RoundRectOptions,
): void {
    let radius: CornerRadii;
    if (typeof radiusOption === "number") {
        radius = { tl: radiusOption, tr: radiusOption, br: radiusOption, bl: radiusOption };
    } else {
        const defaultRadius: CornerRadii = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (const side of Object.keys(defaultRadius) as (keyof CornerRadii)[]) {
            radiusOption[side] = radiusOption[side] || defaultRadius[side];
        }
        radius = radiusOption as CornerRadii;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }
}

function getOrCreateNotifElem(
    parentElem: HTMLElement,
    messageClass: string,
    message: string,
    timeout: ReturnType<typeof setTimeout> | null,
): HTMLElement {
    let notifElem = document.getElementById("mouse-notification");
    if (notifElem) {
        clearTimeout(timeout ?? undefined);
        notifElem.className = messageClass;
        notifElem.innerHTML = message;
    } else {
        notifElem = document.createElement("div");
        notifElem.className = messageClass;
        notifElem.id = "mouse-notification";
        notifElem.innerHTML = message;
        parentElem.appendChild(notifElem);
    }
    return notifElem;
}

function computeAlignedLeft(align: string, targetWidth: number, popupWidth: number, margin: number): number {
    if (align.includes("right")) {
        return targetWidth - (popupWidth + margin);
    }
    if (align.includes("center")) {
        return targetWidth / 2 - (popupWidth + margin) / 2;
    }
    return margin;
}

function computeAlignedTop(align: string, targetHeight: number, popupHeight: number, margin: number): number {
    if (align.includes("bottom")) {
        return targetHeight - (popupHeight + margin);
    }
    if (align.includes("middle")) {
        return targetHeight / 2 - (popupHeight + margin) / 2;
    }
    return margin;
}

interface MouseNotification {
    enabled: boolean;
    /** The `#mouseNotification` container, looked up on first use. */
    elem: HTMLElement | null;
    timeout: ReturnType<typeof setTimeout> | null;
    /**
     * Show `message` (HTML) over `target` for `delay` ms, at the mouse position or, with `align`
     * ("top"/"middle"/"bottom" plus "left"/"center"/"right"), at that corner of the target.
     */
    show(
        target: Element | string | null,
        x: number | null,
        y: number | null,
        message: string,
        delay?: number | null,
        messageClass?: string | null,
        align?: string | null,
        margin?: number | null,
    ): boolean;
}

export const mouseNotification: MouseNotification = {
    enabled: true,
    elem: null,
    timeout: null,
    // Eight positional parameters (Sonar S107): its one caller is main.js, which batch G of #5542
    // converts; show() takes an options object then.
    show: function (target, x, y, message, delay, messageClass, align, margin) /* NOSONAR */ {
        if (!this.enabled) {
            return false;
        }

        this.elem ??= document.getElementById("mouseNotification");

        messageClass = messageClass || "mouseNotification-box";
        margin = margin || 10;

        // The viewer's markup always has #mouseNotification; without it this throws, as it always did.
        const elem = this.elem!;
        getOrCreateNotifElem(elem, messageClass, message, this.timeout);
        this.timeout = setTimeout(function () {
            document.getElementById("mouse-notification")?.remove();
        }, delay || 1000);

        let popupRect = elem.getBoundingClientRect();
        const targetEl = target instanceof Element ? target : document.querySelector(String(target));
        const targetRect = targetEl!.getBoundingClientRect();

        // reposition the notification
        if (align == null) {
            elem.style.left = `${(x || 0) - targetRect.left + margin}px`;
            elem.style.top = `${(y || 0) - targetRect.top + margin}px`;
        } else {
            const left = computeAlignedLeft(align, targetRect.width, popupRect.width, margin);
            const top = computeAlignedTop(align, targetRect.height, popupRect.height, margin);
            elem.style.left = `${left}px`;
            elem.style.top = `${top}px`;
        }

        // now re-position the box if it goes out of the target element
        popupRect = elem.getBoundingClientRect();
        if (popupRect.right > targetRect.right - margin) {
            elem.style.left = `${targetRect.right - popupRect.width - margin}px`;
        }

        return true;
    },
};

/** The two sysConfig fields firmwareGreaterOrEqual() reads. */
export interface FirmwareIdentity {
    firmwareType: number;
    firmwareVersion: string;
}

export function firmwareGreaterOrEqual(sysConfig: FirmwareIdentity, bf_version: string, cf_version?: string): boolean {
    /***
     * Check if firmware version is higher or equal to requested version
     *
     * sysConfig            System config structure
     * bf_version           Betaflight version to check, e.g. '3.1.0' (string)
     * cf_version           Legacy firmware version to check, e.g. '2.3.0' (optional, string)
     *
     * returns              True when firmware version is higher or equal to requested version
     *                      False when firmware version is lower than the requested version
     ***/
    if (cf_version === undefined) {
        return sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.gte(sysConfig.firmwareVersion, bf_version);
    } else {
        return (
            (sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(sysConfig.firmwareVersion, bf_version)) ||
            (sysConfig.firmwareType === FIRMWARE_TYPE_CLEANFLIGHT && semver.gte(sysConfig.firmwareVersion, cf_version))
        );
    }
}

export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
