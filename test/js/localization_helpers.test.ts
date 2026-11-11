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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../src/js/localization";

// i18next is replaced so the tests see exactly what getMessage() and addResources() hand it.
const { t, addResourceBundle, options } = vi.hoisted(() => ({
    t: vi.fn((key: string, _options?: unknown) => key),
    addResourceBundle: vi.fn(),
    options: {} as Record<string, unknown>,
}));
vi.mock("i18next", () => ({ default: { t, addResourceBundle, options } }));

describe("i18n.getMessage", () => {
    beforeEach(() => {
        t.mockClear();
    });

    it("passes no options when there are no parameters", () => {
        i18n.getMessage("key");
        expect(t).toHaveBeenCalledWith("key", undefined);
    });

    it("passes an interpolation object through unchanged", () => {
        const parameters = { value: 3 };
        i18n.getMessage("key", parameters);
        expect(t.mock.calls[0][1]).toBe(parameters);
    });

    it("maps an array onto the positional {{1}}, {{2}}, ... names", () => {
        i18n.getMessage("key", ["a", 2]);
        expect(t).toHaveBeenCalledWith("key", { 1: "a", 2: 2 });
    });

    it.each([
        ["a string", "x"],
        ["a number", 7],
    ])("treats %s as the single positional parameter", (_label, parameter) => {
        i18n.getMessage("key", parameter);
        expect(t).toHaveBeenCalledWith("key", { 1: parameter });
    });

    it("returns what i18next returns", () => {
        t.mockReturnValueOnce("translated");
        expect(i18n.getMessage("key")).toBe("translated");
    });
});

describe("i18n.parseInputFile", () => {
    it("rewrites Chrome placeholders and nesting, and flattens .message", () => {
        const data = JSON.stringify({
            a: { message: "Hello $1 and $2", description: "ignored" },
            b: { message: "See $t(a.message)" },
        });
        expect(i18n.parseInputFile(data)).toEqual({ a: "Hello {{1}} and {{2}}", b: "See $t(a)" });
    });
});

describe("i18n.addResources", () => {
    it("adds the bundle to the first fallback language and default namespace", () => {
        options.fallbackLng = { default: ["en", "de"] };
        options.defaultNS = ["messages", "other"];
        i18n.addResources({ detectedLanguage: "English" });
        expect(addResourceBundle).toHaveBeenCalledWith("en", "messages", { detectedLanguage: "English" }, true, true);
    });
});
