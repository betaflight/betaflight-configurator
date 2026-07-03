/* Copyright (c) 2012, Jens Nockert <jens@ofmlabs.org>, Jussi Kalliokoski <jussi@ofmlabs.org>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

function butterfly2(output, outputOffset, outputStride, fStride, state, m) {
    const t = state.twiddle;

    for (let i = 0; i < m; i++) {
        const s0_r = output[2 * (outputOffset + outputStride * i)],
            s0_i = output[2 * (outputOffset + outputStride * i) + 1];
        const s1_r = output[2 * (outputOffset + outputStride * (i + m))],
            s1_i = output[2 * (outputOffset + outputStride * (i + m)) + 1];

        const t1_r = t[2 * fStride * i],
            t1_i = t[2 * fStride * i + 1];

        const v1_r = s1_r * t1_r - s1_i * t1_i,
            v1_i = s1_r * t1_i + s1_i * t1_r;

        const r0_r = s0_r + v1_r,
            r0_i = s0_i + v1_i;
        const r1_r = s0_r - v1_r,
            r1_i = s0_i - v1_i;

        output[2 * (outputOffset + outputStride * i)] = r0_r;
        output[2 * (outputOffset + outputStride * i) + 1] = r0_i;
        output[2 * (outputOffset + outputStride * (i + m))] = r1_r;
        output[2 * (outputOffset + outputStride * (i + m)) + 1] = r1_i;
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
        const s0_r = output[2 * (outputOffset + outputStride * i)],
            s0_i = output[2 * (outputOffset + outputStride * i) + 1];

        const s1_r = output[2 * (outputOffset + outputStride * (i + m1))],
            s1_i = output[2 * (outputOffset + outputStride * (i + m1)) + 1];
        const t1_r = t[2 * fStride1 * i],
            t1_i = t[2 * fStride1 * i + 1];
        const v1_r = s1_r * t1_r - s1_i * t1_i,
            v1_i = s1_r * t1_i + s1_i * t1_r;

        const s2_r = output[2 * (outputOffset + outputStride * (i + m2))],
            s2_i = output[2 * (outputOffset + outputStride * (i + m2)) + 1];
        const t2_r = t[2 * fStride2 * i],
            t2_i = t[2 * fStride2 * i + 1];
        const v2_r = s2_r * t2_r - s2_i * t2_i,
            v2_i = s2_r * t2_i + s2_i * t2_r;

        const i0_r = v1_r + v2_r,
            i0_i = v1_i + v2_i;

        const r0_r = s0_r + i0_r,
            r0_i = s0_i + i0_i;
        output[2 * (outputOffset + outputStride * i)] = r0_r;
        output[2 * (outputOffset + outputStride * i) + 1] = r0_i;

        const i1_r = s0_r - i0_r * 0.5;
        const i1_i = s0_i - i0_i * 0.5;

        const i2_r = (v1_r - v2_r) * e;
        const i2_i = (v1_i - v2_i) * e;

        const r1_r = i1_r - i2_i;
        const r1_i = i1_i + i2_r;
        output[2 * (outputOffset + outputStride * (i + m1))] = r1_r;
        output[2 * (outputOffset + outputStride * (i + m1)) + 1] = r1_i;

        const r2_r = i1_r + i2_i;
        const r2_i = i1_i - i2_r;
        output[2 * (outputOffset + outputStride * (i + m2))] = r2_r;
        output[2 * (outputOffset + outputStride * (i + m2)) + 1] = r2_i;
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
        const s0_r = output[2 * (outputOffset + outputStride * i)],
            s0_i = output[2 * (outputOffset + outputStride * i) + 1];

        const s1_r = output[2 * (outputOffset + outputStride * (i + m1))],
            s1_i = output[2 * (outputOffset + outputStride * (i + m1)) + 1];
        const t1_r = t[2 * fStride1 * i],
            t1_i = t[2 * fStride1 * i + 1];
        const v1_r = s1_r * t1_r - s1_i * t1_i,
            v1_i = s1_r * t1_i + s1_i * t1_r;

        const s2_r = output[2 * (outputOffset + outputStride * (i + m2))],
            s2_i = output[2 * (outputOffset + outputStride * (i + m2)) + 1];
        const t2_r = t[2 * fStride2 * i],
            t2_i = t[2 * fStride2 * i + 1];
        const v2_r = s2_r * t2_r - s2_i * t2_i,
            v2_i = s2_r * t2_i + s2_i * t2_r;

        const s3_r = output[2 * (outputOffset + outputStride * (i + m3))],
            s3_i = output[2 * (outputOffset + outputStride * (i + m3)) + 1];
        const t3_r = t[2 * fStride3 * i],
            t3_i = t[2 * fStride3 * i + 1];
        const v3_r = s3_r * t3_r - s3_i * t3_i,
            v3_i = s3_r * t3_i + s3_i * t3_r;

        const i0_r = s0_r + v2_r,
            i0_i = s0_i + v2_i;
        const i1_r = s0_r - v2_r,
            i1_i = s0_i - v2_i;
        const i2_r = v1_r + v3_r,
            i2_i = v1_i + v3_i;
        const i3_r = v1_r - v3_r,
            i3_i = v1_i - v3_i;

        const r0_r = i0_r + i2_r,
            r0_i = i0_i + i2_i;

        let r1_r, r1_i;
        if (state.inverse) {
            r1_r = i1_r - i3_i;
            r1_i = i1_i + i3_r;
        } else {
            r1_r = i1_r + i3_i;
            r1_i = i1_i - i3_r;
        }

        const r2_r = i0_r - i2_r,
            r2_i = i0_i - i2_i;

        let r3_r, r3_i;
        if (state.inverse) {
            r3_r = i1_r + i3_i;
            r3_i = i1_i - i3_r;
        } else {
            r3_r = i1_r - i3_i;
            r3_i = i1_i + i3_r;
        }

        output[2 * (outputOffset + outputStride * i)] = r0_r;
        output[2 * (outputOffset + outputStride * i) + 1] = r0_i;
        output[2 * (outputOffset + outputStride * (i + m1))] = r1_r;
        output[2 * (outputOffset + outputStride * (i + m1)) + 1] = r1_i;
        output[2 * (outputOffset + outputStride * (i + m2))] = r2_r;
        output[2 * (outputOffset + outputStride * (i + m2)) + 1] = r2_i;
        output[2 * (outputOffset + outputStride * (i + m3))] = r3_r;
        output[2 * (outputOffset + outputStride * (i + m3)) + 1] = r3_i;
    }
}

function butterfly(output, outputOffset, outputStride, fStride, state, m, p) {
    const t = state.twiddle,
        n = state.n,
        scratch = new Float64Array(2 * p);

    for (let u = 0; u < m; u++) {
        for (let q1 = 0, k = u; q1 < p; q1++, k += m) {
            const x0_r = output[2 * (outputOffset + outputStride * k)],
                x0_i = output[2 * (outputOffset + outputStride * k) + 1];
            scratch[2 * q1] = x0_r;
            scratch[2 * q1 + 1] = x0_i;
        }

        for (let q1 = 0, k = u; q1 < p; q1++, k += m) {
            let tOffset = 0;

            const x0_r = scratch[0],
                x0_i = scratch[1];
            output[2 * (outputOffset + outputStride * k)] = x0_r;
            output[2 * (outputOffset + outputStride * k) + 1] = x0_i;

            for (let q = 1; q < p; q++) {
                tOffset = (tOffset + fStride * k) % n;

                const s0_r = output[2 * (outputOffset + outputStride * k)],
                    s0_i = output[2 * (outputOffset + outputStride * k) + 1];

                const s1_r = scratch[2 * q],
                    s1_i = scratch[2 * q + 1];
                const t1_r = t[2 * tOffset],
                    t1_i = t[2 * tOffset + 1];
                const v1_r = s1_r * t1_r - s1_i * t1_i,
                    v1_i = s1_r * t1_i + s1_i * t1_r;

                const r0_r = s0_r + v1_r,
                    r0_i = s0_i + v1_i;
                output[2 * (outputOffset + outputStride * k)] = r0_r;
                output[2 * (outputOffset + outputStride * k) + 1] = r0_i;
            }
        }
    }
}

function work(out, inp, inputStride, factors, state) {
    const { data: output, offset: outputOffset, stride: outputStride } = out;
    const { data: f, offset: fOffset, stride: fStride } = inp;
    const p = factors.shift();
    const m = factors.shift();

    if (m === 1) {
        for (let i = 0; i < p * m; i++) {
            const x0_r = f[2 * (fOffset + fStride * inputStride * i)],
                x0_i = f[2 * (fOffset + fStride * inputStride * i) + 1];
            output[2 * (outputOffset + outputStride * i)] = x0_r;
            output[2 * (outputOffset + outputStride * i) + 1] = x0_i;
        }
    } else {
        for (let i = 0; i < p; i++) {
            work(
                { data: output, offset: outputOffset + outputStride * i * m, stride: outputStride },
                { data: f, offset: fOffset + i * fStride * inputStride, stride: fStride * p },
                inputStride,
                factors.slice(),
                state,
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
            butterfly(output, outputOffset, outputStride, fStride, state, m, p);
            break;
    }
}

export function FFTComplex(n, inverse) {
    if (n === undefined || inverse === undefined) {
        throw new RangeError("FFTComplex requires both `n` and `inverse` arguments");
    }

    n = Math.trunc(n);
    inverse = !!inverse;

    if (!Number.isFinite(n) || n < 1) {
        throw new RangeError(`n is outside range, should be a finite positive integer, was \`${n}'`);
    }

    const state = {
        n: n,
        inverse: inverse,
        factors: [],
        twiddle: new Float64Array(2 * n),
        scratch: new Float64Array(2 * n),
    };

    const t = state.twiddle,
        theta = (2 * Math.PI) / n;

    for (let i = 0; i < n; i++) {
        const phase = inverse ? theta * i : -theta * i;
        t[2 * i] = Math.cos(phase);
        t[2 * i + 1] = Math.sin(phase);
    }

    let p = 4;
    const v = Math.floor(Math.sqrt(n));

    while (n > 1) {
        while (n % p) {
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
                p = n;
            }
        }

        n /= p;

        state.factors.push(p, n);
    }

    this.state = state;
}

FFTComplex.prototype.simple = function (output, input, t) {
    this.process(output, 0, 1, input, 0, 1, t);
};

FFTComplex.prototype.process = function (output, outputOffset, outputStride, input, inputOffset, inputStride, t) {
    outputStride = Math.trunc(outputStride);
    inputStride = Math.trunc(inputStride);

    const type = t === "real" ? t : "complex";

    if (!Number.isFinite(outputStride) || outputStride < 1) {
        throw new RangeError(`outputStride must be a finite positive integer, got: ${outputStride}`);
    }

    if (!Number.isFinite(inputStride) || inputStride < 1) {
        throw new RangeError(`inputStride must be a finite positive integer, got: ${inputStride}`);
    }

    if (type === "real") {
        for (let i = 0; i < this.state.n; i++) {
            const x0_r = input[inputOffset + inputStride * i];
            this.state.scratch[2 * i] = x0_r;
            this.state.scratch[2 * i + 1] = 0;
        }

        work(
            { data: output, offset: outputOffset, stride: outputStride },
            { data: this.state.scratch, offset: 0, stride: 1 },
            1,
            this.state.factors.slice(),
            this.state,
        );
    } else if (input === output) {
        work(
            { data: this.state.scratch, offset: 0, stride: 1 },
            { data: input, offset: inputOffset, stride: 1 },
            inputStride,
            this.state.factors.slice(),
            this.state,
        );

        for (let i = 0; i < this.state.n; i++) {
            const x0_r = this.state.scratch[2 * i],
                x0_i = this.state.scratch[2 * i + 1];
            output[2 * (outputOffset + outputStride * i)] = x0_r;
            output[2 * (outputOffset + outputStride * i) + 1] = x0_i;
        }
    } else {
        work(
            { data: output, offset: outputOffset, stride: outputStride },
            { data: input, offset: inputOffset, stride: 1 },
            inputStride,
            this.state.factors.slice(),
            this.state,
        );
    }
};
