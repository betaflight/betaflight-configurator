export const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8;

export function estimateCellCount(voltage, vbatmaxcellvoltage) {
    if (voltage === 0) {
        return 1;
    }
    return Math.floor(voltage / vbatmaxcellvoltage) + 1;
}
