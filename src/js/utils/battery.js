export const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8;

export function estimateCellCount(voltage, vbatmaxcellvoltage) {
    if (!Number.isFinite(voltage) || !Number.isFinite(vbatmaxcellvoltage) || voltage <= 0 || vbatmaxcellvoltage <= 0) {
        return 1;
    }
    return Math.ceil(voltage / vbatmaxcellvoltage);
}
