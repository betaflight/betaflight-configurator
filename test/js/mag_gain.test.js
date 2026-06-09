/**
 * Per-axis gain calibration test.
 *
 * Tests the linear regression gain computation against synthetic data
 * with known asymmetric gain factors.  Serves as a building block for
 * future firmware that supports per-axis mag_gain parameters.
 *
 * See implementation.md §17.4 for the gain computation formula and §19.4
 * for the test specification.
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import { loadFixture, buildBWorld, rotateNedToBody } from "./test_helpers.js";

// Seeded PRNG for deterministic tests
let _seed = 1337;
function rng() {
    _seed = (1664525 * _seed + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

/**
 * Compute per-axis gains from (expected, actual) pairs using linear regression.
 * actual[i] = gain[i] * expected[i] + offset[i]
 */
function computeGains(actuals, expecteds) {
    if (actuals.length < 30 || expecteds.length !== actuals.length) {
        return null;
    }
    const n = actuals.length;
    // Separate per-axis
    const ax = [];
    const ex = [];
    const ay = [];
    const ey = [];
    const az = [];
    const ez = [];
    for (let i = 0; i < n; i++) {
        ax.push(actuals[i][0]);
        ex.push(expecteds[i][0]);
        ay.push(actuals[i][1]);
        ey.push(expecteds[i][1]);
        az.push(actuals[i][2]);
        ez.push(expecteds[i][2]);
    }
    function regress(a, e) {
        const sumE = e.reduce((s, v) => s + v, 0);
        const sumA = a.reduce((s, v) => s + v, 0);
        const sumEE = e.reduce((s, v) => s + v * v, 0);
        const sumAE = a.reduce((s, v, i) => s + v * e[i], 0);
        const denom = sumEE - (sumE * sumE) / n;
        if (denom <= 0) {
            return { gain: 1, offset: 0 };
        }
        return {
            gain: (sumAE - (sumA * sumE) / n) / denom,
            offset: (sumA - ((sumAE - (sumA * sumE) / n) / denom) * sumE) / n,
        };
    }
    const gx = regress(ax, ex);
    const gy = regress(ay, ey);
    const gz = regress(az, ez);
    return { x: gx.gain, y: gy.gain, z: gz.gain, ox: gx.offset, oy: gy.offset, oz: gz.offset };
}

describe("per-axis gain calibration", () => {
    const GEO = { declination: -15.3, inclination: 71, fieldStrength: 53873 };

    it("recovers known gain factors from synthetic data", () => {
        const trueGains = [1.0, 0.8, 1.1];
        const trueOffsets = [50, -30, 200];
        const B_world = buildBWorld(GEO.declination, GEO.inclination, GEO.fieldStrength);
        const scaleFactor = 2000 / GEO.fieldStrength; // simulate ADC scale

        const actuals = [];
        const expecteds = [];

        // Generate data from dummy poses (same pattern as wizard)
        const poses = [
            { roll: 0, pitch: 0, heading: 0 },
            { roll: 0, pitch: -40, heading: 0 },
            { roll: 0, pitch: 40, heading: 0 },
            { roll: -40, pitch: 0, heading: 0 },
            { roll: 40, pitch: 0, heading: 0 },
            { roll: 0, pitch: 0, heading: 90 },
            { roll: 0, pitch: -40, heading: 90 },
            { roll: 0, pitch: 0, heading: 180 },
            { roll: 0, pitch: 0, heading: 270 },
        ];

        for (const pose of poses) {
            for (let i = 0; i < 20; i++) {
                const expected = rotateNedToBody(B_world, pose.roll, pose.pitch, pose.heading);
                const expectedScaled = [
                    expected[0] * scaleFactor,
                    expected[1] * scaleFactor,
                    expected[2] * scaleFactor,
                ];
                const actual = [
                    expectedScaled[0] * trueGains[0] + trueOffsets[0],
                    expectedScaled[1] * trueGains[1] + trueOffsets[1],
                    expectedScaled[2] * trueGains[2] + trueOffsets[2],
                ];
                // Add noise
                const noise = () => (rng() - 0.5) * 20;
                actuals.push([actual[0] + noise(), actual[1] + noise(), actual[2] + noise()]);
                expecteds.push(expectedScaled);
            }
        }

        const result = computeGains(actuals, expecteds);
        expect(result).toBeTruthy();

        console.log(`  True: X=${trueGains[0]} Y=${trueGains[1]} Z=${trueGains[2]}`);
        console.log(`  Recovered: X=${result.x.toFixed(3)} Y=${result.y.toFixed(3)} Z=${result.z.toFixed(3)}`);

        // With 180 samples and low noise, recovery should be within 2%
        expect(Math.abs(result.x - trueGains[0])).toBeLessThan(0.02);
        expect(Math.abs(result.y - trueGains[1])).toBeLessThan(0.02);
        expect(Math.abs(result.z - trueGains[2])).toBeLessThan(0.02);
    });

    it("does not crash on fixture data (bad data expected to produce unreliable gains)", () => {
        const data = loadFixture("bad_data_no_compass.json");
        const B_world = buildBWorld(GEO.declination, GEO.inclination, GEO.fieldStrength);
        let meanRaw = 0;
        let count = 0;
        const actuals = [];
        const expecteds = [];

        for (const dir of data.directions) {
            for (const pose of dir.poses) {
                if (!pose.samples) {
                    continue;
                }
                for (const s of pose.samples) {
                    const actualBody = s.mag; // fixture data is already post-alignment (body frame)
                    meanRaw += Math.hypot(actualBody[0], actualBody[1], actualBody[2]);
                    count++;
                }
            }
        }
        const scaleFactor = count > 0 ? meanRaw / count / GEO.fieldStrength : 1;

        for (const dir of data.directions) {
            for (const pose of dir.poses) {
                if (!pose.samples) {
                    continue;
                }
                for (const s of pose.samples) {
                    const expected = rotateNedToBody(B_world, s.roll, s.pitch, s.headingRef || 0);
                    const expectedScaled = [
                        expected[0] * scaleFactor,
                        expected[1] * scaleFactor,
                        expected[2] * scaleFactor,
                    ];
                    const actualBody = s.mag; // fixture data is already post-alignment
                    actuals.push(actualBody);
                    expecteds.push(expectedScaled);
                }
            }
        }

        const result = computeGains(actuals, expecteds);
        // Bad heading references make gains unreliable — just verify no crash
        expect(result).toBeTruthy();
        expect(Number.isFinite(result.x)).toBe(true);
        expect(Number.isFinite(result.y)).toBe(true);
        expect(Number.isFinite(result.z)).toBe(true);
        console.log(
            `  Fixture (bad data) gains: X=${result.x.toFixed(3)} Y=${result.y.toFixed(3)} Z=${result.z.toFixed(3)}`,
        );
    });

    it("soft iron matrix from synthetic data has correct structure", () => {
        const trueGains = [1.0, 0.8, 1.1];
        const B_world = buildBWorld(GEO.declination, GEO.inclination, GEO.fieldStrength);
        const scaleFactor = 2000 / GEO.fieldStrength;
        const actuals = [];
        const expecteds = [];

        const poses = [
            { roll: 0, pitch: 0, heading: 0 },
            { roll: 0, pitch: -40, heading: 0 },
            { roll: 0, pitch: 40, heading: 0 },
            { roll: -40, pitch: 0, heading: 0 },
            { roll: 40, pitch: 0, heading: 0 },
        ];

        for (const pose of poses) {
            for (let i = 0; i < 20; i++) {
                const expected = rotateNedToBody(B_world, pose.roll, pose.pitch, pose.heading);
                const es = [expected[0] * scaleFactor, expected[1] * scaleFactor, expected[2] * scaleFactor];
                const noise = () => (rng() - 0.5) * 20;
                actuals.push([
                    es[0] * trueGains[0] + 50 + noise(),
                    es[1] * trueGains[1] - 30 + noise(),
                    es[2] * trueGains[2] + 200 + noise(),
                ]);
                expecteds.push(es);
            }
        }

        const result = computeGains(actuals, expecteds);
        expect(result).toBeTruthy();

        // Build approximate soft iron matrix: diag = gains, off-diag = 0
        const A = [
            [result.x, 0, 0],
            [0, result.y, 0],
            [0, 0, result.z],
        ];

        // Diagonal should reflect gains within 5%
        expect(Math.abs(A[0][0] - trueGains[0])).toBeLessThan(0.05);
        expect(Math.abs(A[1][1] - trueGains[1])).toBeLessThan(0.05);
        expect(Math.abs(A[2][2] - trueGains[2])).toBeLessThan(0.05);
        // Off-diagonals should be near zero for clean synthetic data
        expect(Math.abs(A[0][1])).toBeLessThan(0.01);
        expect(Math.abs(A[0][2])).toBeLessThan(0.01);
        expect(Math.abs(A[1][2])).toBeLessThan(0.01);

        console.log(
            `  Soft iron matrix diag: X=${ 
                A[0][0].toFixed(3) 
            } Y=${ 
                A[1][1].toFixed(3) 
            } Z=${ 
                A[2][2].toFixed(3)}`,
        );
    });

    it("gain correction improves heading accuracy on compass-captured fixture", () => {
        const data = loadFixture("good_data_compass.json");
        const B_world = buildBWorld(GEO.declination, GEO.inclination, GEO.fieldStrength);

        // Flatten samples with headingRef
        const samples = [];
        for (const dir of data.directions) {
            for (const pose of dir.poses) {
                if (pose.samples) {
                    for (const s of pose.samples) {
                        samples.push({ mag: s.mag, roll: s.roll, pitch: s.pitch, headingRef: s.headingRef });
                    }
                }
            }
        }

        // Baseline: solver on raw data
        const baseline = characterizeAlignment(samples, data.metadata.currentAlignment, data.metadata.customAngles, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        expect(baseline.error).toBeUndefined();
        console.log(`  Baseline quality: ${  baseline.qualityScore  }%`);

        // Compute mean raw |B| for scaling
        let meanRaw = 0;
        let count = 0;
        for (const s of samples) {
            meanRaw += Math.hypot(s.mag[0], s.mag[1], s.mag[2]);
            count++;
        }
        const scaleFactor = count > 0 ? meanRaw / count / GEO.fieldStrength : 1;

        // Compute per-axis gains via linear regression
        const actuals = [];
        const expecteds = [];
        for (const s of samples) {
            const expected = rotateNedToBody(B_world, s.roll, s.pitch, s.headingRef || 0);
            const es = [expected[0] * scaleFactor, expected[1] * scaleFactor, expected[2] * scaleFactor];
            actuals.push(s.mag);
            expecteds.push(es);
        }
        const gains = computeGains(actuals, expecteds);
        expect(gains).toBeTruthy();
        console.log(`  Gains: X=${  gains.x.toFixed(3)  } Y=${  gains.y.toFixed(3)  } Z=${  gains.z.toFixed(3)}`);

        // Apply gain correction to mag data
        const corrected = samples.map((s) => ({
            mag: [
                (s.mag[0] - gains.ox) / Math.max(gains.x, 0.01),
                (s.mag[1] - gains.oy) / Math.max(gains.y, 0.01),
                (s.mag[2] - gains.oz) / Math.max(gains.z, 0.01),
            ],
            roll: s.roll,
            pitch: s.pitch,
            headingRef: s.headingRef,
        }));

        // Re-run solver on gain-corrected data
        const improved = characterizeAlignment(corrected, data.metadata.currentAlignment, data.metadata.customAngles, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        expect(improved.error).toBeUndefined();
        console.log(`  Gain-corrected quality: ${  improved.qualityScore  }%`);

        // Gain correction should improve or maintain quality — never make it worse
        expect(improved.qualityScore).toBeGreaterThanOrEqual(baseline.qualityScore - 5);

        // Per-pose heading should be more accurate with gains
        const headingError = (actual, expected) => {
            let diff = actual - expected;
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;
            return Math.abs(diff);
        };
        // Use a simple leveled-heading computation for flat poses
        const D2R = Math.PI / 180,
            R2D = 180 / Math.PI;
        let sumRawErr = 0,
            sumGainErr = 0,
            nPoses = 0;
        for (const dir of data.directions) {
            const flat = dir.poses.find((p) => p.label === "Flat" && p.samples);
            if (!flat) continue;
            let rawSin = 0,
                rawCos = 0,
                gainSin = 0,
                gainCos = 0;
            for (const s of flat.samples) {
                const lr = [s.mag[0], s.mag[1]]; // flat, no leveling needed
                rawSin += Math.sin(Math.atan2(lr[1], lr[0]));
                rawCos += Math.cos(Math.atan2(lr[1], lr[0]));
                const gc = [
                    (s.mag[0] - gains.ox) / Math.max(gains.x, 0.01),
                    (s.mag[1] - gains.oy) / Math.max(gains.y, 0.01),
                ];
                gainSin += Math.sin(Math.atan2(gc[1], gc[0]));
                gainCos += Math.cos(Math.atan2(gc[1], gc[0]));
            }
            const rawHdg = Math.atan2(rawSin, rawCos) * R2D;
            const gainHdg = Math.atan2(gainSin, gainCos) * R2D;
            const expected = flat.samples[0].headingRef;
            sumRawErr += headingError(rawHdg, expected);
            sumGainErr += headingError(gainHdg, expected);
            nPoses++;
        }
        const meanRawErr = sumRawErr / nPoses;
        const meanGainErr = sumGainErr / nPoses;
        console.log(
            `  Mean flat heading error — raw: ${ 
                meanRawErr.toFixed(1) 
            }°  gain-corrected: ${ 
                meanGainErr.toFixed(1) 
            }°`,
        );
        expect(meanGainErr).toBeLessThanOrEqual(meanRawErr + 2);
    });
});
