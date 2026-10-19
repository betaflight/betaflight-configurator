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
import { mirrorTheme } from "../../src/components/tabs/receiver-msp/themeMirror";

/** MutationObserver callbacks run as a microtask. */
const flushMutations = () => Promise.resolve();

describe("mirrorTheme", () => {
    let source: Document;
    let target: Document;
    let stop: () => void;

    beforeEach(() => {
        source = document.implementation.createHTMLDocument("opener");
        target = document.implementation.createHTMLDocument("popup");
    });

    afterEach(() => {
        stop?.();
    });

    it("copies the current dark mode and colour theme straight away", () => {
        source.documentElement.classList.add("dark");
        source.body.dataset.theme = "amber";

        stop = mirrorTheme(source, target);

        expect(target.documentElement.classList.contains("dark")).toBe(true);
        expect(target.body.dataset.theme).toBe("amber");
    });

    it("follows dark mode being switched on and off", async () => {
        stop = mirrorTheme(source, target);
        expect(target.documentElement.classList.contains("dark")).toBe(false);

        source.documentElement.classList.add("dark");
        await flushMutations();
        expect(target.documentElement.classList.contains("dark")).toBe(true);

        source.documentElement.classList.remove("dark");
        await flushMutations();
        expect(target.documentElement.classList.contains("dark")).toBe(false);
    });

    it("follows the colour theme, including it being cleared", async () => {
        stop = mirrorTheme(source, target);

        source.body.dataset.theme = "contrast";
        await flushMutations();
        expect(target.body.dataset.theme).toBe("contrast");

        delete source.body.dataset.theme;
        await flushMutations();
        expect(target.body.dataset.theme).toBeUndefined();
    });

    it("leaves the popup's own classes alone", async () => {
        target.documentElement.classList.add("popup-only");
        stop = mirrorTheme(source, target);

        source.documentElement.classList.add("dark");
        await flushMutations();

        expect(target.documentElement.classList.contains("popup-only")).toBe(true);
    });

    it("stops following once stopped", async () => {
        stop = mirrorTheme(source, target);
        stop();

        source.documentElement.classList.add("dark");
        source.body.dataset.theme = "amber";
        await flushMutations();

        expect(target.documentElement.classList.contains("dark")).toBe(false);
        expect(target.body.dataset.theme).toBeUndefined();
    });
});
