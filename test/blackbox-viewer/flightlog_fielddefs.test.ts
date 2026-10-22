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

import { describe, expect, it } from "vitest";
import * as fieldDefs from "../../src/blackbox-viewer/flightlog_fielddefs";
import {
    adjustFieldDefsList,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_CLEANFLIGHT,
} from "../../src/blackbox-viewer/flightlog_fielddefs";

// The header logs hardware as an index into these tables, so the position of every name
// matters, not only which names are present. Flight mode names are covered with the
// presenter's flag decoding in blackbox_fields_presenter.test.js.

const ACC_COMPLETE = [
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
];
const MAG_COMPLETE = ["AUTO", "NONE", "HMC5883", "AK8975", "AK8963", "QMC5883", "LIS3MDL", "MAG_MPU925X_AK8963"];

describe("adjustFieldDefsList hardware names", () => {
    it("uses the complete lists before 4.5", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "4.4.0");

        expect(fieldDefs.ACC_HARDWARE).toEqual(ACC_COMPLETE);
        expect(fieldDefs.MAG_HARDWARE).toEqual(MAG_COMPLETE);
    });

    it("adds LIS2MDL and IST8310 to the magnetometers from 4.5", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "4.5.0");

        expect(fieldDefs.MAG_HARDWARE).toEqual([
            "AUTO",
            "NONE",
            "HMC5883",
            "AK8975",
            "AK8963",
            "QMC5883",
            "LIS2MDL",
            "LIS3MDL",
            "MAG_MPU925X_AK8963",
            "IST8310",
        ]);
        expect(fieldDefs.ACC_HARDWARE).toEqual(ACC_COMPLETE);
    });

    it("drops the retired accelerometers and adds IIM42653 from 2025.12", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "2025.12.0");

        expect(fieldDefs.ACC_HARDWARE).toEqual([
            "AUTO",
            "NONE",
            "MPU6050",
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
            "IIM42653",
            "VIRTUAL",
        ]);
    });

    it("uses the complete lists for other firmware, whatever the version", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_CLEANFLIGHT, "2025.12.0");

        expect(fieldDefs.ACC_HARDWARE).toEqual(ACC_COMPLETE);
        expect(fieldDefs.MAG_HARDWARE).toEqual(MAG_COMPLETE);
    });

    it("hands out frozen lists, so a reader cannot corrupt them for the next log", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "2025.12.0");
        expect(Object.isFrozen(fieldDefs.ACC_HARDWARE)).toBe(true);
        expect(Object.isFrozen(fieldDefs.MAG_HARDWARE)).toBe(true);
        expect(Object.isFrozen(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe(true);

        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "3.2.0");
        expect(Object.isFrozen(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe(true);
    });
});

describe("adjustFieldDefsList pre-3.3 flight mode names", () => {
    it("drops ANTIGRAVITY up to Betaflight 3.1.6 and keeps it from 3.1.7", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "3.1.6");
        expect(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME).not.toContain("ANTIGRAVITY");
        expect(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME[4]).toBe("MAG");

        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "3.1.7");
        expect(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME[4]).toBe("ANTIGRAVITY");
    });

    it("keeps ANTIGRAVITY for other firmware", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_CLEANFLIGHT, "1.0.0");

        expect(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME).toEqual(fieldDefs.FLIGHT_LOG_FLIGHT_MODE_NAME_PRE_3_3);
    });
});
