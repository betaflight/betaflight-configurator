import { beforeEach, describe, expect, it } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";
import FC from "../../../src/js/fc";
import { API_VERSION_1_47 } from "../../../src/js/data_storage";

describe("MspHelper", () => {
    const mspHelper = new MspHelper();
    beforeEach(() => {
        FC.resetState();
    });
    describe("process_data", () => {
        it("refuses to process data with crc-error", () => {
            let callbackCalled = false;

            let callbackFunction = (item) => {
                callbackCalled = true;
                expect(item["crcError"]).toEqual(true);
                expect(item["command"]).toEqual(MSPCodes.MSP_BOARD_INFO);
                expect(item["length"]).toEqual(0);
            };

            mspHelper.process_data({
                code: MSPCodes.MSP_BOARD_INFO,
                dataView: new DataView(new Uint8Array([]).buffer),
                crcError: true,
                callbacks: [
                    {
                        callback: callbackFunction,
                        code: MSPCodes.MSP_BOARD_INFO,
                    },
                ],
            });

            expect(callbackCalled).toEqual(true);
        });
        it("handles MSP_API_VERSION correctly", () => {
            let randomValues = crypto.getRandomValues(new Uint8Array(3));
            const [mspProtocolVersion, apiVersionMajor, apiVersionMinor] = randomValues;
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new DataView(randomValues.buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.CONFIG.mspProtocolVersion).toEqual(mspProtocolVersion);
            expect(FC.CONFIG.apiVersion).toEqual(`${apiVersionMajor}.${apiVersionMinor}.0`);
        });
        it("handles MSP_PIDNAMES correctly", () => {
            let pidNamesCount = 1 + crypto.getRandomValues(new Uint8Array(1))[0];
            let expectedNames = Array.from({ length: pidNamesCount }).map((_) => generateRandomString());

            let lowLevelData = [];
            appendStringToArray(lowLevelData, `${expectedNames.join(";")};`);

            mspHelper.process_data({
                code: MSPCodes.MSP_PIDNAMES,
                dataView: new DataView(new Uint8Array(lowLevelData).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.PID_NAMES).toEqual(expectedNames);
        });
        it("handles MSP_MOTOR correctly", () => {
            let motorCount = crypto.getRandomValues(new Uint8Array(1))[0] % 8;
            let motorBytes = crypto.getRandomValues(new Uint16Array(motorCount));

            mspHelper.process_data({
                code: MSPCodes.MSP_MOTOR,
                dataView: new DataView(new Uint16Array(motorBytes).buffer),
                crcError: false,
                callbacks: [],
            });
            expect(new Uint16Array(FC.MOTOR_DATA).slice(0, motorCount)).toEqual(motorBytes);
            expect(FC.MOTOR_DATA.slice(motorCount, 8)).toContain(undefined);
        });
        it("handles MSP_BOARD_INFO correctly for API version", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_47;
            let infoBuffer = [];

            const boardIdentifier = appendStringToArray(infoBuffer, generateRandomString(4)); // set board-identifier

            infoBuffer.push16(0xdead); // set board version
            infoBuffer.push8(0x12); // set board type
            infoBuffer.push8(0x32); // set target capabilities

            const targetName = appendStringToArray(infoBuffer, generateRandomString(), true); // set target name
            const boardName = appendStringToArray(infoBuffer, generateRandomString(), true); // set board name
            const manufacturerId = appendStringToArray(infoBuffer, generateRandomString(), true); // set board name
            const signature = crypto.getRandomValues(new Uint8Array(32));

            signature.forEach((element) => infoBuffer.push8(element));
            infoBuffer.push8(0xfa); // mcu type id
            infoBuffer.push8(0xbb); // configuration state
            infoBuffer.push16(0xbaab); // sample rate
            infoBuffer.push32(0xdeadbeef); // configuration problems

            mspHelper.process_data({
                code: MSPCodes.MSP_BOARD_INFO,
                dataView: new DataView(new Uint8Array(infoBuffer).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.CONFIG.boardIdentifier).toEqual(boardIdentifier);
            expect(FC.CONFIG.boardVersion).toEqual(0xdead);
            expect(FC.CONFIG.boardType).toEqual(0x12);
            expect(FC.CONFIG.targetCapabilities).toEqual(0x32);
            expect(FC.CONFIG.targetName).toEqual(targetName);
            expect(FC.CONFIG.boardName).toEqual(boardName);
            expect(FC.CONFIG.manufacturerId).toEqual(manufacturerId);
            expect(new Uint8Array(FC.CONFIG.signature)).toEqual(signature);
            expect(FC.CONFIG.mcuTypeId).toEqual(0xfa);

            expect(FC.CONFIG.configurationState).toEqual(0xbb);
            expect(FC.CONFIG.sampleRateHz).toEqual(0xbaab);
            expect(FC.CONFIG.configurationProblems).toEqual(0xdeadbeef);
        });
        it("handles MSP_SERVO_MIX_RULES with a valid payload", () => {
            // Two rules × 7 bytes. The signed fields (rate, min, max) need
            // to round-trip as i8 — using -50 / -100 / +100 exercises both
            // the negative wraparound on the wire and the read8 sign-extend.
            const payload = [3, 0, +100, 5, -100, +100, 0, 4, 0, -50, 0, -100, +100, 1].map((v) => v & 0xff);

            mspHelper.process_data({
                code: MSPCodes.MSP_SERVO_MIX_RULES,
                dataView: new DataView(new Uint8Array(payload).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.SERVO_RULES_PARSE_OK).toBe(true);
            expect(FC.SERVO_RULES).toHaveLength(2);
            expect(FC.SERVO_RULES[0]).toEqual({
                target: 3,
                input: 0,
                rate: 100,
                speed: 5,
                min: -100,
                max: 100,
                box: 0,
            });
            expect(FC.SERVO_RULES[1]).toEqual({
                target: 4,
                input: 0,
                rate: -50,
                speed: 0,
                min: -100,
                max: 100,
                box: 1,
            });
        });
        it("handles empty MSP_SERVO_MIX_RULES payload as zero rules", () => {
            // FC with no servo mixer rules legitimately returns a 0-byte
            // payload. Must NOT trip the malformed-parse flag — that would
            // disable Save on a perfectly valid empty-mix board.
            mspHelper.process_data({
                code: MSPCodes.MSP_SERVO_MIX_RULES,
                dataView: new DataView(new Uint8Array([]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.SERVO_RULES).toEqual([]);
            expect(FC.SERVO_RULES_PARSE_OK).toBe(true);
        });
        it("flags malformed MSP_SERVO_MIX_RULES so Save can't wipe the FC mix", () => {
            // Payload length not a multiple of 7 bytes (firmware bug or
            // corrupted frame). The previous code silently logged a warning
            // and left FC.SERVO_RULES = [], so the next Save would push 16
            // zero rows and persist them to EEPROM — destroying the pilot's
            // mix. The SERVO_RULES_PARSE_OK flag is the gate ServosTab uses
            // to disable Save in this case.
            mspHelper.process_data({
                code: MSPCodes.MSP_SERVO_MIX_RULES,
                dataView: new DataView(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.SERVO_RULES).toEqual([]);
            expect(FC.SERVO_RULES_PARSE_OK).toBe(false);
        });
    });
});

/**
 * Appends given string to an array. If required, it will append length of the string by length.
 * @param destination array to which we append given string (and length if required)
 * @param source string to append to an array
 * @param prefixWithLength should we prefix the string by its length in the array
 * @returns {*} string that was requested to be inserted to the array
 */
function appendStringToArray(destination, source, prefixWithLength = false) {
    const size = source.length;

    if (prefixWithLength) {
        destination.push8(source.length);
    }

    for (let i = 0; i < size; i++) {
        destination.push8(source.charCodeAt(i));
    }

    return source;
}

/**
 * Generates a random string of required length. If required length is -1, it will generate a random string of a random length.
 * @param length required random string length. If lower than 0, it will generate a string of random length.
 * @returns {string} random string (composed of letters [A-Za-z0-9])
 */
function generateRandomString(length = -1) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;

    if (length < 0) {
        length = crypto.getRandomValues(new Uint8Array(1))[0];
    }

    const signature = crypto.getRandomValues(new Uint8Array(length));
    for (let i = 0; i < length; i++) {
        result += characters.charAt(signature[i] % charactersLength);
    }

    return result;
}
