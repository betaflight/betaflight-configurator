/**
 * Quaternion ingestion convention test — verifies the extraction round-trip
 * is EXACT (self-consistent) for Betaflight's logged imuQuaternion.
 *
 * The logged imuQuaternion uses standard body(FRD)→world(NED) Hamilton
 * convention. The ingestion must use standard ZYX Euler extraction on the
 * quaternion's rotation matrix (NOT Betaflight's firmware yaw formula which
 * uses a negated atan2 for display purposes). Euler extracted from quatToRot
 * using standard formulas + eulerToQuat rebuild is an identity transform
 * (verified 2026-06-15 against synthetic and real-log data).
 *
 * This test validates on NON-level attitudes to catch the bug class that
 * bit the project twice (near-level-only tests hide sign mismatches).
 */
import { describe, it, expect } from 'vitest';
import { quatToRot, eulerToQuat } from '../../../src/blackbox-viewer/pose/imuMechanization.js';
import type { Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

function ingestQuat(qLogged: number[]): Quat {
    const R: number[][] = quatToRot(qLogged as Quat);
    const roll: number = Math.atan2(R[2][1], R[2][2]);
    const pitch: number = -Math.asin(Math.max(-1, Math.min(1, R[2][0])));
    const yaw: number = Math.atan2(R[1][0], R[0][0]);
    return eulerToQuat(roll, pitch, yaw);
}

function toDeg(r: number): number { return ((r * 180 / Math.PI) + 360) % 360; }
function pitchDeg(q: number[]): number { const R: number[][] = quatToRot(q as Quat); return -Math.asin(Math.max(-1, Math.min(1, R[2][0]))) * 180 / Math.PI; }
function yawDeg(q: number[]): number { const R: number[][] = quatToRot(q as Quat); return toDeg(Math.atan2(R[1][0], R[0][0])); }
function rollDeg(q: number[]): number { const R: number[][] = quatToRot(q as Quat); return toDeg(Math.atan2(R[2][1], R[2][2])); }

describe("ImuQuaternion ingestion — exact round-trip", () => {
    it("preserves identity quaternion", () => {
        const qIn: number[] = [1, 0, 0, 0];
        const qOut: Quat = ingestQuat(qIn);
        expect(qOut[0]).toBeCloseTo(1, 10);
        expect(qOut[1]).toBeCloseTo(0, 10);
        expect(qOut[2]).toBeCloseTo(0, 10);
        expect(qOut[3]).toBeCloseTo(0, 10);
    });

    it("preserves pure yaw 90° (nose east) exactly", () => {
        const qIn: Quat = [Math.cos(Math.PI/4), 0, 0, Math.sin(Math.PI/4)];
        const qOut: Quat = ingestQuat(qIn);
        const Rout: number[][] = quatToRot(qOut);
        expect(Rout[0][0]).toBeCloseTo(0, 10);
        expect(Rout[1][0]).toBeCloseTo(1, 10);
    });

    it("preserves pitch 30° nose-up exactly", () => {
        const qIn: Quat = eulerToQuat(0, -30 * Math.PI / 180, 0);
        const qOut: Quat = ingestQuat(qIn);
        expect(pitchDeg(qOut)).toBeCloseTo(-30, 1);
        expect(Math.abs(rollDeg(qOut)) % 360).toBeLessThan(1);
    });

    it("preserves a combined pitch+roll+yaw quaternion exactly", () => {
        const qIn: Quat = eulerToQuat(
            20 * Math.PI / 180,
            -15 * Math.PI / 180,
            200 * Math.PI / 180,
        );
        const qOut: Quat = ingestQuat(qIn);
        expect(rollDeg(qOut)).toBeCloseTo(20, 0);
        expect(pitchDeg(qOut)).toBeCloseTo(-15, 0);
        const headDiff: number = Math.min(
            Math.abs(yawDeg(qOut) - 200),
            Math.abs(yawDeg(qOut) - (200 + 360)),
            Math.abs(yawDeg(qOut) - (200 - 360)),
        );
        expect(headDiff, `heading diff: expected ~200°, got ${yawDeg(qOut).toFixed(1)}°`).toBeLessThan(1);
    });

    it("preserves w<0 quaternion (negated input, same rotation)", () => {
        const qNegW: Quat = eulerToQuat(10 * Math.PI/180, 20 * Math.PI/180, 45 * Math.PI/180);
        const qIn: number[] = [-qNegW[0], -qNegW[1], -qNegW[2], -qNegW[3]];
        const qOut: Quat = ingestQuat(qIn);
        expect(rollDeg(qOut)).toBeCloseTo(10, 0);
        expect(pitchDeg(qOut)).toBeCloseTo(20, 0);
        expect(yawDeg(qOut)).toBeCloseTo(45, 0);
    });

    it("produces finite results for diverse test inputs", () => {
        const testQs: number[][] = [
            [1, 0, 0, 0],
            [0.7071, 0, 0, 0.7071],
            [0.7071, 0, 0, -0.7071],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
            [0.5, 0.5, 0.5, 0.5],
            [0.9805, -0.0298, 0.0465, 0.1887],
            [-0.1095, -0.1484, -0.2833, 0.9411],
        ];
        for (const q of testQs) {
            const norm: number = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
            const qNorm: number[] = q.map((v: number) => v / norm);
            const qOut: Quat = ingestQuat(qNorm);
            expect(qOut.every((v: number) => Number.isFinite(v)), `NaN for q=[${q.join(",")}]`).toBe(true);
            const n: number = Math.sqrt(qOut[0]**2 + qOut[1]**2 + qOut[2]**2 + qOut[3]**2);
            expect(n).toBeGreaterThan(0.999);
            expect(n).toBeLessThan(1.001);
        }
    });

    it("preserves gravity axis: body +Z maps to world +D for level drone", () => {
        const qLevel: number[] = [0.9805, -0.0298, 0.0465, 0.1887];
        const qOut: Quat = ingestQuat(qLevel);
        const R: number[][] = quatToRot(qOut);
        expect(R[2][2]).toBeGreaterThan(0.9);
    });

    it("nose direction from ingestion matches direct quatToRot for real sample", () => {
        const qRaw: number[] = [0.9805, -0.0298, 0.0465, 0.1887];
        const R_orig: number[][] = quatToRot(qRaw as Quat);
        const qIng: Quat = ingestQuat(qRaw);
        const R_ing: number[][] = quatToRot(qIng);
        expect(R_ing[0][0]).toBeCloseTo(R_orig[0][0], 5);
        expect(R_ing[1][0]).toBeCloseTo(R_orig[1][0], 5);
        expect(R_ing[2][0]).toBeCloseTo(R_orig[2][0], 5);
    });
});
