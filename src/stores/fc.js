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
        features,
        beepers,
        gyroSensor,
        sensorAlignment,
        boardAlignment,
        apiVersion,
        isApiVersionSupported,
        isApiVersionLessThan,
    };
});
