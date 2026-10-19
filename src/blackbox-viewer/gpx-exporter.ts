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

/** What the export reads from a FlightLog (flightlog.js is still JavaScript). */
interface ExportableFlightLog {
    getChunksInTimeRange(startTime: number, endTime: number): Array<{ frames: number[][] }>;
    getMinTime(): number;
    getMaxTime(): number;
    getSysConfig(): Record<string, unknown>;
    getMainFieldNames(): string[];
}

/**
 * @param flightLog the log whose GPS track to export
 */
export function GpxExporter(flightLog: ExportableFlightLog) {
    /**
     * @param success is a callback triggered when export is done
     */
    function dump(success: (gpx: string) => void): void {
        const frames = flightLog
                .getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())
                .map((chunk) => chunk.frames),
            worker = new Worker(new URL("../js/webworkers/gpx-export-worker.ts", import.meta.url));

        worker.onmessage = (event: MessageEvent<string>) => {
            success(event.data);
            worker.terminate();
        };
        worker.postMessage({
            sysConfig: flightLog.getSysConfig(),
            fieldNames: flightLog.getMainFieldNames(),
            frames: frames,
        });
    }

    // exposed functions
    return {
        dump: dump,
    };
}
