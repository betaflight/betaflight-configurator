export function ImportedCurves(curvesChanged) {
    const MAX_IMPORT_COUNT = 6; // This value is limited by legends size and curves colors visibility. May be increased if needed by users
    const _curvesData = [];
    const _that = this;
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

    this.importCurvesFromCSV = function (files) {
        let importsLeft = MAX_IMPORT_COUNT - _curvesData.length;

        for (const file of files) {
            if (importsLeft-- === 0) {
                break;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const stringRows = e.target.result.split("\n");

                    const header = stringRows[0].split(",");
                    if (header.length !== 2 || header[0].trim() !== "x" || header[1].trim() !== "y") {
                        throw new SyntaxError("Wrong curves CSV data format");
                    }

                    stringRows.shift();
                    //remove bad last row
                    if (stringRows.at(-1) === "") {
                        stringRows.pop();
                    }

                    const curvesData = stringRows.map(function (row) {
                        const data = row.split(","),
                            x = Number.parseFloat(data[0].trim()),
                            y = Number.parseFloat(data[1].trim());
                        _that.minX = Math.min(x, _that.minX);
                        _that.maxX = Math.max(x, _that.maxX);
                        _that.minY = Math.min(y, _that.minY);
                        _that.maxY = Math.max(y, _that.maxY);
                        return {
                            x: x,
                            y: y,
                        };
                    });

                    const curve = {
                        name: file.name.split(".")[0],
                        points: curvesData,
                        range: getCurveRange(curvesData),
                    };
                    _curvesData.push(curve);
                    curvesChanged();
                } catch (e) {
                    alert(`Curves data import error: ${e.message}`);
                    return;
                }
            };

            reader.readAsText(file);
        }
    };

    const getCurveRange = function (points) {
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

    const computeGlobalCurvesRange = function () {
        _that.minX = Number.MAX_VALUE;
        _that.maxX = -Number.MAX_VALUE;
        _that.minY = Number.MAX_VALUE;
        _that.maxY = -Number.MAX_VALUE;
        for (const curve of _curvesData) {
            _that.minX = Math.min(curve.range.minX, _that.minX);
            _that.maxX = Math.max(curve.range.maxX, _that.maxX);
            _that.minY = Math.min(curve.range.minY, _that.minY);
            _that.maxY = Math.max(curve.range.maxY, _that.maxY);
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
