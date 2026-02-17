import semver from "semver";
import FC from "./fc";
import MSP from "./msp";
import { API_VERSION_1_47, API_VERSION_1_48 } from "./data_storage";
import { removeArrayElement, addArrayElement, addArrayElementsAfter } from "./utils/array";

/**
 * Parses CLI command output to extract allowed hardware values.
 * @param {string[]} output - Array of output lines from CLI command
 * @returns {string[]} Array of allowed hardware values
 */
function parseHardwareOutput(output) {
    const text = output.join("\n");
    const lines = text.split("\n");
    for (const line of lines) {
        if (line.startsWith("Allowed values: ")) {
            const valuesStr = line.substring("Allowed values: ".length);
            const values = valuesStr.split(", ");
            return values;
        }
    }
    return [];
}

/**
 * Fetches sensor hardware names from the flight controller for API 1.48+.
 * This function queries the FC for available sensor hardware options and populates FC.SENSOR_NAMES.
 * @returns {Promise<void>} Promise that resolves when all sensor names have been fetched
 */
export async function fetchSensorNames() {
    const sensorCommands = [
        { type: "acc", command: "get acc_hardware" },
        { type: "gyro", command: "get gyro_hardware" },
        { type: "baro", command: "get baro_hardware" },
        { type: "mag", command: "get mag_hardware" },
        { type: "gps", command: "get gps_provider" },
        { type: "sonar", command: "get rangefinder_hardware" },
        { type: "opticalflow", command: "get opticalflow_hardware" },
    ];

    FC.SENSOR_NAMES = {
        acc: [],
        gyro: [],
        baro: [],
        mag: [],
        gps: [],
        sonar: [],
        opticalflow: [],
    };

    for (const sensor of sensorCommands) {
        try {
            const output = await new Promise((resolve) => {
                MSP.send_cli_command(sensor.command, (response) => {
                    resolve([...response]); // Make a copy to avoid reference issues
                });
            });
            FC.SENSOR_NAMES[sensor.type] = parseHardwareOutput(output);
        } catch (error) {
            console.warn(`Failed to fetch ${sensor.type} sensor names: ${error.message}`);
            // Continue with empty array for this sensor type
        }
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
        gps: {
            name: "GPS",
            elements: ["NMEA", "UBLOX", "MSP"],
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
    const gpsElements = sensorTypes.gps.elements;

    // remove deprecated sensors (API 1.47)
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        removeArrayElement(gyroElements, "L3G4200D");
        removeArrayElement(gyroElements, "MPU3050");
        removeArrayElement(accElements, "ADXL345");
        removeArrayElement(accElements, "MMA8452");
        removeArrayElement(accElements, "BMA280");
        removeArrayElement(accElements, "LSM303DLHC");
    }

    // Add new sensors, only for API 1.47 (API 1.48+ uses dynamic names)
    if (semver.eq(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        addArrayElementsAfter(gyroElements, "LSM6DSV16X", [
            "IIM42653",
            "ICM45605",
            "ICM45686",
            "ICM40609D",
            "IIM42652",
        ]);

        addArrayElementsAfter(accElements, "LSM6DSV16X", ["IIM42653", "ICM45605", "ICM45686", "ICM40609D", "IIM42652"]);
    }

    // Update GNSS Provider
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47) {
        addArrayElement(gpsElements, "VIRTUAL");
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
        // Check if we already have sensor names
        const hasSensorNames = FC.SENSOR_NAMES && Object.values(FC.SENSOR_NAMES).some((arr) => arr.length > 0);

        if (!hasSensorNames) {
            await fetchSensorNames();
        }

        // Ensure FC.SENSOR_NAMES exists (defensive programming)
        if (!FC.SENSOR_NAMES) {
            FC.SENSOR_NAMES = {
                acc: [],
                gyro: [],
                baro: [],
                mag: [],
                gps: [],
                sonar: [],
                opticalflow: [],
            };
        }

        // Return types using the fetched sensor names
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
            gps: {
                name: "GPS",
                elements: FC.SENSOR_NAMES.gps || [],
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
        // For older APIs, use the legacy function synchronously
        return sensorTypesLegacy();
    }
}
