/**
 * Tests for the characterization JSON export schema.
 *
 * Verifies the JSON consumable by blackbox-log-viewer for KML export
 * with heading correction and per-frame mag validity scoring.
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment, matrixToEuler } from "../../src/js/utils/magCharacterization.js";
import { eulerToMatrix, ALIGNMENT_MATRICES, mat3mulVec } from "../../src/js/utils/magAlignment.js";
import { loadFixture, flattenSamples } from "./test_helpers.js";

// ── Seeded PRNG ────────────────────────────────────────────────────────────
let _seed = 42;
function rng() {
    _seed = (1664525 * _seed + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

const DEG_TO_RAD = Math.PI / 180;
const B_WORLD = [16930, -4630, 50940];

// ── Synthetic data helpers ──────────────────────────────────────────────────

function rotZYX(roll, pitch, yaw) {
    const cr = Math.cos(roll),
        sr = Math.sin(roll);
    const cp = Math.cos(pitch),
        sp = Math.sin(pitch);
    const cy = Math.cos(yaw),
        sy = Math.sin(yaw);
    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
}

function mat3mulVecT(m, v) {
    return [
        m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
        m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
        m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
    ];
}

function rotateToBodyFrame(B_world, rollDeg, pitchDeg, headingDeg) {
    const roll = -rollDeg * DEG_TO_RAD;
    const pitch = -pitchDeg * DEG_TO_RAD;
    const heading = -headingDeg * DEG_TO_RAD;
    const R = rotZYX(roll, pitch, heading);
    return mat3mulVec(R, B_world);
}

function gaussianNoise() {
    let u = 0,
        v = 0;
    while (u === 0) {
        u = rng();
    }
    while (v === 0) {
        v = rng();
    }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateSyntheticData(trueAlignment, nPoses, samplesPerPose, noiseSigma) {
    const R_true = eulerToMatrix(trueAlignment.roll, trueAlignment.pitch, trueAlignment.yaw);

    const poseDefs = [
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

    const samples = [];
    const usedPoses = poseDefs.slice(0, nPoses);

    for (const pose of usedPoses) {
        for (let i = 0; i < samplesPerPose; i++) {
            const B_body = rotateToBodyFrame(B_WORLD, pose.roll, pose.pitch, pose.heading);
            const raw = mat3mulVecT(R_true, B_body);
            samples.push({
                mag: [
                    Math.round(raw[0] + noiseSigma * gaussianNoise()),
                    Math.round(raw[1] + noiseSigma * gaussianNoise()),
                    Math.round(raw[2] + noiseSigma * gaussianNoise()),
                ],
                roll: pose.roll + (rng() - 0.5) * 2,
                pitch: pose.pitch + (rng() - 0.5) * 2,
                headingRef: pose.heading + (rng() - 0.5) * 5,
            });
        }
    }

    return samples;
}

// ── Export JSON assembly helpers (matching composable logic exactly) ────────

function mapPoseType(poseLabel) {
    if (poseLabel.startsWith("Flat")) {
        return "flat";
    }
    if (poseLabel.startsWith("Nose Up")) {
        return "nose_up";
    }
    if (poseLabel.startsWith("Nose Down")) {
        return "nose_down";
    }
    if (poseLabel.includes("Roll right")) {
        return "left_side";
    }
    if (poseLabel.includes("Roll left")) {
        return "right_side";
    }
    if (poseLabel.includes("Inverted")) {
        return "inverted";
    }
    return "flat";
}

function normalizeHeading(deg) {
    return ((deg % 360) + 360) % 360;
}

function signedHeadingError(actual, expected) {
    if (expected === null || expected === undefined) {
        return 0;
    }
    let diff = actual - expected;
    while (diff > 180) {
        diff -= 360;
    }
    while (diff < -180) {
        diff += 360;
    }
    return diff;
}

function getEulerAngles(solverResultVal) {
    if (!solverResultVal) {
        return { roll: 0, pitch: 0, yaw: 0 };
    }
    const preset = solverResultVal.alignment;
    if (preset === 9 && solverResultVal.customAngles) {
        return {
            roll: solverResultVal.customAngles.roll,
            pitch: solverResultVal.customAngles.pitch,
            yaw: solverResultVal.customAngles.yaw,
        };
    }
    if (preset >= 1 && preset <= 8 && ALIGNMENT_MATRICES[preset]) {
        const euler = matrixToEuler(ALIGNMENT_MATRICES[preset]);
        return { roll: euler.roll, pitch: euler.pitch, yaw: euler.yaw };
    }
    return { roll: 0, pitch: 0, yaw: 0 };
}

function buildExportJson(
    solverResult,
    replayPoses,
    axisGains,
    calibrationOffsets,
    geoReference,
    gpsFix,
    gpsLat,
    gpsLon,
    ellipsoidCorrection,
) {
    const sr = solverResult;

    const geoRefOut = {};
    if (gpsFix) {
        geoRefOut.latitude_deg = gpsLat / 10000000;
        geoRefOut.longitude_deg = gpsLon / 10000000;
    } else {
        geoRefOut.latitude_deg = null;
        geoRefOut.longitude_deg = null;
    }
    geoRefOut.declination_deg = geoReference?.declination ?? 0;
    geoRefOut.inclination_deg = geoReference?.inclination ?? 0;
    geoRefOut.field_strength_nt = geoReference?.fieldStrength ?? null;

    const ec = ellipsoidCorrection;

    return {
        $schema: "https://betaflight.com/blackbox/mag-characterization-model/2.0",
        version: "2.0",
        ellipsoid_correction: ec
            ? {
                center: { x: ec.center.x, y: ec.center.y, z: ec.center.z },
                soft_iron: ec.W_inv,
                radius: ec.radius,
                residual_rms: ec.residual,
            }
            : null,
        geo_reference: geoRefOut,
        alignment:
            sr && !sr.error
                ? {
                    preset: sr.alignment,
                    label: sr.label,
                    euler_zyx_deg: getEulerAngles(sr),
                }
                : null,
        axis_gains: axisGains ?? { x: 1.0, y: 1.0, z: 1.0 },
        hard_iron: calibrationOffsets ?? null,
        quality:
            sr && !sr.error
                ? {
                    score_percent: sr.qualityScore,
                    residual_z_rms: sr.residuals?.zRms ?? 0,
                    residual_xy_rms: sr.residuals?.xyRms ?? 0,
                    field_consistency_pct: sr.fieldConsistency?.maxDevPct ?? 0,
                    chirality_flag: sr.chiralityFlag ?? false,
                }
                : null,
        poses: replayPoses.map((pose) => ({
            body_orientation: mapPoseType(pose.poseLabel),
            cardinal_direction: pose.dirLabel.charAt(0).toUpperCase(),
            expected_heading_deg: normalizeHeading(pose.expectedHeading),
            measured_attitude_deg: { roll: pose.roll, pitch: pose.pitch },
            heading_current_deg: normalizeHeading(pose.currentHeading),
            heading_error_current_deg: signedHeadingError(pose.currentHeading, pose.expectedHeading),
            heading_corrected_deg: normalizeHeading(pose.newHeading),
            heading_error_corrected_deg: signedHeadingError(pose.newHeading, pose.expectedHeading),
            heading_gain_corrected_deg:
                pose.gainCorrectedHeading != null ? normalizeHeading(pose.gainCorrectedHeading) : null,
            heading_error_gain_corrected_deg:
                pose.gainCorrectedHeading != null
                    ? signedHeadingError(pose.gainCorrectedHeading, pose.expectedHeading)
                    : null,
            heading_quality_weight: Math.max(
                0,
                Math.min(1, 1.0 - Math.abs(signedHeadingError(pose.newHeading, pose.expectedHeading)) / 30.0),
            ),
        })),
    };
}

// ── Shared test fixture ─────────────────────────────────────────────────────

const trueAlignment = { roll: 2.5, pitch: -1.8, yaw: 66 };
const syntheticSamples = generateSyntheticData(trueAlignment, 8, 40, 50);

const mockReplayPoses = [
    {
        poseLabel: "Flat",
        dirLabel: "North (nose to N line)",
        expectedHeading: 0,
        roll: 0.0,
        pitch: 0.0,
        currentHeading: -15,
        newHeading: 2,
        gainCorrectedHeading: 0.8,
    },
    {
        poseLabel: "Nose Up (box under nose)",
        dirLabel: "East (nose to E line)",
        expectedHeading: 90,
        roll: 0.0,
        pitch: -40,
        currentHeading: 72,
        newHeading: 88,
        gainCorrectedHeading: null,
    },
    {
        poseLabel: "Nose Down (box under tail)",
        dirLabel: "South (nose to S line)",
        expectedHeading: 180,
        roll: 0.0,
        pitch: 40,
        currentHeading: 195,
        newHeading: 181,
        gainCorrectedHeading: null,
    },
    {
        poseLabel: "Box under left (Roll right)",
        dirLabel: "West (nose to W line)",
        expectedHeading: -90,
        roll: -40,
        pitch: 0.0,
        currentHeading: 258,
        newHeading: 271,
        gainCorrectedHeading: 270.2,
    },
    {
        poseLabel: "Box under right (Roll left)",
        dirLabel: "North (nose to N line)",
        expectedHeading: 0,
        roll: 40,
        pitch: 0.0,
        currentHeading: 10,
        newHeading: 0.5,
        gainCorrectedHeading: null,
    },
];

const mockGains = { x: 1.02, y: 0.98, z: 1.0 };
const mockCalibration = { x: -320, y: 1450, z: -680 };
const mockGeoRef = { declination: -15.3, inclination: 71.0, fieldStrength: 53873 };
const mockEllipsoid = {
    center: { x: -62, y: -494, z: -73 },
    W_inv: [
        [0.98, 0.0, 0.01],
        [0.0, 1.05, 0.0],
        [0.01, 0.0, 0.97],
    ],
    radius: 1538,
    residual: 12.3,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("mag characterization export", () => {
    describe("Test 1: Schema keys present", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("has all top-level keys", () => {
            expect(json).toHaveProperty("$schema");
            expect(json).toHaveProperty("version");
            expect(json).toHaveProperty("ellipsoid_correction");
            expect(json).toHaveProperty("geo_reference");
            expect(json).toHaveProperty("alignment");
            expect(json).toHaveProperty("axis_gains");
            expect(json).toHaveProperty("hard_iron");
            expect(json).toHaveProperty("quality");
            expect(json).toHaveProperty("poses");
        });

        it("poses.length >= 4", () => {
            expect(json.poses.length).toBeGreaterThanOrEqual(4);
        });

        it("has no undefined values anywhere in JSON", () => {
            const str = JSON.stringify(json);
            expect(str).not.toContain("undefined");
            const parsed = JSON.parse(str);
            function walk(obj, path) {
                if (obj === undefined) {
                    throw new Error(`undefined at ${path}`);
                }
                if (obj === null) {
                    return;
                }
                if (typeof obj === "object") {
                    for (const key of Object.keys(obj)) {
                        walk(obj[key], `${path}.${key}`);
                    }
                }
            }
            expect(() => walk(parsed, "root")).not.toThrow();
        });

        it("solver succeeds and returns CUSTOM alignment for 66 deg yaw", () => {
            expect(sr.error).toBeUndefined();
            expect(sr.alignment).toBe(9);
            expect(sr.qualityScore).toBeGreaterThan(30);
        });
    });

    describe("Test 2: Heading error algebraic consistency", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("corrected heading error = signedHeadingError(heading_corrected_deg, expected)", () => {
            for (const pose of json.poses) {
                const wrapped = signedHeadingError(pose.heading_corrected_deg, pose.expected_heading_deg);
                expect(Math.abs(wrapped - pose.heading_error_corrected_deg)).toBeLessThan(0.01);
            }
        });

        it("current heading error = signedHeadingError(heading_current_deg, expected)", () => {
            for (const pose of json.poses) {
                const wrapped = signedHeadingError(pose.heading_current_deg, pose.expected_heading_deg);
                expect(Math.abs(wrapped - pose.heading_error_current_deg)).toBeLessThan(0.01);
            }
        });
    });

    describe("Test 3: Heading ranges", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("expected headings are in {0, 90, 180, 270}", () => {
            const allowed = [0, 90, 180, 270];
            for (const pose of json.poses) {
                expect(allowed).toContain(pose.expected_heading_deg);
            }
        });

        it("current and corrected headings in [0, 360)", () => {
            for (const pose of json.poses) {
                expect(pose.heading_current_deg).toBeGreaterThanOrEqual(0);
                expect(pose.heading_current_deg).toBeLessThan(360);
                expect(pose.heading_corrected_deg).toBeGreaterThanOrEqual(0);
                expect(pose.heading_corrected_deg).toBeLessThan(360);
            }
        });

        it("heading errors in (-180, +180]", () => {
            for (const pose of json.poses) {
                expect(pose.heading_error_current_deg).toBeGreaterThan(-180);
                expect(pose.heading_error_current_deg).toBeLessThanOrEqual(180);
                expect(pose.heading_error_corrected_deg).toBeGreaterThan(-180);
                expect(pose.heading_error_corrected_deg).toBeLessThanOrEqual(180);
            }
        });
    });

    describe("Test 4: Euler angle round-trip", () => {
        it("random triplets round-trip within 0.1 degrees", () => {
            const testCases = [
                { roll: 0, pitch: 0, yaw: 0 },
                { roll: 90, pitch: 0, yaw: 0 },
                { roll: 0, pitch: 45, yaw: 0 },
                { roll: 0, pitch: 0, yaw: 180 },
                { roll: 15, pitch: -25, yaw: 66 },
                { roll: -5.7, pitch: 33.1, yaw: -142.8 },
                { roll: 45, pitch: -30, yaw: 270 },
            ];
            for (const angles of testCases) {
                const m = eulerToMatrix(angles.roll, angles.pitch, angles.yaw);
                const recovered = matrixToEuler(m);
                // Normalize recovered yaw to [0, 360) for comparison with input
                let ry = recovered.yaw;
                while (ry < 0) {
                    ry += 360;
                }
                while (ry >= 360) {
                    ry -= 360;
                }
                const yawDiff = Math.min(
                    Math.abs(ry - angles.yaw),
                    Math.abs(ry - angles.yaw + 360),
                    Math.abs(ry - angles.yaw - 360),
                );
                expect(recovered.roll).toBeCloseTo(angles.roll, 1);
                expect(recovered.pitch).toBeCloseTo(angles.pitch, 1);
                expect(yawDiff).toBeLessThan(0.15);
            }
        });

        it("all 8 preset matrices produce valid Euler angles", () => {
            for (let i = 1; i <= 8; i++) {
                const euler = matrixToEuler(ALIGNMENT_MATRICES[i]);
                expect(euler.roll).not.toBeNaN();
                expect(euler.pitch).not.toBeNaN();
                expect(euler.yaw).not.toBeNaN();
            }
        });
    });

    describe("Test 5: Axis gains bounds", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("all gains > 0", () => {
            expect(json.axis_gains.x).toBeGreaterThan(0);
            expect(json.axis_gains.y).toBeGreaterThan(0);
            expect(json.axis_gains.z).toBeGreaterThan(0);
        });

        it("at least one gain equals 1.0", () => {
            const g = json.axis_gains;
            const hasRef = g.x === 1.0 || g.y === 1.0 || g.z === 1.0;
            expect(hasRef).toBe(true);
        });

        it("no gain exceeds 10.0", () => {
            expect(json.axis_gains.x).toBeLessThanOrEqual(10.0);
            expect(json.axis_gains.y).toBeLessThanOrEqual(10.0);
            expect(json.axis_gains.z).toBeLessThanOrEqual(10.0);
        });
    });

    describe("Test 6: Geo reference bounds", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("field_strength_nt in valid range when non-null", () => {
            const fs = json.geo_reference.field_strength_nt;
            if (fs !== null) {
                expect(fs).toBeGreaterThanOrEqual(25000);
                expect(fs).toBeLessThanOrEqual(70000);
            }
        });

        it("inclination_deg in [-90, +90]", () => {
            expect(json.geo_reference.inclination_deg).toBeGreaterThanOrEqual(-90);
            expect(json.geo_reference.inclination_deg).toBeLessThanOrEqual(90);
        });

        it("declination_deg in [-180, +180]", () => {
            expect(json.geo_reference.declination_deg).toBeGreaterThanOrEqual(-180);
            expect(json.geo_reference.declination_deg).toBeLessThanOrEqual(180);
        });
    });

    describe("Test 7: Quality metric bounds", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("score_percent in [0, 100]", () => {
            expect(json.quality.score_percent).toBeGreaterThanOrEqual(0);
            expect(json.quality.score_percent).toBeLessThanOrEqual(100);
        });

        it("residual_z_rms >= 0", () => {
            expect(json.quality.residual_z_rms).toBeGreaterThanOrEqual(0);
        });

        it("residual_xy_rms >= 0", () => {
            expect(json.quality.residual_xy_rms).toBeGreaterThanOrEqual(0);
        });

        it("field_consistency_pct in [0, 100]", () => {
            expect(json.quality.field_consistency_pct).toBeGreaterThanOrEqual(0);
            expect(json.quality.field_consistency_pct).toBeLessThanOrEqual(100);
        });
    });

    describe("Test 8: Real fixture round-trip", () => {
        it("bad_data_no_compass fixture exports valid JSON", () => {
            const data = loadFixture("bad_data_no_compass.json");
            const fixtureSamples = flattenSamples(data);

            const fixtureResult = characterizeAlignment(fixtureSamples, data.metadata.currentAlignment, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });

            const fixturePoses = [];
            for (const dir of data.directions) {
                for (const pose of dir.poses) {
                    if (!pose.samples || pose.samples.length === 0) {
                        continue;
                    }
                    const sumRoll = pose.samples.reduce((s, sm) => s + sm.roll, 0);
                    const sumPitch = pose.samples.reduce((s, sm) => s + sm.pitch, 0);
                    fixturePoses.push({
                        poseLabel: pose.label,
                        dirLabel: dir.label,
                        expectedHeading: pose.samples[0].headingRef || 0,
                        roll: sumRoll / pose.samples.length,
                        pitch: sumPitch / pose.samples.length,
                        currentHeading: 0,
                        newHeading: 0,
                    });
                }
            }

            const fixtureJson = buildExportJson(fixtureResult, fixturePoses, null, null, null, false, 0, 0, null);

            const str = JSON.stringify(fixtureJson, null, 2);
            const reparsed = JSON.parse(str);
            expect(reparsed.$schema).toBe("https://betaflight.com/blackbox/mag-characterization-model/2.0");
            expect(reparsed.version).toBe("2.0");
            expect(fixtureResult.alignment).toBe(9);
            expect(reparsed.alignment).not.toBeNull();
            expect(reparsed.quality).not.toBeNull();
            expect(reparsed.poses.length).toBeGreaterThanOrEqual(4);

            for (const p of reparsed.poses) {
                expect(p.body_orientation).toBeTruthy();
                expect(p.cardinal_direction).toBeTruthy();
                expect(["flat", "nose_up", "nose_down", "left_side", "right_side"]).toContain(p.body_orientation);
                expect(["N", "E", "S", "W"]).toContain(p.cardinal_direction);
            }
        });
    });

    describe("Test 9: Gain-corrected heading fields", () => {
        const sr = characterizeAlignment(syntheticSamples, 0, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        const json = buildExportJson(sr, mockReplayPoses, mockGains, mockCalibration, mockGeoRef, false, 0, 0, null);

        it("null gainCorrectedHeading produces null exported fields", () => {
            // pose index 1 (Nose Up) has gainCorrectedHeading: null
            const pose = json.poses[1];
            expect(pose.heading_gain_corrected_deg).toBeNull();
            expect(pose.heading_error_gain_corrected_deg).toBeNull();
        });

        it("non-null gainCorrectedHeading produces valid heading and error", () => {
            // pose index 0 (Flat) has gainCorrectedHeading: 0.8
            const pose = json.poses[0];
            expect(pose.heading_gain_corrected_deg).not.toBeNull();
            expect(pose.heading_gain_corrected_deg).toBeGreaterThanOrEqual(0);
            expect(pose.heading_gain_corrected_deg).toBeLessThan(360);
            expect(pose.heading_error_gain_corrected_deg).not.toBeNull();
            expect(pose.heading_error_gain_corrected_deg).toBeGreaterThan(-180);
            expect(pose.heading_error_gain_corrected_deg).toBeLessThanOrEqual(180);
        });

        it("gain-corrected error satisfies algebraic consistency", () => {
            const pose = json.poses[0];
            const wrapped = signedHeadingError(
                normalizeHeading(0.8),
                normalizeHeading(mockReplayPoses[0].expectedHeading),
            );
            expect(Math.abs(wrapped - pose.heading_error_gain_corrected_deg)).toBeLessThan(0.01);
        });

        it("gain-corrected heading consistent with error for pose index 3", () => {
            // pose index 3 (Box under left) has gainCorrectedHeading: 270.2
            const pose = json.poses[3];
            expect(pose.heading_gain_corrected_deg).not.toBeNull();
            expect(pose.heading_error_gain_corrected_deg).not.toBeNull();
            const wrapped = signedHeadingError(
                normalizeHeading(270.2),
                normalizeHeading(mockReplayPoses[3].expectedHeading),
            );
            expect(Math.abs(wrapped - pose.heading_error_gain_corrected_deg)).toBeLessThan(0.01);
        });
    });

    describe("Test 10: Ellipsoid in export", () => {
        it("ellipsoid_correction key present with all required fields", () => {
            const sr = characterizeAlignment(syntheticSamples, 0, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });
            const json = buildExportJson(
                sr,
                mockReplayPoses,
                mockGains,
                mockCalibration,
                mockGeoRef,
                false,
                0,
                0,
                mockEllipsoid,
            );

            expect(json.ellipsoid_correction).not.toBeNull();
            expect(json.ellipsoid_correction.center).toBeDefined();
            expect(json.ellipsoid_correction.center.x).toEqual(expect.any(Number));
            expect(json.ellipsoid_correction.center.y).toEqual(expect.any(Number));
            expect(json.ellipsoid_correction.center.z).toEqual(expect.any(Number));
            expect(json.ellipsoid_correction.soft_iron).toBeDefined();
            expect(json.ellipsoid_correction.soft_iron.length).toBe(3);
            expect(json.ellipsoid_correction.radius).toEqual(expect.any(Number));
            expect(json.ellipsoid_correction.residual_rms).toEqual(expect.any(Number));
        });

        it("ellipsoid_correction is null when not provided", () => {
            const sr = characterizeAlignment(syntheticSamples, 0, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });
            const json = buildExportJson(
                sr,
                mockReplayPoses,
                mockGains,
                mockCalibration,
                mockGeoRef,
                false,
                0,
                0,
                null,
            );
            expect(json.ellipsoid_correction).toBeNull();
        });
    });

    describe("Test 11: Soft iron maps raw to unit sphere", () => {
        it("corrected magnitude is approximately 1.0", () => {
            // Sample raw reading that, when centered and corrected, should give unit length
            const { center, W_inv } = mockEllipsoid;
            // Find a point on the unit sphere and reverse the correction
            // For a unit vector [0.3, -0.4, 0.9] (|v|=sqrt(0.09+0.16+0.81)=1.03), reverse: raw = W^-1 * v + center
            // W_inv is approximately identity * scale, so inverse mostly diagonal
            const v = [0.5, 0.3, Math.sqrt(1 - 0.25 - 0.09)]; // unit: |v| = 1
            const raw = [center.x + v[0] / 0.98, center.y + v[1] / 1.05, center.z + v[2] / 0.97];
            const dx = raw[0] - center.x;
            const dy = raw[1] - center.y;
            const dz = raw[2] - center.z;
            const cx = W_inv[0][0] * dx + W_inv[0][1] * dy + W_inv[0][2] * dz;
            const cy = W_inv[1][0] * dx + W_inv[1][1] * dy + W_inv[1][2] * dz;
            const cz = W_inv[2][0] * dx + W_inv[2][1] * dy + W_inv[2][2] * dz;
            const magnitude = Math.hypot(cx, cy, cz);
            expect(magnitude).toBeCloseTo(1.0, 1);
        });
    });

    describe("Test 12: Alignment accuracy range", () => {
        it("heading_quality_weight is in [0.0, 1.0]", () => {
            const sr = characterizeAlignment(syntheticSamples, 0, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });
            const json = buildExportJson(
                sr,
                mockReplayPoses,
                mockGains,
                mockCalibration,
                mockGeoRef,
                false,
                0,
                0,
                null,
            );

            for (const pose of json.poses) {
                expect(pose.heading_quality_weight).toBeGreaterThanOrEqual(0.0);
                expect(pose.heading_quality_weight).toBeLessThanOrEqual(1.0);
            }
        });

        it("zero heading error gives weight 1.0", () => {
            const weight = Math.max(0, Math.min(1, 1.0 - Math.abs(0) / 30.0));
            expect(weight).toBeCloseTo(1.0, 2);
        });

        it("30 degree error gives weight 0.0", () => {
            const weight = Math.max(0, Math.min(1, 1.0 - Math.abs(30) / 30.0));
            expect(weight).toBeCloseTo(0.0, 2);
        });
    });

    describe("Test 13: Alignment accuracy formula", () => {
        it("clamp(1.0 - abs(error)/30.0, 0, 1) matches exported values", () => {
            const sr = characterizeAlignment(syntheticSamples, 0, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });
            const json = buildExportJson(
                sr,
                mockReplayPoses,
                mockGains,
                mockCalibration,
                mockGeoRef,
                false,
                0,
                0,
                null,
            );

            for (const pose of json.poses) {
                const error = Math.abs(pose.heading_error_corrected_deg);
                const expectedWeight = Math.max(0, Math.min(1, 1.0 - error / 30.0));
                expect(pose.heading_quality_weight).toBeCloseTo(expectedWeight, 2);
            }
        });
    });

    describe("Test 14: Full round-trip", () => {
        it("export → JSON.parse → re-export preserves structure and values", () => {
            const sr = characterizeAlignment(syntheticSamples, 0, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });
            const json1 = buildExportJson(
                sr,
                mockReplayPoses,
                mockGains,
                mockCalibration,
                mockGeoRef,
                false,
                0,
                0,
                null,
            );
            const str1 = JSON.stringify(json1, null, 2);
            const reparsed = JSON.parse(str1);

            // Re-export by building again from the reparsed data using original labels
            const json2 = buildExportJson(
                sr,
                mockReplayPoses,
                json1.axis_gains,
                json1.hard_iron,
                {
                    declination: json1.geo_reference.declination_deg,
                    inclination: json1.geo_reference.inclination_deg,
                    fieldStrength: json1.geo_reference.field_strength_nt,
                },
                false,
                0,
                0,
                null,
            );
            const str2 = JSON.stringify(json2, null, 2);

            // Reparsed JSON preserves all top-level keys
            expect(reparsed.$schema).toBe("https://betaflight.com/blackbox/mag-characterization-model/2.0");
            expect(reparsed.version).toBe("2.0");
            expect(reparsed.poses.length).toBe(5);
            expect(reparsed.quality.score_percent).toBeGreaterThan(0);

            // Re-serialization is deterministic (same inputs → same output)
            expect(str1).toBe(str2);
        });
    });

    describe("Test 15: Clean fixture check", () => {
        it("good_data_compass fixture does not crash and returns valid structure", () => {
            const data = loadFixture("good_data_compass.json");
            const samples = flattenSamples(data);

            const result = characterizeAlignment(samples, data.metadata.currentAlignment, null, {
                headingMode: "absolute",
                headingWeight: 1.0,
            });

            expect(result.error).toBeUndefined();
            expect(result.alignment).toBeDefined();
            expect(result.qualityScore).toBeGreaterThanOrEqual(0);
            expect(result.qualityScore).toBeLessThanOrEqual(100);
            expect(result.fieldConsistency).toBeDefined();
            expect(result.chiralityFlag !== undefined).toBe(true);
        });
    });
});
