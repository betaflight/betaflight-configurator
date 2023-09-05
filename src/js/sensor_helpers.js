import { bit_check } from './bit';
import $ from 'jquery';

export function have_sensor(sensors_detected, sensor_code) {
    switch(sensor_code) {
        case 'acc':
            return bit_check(sensors_detected, 0);
        case 'baro':
            return bit_check(sensors_detected, 1);
        case 'mag':
            return bit_check(sensors_detected, 2);
        case 'gps':
            return bit_check(sensors_detected, 3);
        case 'sonar':
            return bit_check(sensors_detected, 4);
        case 'gyro':
            return bit_check(sensors_detected, 5);
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
    if (sensor_status.previous_sensors_detected === sensors_detected && sensor_status.previous_gps_fix_state === gps_fix_state) {
        return;
    }

    // set current value
    sensor_status.previous_sensors_detected = sensors_detected;
    sensor_status.previous_gps_fix_state = gps_fix_state;

    const eSensorStatus = $("div#sensor-status");

    if (have_sensor(sensors_detected, "acc")) {
        $(".accel", eSensorStatus).addClass("on");
        $(".accicon", eSensorStatus).addClass("active");
    } else {
        $(".accel", eSensorStatus).removeClass("on");
        $(".accicon", eSensorStatus).removeClass("active");
    }

    if (have_sensor(sensors_detected, "gyro")) {
        $(".gyro", eSensorStatus).addClass("on");
        $(".gyroicon", eSensorStatus).addClass("active");
    } else {
        $(".gyro", eSensorStatus).removeClass("on");
        $(".gyroicon", eSensorStatus).removeClass("active");
    }

    if (have_sensor(sensors_detected, "baro")) {
        $(".baro", eSensorStatus).addClass("on");
        $(".baroicon", eSensorStatus).addClass("active");
    } else {
        $(".baro", eSensorStatus).removeClass("on");
        $(".baroicon", eSensorStatus).removeClass("active");
    }

    if (have_sensor(sensors_detected, "mag")) {
        $(".mag", eSensorStatus).addClass("on");
        $(".magicon", eSensorStatus).addClass("active");
    } else {
        $(".mag", eSensorStatus).removeClass("on");
        $(".magicon", eSensorStatus).removeClass("active");
    }

    if (have_sensor(sensors_detected, "gps")) {
        $(".gps", eSensorStatus).addClass("on");
        if (gps_fix_state) {
            $(".gpsicon", eSensorStatus).removeClass("active");
            $(".gpsicon", eSensorStatus).addClass("active_fix");
        } else {
            $(".gpsicon", eSensorStatus).removeClass("active_fix");
            $(".gpsicon", eSensorStatus).addClass("active");
        }
    } else {
        $(".gps", eSensorStatus).removeClass("on");
        $(".gpsicon", eSensorStatus).removeClass("active");
        $(".gpsicon", eSensorStatus).removeClass("active_fix");
    }

    if (have_sensor(sensors_detected, "sonar")) {
        $(".sonar", eSensorStatus).addClass("on");
        $(".sonaricon", eSensorStatus).addClass("active");
    } else {
        $(".sonar", eSensorStatus).removeClass("on");
        $(".sonaricon", eSensorStatus).removeClass("active");
    }
}
