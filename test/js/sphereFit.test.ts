import { describe, expect, it } from "vitest";
import { check3DCoverage, computeDirectionalCoverage, fitSphere, type Point3 } from "../../src/js/utils/sphereFit";

// Evenly spread unit directions (Fibonacci sphere), deterministic.
function sphereDirections(n: number): Point3[] {
    const golden = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: n }, (_, i) => {
        const z = 1 - (2 * (i + 0.5)) / n;
        const r = Math.sqrt(1 - z * z);
        return { x: r * Math.cos(golden * i), y: r * Math.sin(golden * i), z };
    });
}

function onSphere(dirs: Point3[], center: Point3, radius: number): Point3[] {
    return dirs.map((d) => ({ x: center.x + d.x * radius, y: center.y + d.y * radius, z: center.z + d.z * radius }));
}

// A level spin: the field traces a horizontal circle, the classic planar tumble.
function levelSpin(n: number, center: Point3, radius: number): Point3[] {
    return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a), z: center.z - radius / 2 };
    });
}

const BIAS = { x: -90, y: 200, z: 900 };

describe("fitSphere", () => {
    it("recovers the center and radius of an offset sphere", () => {
        const fit = fitSphere(onSphere(sphereDirections(200), BIAS, 480));

        expect(fit).not.toBeNull();
        expect(fit!.center.x).toBeCloseTo(BIAS.x, 6);
        expect(fit!.center.y).toBeCloseTo(BIAS.y, 6);
        expect(fit!.center.z).toBeCloseTo(BIAS.z, 6);
        expect(fit!.radius).toBeCloseTo(480, 6);
        expect(fit!.residual).toBeLessThan(1e-6);
    });

    it("returns null for fewer than four points", () => {
        expect(fitSphere(onSphere(sphereDirections(3), BIAS, 480))).toBeNull();
    });
});

describe("check3DCoverage", () => {
    const tumble = onSphere(sphereDirections(400), BIAS, 480);

    it("refuses a full tumble with a large bias when measured from the origin", () => {
        // The behaviour behind "Finish calibration does nothing": every raw vector points the same way.
        expect(check3DCoverage(tumble).ok).toBe(false);
    });

    it("accepts the same tumble measured from its center", () => {
        const result = check3DCoverage(tumble, BIAS);

        expect(result.ok).toBe(true);
        expect(result.ratio).toBeGreaterThan(0.9);
    });

    it("still refuses a level spin measured from its center", () => {
        const spin = levelSpin(200, BIAS, 480);
        const result = check3DCoverage(spin, { x: BIAS.x, y: BIAS.y, z: BIAS.z - 240 });

        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/planar|Degenerate/);
    });

    it("refuses fewer than 20 samples", () => {
        expect(check3DCoverage(tumble.slice(0, 19), BIAS)).toEqual({
            ok: false,
            reason: "Not enough samples for 3D coverage check.",
        });
    });
});

describe("computeDirectionalCoverage", () => {
    it("covers every face for a full sphere around the given center", () => {
        const cov = computeDirectionalCoverage(onSphere(sphereDirections(400), BIAS, 480), BIAS);

        expect(cov.covered).toBe(20);
        expect(cov.fraction).toBe(1);
        expect(cov.uniform).toBe(cov.fraction);
    });

    it("counts a face only once it has minHits samples", () => {
        const points = [BIAS, BIAS, { x: BIAS.x, y: BIAS.y, z: BIAS.z + 1 }, { x: BIAS.x, y: BIAS.y, z: BIAS.z + 2 }];

        expect(computeDirectionalCoverage(points, BIAS, 2).covered).toBe(1);
        expect(computeDirectionalCoverage(points, BIAS, 3).covered).toBe(0);
    });
});
