import { mixerList } from "../model";
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

export function urlExists(url) {
    let http = new XMLHttpRequest();

    http.open("HEAD", url, false);
    http.send();
    return http.status !== 404;
}

/**
 * Returns jquery sorted option list with optional value staying on top of the list.
 *
 * @param {string} optional value staying on top of the list.
 * @return {object} sorted option list.
 */

$.fn.sortSelect = function () {
    /*

    Chrome v140 does not work with sortSelect function properly.
    Disabling it for now until a fix is found.

    this.each(function () {
        const select = this;
        // Collect option data
        const optionData = Array.from(select.options).map(opt => ({
            value: opt.value,
            text: opt.text,
            selected: opt.selected,
            disabled: opt.disabled,
        }));

        // Sort option data
        optionData.sort((a, b) => {
            if (a.text === text) { return -1; }
            if (b.text === text) { return 1; }
            return a.text.localeCompare(b.text, window.navigator.language, { ignorePunctuation: true });
        });

        // Remove all options
        while (select.options.length) { select.remove(0); }

        // Add sorted options
        optionData.forEach(opt => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.text = opt.text;
            option.selected = opt.selected;
            option.disabled = opt.disabled;
            select.add(option);
        });
    });

    */

    return this;
};
