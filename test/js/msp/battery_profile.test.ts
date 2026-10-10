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

import { beforeEach, describe, expect, it } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes, { MSP2TextType } from "../../../src/js/msp/MSPCodes";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../../../src/stores/fc";
import { API_VERSION_1_47, API_VERSION_1_48 } from "../../../src/js/data_storage";
import VirtualFC from "../../../src/js/VirtualFC";
import { MspBuffer, MspDataView } from "../../../src/js/msp/mspBytes";
import { useConnectionStore } from "../../../src/stores/connection";

function processMessage(mspHelper: MspHelper, code: number, buffer: number[]) {
    mspHelper.process_data({
        code,
        dataView: new MspDataView(new Uint8Array(buffer).buffer),
        crcError: false,
        unsupported: 0,
        callbacks: [],
    });
}

function buildStatusExBuffer({
    batteryProfiles,
    batteryProfile,
}: { batteryProfiles?: number; batteryProfile?: number } = {}) {
    const buffer = new MspBuffer();
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
    let fcStore: ReturnType<typeof useFlightControllerStore>;
    const mspHelper = new MspHelper();

    beforeEach(() => {
        // A fresh Pinia per test: the store starts from its initial state, and VirtualFC resolves
        // the same active Pinia.
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        useConnectionStore().virtualApiVersion = "0.0.1";
    });

    describe("VirtualFC", () => {
        it("reports battery profile support for API >= 1.48", () => {
            useConnectionStore().virtualApiVersion = API_VERSION_1_48;
            VirtualFC.setVirtualConfig();

            expect(fcStore.config.numberOfBatteryProfiles).toEqual(3);
            expect(fcStore.config.batteryProfile).toEqual(0);
        });

        it("keeps legacy virtual firmware without battery profiles below API 1.48", () => {
            useConnectionStore().virtualApiVersion = API_VERSION_1_47;
            VirtualFC.setVirtualConfig();

            expect(fcStore.config.numberOfBatteryProfiles).toEqual(0);
            expect(fcStore.config.batteryProfile).toEqual(0);
        });
    });

    describe("process_data", () => {
        it("parses MSP_STATUS_EX battery profile fields for API >= 1.48", () => {
            fcStore.config.apiVersion = API_VERSION_1_48;
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer({ batteryProfiles: 3, batteryProfile: 2 }),
            );

            expect(fcStore.config.numberOfBatteryProfiles).toEqual(3);
            expect(fcStore.config.batteryProfile).toEqual(2);
        });

        it("parses MSP_STATUS_EX battery profile fields for API > 1.48", () => {
            fcStore.config.apiVersion = "1.49.0";
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer({ batteryProfiles: 3, batteryProfile: 2 }),
            );

            expect(fcStore.config.numberOfBatteryProfiles).toEqual(3);
            expect(fcStore.config.batteryProfile).toEqual(2);
        });

        it("grows batteryProfileNames when FC reports more profiles than initialized", () => {
            fcStore.config.apiVersion = "1.49.0";
            processMessage(
                mspHelper,
                MSPCodes.MSP_STATUS_EX,
                buildStatusExBuffer({ batteryProfiles: 5, batteryProfile: 4 }),
            );

            expect(fcStore.config.numberOfBatteryProfiles).toEqual(5);
            expect(fcStore.config.batteryProfileNames).toHaveLength(5);
            expect(fcStore.config.batteryProfileNames[4]).toEqual("");
        });

        it("does not parse battery profile fields for API < 1.48", () => {
            fcStore.config.apiVersion = API_VERSION_1_47;
            processMessage(mspHelper, MSPCodes.MSP_STATUS_EX, buildStatusExBuffer());

            expect(fcStore.config.numberOfBatteryProfiles).toEqual(0);
            expect(fcStore.config.batteryProfile).toEqual(0);
        });

        it("handles MSP2_GET_TEXT with BATTERY_PROFILE_NAME", () => {
            fcStore.config.batteryProfile = 1;

            const buffer = new MspBuffer();
            buffer.push8(MSP2TextType.BATTERY_PROFILE_NAME);
            const name = "Li-Ion";
            buffer.push8(name.length);
            for (let i = 0; i < name.length; i++) {
                buffer.push8(name.codePointAt(i)!);
            }

            processMessage(mspHelper, MSPCodes.MSP2_GET_TEXT, buffer);
            expect(fcStore.config.batteryProfileNames[1]).toEqual("Li-Ion");
        });
    });

    describe("crunch", () => {
        it("serializes MSP2_SET_TEXT with BATTERY_PROFILE_NAME", () => {
            fcStore.config.batteryProfile = 0;
            fcStore.config.batteryProfileNames[0] = "LiPo";

            const result = mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.BATTERY_PROFILE_NAME);
            const view = new MspDataView(new Uint8Array(result).buffer);
            view.offset = 0;

            expect(view.readU8()).toEqual(MSP2TextType.BATTERY_PROFILE_NAME);
            expect(view.readU8()).toEqual(4); // length

            let name = "";
            for (let i = 0; i < 4; i++) {
                name += String.fromCodePoint(view.readU8());
            }
            expect(name).toEqual("LiPo");
        });
    });

    describe("fcStore.resetState", () => {
        it("initializes battery profile state correctly", () => {
            fcStore.resetState();

            expect(fcStore.config.batteryProfile).toEqual(0);
            expect(fcStore.config.numberOfBatteryProfiles).toEqual(0);
            expect(fcStore.config.batteryProfileNames).toEqual(["", "", ""]);
        });
    });
});
