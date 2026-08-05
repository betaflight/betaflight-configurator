/**
 * Creates a lookup-table based expo curve, which takes values that range between -inputrange and +inputRange, and
 * scales them to -outputRange to +outputRange with the given power curve (curve <1.0 exaggerates values near the origin,
 * curve = 1.0 is a straight line mapping).
 */
export function ExpoCurve(offset, power, inputRange, outputRange, steps) {
    let curve, inputScale;
    const rawInputScale = outputRange / inputRange;

    function lookupStraightLine(input) {
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
            steps: steps,
        };
    };

    /**
     * An approximation of lookupMathPow by precomputing several expo curve points and interpolating between those
     * points using straight line interpolation.
     *
     * The error will be largest in the area of the curve where the slope changes the fastest with respect to input
     * (e.g. the approximation will be too straight near the origin when power < 1.0, but a good fit far from the origin)
     */
    function lookupInterpolatedCurve(input) {
        input += offset;

        const valueInCurve = Math.abs(input * inputScale);
        let prevStepIndex = Math.floor(valueInCurve);

        /* If the input value lies beyond the stated input range, use the final
         * two points of the curve to extrapolate out (the "curve" out there is a straight line, though)
         */
        if (prevStepIndex > steps - 2) {
            prevStepIndex = steps - 2;
        }

        //Straight-line interpolation between the two curve points
        const proportion = valueInCurve - prevStepIndex,
            result = curve[prevStepIndex] + (curve[prevStepIndex + 1] - curve[prevStepIndex]) * proportion;

        if (input < 0) {
            return -result;
        }
        return result;
    }

    // If steps argument isn't supplied, use a reasonable default
    if (steps === undefined) {
        steps = 12;
    }

    if (steps <= 2 || power === 1) {
        //Curve is actually a straight line
        inputScale = outputRange / inputRange;

        this.lookup = lookupStraightLine;
    } else {
        const stepSize = 1 / (steps - 1);

        curve = new Array(steps);

        inputScale = (steps - 1) / inputRange;

        for (let i = 0; i < steps; i++) {
            curve[i] = (i * stepSize) ** power * outputRange;
        }

        this.lookup = lookupInterpolatedCurve;
    }
}
