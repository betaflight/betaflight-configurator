import FileSystem from "../js/FileSystem";
import { CsvExporter } from "./csv-exporter.js";
import { GpxExporter } from "./gpx-exporter.js";

// NOTE: the blackbox-viewer subsystem is English-only for now, so the picker
// descriptions are plain strings rather than i18n keys.
const EXPORT_DESCRIPTIONS = {
    csv: "CSV file",
    gpx: "GPX file",
};

function suggestedName(logFilename, fileExtension) {
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
async function saveExport(fileExtension, suggested, dumpFn) {
    let file;
    try {
        file = await FileSystem.pickSaveFile(
            suggested,
            EXPORT_DESCRIPTIONS[fileExtension] || `${fileExtension.toUpperCase()} file`,
            `.${fileExtension}`,
        );
    } catch (error) {
        if (error?.name === "AbortError") {
            return; // user cancelled the dialog
        }
        console.error(`Failed to open save dialog for ${fileExtension.toUpperCase()} export:`, error);
        return;
    }

    if (!file) {
        return;
    }

    const startTime = performance.now();
    await new Promise((resolve) => {
        const onFailure = (error) => {
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

export function exportCsv(flightLog, logFilename, options = {}) {
    return saveExport("csv", suggestedName(logFilename, "csv"), (onSuccess, onFailure) =>
        CsvExporter(flightLog, options).dump(onSuccess, onFailure),
    );
}

export function exportGpx(flightLog, logFilename) {
    return saveExport("gpx", suggestedName(logFilename, "gpx"), (onSuccess) => GpxExporter(flightLog).dump(onSuccess));
}

export function exportSpectrumToCsv(analyser, logFilename, options = {}) {
    const fileName = analyser.getExportedFileName();
    if (!fileName) {
        console.warn("The export is not supported for this spectrum type");
        return;
    }

    return saveExport("csv", `${fileName}.csv`, (onSuccess) => analyser.exportSpectrumToCSV(onSuccess, options));
}
