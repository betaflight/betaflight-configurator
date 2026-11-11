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
import BFClipboard from "../../src/js/Clipboard";

function stubClipboard(writeText: (text: string) => Promise<void>) {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(writeText) } });
    return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

describe("BFClipboard.writeText", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("writes the text and reports it to onSuccess", async () => {
        const write = stubClipboard(() => Promise.resolve());
        const onSuccess = vi.fn();
        const onError = vi.fn();

        BFClipboard.writeText("dump", onSuccess, onError);

        await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith("dump"));
        expect(write).toHaveBeenCalledWith("dump");
        expect(onError).not.toHaveBeenCalled();
    });

    it("passes the rejection to onError", async () => {
        const reason = new Error("denied");
        stubClipboard(() => Promise.reject(reason));
        const onSuccess = vi.fn();
        const onError = vi.fn();

        BFClipboard.writeText("dump", onSuccess, onError);

        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(reason));
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("works without callbacks", async () => {
        const write = stubClipboard(() => Promise.resolve());

        expect(() => BFClipboard.writeText("dump")).not.toThrow();
        await vi.waitFor(() => expect(write).toHaveBeenCalledWith("dump"));
    });
});
