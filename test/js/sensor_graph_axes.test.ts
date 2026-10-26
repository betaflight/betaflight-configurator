import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSensorGraph } from "../../src/composables/useSensorGraph";

// The graph SVGs stretch with their container, so the x-axis offset cannot be
// baked into the template — it has to be derived from the measured height, or the
// horizontal scale ends up floating in the middle of the plot instead of sitting
// on the baseline of the vertical scale (see ReceiverTab for the fixed-height case
// that happened to work).
const GRAPH_IDS = ["gyro", "accel", "mag", "altitude", "sonar"];

// Mirrors the margins in useSensorGraph.
const MARGIN = { top: 10, bottom: 20, left: 40, right: 10 };

let svgHeight = 160;
const SVG_WIDTH = 500;

function buildGraph(id: string) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = id;
    for (const className of ["grid x", "grid y", "data", "axis x", "axis y"]) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", className);
        svg.appendChild(group);
    }
    // jsdom has no layout engine, so feed the composable a size of our choosing.
    svg.getBoundingClientRect = () => ({ width: SVG_WIDTH, height: svgHeight }) as DOMRect;
    document.body.appendChild(svg);
}

function transformOf(id: string, selector: string) {
    return document.querySelector(`#${id} ${selector}`)!.getAttribute("transform");
}

describe("sensor graph axis placement", () => {
    beforeEach(() => {
        svgHeight = 160;
        for (const id of GRAPH_IDS) {
            buildGraph(id);
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("puts the horizontal scale on the baseline of the vertical scale", () => {
        const { initializeGraphs } = useSensorGraph();
        initializeGraphs({}, 0);

        const plotHeight = svgHeight - MARGIN.top - MARGIN.bottom;

        for (const id of GRAPH_IDS) {
            expect(transformOf(id, ".axis.y")).toBe(`translate(${MARGIN.left}, ${MARGIN.top})`);
            expect(transformOf(id, ".axis.x")).toBe(`translate(${MARGIN.left}, ${MARGIN.top + plotHeight})`);
            // The grid must line up with the axes it belongs to.
            expect(transformOf(id, ".grid.y")).toBe(transformOf(id, ".axis.y"));
            expect(transformOf(id, ".grid.x")).toBe(transformOf(id, ".axis.x"));
            // Data shares the plot origin with the vertical scale.
            expect(transformOf(id, ".data")).toBe(transformOf(id, ".axis.y"));
        }
    });

    it("leaves room below the plot for the x tick labels", () => {
        const { initializeGraphs } = useSensorGraph();
        initializeGraphs({}, 0);

        const baseline = Number(transformOf("gyro", ".axis.x")!.match(/,\s*(\d+)/)![1]);
        expect(svgHeight - baseline).toBe(MARGIN.bottom);
    });

    it("follows the SVG when it is resized", () => {
        const { initializeGraphs, addGyroSample, updateGraphs } = useSensorGraph();
        initializeGraphs({}, 0);

        svgHeight = 260;
        addGyroSample([1, 2, 3]);
        updateGraphs();

        const plotHeight = svgHeight - MARGIN.top - MARGIN.bottom;
        expect(transformOf("gyro", ".axis.x")).toBe(`translate(${MARGIN.left}, ${MARGIN.top + plotHeight})`);
    });
});

describe("sensor graph samples", () => {
    beforeEach(() => {
        svgHeight = 160;
        for (const id of [...GRAPH_IDS, "debug0"]) {
            buildGraph(id);
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps the last 300 samples of every axis, numbered in arrival order", () => {
        const { initializeGraphs, addGyroSample, gyro_data } = useSensorGraph();
        initializeGraphs(null, 0);

        for (let i = 0; i < 305; i++) {
            addGyroSample([i, -i, 0]);
        }

        for (const series of gyro_data.value) {
            expect(series).toHaveLength(300);
            expect(series[0][0]).toBe(5);
            expect(series.at(-1)![0]).toBe(304);
        }
        expect(gyro_data.value[1].at(-1)![1]).toBe(-304);
    });

    it("widens each series' range to the extremes seen, starting from [-1, 1]", () => {
        const { initializeGraphs, addAltitudeSample, altitude_data } = useSensorGraph();
        initializeGraphs(null, 0);
        const [series] = altitude_data.value;
        expect([series.min, series.max]).toEqual([-1, 1]);

        addAltitudeSample([0.5]);
        expect([series.min, series.max]).toEqual([-1, 1]);

        addAltitudeSample([-3]);
        addAltitudeSample([7]);
        expect([series.min, series.max]).toEqual([-3, 7]);
    });

    it("numbers debug samples by the shared counter, and ignores a column it has no graph for", () => {
        const { initializeGraphs, addDebugSample, incrementDebugCounter, debug_data } = useSensorGraph();
        initializeGraphs(null, 1);

        addDebugSample(0, [10]);
        addDebugSample(0, [11]);
        incrementDebugCounter();
        addDebugSample(0, [12]);
        expect(() => addDebugSample(3, [99])).not.toThrow();

        expect(debug_data.value).toHaveLength(1);
        expect(debug_data.value[0][0].map(([sample]) => sample)).toEqual([0, 0, 1]);
    });
});
