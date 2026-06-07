/**
 * @typedef {object} ExportOptions
 * @property {string} columnDelimiter
 * @property {string} stringDelimiter
 * @property {boolean} quoteStrings
 */

/**
 * @constructor
 * @param {object} fftOutput
 * @param {ExportOptions} [opts={}]
 */
export function SpectrumExporter(fftData, opts = {}) {
    opts = {
        columnDelimiter: ",",
        quoteStrings: true,
        ...opts,
    };

    /**
     * @param {function} success is a callback triggered when export is done
     */
    function dump(success) {
        const worker = new Worker("/js/webworkers/spectrum-export-worker.js");

        worker.onmessage = (event) => {
            success(event.data);
            worker.terminate();
        };

        worker.postMessage({
            fftOutput: fftData.fftOutput,
            blackBoxRate: fftData.blackBoxRate,
            opts: opts,
        });
    }

    // exposed functions
    return {
        dump: dump,
    };
}
