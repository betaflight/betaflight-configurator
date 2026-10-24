import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { updateLegendValues, updateValuesChart } from "../../src/blackbox-viewer/values_display";
import { adjustFieldDefsList, FIRMWARE_TYPE_BETAFLIGHT } from "../../src/blackbox-viewer/flightlog_fielddefs";
import type { FlightLog, LogFrame } from "../../src/blackbox-viewer/flightlog";
import type { GraphFieldConfig } from "../../src/blackbox-viewer/graph_config";

const FIELDS = ["loopIteration", "time", "flightModeFlags", "gyroADC[0]", "GPS_coord[0]"];

function fakeLog(frame: LogFrame | false): FlightLog {
    return {
        getSmoothedFrameAtTime: () => frame,
        getMainFieldNames: () => FIELDS,
        getMainFieldIndexByName: (name: string) => {
            const index = FIELDS.indexOf(name);
            return index === -1 ? undefined : index;
        },
        getSysConfig: () => ({ firmwareType: 3, firmwareVersion: "4.5.0", gyro_scale: 1 }),
        getMinTime: () => 1_000_000,
        getMaxTime: () => 2_000_000,
        getChunksInTimeRange: () => [{ frames: frame ? [frame] : [] }],
        gyroRawToDegreesPerSecond: (value: number) => value * 2,
    } as unknown as FlightLog;
}

function graphStoreWith(fields: GraphFieldConfig[], overrides: Record<string, unknown> = {}) {
    return {
        activeGraphConfig: { getGraphs: () => [{ label: "g", fields }] },
        legendValues: {} as Record<string, { value: string | number; settings: string } | undefined>,
        hasTableOverlay: false,
        hasMarker: false,
        markerTime: 0,
        legendVisible: true,
        ...overrides,
    };
}

const field = (name: string, power: number | undefined = 0.5, smoothing = 100): GraphFieldConfig => ({
    name,
    curve: { power },
    smoothing,
});

describe("updateLegendValues", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("shows a raw fraction to two places and keeps a whole number as it is", () => {
        const frame: LogFrame = [1, 1_500_000, 0, 12.345, 7];
        const graphStore = graphStoreWith([field("gyroADC[0]"), field("GPS_coord[0]")]);
        updateLegendValues(fakeLog(frame), frame, graphStore as never, { legendUnits: false });
        expect(graphStore.legendValues["gyroADC[0]"]).toEqual({ value: "12.35", settings: "Z100 E50 S1" });
        expect(graphStore.legendValues["GPS_coord[0]"]).toEqual({ value: 7, settings: "Z100 E50 S1" });
    });

    it("shows a GPS slot that has no value yet as blank", () => {
        const frame: LogFrame = [1, 1_500_000, 0, 1, null];
        const graphStore = graphStoreWith([field("GPS_coord[0]")]);
        updateLegendValues(fakeLog(frame), frame, graphStore as never, { legendUnits: false });
        expect(graphStore.legendValues["GPS_coord[0]"]?.value).toBe("");
    });

    it("decodes to friendly units when the legend asks for units", () => {
        const frame: LogFrame = [1, 1_500_000, 0, 12.345, 7];
        const graphStore = graphStoreWith([field("gyroADC[0]")]);
        updateLegendValues(fakeLog(frame), frame, graphStore as never, { legendUnits: true });
        expect(graphStore.legendValues["gyroADC[0]"]?.value).toBe("25 °/s");
    });

    it("shows a curve saved without a power as NaN, as the JavaScript did", () => {
        const frame: LogFrame = [1, 1_500_000, 0, 1, 1];
        const graphStore = graphStoreWith([{ name: "gyroADC[0]", curve: {}, smoothing: 2500 }]);
        updateLegendValues(fakeLog(frame), frame, graphStore as never, { legendUnits: false });
        expect(graphStore.legendValues["gyroADC[0]"]?.settings).toBe("Z100 ENaN S25");
    });
});

describe("updateValuesChart", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    function stores(frame: LogFrame | false, graphOverrides: Record<string, unknown> = {}) {
        const flightLog = fakeLog(frame);
        const logStore = { flightLog, currentBlackboxTime: 1_250_000, fieldValues: [] as unknown[], fieldStats: [] };
        const graphStore = graphStoreWith([field("gyroADC[0]")], graphOverrides);
        const appStore = { statusFlightMode: "-", graphTimeDisplay: "", statusMarkerOffset: "" };
        return { logStore, graphStore, appStore };
    }

    function run(s: ReturnType<typeof stores>) {
        updateValuesChart(s.logStore as never, s.graphStore as never, s.appStore as never, { legendUnits: false });
    }

    it("writes nothing when there is no frame at the current time", () => {
        const s = stores(false);
        run(s);
        expect(s.appStore.graphTimeDisplay).toBe("");
        expect(s.graphStore.legendValues).toEqual({});
    });

    it("fills the value table only while it is open, marking an absent value", () => {
        const frame: LogFrame = [1, 1_250_000, 0, 1.5, null];
        const closed = stores(frame);
        run(closed);
        expect(closed.logStore.fieldValues).toEqual([]);

        const open = stores(frame, { hasTableOverlay: true });
        run(open);
        const raw = (open.logStore.fieldValues as { raw: unknown }[]).map((row) => row.raw);
        expect(raw).toEqual([1, 1_250_000, 0, "1.50", "(absent)"]);
    });

    it("keeps an infinite raw value as a number", () => {
        const s = stores([1, 1_250_000, 0, Infinity, 1], { hasTableOverlay: true });
        run(s);
        expect((s.logStore.fieldValues as { raw: unknown }[])[3].raw).toBe(Infinity);
    });

    it("shows the time from the log start, and the marker offset only with a marker", () => {
        const frame: LogFrame = [1, 1_250_000, 0, 1, 1];
        const plain = stores(frame);
        run(plain);
        expect(plain.appStore.graphTimeDisplay).toBe("00:00.250");
        expect(plain.appStore.statusMarkerOffset).toBe("");

        const marked = stores(frame, { hasMarker: true, markerTime: 1_000_000 });
        run(marked);
        expect(marked.appStore.statusMarkerOffset).toBe("Marker Offset 00:00.250ms 4Hz");
    });

    it("leaves the legend alone while it is hidden", () => {
        const s = stores([1, 1_250_000, 0, 1, 1], { legendVisible: false });
        run(s);
        expect(s.graphStore.legendValues).toEqual({});
    });

    it("shows the flight mode by name", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "4.5.0");
        const s = stores([1, 1_250_000, 2, 1, 1]);
        run(s);
        expect(s.appStore.statusFlightMode).toBe("ANGLE");
    });
});
