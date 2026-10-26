import { describe, it, expect } from "vitest";
import {
    savePenDefaults,
    restorePenDefaults,
    changePenSmoothing,
    changePenZoom,
    changePenExpo,
} from "../../src/blackbox-viewer/pen_adjustment";
import type { GraphPanelConfig } from "../../src/blackbox-viewer/graph_config";

function graphs(): GraphPanelConfig[] {
    return [
        {
            label: "Gyro",
            fields: [
                {
                    name: "a",
                    friendlyName: "A",
                    smoothing: 5000,
                    curve: { power: 0.5, MinMax: { min: -100, max: 300 } },
                },
                { name: "b", friendlyName: "B", smoothing: 0, curve: { power: 1, MinMax: { min: 0, max: 10 } } },
            ],
        },
    ];
}

describe("pen defaults", () => {
    it("does nothing without a pen", () => {
        const g = graphs();
        expect(savePenDefaults(g, null, null)).toBeNull();
        expect(restorePenDefaults(g, undefined, undefined)).toBeNull();
        expect(changePenSmoothing(g, null, null, true)).toBeNull();
        expect(changePenZoom(g, null, null, true)).toBeNull();
        expect(changePenExpo(g, null, null, true)).toBeNull();
        expect(g).toEqual(graphs());
    });

    it("cannot restore a pen whose defaults were never stored", () => {
        expect(restorePenDefaults(graphs(), "0", "1")).toBeNull();
        expect(restorePenDefaults(graphs(), "0", null)).toBeNull();
    });

    it("stores the first values only, and restores them after changes", () => {
        const g = graphs();
        changePenSmoothing(g, "0", "0", false);
        changePenExpo(g, "0", "0", false);
        expect(g[0].fields[0].default).toEqual({ smoothing: 5000, power: 0.5 });
        expect(savePenDefaults(g, "0", "0")).toBeNull();
        expect(restorePenDefaults(g, "0", "0")).toBe("<h4>Restored defaults for single pen</h4>");
        expect(g[0].fields[0].smoothing).toBe(5000);
        expect(g[0].fields[0].curve?.power).toBe(0.5);
        expect(g[0].fields[1].default).toBeUndefined();
    });

    it("keeps a pen's stored defaults when the whole graph is changed later", () => {
        const g = graphs();
        changePenExpo(g, "0", "0", true);
        changePenExpo(g, "0", null, true);
        expect(g[0].fields[0].default).toEqual({ smoothing: 5000, power: 0.5 });
        expect(g[0].fields[1].default).toEqual({ smoothing: 0, power: 1 });
    });

    it("stores and restores every pen of a graph", () => {
        const g = graphs();
        expect(savePenDefaults(g, "0", null)).toBe("<h4>Stored defaults for all pens</h4>");
        changePenExpo(g, "0", null, true);
        expect(restorePenDefaults(g, "0", null)).toBe("<h4>Restored defaults for all pens</h4>");
        expect(g[0].fields.map((f) => f.curve?.power)).toEqual([0.5, 1]);
    });
});

describe("changePenSmoothing", () => {
    function stepped(start: number, down: boolean): number | undefined {
        const g = graphs();
        g[0].fields[0].smoothing = start;
        changePenSmoothing(g, "0", "0", down);
        return g[0].fields[0].smoothing;
    }

    it("steps by a thousand below 1%, ten thousand below 10%, then a hundred thousand", () => {
        expect(stepped(0, false)).toBe(1000);
        expect(stepped(9000, false)).toBe(10000);
        expect(stepped(10000, false)).toBe(20000);
        expect(stepped(100000, false)).toBe(200000);
        expect(stepped(10000, true)).toBe(9000);
        expect(stepped(100000, true)).toBe(90000);
        expect(stepped(1500, true)).toBe(1000);
    });

    it("starts a pen with no smoothing from zero", () => {
        const g = graphs();
        delete g[0].fields[1].smoothing;
        changePenSmoothing(g, "0", "1", false);
        expect(g[0].fields[1].smoothing).toBe(1000);
        expect(g[0].fields[0].smoothing).toBe(5000);
    });

    it("stays inside 0..1,000,000", () => {
        expect(stepped(0, true)).toBe(0);
        expect(stepped(1000000, false)).toBe(1000000);
    });

    it("labels every changed pen with its new percentage", () => {
        expect(changePenSmoothing(graphs(), "0", null, false)).toBe("<h4>Smoothing</h4>A 60.00%\nB 10.00%\n");
    });
});

describe("changePenZoom", () => {
    it("scales the range about its middle, out on a truthy delta", () => {
        const g = graphs();
        expect(changePenZoom(g, "0", "0", true)).toBe("<h4></h4>Zoom out:\nA\n");
        expect(g[0].fields[0].curve?.MinMax?.min).toBeCloseTo(-110);
        expect(g[0].fields[0].curve?.MinMax?.max).toBeCloseTo(310);
        changePenZoom(g, "0", null, false);
        expect(g[0].fields[0].curve?.MinMax?.min).toBeCloseTo(-100);
        expect(g[0].fields[1].curve?.MinMax?.max).toBeCloseTo(5 + 5 / 1.05);
    });
});

describe("changePenExpo", () => {
    it("steps the power by 0.05 and keeps it within 0.05..1", () => {
        const g = graphs();
        expect(changePenExpo(g, "0", "0", true)).toBe("<h4>Expo</h4>A 45.00%\n");
        changePenExpo(g, "0", "1", false);
        expect(g[0].fields[1].curve?.power).toBe(1);
        for (let i = 0; i < 20; i++) {
            changePenExpo(g, "0", "0", true);
        }
        expect(g[0].fields[0].curve?.power).toBe(0.05);
    });
});
