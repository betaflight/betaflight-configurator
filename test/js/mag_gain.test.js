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
import { mat3mulVec, ALIGNMENT_MATRICES } from "../../src/js/utils/magAlignment.js";
import fs from "node:fs";
import path from "node:path";

// Seeded PRNG for deterministic tests
let _seed = 1337;
function rng() {
    _seed = (1664525 * _seed + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

const DEG_TO_RAD = Math.PI / 180;

function loadFixture(name) {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures", name), "utf-8"));
}

function buildBWorld(declination, inclination, fieldStrength) {
    const inc = inclination * DEG_TO_RAD;
    const dec = declination * DEG_TO_RAD;
    const Bh = fieldStrength * Math.cos(inc);
    return [Bh * Math.cos(dec), Bh * Math.sin(dec), fieldStrength * Math.sin(inc)];
}

function rotateNedToBody(B_ned, rollDeg, pitchDeg, headingDeg) {
    const r = -rollDeg * DEG_TO_RAD;
    const p = -pitchDeg * DEG_TO_RAD;
    const h = -headingDeg * DEG_TO_RAD;
    const cr = Math.cos(r);
    const sr = Math.sin(r);
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    const cy = Math.cos(h);
    const sy = Math.sin(h);
    const R = [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
    return mat3mulVec(R, B_ned);
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
        const currentAlign = data.metadata.currentAlignment || 1;
        const currentMat = ALIGNMENT_MATRICES[currentAlign] || ALIGNMENT_MATRICES[1];

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
});
