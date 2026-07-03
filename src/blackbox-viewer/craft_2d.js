import { useSettingsStore } from "./stores/settings.js";

function makeColorHalfStrength(colorHex) {
    const color = Number.parseInt(colorHex.substring(1), 16);

    return `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},0.5)`;
}

export function Craft2D(flightLog, canvas, propColors) {
    const { userSettings } = useSettingsStore();

    const ARM_THICKNESS_MULTIPLIER = 0.18,
        ARM_EXTEND_BEYOND_MOTOR_MULTIPLIER = 1.1,
        CENTRAL_HUB_SIZE_MULTIPLIER = 0.3;

    const canvasContext = canvas.getContext("2d");

    const craftParameters = {};

    const customMix = userSettings.customMix ?? null;

    let numMotors;
    if (customMix) {
        numMotors = customMix.motorOrder.length;
    } else {
        numMotors = propColors.length;
    }

    const shadeColors = [];
    const craftColor = "rgb(76,76,76)";
    let armLength;
    let bladeRadius;

    let motorOrder, yawOffset;

    // Motor numbering in counter-clockwise order starting from the 3 o'clock position
    if (customMix) {
        motorOrder = customMix.motorOrder;
        yawOffset = customMix.yawOffset;
    } else {
        switch (numMotors) {
            case 3:
                motorOrder = [0, 1, 2]; // Put motor 1 at the right
                yawOffset = -Math.PI / 2;
                break;
            case 4:
                motorOrder = [1, 3, 2, 0]; // Numbering for quad-plus
                yawOffset = Math.PI / 4; // Change from "plus" orientation to "X"
                break;
            case 6:
                motorOrder = [4, 1, 3, 5, 2, 0];
                yawOffset = 0;
                break;
            case 8:
                motorOrder = [5, 1, 4, 0, 7, 3, 6, 2];
                yawOffset = Math.PI / 8; // Put two motors at the front
                break;
            default:
                motorOrder = new Array(numMotors);
                for (let i = 0; i < numMotors; i++) {
                    motorOrder[i] = i;
                }
                yawOffset = 0;
        }
    }

    /**
     * Examine the log metadata to determine the layout of motors for the 2D craft model. Returns the craft parameters
     * object.
     */
    function decide2DCraftParameters() {
        switch (numMotors) {
            case 2:
                craftParameters.motors = [
                    {
                        x: -1,
                        y: 0,
                        direction: -1,
                        color: propColors[motorOrder[0]],
                    },
                    {
                        x: 1,
                        y: 0,
                        direction: -1,
                        color: propColors[motorOrder[1]],
                    },
                ];
                break;
            case 3:
                craftParameters.motors = [
                    {
                        x: 1,
                        y: 0,
                        direction: -1,
                        color: propColors[motorOrder[0]],
                    },
                    {
                        x: -0.71,
                        y: -0.71,
                        direction: -1,
                        color: propColors[motorOrder[1]],
                    },
                    {
                        x: -0.71,
                        y: +0.71,
                        direction: -1,
                        color: propColors[motorOrder[2]],
                    },
                ];
                break;
            case 4: // Classic '+' quad, yawOffset rotates it into an X
                craftParameters.motors = [
                    {
                        x: 1 /*0.71,*/,
                        y: 0 /*-0.71,*/,
                        direction: -1,
                        color: propColors[motorOrder[1]],
                    },
                    {
                        x: 0 /*-0.71,*/,
                        y: -1 /*-0.71,*/,
                        direction: 1,
                        color: propColors[motorOrder[3]],
                    },
                    {
                        x: -1 /*-0.71,*/,
                        y: 0 /*0.71,*/,
                        direction: -1,
                        color: propColors[motorOrder[2]],
                    },
                    {
                        x: 0 /*0.71,*/,
                        y: 1 /*0.71,*/,
                        direction: 1,
                        color: propColors[motorOrder[0]],
                    },
                ];
                break;
            default:
                craftParameters.motors = [];

                for (let i = 0; i < numMotors; i++) {
                    craftParameters.motors.push({
                        x: Math.cos((i / numMotors) * Math.PI * 2),
                        y: Math.sin((i / numMotors) * Math.PI * 2),
                        direction: (-1) ** i,
                        color: propColors[i],
                    });
                }
                break;
        }

        return craftParameters;
    }

    this.render = function (frame, frameFieldIndexes) {
        const sysConfig = flightLog.getSysConfig();

        canvasContext.save();

        canvasContext.clearRect(0, 0, canvas.width, canvas.height); // clear the craft
        canvasContext.translate(canvas.width * 0.5, canvas.height * 0.5);
        canvasContext.rotate(-yawOffset);
        canvasContext.scale(0.5, 0.5); // scale to fit

        //Draw arms
        canvasContext.lineWidth = armLength * ARM_THICKNESS_MULTIPLIER;

        canvasContext.lineCap = "round";
        canvasContext.strokeStyle = craftColor;

        canvasContext.beginPath();

        for (let i = 0; i < numMotors; i++) {
            canvasContext.moveTo(0, 0);

            canvasContext.lineTo(
                armLength * ARM_EXTEND_BEYOND_MOTOR_MULTIPLIER * craftParameters.motors[i].x,
                armLength * ARM_EXTEND_BEYOND_MOTOR_MULTIPLIER * craftParameters.motors[i].y,
            );
        }

        canvasContext.stroke();

        //Draw the central hub
        canvasContext.beginPath();

        canvasContext.moveTo(0, 0);
        canvasContext.arc(0, 0, armLength * CENTRAL_HUB_SIZE_MULTIPLIER, 0, 2 * Math.PI);

        canvasContext.fillStyle = craftColor;
        canvasContext.fill();

        for (let i = 0; i < numMotors; i++) {
            const motorValue = frame[frameFieldIndexes[`motor[${motorOrder[i]}]`]];

            canvasContext.save();

            //Move to the motor center
            canvasContext.translate(armLength * craftParameters.motors[i].x, armLength * craftParameters.motors[i].y);

            canvasContext.fillStyle = shadeColors[motorOrder[i]];

            canvasContext.beginPath();

            canvasContext.moveTo(0, 0);
            canvasContext.arc(0, 0, bladeRadius, 0, Math.PI * 2, false);

            canvasContext.fill();

            canvasContext.fillStyle = propColors[motorOrder[i]];

            canvasContext.beginPath();

            canvasContext.moveTo(0, 0);
            canvasContext.arc(
                0,
                0,
                bladeRadius,
                -Math.PI / 2,
                -Math.PI / 2 +
                    (Math.PI * 2 * Math.max(motorValue - sysConfig.motorOutput[0], 0)) /
                        (sysConfig.motorOutput[1] - sysConfig.motorOutput[0]),
                false,
            );

            canvasContext.fill();

            canvasContext.restore();
        }
        canvasContext.restore();
    };

    for (const propColor of propColors) {
        shadeColors.push(makeColorHalfStrength(propColor));
    }

    decide2DCraftParameters();

    this.resize = function (width, height) {
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        armLength = 0.5 * height;

        if (numMotors >= 6) {
            bladeRadius = armLength * 0.4;
        } else {
            bladeRadius = armLength * 0.6;
        }
    };

    // Assume we're to fill the entire canvas until we're told otherwise by .resize()
    this.resize(canvas.width, canvas.height);
}
