/**
 * Integration test: run the solver on real captured data fixtures.
 *
 * FIXTURES:
 *   bad_data_no_compass.json — captured without physical compass.
 *     North reference ~15° off, field consistency poor (±20% |B|).
 *     Expected: solver returns CUSTOM alignment with low confidence.
 *     This fixture proves the solver doesn't crash on degraded data.
 *
 * ADDING NEW FIXTURES:
 *   Run the wizard on real hardware, click "Save Samples as JSON",
 *   copy the .json file to test/fixtures/ with a descriptive name.
 *   Then add a test case below that asserts expected alignment and
 *   minimum quality score for that hardware configuration.
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import fs from "node:fs";
import path from "node:path";

function loadFixture(name) {
    const filePath = path.resolve(__dirname, "../fixtures", name);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function flattenSamples(data) {
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

describe("fixture: bad_data_no_compass", () => {
    it("does not crash and returns low-confidence CUSTOM result", () => {
        const data = loadFixture("bad_data_no_compass.json");
        const samples = flattenSamples(data);

        expect(samples.length).toBe(520);

        const result = characterizeAlignment(samples, data.metadata.currentAlignment, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });

        expect(result.error).toBeUndefined();
        // With no compass, heading references are wrong — expect low quality
        expect(result.qualityScore).toBeGreaterThan(0);
        expect(result.qualityScore).toBeLessThan(50);
        // Yaw should be near -90° (the effective yaw of CW270FLIP)
        expect(result.alignment).toBe(9); // CUSTOM — no preset is a good match
        expect(result.fieldConsistency.suspect).toBe(true);
    });
});
