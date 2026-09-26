import { beforeEach, describe, expect, it, vi } from "vitest";

const { tracking } = vi.hoisted(() => ({
    tracking: { sendChangeEvents: vi.fn(), EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" } },
}));
vi.mock("../../src/js/Analytics", () => ({ getTracking: () => tracking }));

import Features from "../../src/js/Features";

const names = (f: Features) => f.getFeatures().map((feature) => feature.name);

describe("Features", () => {
    beforeEach(() => tracking.sendChangeEvents.mockClear());

    it("keeps only features the build supports, plus telemetry for a telemetry-carrying receiver", () => {
        const f = new Features({ apiVersion: "1.46.0", buildOptions: ["USE_GPS", "USE_SERIALRX_CRSF"] });
        expect(names(f)).toContain("GPS");
        expect(names(f)).not.toContain("OSD");
        expect(names(f)).toContain("AIRMODE"); // no dependsOn, always kept
        expect(names(f)).toContain("TELEMETRY"); // added back for CRSF
    });

    it("updates the mask from a plain { name, checked } and records the change", () => {
        const f = new Features({ apiVersion: "1.47.0" });
        f.updateData({ name: "GPS", checked: true });
        expect(f.isEnabled("GPS")).toBe(true);
        expect(f.getMask()).toBe(1 << 7);
        expect(tracking.sendChangeEvents).toHaveBeenCalledWith("fc", { FeatureGPS: "On" });

        f.updateData({ name: "GPS", checked: false });
        expect(f.peekMask()).toBe(0);
    });

    it("updates the mask from a checkbox element and a select element", () => {
        const f = new Features({ apiVersion: "1.47.0" });

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.bit = "22";
        checkbox.checked = true;
        f.updateData(checkbox);
        expect(f.isEnabled("AIRMODE")).toBe(true);

        const select = document.createElement("select");
        for (const bit of ["-1", "3", "14"]) {
            const option = document.createElement("option");
            option.value = bit;
            select.appendChild(option);
        }
        select.value = "14";
        f.updateData(select);
        expect(f.isEnabled("RX_MSP")).toBe(true);
        expect(f.isEnabled("RX_SERIAL")).toBe(false);

        f.getMask();
        expect(tracking.sendChangeEvents).toHaveBeenCalledWith("fc", {
            FeatureAIRMODE: "On",
            "FeatureGroup-rxMode": "RX_MSP",
        });
    });

    it("flushes the analytics changes on getMask but not on peekMask", () => {
        const f = new Features({ apiVersion: "1.47.0" });
        f.enable("OSD");
        f.updateData({ name: "OSD", checked: true });
        f.peekMask();
        expect(tracking.sendChangeEvents).not.toHaveBeenCalled();
        f.getMask();
        f.getMask();
        expect(tracking.sendChangeEvents).toHaveBeenLastCalledWith("fc", {});
    });
});
