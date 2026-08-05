onmessage = function (event) {
    const columnDelimiter = event.data.opts.columnDelimiter;
    const fftOutput = event.data.fftOutput;
    const spectrumDataLength = fftOutput.length;
    const frequencyStep = (0.5 * event.data.blackBoxRate) / spectrumDataLength;

    let outText = "x" + columnDelimiter + "y" + "\n";
    for (let index = 0; index < spectrumDataLength; index++) {
        const frequency = frequencyStep * index;
        outText += frequency.toString() + columnDelimiter + fftOutput[index].toString() + "\n";
    }

    postMessage(outText);
};
