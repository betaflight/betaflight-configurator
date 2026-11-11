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

/*
 * Builds the CSV text of a log export, off the main thread (blackbox-viewer/csv-exporter.ts).
 *
 * This file must not import or export anything. Vite serves it as a classic worker in
 * development, and TypeScript compiles even a type-only import or export to `export {}`,
 * which a classic worker cannot parse. The request type is declared here and again by the
 * exporter for that reason.
 */

interface CsvExportOptions {
    columnDelimiter: string;
    stringDelimiter: string;
    quoteStrings: boolean;
}

/** A header value or a field value: the parser produces primitives and number lists. */
type CsvValue = string | number | boolean | null | undefined | readonly number[];

interface CsvExportRequest {
    sysConfig: Record<string, CsvValue>;
    fieldNames: string[];
    /** The log's chunks, each a list of frames, each a row of field values. */
    frames: CsvValue[][][];
    opts: CsvExportOptions;
}

/** The dedicated worker scope; the project's lib.dom describes a window instead. */
const csvWorker = self as unknown as {
    onmessage: ((event: MessageEvent<CsvExportRequest>) => void) | null;
    postMessage(message: string): void;
};

/**
 * Converts `null` and other empty non-numeric values to empty string.
 */
function normalizeEmpty(value: CsvValue) {
    return value || "";
}

csvWorker.onmessage = function (event) {
    function joinColumns(columns: CsvValue[]): string {
        return columns
            .map((value) =>
                typeof value === "number" ? value : `${stringDelim}${normalizeEmpty(value)}${stringDelim}`,
            )
            .join(opts.columnDelimiter);
    }

    /**
     * Converts `null` entries in columns and other empty non-numeric values to NaN value string.
     */
    function joinColumnValues(columns: CsvValue[]): string {
        return columns.map((value) => (typeof value === "number" || value ? value : "NaN")).join(opts.columnDelimiter);
    }

    const opts = event.data.opts,
        stringDelim = opts.quoteStrings ? opts.stringDelimiter : "",
        mainFields = [joinColumns(event.data.fieldNames)]
            .concat(event.data.frames.flat().map((row) => joinColumnValues(row)))
            .join("\n"),
        headers = Object.entries(event.data.sysConfig)
            .map(([key, value]) => joinColumns([key, value]))
            .join("\n"),
        result = `${headers}\n${mainFields}`;

    csvWorker.postMessage(result);
};
