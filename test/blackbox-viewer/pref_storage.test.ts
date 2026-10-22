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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrefStorage } from "../../src/blackbox-viewer/pref_storage";

const read = (prefs: PrefStorage, name: string) => {
    let value: unknown = "never called";
    prefs.get(name, (v) => {
        value = v;
    });
    return value;
};

describe("PrefStorage", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("stores JSON in localStorage under the key prefix", () => {
        const prefs = new PrefStorage("bbv-");

        prefs.set("layout", { a: [1, 2] });

        expect(localStorage.getItem("bbv-layout")).toBe('{"a":[1,2]}');
        expect(read(prefs, "layout")).toEqual({ a: [1, 2] });
        expect(read(new PrefStorage(), "layout")).toBeNull();
    });

    it("reads a missing or unparsable value as null", () => {
        localStorage.setItem("broken", "{not json");
        const prefs = new PrefStorage();

        expect(read(prefs, "missing")).toBeNull();
        expect(read(prefs, "broken")).toBeNull();
    });

    it("falls back to memory when localStorage refuses writes", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("private mode");
        });
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const prefs = new PrefStorage();

        prefs.set("x", 5);

        expect(read(prefs, "x")).toBe(5);
        expect(read(prefs, "y")).toBeNull();
        expect(localStorage.getItem("x")).toBeNull();
    });

    it("uses chrome.storage.local where the Chrome Apps API exists", () => {
        const store: Record<string, unknown> = {};
        vi.stubGlobal("chrome", {
            storage: {
                local: {
                    get: (name: string, callback: (data: Record<string, unknown>) => void) =>
                        callback({ [name]: store[name] }),
                    set: (data: Record<string, unknown>) => Object.assign(store, data),
                },
            },
        });
        const prefs = new PrefStorage("p-");

        prefs.set("x", { v: 1 });

        expect(store).toEqual({ "p-x": { v: 1 } });
        expect(read(prefs, "x")).toEqual({ v: 1 });
        expect(localStorage.getItem("p-x")).toBeNull();
    });
});
