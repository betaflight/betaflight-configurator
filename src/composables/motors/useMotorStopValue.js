// betaflight firmware src/main/rx/rx.h: PWM_RANGE_MIDDLE = PWM_RANGE_MIN(1000) + PWM_RANGE(1000)/2.
const PWM_RANGE_MIDDLE = 1500;

export function computeZeroThrottleValue(is3dEnabled, isDigitalProtocol, motor3dNeutral, minSliderValue) {
    if (is3dEnabled) {
        if (isDigitalProtocol) {
            // dshotConvertFromExternal() (firmware src/main/drivers/dshot.c) stops the motor only at this exact value, never at motor3dConfig.neutral.
            return PWM_RANGE_MIDDLE;
        }
        return motor3dNeutral > 1575 || motor3dNeutral < 1425 ? PWM_RANGE_MIDDLE : motor3dNeutral;
    }
    return minSliderValue;
}

export function computeIdleThrottleValue(zeroThrottleValue, motorIdle) {
    return zeroThrottleValue + (motorIdle * 1000) / 100;
}
