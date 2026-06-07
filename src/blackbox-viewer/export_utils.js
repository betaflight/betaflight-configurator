import { triggerDownload } from "./tools.js";
import { CsvExporter } from "./csv-exporter.js";
import { GpxExporter } from "./gpx-exporter.js";

function createExportCallback(fileExtension, fileType, file, startTime, logFilename) {
    return function (data) {
        console.debug(
            `${fileExtension.toUpperCase()} export finished in ${(performance.now() - startTime) / 1000} secs`,
        );
        if (!data) {
            console.debug("Empty data, nothing to save");
            return;
        }
        const filename = file || `${logFilename}.${fileExtension}`;
        triggerDownload(new Blob([data], { type: fileType }), filename);
    };
}

export function exportCsv(flightLog, logFilename, file, options = {}) {
    const onSuccess = createExportCallback("csv", "text/csv", file, performance.now(), logFilename);
    CsvExporter(flightLog, options).dump(onSuccess);
}

export function exportGpx(flightLog, logFilename, file) {
    const onSuccess = createExportCallback("gpx", "application/gpx+xml", file, performance.now(), logFilename);
    GpxExporter(flightLog).dump(onSuccess);
}

export function exportSpectrumToCsv(analyser, logFilename, options = {}) {
    const fileName = analyser.getExportedFileName();
    if (fileName == null) {
        console.warn("The export is not supported for this spectrum type");
        return;
    }

    const onSuccess = createExportCallback("csv", "text/csv", fileName, performance.now(), logFilename);
    analyser.exportSpectrumToCSV(onSuccess, options);
}
