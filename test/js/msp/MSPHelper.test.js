import { beforeEach, describe, expect, it } from "vitest";
import semver from "semver";
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
        it("keeps a valid default apiVersion when MSP_API_VERSION payload is empty (MSP corruption)", () => {
            // An empty/truncated payload makes readU8() return null, which would
            // otherwise build the unparseable "null.null.0" and make every downstream
            // semver comparison throw "Invalid Version".
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new DataView(new Uint8Array([]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.CONFIG.apiVersion).not.toContain("null");
            expect(FC.CONFIG.apiVersion).toEqual("0.0.0"); // unchanged default
            expect(semver.valid(FC.CONFIG.apiVersion)).not.toBeNull();
        });
        it("keeps a valid default apiVersion when MSP_API_VERSION payload is truncated (MSP corruption)", () => {
            // Only the protocol-version byte present, major/minor missing -> "X.null.null".
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new DataView(new Uint8Array([42]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.CONFIG.apiVersion).not.toContain("null");
            expect(FC.CONFIG.apiVersion).toEqual("0.0.0");
            expect(semver.valid(FC.CONFIG.apiVersion)).not.toBeNull();
        });
        it("does not let a corrupt MSP_API_VERSION throw in a downstream semver comparison", () => {
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new DataView(new Uint8Array([]).buffer),
                crcError: false,
                callbacks: [],
            });

            // Mirrors the guard in serial_backend.js after the MSP_API_VERSION callback.
            expect(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)).not.toThrow();
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
        it("handles MSP_ATTITUDE_QUATERNION correctly", () => {
            // Encode known quaternion values as int16 (value * 32767)
            const qw = 0.7071;
            const qx = 0;
            const qy = -0.7071;
            const qz = 0;

            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            view.setInt16(0, Math.round(qw * 32767), true);
            view.setInt16(2, Math.round(qx * 32767), true);
            view.setInt16(4, Math.round(qy * 32767), true);
            view.setInt16(6, Math.round(qz * 32767), true);

            mspHelper.process_data({
                code: MSPCodes.MSP_ATTITUDE_QUATERNION,
                dataView: new DataView(buffer),
                crcError: false,
                callbacks: [],
            });

            const q = FC.SENSOR_DATA.quaternion;
            expect(q).not.toBeNull();
            expect(q.w).toBeCloseTo(qw, 3);
            expect(q.x).toBeCloseTo(qx, 3);
            expect(q.y).toBeCloseTo(qy, 3);
            expect(q.z).toBeCloseTo(qz, 3);
        });
        it("handles MSP_ATTITUDE_QUATERNION with extreme values", () => {
            // Mixed extreme values: w=1.0, x=-1.0, y=0.0, z≈0.5
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            view.setInt16(0, 32767, true); // w = 32767/32767 = 1.0
            view.setInt16(2, -32767, true); // x = -32767/32767 = -1.0
            view.setInt16(4, 0, true); // y = 0/32767 = 0.0
            view.setInt16(6, 16384, true); // z = 16384/32767 ~= 0.5

            mspHelper.process_data({
                code: MSPCodes.MSP_ATTITUDE_QUATERNION,
                dataView: new DataView(buffer),
                crcError: false,
                callbacks: [],
            });

            const q = FC.SENSOR_DATA.quaternion;
            expect(q.w).toBeCloseTo(1, 3);
            expect(q.x).toBeCloseTo(-1, 3);
            expect(q.y).toBeCloseTo(0, 3);
            expect(q.z).toBeCloseTo(16384 / 32767, 3);
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
