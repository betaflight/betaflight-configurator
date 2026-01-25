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

    const auxConfig = computed({
        get: () => FC.AUX_CONFIG,
        set: (val) => (FC.AUX_CONFIG = val),
    });

    const auxConfigIds = computed({
        get: () => FC.AUX_CONFIG_IDS,
        set: (val) => (FC.AUX_CONFIG_IDS = val),
    });

    const modeRanges = computed({
        get: () => FC.MODE_RANGES,
        set: (val) => (FC.MODE_RANGES = val),
    });

    const modeRangesExtra = computed({
        get: () => FC.MODE_RANGES_EXTRA,
        set: (val) => (FC.MODE_RANGES_EXTRA = val),
    });

    const adjustmentRanges = computed({
        get: () => FC.ADJUSTMENT_RANGES,
        set: (val) => (FC.ADJUSTMENT_RANGES = val),
    });

    const rssiConfig = computed({
        get: () => FC.RSSI_CONFIG,
        set: (val) => (FC.RSSI_CONFIG = val),
    });

    const failsafeConfig = computed({
        get: () => FC.FAILSAFE_CONFIG,
        set: (val) => (FC.FAILSAFE_CONFIG = val),
    });

    const gpsRescue = computed({
        get: () => FC.GPS_RESCUE,
        set: (val) => (FC.GPS_RESCUE = val),
    });

    const rxFailConfig = computed({
        get: () => FC.RXFAIL_CONFIG,
        set: (val) => (FC.RXFAIL_CONFIG = val),
    });

    const blackbox = computed({
        get: () => FC.BLACKBOX,
        set: (val) => (FC.BLACKBOX = val),
    });

    const dataflash = computed({
        get: () => FC.DATAFLASH,
        set: (val) => (FC.DATAFLASH = val),
    });

    const sdcard = computed({
        get: () => FC.SDCARD,
        set: (val) => (FC.SDCARD = val),
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
        auxConfig,
        auxConfigIds,
        modeRanges,
        modeRangesExtra,
        adjustmentRanges,
        rssiConfig,
        failsafeConfig,
        gpsRescue,
        rxFailConfig,
        blackbox,
        dataflash,
        sdcard,
        apiVersion,
        isApiVersionSupported,
        isApiVersionLessThan,
    };
});
