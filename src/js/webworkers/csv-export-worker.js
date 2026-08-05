/**
 * Converts `null` and other empty non-numeric values to empty string.
 *
 * @param {object} value is not a number
 * @returns {string}
 */
function normalizeEmpty(value) {
    return value ? value : "";
}

onmessage = function (event) {
    /**
     * @param {array} columns
     * @returns {string}
     */
    function joinColumns(columns) {
        return columns
            .map((value) => (typeof value === "number" ? value : stringDelim + normalizeEmpty(value) + stringDelim))
            .join(opts.columnDelimiter);
    }

    /**
     * Converts `null` entries in columns and other empty non-numeric values to NaN value string.
     *
     * @param {array} columns
     * @returns {string}
     */
    function joinColumnValues(columns) {
        return columns.map((value) => (typeof value === "number" || value ? value : "NaN")).join(opts.columnDelimiter);
    }

    let opts = event.data.opts,
        stringDelim = opts.quoteStrings ? opts.stringDelimiter : "",
        mainFields = [joinColumns(event.data.fieldNames)]
            .concat(event.data.frames.flat().map((row) => joinColumnValues(row)))
            .join("\n"),
        headers = Object.entries(event.data.sysConfig)
            .map(([key, value]) => joinColumns([key, value]))
            .join("\n"),
        result = headers + "\n" + mainFields;

    postMessage(result);
};
