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
     * @param {function} [failure] is a callback triggered when the worker fails
     */
    function dump(success, failure = () => {}) {
        const frames = flightLog
                .getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())
                .map((chunk) => chunk.frames),
            worker = new Worker(new URL("../js/webworkers/csv-export-worker.js", import.meta.url));

        worker.onmessage = (event) => {
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
