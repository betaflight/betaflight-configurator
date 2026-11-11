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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUiScale, loadUiScale, sanitizeUiScale } from "../../src/js/UiScale";

describe("UI scale", () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.style.removeProperty("--ui-scale");
    });

    afterEach(() => {
        localStorage.clear();
        document.body.style.removeProperty("--ui-scale");
    });

    it.each<[unknown, number]>([
        [0.96, 0.96],
        ["1.25", 1.25],
        [0.5, 0.5],
        [1.5, 1.5],
        [0.25, 0.5],
        [2, 1.5],
        [null, 0.5],
        ["", 0.5],
        [undefined, 1],
        ["invalid", 1],
        [NaN, 1],
        [Infinity, 1],
        [-Infinity, 1],
    ])("normalizes %s to %s", (input, expected) => {
        expect(sanitizeUiScale(input)).toBe(expected);
    });

    it("applies the normalized scale to the CSS property", () => {
        expect(applyUiScale("2")).toBe(1.5);
        expect(document.body.style.getPropertyValue("--ui-scale")).toBe("1.5");
    });

    it.each<[unknown, string]>([
        [0.9, "0.9"],
        ["1.25", "1.25"],
        [2, "1.5"],
        [null, "1"],
        ["invalid", "1"],
    ])("loads a stored scale of %s as %s without changing storage", (stored, expected) => {
        const record = JSON.stringify({ uiScale: stored });
        localStorage.setItem("uiScale", record);

        expect(loadUiScale()).toBeUndefined();
        expect(document.body.style.getPropertyValue("--ui-scale")).toBe(expected);
        expect(localStorage.getItem("uiScale")).toBe(record);
    });

    it("uses 100% when there is no stored scale", () => {
        loadUiScale();
        expect(document.body.style.getPropertyValue("--ui-scale")).toBe("1");
        expect(localStorage.getItem("uiScale")).toBeNull();
    });
});
