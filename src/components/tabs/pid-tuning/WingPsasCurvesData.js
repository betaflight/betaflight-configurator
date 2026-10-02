import { getCssVar } from "../../../js/utils/common";
export function getPsasHyperbolicCurves(psasConfig, curvesState) {
    // The list of charts curves
    const chartCurves = [];

    if (curvesState.showMain) {
        chartCurves.push({
            data: generatePsasCurve(
                psasConfig.speed_optimum_vref,
                psasConfig.speed_main_curve_power / 10,
                psasConfig.speed_main_curve_min / 100,
                psasConfig.speed_main_curve_max / 100,
            ),
            color: getCssVar("--chart-curve-color-1", "#d55e00"),
            active: curvesState.mainActive,
            label: "Main",
        });
    }

    if (curvesState.showStick) {
        chartCurves.push({
            data: generatePsasCurve(
                psasConfig.speed_optimum_vref,
                psasConfig.speed_main_curve_power / 10,
                psasConfig.speed_stick_curve_min / 100,
                psasConfig.speed_stick_curve_max / 100,
            ),
            color: getCssVar("--chart-curve-color-2", "#0072b2"),
            active: curvesState.stickActive,
            label: "Stick",
        });
    }

    if (curvesState.showRollStick) {
        chartCurves.push({
            data: generatePsasCurve(
                psasConfig.speed_optimum_vref,
                psasConfig.speed_roll_stick_curve_power / 10,
                psasConfig.speed_stick_curve_min / 100,
                psasConfig.speed_stick_curve_max / 100,
            ),
            color: getCssVar("--chart-curve-color-3", "#009e73"),
            active: curvesState.rollStickActive,
            label: "Roll stick",
        });
    }

    return chartCurves;
}

// Hyperbolic curve definition
function generatePsasCurve(refSpeed, power, minLimit, maxLimit) {
    const steps = 100;
    const minSpeed = refSpeed * Math.pow(maxLimit, -1 / power);
    const maxSpeed = refSpeed * Math.pow(minLimit, -1 / power);
    const speedStep = (maxSpeed - minSpeed) / steps;

    const data = [];
    data.push({
        speed: 0,
        multiplier: maxLimit,
    });
    for (let i = 0; i <= steps; i++) {
        const v = minSpeed + i * speedStep;
        const ratio = refSpeed / v;
        const multiplier = Math.pow(ratio, power);
        data.push({
            speed: v,
            multiplier: multiplier,
        });
    }
    data.push({
        speed: maxSpeed * 1.1,
        multiplier: minLimit,
    });
    return data;
}

export default getPsasHyperbolicCurves;
