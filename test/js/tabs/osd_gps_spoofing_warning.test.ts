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
import { createPinia, setActivePinia } from "pinia";
import { OSD } from "../../../src/components/tabs/osd/osd";
import { useFlightControllerStore } from "../../../src/stores/fc";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

// The firmware numbers its warnings by position in osdWarningsFlags_e, and the
// Configurator decodes bit i of osd_warn_bitmask as OSD.constants.WARNINGS[i], so
// the list must gain GPS_SPOOFING at exactly the API version that added the bit.
describe("OSD GPS spoofing warning", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    function warningNames(apiVersion: string): string[] {
        fcStore.config.apiVersion = apiVersion;
        OSD.loadDisplayFields();
        OSD.chooseFields();
        return OSD.constants.WARNINGS.map((warning) => warning.name);
    }

    beforeEach(() => {
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
    });

    it("is defined with its text and description keys", () => {
        expect(OSD.constants.ALL_WARNINGS.GPS_SPOOFING).toEqual({
            name: "GPS_SPOOFING",
            text: "osdWarningTextGpsSpoofing",
            desc: "osdWarningGpsSpoofing",
        });
    });

    it("is not offered before API 1.49", () => {
        const names = warningNames(API_VERSION_1_48);

        expect(names).not.toContain("GPS_SPOOFING");
        expect(names[names.length - 1]).toBe("AUTOPILOT_ABORT");
    });

    it("takes the bit after AUTOPILOT_ABORT from API 1.49", () => {
        const names = warningNames(API_VERSION_1_49);

        expect(names[names.length - 1]).toBe("GPS_SPOOFING");
        expect(names.indexOf("GPS_SPOOFING")).toBe(names.indexOf("AUTOPILOT_ABORT") + 1);
    });

    it("keeps every earlier warning at the same bit across the boundary", () => {
        const before = warningNames(API_VERSION_1_48);
        const after = warningNames(API_VERSION_1_49);

        expect(after.slice(0, before.length)).toEqual(before);
        expect(after.length).toBe(before.length + 1);
    });
});
