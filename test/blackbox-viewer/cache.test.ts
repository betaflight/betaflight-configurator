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
import { FIFOCache } from "../../src/blackbox-viewer/cache";

describe("blackbox FIFOCache", () => {
    it("keeps one entry beyond its capacity and drops the oldest after that", () => {
        const cache = new FIFOCache<number, string>(2);
        cache.add(1, "a");
        cache.add(2, "b");
        cache.add(3, "c");

        expect([cache.get(1), cache.get(2), cache.get(3)]).toEqual(["a", "b", "c"]);

        cache.add(4, "d");
        // get() bumped 1, then 2, then 3, so 1 was the oldest.
        expect(cache.get(1)).toBeUndefined();
        expect([cache.get(2), cache.get(3), cache.get(4)]).toEqual(["b", "c", "d"]);
    });

    it("counts a get() as use, so the entry read last survives", () => {
        const cache = new FIFOCache<number, string>(1);
        cache.add(1, "a");
        cache.add(2, "b");
        cache.get(1);

        cache.add(3, "c");

        expect(cache.get(1)).toBe("a");
        expect(cache.get(2)).toBeUndefined();
    });

    it("recycles the oldest entry only once the cache is over capacity", () => {
        const cache = new FIFOCache<number, string>(2);
        cache.add(1, "a");
        cache.add(2, "b");
        expect(cache.recycle()).toBeNull();

        cache.add(3, "c");
        expect(cache.recycle()).toBe("a");
        expect(cache.get(1)).toBeUndefined();
        expect(cache.recycle()).toBeNull();
    });

    it("overwrites an existing key and moves it to the newest position", () => {
        const cache = new FIFOCache<number, string>(1);
        cache.add(1, "a");
        cache.add(2, "b");
        cache.add(1, "a2");

        cache.add(3, "c");

        expect(cache.get(1)).toBe("a2");
        expect(cache.get(2)).toBeUndefined();
    });

    it("honours a capacity raised after construction", () => {
        const cache = new FIFOCache<number, string>(1);
        cache.capacity = 3;
        for (let i = 1; i <= 4; i++) {
            cache.add(i, String(i));
        }

        expect([1, 2, 3, 4].map((i) => cache.get(i))).toEqual(["1", "2", "3", "4"]);
    });

    it("forgets everything on clear()", () => {
        const cache = new FIFOCache<number, string>(2);
        cache.add(1, "a");
        cache.add(2, "b");
        cache.add(3, "c");

        cache.clear();

        expect(cache.get(1)).toBeUndefined();
        expect(cache.recycle()).toBeNull();
    });
});
