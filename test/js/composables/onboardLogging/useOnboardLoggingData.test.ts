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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MSP, { type MspCallback } from "../../../../src/js/msp";
import MSPCodes, { MSP2TextType } from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { MspCancelledError, MspTimeoutError } from "../../../../src/js/msp/mspErrors";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useAppInfoStore } from "../../../../src/stores/appInfo";
import type { OperatingSystem } from "../../../../src/js/utils/checkCompatibility";
import {
    SdcardState,
    isMspCancelled,
    useOnboardLoggingData,
} from "../../../../src/composables/onboardLogging/useOnboardLoggingData";

vi.mock("../../../../src/js/msp", () => ({
    default: {
        promise: vi.fn(),
        send_message: vi.fn(),
        SDCARD_STATE_NOT_PRESENT: 0,
        SDCARD_STATE_FATAL: 1,
        SDCARD_STATE_CARD_INIT: 2,
        SDCARD_STATE_FS_INIT: 3,
        SDCARD_STATE_READY: 4,
    },
}));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: vi.fn(), REBOOT_TYPES: { MSC: 2, MSC_UTC: 3 } },
}));

const BASE_LOAD = [
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_DATAFLASH_SUMMARY,
    MSPCodes.MSP_SDCARD_SUMMARY,
    MSPCodes.MSP_BLACKBOX_CONFIG,
    MSPCodes.MSP_ADVANCED_CONFIG,
    MSPCodes.MSP_SENSOR_CONFIG,
];

const sentCodes = () => vi.mocked(MSP.promise).mock.calls.map(([code]) => code);

describe("useOnboardLoggingData", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(MSP.send_message).mockReturnValue(true);
        vi.mocked(mspHelper.crunch).mockImplementation((code, modifier) => [code, modifier ?? -1]);
        useAppInfoStore().operatingSystem = "Windows";
    });

    describe("loadOnboardLoggingData", () => {
        it.each([
            ["", [MSPCodes.MSP_NAME]],
            ["1.44.0", [MSPCodes.MSP_NAME]],
            ["1.45.0", [MSPCodes.MSP2_GET_TEXT]],
            ["1.47.0", [MSPCodes.MSP2_GET_TEXT, MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE]],
        ])("on API %j loads the base set, then %j", async (apiVersion, tail) => {
            fcStore.config.apiVersion = apiVersion;

            await useOnboardLoggingData().loadOnboardLoggingData();

            expect(sentCodes()).toEqual([...BASE_LOAD, ...tail]);
        });

        it("asks for the craft name text with its own payload", async () => {
            fcStore.config.apiVersion = "1.45.0";

            await useOnboardLoggingData().loadOnboardLoggingData();

            expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP2_GET_TEXT, [
                MSPCodes.MSP2_GET_TEXT,
                MSP2TextType.CRAFT_NAME,
            ]);
        });

        it("stops at the first failed request", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(useOnboardLoggingData().loadOnboardLoggingData()).rejects.toThrow("MSP timeout");
            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    it("calls back after the dataflash summary reply, and tolerates no callback", () => {
        const onDone = vi.fn();
        const { requestDataflashSummary } = useOnboardLoggingData();

        requestDataflashSummary(onDone);
        requestDataflashSummary();
        const [withCallback, withoutCallback] = vi.mocked(MSP.send_message).mock.calls;

        expect(withCallback[0]).toBe(MSPCodes.MSP_DATAFLASH_SUMMARY);
        expect(onDone).not.toHaveBeenCalled();
        (withCallback[3] as MspCallback)(null);
        expect(onDone).toHaveBeenCalledOnce();
        expect(() => (withoutCallback[3] as MspCallback)(null)).not.toThrow();
    });

    it.each<[OperatingSystem, number]>([
        ["Linux", 3],
        ["Windows", 2],
    ])("on %s reboots into mass storage with type %i", (os, rebootType) => {
        useAppInfoStore().operatingSystem = os;

        useOnboardLoggingData().rebootToMassStorage();

        expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_REBOOT, [rebootType], false);
    });

    it("tells a cancelled read from a failed one", () => {
        expect(isMspCancelled(new MspCancelledError("cancelled", MSPCodes.MSP_DATAFLASH_READ, "cleanup"))).toBe(true);
        expect(isMspCancelled(new MspTimeoutError("timeout", MSPCodes.MSP_DATAFLASH_READ))).toBe(false);
    });

    it("exposes the FC's SD card states", () => {
        expect(SdcardState).toEqual({ NOT_PRESENT: 0, FATAL: 1, CARD_INIT: 2, FS_INIT: 3, READY: 4 });
    });
});
