/**
 * Synthetic oracle tests for fitEllipsoid.
 *
 * Ground truth is planted: a known center and soft-iron matrix W are used to
 * generate points on a warped sphere (the forward model), then fitEllipsoid
 * must recover center and W_inv such that W_inv*W ~= I.
 *
 * Uses seeded mulberry32 PRNG — never Math.random.
 */
import { describe, expect, it } from "vitest";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";

// Deterministic PRNG (mulberry32) — never Math.random in tests.
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generate points on an ellipsoid defined by center c and soft-iron W.
 * A point on the unit sphere u gives raw = W * u + c (the forward model).
 * fitEllipsoid should recover center ~= c and W_inv ~= inv(W).
 */
function makeEllipsoidPoints(center, W, count, rng) {
    const points = [];
    for (let i = 0; i < count; i++) {
        // Sample a point on the unit sphere via spherical coords
        const theta = Math.acos(1 - 2 * rng());
        const phi = 2 * Math.PI * rng();
        const u = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        // Apply soft-iron warp and offset: raw = W * u + c
        const x = W[0][0] * u[0] + W[0][1] * u[1] + W[0][2] * u[2] + center.x;
        const y = W[1][0] * u[0] + W[1][1] * u[1] + W[1][2] * u[2] + center.y;
        const z = W[2][0] * u[0] + W[2][1] * u[1] + W[2][2] * u[2] + center.z;
        points.push({ x, y, z });
    }
    return points;
}

/** Matrix product A * B for 3x3 matrices. */
function mat3mul(A, B) {
    const C = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) {
            for (let j = 0; j < 3; j++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return C;
}

/** Frobenius norm of (A - I). */
function frobDistFromIdentity(A) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const d = A[i][j] - (i === j ? 1 : 0);
            sum += d * d;
        }
    }
    return Math.sqrt(sum);
}

describe("fitEllipsoid — synthetic oracle", () => {
    it("recovers center and soft-iron on a near-spherical ellipsoid", () => {
        const rng = mulberry32(0xdeadbeef);
        const center = { x: 150, y: -300, z: 80 };
        // Near-isotropic W (diagonal, ~1% anisotropy, scaled to ADC counts)
        const W = [
            [600, 0, 0],
            [0, 610, 0],
            [0, 0, 598],
        ];
        const points = makeEllipsoidPoints(center, W, 200, rng);
        const result = fitEllipsoid(points);

        expect(result).not.toBeNull();

        // Center recovery within 5 ADC counts
        expect(Math.abs(result.center.x - center.x)).toBeLessThan(5);
        expect(Math.abs(result.center.y - center.y)).toBeLessThan(5);
        expect(Math.abs(result.center.z - center.z)).toBeLessThan(5);

        // W_inv * W should be close to identity (Frobenius distance < 0.05)
        const product = mat3mul(result.W_inv, W);
        // Normalize: product should be ~= identity * scale; check W_inv*W / scale ~= I
        const scale = (product[0][0] + product[1][1] + product[2][2]) / 3;
        const normalized = product.map((row) => row.map((v) => v / scale));
        expect(frobDistFromIdentity(normalized)).toBeLessThan(0.05);
    });

    it("recovers center and soft-iron on an anisotropic ellipsoid", () => {
        const rng = mulberry32(0xcafebabe);
        const center = { x: -200, y: 50, z: 400 };
        // Anisotropic W (10% spread across axes)
        const W = [
            [550, 15, -5],
            [0, 620, 10],
            [0, 0, 500],
        ];
        const points = makeEllipsoidPoints(center, W, 300, rng);
        const result = fitEllipsoid(points);

        expect(result).not.toBeNull();
        expect(Math.abs(result.center.x - center.x)).toBeLessThan(10);
        expect(Math.abs(result.center.y - center.y)).toBeLessThan(10);
        expect(Math.abs(result.center.z - center.z)).toBeLessThan(10);

        const product = mat3mul(result.W_inv, W);
        const scale = (product[0][0] + product[1][1] + product[2][2]) / 3;
        const normalized = product.map((row) => row.map((v) => v / scale));
        expect(frobDistFromIdentity(normalized)).toBeLessThan(0.08);
    });

    it("returns null when fewer than 9 points are provided", () => {
        const rng = mulberry32(0x12345678);
        const center = { x: 0, y: 0, z: 0 };
        const W = [
            [500, 0, 0],
            [0, 500, 0],
            [0, 0, 500],
        ];
        const points = makeEllipsoidPoints(center, W, 8, rng);
        expect(fitEllipsoid(points)).toBeNull();
    });
});
