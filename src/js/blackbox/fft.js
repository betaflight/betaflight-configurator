/**
 * Complex FFT implementation.
 *
 * Ported from betaflight-blackbox-log-viewer (public/js/complex.js).
 * Original BSD-2-Clause license by Jens Nockert and Jussi Kalliokoski.
 *
 * Converted to ES module. Supports mixed-radix (2, 3, 4, arbitrary)
 * Cooley-Tukey decomposition for any input size.
 *
 * Usage:
 *   const fft = new ComplexFFT(1024, false);  // forward transform
 *   fft.simple(output, input, 'real');         // real input → complex output
 *
 * Input/output arrays are interleaved complex: [re0, im0, re1, im1, ...]
 * For 'real' type input, the input array is just [x0, x1, x2, ...].
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

// Scratch buffer for twiddleMul() results, reused across butterfly iterations
// so we don't allocate inside the hot FFT loops.
const TWIDDLE_TMP = new Float64Array(2);

/**
 * Load the complex value at `output[idx..idx+1]`, multiply by the twiddle
 * factor `t[tIdx..tIdx+1]`, and return the result as a 2-element view.
 * Subsequent calls overwrite the view — callers must copy the real/imag
 * components into locals before calling again.
 */
function twiddleMul(output, idx, t, tIdx) {
    const sr = output[idx];
    const si = output[idx + 1];
    const tr = t[tIdx];
    const ti = t[tIdx + 1];
    TWIDDLE_TMP[0] = sr * tr - si * ti;
    TWIDDLE_TMP[1] = sr * ti + si * tr;
    return TWIDDLE_TMP;
}

function butterfly2(output, outputOffset, outputStride, fStride, state, m) {
    const t = state.twiddle;
    for (let i = 0; i < m; i++) {
        const idx0 = 2 * (outputOffset + outputStride * i);
        const idx1 = 2 * (outputOffset + outputStride * (i + m));
        const tidx = 2 * fStride * i;

        const s0r = output[idx0],
            s0i = output[idx0 + 1];
        const s1r = output[idx1],
            s1i = output[idx1 + 1];
        const t1r = t[tidx],
            t1i = t[tidx + 1];

        const v1r = s1r * t1r - s1i * t1i;
        const v1i = s1r * t1i + s1i * t1r;

        output[idx0] = s0r + v1r;
        output[idx0 + 1] = s0i + v1i;
        output[idx1] = s0r - v1r;
        output[idx1 + 1] = s0i - v1i;
    }
}

function butterfly3(output, outputOffset, outputStride, fStride, state, m) {
    const t = state.twiddle;
    const m1 = m,
        m2 = 2 * m;
    const fStride1 = fStride,
        fStride2 = 2 * fStride;
    const e = t[2 * fStride * m + 1];

    for (let i = 0; i < m; i++) {
        const idx0 = 2 * (outputOffset + outputStride * i);
        const idx1 = 2 * (outputOffset + outputStride * (i + m1));
        const idx2 = 2 * (outputOffset + outputStride * (i + m2));

        const s0r = output[idx0];
        const s0i = output[idx0 + 1];

        const v1 = twiddleMul(output, idx1, t, 2 * fStride1 * i);
        const v1r = v1[0],
            v1i = v1[1];
        const v2 = twiddleMul(output, idx2, t, 2 * fStride2 * i);
        const v2r = v2[0],
            v2i = v2[1];

        const i0r = v1r + v2r,
            i0i = v1i + v2i;

        output[idx0] = s0r + i0r;
        output[idx0 + 1] = s0i + i0i;

        const i1r = s0r - i0r * 0.5;
        const i1i = s0i - i0i * 0.5;
        const i2r = (v1r - v2r) * e;
        const i2i = (v1i - v2i) * e;

        output[idx1] = i1r - i2i;
        output[idx1 + 1] = i1i + i2r;
        output[idx2] = i1r + i2i;
        output[idx2 + 1] = i1i - i2r;
    }
}

function butterfly4(output, outputOffset, outputStride, fStride, state, m) {
    const t = state.twiddle;
    const m1 = m,
        m2 = 2 * m,
        m3 = 3 * m;
    const fStride1 = fStride,
        fStride2 = 2 * fStride,
        fStride3 = 3 * fStride;

    for (let i = 0; i < m; i++) {
        const idx0 = 2 * (outputOffset + outputStride * i);
        const idx1 = 2 * (outputOffset + outputStride * (i + m1));
        const idx2 = 2 * (outputOffset + outputStride * (i + m2));
        const idx3 = 2 * (outputOffset + outputStride * (i + m3));

        const s0r = output[idx0];
        const s0i = output[idx0 + 1];

        const v1 = twiddleMul(output, idx1, t, 2 * fStride1 * i);
        const v1r = v1[0],
            v1i = v1[1];
        const v2 = twiddleMul(output, idx2, t, 2 * fStride2 * i);
        const v2r = v2[0],
            v2i = v2[1];
        const v3 = twiddleMul(output, idx3, t, 2 * fStride3 * i);
        const v3r = v3[0],
            v3i = v3[1];

        const a0r = s0r + v2r,
            a0i = s0i + v2i;
        const a1r = s0r - v2r,
            a1i = s0i - v2i;
        const a2r = v1r + v3r,
            a2i = v1i + v3i;
        const a3r = v1r - v3r,
            a3i = v1i - v3i;

        output[idx0] = a0r + a2r;
        output[idx0 + 1] = a0i + a2i;
        output[idx2] = a0r - a2r;
        output[idx2 + 1] = a0i - a2i;

        if (state.inverse) {
            output[idx1] = a1r - a3i;
            output[idx1 + 1] = a1i + a3r;
            output[idx3] = a1r + a3i;
            output[idx3 + 1] = a1i - a3r;
        } else {
            output[idx1] = a1r + a3i;
            output[idx1 + 1] = a1i - a3r;
            output[idx3] = a1r - a3i;
            output[idx3 + 1] = a1i + a3r;
        }
    }
}

function butterflyN(output, outputOffset, outputStride, fStride, state, m, p) {
    const t = state.twiddle;
    const n = state.n;
    const scratch = new Float64Array(2 * p);

    for (let u = 0; u < m; u++) {
        for (let q1 = 0, k = u; q1 < p; q1++, k += m) {
            const idx = 2 * (outputOffset + outputStride * k);
            scratch[2 * q1] = output[idx];
            scratch[2 * q1 + 1] = output[idx + 1];
        }

        for (let q1 = 0, k = u; q1 < p; q1++, k += m) {
            const oIdx = 2 * (outputOffset + outputStride * k);
            output[oIdx] = scratch[0];
            output[oIdx + 1] = scratch[1];

            let tOffset = 0;
            for (let q = 1; q < p; q++) {
                tOffset = (tOffset + fStride * k) % n;
                const sr = output[oIdx],
                    si = output[oIdx + 1];
                const xr = scratch[2 * q],
                    xi = scratch[2 * q + 1];
                const tr = t[2 * tOffset],
                    ti = t[2 * tOffset + 1];
                output[oIdx] = sr + xr * tr - xi * ti;
                output[oIdx + 1] = si + xr * ti + xi * tr;
            }
        }
    }
}

function work(ctx, outputOffset, outputStride, fOffset, fStride, factors) {
    const { output, f, inputStride, state } = ctx;
    const p = factors.shift();
    const m = factors.shift();

    if (m === 1) {
        for (let i = 0; i < p * m; i++) {
            const srcIdx = 2 * (fOffset + fStride * inputStride * i);
            const dstIdx = 2 * (outputOffset + outputStride * i);
            output[dstIdx] = f[srcIdx];
            output[dstIdx + 1] = f[srcIdx + 1];
        }
    } else {
        for (let i = 0; i < p; i++) {
            work(
                ctx,
                outputOffset + outputStride * i * m,
                outputStride,
                fOffset + i * fStride * inputStride,
                fStride * p,
                factors.slice(),
            );
        }
    }

    switch (p) {
        case 2:
            butterfly2(output, outputOffset, outputStride, fStride, state, m);
            break;
        case 3:
            butterfly3(output, outputOffset, outputStride, fStride, state, m);
            break;
        case 4:
            butterfly4(output, outputOffset, outputStride, fStride, state, m);
            break;
        default:
            butterflyN(output, outputOffset, outputStride, fStride, state, m, p);
            break;
    }
}

/**
 * Mixed-radix complex FFT.
 *
 * @param {number} n - Transform size
 * @param {boolean} inverse - true for inverse FFT
 */
export class ComplexFFT {
    constructor(n, inverse) {
        n = Math.trunc(n);
        inverse = !!inverse;
        if (n < 1) {
            throw new RangeError(`FFT size must be positive, got ${n}`);
        }

        const state = {
            n,
            inverse,
            factors: [],
            twiddle: new Float64Array(2 * n),
            scratch: new Float64Array(2 * n),
        };

        const theta = (2 * Math.PI) / n;
        for (let i = 0; i < n; i++) {
            const phase = inverse ? theta * i : -theta * i;
            state.twiddle[2 * i] = Math.cos(phase);
            state.twiddle[2 * i + 1] = Math.sin(phase);
        }

        let rem = n;
        let p = 4;
        const v = Math.floor(Math.sqrt(n));
        while (rem > 1) {
            while (rem % p) {
                switch (p) {
                    case 4:
                        p = 2;
                        break;
                    case 2:
                        p = 3;
                        break;
                    default:
                        p += 2;
                        break;
                }
                if (p > v) {
                    p = rem;
                }
            }
            rem /= p;
            state.factors.push(p, rem);
        }

        this.state = state;
    }

    /**
     * Compute FFT.
     *
     * @param {Float64Array} output - Interleaved complex output [re0, im0, ...]
     * @param {Float64Array|Float32Array} input - Input data
     * @param {string} [type='complex'] - 'real' for real-valued input, 'complex' for interleaved complex
     */
    simple(output, input, type) {
        const { state } = this;
        if (type === "real") {
            for (let i = 0; i < state.n; i++) {
                state.scratch[2 * i] = input[i];
                state.scratch[2 * i + 1] = 0;
            }
            work({ output, f: state.scratch, inputStride: 1, state }, 0, 1, 0, 1, state.factors.slice());
        } else if (input === output) {
            work({ output: state.scratch, f: input, inputStride: 1, state }, 0, 1, 0, 1, state.factors.slice());
            for (let i = 0; i < state.n; i++) {
                output[2 * i] = state.scratch[2 * i];
                output[2 * i + 1] = state.scratch[2 * i + 1];
            }
        } else {
            work({ output, f: input, inputStride: 1, state }, 0, 1, 0, 1, state.factors.slice());
        }
    }
}
