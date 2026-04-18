import { bit_check } from "./bit";

export function have_sensor(sensors_detected, sensor_code) {
    switch (sensor_code) {
        case "acc":
            return bit_check(sensors_detected, 0);
        case "baro":
            return bit_check(sensors_detected, 1);
        case "mag":
            return bit_check(sensors_detected, 2);
        case "gps":
            return bit_check(sensors_detected, 3);
        case "sonar":
            return bit_check(sensors_detected, 4);
        case "gyro":
            return bit_check(sensors_detected, 5);
        case "opticalflow":
            return bit_check(sensors_detected, 6);
    }
    return false;
}

// Kept as a stable entry point for legacy callers. SensorStatus.vue renders
// reactively from FC state, so no DOM manipulation is needed.
export function sensor_status() {}
