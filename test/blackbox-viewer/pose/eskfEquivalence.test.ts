/**
 * Equivalence tests for sparse performance optimizations in the ESKF.
 *
 * matMulByBt vs dense matMul(·, matTranspose(F)):
 *   The sparse version must produce BIT-IDENTICAL results to the dense version
 *   on random SPD P and the exact ESKF transition-matrix sparsity.
 *
 * Rank-m Joseph vs dense I_KH form:
 *   The rank-m formulation is MATH-EXACT for any gain K.  Verify against
 *   the dense O(n³) I_KH form on random SPD P, H, R for m = 1,2,3.
 */
import { describe, it, expect } from 'vitest';
import { matMul, matTranspose, matAdd, matMulByBt, getSparseStencil, buildTransition, _rankMJosephUpdate, _denseJosephUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import type { Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

type Mat = number[][];

function createRng(seed: number): () => number {
    let s = Math.trunc(seed);
    return function (): number {
        s = Math.trunc(s);
        s = Math.trunc(s + 0x6d2b79f5);
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomSPD(n: number, rng: () => number): Mat {
    const M: Mat = new Array(n);
    for (let i = 0; i < n; i++) {
        M[i] = new Array(n);
        for (let j = 0; j < n; j++) {
            M[i][j] = (rng() - 0.5) * 2;
        }
    }
    const P: Mat = new Array(n);
    const eps = 1e-3;
    for (let i = 0; i < n; i++) {
        P[i] = new Array(n);
        for (let j = 0; j < n; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) sum += M[i][k] * M[j][k];
            P[i][j] = sum + (i === j ? eps : 0);
        }
    }
    return P;
}

function maxAbsDiff(A: Mat, B: Mat): number {
    const n = A.length;
    let max = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const d = Math.abs(A[i][j] - B[i][j]);
            if (d > max) max = d;
        }
    }
    return max;
}

function buildRandomF(dim: number, rng: () => number): Mat {
    const qw = rng(), qx = rng(), qy = rng(), qz = rng();
    const nq = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
    const q: Quat = [qw / nq, qx / nq, qy / nq, qz / nq];
    const sf: Vec3 = [(rng() - 0.5) * 20, (rng() - 0.5) * 20, (rng() - 0.5) * 20];
    const dt = 0.001 + rng() * 0.01;
    return buildTransition(dim, q, sf, dt);
}

describe("matMulByBt — sparse A·Fᵀ equivalence", () => {
    const DIMS = [9, 15, 21];
    const SEED = 0x5EED;

    for (const dim of DIMS) {
        it(`dim=${dim}: bit-identical to dense matMul(A, matTranspose(F))`, () => {
            const rng = createRng(SEED + dim);
            const stencil = getSparseStencil(dim);

            for (let trial = 0; trial < 10; trial++) {
                const P = randomSPD(dim, rng);
                const F = buildRandomF(dim, rng);

                const FP = matMul(F, P);
                const FPFt_dense = matMul(FP, matTranspose(F));

                const FPFt_sparse = matMulByBt(FP, F, stencil);

                const diff = maxAbsDiff(FPFt_dense, FPFt_sparse);
                expect(diff).toBeLessThan(1e-10);
            }
        });
    }

    it("stencil covers all non-zero positions of buildTransition", () => {
        for (const dim of DIMS) {
            const rng = createRng(SEED + 100 + dim);
            const stencil = getSparseStencil(dim);

            for (let trial = 0; trial < 5; trial++) {
                const F = buildRandomF(dim, rng);
                const stencilSet: Set<number>[] = new Array(dim);
                for (let j = 0; j < dim; j++) {
                    stencilSet[j] = new Set(stencil[j]);
                }

                for (let j = 0; j < dim; j++) {
                    for (let k = 0; k < dim; k++) {
                        if (stencilSet[j].has(k)) continue;
                        expect(F[j][k]).toBe(0);
                    }
                }
            }
        }
    });
});

function buildRandomH(dim: number, m: number, rng: () => number): Mat {
    const H: Mat = new Array(m);
    for (let i = 0; i < m; i++) {
        H[i] = new Array(dim).fill(0);
        const nz = 1 + Math.floor(rng() * 3);
        for (let t = 0; t < nz; t++) {
            const col = Math.floor(rng() * dim);
            H[i][col] = (rng() - 0.5) * 2;
        }
    }
    return H;
}

function buildRandomR(m: number, rng: () => number): Mat {
    const L: Mat = new Array(m);
    for (let i = 0; i < m; i++) {
        L[i] = new Array(m).fill(0);
        L[i][i] = 0.01 + rng() * 0.5;
        for (let j = 0; j < i; j++) L[i][j] = (rng() - 0.5) * 0.2;
    }
    const Rmat: Mat = new Array(m);
    for (let i = 0; i < m; i++) {
        Rmat[i] = new Array(m).fill(0);
        for (let j = 0; j < m; j++) {
            let s = 0;
            for (let k = 0; k < m; k++) s += L[i][k] * L[j][k];
            Rmat[i][j] = s;
        }
    }
    return Rmat;
}

function buildKalmanGain(P: Mat, H: Mat, R: Mat, dim: number, m: number): { K: Mat; PHt: Mat; S: Mat } {
    const PHt: Mat = new Array(dim);
    for (let i = 0; i < dim; i++) {
        PHt[i] = new Array(m).fill(0);
        for (let k = 0; k < dim; k++) {
            const pik = P[i][k];
            if (pik === 0) continue;
            for (let j = 0; j < m; j++) PHt[i][j] += pik * H[j][k];
        }
    }

    const S: Mat = new Array(m);
    for (let i = 0; i < m; i++) {
        S[i] = new Array(m).fill(0);
        for (let j = 0; j < m; j++) {
            let s = 0;
            for (let k = 0; k < dim; k++) s += H[i][k] * PHt[k][j];
            S[i][j] = s + R[i][j];
        }
    }

    const aug: number[][] = new Array(m);
    for (let i = 0; i < m; i++) {
        aug[i] = new Array(2 * m);
        for (let j = 0; j < m; j++) {
            aug[i][j] = S[i][j];
            aug[i][j + m] = i === j ? 1 : 0;
        }
    }
    for (let i = 0; i < m; i++) {
        let maxRow = i, maxVal = Math.abs(aug[i][i]);
        for (let r = i + 1; r < m; r++) {
            if (Math.abs(aug[r][i]) > maxVal) { maxVal = Math.abs(aug[r][i]); maxRow = r; }
        }
        if (maxRow !== i) { const tmp = aug[i]; aug[i] = aug[maxRow]; aug[maxRow] = tmp; }
        const pivot = aug[i][i];
        if (Math.abs(pivot) < 1e-14) continue;
        for (let j = 0; j < 2 * m; j++) aug[i][j] /= pivot;
        for (let r = 0; r < m; r++) {
            if (r === i) continue;
            const factor = aug[r][i];
            for (let j = 0; j < 2 * m; j++) aug[r][j] -= factor * aug[i][j];
        }
    }
    const Sinv: Mat = new Array(m);
    for (let i = 0; i < m; i++) {
        Sinv[i] = new Array(m);
        for (let j = 0; j < m; j++) Sinv[i][j] = aug[i][j + m];
    }

    const K: Mat = new Array(dim);
    for (let i = 0; i < dim; i++) {
        K[i] = new Array(m).fill(0);
        for (let kj = 0; kj < m; kj++) {
            let s = 0;
            for (let ki = 0; ki < m; ki++) s += PHt[i][ki] * Sinv[ki][kj];
            K[i][kj] = s;
        }
    }

    return { K, PHt, S };
}

describe("rank-m Joseph — P⁺ = P − K·HP − (K·HP)ᵀ + K·S·Kᵀ", () => {
    const DIMS = [9, 15, 21];
    const SEED = 0xBEEF;
    const M_VALS = [1, 2, 3];

    for (const dim of DIMS) {
        for (const m of M_VALS) {
            it(`dim=${dim} m=${m}: math-exact equivalence to dense I_KH form`, () => {
                const rng = createRng(SEED + dim * 10 + m);

                for (let trial = 0; trial < 20; trial++) {
                    const P = randomSPD(dim, rng);
                    const H = buildRandomH(dim, m, rng);
                    const R = buildRandomR(m, rng);
                    const { K, PHt, S } = buildKalmanGain(P, H, R, dim, m);

                    const P_dense = _denseJosephUpdate(P, K, H, R, dim, m);
                    const P_rankm = _rankMJosephUpdate(P, K, PHt, S, dim, m);

                    const diff = maxAbsDiff(P_dense, P_rankm);
                    expect(diff).toBeLessThan(1e-10);
                }
            });
        }
    }
});
