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

import FileSystem from "../js/FileSystem";
import { CsvExporter, type CsvExportOptions } from "./csv-exporter";
import { GpxExporter } from "./gpx-exporter";
import type { SpectrumExportOptions } from "./spectrum-exporter";

type ExportFormat = "csv" | "gpx";

/** What both exports read from a FlightLog (flightlog.js is still JavaScript). */
type ExportableFlightLog = Parameters<typeof CsvExporter>[0] & Parameters<typeof GpxExporter>[0];

/** What the spectrum export needs from the spectrum graph (graph_spectrum.js is still JavaScript). */
interface SpectrumAnalyser {
    getExportedFileName(): string | null | undefined;
    exportSpectrumToCSV(onSuccess: (csv: string) => void, options: Partial<SpectrumExportOptions>): void;
}

/** Starts an export; calls `onSuccess` with the file contents, or `onFailure` where supported. */
type DumpFn = (onSuccess: (data: string) => Promise<void>, onFailure: (error: unknown) => void) => void;

// NOTE: the blackbox-viewer subsystem is English-only for now, so the picker
// descriptions are plain strings rather than i18n keys.
const EXPORT_DESCRIPTIONS: Record<ExportFormat, string> = {
    csv: "CSV file",
    gpx: "GPX file",
};

function suggestedName(logFilename: string | null | undefined, fileExtension: ExportFormat): string {
    // Strip the source log extension (e.g. "FOO.BBL" -> "FOO") before appending
    // the export extension.
    const base = (logFilename || "log").replace(/\.[^/.]+$/, "");
    return `${base}.${fileExtension}`;
}

// Prompt the user for a save location (preserving the export button's user
// gesture), then run the async exporter and write the result through the shared
// FileSystem wrapper. `dumpFn` receives success/failure callbacks where supported.
// The returned promise only settles once the file has actually been written (or
// the export failed/was cancelled), so callers can reliably await completion.
async function saveExport(fileExtension: ExportFormat, suggested: string, dumpFn: DumpFn): Promise<void> {
    let file;
    try {
        file = await FileSystem.pickSaveFile(
            suggested,
            EXPORT_DESCRIPTIONS[fileExtension] || `${fileExtension.toUpperCase()} file`,
            `.${fileExtension}`,
            "blackbox-export-file",
        );
    } catch (error) {
        if ((error as Error | undefined)?.name === "AbortError") {
            return; // user cancelled the dialog
        }
        console.error(`Failed to open save dialog for ${fileExtension.toUpperCase()} export:`, error);
        return;
    }

    if (!file) {
        return;
    }

    const startTime = performance.now();
    await new Promise<void>((resolve) => {
        const onFailure = (error: unknown) => {
            console.error(`Failed to export ${fileExtension.toUpperCase()} file:`, error);
            resolve();
        };

        try {
            dumpFn(async (data) => {
                console.debug(
                    `${fileExtension.toUpperCase()} export finished in ${(performance.now() - startTime) / 1000} secs`,
                );
                if (!data) {
                    console.debug("Empty data, nothing to save");
                    resolve();
                    return;
                }
                try {
                    await FileSystem.writeFile(file, data);
                } catch (error) {
                    console.error(`Failed to write ${fileExtension.toUpperCase()} file:`, error);
                } finally {
                    resolve();
                }
            }, onFailure);
        } catch (error) {
            onFailure(error);
        }
    });
}

export function exportCsv(
    flightLog: ExportableFlightLog,
    logFilename: string | null | undefined,
    options: Partial<CsvExportOptions> = {},
) {
    return saveExport("csv", suggestedName(logFilename, "csv"), (onSuccess, onFailure) =>
        CsvExporter(flightLog, options).dump(onSuccess, onFailure),
    );
}

export function exportGpx(flightLog: ExportableFlightLog, logFilename: string | null | undefined) {
    return saveExport("gpx", suggestedName(logFilename, "gpx"), (onSuccess, onFailure) =>
        GpxExporter(flightLog).dump(onSuccess, onFailure),
    );
}

export function exportSpectrumToCsv(
    analyser: SpectrumAnalyser,
    logFilename: string | null | undefined,
    options: Partial<SpectrumExportOptions> = {},
) {
    const fileName = analyser.getExportedFileName();
    if (!fileName) {
        console.warn("The export is not supported for this spectrum type");
        return;
    }

    return saveExport("csv", `${fileName}.csv`, (onSuccess) => analyser.exportSpectrumToCSV(onSuccess, options));
}
