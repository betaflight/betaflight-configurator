import { beforeEach, describe, expect, it } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";
import FC from "../../../src/js/fc";
import { API_VERSION_1_47, API_VERSION_1_48 } from "../../../src/js/data_storage";

function processMessage(mspHelper, code, buffer) {
    mspHelper.process_data({
        code,
        dataView: new DataView(new Uint8Array(buffer).buffer),
        crcError: false,
        callbacks: [],
    });
}

function buildStatusExBuffer({ batteryProfiles, batteryProfile } = {}) {
    const buffer = [];
    buffer.push16(500); // cycleTime
    buffer.push16(0); // i2cError
    buffer.push16(0); // activeSensors
    buffer.push32(0); // mode
    buffer.push8(0); // profile
    buffer.push16(10); // cpuload
    buffer.push8(3); // numProfiles
    buffer.push8(1); // rateProfile
    buffer.push8(0); // flight mode byteCount = 0
    buffer.push8(0); // armingDisableCount
    buffer.push32(0); // armingDisableFlags
    buffer.push8(0); // configStateFlags
    buffer.push16(42); // CPU temp (API 1.46+)
    buffer.push8(4); // numberOfRateProfiles (API 1.47+)

    if (batteryProfiles !== undefined && batteryProfile !== undefined) {
        buffer.push8(batteryProfiles);
        buffer.push8(batteryProfile);
    }
    return buffer;
}

describe("Battery Profiles", () => {
    const mspHelper = new MspHelper();

    beforeEach(() => {
        FC.resetState();
    });

    describe("process_data", () => {
        it("parses MSP_STATUS_EX battery profile fields for API >= 1.48", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_48;
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer({ batteryProfiles: 3, batteryProfile: 2 }),
            );

            expect(FC.CONFIG.numberOfBatteryProfiles).toEqual(3);
            expect(FC.CONFIG.batteryProfile).toEqual(2);
        });

        it("parses MSP_STATUS_EX battery profile fields for API > 1.48", () => {
            FC.CONFIG.apiVersion = "1.49.0";
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer({ batteryProfiles: 3, batteryProfile: 2 }),
            );

            expect(FC.CONFIG.numberOfBatteryProfiles).toEqual(3);
            expect(FC.CONFIG.batteryProfile).toEqual(2);
        });

        it("grows batteryProfileNames when FC reports more profiles than initialized", () => {
            FC.CONFIG.apiVersion = "1.49.0";
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer({ batteryProfiles: 5, batteryProfile: 4 }),
            );

            expect(FC.CONFIG.numberOfBatteryProfiles).toEqual(5);
            expect(FC.CONFIG.batteryProfileNames).toHaveLength(5);
            expect(FC.CONFIG.batteryProfileNames[4]).toEqual("");
        });

        it("does not parse battery profile fields for API < 1.48", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_47;
            processMessage(mspHelper, MSPCodes.MSP_STATUS_EX, buildStatusExBuffer());

            expect(FC.CONFIG.numberOfBatteryProfiles).toEqual(0);
            expect(FC.CONFIG.batteryProfile).toEqual(0);
        });

        it("handles MSP2_GET_TEXT with BATTERY_PROFILE_NAME", () => {
            FC.CONFIG.batteryProfile = 1;

            const buffer = [];
            buffer.push8(MSPCodes.BATTERY_PROFILE_NAME);
            const name = "Li-Ion";
            buffer.push8(name.length);
            for (let i = 0; i < name.length; i++) {
                buffer.push8(name.codePointAt(i));
            }

            processMessage(mspHelper, MSPCodes.MSP2_GET_TEXT, buffer);
            expect(FC.CONFIG.batteryProfileNames[1]).toEqual("Li-Ion");
        });
    });

    describe("crunch", () => {
        it("serializes MSP2_SET_TEXT with BATTERY_PROFILE_NAME", () => {
            FC.CONFIG.batteryProfile = 0;
            FC.CONFIG.batteryProfileNames[0] = "LiPo";

            const result = mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.BATTERY_PROFILE_NAME);
            const view = new DataView(new Uint8Array(result).buffer);
            view.offset = 0;

            expect(view.readU8()).toEqual(MSPCodes.BATTERY_PROFILE_NAME);
            expect(view.readU8()).toEqual(4); // length

            let name = "";
            for (let i = 0; i < 4; i++) {
                name += String.fromCodePoint(view.readU8());
            }
            expect(name).toEqual("LiPo");
        });
    });

    describe("FC.resetState", () => {
        it("initializes battery profile state correctly", () => {
            FC.resetState();

            expect(FC.CONFIG.batteryProfile).toEqual(0);
            expect(FC.CONFIG.numberOfBatteryProfiles).toEqual(0);
            expect(FC.CONFIG.batteryProfileNames).toEqual(["", "", ""]);
        });
    });
});
