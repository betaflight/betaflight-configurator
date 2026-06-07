/**
 * @typedef {object} ExportOptions
 * @property {string} columnDelimiter
 * @property {string} stringDelimiter
 * @property {boolean} quoteStrings
 */

/**
 * @constructor
 * @param {FlightLog} flightLog
 * @param {ExportOptions} [opts={}]
 */
export function CsvExporter(flightLog, opts = {}) {
    opts = {
        columnDelimiter: ",",
        stringDelimiter: '"',
        quoteStrings: true,
        ...opts,
    };

    /**
     * @param {function} success is a callback triggered when export is done
     */
    function dump(success) {
        const frames = flightLog
                .getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())
                .map((chunk) => chunk.frames),
            worker = new Worker("/js/webworkers/csv-export-worker.js");

        worker.onmessage = (event) => {
            success(event.data);
            worker.terminate();
        };
        worker.postMessage({
            sysConfig: flightLog.getSysConfig(),
            fieldNames: flightLog.getMainFieldNames(),
            frames: frames,
            opts: opts,
        });
    }

    // exposed functions
    return {
        dump: dump,
    };
}
