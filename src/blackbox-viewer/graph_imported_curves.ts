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

/** A point of a spectrum curve: frequency in Hz, and magnitude or PSD in dBm/Hz. */
export interface CurvePoint {
    x: number;
    y: number;
}

export interface CurveRange {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/** A curve to compare against the live spectrum, loaded from a CSV file or copied from the spectrum. */
export interface ImportedCurve {
    name: string;
    points: CurvePoint[];
    range: CurveRange;
}

/**
 * The curves overlaid on a spectrum, at most six. `minX`..`maxY` span every curve held,
 * and `curvesChanged` runs after each change so the plot can redraw.
 */
export class ImportedCurves {
    declare minX: number;
    declare maxX: number;
    declare minY: number;
    declare maxY: number;
    declare curvesCount: () => number;
    /** Throws RangeError past the last curve. */
    declare getCurve: (index: number) => ImportedCurve;
    /** Reads each file as `x,y` CSV with a header row; a malformed file is reported with alert(). */
    declare importCurvesFromCSV: (files: Iterable<File>) => void;
    /** Does nothing when already full. */
    declare addCurve: (points: CurvePoint[], name: string) => void;
    /** The analyser asks with a null name before any field is selected; no curve has that name. */
    declare isNewCurve: (name: string | null) => boolean;
    declare removeAllCurves: () => void;
    declare removeCurve: (name: string | null) => void;
    declare isFull: () => boolean;
    declare isEmpty: () => boolean;

    constructor(curvesChanged: () => void) {
        const MAX_IMPORT_COUNT = 6; // This value is limited by legends size and curves colors visibility. May be increased if needed by users
        const _curvesData: ImportedCurve[] = [];
        this.minX = Number.MAX_VALUE;
        this.maxX = -Number.MAX_VALUE;
        this.minY = Number.MAX_VALUE;
        this.maxY = -Number.MAX_VALUE;

        this.curvesCount = function () {
            return _curvesData.length;
        };

        this.getCurve = function (index) {
            if (index < _curvesData.length) {
                return _curvesData[index];
            } else {
                throw new RangeError(
                    `The imported curves index (${index}) exceeds the maximum allowed value (${_curvesData.length - 1})`,
                );
            }
        };

        this.importCurvesFromCSV = (files) => {
            let importsLeft = MAX_IMPORT_COUNT - _curvesData.length;

            for (const file of files) {
                if (importsLeft-- === 0) {
                    break;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        // readAsText() always yields a string
                        const stringRows = (reader.result as string).split("\n");

                        const header = stringRows[0].split(",");
                        if (header.length !== 2 || header[0].trim() !== "x" || header[1].trim() !== "y") {
                            throw new SyntaxError("Wrong curves CSV data format");
                        }

                        stringRows.shift();
                        //remove bad last row
                        if (stringRows.at(-1) === "") {
                            stringRows.pop();
                        }

                        const curvesData = stringRows.map((row) => {
                            const data = row.split(","),
                                x = Number.parseFloat(data[0].trim()),
                                y = Number.parseFloat(data[1].trim());
                            return {
                                x: x,
                                y: y,
                            };
                        });

                        const curve: ImportedCurve = {
                            name: file.name.split(".")[0],
                            points: curvesData,
                            range: getCurveRange(curvesData),
                        };
                        _curvesData.push(curve);
                        // Widen only once the whole file has parsed, so a file that fails leaves the range alone.
                        this.minX = Math.min(curve.range.minX, this.minX);
                        this.maxX = Math.max(curve.range.maxX, this.maxX);
                        this.minY = Math.min(curve.range.minY, this.minY);
                        this.maxY = Math.max(curve.range.maxY, this.maxY);
                        curvesChanged();
                    } catch (e) {
                        alert(`Curves data import error: ${(e as Error).message}`);
                        return;
                    }
                };

                reader.readAsText(file);
            }
        };

        const getCurveRange = function (points: CurvePoint[]): CurveRange {
            let minX = Number.MAX_VALUE,
                maxX = -Number.MAX_VALUE,
                minY = Number.MAX_VALUE,
                maxY = -Number.MAX_VALUE;
            for (const point of points) {
                minX = Math.min(point.x, minX);
                maxX = Math.max(point.x, maxX);
                minY = Math.min(point.y, minY);
                maxY = Math.max(point.y, maxY);
            }
            return {
                minX: minX,
                maxX: maxX,
                minY: minY,
                maxY: maxY,
            };
        };

        const computeGlobalCurvesRange = () => {
            this.minX = Number.MAX_VALUE;
            this.maxX = -Number.MAX_VALUE;
            this.minY = Number.MAX_VALUE;
            this.maxY = -Number.MAX_VALUE;
            for (const curve of _curvesData) {
                this.minX = Math.min(curve.range.minX, this.minX);
                this.maxX = Math.max(curve.range.maxX, this.maxX);
                this.minY = Math.min(curve.range.minY, this.minY);
                this.maxY = Math.max(curve.range.maxY, this.maxY);
            }
        };

        this.addCurve = function (points, name) {
            if (this.curvesCount() < MAX_IMPORT_COUNT) {
                const range = getCurveRange(points);
                _curvesData.push({
                    name: name,
                    points: points,
                    range: range,
                });

                this.minX = Math.min(range.minX, this.minX);
                this.maxX = Math.max(range.maxX, this.maxX);
                this.minY = Math.min(range.minY, this.minY);
                this.maxY = Math.max(range.maxY, this.maxY);

                curvesChanged();
            }
        };

        this.isNewCurve = function (name) {
            for (const curve of _curvesData) {
                if (curve.name === name) {
                    return false;
                }
            }
            return true;
        };

        this.removeAllCurves = function () {
            _curvesData.length = 0;
            computeGlobalCurvesRange();
            curvesChanged();
        };

        this.removeCurve = function (name) {
            for (let index = 0; index < _curvesData.length; index++) {
                if (_curvesData[index].name === name) {
                    _curvesData.splice(index, 1);
                    computeGlobalCurvesRange();
                    curvesChanged();
                    break;
                }
            }
        };

        this.isFull = function () {
            return this.curvesCount() === MAX_IMPORT_COUNT;
        };

        this.isEmpty = function () {
            return this.curvesCount() === 0;
        };
    }
}
