import { beforeEach, describe, expect, it } from "vitest";
import semver from "semver";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes, { MSP2TextType } from "../../../src/js/msp/MSPCodes";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../../../src/stores/fc";
import { API_VERSION_1_47 } from "../../../src/js/data_storage";
import { MspBuffer, MspDataView } from "../../../src/js/msp/mspBytes";
import type { MspRequest, MspResponse } from "../../../src/js/msp";

describe("MspHelper", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;
    const mspHelper = new MspHelper();
    beforeEach(() => {
        // A fresh Pinia per test: the store starts from its initial state, and MspHelper resolves
        // the active Pinia on every handler call.
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
    });
    describe("process_data", () => {
        it("refuses to process data with crc-error", () => {
            let callbackCalled = false;

            const callbackFunction = (item: MspResponse | null) => {
                callbackCalled = true;
                expect(item!["crcError"]).toEqual(true);
                expect(item!["command"]).toEqual(MSPCodes.MSP_BOARD_INFO);
                expect(item!["length"]).toEqual(0);
            };

            mspHelper.process_data({
                code: MSPCodes.MSP_BOARD_INFO,
                dataView: new MspDataView(new Uint8Array([]).buffer),
                crcError: true,
                unsupported: 0,
                callbacks: [
                    // A legacy (non-errorAware) request; process_data reads only code and callback here.
                    {
                        callback: callbackFunction,
                        code: MSPCodes.MSP_BOARD_INFO,
                    } as Partial<MspRequest> as MspRequest,
                ],
            });

            expect(callbackCalled).toEqual(true);
        });
        it("handles MSP_API_VERSION correctly", () => {
            const randomValues = crypto.getRandomValues(new Uint8Array(3));
            const [mspProtocolVersion, apiVersionMajor, apiVersionMinor] = randomValues;
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new MspDataView(randomValues.buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(fcStore.config.mspProtocolVersion).toEqual(mspProtocolVersion);
            expect(fcStore.config.apiVersion).toEqual(`${apiVersionMajor}.${apiVersionMinor}.0`);
        });
        it("keeps a valid default apiVersion when MSP_API_VERSION payload is empty (MSP corruption)", () => {
            // An empty/truncated payload makes readU8() return null, which would
            // otherwise build the unparseable "null.null.0" and make every downstream
            // semver comparison throw "Invalid Version".
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new MspDataView(new Uint8Array([]).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(fcStore.config.apiVersion).not.toContain("null");
            expect(fcStore.config.apiVersion).toEqual("0.0.0"); // unchanged default
            expect(semver.valid(fcStore.config.apiVersion)).not.toBeNull();
        });
        it("keeps a valid default apiVersion when MSP_API_VERSION payload is truncated (MSP corruption)", () => {
            // Only the protocol-version byte present, major/minor missing -> "X.null.null".
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new MspDataView(new Uint8Array([42]).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(fcStore.config.apiVersion).not.toContain("null");
            expect(fcStore.config.apiVersion).toEqual("0.0.0");
            expect(semver.valid(fcStore.config.apiVersion)).not.toBeNull();
        });
        it("does not let a corrupt MSP_API_VERSION throw in a downstream semver comparison", () => {
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new MspDataView(new Uint8Array([]).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            // Mirrors the guard in serial_backend.js after the MSP_API_VERSION callback.
            expect(() => semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)).not.toThrow();
        });
        it("handles MSP_PIDNAMES correctly", () => {
            const pidNamesCount = 1 + crypto.getRandomValues(new Uint8Array(1))[0];
            const expectedNames = Array.from({ length: pidNamesCount }).map((_) => generateRandomString());

            const lowLevelData = new MspBuffer();
            appendStringToArray(lowLevelData, `${expectedNames.join(";")};`);

            mspHelper.process_data({
                code: MSPCodes.MSP_PIDNAMES,
                dataView: new MspDataView(new Uint8Array(lowLevelData).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(fcStore.pidNames).toEqual(expectedNames);
        });
        it("handles MSP_MOTOR correctly", () => {
            const motorCount = crypto.getRandomValues(new Uint8Array(1))[0] % 8;
            const motorBytes = crypto.getRandomValues(new Uint16Array(motorCount));

            mspHelper.process_data({
                code: MSPCodes.MSP_MOTOR,
                dataView: new MspDataView(new Uint16Array(motorBytes).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });
            expect(new Uint16Array(fcStore.motorData).slice(0, motorCount)).toEqual(motorBytes);
            expect(fcStore.motorData.slice(motorCount, 8)).toContain(undefined);
        });
        it("handles MSP_BOARD_INFO correctly for API version", () => {
            fcStore.config.apiVersion = API_VERSION_1_47;
            const infoBuffer = new MspBuffer();

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
                dataView: new MspDataView(new Uint8Array(infoBuffer).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(fcStore.config.boardIdentifier).toEqual(boardIdentifier);
            expect(fcStore.config.boardVersion).toEqual(0xdead);
            expect(fcStore.config.boardType).toEqual(0x12);
            expect(fcStore.config.targetCapabilities).toEqual(0x32);
            expect(fcStore.config.targetName).toEqual(targetName);
            expect(fcStore.config.boardName).toEqual(boardName);
            expect(fcStore.config.manufacturerId).toEqual(manufacturerId);
            expect(new Uint8Array(fcStore.config.signature)).toEqual(signature);
            expect(fcStore.config.mcuTypeId).toEqual(0xfa);

            expect(fcStore.config.configurationState).toEqual(0xbb);
            expect(fcStore.config.sampleRateHz).toEqual(0xbaab);
            expect(fcStore.config.configurationProblems).toEqual(0xdeadbeef);
        });
        it("handles MSP_ATTITUDE_QUATERNION correctly", () => {
            // Encode known quaternion values as int16 (value * 32767)
            const qw = 0.7071;
            const qx = 0;
            const qy = -0.7071;
            const qz = 0;

            const buffer = new ArrayBuffer(8);
            const view = new MspDataView(buffer);
            view.setInt16(0, Math.round(qw * 32767), true);
            view.setInt16(2, Math.round(qx * 32767), true);
            view.setInt16(4, Math.round(qy * 32767), true);
            view.setInt16(6, Math.round(qz * 32767), true);

            mspHelper.process_data({
                code: MSPCodes.MSP_ATTITUDE_QUATERNION,
                dataView: new MspDataView(buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            const q = fcStore.sensorData.quaternion!;
            expect(q).not.toBeNull();
            expect(q.w).toBeCloseTo(qw, 3);
            expect(q.x).toBeCloseTo(qx, 3);
            expect(q.y).toBeCloseTo(qy, 3);
            expect(q.z).toBeCloseTo(qz, 3);
        });
        it("handles MSP_ATTITUDE_QUATERNION with extreme values", () => {
            // Mixed extreme values: w=1.0, x=-1.0, y=0.0, z≈0.5
            const buffer = new ArrayBuffer(8);
            const view = new MspDataView(buffer);
            view.setInt16(0, 32767, true); // w = 32767/32767 = 1.0
            view.setInt16(2, -32767, true); // x = -32767/32767 = -1.0
            view.setInt16(4, 0, true); // y = 0/32767 = 0.0
            view.setInt16(6, 16384, true); // z = 16384/32767 ~= 0.5

            mspHelper.process_data({
                code: MSPCodes.MSP_ATTITUDE_QUATERNION,
                dataView: new MspDataView(buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            const q = fcStore.sensorData.quaternion!;
            expect(q.w).toBeCloseTo(1, 3);
            expect(q.x).toBeCloseTo(-1, 3);
            expect(q.y).toBeCloseTo(0, 3);
            expect(q.z).toBeCloseTo(16384 / 32767, 3);
        });
    });

    describe("MSP2 text types", () => {
        /*
         * These tests pin the type byte that goes on the wire and the fcStore.config field each type
         * lands in. MSPHelper is TypeScript now, so a stale MSP2TextType member no longer
         * compiles, but a case wired to the wrong member or the wrong field still would.
         */
        function buildTextPayload(textType: number, text: string) {
            const buffer = new MspBuffer();
            buffer.push8(textType);
            buffer.push8(text.length);
            appendStringToArray(buffer, text);
            return buffer;
        }

        function readBuffer(buffer: number[]) {
            const view = new MspDataView(new Uint8Array(buffer).buffer);
            view.offset = 0;
            return view;
        }

        beforeEach(() => {
            // Non-zero indices so the profile-indexed types cannot pass by hitting slot 0.
            fcStore.config.profile = 2;
            fcStore.config.rateProfile = 1;
            fcStore.config.batteryProfile = 1;
        });

        it.each([
            ["PILOT_NAME", MSP2TextType.PILOT_NAME, () => fcStore.config.pilotName],
            ["CRAFT_NAME", MSP2TextType.CRAFT_NAME, () => fcStore.config.craftName],
            [
                "PID_PROFILE_NAME",
                MSP2TextType.PID_PROFILE_NAME,
                () => fcStore.config.pidProfileNames[fcStore.config.profile],
            ],
            [
                "RATE_PROFILE_NAME",
                MSP2TextType.RATE_PROFILE_NAME,
                () => fcStore.config.rateProfileNames[fcStore.config.rateProfile],
            ],
            ["BUILDKEY", MSP2TextType.BUILDKEY, () => fcStore.config.buildKey],
            [
                "BATTERY_PROFILE_NAME",
                MSP2TextType.BATTERY_PROFILE_NAME,
                () => fcStore.config.batteryProfileNames[fcStore.config.batteryProfile],
            ],
        ])("decodes MSP2_GET_TEXT %s into its fcStore.config field", (name, textType, read) => {
            const text = `text-${name}`;

            mspHelper.process_data({
                code: MSPCodes.MSP2_GET_TEXT,
                dataView: new MspDataView(new Uint8Array(buildTextPayload(textType, text)).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(read()).toEqual(text);
        });

        it("ignores a text type the configurator does not handle", () => {
            // RELEASENAME exists in the firmware header but has no case here yet.
            mspHelper.process_data({
                code: MSPCodes.MSP2_GET_TEXT,
                dataView: new MspDataView(new Uint8Array(buildTextPayload(MSP2TextType.RELEASENAME, "4.6.0")).buffer),
                crcError: false,
                unsupported: 0,
                callbacks: [],
            });

            expect(fcStore.config.pilotName).toEqual("");
            expect(fcStore.config.craftName).toEqual("");
            expect(fcStore.config.buildKey).toEqual("");
        });

        it.each([
            ["PILOT_NAME", MSP2TextType.PILOT_NAME],
            ["CRAFT_NAME", MSP2TextType.CRAFT_NAME],
            ["PID_PROFILE_NAME", MSP2TextType.PID_PROFILE_NAME],
            ["RATE_PROFILE_NAME", MSP2TextType.RATE_PROFILE_NAME],
            ["BUILDKEY", MSP2TextType.BUILDKEY],
            ["BATTERY_PROFILE_NAME", MSP2TextType.BATTERY_PROFILE_NAME],
        ])("crunches MSP2_GET_TEXT %s to the bare type byte", (name, textType) => {
            expect(mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, textType)).toEqual([textType]);
        });

        it.each([
            ["PILOT_NAME", MSP2TextType.PILOT_NAME, 16, (value: string) => (fcStore.config.pilotName = value)],
            ["CRAFT_NAME", MSP2TextType.CRAFT_NAME, 16, (value: string) => (fcStore.config.craftName = value)],
            [
                "PID_PROFILE_NAME",
                MSP2TextType.PID_PROFILE_NAME,
                8,
                (value: string) => (fcStore.config.pidProfileNames[fcStore.config.profile] = value),
            ],
            [
                "RATE_PROFILE_NAME",
                MSP2TextType.RATE_PROFILE_NAME,
                8,
                (value: string) => (fcStore.config.rateProfileNames[fcStore.config.rateProfile] = value),
            ],
            [
                "BATTERY_PROFILE_NAME",
                MSP2TextType.BATTERY_PROFILE_NAME,
                8,
                (value: string) => (fcStore.config.batteryProfileNames[fcStore.config.batteryProfile] = value),
            ],
        ])(
            "crunches MSP2_SET_TEXT %s and truncates to the firmware field width",
            (name, textType, maxLength, write) => {
                const value = "0123456789abcdefghij"; // longer than every field width
                write(value);

                const view = readBuffer(mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, textType));

                expect(view.readU8()).toEqual(textType);
                expect(mspHelper.getText(view)).toEqual(value.slice(0, maxLength));
            },
        );

        it("round-trips a craft name shorter than the field width", () => {
            fcStore.config.craftName = "Twig";

            const view = readBuffer(mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.CRAFT_NAME));

            expect(view.readU8()).toEqual(MSP2TextType.CRAFT_NAME);
            expect(mspHelper.getText(view)).toEqual("Twig");
        });

        it("emits no payload for a text type MSP2_SET_TEXT cannot serialize", () => {
            expect(mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.BUILDKEY)).toEqual([]);
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
function appendStringToArray(destination: MspBuffer, source: string, prefixWithLength = false) {
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
