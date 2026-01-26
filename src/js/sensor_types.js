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
            const values = line.substring("Allowed values: ".length).split(", ");
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
            const output = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("CLI command timeout")), 2000);
                MSP.send_cli_command(sensor.command, (output) => {
                    clearTimeout(timeout);
                    resolve(output);
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
 * Returns sensor type definitions with display names and available hardware options.
 * For API 1.48+, uses dynamically fetched sensor names if available, otherwise falls back to hardcoded lists.
 * For older APIs, applies version-specific modifications to the sensor lists.
 * @returns {Object} Object containing sensor type definitions with name and elements properties
 */
export function sensorTypes() {
    const sensorTypes = {
        acc: {
            name: "Accelerometer",
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.acc.length > 0
                    ? FC.SENSOR_NAMES.acc
                    : [
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
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.gyro.length > 0
                    ? FC.SENSOR_NAMES.gyro
                    : [
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
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.baro.length > 0
                    ? FC.SENSOR_NAMES.baro
                    : [
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
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.mag.length > 0
                    ? FC.SENSOR_NAMES.mag
                    : [
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
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.gps.length > 0 ? FC.SENSOR_NAMES.gps : ["NMEA", "UBLOX", "MSP"],
        },
        sonar: {
            name: "Sonar",
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.sonar.length > 0
                    ? FC.SENSOR_NAMES.sonar
                    : ["NONE", "HCSR04", "TFMINI", "TF02", "MTF01", "MTF02", "MTF01P", "MTF02P", "TFNOVA"],
        },
        opticalflow: {
            name: "Optical Flow",
            elements:
                FC.SENSOR_NAMES && FC.SENSOR_NAMES.opticalflow.length > 0
                    ? FC.SENSOR_NAMES.opticalflow
                    : ["NONE", "MT"],
        },
    };

    const gyroElements = sensorTypes.gyro.elements;
    const accElements = sensorTypes.acc.elements;
    const gpsElements = sensorTypes.gps.elements;

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

        addArrayElement(gpsElements, "VIRTUAL");
    }

    return sensorTypes;
}
