import { defineStore } from "pinia";
import { computed } from "vue";
import FC from "../js/fc";
import semver from "semver";

export const useFlightControllerStore = defineStore("flightController", () => {
    // Proxy state directly to legacy reactive objects
    // FC is already reactive (export default reactive(FC)), so we just need to expose it

    const config = computed({
        get: () => FC.CONFIG,
        set: (val) => (FC.CONFIG = val),
    });

    const gpsConfig = computed({
        get: () => FC.GPS_CONFIG,
        set: (val) => (FC.GPS_CONFIG = val),
    });

    const features = computed({
        get: () => FC.FEATURE_CONFIG,
        set: (val) => (FC.FEATURE_CONFIG = val),
    });

    const beepers = computed({
        get: () => FC.BEEPER_CONFIG,
        set: (val) => (FC.BEEPER_CONFIG = val),
    });

    const gyroSensor = computed({
        get: () => FC.GYRO_SENSOR,
        set: (val) => (FC.GYRO_SENSOR = val),
    });

    const sensorAlignment = computed({
        get: () => FC.SENSOR_ALIGNMENT,
        set: (val) => (FC.SENSOR_ALIGNMENT = val),
    });

    const boardAlignment = computed({
        get: () => FC.BOARD_ALIGNMENT_CONFIG,
        set: (val) => (FC.BOARD_ALIGNMENT_CONFIG = val),
    });

    const sensorData = computed({
        get: () => FC.SENSOR_DATA,
        set: (val) => (FC.SENSOR_DATA = val),
    });

    const compassConfig = computed({
        get: () => FC.COMPASS_CONFIG,
        set: (val) => (FC.COMPASS_CONFIG = val),
    });

    const gpsData = computed({
        get: () => FC.GPS_DATA,
        set: (val) => (FC.GPS_DATA = val),
    });

    const analogData = computed({
        get: () => FC.ANALOG,
        set: (val) => (FC.ANALOG = val),
    });

    const rc = computed({
        get: () => FC.RC,
        set: (val) => (FC.RC = val),
    });

    const motorData = computed({
        get: () => FC.MOTOR_DATA,
        set: (val) => (FC.MOTOR_DATA = val),
    });

    const pidAdvancedConfig = computed({
        get: () => FC.PID_ADVANCED_CONFIG,
        set: (val) => (FC.PID_ADVANCED_CONFIG = val),
    });

    const sensorConfig = computed({
        get: () => FC.SENSOR_CONFIG,
        set: (val) => (FC.SENSOR_CONFIG = val),
    });

    const rxConfig = computed({
        get: () => FC.RX_CONFIG,
        set: (val) => (FC.RX_CONFIG = val),
    });

    const armingConfig = computed({
        get: () => FC.ARMING_CONFIG,
        set: (val) => (FC.ARMING_CONFIG = val),
    });

    // Computed Getters
    const apiVersion = computed(() => config.value.apiVersion);

    // Helpers
    function isApiVersionSupported(version) {
        return semver.gte(apiVersion.value, version);
    }

    function isApiVersionLessThan(version) {
        return semver.lt(apiVersion.value, version);
    }

    return {
        config,
        gpsConfig,
        features,
        beepers,
        gyroSensor,
        compassConfig,
        sensorAlignment,
        boardAlignment,
        sensorData,
        gpsData,
        analogData,
        rc,
        motorData,
        pidAdvancedConfig,
        sensorConfig,
        rxConfig,
        armingConfig,
        apiVersion,
        isApiVersionSupported,
        isApiVersionLessThan,
    };
});
