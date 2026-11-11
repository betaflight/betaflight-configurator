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
import { SpectrumExporter } from "../../src/blackbox-viewer/spectrum-exporter";
import { FakeWorker } from "./fakeWorker";

const fftData = { fftOutput: Float64Array.from([1, 2]), blackBoxRate: 4000 };

describe("SpectrumExporter", () => {
    beforeEach(() => {
        FakeWorker.instances.length = 0;
        vi.stubGlobal("Worker", FakeWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends the spectrum to the worker, with the default format", () => {
        SpectrumExporter(fftData).dump(() => {});

        const [worker] = FakeWorker.instances;
        expect(worker.url).toMatch(/\/webworkers\/spectrum-export-worker\.ts$/);
        expect(worker.posted).toEqual([
            {
                fftOutput: fftData.fftOutput,
                blackBoxRate: 4000,
                opts: { columnDelimiter: ",", quoteStrings: true },
            },
        ]);
    });

    it("lets options override the defaults", () => {
        SpectrumExporter(fftData, { columnDelimiter: "\t" }).dump(() => {});

        expect(FakeWorker.instances[0].posted[0]).toMatchObject({
            opts: { columnDelimiter: "\t", quoteStrings: true },
        });
    });

    it("hands the CSV to the callback and stops the worker", () => {
        const success = vi.fn();
        SpectrumExporter(fftData).dump(success);
        const [worker] = FakeWorker.instances;

        worker.onmessage?.({ data: "x,y\n" });

        expect(success).toHaveBeenCalledWith("x,y\n");
        expect(worker.terminated).toBe(true);
    });

    it.each(["onerror", "onmessageerror"] as const)(
        "reports %s to the failure callback and stops the worker",
        (handler) => {
            const success = vi.fn();
            const failure = vi.fn();
            SpectrumExporter(fftData).dump(success, failure);
            const [worker] = FakeWorker.instances;
            const event = new Event("error");

            worker[handler]?.(event);

            expect(failure).toHaveBeenCalledWith(event);
            expect(success).not.toHaveBeenCalled();
            expect(worker.terminated).toBe(true);
        },
    );
});
