import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSensorsStore } from "../../../src/stores/sensors";

describe("sensors store persistence", () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it("saves under the sensors_tab key and nothing else", () => {
        const store = useSensorsStore();
        store.updateRate("gyro", 20);

        expect(Object.keys(localStorage)).toEqual(["sensors_tab"]);
        expect(JSON.parse(localStorage.getItem("sensors_tab")).sensors_tab.rates.gyro).toBe(20);
    });

    it("restores what it saved", () => {
        const store = useSensorsStore();
        store.updateRate("gyro", 20);
        store.updateScale("accel", 4);
        store.updateCheckbox(3, true);
        store.updateDebugScale(2, 100);

        setActivePinia(createPinia());
        const reloaded = useSensorsStore();
        reloaded.loadFromConfig();

        expect(reloaded.rates.gyro).toBe(20);
        expect(reloaded.scales.accel).toBe(4);
        expect(reloaded.checkboxes[3]).toBe(true);
        expect(reloaded.debugScales[2]).toBe(100);
    });

    it("migrates a six-entry checkbox array by inserting pitot at index 5", () => {
        localStorage.setItem(
            "sensors_tab",
            JSON.stringify({ sensors_tab: { checkboxes: [true, true, false, false, false, true] } }),
        );
        const store = useSensorsStore();
        store.loadFromConfig();

        expect(store.checkboxes).toEqual([true, true, false, false, false, false, true]);
    });
});
