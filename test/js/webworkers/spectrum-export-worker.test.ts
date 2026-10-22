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

// The worker assigns self.onmessage and answers through self.postMessage. Under jsdom `self` is
// the window, so the test loads the file fresh, sends it a request and reads what it posts.
async function runWorker(data: unknown): Promise<string> {
    vi.resetModules();
    await import("../../../src/js/webworkers/spectrum-export-worker");
    const handler = (self as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage;
    handler({ data });
    return vi.mocked(self.postMessage).mock.lastCall?.[0] as string;
}

describe("spectrum-export-worker", () => {
    beforeEach(() => {
        vi.spyOn(self, "postMessage").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("spreads the bins evenly from 0 Hz to half the log rate, one row each", async () => {
        const csv = await runWorker({
            fftOutput: Float64Array.from([0.5, 2, 0.25, 1]),
            blackBoxRate: 2000,
            opts: { columnDelimiter: ";" },
        });

        expect(csv).toBe("x;y\n0;0.5\n250;2\n500;0.25\n750;1\n");
    });
});
