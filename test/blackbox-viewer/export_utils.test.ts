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

const { fileSystem } = vi.hoisted(() => ({
    fileSystem: {
        pickSaveFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

vi.mock("../../src/js/FileSystem", () => ({ default: fileSystem }));

import { exportGpx, exportSpectrumToCsv } from "../../src/blackbox-viewer/export_utils";
import { SpectrumExporter } from "../../src/blackbox-viewer/spectrum-exporter";
import type { SysConfig } from "../../src/blackbox-viewer/flightlog_parser";
import { chunksOf } from "./fakeChunks";
import { FakeWorker } from "./fakeWorker";

const flightLog = {
    getChunksInTimeRange: () => chunksOf([[0, 1]]),
    getMinTime: () => 0,
    getMaxTime: () => 125,
    getSysConfig: () => ({}) as SysConfig,
    getMainFieldNames: () => ["time"],
};

const picked = { name: "LOG.gpx", _download: true };

/** Starts a GPX export and waits until it has handed the frames to the worker. */
async function startGpxExport() {
    let settled = false;
    const done = exportGpx(flightLog, "LOG.BBL").then(() => {
        settled = true;
    });
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    return { worker: FakeWorker.instances[0], done, isSettled: () => settled };
}

describe("exportGpx", () => {
    beforeEach(() => {
        FakeWorker.instances.length = 0;
        vi.stubGlobal("Worker", FakeWorker);
        fileSystem.pickSaveFile.mockResolvedValue(picked);
        fileSystem.writeFile.mockResolvedValue(undefined);
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        fileSystem.pickSaveFile.mockReset();
        fileSystem.writeFile.mockReset();
    });

    it("saves the track the worker returns to the picked file", async () => {
        const { worker, done } = await startGpxExport();

        worker.onmessage?.({ data: "<gpx/>" });
        await done;

        expect(fileSystem.pickSaveFile).toHaveBeenCalledWith("LOG.gpx", "GPX file", ".gpx", "blackbox-export-file");
        expect(fileSystem.writeFile).toHaveBeenCalledWith(picked, "<gpx/>");
    });

    // A log without a "Log start datetime" header makes the worker throw. The export used
    // to wait for the worker forever: nothing listened for its error.
    it.each(["onerror", "onmessageerror"] as const)(
        "finishes without saving when the worker reports %s",
        async (handler) => {
            const { worker, done, isSettled } = await startGpxExport();

            worker[handler]?.(new Event("error"));
            await vi.waitFor(() => expect(isSettled()).toBe(true));
            await done;

            expect(worker.terminated).toBe(true);
            expect(fileSystem.writeFile).not.toHaveBeenCalled();
        },
    );
});

describe("exportSpectrumToCsv", () => {
    const fftData = { fftOutput: Float64Array.from([1, 2]), blackBoxRate: 4000 };
    // What FlightLogAnalyser.exportSpectrumToCSV does with the callbacks it is given.
    const analyser = {
        getExportedFileName: () => "LOG_psd",
        exportSpectrumToCSV: vi.fn(
            (
                onSuccess: (csv: string) => void,
                options: Parameters<typeof SpectrumExporter>[1],
                onFailure: (error: unknown) => void,
            ) => SpectrumExporter(fftData, options).dump(onSuccess, onFailure),
        ),
    };

    beforeEach(() => {
        FakeWorker.instances.length = 0;
        vi.stubGlobal("Worker", FakeWorker);
        fileSystem.pickSaveFile.mockResolvedValue({ name: "LOG_psd.csv", _download: true });
        fileSystem.writeFile.mockResolvedValue(undefined);
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        fileSystem.pickSaveFile.mockReset();
        fileSystem.writeFile.mockReset();
    });

    async function startSpectrumExport() {
        let settled = false;
        const done = exportSpectrumToCsv(analyser, "LOG.BBL")!.then(() => {
            settled = true;
        });
        await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
        return { worker: FakeWorker.instances[0], done, isSettled: () => settled };
    }

    it("saves the CSV the worker returns", async () => {
        const { worker, done } = await startSpectrumExport();

        worker.onmessage?.({ data: "x,y\n" });
        await done;

        expect(fileSystem.pickSaveFile).toHaveBeenCalledWith("LOG_psd.csv", "CSV file", ".csv", "blackbox-export-file");
        expect(fileSystem.writeFile).toHaveBeenCalledWith({ name: "LOG_psd.csv", _download: true }, "x,y\n");
    });

    // The spectrum export dropped the failure callback, so a failing worker left it waiting forever.
    it.each(["onerror", "onmessageerror"] as const)(
        "finishes without saving when the worker reports %s",
        async (handler) => {
            const { worker, done, isSettled } = await startSpectrumExport();

            worker[handler]?.(new Event("error"));
            await vi.waitFor(() => expect(isSettled()).toBe(true));
            await done;

            expect(worker.terminated).toBe(true);
            expect(fileSystem.writeFile).not.toHaveBeenCalled();
        },
    );
});
