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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { OSD } from "../../../src/components/tabs/osd/osd";
import FC from "../../../src/js/fc";
import { SYM } from "../../../src/js/utils/osdFont";
import { useOsdStore } from "../../../src/stores/osd";
import MSP from "../../../src/js/msp";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";

function selectFields(apiVersion: string) {
    FC.CONFIG.apiVersion = apiVersion;
    OSD.loadDisplayFields();
    OSD.chooseFields();
    return OSD.constants.DISPLAY_FIELDS.map((field: { name: string }) => field.name);
}

describe("OSD decimal compass bar", () => {
    afterEach(() => vi.restoreAllMocks());

    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        SYM.loadSymbols();
        OSD.initData();
        OSD.data.video_system = 1;
        OSD.data.unit_mode = 1;
        OSD.data.osd_profiles = { number: 3, selected: 0 };
        OSD.data.timers = [
            { src: 0, precision: 0 },
            { src: 1, precision: 0 },
        ];
        OSD.data.parameters = { cameraFrameWidth: 24, cameraFrameHeight: 11 };
    });

    it.each(["1.44.0", "1.45.0", "1.46.0", "1.47.0", "1.48.0"])(
        "preserves the compass and ESC IDs on API %s",
        (apiVersion) => {
            const names = selectFields(apiVersion);
            expect(names).not.toContain("DECIMAL_COMPASS_BAR");
            expect(names.slice(34, 38)).toEqual([
                "COMPASS_BAR",
                "ESC_TEMPERATURE",
                "ESC_RPM",
                "REMAINING_TIME_ESTIMATE",
            ]);
        },
    );

    it.each([
        { buildOptions: [] },
        { buildOptions: ["USE_GPS", "USE_FLIGHT_PLAN", "USE_OSD_HD", "USE_POSITION_HOLD"] },
        { buildOptions: ["USE_GPS", "USE_FLIGHT_PLAN", "USE_WING", "USE_POSITION_HOLD"] },
    ])("appends the new element without shifting older fields ($buildOptions)", ({ buildOptions }) => {
        FC.CONFIG.buildOptions = buildOptions;
        const previousNames = selectFields("1.48.0");
        const names = selectFields("1.49.0");
        expect(names).toEqual([...previousNames, "PITOT_AIRSPEED", "DECIMAL_COMPASS_BAR"]);
    });

    it("clips the north-facing degree labels to the firmware's nine columns", () => {
        selectFields("1.49.0");
        const preview = OSD.ALL_DISPLAY_FIELDS.DECIMAL_COMPASS_BAR.preview();
        expect(Array.from(preview, (character: string) => character.charCodeAt(0))).toEqual([
            55, 48, 0x1c, 0x1d, 48, 0x1d, 0x1c, 0x1d, 57,
        ]);
    });

    it("does not expose an appended element absent from the firmware response", () => {
        selectFields("1.49.0");
        OSD.msp.processOsdElements(OSD.data, Array(89).fill(0));
        expect(OSD.data.displayItems).toHaveLength(89);
        expect(OSD.data.displayItems.some((item: { name: string }) => item.name === "DECIMAL_COMPASS_BAR")).toBe(false);
    });

    it("decodes and saves the decimal bar independently of the original compass", async () => {
        selectFields("1.49.0");
        const positions = Array(90).fill(0);
        positions[34] = 0x0801;
        positions[89] = 0x2825;
        OSD.msp.processOsdElements(OSD.data, positions);

        const compass = OSD.data.displayItems[34];
        const decimal = OSD.data.displayItems[89];
        expect(compass).toMatchObject({ name: "COMPASS_BAR", position: 1, isVisible: [true, false, false] });
        expect(decimal).toMatchObject({
            name: "DECIMAL_COMPASS_BAR",
            position: 35,
            isVisible: [true, false, true],
            variant: 0,
        });

        const store = useOsdStore();
        store.osdProfiles.number = 3;
        store.videoSystem = 1;
        store.updateDisplaySize();
        store.displayItems = [compass, decimal];
        const send = vi.spyOn(MSP, "promise").mockResolvedValue(undefined);
        await store.saveAllConfig();
        expect(send).toHaveBeenCalledWith(MSPCodes.MSP_SET_OSD_CONFIG, [89, 0x25, 0x28]);

        send.mockClear();
        decimal.position = 67;
        await store.saveAllConfig();
        expect(send).toHaveBeenCalledWith(MSPCodes.MSP_SET_OSD_CONFIG, [89, 0x47, 0x28]);
        expect(send).toHaveBeenCalledWith(MSPCodes.MSP_SET_OSD_CONFIG, [34, 1, 8]);
    });
});
