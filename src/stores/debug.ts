/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { defineStore } from "pinia";
import { computed } from "vue";
import { useFlightControllerStore } from "./fc";
import semver from "semver";
import { API_VERSION_1_47, API_VERSION_1_49 } from "../js/data_storage";
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

        if (semver.gte(apiVersion, API_VERSION_1_49)) {
            addArrayElement(result, "Pitot");
        }

        return result;
    });

    return {
        modes,
        fieldNames,
        enableFields,
    };
});
