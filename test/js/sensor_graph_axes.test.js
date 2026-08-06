import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSensorGraph } from "../../src/composables/useSensorGraph.js";

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

function buildGraph(id) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = id;
    for (const className of ["grid x", "grid y", "data", "axis x", "axis y"]) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", className);
        svg.appendChild(group);
    }
    // jsdom has no layout engine, so feed the composable a size of our choosing.
    svg.getBoundingClientRect = () => ({ width: SVG_WIDTH, height: svgHeight });
    document.body.appendChild(svg);
}

function transformOf(id, selector) {
    return document.querySelector(`#${id} ${selector}`).getAttribute("transform");
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

        const baseline = Number(transformOf("gyro", ".axis.x").match(/,\s*(\d+)/)[1]);
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
