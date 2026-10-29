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
 * Builds the CSV text of a spectrum export, off the main thread (blackbox-viewer/spectrum-exporter.ts).
 *
 * This file must not import or export anything: Vite serves it as a classic worker in
 * development, where the `export {}` TypeScript emits for a type-only import or export does
 * not parse. See csv-export-worker.ts.
 */

interface SpectrumExportRequest {
    /** Magnitudes of evenly spaced frequency bins, from 0 Hz up to half the log rate. */
    fftOutput: ArrayLike<number>;
    blackBoxRate: number;
    opts: { columnDelimiter: string };
}

/** The dedicated worker scope; the project's lib.dom describes a window instead. */
const spectrumWorker = self as unknown as {
    onmessage: ((event: MessageEvent<SpectrumExportRequest>) => void) | null;
    postMessage(message: string): void;
};

spectrumWorker.onmessage = function (event) {
    const columnDelimiter = event.data.opts.columnDelimiter;
    const fftOutput = event.data.fftOutput;
    const spectrumDataLength = fftOutput.length;
    const frequencyStep = (0.5 * event.data.blackBoxRate) / spectrumDataLength;

    let outText = `x${columnDelimiter}y\n`;
    for (let index = 0; index < spectrumDataLength; index++) {
        const frequency = frequencyStep * index;
        outText += `${frequency.toString()}${columnDelimiter}${fftOutput[index].toString()}\n`;
    }

    spectrumWorker.postMessage(outText);
};
