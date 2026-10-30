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

import { describe, expect, it } from "vitest";
import {
    addArrayElement,
    addArrayElementAfter,
    addArrayElementBefore,
    addArrayElementsAfter,
    removeArrayElement,
    replaceArrayElement,
} from "../../../src/js/utils/array";

describe("removeArrayElement", () => {
    it("removes the element at the first and at a later position", () => {
        const elements = ["a", "b", "c"];
        removeArrayElement(elements, "a");
        removeArrayElement(elements, "c");
        expect(elements).toEqual(["b"]);
    });

    it("leaves the array alone when the element is missing", () => {
        const elements = ["a", "b"];
        removeArrayElement(elements, "x");
        expect(elements).toEqual(["a", "b"]);
    });
});

describe("addArrayElementAfter", () => {
    it("inserts after the anchor", () => {
        const elements = ["a", "b", "c"];
        addArrayElementAfter(elements, "a", "x");
        expect(elements).toEqual(["a", "x", "b", "c"]);
    });

    it("does not add an element that is already present", () => {
        const elements = ["a", "x", "b"];
        addArrayElementAfter(elements, "b", "x");
        expect(elements).toEqual(["a", "x", "b"]);
    });

    it("inserts at the start when the anchor is missing", () => {
        const elements = ["a", "b"];
        addArrayElementAfter(elements, "missing", "x");
        expect(elements).toEqual(["x", "a", "b"]);
    });
});

describe("addArrayElementsAfter", () => {
    it("inserts the new elements in order after the anchor, skipping ones already present", () => {
        const elements = ["a", "b", "c"];
        addArrayElementsAfter(elements, "b", ["x", "a", "y"]);
        expect(elements).toEqual(["a", "b", "x", "y", "c"]);
    });

    it("does nothing when the anchor is missing", () => {
        const elements = ["a", "b"];
        addArrayElementsAfter(elements, "missing", ["x"]);
        expect(elements).toEqual(["a", "b"]);
    });
});

describe("addArrayElementBefore", () => {
    it("inserts before the anchor", () => {
        const elements = ["a", "b", "c"];
        addArrayElementBefore(elements, "c", "x");
        expect(elements).toEqual(["a", "b", "x", "c"]);
    });

    it("does not add an element that is already present", () => {
        const elements = ["a", "x", "b"];
        addArrayElementBefore(elements, "a", "x");
        expect(elements).toEqual(["a", "x", "b"]);
    });
});

describe("addArrayElement", () => {
    it("appends a new element once", () => {
        const elements = ["a"];
        addArrayElement(elements, "b");
        addArrayElement(elements, "b");
        expect(elements).toEqual(["a", "b"]);
    });
});

describe("replaceArrayElement", () => {
    it("replaces the element in place", () => {
        const elements = ["a", "b", "c"];
        replaceArrayElement(elements, "a", "x");
        replaceArrayElement(elements, "c", "z");
        expect(elements).toEqual(["x", "b", "z"]);
    });

    it("leaves the array alone when the element is missing", () => {
        const elements = ["a", "b"];
        replaceArrayElement(elements, "x", "y");
        expect(elements).toEqual(["a", "b"]);
    });
});
