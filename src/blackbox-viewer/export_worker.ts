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

import type { FlightLog, LogFrame } from "./flightlog";

/** What the CSV and GPX exports read from a FlightLog. */
export type ExportableFlightLog = Pick<
    FlightLog,
    "getChunksInTimeRange" | "getMinTime" | "getMaxTime" | "getSysConfig" | "getMainFieldNames"
>;

/** The whole log's frames, chunk by chunk, as the export workers take them. */
export function logFrames(flightLog: ExportableFlightLog): LogFrame[][] {
    return flightLog.getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime()).map((chunk) => chunk.frames);
}

/**
 * Runs one export on `worker`: posts `request`, hands the worker's answer to `success`, and
 * stops the worker once it answers or fails. The caller creates the worker, because Vite only
 * bundles a worker written as `new Worker(new URL("...", import.meta.url))` where it is used.
 */
export function runExportWorker(
    worker: Worker,
    request: unknown,
    success: (result: string) => void,
    failure: (event: Event) => void = () => {},
): void {
    worker.onmessage = (event: MessageEvent<string>) => {
        success(event.data);
        worker.terminate();
    };
    worker.onerror = (event) => {
        worker.terminate();
        failure(event);
    };
    worker.onmessageerror = (event) => {
        worker.terminate();
        failure(event);
    };
    worker.postMessage(request);
}
