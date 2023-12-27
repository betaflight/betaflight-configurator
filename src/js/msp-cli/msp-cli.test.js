import { describe, expect, it } from "vitest";
import { parse } from "./msp-cli";
import MSPCodes from "../msp/MSPCodes";

/**
 * full command list of cli commands in firmware:
 * https://github.com/betaflight/betaflight/blob/7d122c481a64650e99f7f31009ddf657cc983271/src/main/cli/cli.c#L6456-L6612
 * full list of msp in firmware:
 * https://github.com/betaflight/betaflight/blob/778088013977eb089f8545fb0223c8e355069a00/src/main/msp/msp_protocol.h
 */

describe("MSP CLI", () => {
    describe.todo("aux");
    describe.todo("batch");
    describe.todo("beacon");
    describe.todo("beeper");
    describe.todo("bind_rx");
    describe.todo("bl");

    describe("board_name", () => {
        it("should return the board name msp code", () => {
            const input = "board_name";
            const expected = {
                code: MSPCodes.MSP2_GET_TEXT,
                data: [MSPCodes.CRAFT_NAME],
            };
            expect(parse(input)).toEqual(expected);
        });

        it("should return set text msp with craft name data", () => {
            const input = "board_name test";
            const expected = {
                code: MSPCodes.MSP2_SET_TEXT,
                data: [
                    MSPCodes.CRAFT_NAME,
                    ...new TextEncoder().encode("test"),
                ],
            };
            expect(parse(input)).toEqual(expected);
        });

        it("should throw an error for invalid craft name", () => {
            const input = "board_name invalid🚁name";
            expect(() => parse(input)).toThrow("Invalid craft name");
        });
    });

    describe.todo("color");
    describe.todo("defaults");
    describe.todo("diff");
    describe.todo("dma");

    describe("dshot_telemetry_info", () => {
        it("should return the dshot telemetry info MSP code", () => {
            const input = "dshot_telemetry_info";
            const expected = {
                code: MSPCodes.MSP_MOTOR_TELEMETRY,
            };
            expect(parse(input)).toEqual(expected);
        });
    });

    describe.todo("dshotprog");
    describe.todo("dump");
    describe.todo("escprog");

    describe("exit", () => {
        it("should throw an error for not implemented command", () => {
            const input = "exit";
            expect(() => parse(input)).toThrow("Not implemented");
        });
    });

    describe.todo("feature");
    describe.todo("flash_erase");
    describe.todo("flash_info");
    describe.todo("flash_read");
    describe.todo("flash_scan");
    describe.todo("flash_write");
    describe.todo("get");
    describe.todo("gpspassthrough");
    describe.todo("gyroregisters");
    describe.todo("help");
    describe.todo("led");
    describe.todo("manufacturer_id");
    describe.todo("map");

    describe("mcu_id", () => {
        it("should return the mcu id MSP code", () => {
            const input = "mcu_id";
            const expected = {
                code: MSPCodes.MSP_UID,
            };
            expect(parse(input)).toEqual(expected);
        });
    });

    describe.todo("mcu_id");
    describe.todo("mixer");
    describe.todo("mmix");
    describe.todo("mode_color");
    describe.todo("motor");
    describe.todo("msc");
    describe.todo("play_sound");
    describe.todo("profile");
    describe.todo("rateprofile");

    describe("rc_smoothing_info", () => {
        it("should return the rc smoothing info MSP code", () => {
            const input = "rc_smoothing_info";
            const expected = {
                code: MSPCodes.MSP_RX_CONFIG,
            };
            expect(parse(input)).toEqual(expected);
        });
    });

    describe.todo("resource");
    describe.todo("rxfail");
    describe.todo("rxrange");

    describe("save", () => {
        it("should return an array of save MSP codes", () => {
            const input = "save";
            const expected = [
                {
                    code: MSPCodes.MSP_SET_BOARD_INFO,
                },
                {
                    code: MSPCodes.MSP_SET_SIGNATURE,
                },
            ];
            expect(parse(input)).toEqual(expected);
        });
    });

    describe("sd_info", () => {
        it("should return the sd card info MSP code", () => {
            const input = "sd_info";
            const expected = {
                code: MSPCodes.MSP_SDCARD_SUMMARY,
            };
            expect(parse(input)).toEqual(expected);
        });
    });

    describe.todo("serial");
    describe.todo("serialpassthrough");
    describe.todo("servo");
    describe.todo("set");
    describe.todo("signature");
    describe.todo("simplified_tuning");
    describe.todo("smix");

    describe("status", () => {
        it("should return an array of status MSP codes", () => {
            const input = "status";
            const expected = [
                {
                    code: MSPCodes.MSP_BOARD_INFO,
                },
                {
                    code: MSPCodes.MSP_STATUS,
                },
                {
                    code: MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE,
                },
                {
                    code: MSPCodes.MSP2_GET_TEXT,
                    data: [MSPCodes.BUILD_KEY],
                },
                {
                    code: MSPCodes.MSP2_GET_TEXT,
                    data: [MSPCodes.MSP2TEXT_RELEASENAME],
                },
                {
                    code: MSPCodes.MSP_RTC,
                },
                {
                    code: MSPCodes.MSP_BATTERY_STATE,
                },
                {
                    code: MSPCodes.MSP_SDCARD_SUMMARY,
                },
                {
                    code: MSPCodes.MSP_GPS_CONFIG,
                },
                {
                    code: MSPCodes.MSP_RAW_GPS,
                },
                {
                    code: MSPCodes.MSP_COMP_GPS,
                },
                {
                    code: MSPCodes.MSP_GPSSVINFO,
                },
            ];
            expect(parse(input)).toEqual(expected);
        });
    });

    describe("tasks", () => {
        it("should throw an error for not implemented command", () => {
            const input = "tasks";
            expect(() => parse(input)).toThrow("Not implemented");
        });
    });

    describe.todo("timer");

    describe("version", () => {
        it("should return an array of version MSP codes", () => {
            const input = "version";
            const expected = [
                {
                    code: MSPCodes.MSP_BOARD_INFO,
                },
                {
                    code: MSPCodes.MSP_BUILD_INFO,
                },
                {
                    code: MSPCodes.MSP_API_VERSION,
                },
            ];
            expect(parse(input)).toEqual(expected);
        });
    });

    describe.todo("vtx");

    describe("vtx_info", () => {
        it("should return the vtx info MSP code", () => {
            const input = "vtx_info";
            const expected = {
                code: MSPCodes.MSP2_GET_VTX_DEVICE_STATUS,
            };
            expect(parse(input)).toEqual(expected);
        });
    });

    describe.todo("vtxtable");
});
