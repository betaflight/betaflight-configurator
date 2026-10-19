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

/** Format options; the worker reads only the column delimiter. */
export interface SpectrumExportOptions {
    columnDelimiter: string;
    quoteStrings: boolean;
}

/** The spectrum to export: what the worker's request is built from. */
interface SpectrumData {
    fftOutput: ArrayLike<number>;
    blackBoxRate: number;
}

/**
 * @param fftData the spectrum to export
 * @param opts overrides of the default comma-separated format
 */
export function SpectrumExporter(fftData: SpectrumData, opts: Partial<SpectrumExportOptions> = {}) {
    const options: SpectrumExportOptions = {
        columnDelimiter: ",",
        quoteStrings: true,
        ...opts,
    };

    /**
     * @param success is a callback triggered when export is done
     */
    function dump(success: (csv: string) => void): void {
        const worker = new Worker(new URL("../js/webworkers/spectrum-export-worker.ts", import.meta.url));

        worker.onmessage = (event: MessageEvent<string>) => {
            success(event.data);
            worker.terminate();
        };

        worker.postMessage({
            fftOutput: fftData.fftOutput,
            blackBoxRate: fftData.blackBoxRate,
            opts: options,
        });
    }

    // exposed functions
    return {
        dump: dump,
    };
}
