import semver from "semver";
import FC from "./fc";
import MSP from "./msp";
import { API_VERSION_1_47, API_VERSION_1_48 } from "./data_storage";
import { removeArrayElement, addArrayElement, addArrayElementsAfter } from "./utils/array";

// Map firmware sensor type names to configurator names
const SENSOR_NAME_MAP = {
    rangefinder: "sonar",
};

/**
 * Fetches sensor hardware names from the flight controller for API 1.48+.
 * Sends a single "sensor_hardware" command and parses the response lines in "type: VAL1,VAL2,..." format.
 * @returns {Promise<void>} Promise that resolves when all sensor names have been fetched
 */
export async function fetchSensorNames() {
    FC.SENSOR_NAMES = {
        acc: [],
        gyro: [],
        baro: [],
        mag: [],
        sonar: [],
        opticalflow: [],
    };

    try {
        const output = await new Promise((resolve) => {
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

            if (type in FC.SENSOR_NAMES) {
                FC.SENSOR_NAMES[type] = values;
            }
        }
    } catch (error) {
        console.warn(`Failed to fetch sensor hardware names: ${error.message}`);
    }
}

/**
 * Legacy sensor types function for older API versions.
 * Returns sensor type definitions with hardcoded lists and version-specific modifications.
 * @returns {Object} Object containing sensor type definitions with name and elements properties
 */
function sensorTypesLegacy() {
    const sensorTypes = {
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
 * @returns {Promise<Object>} Promise that resolves to an object containing sensor type definitions with name and elements properties
 */
export async function sensorTypes() {
    // For API 1.48+, fetch dynamic sensor names if not already fetched
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
        const hasSensorNames = FC.SENSOR_NAMES && Object.values(FC.SENSOR_NAMES).some((arr) => arr.length > 0);

        if (!hasSensorNames) {
            await fetchSensorNames();
        }

        return {
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
    } else {
        return sensorTypesLegacy();
    }
}

/**
 * Returns the list of available GPS protocol names.
 * For API 1.47+, includes VIRTUAL protocol.
 * @returns {string[]} Array of GPS protocol names
 */
export function gpsProtocols() {
    const protocols = ["NMEA", "UBLOX", "MSP"];

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        addArrayElement(protocols, "VIRTUAL");
    }

    return protocols;
}
