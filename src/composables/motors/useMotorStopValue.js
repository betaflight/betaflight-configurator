// In 3D mode, minSliderValue (DShot-disarmed) is high reverse throttle, not a stop.
export function computeZeroThrottleValue(is3dEnabled, motor3dNeutral, minSliderValue) {
    if (is3dEnabled) {
        return motor3dNeutral > 1575 || motor3dNeutral < 1425 ? 1500 : motor3dNeutral;
    }
    return minSliderValue;
}

export function computeIdleThrottleValue(zeroThrottleValue, motorIdle) {
    return zeroThrottleValue + (motorIdle * 1000) / 100;
}
