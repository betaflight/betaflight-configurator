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

/** The settings an ExpoCurve was built with; `steps` is 12 when none was given. */
export interface ExpoCurveSettings {
    offset: number;
    power: number;
    inputRange: number;
    outputRange: number;
    steps: number;
}

/**
 * Creates a lookup-table based expo curve, which takes values that range between -inputrange and +inputRange, and
 * scales them to -outputRange to +outputRange with the given power curve (curve <1.0 exaggerates values near the origin,
 * curve = 1.0 is a straight line mapping).
 */
export class ExpoCurve {
    /** Map an input through the curve. */
    declare lookup: (input: number) => number;
    /** Map an input straight onto the output range, ignoring the curve's power. */
    declare lookupRaw: (input: number) => number;
    declare getCurve: () => ExpoCurveSettings;

    constructor(offset: number, power: number, inputRange: number, outputRange: number, steps?: number) {
        // If steps argument isn't supplied, use a reasonable default
        const stepCount = steps ?? 12;
        let curve: number[], inputScale: number;
        const rawInputScale = outputRange / inputRange;

        function lookupStraightLine(input: number): number {
            return (input + offset) * inputScale;
        }

        this.lookupRaw = function (input) {
            return (input + offset) * rawInputScale;
        };

        this.getCurve = function () {
            return {
                offset: offset,
                power: power,
                inputRange: inputRange,
                outputRange: outputRange,
                steps: stepCount,
            };
        };

        /**
         * An approximation of lookupMathPow by precomputing several expo curve points and interpolating between those
         * points using straight line interpolation.
         *
         * The error will be largest in the area of the curve where the slope changes the fastest with respect to input
         * (e.g. the approximation will be too straight near the origin when power < 1.0, but a good fit far from the origin)
         */
        function lookupInterpolatedCurve(input: number): number {
            input += offset;

            const valueInCurve = Math.abs(input * inputScale);
            let prevStepIndex = Math.floor(valueInCurve);

            /* If the input value lies beyond the stated input range, use the final
             * two points of the curve to extrapolate out (the "curve" out there is a straight line, though)
             */
            if (prevStepIndex > stepCount - 2) {
                prevStepIndex = stepCount - 2;
            }

            //Straight-line interpolation between the two curve points
            const proportion = valueInCurve - prevStepIndex,
                result = curve[prevStepIndex] + (curve[prevStepIndex + 1] - curve[prevStepIndex]) * proportion;

            if (input < 0) {
                return -result;
            }
            return result;
        }

        if (stepCount <= 2 || power === 1) {
            //Curve is actually a straight line
            inputScale = outputRange / inputRange;

            this.lookup = lookupStraightLine;
        } else {
            const stepSize = 1 / (stepCount - 1);

            curve = new Array(stepCount);

            inputScale = (stepCount - 1) / inputRange;

            for (let i = 0; i < stepCount; i++) {
                curve[i] = (i * stepSize) ** power * outputRange;
            }

            this.lookup = lookupInterpolatedCurve;
        }
    }
}
