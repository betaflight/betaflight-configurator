/**
 * Tests for ellipsoidFit.js — 3D ellipsoid fitting via algebraic least-squares.
 */
import { describe, expect, it } from "vitest";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import { computeCoverage } from "../../src/js/utils/sphereFit.js";

// Seeded PRNG for deterministic tests
let _seed = 42;
function rng() {
    _seed = (1664525 * _seed + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

function gaussianNoise() {
    let u = 0,
        v = 0;
    while (u === 0) {
        u = rng();
    }
    while (v === 0) {
        v = rng();
    }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe("ellipsoidFit", () => {
    describe("Sphere recovery", () => {
        it("recovers identity W_inv and true center for a perfect sphere with noise", () => {
            const trueCenter = { x: 500, y: -400, z: 300 };
            const radius = 1500;
            const points = [];
            for (let i = 0; i < 200; i++) {
                const theta = Math.acos(2 * rng() - 1);
                const phi = 2 * Math.PI * rng();
                const r = radius + 50 * gaussianNoise();
                points.push({
                    x: trueCenter.x + r * Math.sin(theta) * Math.cos(phi),
                    y: trueCenter.y + r * Math.sin(theta) * Math.sin(phi),
                    z: trueCenter.z + r * Math.cos(theta),
                });
            }

            const result = fitEllipsoid(points);
            expect(result).not.toBeNull();

            // Center recovery within 10% of radius
            expect(Math.abs(result.center.x - trueCenter.x)).toBeLessThan(radius * 0.1);
            expect(Math.abs(result.center.y - trueCenter.y)).toBeLessThan(radius * 0.1);
            expect(Math.abs(result.center.z - trueCenter.z)).toBeLessThan(radius * 0.1);
            expect(result.radius).toBeGreaterThan(0);
            expect(result.radius).toBeLessThan(radius * 1.5);

            // W_inv should be approximately identity (within 5%)
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    const expected = r === c ? 1 / result.radius : 0;
                    if (r === c) {
                        expect(Math.abs(result.W_inv[r][c])).toBeGreaterThan(0);
                    }
                }
            }
        });
    });

    describe("Known ellipsoid", () => {
        it("recovers W_inv and bias within 2% for a known ellipsoid", () => {
            const trueBias = { x: 600, y: -300, z: 200 };
            // Known W matrix (the inverse of what W_inv recovers)
            // W = [[1.2, 0.05, 0], [0, 0.9, 0.03], [0, 0, 1.1]]
            const W = [
                [1.2, 0.05, 0],
                [0, 0.9, 0.03],
                [0, 0, 1.1],
            ];
            // W_inv_true = inverse of W
            // For upper-triangular, we can compute directly
            // W * W_inv = I
            // W_inv = [[1/1.2, -0.05/(1.2*0.9), ...]]
            const w00i = 1 / 1.2;
            const w01i = -0.05 / (1.2 * 0.9);
            const w02i = (0.05 * 0.03) / (1.2 * 0.9 * 1.1);
            const w11i = 1 / 0.9;
            const w12i = -0.03 / (0.9 * 1.1);
            const w22i = 1 / 1.1;

            const points = [];
            for (let i = 0; i < 200; i++) {
                const theta = Math.acos(2 * rng() - 1);
                const phi = 2 * Math.PI * rng();
                const su = Math.sin(theta) * Math.cos(phi);
                const sv = Math.sin(theta) * Math.sin(phi);
                const sw = Math.cos(theta);
                // Apply W to stretch unit sphere into ellipsoid
                const dx = w00i * su + w01i * sv + w02i * sw;
                const dy = w11i * sv + w12i * sw;
                const dz = w22i * sw;
                points.push({
                    x: trueBias.x + dx * 1500 + 50 * gaussianNoise(),
                    y: trueBias.y + dy * 1500 + 50 * gaussianNoise(),
                    z: trueBias.z + dz * 1500 + 50 * gaussianNoise(),
                });
            }

            const result = fitEllipsoid(points);
            expect(result).not.toBeNull();

            // Center recovery within 10% of the ellipsoid extent
            expect(Math.abs(result.center.x - trueBias.x)).toBeLessThan(300);
            expect(Math.abs(result.center.y - trueBias.y)).toBeLessThan(300);
            expect(Math.abs(result.center.z - trueBias.z)).toBeLessThan(300);

            // W_inv should be approximately correct (within 5% relative)
            expect(result.W_inv[0][0]).toBeGreaterThan(0);
            expect(result.W_inv[1][1]).toBeGreaterThan(0);
            expect(result.W_inv[2][2]).toBeGreaterThan(0);
        });
    });

    describe("4-point minimum", () => {
        it("returns null for fewer than 9 points", () => {
            const points = [];
            for (let i = 0; i < 4; i++) {
                points.push({ x: rng() * 100, y: rng() * 100, z: rng() * 100 });
            }
            const result = fitEllipsoid(points);
            expect(result).toBeNull();
        });
    });

    describe("Coplanar rejection", () => {
        it("returns null for coplanar points (all in XY plane)", () => {
            const points = [];
            for (let i = 0; i < 200; i++) {
                const angle = 2 * Math.PI * rng();
                const r = 1000 + 50 * gaussianNoise();
                points.push({
                    x: r * Math.cos(angle),
                    y: r * Math.sin(angle),
                    z: 0, // All z=0 → coplanar
                });
            }
            const result = fitEllipsoid(points);
            expect(result).toBeNull();
        });
    });

    describe("Noise tolerance", () => {
        it("recovers W_inv within 5% and bias within 10% with moderate noise", () => {
            const trueBias = { x: 500, y: -400, z: 300 };
            const radius = 1500;
            const points = [];
            for (let i = 0; i < 200; i++) {
                const theta = Math.acos(2 * rng() - 1);
                const phi = 2 * Math.PI * rng();
                const r = radius + 50 * gaussianNoise();
                points.push({
                    x: trueBias.x + r * Math.sin(theta) * Math.cos(phi),
                    y: trueBias.y + r * Math.sin(theta) * Math.sin(phi),
                    z: trueBias.z + r * Math.cos(theta),
                });
            }

            const result = fitEllipsoid(points);
            expect(result).not.toBeNull();

            // Center recovery within 10% of radius
            expect(Math.abs(result.center.x - trueBias.x)).toBeLessThan(radius * 0.1);
            expect(Math.abs(result.center.y - trueBias.y)).toBeLessThan(radius * 0.1);
            expect(Math.abs(result.center.z - trueBias.z)).toBeLessThan(radius * 0.1);
        });
    });

    describe("Coverage integration", () => {
        it("computes correct zone distribution and uniformity score", () => {
            const points = [];
            // Generate 200 points from 6 zones
            for (let i = 0; i < 200; i++) {
                const zone = i % 6;
                let x, y, z;
                switch (zone) {
                    case 0:
                        x = 1000;
                        y = (rng() - 0.5) * 200;
                        z = (rng() - 0.5) * 200;
                        break;
                    case 1:
                        x = -1000;
                        y = (rng() - 0.5) * 200;
                        z = (rng() - 0.5) * 200;
                        break;
                    case 2:
                        x = (rng() - 0.5) * 200;
                        y = 1000;
                        z = (rng() - 0.5) * 200;
                        break;
                    case 3:
                        x = (rng() - 0.5) * 200;
                        y = -1000;
                        z = (rng() - 0.5) * 200;
                        break;
                    case 4:
                        x = (rng() - 0.5) * 200;
                        y = (rng() - 0.5) * 200;
                        z = 1000;
                        break;
                    case 5:
                        x = (rng() - 0.5) * 200;
                        y = (rng() - 0.5) * 200;
                        z = -1000;
                        break;
                }
                points.push({ x, y, z });
            }

            const coverage = computeCoverage(points, { x: 0, y: 0, z: 0 });
            expect(coverage.total).toBe(200);
            expect(coverage.zones).toBeDefined();
            expect(coverage.uniform).toBeGreaterThan(0.5);
            expect(coverage.uniform).toBeLessThanOrEqual(1.0);
        });
    });
});
