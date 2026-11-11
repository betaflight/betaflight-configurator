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
import { GpxExporter } from "../../src/blackbox-viewer/gpx-exporter";
import type { SysConfig } from "../../src/blackbox-viewer/flightlog_parser";
import { chunksOf } from "./fakeChunks";
import { FakeWorker } from "./fakeWorker";

const flightLog = {
    getChunksInTimeRange: vi.fn(() => chunksOf([[0, 1]], [[125, 2]])),
    getMinTime: () => 0,
    getMaxTime: () => 125,
    getSysConfig: () => ({ "Log start datetime": "2024-01-02T03:04:05.000Z" }) as SysConfig,
    getMainFieldNames: () => ["time", "GPS_coord[0]"],
};

describe("GpxExporter", () => {
    beforeEach(() => {
        FakeWorker.instances.length = 0;
        vi.stubGlobal("Worker", FakeWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends the log's frames to the GPX worker", () => {
        GpxExporter(flightLog).dump(() => {});

        const [worker] = FakeWorker.instances;
        expect(worker.url).toMatch(/\/webworkers\/gpx-export-worker\.ts$/);
        expect(flightLog.getChunksInTimeRange).toHaveBeenCalledWith(0, 125);
        expect(worker.posted).toEqual([
            {
                sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
                fieldNames: ["time", "GPS_coord[0]"],
                frames: [[[0, 1]], [[125, 2]]],
            },
        ]);
    });

    it("hands the track to the callback and stops the worker", () => {
        const success = vi.fn();
        GpxExporter(flightLog).dump(success);
        const [worker] = FakeWorker.instances;

        worker.onmessage?.({ data: "<gpx/>" });

        expect(success).toHaveBeenCalledWith("<gpx/>");
        expect(worker.terminated).toBe(true);
    });

    it.each(["onerror", "onmessageerror"] as const)(
        "reports %s to the failure callback and stops the worker",
        (handler) => {
            const failure = vi.fn();
            GpxExporter(flightLog).dump(() => {}, failure);
            const [worker] = FakeWorker.instances;
            const event = new Event("error");

            worker[handler]?.(event);

            expect(failure).toHaveBeenCalledWith(event);
            expect(worker.terminated).toBe(true);
        },
    );
});
