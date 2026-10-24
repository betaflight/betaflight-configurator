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

import { formatTime, roundRect } from "./tools";
import type { UserSettings } from "./user_settings_data";

/** Lap times in seconds, from the bookmarks; null until the first refresh() inside a lap. */
interface LapTimes {
    current: number | null;
    last: number | null;
    best: number | null;
    laps: number[];
}

/** Draws the lap times between the workspace's bookmarks, the end time closing the last lap. */
export class LapTimer {
    private readonly lapTime: LapTimes = {
        current: null,
        last: null,
        best: null,
        laps: [],
    };

    drawCanvas(canvas: HTMLCanvasElement, options: Pick<UserSettings, "laptimer">): void {
        const lapTime = this.lapTime;
        // Draw the LapTimes using a canvas
        const ctx = canvas.getContext("2d")!;

        const lineHeight = 14, //px
            DEFAULT_FONT_FACE = "8pt Verdana, Arial, sans-serif",
            fgColor = "rgba(191,191,191,1.0)", // Text and highlights color
            bgColor = `rgba(76,76,76,${Number.parseInt(options.laptimer.transparency, 10) / 100})`, // background color
            left = (canvas.width * Number.parseInt(options.laptimer.left, 10)) / 100,
            top = (canvas.height * Number.parseInt(options.laptimer.top, 10)) / 100,
            margin = 4, // pixels
            rows = 5 + (lapTime.laps.length > 0 ? 1 + lapTime.laps.length : 0);

        ctx.save(); // Store the current canvas configuration

        const firstColumnWidth = ctx.measureText("Current").width,
            secondColumn = ctx.measureText("XX:XX.XXX").width,
            width = margin + firstColumnWidth + margin + secondColumn + margin; // get the size of the box

        // move to the top left of the Lap Timer
        ctx.translate(left, top);

        ctx.lineWidth = 1;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = fgColor;

        //Fill in background
        roundRect(ctx, { x: 0, y: 0, width, height: lineHeight * (rows - 0.5), radius: 7 }); // draw the bounding box with border

        // Add Title, and current values
        let currentRow = 1;
        ctx.textAlign = "left";
        ctx.fillStyle = fgColor;

        // Title
        ctx.font = `italic ${DEFAULT_FONT_FACE}`;
        ctx.fillText("Lap Timer", margin, lineHeight * currentRow);
        // Underline
        ctx.beginPath();
        ctx.strokeStyle = fgColor;
        ctx.moveTo(margin, lineHeight * currentRow + 2 /*px*/);
        ctx.lineTo(width - margin, lineHeight * currentRow + 2 /*px*/);
        ctx.stroke();

        currentRow++;

        // Summary. A time not yet set shows as zero, as formatTime() reads null.
        ctx.font = DEFAULT_FONT_FACE;
        ctx.fillText("Current", margin, lineHeight * currentRow);
        ctx.fillText(
            formatTime(Number(lapTime.current), true),
            margin + firstColumnWidth + margin,
            lineHeight * currentRow++,
        );
        ctx.fillText("Last", margin, lineHeight * currentRow);
        ctx.fillText(
            formatTime(Number(lapTime.last), true),
            margin + firstColumnWidth + margin,
            lineHeight * currentRow++,
        );
        ctx.fillText("Best", margin, lineHeight * currentRow);
        ctx.fillText(
            formatTime(Number(lapTime.best), true),
            margin + firstColumnWidth + margin,
            lineHeight * currentRow++,
        );

        // Laps
        if (lapTime.laps.length > 0) {
            // Title
            ctx.font = `italic ${DEFAULT_FONT_FACE}`;
            ctx.fillText("Laps", margin, lineHeight * currentRow);
            // Underline
            ctx.beginPath();
            ctx.strokeStyle = fgColor;
            ctx.moveTo(margin, lineHeight * currentRow + 2 /*px*/);
            ctx.lineTo(width - margin, lineHeight * currentRow + 2 /*px*/);
            ctx.stroke();
            currentRow++;

            // Each Lap
            ctx.font = DEFAULT_FONT_FACE;
            for (let i = 0; i < lapTime.laps.length; i++) {
                ctx.fillText(`Lap ${i + 1}`, margin, lineHeight * currentRow);
                ctx.fillText(
                    formatTime(lapTime.laps[i], true),
                    margin + firstColumnWidth + margin,
                    lineHeight * currentRow++,
                );
            }
        }

        ctx.restore();
    }

    refresh(
        currentTime: number | null | undefined,
        maxTime: number,
        bookmarkTimes: (number | null | undefined)[] | null | undefined,
    ): void {
        const lapTime = this.lapTime;
        // Update the lapTimeTable with the current information

        if (currentTime != null && bookmarkTimes != null) {
            // A cleared bookmark is null and a slot never set is a hole: neither is a lap boundary.
            const bookmarkTimesSorted = bookmarkTimes.filter((time): time is number => time != null);
            if (bookmarkTimesSorted.length > 0) {
                bookmarkTimesSorted.push(maxTime); // add end time
                bookmarkTimesSorted.sort((a, b) => a - b); // sort on value (rather than default alphabetically)

                lapTime.laps = []; // Clear the array

                for (let i = 0; i < bookmarkTimesSorted.length - 1; i++) {
                    const lapStart = bookmarkTimesSorted[i];
                    if (i > 0 && currentTime >= bookmarkTimesSorted[0]) {
                        // Calculate all the laps so far
                        lapTime.laps.push((lapStart - bookmarkTimesSorted[i - 1]) / 1000);
                    }
                    if (currentTime < bookmarkTimesSorted[i + 1] && currentTime >= lapStart) {
                        // We have found the current lap
                        lapTime.current = (currentTime - lapStart) / 1000;
                        if (i > 0) {
                            lapTime.last = (lapStart - bookmarkTimesSorted[i - 1]) / 1000;
                        } else {
                            lapTime.last = 0; // we are in the first lap, there is no last or best value
                            lapTime.best = 0;
                        }

                        break;
                    } else {
                        // We are before the first bookmark (i.e. the start of the race)
                        lapTime.current = 0;
                        lapTime.last = 0;
                    }
                }

                if (lapTime.laps.length > 0 && currentTime > bookmarkTimesSorted[0]) {
                    lapTime.best = maxTime;
                    for (const lap of lapTime.laps) {
                        if (lap < lapTime.best) {
                            lapTime.best = lap;
                        }
                    }
                }
            }
        }
    }
}
