// betaflight firmware src/main/rx/rx.h: PWM_RANGE_MIDDLE = PWM_RANGE_MIN(1000) + PWM_RANGE(1000)/2.
const PWM_RANGE_MIDDLE = 1500;

// MotorsTab.vue's 3D Neutral field bounds (UInputNumber :min/:max). A stored value outside this
// range cannot have been set through that field — it is the pre-fetch default
// (FC.MOTOR_3D_CONFIG.neutral starts at 0, src/js/fc.js) or corrupted data. pwmConvertFromExternal()
// (firmware src/platform/STM32/pwm_output_hw.c) does not clamp its input, so an out-of-range value
// reaches the ESC unmodified.
const NEUTRAL_3D_MIN = 1400;
const NEUTRAL_3D_MAX = 1600;

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
