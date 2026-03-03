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

function buildProfileBuffer(
    index,
    { minV = 330, maxV = 430, warnV = 350, fullV = 410, cap = 1300, cells = 0, warnPct = 10 } = {},
) {
    const buf = [];
    buf.push8(index);
    buf.push16(minV);
    buf.push16(maxV);
    buf.push16(warnV);
    buf.push16(fullV);
    buf.push16(cap);
    buf.push8(cells);
    buf.push8(warnPct);
    return buf;
}

function buildStatusExBuffer(apiVersion, { batteryProfiles, batteryProfile } = {}) {
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

    if (apiVersion === API_VERSION_1_48 && batteryProfiles !== undefined) {
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
        it("deserializes MSP2_BATTERY_PROFILE correctly", () => {
            processMessage(mspHelper, MSPCodes.MSP2_BATTERY_PROFILE, buildProfileBuffer(0));

            expect(FC.BATTERY_PROFILES[0].vbatmincellvoltage).toEqual(3.3);
            expect(FC.BATTERY_PROFILES[0].vbatmaxcellvoltage).toEqual(4.3);
            expect(FC.BATTERY_PROFILES[0].vbatwarningcellvoltage).toEqual(3.5);
            expect(FC.BATTERY_PROFILES[0].vbatfullcellvoltage).toEqual(4.1);
            expect(FC.BATTERY_PROFILES[0].capacity).toEqual(1300);
            expect(FC.BATTERY_PROFILES[0].forceBatteryCellCount).toEqual(0);
            expect(FC.BATTERY_PROFILES[0].consumptionWarningPercentage).toEqual(10);
        });

        it("deserializes multiple battery profiles", () => {
            processMessage(mspHelper, MSPCodes.MSP2_BATTERY_PROFILE, buildProfileBuffer(0));
            processMessage(
                mspHelper,
                MSPCodes.MSP2_BATTERY_PROFILE,
                buildProfileBuffer(1, {
                    minV: 280,
                    maxV: 420,
                    warnV: 300,
                    fullV: 400,
                    cap: 3000,
                    cells: 4,
                    warnPct: 15,
                }),
            );

            expect(FC.BATTERY_PROFILES[0].vbatmincellvoltage).toEqual(3.3);
            expect(FC.BATTERY_PROFILES[0].capacity).toEqual(1300);
            expect(FC.BATTERY_PROFILES[1].vbatmincellvoltage).toEqual(2.8);
            expect(FC.BATTERY_PROFILES[1].vbatmaxcellvoltage).toEqual(4.2);
            expect(FC.BATTERY_PROFILES[1].capacity).toEqual(3000);
            expect(FC.BATTERY_PROFILES[1].forceBatteryCellCount).toEqual(4);
            expect(FC.BATTERY_PROFILES[1].consumptionWarningPercentage).toEqual(15);
        });

        it("parses MSP_STATUS_EX battery profile fields for API >= 1.48", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_48;
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer(API_VERSION_1_48, { batteryProfiles: 3, batteryProfile: 2 }),
            );

            expect(FC.CONFIG.numberOfBatteryProfiles).toEqual(3);
            expect(FC.CONFIG.batteryProfile).toEqual(2);
        });

        it("does not parse battery profile fields for API < 1.48", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_47;
            processMessage(mspHelper, MSPCodes.MSP_STATUS_EX, buildStatusExBuffer(API_VERSION_1_47));

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
                buffer.push8(name.charCodeAt(i));
            }

            processMessage(mspHelper, MSPCodes.MSP2_GET_TEXT, buffer);
            expect(FC.CONFIG.batteryProfileNames[1]).toEqual("Li-Ion");
        });
    });

    describe("crunch", () => {
        it("serializes MSP2_SET_BATTERY_PROFILE correctly", () => {
            FC.BATTERY_PROFILES[1] = {
                vbatmincellvoltage: 2.8,
                vbatmaxcellvoltage: 4.2,
                vbatwarningcellvoltage: 3.0,
                vbatfullcellvoltage: 4.0,
                capacity: 3000,
                forceBatteryCellCount: 4,
                consumptionWarningPercentage: 15,
            };

            const result = mspHelper.crunch(MSPCodes.MSP2_SET_BATTERY_PROFILE, 1);
            const view = new DataView(new Uint8Array(result).buffer);
            view.offset = 0;
            expect(view.readU8()).toEqual(1); // profile index
            expect(view.readU16()).toEqual(280); // vbatmincellvoltage * 100
            expect(view.readU16()).toEqual(420); // vbatmaxcellvoltage * 100
            expect(view.readU16()).toEqual(300); // vbatwarningcellvoltage * 100
            expect(view.readU16()).toEqual(400); // vbatfullcellvoltage * 100
            expect(view.readU16()).toEqual(3000); // capacity
            expect(view.readU8()).toEqual(4); // forceBatteryCellCount
            expect(view.readU8()).toEqual(15); // consumptionWarningPercentage
        });

        it("serializes MSP2_BATTERY_PROFILE request with profile index", () => {
            const result = mspHelper.crunch(MSPCodes.MSP2_BATTERY_PROFILE, 2);
            expect(result).toEqual([2]);
        });

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
                name += String.fromCharCode(view.readU8());
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
            expect(FC.BATTERY_PROFILES).toHaveLength(3);
            expect(FC.BATTERY_PROFILES[0].vbatmincellvoltage).toEqual(0);
            expect(FC.BATTERY_PROFILES[0].capacity).toEqual(0);
            expect(FC.BATTERY_PROFILES[2].consumptionWarningPercentage).toEqual(0);
        });
    });
});
