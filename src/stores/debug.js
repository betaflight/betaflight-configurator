import { defineStore } from "pinia";
import { computed } from "vue";
import { useFlightControllerStore } from "./fc";
import semver from "semver";
import { API_VERSION_1_47 } from "../js/data_storage";
import { addArrayElement, addArrayElementAfter } from "../js/utils/array";
import { getDebugModes, getDebugFieldNames } from "../js/utils/debugModes";

export const useDebugStore = defineStore("debug", () => {
    const fcStore = useFlightControllerStore();

    const modes = computed(() => getDebugModes(fcStore.config?.apiVersion));

    const fieldNames = computed(() => getDebugFieldNames(fcStore.config?.apiVersion));

    const enableFields = computed(() => {
        const baseFields = [
            "PID",
            "RC Commands",
            "Setpoint",
            "Battery",
            "Magnetometer",
            "Altitude",
            "RSSI",
            "Gyro",
            "Accelerometer",
            "Debug Log",
            "Motor",
            "GPS",
            "RPM",
            "Gyro (Unfiltered)",
        ];

        const apiVersion = fcStore.config?.apiVersion;
        if (!apiVersion) {
            return baseFields;
        }

        const result = [...baseFields];

        if (semver.gte(apiVersion, API_VERSION_1_47)) {
            addArrayElementAfter(result, "Gyro", "Attitude");
            addArrayElement(result, "Servo");
        }

        return result;
    });

    return {
        modes,
        fieldNames,
        enableFields,
    };
});
