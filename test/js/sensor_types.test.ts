import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import { API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48, API_VERSION_1_49 } from "../../src/js/data_storage";
import { fetchSensorNames, gpsProtocols, sensorTypes } from "../../src/js/sensor_types";

function replyToCli(lines: string[]) {
    return vi.spyOn(MSP, "send_cli_command").mockImplementation((_command, callback) => {
        callback?.(lines);
    });
}

describe("sensor_types", () => {
    beforeEach(() => {
        FC.resetState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("fetchSensorNames", () => {
        it("parses each line into its sensor, mapping rangefinder to sonar", async () => {
            const cli = replyToCli(["gyro: AUTO, NONE, BMI270", "rangefinder: NONE,TFMINI", "mag: AUTO,NONE,QMC5883"]);

            await fetchSensorNames();

            expect(cli).toHaveBeenCalledWith("sensor_hardware", expect.any(Function));
            expect(FC.SENSOR_NAMES.gyro).toEqual(["AUTO", "NONE", "BMI270"]);
            expect(FC.SENSOR_NAMES.sonar).toEqual(["NONE", "TFMINI"]);
            expect(FC.SENSOR_NAMES.mag).toEqual(["AUTO", "NONE", "QMC5883"]);
            expect(FC.SENSOR_NAMES.acc).toEqual([]);
        });

        it("ignores lines without a separator and sensor types it does not know", async () => {
            replyToCli(["# sensor_hardware", "lidar: NONE,X", "baro: DEFAULT,NONE"]);

            await fetchSensorNames();

            expect(FC.SENSOR_NAMES).not.toHaveProperty("lidar");
            expect(FC.SENSOR_NAMES.baro).toEqual(["DEFAULT", "NONE"]);
        });
    });

    describe("sensorTypes", () => {
        it("uses the names the FC reports from API 1.48, fetching them once", async () => {
            FC.CONFIG.apiVersion = API_VERSION_1_48;
            const cli = replyToCli(["mag: AUTO,NONE,DRONECAN"]);

            const types = await sensorTypes();
            await sensorTypes();

            expect(cli).toHaveBeenCalledTimes(1);
            expect(types.mag).toEqual({ name: "Magnetometer", elements: ["AUTO", "NONE", "DRONECAN"] });
            expect(types.pitot).toBeUndefined();
        });

        it("adds pitot from API 1.49", async () => {
            FC.CONFIG.apiVersion = API_VERSION_1_49;
            replyToCli(["pitot: NONE,MS4525"]);

            const types = await sensorTypes();

            expect(types.pitot).toEqual({ name: "Pitot", elements: ["NONE", "MS4525"] });
        });

        it("falls back to the built-in lists before API 1.48", async () => {
            FC.CONFIG.apiVersion = API_VERSION_1_46;
            const cli = replyToCli([]);

            const types = await sensorTypes();

            expect(cli).not.toHaveBeenCalled();
            expect(types.gyro.elements).toContain("MPU3050");
            expect(types.pitot).toBeUndefined();
        });

        it("drops deprecated gyros and adds new ones for API 1.47", async () => {
            FC.CONFIG.apiVersion = API_VERSION_1_47;

            const types = await sensorTypes();

            expect(types.gyro.elements).not.toContain("MPU3050");
            expect(types.gyro.elements.slice(-6)).toEqual([
                "IIM42653",
                "ICM45605",
                "ICM45686",
                "ICM40609D",
                "IIM42652",
                "VIRTUAL",
            ]);
            expect(types.acc.elements).not.toContain("ADXL345");
        });
    });

    describe("gpsProtocols", () => {
        it("offers VIRTUAL from API 1.47", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_46;
            expect(gpsProtocols()).toEqual(["NMEA", "UBLOX", "MSP"]);

            FC.CONFIG.apiVersion = API_VERSION_1_47;
            expect(gpsProtocols()).toEqual(["NMEA", "UBLOX", "MSP", "VIRTUAL"]);
        });
    });
});
