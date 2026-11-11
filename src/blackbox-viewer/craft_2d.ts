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

import { useSettingsStore } from "./stores/settings";
import type { FlightLog, LogFrame } from "./flightlog";

/** Where a motor sits, as a fraction of the arm length from the centre. */
interface MotorPosition {
    x: number;
    y: number;
}

const ARM_THICKNESS_MULTIPLIER = 0.18,
    ARM_EXTEND_BEYOND_MOTOR_MULTIPLIER = 1.1,
    CENTRAL_HUB_SIZE_MULTIPLIER = 0.3,
    CRAFT_COLOR = "rgb(76,76,76)";

function makeColorHalfStrength(colorHex: string): string {
    const color = Number.parseInt(colorHex.substring(1), 16);

    return `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},0.5)`;
}

/** Motor numbering in counter-clockwise order starting from the 3 o'clock position, and the yaw that puts it the right way up. */
function defaultMotorLayout(numMotors: number): { motorOrder: number[]; yawOffset: number } {
    switch (numMotors) {
        case 3:
            return { motorOrder: [0, 1, 2], yawOffset: -Math.PI / 2 }; // Put motor 1 at the right
        case 4:
            // Numbering for quad-plus; the yaw changes it from "plus" orientation to "X"
            return { motorOrder: [1, 3, 2, 0], yawOffset: Math.PI / 4 };
        case 6:
            return { motorOrder: [4, 1, 3, 5, 2, 0], yawOffset: 0 };
        case 8:
            return { motorOrder: [5, 1, 4, 0, 7, 3, 6, 2], yawOffset: Math.PI / 8 }; // Put two motors at the front
        default:
            return { motorOrder: Array.from({ length: numMotors }, (_, i) => i), yawOffset: 0 };
    }
}

/**
 * Examine the log metadata to determine the layout of motors for the 2D craft model.
 */
function decide2DCraftParameters(numMotors: number): MotorPosition[] {
    switch (numMotors) {
        case 2:
            return [
                { x: -1, y: 0 },
                { x: 1, y: 0 },
            ];
        case 3:
            return [
                { x: 1, y: 0 },
                { x: -0.71, y: -0.71 },
                { x: -0.71, y: +0.71 },
            ];
        case 4: // Classic '+' quad, yawOffset rotates it into an X
            return [
                { x: 1, y: 0 },
                { x: 0, y: -1 },
                { x: -1, y: 0 },
                { x: 0, y: 1 },
            ];
        default: {
            const motors: MotorPosition[] = [];
            for (let i = 0; i < numMotors; i++) {
                motors.push({
                    x: Math.cos((i / numMotors) * Math.PI * 2),
                    y: Math.sin((i / numMotors) * Math.PI * 2),
                });
            }
            return motors;
        }
    }
}

/** A top-down view of the craft, with each prop filled in proportion to its motor output. */
export class Craft2D {
    private readonly canvasContext: CanvasRenderingContext2D;
    private readonly numMotors: number;
    private readonly motorOrder: number[];
    private readonly yawOffset: number;
    private readonly motors: MotorPosition[];
    private readonly shadeColors: string[];
    private armLength = 0;
    private bladeRadius = 0;

    constructor(
        private readonly flightLog: Pick<FlightLog, "getSysConfig">,
        private readonly canvas: HTMLCanvasElement,
        private readonly propColors: string[],
    ) {
        const { userSettings } = useSettingsStore();
        const customMix = userSettings.customMix ?? null;

        this.canvasContext = canvas.getContext("2d")!;
        this.numMotors = customMix ? customMix.motorOrder.length : propColors.length;
        ({ motorOrder: this.motorOrder, yawOffset: this.yawOffset } = customMix ?? defaultMotorLayout(this.numMotors));
        this.shadeColors = propColors.map(makeColorHalfStrength);
        this.motors = decide2DCraftParameters(this.numMotors);

        // Assume we're to fill the entire canvas until we're told otherwise by .resize()
        this.resize(canvas.width, canvas.height);
    }

    render(frame: LogFrame, frameFieldIndexes: Record<string, number>): void {
        const { canvas, canvasContext, numMotors, motorOrder, motors, armLength, bladeRadius } = this;
        const sysConfig = this.flightLog.getSysConfig();
        // The parser fills both before a log opens; a header that lacks one leaves null, read as 0.
        const motorMin = Number(sysConfig.motorOutput[0]);
        const motorMax = Number(sysConfig.motorOutput[1]);

        canvasContext.save();

        canvasContext.clearRect(0, 0, canvas.width, canvas.height); // clear the craft
        canvasContext.translate(canvas.width * 0.5, canvas.height * 0.5);
        canvasContext.rotate(-this.yawOffset);
        canvasContext.scale(0.5, 0.5); // scale to fit

        //Draw arms
        canvasContext.lineWidth = armLength * ARM_THICKNESS_MULTIPLIER;

        canvasContext.lineCap = "round";
        canvasContext.strokeStyle = CRAFT_COLOR;

        canvasContext.beginPath();

        for (let i = 0; i < numMotors; i++) {
            canvasContext.moveTo(0, 0);

            canvasContext.lineTo(
                armLength * ARM_EXTEND_BEYOND_MOTOR_MULTIPLIER * motors[i].x,
                armLength * ARM_EXTEND_BEYOND_MOTOR_MULTIPLIER * motors[i].y,
            );
        }

        canvasContext.stroke();

        //Draw the central hub
        canvasContext.beginPath();

        canvasContext.moveTo(0, 0);
        canvasContext.arc(0, 0, armLength * CENTRAL_HUB_SIZE_MULTIPLIER, 0, 2 * Math.PI);

        canvasContext.fillStyle = CRAFT_COLOR;
        canvasContext.fill();

        for (let i = 0; i < numMotors; i++) {
            // A motor the log lacks has no index, and its value reads as NaN.
            const motorValue = Number(frame[frameFieldIndexes[`motor[${motorOrder[i]}]`]]);

            canvasContext.save();

            //Move to the motor center
            canvasContext.translate(armLength * motors[i].x, armLength * motors[i].y);

            canvasContext.fillStyle = this.shadeColors[motorOrder[i]];

            canvasContext.beginPath();

            canvasContext.moveTo(0, 0);
            canvasContext.arc(0, 0, bladeRadius, 0, Math.PI * 2, false);

            canvasContext.fill();

            canvasContext.fillStyle = this.propColors[motorOrder[i]];

            canvasContext.beginPath();

            canvasContext.moveTo(0, 0);
            canvasContext.arc(
                0,
                0,
                bladeRadius,
                -Math.PI / 2,
                -Math.PI / 2 + (Math.PI * 2 * Math.max(motorValue - motorMin, 0)) / (motorMax - motorMin),
                false,
            );

            canvasContext.fill();

            canvasContext.restore();
        }
        canvasContext.restore();
    }

    resize(width: number, height: number): void {
        const canvas = this.canvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        this.armLength = 0.5 * height;

        if (this.numMotors >= 6) {
            this.bladeRadius = this.armLength * 0.4;
        } else {
            this.bladeRadius = this.armLength * 0.6;
        }
    }
}
