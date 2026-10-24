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

import { FlightLogParser } from "./flightlog_parser";
import { FlightLogFieldPresenter } from "./flightlog_fields_presenter";
import { ExpoCurve } from "./expo";
import { roundRect } from "./tools";
import { useSettingsStore } from "./stores/settings";
import type { Chunk, FlightLog, LogFrame } from "./flightlog";

const DEFAULT_FONT_FACE = "Verdana, Arial, sans-serif",
    STICK_MODE_1 = 1,
    STICK_MODE_2 = 2,
    STICK_MODE_3 = 3,
    STICK_MODE_4 = 4,
    WHITE = "white",
    YAW_STICK_MAX = 500,
    STICK_COLOR = "rgba(255,102,102,1.0)",
    STICK_AREA_COLOR = "rgba(76,76,76,0.2)",
    CROSSHAIR_COLOR = "rgba(191,191,191,0.5)";

/** Left stick x, left stick y, right stick x, right stick y. */
type StickQuad<T> = T[];

type SticksFlightLog = Pick<FlightLog, "getSysConfig" | "getMainFieldIndexByName" | "getMainFieldNames"> &
    Parameters<typeof FlightLogFieldPresenter.decodeFieldToFriendly>[0];

/** The stick positions and their values, from the RC commands of the log. */
export class FlightLogSticks {
    private readonly userSettings = useSettingsStore().userSettings;
    private readonly canvasContext: CanvasRenderingContext2D;
    private readonly pitchStickCurve: ExpoCurve;
    private readonly drawingParams = {
        drawLabels: true,
        stickSpacing: 0, // Padding between sticks
        fontSizeValueLabel: 8,
        stickSurroundRadius: 0,
    };

    /** @param rcCommandFields The main field index of each RC command, roll, pitch, yaw and throttle. */
    constructor(
        private readonly flightLog: SticksFlightLog,
        private readonly rcCommandFields: number[],
        private readonly canvas: HTMLCanvasElement,
    ) {
        this.canvasContext = canvas.getContext("2d")!;
        const sysConfig = flightLog.getSysConfig();
        this.pitchStickCurve = new ExpoCurve(0, 0.7, (500 * (sysConfig.rcRate ? sysConfig.rcRate : 100)) / 100, 1, 10);
    }

    resize(width: number, height: number): void {
        const { canvas, drawingParams } = this;
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
        const labelLength = this.userSettings.stickUnits ? 7 : 4;
        const minWidthForLabels =
            drawingParams.stickSurroundRadius * 4 +
            drawingParams.stickSpacing * 2 +
            0.8 * labelLength * drawingParams.fontSizeValueLabel * 2;
        drawingParams.drawLabels = width > minWidthForLabels;
    }

    /** The positions of the sticks over the last 500 ms up to the centre of the window. */
    private stickTrail(chunks: Chunk[] | null, startFrameIndex: number, windowCenterTime: number): StickQuad<number>[] {
        const stickPositionsTrail: StickQuad<number>[] = [];
        // Index 0 is a real start: the window begins at the first frame of its first chunk.
        if (chunks) {
            // we have the data for the stick trails

            //We may start partway through the first chunk:
            let frameIndex = startFrameIndex;
            for (const chunk of chunks) {
                for (; frameIndex < chunk.frames.length; frameIndex++) {
                    const frameTime = chunk.frames[frameIndex][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME],
                        frameStickPositions: StickQuad<number> = [];

                    if (frameTime > windowCenterTime - 500000) {
                        // only go back 500ms
                        this.getStickValues(chunk.frames[frameIndex], frameStickPositions, null);
                        stickPositionsTrail.push(frameStickPositions);
                    }
                    if (frameTime >= windowCenterTime) {
                        return stickPositionsTrail; // we only get the trail up to the center line
                    }
                }
                frameIndex = 0;
            }
        }
        return stickPositionsTrail;
    }

    render(centerFrame: LogFrame, chunks: Chunk[] | null, startFrameIndex: number, windowCenterTime: number): void {
        const { canvas, canvasContext, drawingParams, userSettings } = this;
        if (userSettings.eraseBackground) {
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        }

        const stickPositions: StickQuad<number> = [],
            stickLabel: StickQuad<string> = [];

        canvasContext.save();

        // Get the stick values
        this.getStickValues(centerFrame, stickPositions, stickLabel);

        const stickPositionsTrail = userSettings.stickTrails
            ? this.stickTrail(chunks, startFrameIndex, windowCenterTime)
            : [];

        const radi = drawingParams.stickSurroundRadius;

        // Move origin to center of canvas
        canvasContext.translate(canvas.width / 2, canvas.height / 2);

        // Move origin to center of left stick
        canvasContext.translate(-drawingParams.stickSpacing - radi, 0);

        canvasContext.font = `${drawingParams.fontSizeValueLabel}pt ${DEFAULT_FONT_FACE}`;

        //For each stick
        for (let i = 0; i < 2; i++) {
            //Fill in background
            canvasContext.fillStyle = STICK_AREA_COLOR;
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
            canvasContext.strokeStyle = CROSSHAIR_COLOR;

            canvasContext.moveTo(-radi, 0);
            canvasContext.lineTo(radi, 0);

            canvasContext.moveTo(0, -radi);
            canvasContext.lineTo(0, radi);

            canvasContext.stroke();

            if (drawingParams.drawLabels) {
                this.drawLabels(i, stickLabel, radi);
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
            canvasContext.fillStyle = STICK_COLOR;
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
    }

    private drawLabels(i: number, stickLabel: StickQuad<string>, radi: number): void {
        const { canvasContext, drawingParams, userSettings } = this;
        canvasContext.fillStyle = WHITE;

        // A log without the RC commands has no labels, and the text methods draw "undefined".
        //Draw horizontal stick label
        canvasContext.textAlign = "center";
        canvasContext.fillText(
            String(stickLabel[i * 2]),
            0,
            radi + drawingParams.fontSizeValueLabel + drawingParams.stickSpacing,
        );

        //Draw vertical stick label
        canvasContext.textAlign = i === 0 ? "right" : "left";
        canvasContext.fillText(
            String(stickLabel[i * 2 + 1]),
            (i === 0 ? -1 : 1) * (radi + drawingParams.stickSpacing),
            drawingParams.fontSizeValueLabel / 2,
        );

        // put the mode label on the throttle stick
        if (
            (i === 0 && (userSettings.stickMode === STICK_MODE_2 || userSettings.stickMode === STICK_MODE_4)) ||
            (i === 1 && (userSettings.stickMode === STICK_MODE_1 || userSettings.stickMode === STICK_MODE_3))
        ) {
            //Draw stick mode label

            canvasContext.fillStyle = CROSSHAIR_COLOR;

            canvasContext.textAlign = "center";
            canvasContext.fillText(`Mode ${userSettings.stickMode}`, 0, radi - drawingParams.fontSizeValueLabel / 2);
        }
    }

    private getStickValues(
        frame: LogFrame,
        stickPositions: StickQuad<number>,
        stickLabel: StickQuad<string> | null,
    ): void {
        const { flightLog, rcCommandFields, userSettings, pitchStickCurve } = this;
        const rcCommand: number[] = [];
        const rcCommandLabels: string[] = [];

        const highResolutionScale = Number(flightLog.getSysConfig().blackbox_high_resolution) > 0 ? 10 : 1;

        for (let stickIndex = 0; stickIndex < 4; stickIndex++) {
            //Check that stick data is present to be drawn:
            if (rcCommandFields[stickIndex] === undefined) {
                return;
            }

            rcCommand[stickIndex] = Number(frame[rcCommandFields[stickIndex]]) / highResolutionScale;
            if (stickLabel != null) {
                rcCommandLabels[stickIndex] = `${rcCommand[stickIndex] * (stickIndex === 2 ? -1 : 1)}`; // correct the value for Yaw being inverted
                if (userSettings.stickUnits) {
                    const currentFlightMode = frame[flightLog.getMainFieldIndexByName("flightModeFlags")!];
                    rcCommandLabels[stickIndex] = String(
                        FlightLogFieldPresenter.decodeFieldToFriendly(
                            flightLog,
                            flightLog.getMainFieldNames()[rcCommandFields[stickIndex]],
                            frame[rcCommandFields[stickIndex]],
                            currentFlightMode,
                        ),
                    );
                }
            }
        }

        const yawValue = (userSettings.stickInvertYaw ? 1 : -1) * rcCommand[2];
        const yaw = yawValue / YAW_STICK_MAX,
            pitch = pitchStickCurve.lookup(-rcCommand[1]),
            roll = pitchStickCurve.lookup(rcCommand[0]),
            throttle = (1500 - rcCommand[3]) / 500;
        // map the stick positions based upon selected stick mode (default is mode 2)

        //Compute the position of the sticks in the range [-1..1] (left stick x, left stick y, right stick x, right stick y)
        // and which RC command labels each one.
        let positions: StickQuad<number>, labelOrder: StickQuad<number>;
        switch (userSettings.stickMode) {
            case STICK_MODE_1:
                positions = [yaw, pitch, roll, throttle];
                labelOrder = [2, 1, 0, 3];
                break;
            case STICK_MODE_3:
                positions = [roll, pitch, yaw, throttle];
                labelOrder = [0, 1, 2, 3];
                break;
            case STICK_MODE_4:
                positions = [roll, throttle, yaw, pitch];
                labelOrder = [0, 3, 2, 1];
                break;
            default: // Mode 2
                positions = [yaw, throttle, roll, pitch];
                labelOrder = [2, 3, 0, 1];
        }

        for (let stickIndex = 0; stickIndex < 4; stickIndex++) {
            //Clamp to [-1..1], then scale to our stick size
            stickPositions[stickIndex] =
                Math.max(-1, Math.min(1, positions[stickIndex])) * this.drawingParams.stickSurroundRadius;
            if (stickLabel != null) {
                stickLabel[stickIndex] = rcCommandLabels[labelOrder[stickIndex]];
            }
        }
    }
}
