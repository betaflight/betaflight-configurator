import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The only part of three.js that needs a real GPU. Everything else, in particular the
// geometry construction this test is here to guard, runs unchanged.
const meshGeometries = [];

vi.mock("three", async (importOriginal) => {
    const three = await importOriginal();
    return {
        ...three,
        // Record what each mesh is actually built from. An empty geometry renders as nothing,
        // which looks the same as a working 3D view until you load a log and see no propellers.
        Mesh: class extends three.Mesh {
            constructor(geometry, material) {
                super(geometry, material);
                meshGeometries.push(geometry);
            }
        },
        WebGLRenderer: class {
            render() {}
            setViewport() {}
        },
    };
});

// Mirrors NUM_PROP_LEVELS in craft_3d.js. Level 0 is deliberately empty, the rest are the
// widening prop disc.
const PROP_LEVELS = 100;

function vertexCount(geometry) {
    return geometry.getAttribute("position")?.count ?? 0;
}

const { Craft3D } = await import("../../src/blackbox-viewer/craft_3d.js");

// Craft3D is built entirely in its constructor, and grapher.initializeCraftModel wraps that in a
// try/catch that treats any throw as "WebGL not supported" and silently drops to the 2D craft.
// A legacy three.js API therefore disables the 3D view without a trace, which is exactly what
// THREE.Geometry did. Constructing it here is the only thing that catches that.
function buildCraft(numMotors = 4) {
    const canvas = { width: 100, height: 100 };
    const flightLog = { getSysConfig: () => ({ motorOutput: [0, 2047] }) };
    const propColors = Array.from({ length: numMotors }, (_, i) => 0x100000 * (i + 1));
    return new Craft3D(flightLog, canvas, propColors);
}

function frameFor(numMotors) {
    const frame = [];
    const frameFieldIndexes = {};
    for (let i = 0; i < numMotors; i++) {
        frameFieldIndexes[`motor[${i}]`] = frame.push(1000) - 1;
    }
    frameFieldIndexes["heading[0]"] = frame.push(0.1) - 1;
    frameFieldIndexes["heading[1]"] = frame.push(0.2) - 1;
    return [frame, frameFieldIndexes];
}

describe("blackbox 3D craft model", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        meshGeometries.length = 0;
    });

    it.each([3, 4, 6, 8])("builds for a %i motor craft", (numMotors) => {
        expect(() => buildCraft(numMotors)).not.toThrow();
    });

    it("renders a frame across the throttle range", () => {
        const craft = buildCraft(4);
        const [frame, frameFieldIndexes] = frameFor(4);
        for (const throttle of [0, 1024, 2047]) {
            for (let i = 0; i < 4; i++) {
                frame[frameFieldIndexes[`motor[${i}]`]] = throttle;
            }
            expect(() => craft.render(frame, frameFieldIndexes)).not.toThrow();
        }
    });

    it("gives the body, arrow and every prop shell real geometry", () => {
        buildCraft(4);

        // Craft body, direction arrow, then one shell per motor.
        expect(meshGeometries).toHaveLength(6);
        for (const [index, geometry] of meshGeometries.entries()) {
            expect(vertexCount(geometry), `mesh ${index}`).toBeGreaterThan(0);
        }
    });

    it("builds every prop level from empty through to a full disc", () => {
        const craft = buildCraft(4);
        const [frame, frameFieldIndexes] = frameFor(4);
        const propGeometries = new Set();

        // motorOutput spans 0 to 2047, so this walks the whole prop level table.
        for (let throttle = 0; throttle <= 2047; throttle++) {
            for (let i = 0; i < 4; i++) {
                frame[frameFieldIndexes[`motor[${i}]`]] = throttle;
            }
            meshGeometries.length = 0;
            craft.render(frame, frameFieldIndexes);
            for (const geometry of meshGeometries) {
                propGeometries.add(geometry);
            }
        }

        // Collect the geometry instances rather than their vertex counts. A count set collapses
        // levels that happen to agree, so a single broken level could hide behind a healthy one.
        expect(propGeometries.size).toBe(PROP_LEVELS);

        const levels = [...propGeometries];
        expect(levels.filter((geometry) => vertexCount(geometry) === 0)).toHaveLength(1);
        expect(levels.filter((geometry) => vertexCount(geometry) > 0)).toHaveLength(PROP_LEVELS - 1);
    });

    it("resizes without touching a stale projection matrix", () => {
        const craft = buildCraft(4);
        expect(() => craft.resize(640, 480)).not.toThrow();
    });
});
