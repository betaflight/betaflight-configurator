'use strict';

var minRc = 1000;
var midRc = 1500;
var maxRc = 2000;

var RateCurve = function (useLegacyCurve) {
    this.useLegacyCurve = useLegacyCurve;
    this.maxAngularVel = null;

    this.constrain = function (value, min, max) {
        return Math.max(min, Math.min(value, max));
    };

    this.rcCommand = function (rcData, rcRate, deadband) {
        var tmp = Math.min(Math.max(Math.abs(rcData - midRc) - deadband, 0), 500);

        var result = tmp * rcRate;

        if (rcData < midRc) {
            result = -result;
        }

        return result;
    };

    this.drawRateCurve = function (rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, width, height) {
        var canvasHeightScale = height / (2 * maxAngularVel);

        var stepWidth = context.lineWidth;

        context.save();
        context.translate(width / 2, height / 2);

        context.beginPath();
        var rcData = minRc;
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
        var rateY = height * rcRate;
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

        var currentValue = this.rcCommandRawToDegreesPerSecond(rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit);

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

        var expoPower;
        var rcRateConstant;

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
            var rcFactor = 1 / this.constrain(1 - rcCommandfAbs * rate, 0.01, 1);
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

};

RateCurve.prototype.rcCommandRawToDegreesPerSecond = function (rcData, rate, rcRate, rcExpo, superExpoActive, deadband, limit) {
    var angleRate;

    if (rate !== undefined && rcRate !== undefined && rcExpo !== undefined) {
        let rcCommandf = this.rcCommand(rcData, 1, deadband);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            rcCommandf = rcCommandf / (500 - deadband);
        } else {
            rcCommandf = rcCommandf / 500;
        }

        var rcCommandfAbs = Math.abs(rcCommandf);

        switch(TABS.pid_tuning.currentRatesType) {
            case TABS.pid_tuning.RATES_TYPE.RACEFLIGHT:
                angleRate=this.getRaceflightRates(rcCommandf, rate, rcRate, rcExpo);

                break;

            case TABS.pid_tuning.RATES_TYPE.KISS:
                angleRate=this.getKISSRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                break;

            case TABS.pid_tuning.RATES_TYPE.ACTUAL:
                angleRate=this.getActualRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                break;

            case TABS.pid_tuning.RATES_TYPE.QUICKRATES:
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
    var maxAngularVel;
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
        var height = context.canvas.height;
        var width = context.canvas.width;

        if (this.useLegacyCurve) {
            this.drawLegacyRateCurve(rate, rcRate, rcExpo, context, width, height);
        } else {
            this.drawRateCurve(rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, width, height);
        }
    }
};
