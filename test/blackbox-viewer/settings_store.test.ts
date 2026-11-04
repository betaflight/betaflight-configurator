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
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings";
import { useDisplayUnits } from "../../src/composables/useDisplayUnits";
import { defaultUserSettings } from "../../src/blackbox-viewer/user_settings_data";

const stored = () => JSON.parse(localStorage.getItem("userSettings") ?? "null");

describe("blackbox settings store", () => {
    beforeEach(() => {
        localStorage.clear();
        useDisplayUnits().setUnitSystem("metric");
        setActivePinia(createPinia());
    });

    it("starts from the defaults when nothing is stored", () => {
        expect(useSettingsStore().userSettings).toEqual({ ...defaultUserSettings, speedUnits: 2 });
    });

    it("merges stored settings over the defaults, one level deep", () => {
        localStorage.setItem(
            "userSettings",
            JSON.stringify({ speedUnits: 3, craft: { left: "1%" }, retiredSetting: true }),
        );

        const { userSettings } = useSettingsStore();

        expect(userSettings.speedUnits).toBe(3);
        expect(userSettings.followAppUnits).toBe(false);
        expect(userSettings.craft).toEqual({ ...defaultUserSettings.craft, left: "1%" });
        expect(userSettings.altitudeUnits).toBe(defaultUserSettings.altitudeUnits);
        // Unknown keys from an older version are kept as they are.
        expect((userSettings as unknown as Record<string, unknown>).retiredSetting).toBe(true);
    });

    it("does not let a stored setting change the defaults", () => {
        localStorage.setItem("userSettings", JSON.stringify({ craft: { left: "1%" } }));

        useSettingsStore();

        expect(defaultUserSettings.craft.left).toBe("15%");
    });

    it("persists one setting, or all of them", () => {
        const settings = useSettingsStore();

        settings.saveSetting("drawSticks", false);
        expect(settings.userSettings.drawSticks).toBe(false);
        expect(stored().drawSticks).toBe(false);

        settings.saveAll({ followAppUnits: false, speedUnits: 2, gapless: true });
        expect(stored()).toMatchObject({ drawSticks: false, speedUnits: 2, gapless: true });
    });
    it("follows app unit changes unless the viewer has its own selection", () => {
        const settings = useSettingsStore();
        useDisplayUnits().setUnitSystem("imperial");
        expect(settings.userSettings).toMatchObject({ followAppUnits: true, speedUnits: 3, altitudeUnits: 2 });
        useDisplayUnits().setUnitSystem("british");
        expect(settings.userSettings).toMatchObject({ followAppUnits: true, speedUnits: 3, altitudeUnits: 1 });
        settings.saveAll({ followAppUnits: false, speedUnits: 1, altitudeUnits: 1 });
        useDisplayUnits().setUnitSystem("metric");
        expect(settings.userSettings).toMatchObject({ followAppUnits: false, speedUnits: 1, altitudeUnits: 1 });
    });
});
