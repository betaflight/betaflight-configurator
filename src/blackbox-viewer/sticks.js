import { FlightLogParser } from "./flightlog_parser";
import { FlightLogFieldPresenter } from "./flightlog_fields_presenter";
import { ExpoCurve } from "./expo";
import { roundRect } from "./tools";
import { useSettingsStore } from "./stores/settings.js";

export function FlightLogSticks(flightLog, rcCommandFields, canvas) {
    const { userSettings } = useSettingsStore();
    const // inefficient; copied from grapher.js. Font could be a global?

        DEFAULT_FONT_FACE = "Verdana, Arial, sans-serif",
        STICK_MODE_1 = 1,
        STICK_MODE_2 = 2,
        STICK_MODE_3 = 3,
        STICK_MODE_4 = 4,
        WHITE = "white",
        // How far the center of the command sticks are from the top of the canvas, as a portion of height
        //COMMAND_STICK_POSITION_Y_PROPORTION =  parseInt(userSettings.sticks.top) / 100.0 || 0.2,

        drawingParams = {
            drawLabels: true,
            stickSpacing: 0, // Padding between sticks
            fontSizeValueLabel: 8,
            stickSurroundRadius: 0,
        };

    const canvasContext = canvas.getContext("2d"),
        sysConfig = flightLog.getSysConfig(),
        pitchStickCurve = new ExpoCurve(0, 0.7, (500 * (sysConfig.rcRate ? sysConfig.rcRate : 100)) / 100, 1, 10);

    this.resize = function (width, height) {
        // Resize canvas if size changed
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        // Calculated size of each number/letter
        drawingParams.fontSizeValueLabel = Math.max(8, canvas.height / 15);

        // Padding of the sticks. It is a 10% of canvas with a maximum of 16
        drawingParams.stickSpacing = Math.min(height / 10, width / 10, 16);

        // Use that plus the inter-stick spacing that has been determined already to decide how big each stick should be:
        drawingParams.stickSurroundRadius = Math.min(
            width / 4 - drawingParams.stickSpacing,
            height / 2 - drawingParams.stickSpacing - drawingParams.fontSizeValueLabel,
        );

        // Decide if to show the labels
        // The length of the 2 label texts are roughly 80% of the fontsize times the number of letters.
        const labelLength = userSettings.stickUnits ? 7 : 4;
        const minWidthForLabels =
            drawingParams.stickSurroundRadius * 4 +
            drawingParams.stickSpacing * 2 +
            0.8 * labelLength * drawingParams.fontSizeValueLabel * 2;
        drawingParams.drawLabels = width > minWidthForLabels;
    };

    this.render = function (centerFrame, chunks, startFrameIndex, windowCenterTime) {
        if (userSettings.eraseBackground) {
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        }

        const yawStickMax = 500,
            stickColor = "rgba(255,102,102,1.0)",
            stickAreaColor = "rgba(76,76,76,0.2)",
            crosshairColor = "rgba(191,191,191,0.5)";

        const stickPositions = [],
            stickLabel = [];

        canvasContext.save();

        // Get the stick values
        getStickValues(centerFrame, stickPositions, stickLabel, {
            stickSurroundRadius: drawingParams.stickSurroundRadius,
            yawStickMax: yawStickMax,
        });

        const stickPositionsTrail = [];
        if (userSettings.stickTrails) {
            // Get the stick trail data
            if (chunks && startFrameIndex) {
                // we have the data for the stick trails

                //We may start partway through the first chunk:
                let frameIndex = startFrameIndex;
                stickLoop: for (const chunk of chunks) {
                    for (; frameIndex < chunk.frames.length; frameIndex++) {
                        const frameTime =
                                chunk.frames[frameIndex][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME],
                            frameStickPositions = [];

                        if (frameTime > windowCenterTime - 500000) {
                            // only go back 500ms
                            getStickValues(chunk.frames[frameIndex], frameStickPositions, null, {
                                stickSurroundRadius: drawingParams.stickSurroundRadius,
                                yawStickMax: yawStickMax,
                            });
                            stickPositionsTrail.push(frameStickPositions);
                        }
                        if (frameTime >= windowCenterTime) {
                            break stickLoop; // we only get the trail up to the center line
                        }
                    }
                    frameIndex = 0;
                }
            }
        }

        const radi = drawingParams.stickSurroundRadius;

        // Move origin to center of canvas
        canvasContext.translate(canvas.width / 2, canvas.height / 2);

        // Move origin to center of left stick
        canvasContext.translate(-drawingParams.stickSpacing - radi, 0);

        canvasContext.font = `${drawingParams.fontSizeValueLabel}pt ${DEFAULT_FONT_FACE}`;

        //For each stick
        for (let i = 0; i < 2; i++) {
            //Fill in background
            canvasContext.fillStyle = stickAreaColor;
            roundRect(canvasContext, {
                x: -radi,
                y: -radi,
                width: radi * 2,
                height: radi * 2,
                radius: 10,
                stroke: false,
            });

            //Draw crosshair
            canvasContext.beginPath();
            canvasContext.lineWidth = 1;
            canvasContext.strokeStyle = crosshairColor;

            canvasContext.moveTo(-radi, 0);
            canvasContext.lineTo(radi, 0);

            canvasContext.moveTo(0, -radi);
            canvasContext.lineTo(0, radi);

            canvasContext.stroke();

            if (drawingParams.drawLabels) {
                canvasContext.fillStyle = WHITE;

                //Draw horizontal stick label
                canvasContext.textAlign = "center";
                canvasContext.fillText(
                    stickLabel[i * 2],
                    0,
                    radi + drawingParams.fontSizeValueLabel + drawingParams.stickSpacing,
                );

                //Draw vertical stick label
                canvasContext.textAlign = i === 0 ? "right" : "left";
                canvasContext.fillText(
                    stickLabel[i * 2 + 1],
                    (i === 0 ? -1 : 1) * (radi + drawingParams.stickSpacing),
                    drawingParams.fontSizeValueLabel / 2,
                );

                // put the mode label on the throttle stick
                if (
                    (i === 0 && (userSettings.stickMode === STICK_MODE_2 || userSettings.stickMode === STICK_MODE_4)) ||
                    (i === 1 && (userSettings.stickMode === STICK_MODE_1 || userSettings.stickMode === STICK_MODE_3))
                ) {
                    //Draw stick mode label

                    canvasContext.fillStyle = crosshairColor;

                    canvasContext.textAlign = "center";
                    canvasContext.fillText(
                        `Mode ${userSettings.stickMode}`,
                        0,
                        radi - drawingParams.fontSizeValueLabel / 2,
                    );
                }
            }

            if (userSettings.stickTrails) {
                //Draw circle to represent stick position trail
                for (let j = 0; j < stickPositionsTrail.length; j++) {
                    canvasContext.beginPath();
                    canvasContext.fillStyle = `rgba(255,255,255,${(j / stickPositionsTrail.length) * 0.05})`;
                    canvasContext.arc(
                        stickPositionsTrail[j][i * 2 + 0],
                        stickPositionsTrail[j][i * 2 + 1],
                        Math.abs(radi) / 20,
                        0,
                        2 * Math.PI,
                    );
                    canvasContext.fill();
                }
            }

            //Draw circle to represent stick position
            canvasContext.beginPath();
            canvasContext.fillStyle = stickColor;
            canvasContext.arc(
                stickPositions[i * 2 + 0],
                stickPositions[i * 2 + 1],
                Math.abs(radi) / 7.5,
                0,
                2 * Math.PI,
            );
            canvasContext.fill();

            //Advance to next stick
            canvasContext.translate(radi + drawingParams.stickSpacing + radi, 0);
        }

        canvasContext.restore();
    };

    function getStickValues(frame, stickPositions, stickLabel, config) {
        let stickIndex;
        const rcCommand = [];
        const rcCommandLabels = [];

        const highResolutionScale = flightLog.getSysConfig().blackbox_high_resolution > 0 ? 10 : 1;

        for (stickIndex = 0; stickIndex < 4; stickIndex++) {
            //Check that stick data is present to be drawn:
            if (rcCommandFields[stickIndex] === undefined) {
                return;
            }

            rcCommand[stickIndex] = frame[rcCommandFields[stickIndex]] / highResolutionScale;
            if (stickLabel != null) {
                rcCommandLabels[stickIndex] = `${rcCommand[stickIndex] * (stickIndex === 2 ? -1 : 1)}`; // correct the value for Yaw being inverted
                if (userSettings.stickUnits != null) {
                    if (userSettings.stickUnits) {
                        const currentFlightMode = frame[flightLog.getMainFieldIndexByName("flightModeFlags")];
                        rcCommandLabels[stickIndex] = FlightLogFieldPresenter.decodeFieldToFriendly(
                            flightLog,
                            flightLog.getMainFieldNames()[rcCommandFields[stickIndex]],
                            frame[rcCommandFields[stickIndex]],
                            currentFlightMode,
                        );
                    }
                }
            }
        }

        const yawValue = (userSettings.stickInvertYaw ? 1 : -1) * rcCommand[2];
        // map the stick positions based upon selected stick mode (default is mode 2)

        //Compute the position of the sticks in the range [-1..1] (left stick x, left stick y, right stick x, right stick y)
        switch (userSettings.stickMode) {
            case STICK_MODE_1:
                stickPositions[0] = yawValue / config.yawStickMax; //Yaw
                stickPositions[1] = pitchStickCurve.lookup(-rcCommand[1]); //Pitch
                stickPositions[2] = pitchStickCurve.lookup(rcCommand[0]); //Roll
                stickPositions[3] = (1500 - rcCommand[3]) / 500; //Throttle

                if (stickLabel != null) {
                    stickLabel[0] = rcCommandLabels[2];
                    stickLabel[1] = rcCommandLabels[1];
                    stickLabel[2] = rcCommandLabels[0];
                    stickLabel[3] = rcCommandLabels[3];
                }

                break;
            case STICK_MODE_3:
                stickPositions[0] = pitchStickCurve.lookup(rcCommand[0]); //Roll
                stickPositions[1] = pitchStickCurve.lookup(-rcCommand[1]); //Pitch
                stickPositions[2] = yawValue / config.yawStickMax; //Yaw
                stickPositions[3] = (1500 - rcCommand[3]) / 500; //Throttle

                if (stickLabel != null) {
                    stickLabel[0] = rcCommandLabels[0];
                    stickLabel[1] = rcCommandLabels[1];
                    stickLabel[2] = rcCommandLabels[2];
                    stickLabel[3] = rcCommandLabels[3];
                }

                break;
            case STICK_MODE_4:
                stickPositions[0] = pitchStickCurve.lookup(rcCommand[0]); //Roll
                stickPositions[1] = (1500 - rcCommand[3]) / 500; //Throttle
                stickPositions[2] = yawValue / config.yawStickMax; //Yaw
                stickPositions[3] = pitchStickCurve.lookup(-rcCommand[1]); //Pitch

                if (stickLabel != null) {
                    stickLabel[0] = rcCommandLabels[0];
                    stickLabel[1] = rcCommandLabels[3];
                    stickLabel[2] = rcCommandLabels[2];
                    stickLabel[3] = rcCommandLabels[1];
                }

                break;
            default: // Mode 2
                stickPositions[0] = yawValue / config.yawStickMax; //Yaw
                stickPositions[1] = (1500 - rcCommand[3]) / 500; //Throttle
                stickPositions[2] = pitchStickCurve.lookup(rcCommand[0]); //Roll
                stickPositions[3] = pitchStickCurve.lookup(-rcCommand[1]); //Pitch

                if (stickLabel != null) {
                    stickLabel[0] = rcCommandLabels[2];
                    stickLabel[1] = rcCommandLabels[3];
                    stickLabel[2] = rcCommandLabels[0];
                    stickLabel[3] = rcCommandLabels[1];
                }
        }

        for (stickIndex = 0; stickIndex < 4; stickIndex++) {
            //Clamp to [-1..1]
            stickPositions[stickIndex] = Math.max(-1, Math.min(1, stickPositions[stickIndex]));

            //Scale to our stick size
            stickPositions[stickIndex] *= config.stickSurroundRadius;
        }
    }
}
