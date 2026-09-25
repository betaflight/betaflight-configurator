// betaflight firmware src/main/rx/rx.h: PWM_RANGE_MIDDLE = PWM_RANGE_MIN(1000) + PWM_RANGE(1000)/2.
const PWM_RANGE_MIDDLE = 1500;

// betaflight firmware src/main/rx/rx.h: valid PWM pulse-width bounds; also the CLI/MSP-accepted
// range for 3d_neutral (firmware src/main/cli/settings.c). A pilot can set 3d_neutral via CLI
// outside MotorsTab.vue's own 1400-1600 slider range — that is a legitimate, firmware-accepted
// value, not corrupted data, so the plausibility check must match firmware's real range, not the
// narrower GUI widget. FC.MOTOR_3D_CONFIG.neutral defaults to 0 before MSP_MOTOR_3D_CONFIG
// resolves (src/js/fc.js) — outside this range, so it's still caught as implausible.
const NEUTRAL_3D_MIN = 750;
const NEUTRAL_3D_MAX = 2250;

export function computeZeroThrottleValue(is3dEnabled, isDigitalProtocol, motor3dNeutral, minSliderValue) {
    if (is3dEnabled) {
        if (isDigitalProtocol) {
            // dshotConvertFromExternal() (firmware src/main/drivers/dshot.c) stops the motor only at this exact value, never at motor3dConfig.neutral.
            return PWM_RANGE_MIDDLE;
        }
        const isImplausible = motor3dNeutral < NEUTRAL_3D_MIN || motor3dNeutral > NEUTRAL_3D_MAX;
        return isImplausible ? PWM_RANGE_MIDDLE : motor3dNeutral;
    }
    return minSliderValue;
}

export function computeIdleThrottleValue(zeroThrottleValue, motorIdle) {
    return zeroThrottleValue + (motorIdle * 1000) / 100;
}
