/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import FC from "./fc";

const minRc = 1000;
const midRc = 1500;
const maxRc = 2000;

export interface CurrentRates {
    roll_rate: number;
    pitch_rate: number;
    yaw_rate: number;
    rc_rate: number;
    rc_rate_yaw: number;
    rc_expo: number;
    rc_yaw_expo: number;
    rc_rate_pitch: number;
    rc_pitch_expo: number;
    superexpo: boolean;
    deadband: number;
    yawDeadband: number;
    roll_rate_limit: number;
    pitch_rate_limit: number;
    yaw_rate_limit: number;
}

/** The axis parameters that define one rate curve. They are always read and passed as a set. */
export interface RateCurveParams {
    rate: number;
    rcRate: number;
    rcExpo: number;
    superExpoActive: boolean;
    deadband: number;
    limit: number;
}

/** The same set before MSP has delivered a rate profile, when the three rate fields may be absent. */
export type MaybeRateCurveParams = Omit<RateCurveParams, "rate" | "rcRate" | "rcExpo"> &
    Partial<Pick<RateCurveParams, "rate" | "rcRate" | "rcExpo">>;

function hasRates(params: MaybeRateCurveParams): params is RateCurveParams {
    return params.rate !== undefined && params.rcRate !== undefined && params.rcExpo !== undefined;
}

export type RateCurveAxis = "roll" | "pitch" | "yaw";

/** Pick one axis out of a rates snapshot. Yaw is the odd one out: it has its own deadband. */
export function axisRateCurveParams(rates: CurrentRates, axis: RateCurveAxis): RateCurveParams {
    switch (axis) {
        case "pitch":
            return {
                rate: rates.pitch_rate,
                rcRate: rates.rc_rate_pitch,
                rcExpo: rates.rc_pitch_expo,
                superExpoActive: rates.superexpo,
                deadband: rates.deadband,
                limit: rates.pitch_rate_limit,
            };
        case "yaw":
            return {
                rate: rates.yaw_rate,
                rcRate: rates.rc_rate_yaw,
                rcExpo: rates.rc_yaw_expo,
                superExpoActive: rates.superexpo,
                deadband: rates.yawDeadband,
                limit: rates.yaw_rate_limit,
            };
        default:
            return {
                rate: rates.roll_rate,
                rcRate: rates.rc_rate,
                rcExpo: rates.rc_expo,
                superExpoActive: rates.superexpo,
                deadband: rates.deadband,
                limit: rates.roll_rate_limit,
            };
    }
}

export default class RateCurve {
    useLegacyCurve: boolean;
    maxAngularVel: number | null = null;

    constructor(useLegacyCurve: boolean) {
        this.useLegacyCurve = useLegacyCurve;
    }

    constrain(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(value, max));
    }

    rcCommand(rcData: number, rcRate: number, deadband: number): number {
        const tmp = Math.min(Math.max(Math.abs(rcData - midRc) - deadband, 0), 500);

        let result = tmp * rcRate;

        if (rcData < midRc) {
            result = -result;
        }

        return result;
    }

    drawRateCurve(params: RateCurveParams, maxAngularVel: number, context: CanvasRenderingContext2D): void {
        const { width, height } = context.canvas;
        const canvasHeightScale = height / (2 * maxAngularVel);

        const stepWidth = context.lineWidth;

        context.save();
        context.translate(width / 2, height / 2);

        context.beginPath();
        let rcData = minRc;
        context.moveTo(-500, -canvasHeightScale * this.rcCommandRawToDegreesPerSecond(rcData, params));
        rcData = rcData + stepWidth;
        while (rcData <= maxRc) {
            context.lineTo(rcData - midRc, -canvasHeightScale * this.rcCommandRawToDegreesPerSecond(rcData, params));

            rcData = rcData + stepWidth;
        }
        context.stroke();

        context.restore();
    }

    drawLegacyRateCurve(params: RateCurveParams, context: CanvasRenderingContext2D): void {
        const { rate, rcRate, rcExpo } = params;
        const { width, height } = context.canvas;

        // math magic by englishman
        let rateY = height * rcRate;
        rateY = rateY + 1 / (1 - (rateY / height) * rate);

        // draw
        context.beginPath();
        context.moveTo(0, height);
        context.quadraticCurveTo((width * 11) / 20, height - (rateY / 2) * (1 - rcExpo), width, height - rateY);
        context.stroke();
    }

    drawStickPosition(
        rcData: number,
        params: RateCurveParams,
        maxAngularVel: number,
        context: CanvasRenderingContext2D,
        stickColor?: string,
    ): number | string {
        const DEFAULT_SIZE = 60; // canvas units, relative size of the stick indicator (larger value is smaller indicator)
        const rateScaling = context.canvas.height / 2 / maxAngularVel;

        const currentValue = this.rcCommandRawToDegreesPerSecond(rcData, params);

        if (rcData != undefined) {
            context.save();
            context.fillStyle = stickColor || "#000000";

            context.translate(context.canvas.width / 2, context.canvas.height / 2);

            // The canvas is drawn at a fixed square resolution but displayed at a
            // non-square aspect ratio, which would stretch a plain circle horizontally.
            // Compress the horizontal radius by the display aspect ratio so the
            // indicator renders as a round dot.
            const radius = context.canvas.height / DEFAULT_SIZE;
            const { clientWidth, clientHeight } = context.canvas;
            const aspect = clientWidth && clientHeight ? clientHeight / clientWidth : 1;

            context.beginPath();
            if (context.ellipse) {
                context.ellipse(rcData - 1500, -rateScaling * currentValue, radius * aspect, radius, 0, 0, 2 * Math.PI);
            } else {
                context.arc(rcData - 1500, -rateScaling * currentValue, radius, 0, 2 * Math.PI);
            }
            context.fill();
            context.restore();
        }
        return Math.abs(currentValue) < 0.5 ? 0 : currentValue.toFixed(0); // The calculated value in deg/s is returned from the function call for further processing.
    }

    getBetaflightRates(
        rcCommandf: number,
        rcCommandfAbs: number,
        rate: number,
        rcRate: number,
        rcExpo: number,
        superExpoActive: boolean,
        limit: number,
    ): number {
        let angularVel;

        if (rcRate > 2) {
            rcRate = rcRate + (rcRate - 2) * 14.54;
        }

        const expoPower = 3;
        const rcRateConstant = 200;

        if (rcExpo > 0) {
            rcCommandf = rcCommandf * Math.pow(rcCommandfAbs, expoPower) * rcExpo + rcCommandf * (1 - rcExpo);
        }

        if (superExpoActive) {
            const rcFactor = 1 / this.constrain(1 - rcCommandfAbs * rate, 0.01, 1);
            angularVel = rcRateConstant * rcRate * rcCommandf; // 200 should be variable checked on version (older versions it's 205,9)
            angularVel = angularVel * rcFactor;
        } else {
            angularVel = ((rate * 100 + 27) * rcCommandf) / 16 / 4.1; // Only applies to old versions ?
        }

        angularVel = this.constrain(angularVel, -1 * limit, limit); // Rate limit from profile

        return angularVel;
    }

    getRaceflightRates(rcCommandf: number, rate: number, rcRate: number, rcExpo: number): number {
        let angularVel = (1 + 0.01 * rcExpo * (rcCommandf * rcCommandf - 1.0)) * rcCommandf;
        angularVel = angularVel * (rcRate + Math.abs(angularVel) * rcRate * rate * 0.01);
        return angularVel;
    }

    getKISSRates(rcCommandf: number, rcCommandfAbs: number, rate: number, rcRate: number, rcExpo: number): number {
        const kissRpy = 1 - rcCommandfAbs * rate;
        const kissTempCurve = rcCommandf * rcCommandf;
        rcCommandf = (rcCommandf * kissTempCurve * rcExpo + rcCommandf * (1 - rcExpo)) * (rcRate / 10);
        return 2000.0 * (1.0 / kissRpy) * rcCommandf;
    }

    getActualRates(rcCommandf: number, rcCommandfAbs: number, rate: number, rcRate: number, rcExpo: number): number {
        let angularVel;
        const expof = rcCommandfAbs * (Math.pow(rcCommandf, 5) * rcExpo + rcCommandf * (1 - rcExpo));

        angularVel = Math.max(0, rate - rcRate);
        angularVel = rcCommandf * rcRate + angularVel * expof;

        return angularVel;
    }

    getQuickRates(rcCommandf: number, rcCommandfAbs: number, rate: number, rcRate: number, rcExpo: number): number {
        rcRate = rcRate * 200;
        rate = Math.max(rate, rcRate);

        let angularVel;
        const superExpoConfig = (rate / rcRate - 1) / (rate / rcRate);
        const curve = Math.pow(rcCommandfAbs, 3) * rcExpo + rcCommandfAbs * (1 - rcExpo);

        angularVel = 1.0 / (1.0 - curve * superExpoConfig);
        angularVel = rcCommandf * rcRate * angularVel;

        return angularVel;
    }

    getCurrentRates(): CurrentRates {
        const tuning = FC.RC_TUNING!;
        const deadbandConfig = FC.RC_DEADBAND_CONFIG!;

        const currentRates: CurrentRates = {
            roll_rate: tuning.roll_rate,
            pitch_rate: tuning.pitch_rate,
            yaw_rate: tuning.yaw_rate,
            rc_rate: tuning.RC_RATE,
            rc_rate_yaw: tuning.rcYawRate,
            rc_expo: tuning.RC_EXPO,
            rc_yaw_expo: tuning.RC_YAW_EXPO,
            rc_rate_pitch: tuning.rcPitchRate,
            rc_pitch_expo: tuning.RC_PITCH_EXPO,
            // Always on: the SUPEREXPO_RATES feature bit is gone from the firmware.
            superexpo: true,
            deadband: deadbandConfig.deadband,
            yawDeadband: deadbandConfig.yaw_deadband,
            roll_rate_limit: tuning.roll_rate_limit,
            pitch_rate_limit: tuning.pitch_rate_limit,
            yaw_rate_limit: tuning.yaw_rate_limit,
        };

        switch (tuning.rates_type) {
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
            default: // add future rates types here
                break;
        }

        return currentRates;
    }

    rcCommandRawToDegreesPerSecond(rcData: number, params: RateCurveParams): number;
    rcCommandRawToDegreesPerSecond(rcData: number, params: MaybeRateCurveParams): number | undefined;
    rcCommandRawToDegreesPerSecond(rcData: number, params: MaybeRateCurveParams): number | undefined {
        const { superExpoActive, deadband, limit } = params;
        let angleRate;

        if (hasRates(params)) {
            const { rate, rcRate, rcExpo } = params;
            let rcCommandf = this.rcCommand(rcData, 1, deadband);
            rcCommandf /= 500 - deadband;

            const rcCommandfAbs = Math.abs(rcCommandf);

            switch (FC.RC_TUNING!.rates_type) {
                case FC.RATES_TYPE.RACEFLIGHT:
                    angleRate = this.getRaceflightRates(rcCommandf, rate, rcRate, rcExpo);

                    break;

                case FC.RATES_TYPE.KISS:
                    angleRate = this.getKISSRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                    break;

                case FC.RATES_TYPE.ACTUAL:
                    angleRate = this.getActualRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                    break;

                case FC.RATES_TYPE.QUICKRATES:
                    angleRate = this.getQuickRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo);

                    break;

                // add future rates types here
                default: // BetaFlight
                    angleRate = this.getBetaflightRates(
                        rcCommandf,
                        rcCommandfAbs,
                        rate,
                        rcRate,
                        rcExpo,
                        superExpoActive,
                        limit,
                    );

                    break;
            }
        }

        return angleRate;
    }

    getMaxAngularVel(params: RateCurveParams): number | undefined {
        let maxAngularVel;
        if (!this.useLegacyCurve) {
            maxAngularVel = this.rcCommandRawToDegreesPerSecond(maxRc, params);
        }

        return maxAngularVel;
    }

    setMaxAngularVel(value: number): number {
        this.maxAngularVel = Math.ceil(value / 200) * 200;

        return this.maxAngularVel;
    }

    draw(params: MaybeRateCurveParams, maxAngularVel: number, context: CanvasRenderingContext2D): void {
        if (!hasRates(params)) {
            return;
        }

        if (this.useLegacyCurve) {
            this.drawLegacyRateCurve(params, context);
        } else {
            this.drawRateCurve(params, maxAngularVel, context);
        }
    }
}
