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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    asciiArrayToString,
    asciiStringToByteArray,
    binarySearchOrNext,
    binarySearchOrPrevious,
    constrain,
    escapeRegExp,
    firmwareGreaterOrEqual,
    formatTime,
    hexToFloat,
    leftPad,
    mouseNotification,
    parseCommaSeparatedString,
    roundRect,
    signExtend14Bit,
    stringHasComma,
    stringLoopTime,
    stringTimetoMsec,
    uint32ToFloat,
    validate,
} from "../../src/blackbox-viewer/tools";
import { FIRMWARE_TYPE_BETAFLIGHT, FIRMWARE_TYPE_CLEANFLIGHT } from "../../src/blackbox-viewer/flightlog_fielddefs";

describe("blackbox tools: header values", () => {
    it("reads a 32-bit float from hex and from its bit pattern", () => {
        expect(hexToFloat("3f800000")).toBe(1);
        expect(uint32ToFloat(0xbf800000)).toBe(-1);
        // A negative int32 is the same bit pattern once stored in a Uint32Array.
        expect(uint32ToFloat(0xbf800000 | 0)).toBe(-1);
    });

    it("converts between ASCII strings and bytes", () => {
        expect(asciiStringToByteArray("H P:")).toEqual([72, 32, 80, 58]);
        expect(asciiArrayToString(new Uint8Array([72, 32, 80, 58]))).toBe("H P:");
    });

    it("sign-extends 14-bit values", () => {
        expect(signExtend14Bit(0x1fff)).toBe(0x1fff);
        expect(signExtend14Bit(0x2000)).toBe(-0x2000);
        expect(signExtend14Bit(0x3fff)).toBe(-1);
    });

    it("parses a single value as a number, or keeps the text", () => {
        expect(stringHasComma("1,2")).toBe(true);
        expect(stringHasComma("12")).toBe(false);
        expect(parseCommaSeparatedString("42")).toBe(42);
        expect(parseCommaSeparatedString("1.5")).toBe(1.5);
        expect(parseCommaSeparatedString("ON")).toBe("ON");
    });

    it("parses a list, padding with null or truncating to a forced length", () => {
        expect(parseCommaSeparatedString("1,2.5,x")).toEqual([1, 2.5, "x"]);
        expect(parseCommaSeparatedString("1,2", 4)).toEqual([1, 2, null, null]);
        expect(parseCommaSeparatedString("1,2,3,4", 3)).toEqual([1, 2, 3]);
    });

    // A list item starting with "." is parsed with parseInt, which gives NaN, so it stays text.
    // Pinned as found, not endorsed: the check was presumably meant as includes(".").
    it("keeps a list item that starts with a dot as text", () => {
        expect(parseCommaSeparatedString("1,.5")).toEqual([1, ".5"]);
    });
});

describe("blackbox tools: binary search", () => {
    const times = [10, 20, 30, 40];

    it("finds an exact match either way", () => {
        expect(binarySearchOrPrevious(times, 30)).toBe(2);
        expect(binarySearchOrNext(times, 30)).toBe(2);
    });

    it("falls back to the neighbour on the requested side", () => {
        expect(binarySearchOrPrevious(times, 25)).toBe(1);
        expect(binarySearchOrNext(times, 25)).toBe(2);
    });

    it("clamps to the ends", () => {
        expect(binarySearchOrPrevious(times, 5)).toBe(0);
        expect(binarySearchOrPrevious(times, 99)).toBe(3);
        expect(binarySearchOrNext(times, 5)).toBe(0);
        expect(binarySearchOrNext(times, 99)).toBe(3);
    });
});

describe("blackbox tools: formatting", () => {
    it("left-pads to a minimum length", () => {
        expect(leftPad(7, "0", 3)).toBe("007");
        expect(leftPad("1234", "0", 3)).toBe("1234");
    });

    it("formats milliseconds as [HH:]MM:SS[.mmm], negative times included", () => {
        expect(formatTime(61_234)).toBe("01:01");
        expect(formatTime(61_234, true)).toBe("01:01.234");
        expect(formatTime(3_723_004, true)).toBe("01:02:03.004");
        expect(formatTime(-1_500, true)).toBe("-00:01.500");
    });

    it("describes the loop time with as much as the header gives", () => {
        expect(stringLoopTime(null, 2, 0, 8000)).toBe("");
        expect(stringLoopTime(125, null, null, null)).toBe("125μS (8kHz)");
        expect(stringLoopTime(125, 2, null, null)).toBe("125μS (8kHz/4kHz)");
        expect(stringLoopTime(125, 2, 0, 8000)).toBe("125μS (8kHz/4kHz/SYNCED)");
        expect(stringLoopTime(125, 2, 1, 8000)).toBe("125μS (8kHz/4kHz/8kHz)");
        expect(stringLoopTime(125, 2, 1, null)).toBe("125μS (8kHz/4kHzUNSYNCED)");
    });

    it("escapes every regex metacharacter", () => {
        const name = "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o";
        expect(new RegExp(`^${escapeRegExp(name)}$`).test(name)).toBe(true);
        expect(escapeRegExp("x.y")).toBe(String.raw`x\.y`);
    });
});

describe("stringTimetoMsec", () => {
    it("reads seconds, with up to three decimals", () => {
        expect(stringTimetoMsec("12")).toBe(12_000_000);
        expect(stringTimetoMsec("1.5")).toBe(1_500_000);
        expect(stringTimetoMsec("1.25")).toBe(1_250_000);
    });

    it("reads MM:SS.sss", () => {
        expect(stringTimetoMsec("2:03.4")).toBe(123_400_000);
        expect(stringTimetoMsec("2:03")).toBe(123_000_000);
    });

    it("keeps the sign", () => {
        expect(stringTimetoMsec("-1.5")).toBe(-1_500_000);
    });

    it("gives 0 for text with no digits", () => {
        expect(stringTimetoMsec("abc")).toBe(0);
    });
});

describe("blackbox tools: numbers and firmware", () => {
    it("constrains to a range", () => {
        expect(constrain(5, 0, 3)).toBe(3);
        expect(constrain(-5, 0, 3)).toBe(0);
        expect(constrain(2, 0, 3)).toBe(2);
    });

    it("substitutes the default only for null and undefined", () => {
        expect(validate(null, 7)).toBe(7);
        expect(validate(undefined, 7)).toBe(7);
        expect(validate(0, 7)).toBe(0);
    });

    it("compares Betaflight against the first version and Cleanflight against the second", () => {
        const bf = { firmwareType: FIRMWARE_TYPE_BETAFLIGHT, firmwareVersion: "3.1.0" };
        const cf = { firmwareType: FIRMWARE_TYPE_CLEANFLIGHT, firmwareVersion: "2.0.0" };

        expect(firmwareGreaterOrEqual(bf, "3.1.0")).toBe(true);
        expect(firmwareGreaterOrEqual(bf, "3.1.1")).toBe(false);
        expect(firmwareGreaterOrEqual(cf, "3.1.0")).toBe(false);
        expect(firmwareGreaterOrEqual(cf, "3.1.0", "2.0.0")).toBe(true);
        expect(firmwareGreaterOrEqual(cf, "3.1.0", "2.0.1")).toBe(false);
        expect(firmwareGreaterOrEqual(bf, "3.1.0", "9.0.0")).toBe(true);
    });
});

describe("roundRect", () => {
    const fakeContext = () => {
        const calls: string[] = [];
        const ctx = new Proxy(
            {},
            {
                get:
                    (_target, name) =>
                    (...args: number[]) =>
                        calls.push(`${String(name)}(${args.join(",")})`),
            },
        );
        return { ctx: ctx as CanvasRenderingContext2D, calls };
    };

    it("uses one radius for every corner, and fills and strokes by default", () => {
        const { ctx, calls } = fakeContext();

        roundRect(ctx, { x: 0, y: 0, width: 20, height: 10, radius: 2 });

        expect(calls).toEqual([
            "beginPath()",
            "moveTo(2,0)",
            "lineTo(18,0)",
            "quadraticCurveTo(20,0,20,2)",
            "lineTo(20,8)",
            "quadraticCurveTo(20,10,18,10)",
            "lineTo(2,10)",
            "quadraticCurveTo(0,10,0,8)",
            "lineTo(0,2)",
            "quadraticCurveTo(0,0,2,0)",
            "closePath()",
            "fill()",
            "stroke()",
        ]);
    });

    it("squares any corner a per-corner radius leaves out, and can skip fill and stroke", () => {
        const { ctx, calls } = fakeContext();
        const radius = { tl: 3 };

        roundRect(ctx, { x: 0, y: 0, width: 20, height: 10, radius, fill: false, stroke: false });

        expect(calls[1]).toBe("moveTo(3,0)");
        expect(calls[2]).toBe("lineTo(20,0)");
        expect(calls.at(-1)).toBe("closePath()");
        expect(radius).toEqual({ tl: 3, tr: 0, br: 0, bl: 0 });
    });
});

describe("mouseNotification", () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
        mouseNotification.elem = null;
        mouseNotification.timeout = null;
        mouseNotification.enabled = true;
    });

    const mount = () => {
        document.body.innerHTML = '<div id="target"></div><div id="mouseNotification"></div>';
    };

    it("shows the message in the container, then removes it after the delay", () => {
        vi.useFakeTimers();
        mount();

        expect(mouseNotification.show("#target", "<b>hi</b>", { x: 0, y: 0, delay: 500 })).toBe(true);

        const note = document.getElementById("mouse-notification");
        expect(note?.parentElement?.id).toBe("mouseNotification");
        expect(note?.className).toBe("mouseNotification-box");
        expect(note?.innerHTML).toBe("<b>hi</b>");

        vi.advanceTimersByTime(499);
        expect(document.getElementById("mouse-notification")).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(document.getElementById("mouse-notification")).toBeNull();
    });

    it("reuses a visible notification and restarts its timer", () => {
        vi.useFakeTimers();
        mount();

        mouseNotification.show("#target", "first", { x: 0, y: 0, delay: 500, messageClass: "first-class" });
        vi.advanceTimersByTime(400);
        mouseNotification.show(document.getElementById("target"), "second", {
            x: 0,
            y: 0,
            delay: 500,
            messageClass: "second-class",
        });
        vi.advanceTimersByTime(400);

        const notes = document.querySelectorAll("#mouse-notification");
        expect(notes).toHaveLength(1);
        expect(notes[0].innerHTML).toBe("second");
        expect(notes[0].className).toBe("second-class");
        vi.advanceTimersByTime(100);
        expect(document.getElementById("mouse-notification")).toBeNull();
    });

    const rects = (target: Partial<DOMRect>, popup: Partial<DOMRect>) => {
        document.getElementById("target")!.getBoundingClientRect = () => target as DOMRect;
        document.getElementById("mouseNotification")!.getBoundingClientRect = () => popup as DOMRect;
    };

    it("places the container at the mouse position plus the margin", () => {
        mount();
        rects({ left: 10, top: 20, right: 500, width: 490, height: 300 }, { right: 0, width: 100, height: 50 });

        mouseNotification.show("#target", "hi", { x: 30, y: 40, delay: 500, margin: 5 });

        expect(mouseNotification.elem?.style.left).toBe("25px");
        expect(mouseNotification.elem?.style.top).toBe("25px");
    });

    it("aligns to a corner of the target instead of the mouse", () => {
        mount();
        rects({ left: 10, top: 20, right: 500, width: 490, height: 300 }, { right: 0, width: 100, height: 50 });

        mouseNotification.show("#target", "hi", { x: 30, y: 40, delay: 500, align: "bottom-right", margin: 0 });

        // A margin of 0 falls back to the default 10.
        expect(mouseNotification.elem?.style.left).toBe("380px");
        expect(mouseNotification.elem?.style.top).toBe("240px");
    });

    it("pulls the container back inside the target's right edge", () => {
        mount();
        rects({ left: 10, top: 20, right: 500, width: 490, height: 300 }, { right: 600, width: 100, height: 50 });

        mouseNotification.show("#target", "hi", { x: 30, y: 40, delay: 500, margin: 5 });

        expect(mouseNotification.elem?.style.left).toBe("395px");
    });

    it("does nothing while disabled", () => {
        mount();
        mouseNotification.enabled = false;

        expect(mouseNotification.show("#target", "hi", { x: 0, y: 0 })).toBe(false);
        expect(document.getElementById("mouse-notification")).toBeNull();
    });
});
