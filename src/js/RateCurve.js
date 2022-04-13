'use strict';

const minRc = 1000;
const midRc = 1500;
const maxRc = 2000;
const RateCurve = function (useLegacyCurve) {
    this.useLegacyCurve = useLegacyCurve;
    this.maxAngularVel = null;

    this.constrain = function (value, min, max) {
        return Math.max(min, Math.min(value, max));
    };

    this.rcCommand = function (rcData, rcRate, deadband) {
        const tmp = Math.min(Math.max(Math.abs(rcData - midRc) - deadband, 0), 500);

        let result = tmp * rcRate;

        if (rcData < midRc) {
            result = -result;
        }

        return result;
    };

    this.drawRateCurve = function (rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, width, height) {
        const canvasHeightScale = height / (2 * maxAngularVel);

        const stepWidth = context.lineWidth;

        context.save();
        context.translate(width / 2, height / 2);

        context.beginPath();
        let rcData = minRc;
        context.moveTo(-500, -canvasHeightScale * this.rcCommandRawToDegreesPerSecond(rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit));
        rcData = rcData + stepWidth;
        while (rcData <= maxRc) {
            context.lineTo(rcData - midRc, -canvasHeightScale * this.rcCommandRawToDegreesPerSecond(rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit));

            rcData = rcData + stepWidth;
        }
        context.stroke();

        context.restore();
    };

    this.drawLegacyRateCurve = function (rate, rcRate, rcExpo, context, width, height) {
        // math magic by englishman
        let rateY = height * rcRate;
        rateY = rateY + (1 / (1 - ((rateY / height) * rate)));

        // draw
        context.beginPath();
        context.moveTo(0, height);
        context.quadraticCurveTo(width * 11 / 20, height - ((rateY / 2) * (1 - rcExpo)), width, height - rateY);
        context.stroke();
    };

    this.drawStickPosition = function (rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, stickColor) {

        const DEFAULT_SIZE = 60; // canvas units, relative size of the stick indicator (larger value is smaller indicator)
        const rateScaling  = (context.canvas.height / 2) / maxAngularVel;

        const currentValue = this.rcCommandRawToDegreesPerSecond(rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit);

        if(rcData!=undefined) {
            context.save();
            context.fillStyle = stickColor || '#000000';

            context.translate(context.canvas.width/2, context.canvas.height/2);
            context.beginPath();
            context.arc(rcData-1500, -rateScaling * currentValue, context.canvas.height / DEFAULT_SIZE, 0, 2 * Math.PI);
            context.fill();
            context.restore();
        }
        return (Math.abs(currentValue)<0.5)?0:currentValue.toFixed(0); // The calculated value in deg/s is returned from the function call for further processing.
    };

    this.getBetaflightRates = function (rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo, superExpoActive, limit) {
        let angularVel;

        if (rcRate > 2) {
            rcRate = rcRate + (rcRate - 2) * 14.54;
        }

        let expoPower;
        let rcRateConstant;

        if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
            expoPower = 3;
            rcRateConstant = 200;
        } else {
            expoPower = 2;
            rcRateConstant = 205.85;
        }

        if (rcExpo > 0) {
            rcCommandf =  rcCommandf * Math.pow(rcCommandfAbs, expoPower) * rcExpo + rcCommandf * (1-rcExpo);
        }

        if (superExpoActive) {
            const rcFactor = 1 / this.constrain(1 - rcCommandfAbs * rate, 0.01, 1);
            angularVel = rcRateConstant * rcRate * rcCommandf; // 200 should be variable checked on version (older versions it's 205,9)
            angularVel = angularVel * rcFactor;
        } else {
            angularVel = (((rate * 100) + 27) * rcCommandf / 16) / 4.1; // Only applies to old versions ?
        }

        angularVel = this.constrain(angularVel, -1 * limit, limit); // Rate limit from profile

        return angularVel;
    };

    this.getRaceflightRates = function (rcCommandf, rate, rcRate, rcExpo) {
        let angularVel = ((1 + 0.01 * rcExpo * (rcCommandf * rcCommandf - 1.0)) * rcCommandf);
        angularVel = (angularVel * (rcRate + (Math.abs(angularVel) * rcRate * rate * 0.01)));
        return angularVel;
    };

    this.getKISSRates = function (rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo) {
        const kissRpy = 1 - rcCommandfAbs * rate;
        const kissTempCurve = rcCommandf * rcCommandf;
        rcCommandf = ((rcCommandf * kissTempCurve) * rcExpo + rcCommandf * (1 - rcExpo)) * (rcRate / 10);
        return ((2000.0 * (1.0 / kissRpy)) * rcCommandf);
    };

    this.getActualRates = function (rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo) {
        let angularVel;
        const expof = rcCommandfAbs * ((Math.pow(rcCommandf, 5) * rcExpo) + (rcCommandf * (1 - rcExpo)));

        angularVel = Math.max(0, rate-rcRate);
        angularVel = (rcCommandf * rcRate) + (angularVel * expof);

        return angularVel;
    };

    this.getQuickRates = function (rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo) {
        rcRate = rcRate * 200;
        rate = Math.max(rate, rcRate);

        let angularVel;
        const superExpoConfig = (((rate / rcRate) - 1) / (rate / rcRate));
        const curve = Math.pow(rcCommandfAbs, 3) * rcExpo + rcCommandfAbs * (1 - rcExpo);

        angularVel = 1.0 / (1.0 - (curve * superExpoConfig));
        angularVel = rcCommandf * rcRate * angularVel;

        return angularVel;
    };

    this.getCurrentRates = function () {

        const currentRates = {
            roll_rate:          FC.RC_TUNING.roll_rate,
            pitch_rate:         FC.RC_TUNING.pitch_rate,
            yaw_rate:           FC.RC_TUNING.yaw_rate,
            rc_rate:            FC.RC_TUNING.RC_RATE,
            rc_rate_yaw:        FC.RC_TUNING.rcYawRate,
            rc_expo:            FC.RC_TUNING.RC_EXPO,
            rc_yaw_expo:        FC.RC_TUNING.RC_YAW_EXPO,
            rc_rate_pitch:      FC.RC_TUNING.rcPitchRate,
            rc_pitch_expo:      FC.RC_TUNING.RC_PITCH_EXPO,
            superexpo:          FC.FEATURE_CONFIG.features.isEnabled('SUPEREXPO_RATES'),
            deadband:           FC.RC_DEADBAND_CONFIG.deadband,
            yawDeadband:        FC.RC_DEADBAND_CONFIG.yaw_deadband,
            roll_rate_limit:    FC.RC_TUNING.roll_rate_limit,
            pitch_rate_limit:   FC.RC_TUNING.pitch_rate_limit,
            yaw_rate_limit:     FC.RC_TUNING.yaw_rate_limit,
        };

        if (semver.lt(FC.CONFIG.apiVersion, "1.7.0")) {
            currentRates.roll_rate = FC.RC_TUNING.roll_pitch_rate;
            currentRates.pitch_rate = FC.RC_TUNING.roll_pitch_rate;
        }

        if (semver.lt(FC.CONFIG.apiVersion, "1.16.0")) {
            currentRates.rc_rate_yaw = currentRates.rc_rate;
        }

        if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
            currentRates.superexpo = true;
        }

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
            currentRates.rc_rate_pitch = currentRates.rc_rate;
            currentRates.rc_expo_pitch = currentRates.rc_expo;
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            switch (FC.RC_TUNING.rates_type) {
                case FC.RATES_TYPE.RACEFLIGHT:
                    currentRates.roll_rate *= 100;
                    currentRates.pitch_rate *= 100;
                    currentRates.yaw_rate *= 100;
                    currentRates.rc_rate *= 1000;
                    currentRates.rc_rate_yaw *= 1000;
                    currentRates.rc_rate_pitch *= 1000;
                    currentRates.rc_expo *= 100;
                    currentRates.rc_yaw_expo *= 100;
                    currentRates.rc_pitch_expo *= 100;

                    break;
                case FC.RATES_TYPE.ACTUAL:
                    currentRates.roll_rate *= 1000;
                    currentRates.pitch_rate *= 1000;
                    currentRates.yaw_rate *= 1000;
                    currentRates.rc_rate *= 1000;
                    currentRates.rc_rate_yaw *= 1000;
                    currentRates.rc_rate_pitch *= 1000;

                    break;
                case FC.RATES_TYPE.QUICKRATES:
                    currentRates.roll_rate *= 1000;
                    currentRates.pitch_rate *= 1000;
                    currentRates.yaw_rate *= 1000;

                    break;
                default:           // add future rates types here

                    break;
            }
        }

        return currentRates;
    };
};

RateCurve.prototype.rcCommandRawToDegreesPerSecond = function (rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit) {
    let angleRate;

    if (rate !== undefined && rcRate !== undefined && rcExpo !== undefined) {
        let rcCommandf = this.rcCommand(rcData, 1, deadband);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            rcCommandf = rcCommandf / (500 - deadband);
        } else {
            rcCommandf = rcCommandf / 500;
        }

        const rcCommandfAbs = Math.abs(rcCommandf);

        switch (FC.RC_TUNING.rates_type) {
            case FC.RATES_TYPE.RACEFLIGHT:
                angleRate=this.getRaceflightRates(rcCommandf, rate, rcRate, rcExpo);

                break;

            case FC.RATES_TYPE.KISS:
                angleRate=this.getKISSRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                break;

            case FC.RATES_TYPE.ACTUAL:
                angleRate=this.getActualRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                break;

            case FC.RATES_TYPE.QUICKRATES:
                angleRate=this.getQuickRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                break;

            // add future rates types here
            default: // BetaFlight
                angleRate=this.getBetaflightRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo, superExpoActive, limit);

                break;
        }
    }

    return angleRate;
};

RateCurve.prototype.getMaxAngularVel = function (rate, rcRate, rcExpo, superExpoActive, deadband, limit) {
    let maxAngularVel;
    if (!this.useLegacyCurve) {
        maxAngularVel = this.rcCommandRawToDegreesPerSecond(maxRc, rate, rcRate, rcExpo, superExpoActive, deadband, limit);
    }

    return maxAngularVel;
};

RateCurve.prototype.setMaxAngularVel = function (value) {
    this.maxAngularVel = Math.ceil(value/200) * 200;

    return this.maxAngularVel;
};

RateCurve.prototype.draw = function (rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context) {
    if (rate !== undefined && rcRate !== undefined && rcExpo !== undefined) {
        const height = context.canvas.height;
        const width = context.canvas.width;

        if (this.useLegacyCurve) {
            this.drawLegacyRateCurve(rate, rcRate, rcExpo, context, width, height);
        } else {
            this.drawRateCurve(rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, width, height);
        }
    }
};
