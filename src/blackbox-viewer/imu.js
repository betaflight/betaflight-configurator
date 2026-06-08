/**
 * This IMU code is used for attitude estimation, and is derived from legacy flight controller firmware.
 */

export function IMU(copyFrom) {
    // Constants:
    const RAD = Math.PI / 180,
        ROLL = 0,
        PITCH = 1,
        YAW = 2,
        //Settings that would normally be set by the user in MW config:
        gyro_cmpf_factor = 600,
        magneticDeclination = 0, // user to set to local declination in degrees * 10
        INV_GYR_CMPF_FACTOR = 1 / (gyro_cmpf_factor + 1);

    // **************************************************
    // Simplified IMU based on "Complementary Filter"
    // Inspired by http://starlino.com/imu_guide.html
    //
    // adapted by ziss_dm : http://www.multiwii.com/forum/viewtopic.php?f=8&t=198
    //
    // The following ideas was used in this project:
    // 1) Rotation matrix: http://en.wikipedia.org/wiki/Rotation_matrix
    //
    // Currently Magnetometer uses separate CF which is used only
    // for heading approximation.
    //
    // **************************************************

    function normalizeVector(src, dest) {
        const length = Math.hypot(src.X, src.Y, src.Z);

        if (length !== 0) {
            dest.X = src.X / length;
            dest.Y = src.Y / length;
            dest.Z = src.Z / length;
        }
    }

    function rotateVector(v, delta) {
        // This does a  "proper" matrix rotation using gyro deltas without small-angle approximation
        const v_tmp = { X: v.X, Y: v.Y, Z: v.Z };
        const mat = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ];

        const cosx = Math.cos(delta[ROLL]);
        const sinx = Math.sin(delta[ROLL]);
        const cosy = Math.cos(delta[PITCH]);
        const siny = Math.sin(delta[PITCH]);
        const cosz = Math.cos(delta[YAW]);
        const sinz = Math.sin(delta[YAW]);

        const coszcosx = cosz * cosx;
        const sinzcosx = sinz * cosx;
        const coszsinx = sinx * cosz;
        const sinzsinx = sinx * sinz;

        mat[0][0] = cosz * cosy;
        mat[0][1] = -cosy * sinz;
        mat[0][2] = siny;
        mat[1][0] = sinzcosx + coszsinx * siny;
        mat[1][1] = coszcosx - sinzsinx * siny;
        mat[1][2] = -sinx * cosy;
        mat[2][0] = sinzsinx - coszcosx * siny;
        mat[2][1] = coszsinx + sinzcosx * siny;
        mat[2][2] = cosy * cosx;

        v.X = v_tmp.X * mat[0][0] + v_tmp.Y * mat[1][0] + v_tmp.Z * mat[2][0];
        v.Y = v_tmp.X * mat[0][1] + v_tmp.Y * mat[1][1] + v_tmp.Z * mat[2][1];
        v.Z = v_tmp.X * mat[0][2] + v_tmp.Y * mat[1][2] + v_tmp.Z * mat[2][2];
    }

    // Use the craft's estimated roll/pitch to compensate for the roll/pitch of the magnetometer reading
    function calculateHeading(vec, roll, pitch) {
        const cosineRoll = Math.cos(roll);
        const sineRoll = Math.sin(roll);
        const cosinePitch = Math.cos(pitch);
        const sinePitch = Math.sin(pitch);
        const headingX = vec.X * cosinePitch + vec.Y * sineRoll * sinePitch + vec.Z * sinePitch * cosineRoll;
        const headingY = vec.Y * cosineRoll - vec.Z * sineRoll;
        let heading = Math.atan2(headingY, headingX) + (magneticDeclination / 10) * RAD; // RAD = pi/180

        heading += 2 * Math.PI; // positive all the time, we want zero to return pi
        if (heading > 2 * Math.PI) {
            heading -= 2 * Math.PI;
        }

        return heading;
    }

    /**
     * Using the given raw data, update the IMU state and return the new estimate for the attitude.
     */
    this.updateEstimatedAttitude = function (gyroADC, accSmooth, currentTime, acc_1G, gyroScale, _magADC) {
        let accMag = 0;
        let deltaTime;
        const deltaGyroAngle = [0, 0, 0];

        if (this.previousTime === false) {
            deltaTime = 1;
        } else {
            deltaTime = currentTime - this.previousTime;
        }

        const scale = deltaTime * gyroScale;
        this.previousTime = currentTime;

        // Initialization
        for (let axis = 0; axis < 3; axis++) {
            deltaGyroAngle[axis] = gyroADC[axis] * scale;

            accMag += accSmooth[axis] * accSmooth[axis];
        }
        accMag = (accMag * 100) / (acc_1G * acc_1G);

        rotateVector(this.estimateGyro, deltaGyroAngle);

        // Apply complimentary filter (Gyro drift correction)
        // If accel magnitude >1.15G or <0.85G and ACC vector outside of the limit range => we neutralize the effect of accelerometers in the angle estimation.
        // To do that, we just skip filter, as EstV already rotated by Gyro
        if (72 < accMag && accMag < 133) {
            this.estimateGyro.X = (this.estimateGyro.X * gyro_cmpf_factor + accSmooth[0]) * INV_GYR_CMPF_FACTOR;
            this.estimateGyro.Y = (this.estimateGyro.Y * gyro_cmpf_factor + accSmooth[1]) * INV_GYR_CMPF_FACTOR;
            this.estimateGyro.Z = (this.estimateGyro.Z * gyro_cmpf_factor + accSmooth[2]) * INV_GYR_CMPF_FACTOR;
        }

        const attitude = {
            roll: Math.atan2(this.estimateGyro.Y, this.estimateGyro.Z),
            pitch: Math.atan2(
                -this.estimateGyro.X,
                Math.sqrt(this.estimateGyro.Y * this.estimateGyro.Y + this.estimateGyro.Z * this.estimateGyro.Z),
            ),
        };

        //Magnetometer heading disabled — only EstN heading used
        rotateVector(this.EstN, deltaGyroAngle);
        normalizeVector(this.EstN, this.EstN);
        attitude.heading = calculateHeading(this.EstN, attitude.roll, attitude.pitch);

        return attitude;
    };

    if (copyFrom) {
        this.copyStateFrom(copyFrom);
    } else {
        this.reset();
    }
}

IMU.prototype.reset = function () {
    this.estimateGyro = { X: 0, Y: 0, Z: 0 };
    this.EstN = { X: 1, Y: 0, Z: 0 };
    this.estimateMag = { X: 0, Y: 0, Z: 0 };

    this.previousTime = false;
};

IMU.prototype.copyStateFrom = function (that) {
    this.estimateGyro = {
        X: that.estimateGyro.X,
        Y: that.estimateGyro.Y,
        Z: that.estimateGyro.Z,
    };

    this.estimateMag = {
        X: that.estimateMag.X,
        Y: that.estimateMag.Y,
        Z: that.estimateMag.Z,
    };

    this.EstN = {
        X: that.EstN.X,
        Y: that.EstN.Y,
        Z: that.EstN.Z,
    };

    this.previousTime = that.previousTime;
};
