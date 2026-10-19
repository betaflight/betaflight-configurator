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

import { type ExportableFlightLog, logFrames, runExportWorker } from "./export_worker";

/** Mirrors CsvExportOptions in csv-export-worker.ts, which cannot export it. */
export interface CsvExportOptions {
    columnDelimiter: string;
    stringDelimiter: string;
    quoteStrings: boolean;
}

/**
 * @param flightLog the log to export
 * @param opts overrides of the default comma-separated, double-quoted format
 */
export function CsvExporter(flightLog: ExportableFlightLog, opts: Partial<CsvExportOptions> = {}) {
    const options: CsvExportOptions = {
        columnDelimiter: ",",
        stringDelimiter: '"',
        quoteStrings: true,
        ...opts,
    };

    /**
     * @param success is a callback triggered when export is done
     * @param failure is a callback triggered when the worker fails
     */
    function dump(success: (csv: string) => void, failure: (event: Event) => void = () => {}): void {
        const request = {
            sysConfig: flightLog.getSysConfig(),
            fieldNames: flightLog.getMainFieldNames(),
            frames: logFrames(flightLog),
            opts: options,
        };
        const worker = new Worker(new URL("../js/webworkers/csv-export-worker.ts", import.meta.url));
        runExportWorker(worker, request, success, failure);
    }

    // exposed functions
    return {
        dump: dump,
    };
}
