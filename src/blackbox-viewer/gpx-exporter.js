/**
 * @constructor
 * @param {FlightLog} flightLog
 */
export function GpxExporter(flightLog) {
    /**
     * @param {function} success is a callback triggered when export is done
     */
    function dump(success) {
        const frames = flightLog
                .getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())
                .map((chunk) => chunk.frames),
            worker = new Worker(new URL("../js/webworkers/gpx-export-worker.js", import.meta.url));

        worker.onmessage = (event) => {
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
