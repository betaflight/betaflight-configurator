// DShot 3D: firmware stops the motor only at exactly 1500 (PWM_RANGE_MIDDLE), not at the configured 3D neutral.
const DSHOT_3D_STOP = 1500;

export function computeZeroThrottleValue(is3dEnabled, isDigitalProtocol, motor3dNeutral, minSliderValue) {
    if (is3dEnabled) {
        if (isDigitalProtocol) {
            return DSHOT_3D_STOP;
        }
        return motor3dNeutral > 1575 || motor3dNeutral < 1425 ? 1500 : motor3dNeutral;
    }
    return minSliderValue;
}

export function computeIdleThrottleValue(zeroThrottleValue, motorIdle) {
    return zeroThrottleValue + (motorIdle * 1000) / 100;
}
