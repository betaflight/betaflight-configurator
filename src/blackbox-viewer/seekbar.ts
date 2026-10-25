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

import { ThemeColors } from "./theme_colors";

// Theme-aware color functions
function getBackgroundStyle(): string {
    return ThemeColors.getGraphBackground();
}

function getEventBarStyle(): string {
    return "#8d8"; // Green color works in both themes
}

function getActivityBarStyle(): string {
    return ThemeColors.isDarkTheme() ? "rgba(200,200,255, 0.9)" : "rgba(170,170,255, 0.9)";
}

function getOutsideExportRangeStyle(): string {
    return "rgba(100, 100, 100, 0.5)"; // Dimming overlay works in both themes
}

function getCursorStyle(): string {
    return "rgba(255, 64, 64, 0.75)"; // Red cursor works in both themes
}

function getCursorStyleWindow(): string {
    return "rgba(255, 65, 64, 0.15)"; // Red window overlay works in both themes
}

interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The bar under the graph: the log's activity and events over its whole length, the marked
 * in/out range, and a cursor at the current time that seeks when dragged.
 */
export class SeekBar {
    /** Called with the time under the pointer while the bar is dragged. */
    onSeek: ((time: number) => void) | false = false;

    //Times, NaN until setTimeRange(), as the arithmetic on them was before:
    private min = Number.NaN;
    private max = Number.NaN;
    private current = Number.NaN;
    private currentWindow = 0;
    //Activity to display on bar:
    private activityStrength: ArrayLike<number> = [];
    private activityTime: ArrayLike<number> = [];
    //Whether a special event exists at the given time:
    private hasEvent: ArrayLike<boolean> = [];
    //Expect to be plotting PWM-like data by default. A log without motor outputs gives null, read as 0.
    private activityMin: number | null = 1000;
    private activityMax: number | null = 2000;
    private readonly canvasContext: CanvasRenderingContext2D;
    private readonly background: HTMLCanvasElement = document.createElement("canvas");
    private readonly backgroundContext: CanvasRenderingContext2D;
    private inTime: number | null = null;
    private outTime: number | null = null;
    private backgroundValid = false;
    private dirtyRegion: Region | false = false;
    //Current time cursor:
    private cursorWidth = 1;
    // The bar begins a couple of px inset from the left to allow the cursor to hang over the edge at start&end
    private barInset = this.cursorWidth;
    private cancelMouseDrag: (() => void) | null = null;
    private cancelTouchDrag: (() => void) | null = null;

    constructor(private readonly canvas: HTMLCanvasElement) {
        this.canvasContext = canvas.getContext("2d")!;
        this.backgroundContext = this.background.getContext("2d")!;

        canvas.addEventListener("mousedown", this.onMouseDown);
        canvas.addEventListener("touchstart", this.onTouchStart);

        this.background.width = canvas.width;
        this.background.height = canvas.height;
    }

    private seekToDOMPixel(x: number): void {
        const { canvas } = this;
        const bounding = canvas.getBoundingClientRect();

        // Compensate for canvas being stretched on the page
        x = (x / (bounding.right - bounding.left)) * canvas.width;

        let time = ((x - this.barInset) * (this.max - this.min)) / (canvas.width - 1 - this.barInset * 2) + this.min;

        if (time < this.min) {
            time = this.min;
        }

        if (time > this.max) {
            time = this.max;
        }

        if (this.onSeek) {
            this.onSeek(time);
        }

        this.repaint();
    }

    private invalidateBackground(): void {
        this.backgroundValid = false;
    }

    private getCanvasOffsetLeft(): number {
        return this.canvas.getBoundingClientRect().left + window.scrollX;
    }

    private readonly onMouseMove = (e: MouseEvent): void => {
        if (e.button === 0) {
            this.seekToDOMPixel(e.pageX - this.getCanvasOffsetLeft());
        }
    };

    private readonly onMouseDown = (e: MouseEvent): void => {
        e.preventDefault();

        if (e.button === 0) {
            this.seekToDOMPixel(e.pageX - this.getCanvasOffsetLeft());
            document.body.addEventListener("mousemove", this.onMouseMove);

            const onMouseUp = () => {
                document.body.removeEventListener("mousemove", this.onMouseMove);
                document.body.removeEventListener("mouseup", onMouseUp);
                this.cancelMouseDrag = null;
            };
            this.cancelMouseDrag = onMouseUp;
            document.body.addEventListener("mouseup", onMouseUp);
        }
    };

    private readonly onTouchMove = (e: TouchEvent): void => {
        this.seekToDOMPixel(e.touches[0].pageX - this.getCanvasOffsetLeft());
    };

    private readonly onTouchStart = (e: TouchEvent): void => {
        e.preventDefault();

        this.seekToDOMPixel(e.touches[0].pageX - this.getCanvasOffsetLeft());
        document.body.addEventListener("touchmove", this.onTouchMove);

        const onTouchEnd = () => {
            document.body.removeEventListener("touchmove", this.onTouchMove);
            document.body.removeEventListener("touchend", onTouchEnd);
            document.body.removeEventListener("touchcancel", onTouchEnd);
            this.cancelTouchDrag = null;
        };
        this.cancelTouchDrag = onTouchEnd;
        document.body.addEventListener("touchend", onTouchEnd);
        document.body.addEventListener("touchcancel", onTouchEnd);
    };

    destroy(): void {
        this.canvas.removeEventListener("mousedown", this.onMouseDown);
        this.canvas.removeEventListener("touchstart", this.onTouchStart);
        if (this.cancelMouseDrag) {
            this.cancelMouseDrag();
        }
        if (this.cancelTouchDrag) {
            this.cancelTouchDrag();
        }
    }

    resize(width: number, height: number): void {
        const ratio = globalThis.devicePixelRatio ? globalThis.devicePixelRatio : 1;

        this.canvas.width = width * ratio;
        this.canvas.height = height * ratio;

        this.background.width = width * ratio;
        this.background.height = height * ratio;

        this.cursorWidth = 2.5 * ratio;
        this.barInset = this.cursorWidth;

        this.invalidateBackground();

        this.repaint();
    }

    setActivityRange(min: number | null, max: number | null): void {
        this.activityMin = min;
        this.activityMax = max;

        this.invalidateBackground();
    }

    setTimeRange(newMin: number, newMax: number, newCurrent: number): void {
        this.min = newMin;
        this.max = newMax;
        this.current = newCurrent;

        this.invalidateBackground();
    }

    setActivity(
        newActivityTimes: ArrayLike<number>,
        newActivityStrengths: ArrayLike<number>,
        newHasEvent: ArrayLike<boolean>,
    ): void {
        this.activityTime = newActivityTimes;
        this.activityStrength = newActivityStrengths;
        this.hasEvent = newHasEvent;

        this.invalidateBackground();
    }

    setCurrentTime(newTime: number): void {
        this.current = newTime;
    }

    setWindow(newTime: number): void {
        this.currentWindow = newTime;
    }

    /** One stroke per pixel column, from the activity entry in effect at that column's time. */
    private strokeColumns(pixelTimeStep: number, draw: (x: number, activityIndex: number) => void): void {
        const { activityTime, canvas, barInset } = this;
        let time = this.min;
        let activityIndex = 0;

        for (let x = barInset; x < canvas.width - barInset; x++) {
            //Advance to the right entry in the activity array for this time
            while (activityIndex < activityTime.length && time >= activityTime[activityIndex]) {
                activityIndex++;
            }

            activityIndex--;

            if (activityIndex > 0) {
                draw(x, activityIndex);
            }

            time += pixelTimeStep;
        }
    }

    private rebuildBackground(): void {
        const { backgroundContext, canvas, min, max, barInset } = this;

        backgroundContext.fillStyle = getBackgroundStyle();
        backgroundContext.fillRect(0, 0, canvas.width, canvas.height);

        if (max > min) {
            const pixelTimeStep = (max - min) / (canvas.width - barInset * 2);

            if (this.activityTime.length) {
                //Draw events
                backgroundContext.strokeStyle = getEventBarStyle();
                backgroundContext.beginPath();

                this.strokeColumns(pixelTimeStep, (x, activityIndex) => {
                    if (this.hasEvent[activityIndex]) {
                        backgroundContext.moveTo(x, canvas.height);
                        backgroundContext.lineTo(x, 0);
                    }
                });

                backgroundContext.stroke();

                //Draw activity bars
                backgroundContext.strokeStyle = getActivityBarStyle();
                backgroundContext.beginPath();

                const activityMin = Number(this.activityMin);
                const activityMax = Number(this.activityMax);
                this.strokeColumns(pixelTimeStep, (x, activityIndex) => {
                    const activity =
                        ((this.activityStrength[activityIndex] - activityMin) / (activityMax - activityMin)) *
                        canvas.height;
                    backgroundContext.moveTo(x, canvas.height);
                    backgroundContext.lineTo(x, canvas.height - activity);
                });

                backgroundContext.stroke();
            }

            // Paint in/out region
            if (this.inTime !== null || this.outTime !== null) {
                backgroundContext.fillStyle = getOutsideExportRangeStyle();

                if (this.inTime !== null) {
                    backgroundContext.fillRect(0, 0, (this.inTime - min) / pixelTimeStep + barInset, canvas.height);
                }

                if (this.outTime !== null) {
                    const barStartX = (this.outTime - min) / pixelTimeStep + barInset;

                    backgroundContext.fillRect(barStartX, 0, canvas.width - barStartX, canvas.height);
                }
            }

            this.backgroundValid = true;
        }
    }

    repaint(): void {
        const { canvas, canvasContext, background } = this;
        if (canvas.width === 0 || canvas.height === 0) {
            return;
        }

        if (!this.backgroundValid) {
            this.dirtyRegion = false;
            this.rebuildBackground();
        }

        const dirtyRegion = this.dirtyRegion;
        if (dirtyRegion === false) {
            canvasContext.drawImage(background, 0, 0);
        } else {
            canvasContext.drawImage(
                background,
                dirtyRegion.x,
                dirtyRegion.y,
                dirtyRegion.width,
                dirtyRegion.height,
                dirtyRegion.x,
                dirtyRegion.y,
                dirtyRegion.width,
                dirtyRegion.height,
            );
        }

        //Draw cursor
        const pixelTimeStep = (this.max - this.min) / (canvas.width - this.barInset * 2);
        const cursorX = (this.current - this.min) / pixelTimeStep + this.barInset;
        let cursorWidth = 0;

        if (this.currentWindow !== 0) {
            cursorWidth = this.currentWindow / 2 / pixelTimeStep;
        }

        canvasContext.fillStyle = getCursorStyle();
        if (cursorWidth < this.cursorWidth) {
            cursorWidth = this.cursorWidth;
            canvasContext.fillRect(cursorX - this.cursorWidth, 0, this.cursorWidth * 2, canvas.height);
        } else {
            canvasContext.fillRect(cursorX - this.cursorWidth, 0, this.cursorWidth * 2, canvas.height);

            canvasContext.fillStyle = getCursorStyleWindow(); // paint window
            canvasContext.fillRect(cursorX - cursorWidth, 0, cursorWidth * 2, canvas.height);
        }

        this.dirtyRegion = {
            x: Math.max(Math.floor(cursorX - cursorWidth - 1), 0),
            y: 0,
            width: Math.ceil(cursorWidth * 2 + 2),
            height: canvas.height,
        };
    }

    setInTime(newInTime: number | null): void {
        this.inTime = newInTime;
        this.invalidateBackground();
    }

    setOutTime(newOutTime: number | null): void {
        this.outTime = newOutTime;
        this.invalidateBackground();
    }

    refreshTheme(): void {
        this.invalidateBackground();
        this.repaint();
    }
}
