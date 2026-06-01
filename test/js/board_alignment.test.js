import { describe, expect, it } from "vitest";
import { detectBoardAlignment, matrixToEuler, snapTo45 } from "../../src/js/utils/boardAlignment.js";
import { eulerToMatrix } from "../../src/js/utils/magAlignment.js";

const DEG_TO_RAD = Math.PI / 180;

// --- Synthetic sample generation ---
//
// Convention used here (must match the algorithm):
//   - World/body frame is the "intended" body orientation (forward = drone's
//     camera direction = toward the user during calibration).
//   - At flat, accel in world frame = (0, 0, 1) (gravity-opposite, normalized).
//   - Pitch up 45° = drone rotates -45° around world-Y axis (Ry world).
//   - Roll right 45° (right wing down) = -45° around world-X axis (Rx world).
//   - Yaw CW 45° = -45° around world-Z (right-hand rule, thumb up gives CCW).
//   - R_mount = rotation FC frame → world frame.
//   - accel_fc = R_mount^T · (rotated gravity vector).

function rotX(theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [
        [1, 0, 0],
        [0, c, -s],
        [0, s, c],
    ];
}

function rotY(theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [
        [c, 0, s],
        [0, 1, 0],
        [-s, 0, c],
    ];
}

function transpose(m) {
    return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ];
}

function matVec(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/**
 * Build the three synthetic accel samples for a given physical mount and current
 * configured alignment. Reproduces what the FC would report via MSP_RAW_IMU after
 * board-alignment correction.
 */
function makeSamples(mountRoll, mountPitch, mountYaw, currentAlignment = { roll: 0, pitch: 0, yaw: 0 }, noise = 0) {
    const rMount = eulerToMatrix(mountRoll, mountPitch, mountYaw);
    const rCurrent = eulerToMatrix(currentAlignment.roll, currentAlignment.pitch, currentAlignment.yaw);

    // Raw FC accel = R_mount^T · accel_world
    // Post-alignment accel (what MSP_RAW_IMU returns) = R_current · raw_fc
    const post = (accelWorld) => matVec(rCurrent, matVec(transpose(rMount), accelWorld));

    const pitchUp = 45 * DEG_TO_RAD;
    const rollRight = 45 * DEG_TO_RAD;

    // Gravity-opposite vector in world frame after each user gesture:
    //   flat:        (0, 0, 1)
    //   pitch up:    Pitch up 45° = Ry(-45°). So R^T = Ry(+45°). Ry(+45°) · (0,0,1) = (sin45, 0, cos45)
    //   roll right:  Rx(-45°)^T · (0,0,1) = Rx(+45°) · (0,0,1) = (0, -sin45, cos45)
    const accelFlatWorld = [0, 0, 1];
    const accelPitchWorld = matVec(rotY(pitchUp), [0, 0, 1]);
    const accelRollWorld = matVec(rotX(rollRight), [0, 0, 1]);

    const jitter = () => (noise > 0 ? (Math.random() - 0.5) * 2 * noise : 0);
    const addNoise = (v) => [v[0] + jitter(), v[1] + jitter(), v[2] + jitter()];

    return {
        flatAccel: addNoise(post(accelFlatWorld)),
        pitchAccel: addNoise(post(accelPitchWorld)),
        rollAccel: addNoise(post(accelRollWorld)),
        // CW yaw integral about world-up = -45° in body frame, projected onto upAxis_FC.
        // Magnitude approximately preserved (post-alignment doesn't affect this projection's magnitude
        // since R_current rotates both gyro and upAxis together). Use a representative -45 here.
        yawIntegral: -45,
    };
}

describe("matrixToEuler / eulerToMatrix round-trip", () => {
    const cases = [
        [0, 0, 0],
        [0, 0, 90],
        [0, 0, -90],
        [0, 0, 180],
        [90, 0, 0],
        [-90, 0, 0],
        [180, 0, 0],
        [0, 45, 0],
        [0, -45, 0],
        [45, 0, 0],
        [0, 0, 45],
        [0, 0, -45],
    ];

    for (const [r, p, y] of cases) {
        it(`reconstructs (${r}, ${p}, ${y})`, () => {
            const m = eulerToMatrix(r, p, y);
            const e = matrixToEuler(m);
            // Compare via the matrix instead of raw angles (avoids gimbal-lock ambiguity).
            const m2 = eulerToMatrix(e.roll, e.pitch, e.yaw);
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    expect(m2[i][j]).toBeCloseTo(m[i][j], 6);
                }
            }
        });
    }
});

describe("snapTo45", () => {
    it("snaps to nearest 45 multiple", () => {
        expect(snapTo45(0)).toBe(0);
        expect(snapTo45(22)).toBe(0);
        expect(snapTo45(23)).toBe(45);
        expect(snapTo45(67)).toBe(45);
        expect(snapTo45(68)).toBe(90);
        expect(snapTo45(-1)).toBe(0);
        expect(snapTo45(-22)).toBe(0);
        expect(snapTo45(-23)).toBe(-45);
    });

    it("normalizes to (-180, 180]", () => {
        expect(snapTo45(180)).toBe(180);
        expect(snapTo45(270)).toBe(-90);
        expect(snapTo45(-270)).toBe(90);
        expect(snapTo45(360)).toBe(0);
    });
});

describe("detectBoardAlignment - cardinal mounts", () => {
    const cardinals = [
        { name: "identity", roll: 0, pitch: 0, yaw: 0 },
        { name: "CW 90°", roll: 0, pitch: 0, yaw: -90 },
        { name: "CW 180°", roll: 0, pitch: 0, yaw: 180 },
        { name: "CW 270°", roll: 0, pitch: 0, yaw: 90 },
        { name: "roll 180° (upside down)", roll: 180, pitch: 0, yaw: 0 },
        { name: "pitch 90° (nose up vertical)", roll: 0, pitch: 90, yaw: 0 },
    ];

    for (const mount of cardinals) {
        it(`detects ${mount.name} from clean samples`, () => {
            const samples = makeSamples(mount.roll, mount.pitch, mount.yaw);
            const result = detectBoardAlignment({ ...samples, currentAlignment: { roll: 0, pitch: 0, yaw: 0 } });
            expect(result.error).toBeUndefined();
            // Compare via matrix to handle Euler-angle equivalence (e.g., 180/-180).
            const expected = eulerToMatrix(mount.roll, mount.pitch, mount.yaw);
            const got = eulerToMatrix(result.roll, result.pitch, result.yaw);
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    expect(got[i][j]).toBeCloseTo(expected[i][j], 4);
                }
            }
        });
    }
});

describe("detectBoardAlignment - 45° cinewhoop mounts", () => {
    const cinewhoops = [
        { name: "CW 45°", roll: 0, pitch: 0, yaw: -45 },
        { name: "CW 135°", roll: 0, pitch: 0, yaw: -135 },
    ];

    for (const mount of cinewhoops) {
        it(`detects ${mount.name}`, () => {
            const samples = makeSamples(mount.roll, mount.pitch, mount.yaw);
            const result = detectBoardAlignment({ ...samples, currentAlignment: { roll: 0, pitch: 0, yaw: 0 } });
            expect(result.error).toBeUndefined();
            const expected = eulerToMatrix(mount.roll, mount.pitch, mount.yaw);
            const got = eulerToMatrix(result.roll, result.pitch, result.yaw);
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    expect(got[i][j]).toBeCloseTo(expected[i][j], 4);
                }
            }
        });
    }
});

describe("detectBoardAlignment - delta from current alignment", () => {
    it("returns the same alignment when no change is needed", () => {
        // FC physically mounted CW 90°, user already configured yaw = -90°. Post-alignment data
        // looks identity to the wizard, so the algorithm reports M = identity. After composing
        // with current alignment, the result equals the current alignment (no change).
        const current = { roll: 0, pitch: 0, yaw: -90 };
        const samples = makeSamples(0, 0, -90, current);
        const result = detectBoardAlignment({ ...samples, currentAlignment: current });
        const expected = eulerToMatrix(current.roll, current.pitch, current.yaw);
        const got = eulerToMatrix(result.roll, result.pitch, result.yaw);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                expect(got[i][j]).toBeCloseTo(expected[i][j], 4);
            }
        }
    });

    it("composes the residual rotation with current alignment", () => {
        // FC physically mounted CW 180°, user has configured CW 90° (incomplete correction).
        // Wizard should output CW 180° (= 180° yaw).
        const current = { roll: 0, pitch: 0, yaw: -90 };
        const samples = makeSamples(0, 0, 180, current);
        const result = detectBoardAlignment({ ...samples, currentAlignment: current });
        const expected = eulerToMatrix(0, 0, 180);
        const got = eulerToMatrix(result.roll, result.pitch, result.yaw);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                expect(got[i][j]).toBeCloseTo(expected[i][j], 4);
            }
        }
    });
});

describe("detectBoardAlignment - noise robustness", () => {
    it("still snaps to the correct alignment with moderate accelerometer noise", () => {
        // σ ≈ 0.03 g over a 45° tilt (≈ 0.7 g horizontal component) gives plenty of SNR.
        // We use a deterministic seed by stubbing Math.random.
        const origRandom = Math.random;
        let counter = 0;
        Math.random = () => {
            counter += 1;
            // Simple LCG-ish sequence for deterministic noise.
            return ((counter * 9301 + 49297) % 233280) / 233280;
        };
        try {
            const samples = makeSamples(0, 0, -90, { roll: 0, pitch: 0, yaw: 0 }, 0.03);
            const result = detectBoardAlignment({ ...samples, currentAlignment: { roll: 0, pitch: 0, yaw: 0 } });
            expect(result.error).toBeUndefined();
            expect(result.roll).toBe(0);
            expect(result.pitch).toBe(0);
            expect(result.yaw).toBe(-90);
        } finally {
            Math.random = origRandom;
        }
    });
});

describe("detectBoardAlignment - input validation", () => {
    it("errors when flat sample has no gravity reading", () => {
        const result = detectBoardAlignment({
            flatAccel: [0, 0, 0],
            pitchAccel: [-0.7, 0, 0.7],
            rollAccel: [0, -0.7, 0.7],
            yawIntegral: -45,
            currentAlignment: { roll: 0, pitch: 0, yaw: 0 },
        });
        expect(result.error).toBe("no_gravity");
    });

    it("errors when the pitch sample shows no horizontal tilt", () => {
        const result = detectBoardAlignment({
            flatAccel: [0, 0, 1],
            pitchAccel: [0, 0, 1],
            rollAccel: [0, -0.7, 0.7],
            yawIntegral: -45,
            currentAlignment: { roll: 0, pitch: 0, yaw: 0 },
        });
        expect(result.error).toBe("no_pitch_tilt");
    });

    it("errors when the roll sample shows no horizontal tilt", () => {
        const result = detectBoardAlignment({
            flatAccel: [0, 0, 1],
            pitchAccel: [-0.7, 0, 0.7],
            rollAccel: [0, 0, 1],
            yawIntegral: -45,
            currentAlignment: { roll: 0, pitch: 0, yaw: 0 },
        });
        expect(result.error).toBe("no_roll_tilt");
    });
});
