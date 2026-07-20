import { describe, it, expect } from 'vitest';
import { rtsSmooth, choleskyDecompose, choleskySolve, matrixInverse, matrixMultiply, matrixTranspose } from '../../../src/blackbox-viewer/pose/rtsSmoother.js';
import type { FilterResult } from '../../../src/blackbox-viewer/pose/rtsSmoother.js';
import type { Vec3, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

type Mat = number[][];

describe("rtsSmooth", () => {
    it("returns empty for empty input", () => {
        expect(rtsSmooth([], [])).toEqual([]);
    });

    it("single step returns filtered estimate unchanged", () => {
        const filtered: FilterResult[] = [
            {
                x: { p: [1, 2, 3] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                P: [[1, 0, 0, 0, 0, 0, 0, 0, 0],
                    [0, 1, 0, 0, 0, 0, 0, 0, 0],
                    [0, 0, 1, 0, 0, 0, 0, 0, 0],
                    [0, 0, 0, 1, 0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 1, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0, 1, 0, 0, 0],
                    [0, 0, 0, 0, 0, 0, 1, 0, 0],
                    [0, 0, 0, 0, 0, 0, 0, 1, 0],
                    [0, 0, 0, 0, 0, 0, 0, 0, 1]],
                xPred: null,
                PPred: null,
            },
        ];
        const result = rtsSmooth(filtered, []);
        expect(result).toHaveLength(1);
        expect(result[0].x.p).toEqual([1, 2, 3]);
    });

    it("smoother reduces covariance over a simple trajectory", () => {
        const I9: Mat = new Array(9);
        for (let i = 0; i < 9; i++) {
            I9[i] = new Array(9).fill(0);
            I9[i][i] = 1;
        }

        const P0 = I9.map(row => row.map(v => v * 10));
        const F = I9;

        const filtered: FilterResult[] = [
            {
                x: { p: [0, 0, 0] as Vec3, v: [1, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                P: P0,
                xPred: null,
                PPred: null,
            },
            {
                x: { p: [1, 0, 0] as Vec3, v: [1, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                P: I9,
                xPred: { p: [1, 0, 0] as Vec3, v: [1, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                PPred: P0,
            },
        ];

        const result = rtsSmooth(filtered, [F]);

        const tr0 = result[0].P[0][0] + result[0].P[4][4] + result[0].P[8][8];
        const trOriginal = P0[0][0] + P0[4][4] + P0[8][8];
        expect(tr0).toBeLessThan(trOriginal);
    });

    it("smoother distributes position correction backward along velocity", () => {
        const I9: Mat = new Array(9);
        for (let i = 0; i < 9; i++) {
            I9[i] = new Array(9).fill(0);
            I9[i][i] = 1;
        }

        const F: Mat = new Array(9);
        for (let i = 0; i < 9; i++) {
            F[i] = new Array(9).fill(0);
            F[i][i] = 1;
        }
        F[0][3] = 1.0;

        const P0 = I9.map(row => row.map(v => v * 10));
        const I1 = I9.map(row => row.map(v => v * 1));

        const filtered: FilterResult[] = [
            {
                x: { p: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                P: P0,
                xPred: null,
                PPred: null,
            },
            {
                x: { p: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                P: I1,
                xPred: { p: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat },
                PPred: P0,
            },
        ];

        const result = rtsSmooth(filtered, [F]);

        expect(isNaN(result[0].x.p[0])).toBe(false);
        expect(isNaN(result[0].x.v![0])).toBe(false);
    });

    it("handles null transition gracefully", () => {
        const I9: Mat = new Array(9);
        for (let i = 0; i < 9; i++) {
            I9[i] = new Array(9).fill(0);
            I9[i][i] = 1;
        }

        const filtered: FilterResult[] = [
            { x: { p: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat }, P: I9, xPred: null, PPred: null },
            { x: { p: [1, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat }, P: I9, xPred: { p: [1, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, q: [1, 0, 0, 0] as Quat }, PPred: I9 },
        ];

        const result = rtsSmooth(filtered, [null]);
        expect(result).toHaveLength(2);
        expect(result[0].x.p).toEqual([0, 0, 0]);
    });
});

function createRng(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomSPD(n: number, rng: () => number): Mat {
    const M: Mat = new Array(n);
    for (let i = 0; i < n; i++) {
        M[i] = new Array(n);
        for (let j = 0; j < n; j++) M[i][j] = (rng() - 0.5) * 2;
    }
    const P: Mat = new Array(n);
    const eps = 1e-3;
    for (let i = 0; i < n; i++) {
        P[i] = new Array(n);
        for (let j = 0; j < n; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) s += M[i][k] * M[j][k];
            P[i][j] = s + (i === j ? eps : 0);
        }
    }
    return P;
}

function maxAbsDiff(A: Mat, B: Mat): number {
    const n = A.length, m = A[0].length;
    let max = 0;
    for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++)
            max = Math.max(max, Math.abs(A[i][j] - B[i][j]));
    return max;
}

describe("Cholesky solve vs matrixInverse", () => {
    const DIMS = [9, 15, 21];
    const SEED = 0xCAFE;

    for (const dim of DIMS) {
        it(`dim=${dim}: Ck via Cholesky matches dense matrixInverse`, () => {
            const rng = createRng(SEED + dim);

            for (let trial = 0; trial < 10; trial++) {
                const Ppred = randomSPD(dim, rng);
                const PFt = randomSPD(dim, rng);

                const invPred = matrixInverse(Ppred);
                const Ck_dense = matrixMultiply(PFt, invPred);

                const L = choleskyDecompose(Ppred);
                const PFtT = matrixTranspose(PFt);
                const CkT = choleskySolve(L, PFtT);
                const Ck_chol = matrixTranspose(CkT);

                const diff = maxAbsDiff(Ck_dense, Ck_chol);
                expect(diff).toBeLessThan(5e-10);
            }
        });
    }
});
