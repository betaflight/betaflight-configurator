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

export function sensor_status(sensors_detected = 0, gps_fix_state = 0) {
    // initialize variable (if it wasn't)
    if (!sensor_status.previous_sensors_detected) {
        sensor_status.previous_sensors_detected = -1; // Otherwise first iteration will not be run if sensors_detected == 0
    }
    if (!sensor_status.previous_gps_fix_state) {
        sensor_status.previous_gps_fix_state = -1;
    }

    // update UI (if necessary)
    if (
        sensor_status.previous_sensors_detected === sensors_detected &&
        sensor_status.previous_gps_fix_state === gps_fix_state
    ) {
        return;
    }

    // set current value
    sensor_status.previous_sensors_detected = sensors_detected;
    sensor_status.previous_gps_fix_state = gps_fix_state;

    const el = document.getElementById("sensor-status");
    if (!el) {
        return;
    }

    function toggle(sensorClass, iconClass, on) {
        el.querySelector(`.${sensorClass}`)?.classList.toggle("on", on);
        el.querySelector(`.${iconClass}`)?.classList.toggle("active", on);
    }

    toggle("accel", "accicon", have_sensor(sensors_detected, "acc"));
    toggle("gyro", "gyroicon", have_sensor(sensors_detected, "gyro"));
    toggle("baro", "baroicon", have_sensor(sensors_detected, "baro"));
    toggle("mag", "magicon", have_sensor(sensors_detected, "mag"));
    toggle("sonar", "sonaricon", have_sensor(sensors_detected, "sonar"));

    const gnssSensorDetected = have_sensor(sensors_detected, "gps");
    const hasGnssFix = gps_fix_state > 0;
    const gpsOn = gnssSensorDetected || hasGnssFix;

    el.querySelector(".gps")?.classList.toggle("on", gpsOn);
    const gpsIcon = el.querySelector(".gpsicon");
    if (gpsIcon) {
        gpsIcon.classList.toggle("active", gpsOn && gnssSensorDetected && !hasGnssFix);
        gpsIcon.classList.toggle("active_fix", gpsOn && gnssSensorDetected && hasGnssFix);
        if (!gpsOn) {
            gpsIcon.classList.remove("active", "active_fix");
        }
    }
}
