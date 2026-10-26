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
import {
    acceptedApiMinor,
    apiMinor,
    compare,
    parseDefines,
    parseEnum,
    readConfiguratorCodes,
} from "../../../scripts/check-msp-codes.mjs";

/*
 * The text half of `scripts/check-msp-codes.mjs`. The network half only fetches,
 * so what can go wrong is here: reading a header, reading the enum, and deciding
 * what counts as drift when the configurator still speaks to older firmware.
 */

const HEADER = [
    "#define API_VERSION_MINOR               49",
    "#define MSP_API_VERSION                 1    // out message: Get API version",
    "// 55 was MSP_SET_CF_SERIAL_CONFIG; serial ports are set through the CLI over MSP",
    "#define MSP_SONAR_ALTITUDE              58",
    "#define MSP2_BETAFLIGHT_BIND                0x3000",
    "#define MSP2_CLI_COMMAND_FLAG_TRUNCATED     (1 << 0)",
    "#define MSP2TEXT_PILOT_NAME                      1",
    '#define MULTIWII_IDENTIFIER "MWII";',
].join("\n");

const ENUM_SOURCE = [
    "enum MSPCodes {",
    "    MSP_API_VERSION = 1,",
    "    //MSP_IDENT:                      100, // DEPRECTED",
    "    MSP_SONAR_ALTITUDE = 58, // notice",
    "    MSP2_BETAFLIGHT_BIND = 0x3000,",
    "}",
    "export enum MSP2TextType {",
    "    PILOT_NAME = 1,",
    "}",
].join("\n");

function ref(name: string, minor: number, defines: Record<string, number>) {
    return { ref: name, minor, defines: new Map(Object.entries(defines)) };
}

describe("parseDefines", () => {
    it("reads decimal and hex command codes and the MSP2TEXT types", () => {
        expect(parseDefines(HEADER)).toEqual(
            new Map([
                ["MSP_API_VERSION", 1],
                ["MSP_SONAR_ALTITUDE", 58],
                ["MSP2_BETAFLIGHT_BIND", 0x3000],
                ["MSP2TEXT_PILOT_NAME", 1],
            ]),
        );
    });

    it("skips a retired code that survives only in a comment", () => {
        expect(parseDefines(HEADER).has("MSP_SET_CF_SERIAL_CONFIG")).toBe(false);
    });
});

describe("parseEnum", () => {
    it("reads the forward entries and skips commented-out members", () => {
        expect(parseEnum(ENUM_SOURCE, "MSPCodes")).toEqual(
            new Map([
                ["MSP_API_VERSION", 1],
                ["MSP_SONAR_ALTITUDE", 58],
                ["MSP2_BETAFLIGHT_BIND", 0x3000],
            ]),
        );
    });

    it("fails on an enum that is not there", () => {
        expect(() => parseEnum(ENUM_SOURCE, "Nope")).toThrow("No enum Nope");
    });
});

describe("readConfiguratorCodes", () => {
    it("folds the text types in under the firmware's prefix", () => {
        expect(readConfiguratorCodes(ENUM_SOURCE).get("MSP2TEXT_PILOT_NAME")).toBe(1);
    });
});

describe("apiMinor", () => {
    it("reads API_VERSION_MINOR", () => {
        expect(apiMinor(HEADER)).toBe(49);
    });

    it("reads the minor of API_VERSION_ACCEPTED", () => {
        expect(acceptedApiMinor("export const API_VERSION_ACCEPTED = API_VERSION_1_44;\n")).toBe(44);
    });
});

describe("compare", () => {
    const master = ref("master", 49, { MSP_SONAR_ALTITUDE: 58, MSP_REBOOT: 68, MSP_NEW_THING: 200 });
    const maintenance = ref("4.5-maintenance", 46, {
        MSP_SONAR_ALTITUDE: 58,
        MSP_REBOOT: 68,
        MSP_SET_CF_SERIAL_CONFIG: 55,
    });

    it("passes a name the newest firmware dropped while an older supported one still answers", () => {
        const codes = new Map([["MSP_SET_CF_SERIAL_CONFIG", 55]]);
        expect(compare(codes, [master, maintenance]).errors).toEqual([]);
    });

    it("names the firmware's current name for a renamed code", () => {
        const codes = new Map([["MSP_SONAR", 58]]);
        expect(compare(codes, [master, maintenance]).errors).toEqual([
            "MSP_SONAR = 58: firmware calls 58 MSP_SONAR_ALTITUDE",
        ]);
    });

    it("fails a code no supported firmware defines", () => {
        const codes = new Map([["MSP_MISC", 114]]);
        expect(compare(codes, [master, maintenance]).errors).toEqual([
            "MSP_MISC = 114: no supported firmware defines it",
        ]);
    });

    it("fails a value that disagrees with any supported firmware", () => {
        const codes = new Map([["MSP_REBOOT", 69]]);
        expect(compare(codes, [master, maintenance]).errors).toEqual([
            "MSP_REBOOT = 69: master has 68",
            "MSP_REBOOT = 69: 4.5-maintenance has 68",
        ]);
    });

    it("lists, without failing, what the newest firmware defines and the configurator does not", () => {
        const codes = new Map([["MSP_SONAR_ALTITUDE", 58]]);
        expect(compare(codes, [master, maintenance])).toEqual({
            errors: [],
            firmwareOnly: ["MSP_REBOOT = 68", "MSP_NEW_THING = 200"],
        });
    });

    it("prints MSPv2 codes in hex", () => {
        const codes = new Map([["MSP2_GONE", 0x3fff]]);
        expect(compare(codes, [master]).errors).toEqual(["MSP2_GONE = 0x3fff: no supported firmware defines it"]);
    });
});
