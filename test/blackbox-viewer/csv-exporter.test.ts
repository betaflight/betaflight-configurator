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
import { CsvExporter } from "../../src/blackbox-viewer/csv-exporter";

/** Stands in for Worker: records the script URL and posted request, and lets a test answer. */
class FakeWorker {
    static instances: FakeWorker[] = [];
    url: string;
    posted: unknown[] = [];
    terminated = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessageerror: ((event: Event) => void) | null = null;

    constructor(url: URL) {
        this.url = url.pathname;
        FakeWorker.instances.push(this);
    }

    postMessage(message: unknown) {
        this.posted.push(message);
    }

    terminate() {
        this.terminated = true;
    }
}

const flightLog = {
    getChunksInTimeRange: vi.fn(() => [{ frames: [[0, 1]] }, { frames: [[125, 2]] }]),
    getMinTime: () => 0,
    getMaxTime: () => 125,
    getSysConfig: () => ({ looptime: 125 }),
    getMainFieldNames: () => ["time", "gyroADC[0]"],
};

describe("CsvExporter", () => {
    beforeEach(() => {
        FakeWorker.instances = [];
        vi.stubGlobal("Worker", FakeWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends the log's frames to the CSV worker, with the default format", () => {
        CsvExporter(flightLog).dump(() => {});

        const [worker] = FakeWorker.instances;
        expect(worker.url).toMatch(/\/webworkers\/csv-export-worker\.ts$/);
        expect(flightLog.getChunksInTimeRange).toHaveBeenCalledWith(0, 125);
        expect(worker.posted).toEqual([
            {
                sysConfig: { looptime: 125 },
                fieldNames: ["time", "gyroADC[0]"],
                frames: [[[0, 1]], [[125, 2]]],
                opts: { columnDelimiter: ",", stringDelimiter: '"', quoteStrings: true },
            },
        ]);
    });

    it("lets options override the defaults one by one", () => {
        CsvExporter(flightLog, { columnDelimiter: ";", quoteStrings: false }).dump(() => {});

        expect(FakeWorker.instances[0].posted[0]).toMatchObject({
            opts: { columnDelimiter: ";", stringDelimiter: '"', quoteStrings: false },
        });
    });

    it("hands the CSV to the callback and stops the worker", () => {
        const success = vi.fn();
        CsvExporter(flightLog).dump(success);
        const [worker] = FakeWorker.instances;

        worker.onmessage?.({ data: "time\n0" });

        expect(success).toHaveBeenCalledWith("time\n0");
        expect(worker.terminated).toBe(true);
    });

    it.each(["onerror", "onmessageerror"] as const)(
        "reports %s to the failure callback and stops the worker",
        (handler) => {
            const failure = vi.fn();
            CsvExporter(flightLog).dump(() => {}, failure);
            const [worker] = FakeWorker.instances;
            const event = new Event("error");

            worker[handler]?.(event);

            expect(failure).toHaveBeenCalledWith(event);
            expect(worker.terminated).toBe(true);
        },
    );
});
