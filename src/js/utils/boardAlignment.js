/**
 * Board alignment detection.
 *
 * Determines how the flight controller is physically mounted relative to the
 * drone body by sampling gravity at three poses (flat, pitched up, rolled right)
 * and integrating gyro during a yaw rotation as a sanity check.
 *
 * The algorithm:
 *   1. At flat, the normalized accelerometer vector is world-up expressed in
 *      the FC frame (call it `upAxis`).
 *   2. When the user pitches up 45° (drone facing away), the horizontal accel
 *      component shifts toward the nose, so `forwardAxis = +normalize(h_pitch)`.
 *   3. For roll right (right wing down, = −Y side in Betaflight's Y=LEFT frame),
 *      the horizontal accel component shifts toward +Y (left/rising side).
 *      Betaflight uses a right-handed X=fwd, Y=left, Z=up body frame, so the
 *      body-Y direction from the roll gesture matches cross(upAxis, forwardAxis).
 *   4. The yaw-CW gesture is used only for confidence (the integrated gyro
 *      should have a large component along upAxis).
 *   5. Gram-Schmidt orthogonalize (upAxis fixed, forward projected perpendicular,
 *      body-Y derived as up × forward). Build a rotation matrix `M` with these
 *      world basis vectors as rows. `M · v_fc = v_world`.
 *   6. If a non-zero current alignment exists, MSP_RAW_IMU is already rotated
 *      by it. Our M is the residual; compose with `eulerToMatrix(currentAlignment)`
 *      to get the absolute new alignment.
 *   7. Decode `M_total` into roll/pitch/yaw using Betaflight's ZYX convention
 *      (inverse of `eulerToMatrix`). Snap all axes to multiples of 45°. Convert
 *      yaw from internal CCW-positive to Betaflight's CW-positive [0, 360).
 */

import { eulerToMatrix } from "./magAlignment.js";

const DEG = 180 / Math.PI;

// --- Vector / matrix helpers ---

function normalize(v) {
    const m = Math.hypot(v[0], v[1], v[2]);
    if (m < 1e-9) {
        return [0, 0, 0];
    }
    return [v[0] / m, v[1] / m, v[2] / m];
}

function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function matMul(a, b) {
    const r = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    return r;
}

// --- Public utilities ---

/**
 * Decode a rotation matrix into roll/pitch/yaw (degrees) using Betaflight's
 * ZYX (yaw, pitch, roll) Tait-Bryan convention — inverse of `eulerToMatrix`.
 */
export function matrixToEuler(m) {
    const sp = Math.max(-1, Math.min(1, -m[2][0]));
    const pitch = Math.asin(sp) * DEG;

    let roll;
    let yaw;
    if (Math.abs(m[2][0]) < 0.99999) {
        roll = Math.atan2(m[2][1], m[2][2]) * DEG;
        yaw = Math.atan2(m[1][0], m[0][0]) * DEG;
    } else {
        // Gimbal lock at pitch = ±90°: yaw and roll are coupled. Convention:
        // attribute the rotation to roll, leave yaw at 0.
        roll = Math.atan2(-m[0][1], m[1][1]) * DEG;
        yaw = 0;
    }

    return { roll, pitch, yaw };
}

/**
 * Round an angle (degrees) to the nearest multiple of `step`, normalized to (-180, 180].
 */
export function snapTo45(deg, step = 45) {
    let snapped = Math.round(deg / step) * step;
    while (snapped > 180) {
        snapped -= 360;
    }
    while (snapped <= -180) {
        snapped += 360;
    }
    // Avoid -0
    return snapped === 0 ? 0 : snapped;
}

/**
 * Average a list of 3-vectors. Returns a 3-vector or null if `samples` is empty.
 */
export function meanVec3(samples) {
    if (samples.length === 0) {
        return null;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    for (const s of samples) {
        x += s[0];
        y += s[1];
        z += s[2];
    }
    const n = samples.length;
    return [x / n, y / n, z / n];
}

/**
 * Maximum magnitude of any vector in the buffer. Useful for "is steady" checks.
 */
export function maxMagnitude(samples) {
    let max = 0;
    for (const s of samples) {
        const m = Math.hypot(s[0], s[1], s[2]);
        if (m > max) {
            max = m;
        }
    }
    return max;
}

/**
 * Angle (degrees) between a mean accel vector and a reference axis. Used to
 * detect "is the drone tilted enough to lock the pose?" and "has it returned
 * to level?".
 */
export function tiltAngleDeg(accel, upAxis) {
    const a = normalize(accel);
    const cosTheta = Math.max(-1, Math.min(1, dot(a, upAxis)));
    return Math.acos(cosTheta) * DEG;
}

/**
 * The component of `vec` perpendicular to `axis`. The axis must be a unit vector.
 */
export function perpComponent(vec, axis) {
    return subtract(vec, scale(axis, dot(vec, axis)));
}

/**
 * Compute the final board alignment to apply.
 *
 * Inputs:
 *   - flatAccel:  averaged accel 3-vector at the flat pose (g-units).
 *   - pitchAccel: averaged accel at the "pitched up ~45°" pose.
 *   - rollAccel:  averaged accel at the "rolled right ~45°" pose.
 *   - yawIntegral: gyro rotation integrated about `upAxis` during the yaw CW
 *     gesture, in degrees. Sign should be negative for a true CW (right-hand
 *     rule with thumb up gives CCW, so CW is negative). Used for confidence.
 *   - currentAlignment: { roll, pitch, yaw } in degrees, already configured on
 *     the FC. MSP_RAW_IMU returns data post-alignment, so we compose with this
 *     to get the absolute new alignment.
 *
 * Returns: { roll, pitch, yaw, confidence } — angles snapped to multiples of 45°.
 *   `confidence` is one of "high" / "medium" / "low" based on residual orthogonality
 *   error and the yaw integral magnitude.
 */
export function detectBoardAlignment({ flatAccel, pitchAccel, rollAccel, yawIntegral, currentAlignment }) {
    if (!flatAccel || !pitchAccel || !rollAccel) {
        return { error: "missing_samples" };
    }

    const upAxis = normalize(flatAccel);
    if (Math.hypot(upAxis[0], upAxis[1], upAxis[2]) < 0.5) {
        return { error: "no_gravity" };
    }

    // Derive world-forward in FC frame from the pitch-up gesture.
    // Convention: drone nose faces AWAY from the user. When pitched up, the gravity
    // horizontal component shifts toward the tail (toward user), so negating it gives
    // the nose direction — but since nose = away from user = the direction the accel
    // horizontal component moves TOWARD when nose tilts up, we take it directly.
    const hPitch = perpComponent(pitchAccel, upAxis);
    if (Math.hypot(hPitch[0], hPitch[1], hPitch[2]) < 0.05) {
        return { error: "no_pitch_tilt" };
    }
    const forwardRaw = normalize(hPitch);

    // Derive the body-Y axis from the roll-right gesture.
    // Betaflight uses a Y=LEFT body frame (X=forward, Y=left, Z=up — right-handed).
    // When rolling right (right wing = −Y side going down), the world-up horizontal
    // component in the body frame shifts toward +Y (the left/rising side), which is
    // the same direction that cross(upAxis, forwardAxis) produces. Take it directly.
    const hRoll = perpComponent(rollAccel, upAxis);
    if (Math.hypot(hRoll[0], hRoll[1], hRoll[2]) < 0.05) {
        return { error: "no_roll_tilt" };
    }
    const rightRaw = normalize(hRoll);

    // Gram-Schmidt: keep upAxis, orthogonalize forward, derive right = up × forward.
    let forwardAxis = normalize(perpComponent(forwardRaw, upAxis));
    let rightAxis = cross(upAxis, forwardAxis);

    // Cross-check: both rightAxis (cross product) and rightRaw (measured from roll gesture)
    // should point in the same body-Y direction (+Y = left in Betaflight's frame).
    // If they disagree, the user's roll gesture was the wrong direction.
    if (dot(rightAxis, rightRaw) < 0) {
        rightAxis = scale(rightAxis, -1);
        forwardAxis = scale(forwardAxis, -1);
    }

    // World basis vectors as rows form the matrix M such that M · v_fc = v_world.
    const m = [
        [forwardAxis[0], forwardAxis[1], forwardAxis[2]],
        [rightAxis[0], rightAxis[1], rightAxis[2]],
        [upAxis[0], upAxis[1], upAxis[2]],
    ];

    let mTotal = m;
    if (currentAlignment) {
        // Betaflight stores yaw as CW-positive (e.g. 90 = board rotated 90° clockwise).
        // eulerToMatrix uses standard math (CCW-positive), so negate yaw on input.
        const cur = eulerToMatrix(
            currentAlignment.roll || 0,
            currentAlignment.pitch || 0,
            -(currentAlignment.yaw || 0),
        );
        mTotal = matMul(m, cur);
    }

    const euler = matrixToEuler(mTotal);
    // Snap all axes to nearest 45° (standard board mount increments).
    const snappedRoll = snapTo45(euler.roll);
    const snappedPitch = snapTo45(euler.pitch);
    // Internal yaw is CCW-positive; convert to Betaflight's CW-positive [0, 360).
    const snappedInternalYaw = snapTo45(euler.yaw);
    const displayYaw = ((-snappedInternalYaw % 360) + 360) % 360;

    const snapped = {
        roll: snappedRoll,
        pitch: snappedPitch,
        yaw: displayYaw,
    };

    // Confidence: high if the measured right matches the derived right closely AND the
    // yaw integral magnitude is plausible. Otherwise medium / low.
    const rightAgreement = dot(rightAxis, rightRaw); // 1 = perfect, -1 = opposite
    const yawMagnitude = Math.abs(yawIntegral || 0);
    let confidence = "high";
    if (rightAgreement < 0.85 || yawMagnitude < 20) {
        confidence = "medium";
    }
    if (rightAgreement < 0.5) {
        confidence = "low";
    }

    return { ...snapped, confidence, rightAgreement, yawIntegral: yawIntegral || 0 };
}
