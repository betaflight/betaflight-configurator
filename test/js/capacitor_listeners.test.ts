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
import { registerListeners } from "../../src/js/protocols/capacitorListeners";

const handle = () => ({ remove: vi.fn(async () => undefined) });

afterEach(() => {
    vi.restoreAllMocks();
});

describe("registerListeners", () => {
    it("resolves and removes nothing when every registration succeeds", async () => {
        const handles = [handle(), handle()];

        await expect(registerListeners(handles.map((h) => Promise.resolve(h)))).resolves.toBeUndefined();

        for (const h of handles) {
            expect(h.remove).not.toHaveBeenCalled();
        }
    });

    it("removes the listeners that did register and rethrows the failure", async () => {
        const kept = [handle(), handle()];
        const failure = new Error("bridge not ready");

        await expect(
            registerListeners([Promise.resolve(kept[0]), Promise.reject(failure), Promise.resolve(kept[1])]),
        ).rejects.toBe(failure);

        for (const h of kept) {
            expect(h.remove).toHaveBeenCalledTimes(1);
        }
    });

    it("still reports the registration failure when a removal fails too", async () => {
        const stuck = { remove: vi.fn(async () => Promise.reject(new Error("gone"))) };
        const failure = new Error("bridge not ready");
        const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(registerListeners([Promise.resolve(stuck), Promise.reject(failure)])).rejects.toBe(failure);

        expect(warned).toHaveBeenCalled();
    });
});
