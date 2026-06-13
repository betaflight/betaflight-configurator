/**
 * cross-dataset science: package transfer, config-invariance,
 * cross-environment stability. two comparison forms (FP0.4 frame-safety rule):
 *
 *   Form A — replay-transfer (only between runs with IDENTICAL captured_under)
 *   Form B — package comparison (all other pairings; physical-frame quantities)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import { mat3mul, mat3transpose } from "../../src/js/utils/magAlignment.js";
import {
    selectAlignmentPackage,
    currentMatrixOf,
    proposedMatrixOf,
    computeReplayData,
    computeCalFromEllipsoid,
    meanPackageError,
} from "../../src/js/utils/magCharacterizationCompute.js";
import {
    loadFixture,
    captureDataFromPosesExport,
    directionsFromPosesExport,
    flattenSamples,
    rotationDelta,
} from "./test_helpers.js";

// --- shared recipe (same as FP2.1 canonical) ---
function solveDataset(ds) {
    const tumble = loadFixture(ds.fixtures.tumble);
    const poses = loadFixture(ds.fixtures.poses);
    const samples = flattenSamples(poses);
    const captureData = captureDataFromPosesExport(poses);
    const directions = directionsFromPosesExport(poses);
    const points = tumble.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
    const ellipsoid = fitEllipsoid(points);
    const currentMat = currentMatrixOf(ds.capture.alignment, ds.capture.custom_angles);

    const { result, usedCalibratedPackage } = selectAlignmentPackage({
        samples,
        captureData,
        directions,
        currentAlignment: ds.capture.alignment,
        customAngles: ds.capture.custom_angles || null,
        currentMat,
        ellipsoidParams: ellipsoid,
    });

    const proposedMat = proposedMatrixOf(result, currentMat);
    const newCombined = mat3mul(proposedMat, mat3transpose(currentMat));
    const magZero = poses.metadata.magZeroAtCapture ?? { x: 0, y: 0, z: 0 };
    const cal = computeCalFromEllipsoid(ellipsoid, newCombined, magZero);

    return {
        tumble,
        poses,
        samples,
        captureData,
        directions,
        ellipsoid,
        currentMat,
        proposedMat,
        newCombined,
        cal,
        magZero,
        result,
        usedCalibratedPackage,
        ds,
    };
}

// Form A: replay-transfer. Valid ONLY when A and B share the same captured_under
// frame (FP0.4 frame-safety rule) — here, the two baselines, both CW270FLIP.
// Derive B's capture alignment from its export rather than hard-coding it.
function evaluatePackageOnPoses(resultA, ellipsoidA, posesB) {
    const alignB = posesB.metadata.currentAlignment ?? 8;
    const customB = posesB.metadata.customAngles ?? null;
    const rows = computeReplayData(
        resultA,
        alignB,
        captureDataFromPosesExport(posesB),
        directionsFromPosesExport(posesB),
        {
            ellipsoidParams: ellipsoidA,
            currentMat: currentMatrixOf(alignB, customB),
            proposedIncludesCenter: true,
        },
    );
    return meanPackageError(rows);
}

let indoorBase, indoorAppl, outdoorBase, outdoorAppl, indoorDef;

beforeAll(() => {
    indoorBase = solveDataset(loadFixture("datasets/indoor-baseline.expected.json"));
    indoorAppl = solveDataset(loadFixture("datasets/indoor-applied.expected.json"));
    outdoorBase = solveDataset(loadFixture("datasets/outdoor-baseline.expected.json"));
    outdoorAppl = solveDataset(loadFixture("datasets/outdoor-applied.expected.json"));
    indoorDef = solveDataset(loadFixture("datasets/indoor-default.expected.json"));
}, 300_000);

describe("per-environment applied verification", () => {
    it("indoor: residual bias is a small fraction of the baseline (firmware removed hard iron)", () => {
        // measured 29 / 703 = 4%
        const baseR = Math.hypot(
            indoorBase.ellipsoid.center.x,
            indoorBase.ellipsoid.center.y,
            indoorBase.ellipsoid.center.z,
        );
        const applR = Math.hypot(
            indoorAppl.ellipsoid.center.x,
            indoorAppl.ellipsoid.center.y,
            indoorAppl.ellipsoid.center.z,
        );
        expect(applR).toBeLessThan(baseR * 0.2);
    });

    it("outdoor: residual bias is a small fraction of the baseline", () => {
        // measured 11 / 733 = 1.5%
        const baseR = Math.hypot(
            outdoorBase.ellipsoid.center.x,
            outdoorBase.ellipsoid.center.y,
            outdoorBase.ellipsoid.center.z,
        );
        const applR = Math.hypot(
            outdoorAppl.ellipsoid.center.x,
            outdoorAppl.ellipsoid.center.y,
            outdoorAppl.ellipsoid.center.z,
        );
        expect(applR).toBeLessThan(baseR * 0.2);
    });

    it("indoor: applied proposal matches baseline proposal (Form B — rotation delta)", () => {
        expect(rotationDelta(indoorBase.proposedMat, indoorAppl.proposedMat)).toBeLessThanOrEqual(5);
    });

    it("indoor: composed calibration does not drift from baseline (Form B — per-axis)", () => {
        expect(Math.abs(indoorBase.cal.x - indoorAppl.cal.x)).toBeLessThanOrEqual(60);
        expect(Math.abs(indoorBase.cal.y - indoorAppl.cal.y)).toBeLessThanOrEqual(60);
        expect(Math.abs(indoorBase.cal.z - indoorAppl.cal.z)).toBeLessThanOrEqual(60);
    });

    it("outdoor: applied proposal matches baseline proposal (Form B — rotation delta)", () => {
        expect(rotationDelta(outdoorBase.proposedMat, outdoorAppl.proposedMat)).toBeLessThanOrEqual(5);
    });

    it("outdoor: composed calibration does not drift from baseline (Form B — per-axis)", () => {
        expect(Math.abs(outdoorBase.cal.x - outdoorAppl.cal.x)).toBeLessThanOrEqual(60);
        expect(Math.abs(outdoorBase.cal.y - outdoorAppl.cal.y)).toBeLessThanOrEqual(60);
        expect(Math.abs(outdoorBase.cal.z - outdoorAppl.cal.z)).toBeLessThanOrEqual(60);
    });
});

describe("cross-environment stability", () => {
    it("indoor baseline package transfers to outdoor baseline poses (Form A — replay)", () => {
        // measured: 3.26 deg
        const err = evaluatePackageOnPoses(indoorBase.result, indoorBase.ellipsoid, outdoorBase.poses);
        expect(err).toBeLessThanOrEqual(8);
    });

    it("outdoor baseline package transfers to indoor baseline poses (Form A — replay)", () => {
        // measured: 3.49 deg
        const err = evaluatePackageOnPoses(outdoorBase.result, outdoorBase.ellipsoid, indoorBase.poses);
        expect(err).toBeLessThanOrEqual(8);
    });

    it("baseline centers are stable across environments (Form B)", () => {
        const ic = indoorBase.ellipsoid.center;
        const oc = outdoorBase.ellipsoid.center;
        expect(Math.abs(ic.x - oc.x)).toBeLessThanOrEqual(80);
        expect(Math.abs(ic.y - oc.y)).toBeLessThanOrEqual(80);
        expect(Math.abs(ic.z - oc.z)).toBeLessThanOrEqual(80);
    });

    it("baseline rotations are stable across environments (Form B)", () => {
        expect(rotationDelta(indoorBase.proposedMat, outdoorBase.proposedMat)).toBeLessThanOrEqual(5);
    });
});

describe("hardware config-invariance (DEFAULT alignment)", () => {
    it("solved package matches the indoor-baseline package (Form B — per-axis cal)", () => {
        // measured delta <= 8 counts: (664,117,194) vs (663,124,195)
        expect(Math.abs(indoorDef.cal.x - indoorBase.cal.x)).toBeLessThanOrEqual(40);
        expect(Math.abs(indoorDef.cal.y - indoorBase.cal.y)).toBeLessThanOrEqual(40);
        expect(Math.abs(indoorDef.cal.z - indoorBase.cal.z)).toBeLessThanOrEqual(40);
    });

    it("solved rotation matches the indoor-baseline rotation (Form B — rotation delta)", () => {
        // measured delta ~= 2 deg
        expect(rotationDelta(indoorDef.proposedMat, indoorBase.proposedMat)).toBeLessThanOrEqual(6);
    });
});
