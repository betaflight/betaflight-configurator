import semver from "semver";
import { FIRMWARE_TYPE_BETAFLIGHT, FIRMWARE_TYPE_CLEANFLIGHT } from "./flightlog_fielddefs";

//Convert a hexadecimal string (that represents a binary 32-bit float) into a float
export function hexToFloat(string) {
    const arr = new Uint32Array(1);
    arr[0] = Number.parseInt(string, 16);

    const floatArr = new Float32Array(arr.buffer);

    return floatArr[0];
}

export function uint32ToFloat(value) {
    const arr = new Uint32Array(1);
    arr[0] = value;

    const floatArr = new Float32Array(arr.buffer);

    return floatArr[0];
}

export function asciiArrayToString(arr) {
    return String.fromCodePoint(...arr);
}

export function asciiStringToByteArray(s) {
    const bytes = [];

    for (let i = 0; i < s.length; i++) {
        bytes.push(s.charCodeAt(i));
    }

    return bytes;
}

export function signExtend24Bit(u) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return u & 0x800000 ? u | 0xff000000 : u;
}

export function signExtend16Bit(word) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return word & 0x8000 ? word | 0xffff0000 : word;
}

export function signExtend14Bit(word) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return word & 0x2000 ? word | 0xffffc000 : word;
}

export function signExtend8Bit(byte) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return byte & 0x80 ? byte | 0xffffff00 : byte;
}

export function signExtend7Bit(byte) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return byte & 0x40 ? byte | 0xffffff80 : byte;
}

export function signExtend6Bit(byte) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return byte & 0x20 ? byte | 0xffffffc0 : byte;
}

export function signExtend5Bit(byte) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return byte & 0x10 ? byte | 0xffffffe0 : byte;
}

export function signExtend4Bit(nibble) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return nibble & 0x08 ? nibble | 0xfffffff0 : nibble;
}

export function signExtend2Bit(byte) {
    //If sign bit is set, fill the top bits with 1s to sign-extend
    return byte & 0x02 ? byte | 0xfffffffc : byte;
}

export function stringHasComma(string) {
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

export function parseCommaSeparatedString(string, length) {
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
    let result;
    let value;

    length = length || parts.length; // we can force a length if we like

    if (length < 2) {
        // this is not actually a list, just return the value
        value = parts.indexOf(".") ? Number.parseFloat(parts) : Number.parseInt(parts, 10);
        return Number.isNaN(value) ? string : value;
    } else {
        // this really is a list; build an array
        result = new Array(length);
        for (let i = 0; i < length; i++) {
            if (i < parts.length) {
                value = parts[i].indexOf(".") ? Number.parseFloat(parts[i]) : Number.parseInt(parts[i], 10);
                result[i] = Number.isNaN(value) ? parts[i] : value;
            } else {
                result[i] = null;
            }
        }
        return result;
    }
}

/**
 * Find the index of `item` in `list`, or if `item` is not contained in `list` then return the index
 * of the next-smaller element (or 0 if `item` is smaller than all values in `list`).
 **/
export function binarySearchOrPrevious(list, item) {
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
export function binarySearchOrNext(list, item) {
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

export function leftPad(string, pad, minLength) {
    string = `${string}`;

    while (string.length < minLength) {
        string = pad + string;
    }

    return string;
}

export function formatTime(msec, displayMsec) {
    // modify function to allow negative times.
    let ms = Math.round(Math.abs(msec));

    let secs = Math.floor(ms / 1000);
    ms %= 1000;

    let mins = Math.floor(secs / 60);
    secs %= 60;

    const hours = Math.floor(mins / 60);
    mins %= 60;

    return `${
        (msec < 0 ? "-" : "") + (hours ? `${leftPad(hours, "0", 2)}:` : "") + leftPad(mins, "0", 2)
    }:${leftPad(secs, "0", 2)}${displayMsec ? `.${leftPad(ms, "0", 3)}` : ""}`;
}

export function stringLoopTime(loopTime, pid_process_denom, unsynced_fast_pwm, motor_pwm_rate) {
    let returnString = "";
    if (loopTime != null) {
        returnString = `${loopTime}\u03BCS (${Number.parseFloat((1000 / loopTime).toFixed(3))}kHz`;
        if (pid_process_denom != null) {
            returnString += `/${Number.parseFloat((1000 / (loopTime * pid_process_denom)).toFixed(3))}kHz`;
            if (unsynced_fast_pwm != null) {
                returnString +=
                    unsynced_fast_pwm === 0
                        ? "/SYNCED"
                        : motor_pwm_rate != null
                          ? `/${Number.parseFloat((motor_pwm_rate / 1000).toFixed(3))}kHz`
                          : "UNSYNCED";
            }
        }
        returnString += ")";
    }
    return returnString;
}

export function stringTimetoMsec(input) {
    try {
        const matches = input.match(/(-)?(\d+)(\D)*(\d+)*\D*(\d+)*/);

        if (matches.length > 2) {
            // there is a placeholder - either : or .
            if (matches[3] === ":") {
                // time has been entered MM:SS.SSS
                return (
                    (matches[1] ? -1 : 1) *
                    (matches[2] * 60 * 1000000 +
                        (matches[4] ? matches[4] : 0) * 1000000 +
                        (matches[5] ? `${matches[5]}00`.slice(0, 3) : 0) * 1000)
                );
            } else {
                return (
                    (matches[1] ? -1 : 1) *
                    (matches[2] * 1000000 + (matches[4] ? `${matches[4]}00`.slice(0, 3) : 0) * 1000)
                );
            }
        } else {
            return (matches[1] ? -1 : 1) * (matches[2] * 1000000);
        }
    } catch {
        return 0;
    }
}

export function constrain(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

export function validate(value, defaultValue) {
    return value == null ? defaultValue : value;
}

export function roundRect(ctx, { x, y, width, height, radius = 5, fill = true, stroke = true }) {
    if (typeof radius === "number") {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
        const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (const side of Object.keys(defaultRadius)) {
            radius[side] = radius[side] || defaultRadius[side];
        }
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

function getOrCreateNotifElem(parentElem, messageClass, message, timeout) {
    let notifElem = document.getElementById("mouse-notification");
    if (notifElem) {
        clearTimeout(timeout);
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

function computeAlignedLeft(align, targetWidth, popupWidth, margin) {
    if (align.includes("right")) {
        return targetWidth - (popupWidth + margin);
    }
    if (align.includes("center")) {
        return targetWidth / 2 - (popupWidth + margin) / 2;
    }
    return margin;
}

function computeAlignedTop(align, targetHeight, popupHeight, margin) {
    if (align.includes("bottom")) {
        return targetHeight - (popupHeight + margin);
    }
    if (align.includes("middle")) {
        return targetHeight / 2 - (popupHeight + margin) / 2;
    }
    return margin;
}

export const mouseNotification = {
    enabled: true,
    elem: null,
    timeout: null,
    show: function (target, x, y, message, delay, messageClass, align, margin) {
        if (!this.enabled) {
            return false;
        }

        if (!this.elem) {
            this.elem = document.getElementById("mouseNotification");
        }

        messageClass = messageClass || "mouseNotification-box";
        margin = margin || 10;

        getOrCreateNotifElem(this.elem, messageClass, message, this.timeout);
        this.timeout = setTimeout(function () {
            document.getElementById("mouse-notification")?.remove();
        }, delay || 1000);

        let popupRect = this.elem.getBoundingClientRect();
        const targetEl = target instanceof Element ? target : document.querySelector(target);
        const targetRect = targetEl.getBoundingClientRect();

        // reposition the notification
        if (align == null) {
            this.elem.style.left = `${(x || 0) - targetRect.left + margin}px`;
            this.elem.style.top = `${(y || 0) - targetRect.top + margin}px`;
        } else {
            const left = computeAlignedLeft(align, targetRect.width, popupRect.width, margin);
            const top = computeAlignedTop(align, targetRect.height, popupRect.height, margin);
            this.elem.style.left = `${left}px`;
            this.elem.style.top = `${top}px`;
        }

        // now re-position the box if it goes out of the target element
        popupRect = this.elem.getBoundingClientRect();
        if (popupRect.right > targetRect.right - margin) {
            this.elem.style.left = `${targetRect.right - popupRect.width - margin}px`;
        }

        return true;
    },
};

export function firmwareGreaterOrEqual(sysConfig, bf_version, cf_version) {
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

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function triggerDownload(blob, filename) {
    const a = document.createElement("a");
    a.download = filename;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
}
