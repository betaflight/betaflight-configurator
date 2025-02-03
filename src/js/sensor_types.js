import semver from "semver";
import FC from "./fc";
import { API_VERSION_1_47 } from "./data_storage";

export function getSensorTypes() {
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
            elements: ["UBLOX", "NMEA", "AUTO", "NONE"],
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

    // remove deprecated sensors or add new ones
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        const gyroIndexL3G4200D = gyroElements.indexOf("L3G4200D");
        if (gyroIndexL3G4200D !== -1) gyroElements.splice(gyroIndexL3G4200D, 1);

        const gyroIndexMPU3050 = gyroElements.indexOf("MPU3050");
        if (gyroIndexMPU3050 !== -1) gyroElements.splice(gyroIndexMPU3050, 1);

        const gyroIndexLSM6DSV16X = gyroElements.indexOf("LSM6DSV16X");
        if (gyroIndexLSM6DSV16X !== -1) gyroElements.splice(gyroIndexLSM6DSV16X + 1, 0, "IIM42653");

        const accIndexADXL345 = accElements.indexOf("ADXL345");
        if (accIndexADXL345 !== -1) accElements.splice(accIndexADXL345, 1);

        const accIndexMMA8452 = accElements.indexOf("MMA8452");
        if (accIndexMMA8452 !== -1) accElements.splice(accIndexMMA8452, 1);

        const accIndexBMA280 = accElements.indexOf("BMA280");
        if (accIndexBMA280 !== -1) accElements.splice(accIndexBMA280, 1);

        const accIndexLSM303DLHC = accElements.indexOf("LSM303DLHC");
        if (accIndexLSM303DLHC !== -1) accElements.splice(accIndexLSM303DLHC, 1);

        const accIndexLSM6DSV16X = accElements.indexOf("LSM6DSV16X");
        if (accIndexLSM6DSV16X !== -1) accElements.splice(accIndexLSM6DSV16X + 1, 0, "IIM42653");
    }

    return sensorTypes;
}
