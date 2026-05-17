import { describe, expect, it } from "vitest";
import { sidebarItems, isItemVisible } from "../../src/components/sidebar/sidebar_items.js";

describe("sidebarItems ordering", () => {
    it("places firmware_flasher at index 1 (immediately after landing)", () => {
        const keys = sidebarItems.map((item) => item.key);
        expect(keys[0]).toBe("landing");
        expect(keys[1]).toBe("firmware_flasher");
    });

    it("lists all required disconnected tabs in the correct relative order", () => {
        const disconnected = sidebarItems.filter((item) => item.mode === "disconnected").map((item) => item.key);
        // firmware_flasher must come before help
        expect(disconnected.indexOf("firmware_flasher")).toBeLessThan(disconnected.indexOf("help"));
        // options tab is superseded by OptionsDialog — must not appear in sidebar
        expect(disconnected).not.toContain("options");
    });
});

describe("isItemVisible", () => {
    it("returns true for a basic item with no constraints", () => {
        const item = { key: "setup", mode: "connected", i18n: "tabSetup", icon: "i-lucide-sliders-horizontal" };
        expect(isItemVisible(item, { expertMode: false })).toBe(true);
    });

    it("hides expert items when expertMode is false", () => {
        const item = {
            key: "sensors",
            mode: "connected",
            i18n: "tabRawSensorData",
            icon: "i-lucide-activity",
            expert: true,
        };
        expect(isItemVisible(item, { expertMode: false })).toBe(false);
    });

    it("shows expert items when expertMode is true", () => {
        const item = {
            key: "sensors",
            mode: "connected",
            i18n: "tabRawSensorData",
            icon: "i-lucide-activity",
            expert: true,
        };
        expect(isItemVisible(item, { expertMode: true })).toBe(true);
    });

    it("hides buildOptions items when no matching build option is present", () => {
        const item = {
            key: "gps",
            mode: "connected",
            i18n: "tabGPS",
            icon: "i-lucide-map-pin",
            buildOptions: ["USE_GPS"],
        };
        expect(isItemVisible(item, { expertMode: false, buildOptions: [] })).toBe(false);
        expect(isItemVisible(item, { expertMode: false, buildOptions: undefined })).toBe(false);
    });

    it("shows buildOptions items when a matching build option is present", () => {
        const item = {
            key: "gps",
            mode: "connected",
            i18n: "tabGPS",
            icon: "i-lucide-map-pin",
            buildOptions: ["USE_GPS"],
        };
        expect(isItemVisible(item, { expertMode: false, buildOptions: ["USE_GPS", "USE_SERVOS"] })).toBe(true);
    });

    it("hides feature items when the feature is not enabled", () => {
        const item = { key: "osd", mode: "connected", i18n: "tabOsd", icon: "i-lucide-monitor", feature: "OSD" };
        const features = { isEnabled: () => false };
        expect(isItemVisible(item, { expertMode: false, features })).toBe(false);
    });

    it("shows feature items when the feature is enabled", () => {
        const item = { key: "osd", mode: "connected", i18n: "tabOsd", icon: "i-lucide-monitor", feature: "OSD" };
        const features = { isEnabled: (f) => f === "OSD" };
        expect(isItemVisible(item, { expertMode: false, features })).toBe(true);
    });

    it("hides feature items when features object is missing isEnabled", () => {
        const item = { key: "osd", mode: "connected", i18n: "tabOsd", icon: "i-lucide-monitor", feature: "OSD" };
        expect(isItemVisible(item, { expertMode: false, features: {} })).toBe(false);
        expect(isItemVisible(item, { expertMode: false })).toBe(false);
    });

    it("hides expert+buildOptions item when expertMode is false regardless of buildOptions match", () => {
        const item = {
            key: "foo",
            mode: "connected",
            i18n: "tabFoo",
            icon: "i-lucide-x",
            expert: true,
            buildOptions: ["USE_FOO"],
        };
        expect(isItemVisible(item, { expertMode: false, buildOptions: ["USE_FOO"] })).toBe(false);
    });

    it("does not treat hideInSidebar as a visibility constraint for expert/build/feature checks", () => {
        const item = {
            key: "hidden_nav",
            mode: "connected",
            i18n: "tabHiddenNav",
            icon: "i-lucide-eye-off",
            hideInSidebar: true,
        };
        expect(isItemVisible(item, { expertMode: false })).toBe(true);
    });
});
