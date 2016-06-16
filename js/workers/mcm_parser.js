'use strict';

// input = string
// result = if mcm file is valid, result is an object
function read_mcm_file(data) {
    data = data.split("\n");

    // check if there is an empty line in the end of hex file, if there is, remove it
    if (data[data.length - 1] == "") {
        data.pop();
    }

    var result = {
        data:                   [],
        bytes_total:            0,
    };

    if (data[0] == "MAX7456") {
        for (var i = 1; i < data.length; i++) {
            // each byte is represnted by eight chars
            var byte = parseInt(data[i].substr(0, 8), 2);
            result.data.push(byte);
            result.bytes_total++;
            if (i < 2) {
                console.log('Data = ' + byte.toString());
            }
        }
        postMessage(result);
    } else {
        postMessage(false);
    }
}

function microtime() {
    var now = new Date().getTime() / 1000;

    return now;
}

onmessage = function(event) {
    var time_parsing_start = microtime(); // track time

    read_mcm_file(event.data);

    console.log('MCM_PARSER - File parsed in: ' + (microtime() - time_parsing_start).toFixed(4) + ' seconds');

    // terminate worker
    close();
};