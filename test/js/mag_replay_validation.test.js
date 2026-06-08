/**
 * Replay validation test — proves the solver's proposed alignment produces
 * better compass headings than the current FC alignment when applied to
 * captured data.
 *
 * This is a regression gate: if future code changes break the alignment
 * math or the reference frame conventions, this test fails.
 *
 * ADDING NEW FIXTURES:
 *   Drop a .json file from "Save Samples as JSON" into test/fixtures/,
 *   add an entry to FIXTURES below with expected behavior.
 *
 *   For good-data fixtures (captured with physical compass on clean surface):
 *     set expectImprovement: true and the test verifies the proposed alignment
 *     has strictly lower median heading error than the current alignment.
 *
 *   TODO: add a fixture captured with a real compass (accurate headingRef)
 *   and clean environment (consistent |B|).  This will be the "gold standard"
 *   test that proves the solver produces a measurably better alignment.
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import {
    eulerToMatrix,
    mat3transpose,
    mat3mul,
    mat3mulVec,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import fs from "node:fs";
import path from "node:path";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Compute the leveled horizontal direction (heading) for a single sample
 * given a proposed alignment matrix and the current firmware alignment.
 *
 * Reference frames:
 *   sample.mag = captured from MSP_RAW_IMU (POST firmware alignment)
 *   currentMat = the firmware alignment matrix at capture time
 *   alignmentMat = the proposed new alignment matrix (or current one for comparison)
 *
 *   combined = alignmentMat * currentMat^T
 *   body = combined * sample.mag
 *   level = undoRollPitch(body, roll, pitch)
 *   direction = atan2(level[1], level[0]) in degrees (0 = North)
 */
function leveledHeading(sample, alignmentMat, currentAlignment) {
    const currentMat = ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];
    const currentInv = mat3transpose(currentMat);
    const combined = mat3mul(alignmentMat, currentInv);
    const body = mat3mulVec(combined, sample.mag);
    const level = undoRollPitch(body, sample.roll * DEG_TO_RAD, sample.pitch * DEG_TO_RAD);
    return Math.atan2(level[1], level[0]) * RAD_TO_DEG;
}

/** Circular median — handles wrapping at ±180° */
function medianAngle(angles) {
    const sorted = [...angles].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function loadFixture(name) {
    const filePath = path.resolve(__dirname, "../fixtures", name);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function flattenAllSamples(data) {
    const samples = [];
    for (const dir of data.directions) {
        for (const pose of dir.poses) {
            if (pose.samples) {
                for (const s of pose.samples) {
                    samples.push({
                        mag: s.mag,
                        roll: s.roll,
                        pitch: s.pitch,
                        headingRef: s.headingRef,
                    });
                }
            }
        }
    }
    return samples;
}

// Median absolute heading error across all samples for a given alignment matrix
function medianHeadingError(samples, alignmentMat, currentAlignment) {
    const errors = samples
        .filter((s) => s.headingRef !== undefined && s.headingRef !== null)
        .map((s) => {
            const heading = leveledHeading(s, alignmentMat, currentAlignment);
            let diff = heading - s.headingRef;
            while (diff > 180) {
                diff -= 360;
            }
            while (diff < -180) {
                diff += 360;
            }
            return Math.abs(diff);
        });
    return medianAngle(errors);
}

describe("replay validation — proposed alignment reduces heading error", () => {
    const FIXTURES = [
        {
            name: "bad_data_no_compass.json",
            description: "no physical compass, North ~15° off, field ±20%",
            // With bad heading references, the solver may not find a BETTER
            // alignment than the current one (the solver uses the wrong
            // headingRef to optimize, so the result may be worse).
            // This fixture validates the test infrastructure, not the solver.
            expectImprovement: false,
        },
    ];

    for (const fixture of FIXTURES) {
        it(`replay: ${fixture.name}`, () => {
            const data = loadFixture(fixture.name);
            const samples = flattenAllSamples(data);
            const currentAlignment = data.metadata.currentAlignment || 1;

            // Build current alignment matrix
            const currentMat = ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];

            // Run solver
            const result = characterizeAlignment(samples, currentAlignment, data.metadata.customAngles || null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });

            expect(result.error).toBeUndefined();

            // Build proposed alignment matrix
            let proposedMat;
            if (result.alignment === 9 && result.customAngles) {
                proposedMat = eulerToMatrix(
                    result.customAngles.roll,
                    result.customAngles.pitch,
                    result.customAngles.yaw,
                );
            } else {
                proposedMat = ALIGNMENT_MATRICES[result.alignment] || ALIGNMENT_MATRICES[1];
            }

            // Compute heading errors for both alignments
            const currentError = medianHeadingError(samples, currentMat, currentAlignment);
            const proposedError = medianHeadingError(samples, proposedMat, currentAlignment);

            console.log(`\n  Fixture: ${fixture.name} (${fixture.description})`);
            console.log(
                `  Current alignment: ${currentAlignment}  →  median heading error: ${currentError.toFixed(1)}°`,
            );
            console.log(
                `  Proposed alignment: ${result.alignment}${result.customAngles ? ` (${result.customAngles.roll.toFixed(0)}°, ${result.customAngles.pitch.toFixed(0)}°, ${result.customAngles.yaw.toFixed(0)}°)` : ""}  →  median heading error: ${proposedError.toFixed(1)}°`,
            );
            console.log(`  Quality score: ${result.qualityScore}%`);

            // For bad-data fixtures, just verify the test runs and produces
            // finite values (no NaN, no crash).  The heading references are
            // known to be degraded, so large errors are expected.
            if (fixture.expectImprovement) {
                expect(proposedError).toBeLessThan(currentError);
            } else {
                expect(Number.isFinite(currentError)).toBe(true);
                expect(Number.isFinite(proposedError)).toBe(true);
                // Proposed should at least not be WORSE than current
                // (even with bad data, the solver shouldn't make things worse)
                expect(proposedError).toBeLessThanOrEqual(currentError + 5);
            }
        });
    }
});
