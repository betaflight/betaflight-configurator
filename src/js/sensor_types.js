import semver from "semver";
import FC from "./fc";
import { API_VERSION_1_47 } from "./data_storage";
import { removeArrayElement, addArrayElement, addArrayElementsAfter } from "./utils/array";

export function sensorTypes() {
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
            elements: ["NONE", "HCSR04", "TFMINI", "TF02", "MTF01", "MTF02", "MTF01P", "MTF02P"],
        },
        opticalflow: {
            name: "Optical Flow",
            elements: ["NONE", "MT"],
        },
    };

    const gyroElements = sensorTypes.gyro.elements;
    const accElements = sensorTypes.acc.elements;
    const gpsElements = sensorTypes.gps.elements;

    // remove deprecated sensors or add new ones
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        removeArrayElement(gyroElements, "L3G4200D");
        removeArrayElement(gyroElements, "MPU3050");
        addArrayElementsAfter(gyroElements, "LSM6DSV16X", ["IIM42653", "ICM45605", "ICM45686"]);

        removeArrayElement(accElements, "ADXL345");
        removeArrayElement(accElements, "MMA8452");
        removeArrayElement(accElements, "BMA280");
        removeArrayElement(accElements, "LSM303DLHC");
        addArrayElementsAfter(accElements, "LSM6DSV16X", ["IIM42653", "ICM45605", "ICM45686"]);

        addArrayElement(gpsElements, "VIRTUAL");
    }

    return sensorTypes;
}
