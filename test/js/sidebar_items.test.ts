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

import { describe, expect, it } from "vitest";
import { sidebarItems, isItemVisible, type SidebarItem } from "../../src/components/sidebar/sidebar_items";

describe("sidebarItems ordering", () => {
    it("places firmware_flasher at index 1 (immediately after landing)", () => {
        const keys = sidebarItems.map((item) => item.key);
        expect(keys[0]).toBe("landing");
        expect(keys[1]).toBe("firmware_flasher");
    });

    it("lists all required disconnected tabs in the correct relative order", () => {
        const disconnected = sidebarItems.filter((item) => item.mode === "disconnected").map((item) => item.key);
        expect(disconnected).toContain("firmware_flasher");
        // firmware_flasher must come before help
        expect(disconnected.indexOf("firmware_flasher")).toBeLessThan(disconnected.indexOf("help"));
        // options tab is superseded by OptionsDialog — must not appear in sidebar
        expect(disconnected).not.toContain("options");
    });
});

describe("isItemVisible", () => {
    it("returns true for a basic item with no constraints", () => {
        const item: SidebarItem = {
            key: "setup",
            mode: "connected",
            i18n: "tabSetup",
            icon: "i-lucide-sliders-horizontal",
        };
        expect(isItemVisible(item, { expertMode: false })).toBe(true);
    });

    it("hides expert items when expertMode is false", () => {
        const item: SidebarItem = {
            key: "sensors",
            mode: "connected",
            i18n: "tabRawSensorData",
            icon: "i-lucide-activity",
            expert: true,
        };
        expect(isItemVisible(item, { expertMode: false })).toBe(false);
    });

    it("shows expert items when expertMode is true", () => {
        const item: SidebarItem = {
            key: "sensors",
            mode: "connected",
            i18n: "tabRawSensorData",
            icon: "i-lucide-activity",
            expert: true,
        };
        expect(isItemVisible(item, { expertMode: true })).toBe(true);
    });

    const gpsItem: SidebarItem = {
        key: "gps",
        mode: "connected",
        i18n: "tabGPS",
        icon: "i-lucide-map-pin",
        buildOptions: ["USE_GPS"],
    };

    it("hides buildOptions items when the firmware reported options and none match", () => {
        const config = { apiVersion: "1.47.0", buildOptions: ["USE_SERVOS"] };
        expect(isItemVisible(gpsItem, { expertMode: false, config })).toBe(false);
    });

    it("shows buildOptions items when a matching build option is present", () => {
        const config = { apiVersion: "1.47.0", buildOptions: ["USE_GPS", "USE_SERVOS"] };
        expect(isItemVisible(gpsItem, { expertMode: false, config })).toBe(true);
    });

    it("shows an item listing several build options when the firmware has any one of them", () => {
        const servosItem = sidebarItems.find((item) => item.key === "servos");
        const config = { apiVersion: "1.47.0", buildOptions: ["USE_SERVOS"] };

        expect(servosItem?.buildOptions).toEqual(["USE_SERVOS", "USE_WING"]);
        expect(isItemVisible(servosItem as SidebarItem, { expertMode: false, config })).toBe(true);
    });

    it("shows buildOptions items when the firmware cannot report its build options", () => {
        // A firmware below API 1.45, or one that answers with an empty list, tells us
        // nothing about what it contains. Hiding the tab there is always wrong.
        expect(isItemVisible(gpsItem, { expertMode: false, config: { apiVersion: "1.44.0", buildOptions: [] } })).toBe(
            true,
        );
        expect(isItemVisible(gpsItem, { expertMode: false, config: { apiVersion: "1.47.0", buildOptions: [] } })).toBe(
            true,
        );
        expect(isItemVisible(gpsItem, { expertMode: false, config: undefined })).toBe(true);
    });

    it("hides feature items when the feature is not enabled", () => {
        const item: SidebarItem = {
            key: "osd",
            mode: "connected",
            i18n: "tabOsd",
            icon: "i-lucide-monitor",
            feature: "OSD",
        };
        const features = { isEnabled: () => false };
        expect(isItemVisible(item, { expertMode: false, features })).toBe(false);
    });

    it("shows feature items when the feature is enabled", () => {
        const item: SidebarItem = {
            key: "osd",
            mode: "connected",
            i18n: "tabOsd",
            icon: "i-lucide-monitor",
            feature: "OSD",
        };
        const features = { isEnabled: (f: string) => f === "OSD" };
        expect(isItemVisible(item, { expertMode: false, features })).toBe(true);
    });

    it("hides feature items when features object is missing isEnabled", () => {
        const item: SidebarItem = {
            key: "osd",
            mode: "connected",
            i18n: "tabOsd",
            icon: "i-lucide-monitor",
            feature: "OSD",
        };
        expect(isItemVisible(item, { expertMode: false, features: {} })).toBe(false);
        expect(isItemVisible(item, { expertMode: false })).toBe(false);
    });

    it("hides expert+buildOptions item when expertMode is false regardless of buildOptions match", () => {
        const item: SidebarItem = {
            key: "foo",
            mode: "connected",
            i18n: "tabFoo",
            icon: "i-lucide-x",
            expert: true,
            buildOptions: ["USE_FOO"],
        };
        expect(
            isItemVisible(item, { expertMode: false, config: { apiVersion: "1.47.0", buildOptions: ["USE_FOO"] } }),
        ).toBe(false);
    });

    it("does not treat hideInSidebar as a visibility constraint for expert/build/feature checks", () => {
        const item: SidebarItem = {
            key: "hidden_nav",
            mode: "connected",
            i18n: "tabHiddenNav",
            icon: "i-lucide-eye-off",
            hideInSidebar: true,
        };
        expect(isItemVisible(item, { expertMode: false })).toBe(true);
    });
});
