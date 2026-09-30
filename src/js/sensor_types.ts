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

import semver from "semver";
import FC from "./fc";
import MSP from "./msp";
import { API_VERSION_1_47, API_VERSION_1_48, API_VERSION_1_49 } from "./data_storage";
import { removeArrayElement, addArrayElement, addArrayElementsAfter } from "./utils/array";
import type { SensorNames } from "../stores/fc.types";

export type SensorKind = keyof SensorNames;

export interface SensorTypeDef {
    name: string;
    elements: string[];
}

/** Every kind but pitot is always listed; pitot only from API 1.49. */
export type SensorTypes = Record<Exclude<SensorKind, "pitot">, SensorTypeDef> & { pitot?: SensorTypeDef };

// Map firmware sensor type names to configurator names
const SENSOR_NAME_MAP: Record<string, string | undefined> = {
    rangefinder: "sonar",
};

function isSensorKind(names: SensorNames, type: string): type is SensorKind {
    return type in names;
}

/**
 * Fetches sensor hardware names from the flight controller for API 1.48+.
 * Sends a single "sensor_hardware" command and parses the response lines in "type: VAL1,VAL2,..." format.
 */
export async function fetchSensorNames() {
    FC.SENSOR_NAMES = {
        acc: [],
        gyro: [],
        baro: [],
        mag: [],
        sonar: [],
        opticalflow: [],
        pitot: [],
    };

    try {
        const output = await new Promise<string[]>((resolve) => {
            MSP.send_cli_command("sensor_hardware", (response) => {
                resolve([...response]);
            });
        });

        const text = output.join("\n");
        for (const line of text.split("\n")) {
            const separatorIndex = line.indexOf(": ");
            if (separatorIndex === -1) {
                continue;
            }

            const firmwareType = line.substring(0, separatorIndex).trim();
            const type = SENSOR_NAME_MAP[firmwareType] ?? firmwareType;
            const values = line
                .substring(separatorIndex + 2)
                .split(",")
                .map((v) => v.trim());

            if (isSensorKind(FC.SENSOR_NAMES, type)) {
                FC.SENSOR_NAMES[type] = values;
            }
        }
    } catch (error) {
        console.warn(`Failed to fetch sensor hardware names: ${(error as Error).message}`);
    }
}

/**
 * Legacy sensor types function for older API versions.
 * Returns sensor type definitions with hardcoded lists and version-specific modifications.
 */
function sensorTypesLegacy(): SensorTypes {
    const sensorTypes: SensorTypes = {
        acc: {
            name: "Accelerometer",
            elements: [
                "AUTO",
                "NONE",
                "ADXL345",
                "MPU6050",
                "MMA8452",
                "BMA280",
                "LSM303DLHC",
                "MPU6000",
                "MPU6500",
                "MPU9250",
                "ICM20601",
                "ICM20602",
                "ICM20608G",
                "ICM20649",
                "ICM20689",
                "ICM42605",
                "ICM42688P",
                "BMI160",
                "BMI270",
                "LSM6DSO",
                "LSM6DSV16X",
                "VIRTUAL",
            ],
        },
        gyro: {
            name: "Gyroscope",
            elements: [
                "AUTO",
                "NONE",
                "MPU6050",
                "L3G4200D",
                "MPU3050",
                "L3GD20",
                "MPU6000",
                "MPU6500",
                "MPU9250",
                "ICM20601",
                "ICM20602",
                "ICM20608G",
                "ICM20649",
                "ICM20689",
                "ICM42605",
                "ICM42688P",
                "BMI160",
                "BMI270",
                "LSM6DSO",
                "LSM6DSV16X",
                "VIRTUAL",
            ],
        },
        baro: {
            name: "Barometer",
            elements: [
                "DEFAULT",
                "NONE",
                "BMP085",
                "MS5611",
                "BMP280",
                "LPS",
                "QMP6988",
                "BMP388",
                "DPS310",
                "2SMPB_02B",
                "VIRTUAL",
            ],
        },
        mag: {
            name: "Magnetometer",
            elements: [
                "DEFAULT",
                "NONE",
                "HMC5883",
                "AK8975",
                "AK8963",
                "QMC5883",
                "LIS2MDL",
                "LIS3MDL",
                "MPU925X_AK8963",
                "IST8310",
            ],
        },
        sonar: {
            name: "Sonar",
            elements: ["NONE", "HCSR04", "TFMINI", "TF02", "MTF01", "MTF02", "MTF01P", "MTF02P", "TFNOVA"],
        },
        opticalflow: {
            name: "Optical Flow",
            elements: ["NONE", "MT"],
        },
    };

    const gyroElements = sensorTypes.gyro.elements;
    const accElements = sensorTypes.acc.elements;

    // remove deprecated sensors or add new ones, only for API 1.47 (not for 1.48+ which uses dynamic names)
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_48) && semver.eq(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        removeArrayElement(gyroElements, "L3G4200D");
        removeArrayElement(gyroElements, "MPU3050");
        addArrayElementsAfter(gyroElements, "LSM6DSV16X", [
            "IIM42653",
            "ICM45605",
            "ICM45686",
            "ICM40609D",
            "IIM42652",
        ]);

        removeArrayElement(accElements, "ADXL345");
        removeArrayElement(accElements, "MMA8452");
        removeArrayElement(accElements, "BMA280");
        removeArrayElement(accElements, "LSM303DLHC");
        addArrayElementsAfter(accElements, "LSM6DSV16X", ["IIM42653", "ICM45605", "ICM45686", "ICM40609D", "IIM42652"]);
    }

    return sensorTypes;
}

/**
 * Returns sensor type definitions with display names and available hardware options.
 * For API 1.48+, automatically fetches dynamic sensor names from the flight controller if not already available.
 * For older APIs, uses hardcoded lists with version-specific modifications.
 */
export async function sensorTypes(): Promise<SensorTypes> {
    // For API 1.48+, fetch dynamic sensor names if not already fetched
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
        const hasSensorNames = FC.SENSOR_NAMES && Object.values(FC.SENSOR_NAMES).some((arr) => arr.length > 0);

        if (!hasSensorNames) {
            await fetchSensorNames();
        }

        const sensorTypeList: SensorTypes = {
            acc: {
                name: "Accelerometer",
                elements: FC.SENSOR_NAMES.acc || [],
            },
            gyro: {
                name: "Gyroscope",
                elements: FC.SENSOR_NAMES.gyro || [],
            },
            baro: {
                name: "Barometer",
                elements: FC.SENSOR_NAMES.baro || [],
            },
            mag: {
                name: "Magnetometer",
                elements: FC.SENSOR_NAMES.mag || [],
            },
            sonar: {
                name: "Sonar",
                elements: FC.SENSOR_NAMES.sonar || [],
            },
            opticalflow: {
                name: "Optical Flow",
                elements: FC.SENSOR_NAMES.opticalflow || [],
            },
        };

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_49)) {
            sensorTypeList.pitot = {
                name: "Pitot",
                elements: FC.SENSOR_NAMES.pitot || [],
            };
        }

        return sensorTypeList;
    } else {
        return sensorTypesLegacy();
    }
}

/**
 * Returns the list of available GPS protocol names.
 * For API 1.47+, includes VIRTUAL protocol.
 */
export function gpsProtocols(): string[] {
    const protocols = ["NMEA", "UBLOX", "MSP"];

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        addArrayElement(protocols, "VIRTUAL");
    }

    return protocols;
}
