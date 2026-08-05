import { ThemeColors } from "./theme_colors";

// Theme-aware color functions
function getBackgroundStyle() {
    return ThemeColors.getGraphBackground();
}

function getEventBarStyle() {
    return "#8d8"; // Green color works in both themes
}

function getActivityBarStyle() {
    return ThemeColors.isDarkTheme() ? "rgba(200,200,255, 0.9)" : "rgba(170,170,255, 0.9)";
}

function getOutsideExportRangeStyle() {
    return "rgba(100, 100, 100, 0.5)"; // Dimming overlay works in both themes
}

function getCursorStyle() {
    return "rgba(255, 64, 64, 0.75)"; // Red cursor works in both themes
}

function getCursorStyleWindow() {
    return "rgba(255, 65, 64, 0.15)"; // Red window overlay works in both themes
}

export function SeekBar(canvas) {
    const that = this;
    //Times:
    let min;
    let max;
    let current;
    let currentWindow = 0;
    //Activity to display on bar:
    let activityStrength;
    let activityTime;
    //Whether a special event exists at the given time:
    let hasEvent;
    //Expect to be plotting PWM-like data by default:
    let activityMin = 1000;
    let activityMax = 2000;
    const canvasContext = canvas.getContext("2d");
    const background = document.createElement("canvas");
    const backgroundContext = background.getContext("2d");
    let inTime = false;
    let outTime = false;
    let backgroundValid = false;
    let dirtyRegion = false;
    //Current time cursor:
    let CURSOR_WIDTH = 1;
    // The bar begins a couple of px inset from the left to allow the cursor to hang over the edge at start&end
    let BAR_INSET = CURSOR_WIDTH;

    this.onSeek = false;

    function seekToDOMPixel(x) {
        const bounding = canvas.getBoundingClientRect();
        let time;

        // Compensate for canvas being stretched on the page
        x = (x / (bounding.right - bounding.left)) * canvas.width;

        time = ((x - BAR_INSET) * (max - min)) / (canvas.width - 1 - BAR_INSET * 2) + min;

        if (time < min) {
            time = min;
        }

        if (time > max) {
            time = max;
        }

        if (that.onSeek) {
            that.onSeek(time);
        }

        that.repaint();
    }

    function invalidateBackground() {
        backgroundValid = false;
    }

    function getCanvasOffsetLeft() {
        return canvas.getBoundingClientRect().left + window.scrollX;
    }

    let cancelMouseDrag = null;
    let cancelTouchDrag = null;

    function onMouseMove(e) {
        if (e.button === 0) {
            seekToDOMPixel(e.pageX - getCanvasOffsetLeft());
        }
    }

    function onMouseDown(e) {
        e.preventDefault();

        if (e.button === 0) {
            seekToDOMPixel(e.pageX - getCanvasOffsetLeft());
            document.body.addEventListener("mousemove", onMouseMove);

            function onMouseUp() {
                document.body.removeEventListener("mousemove", onMouseMove);
                document.body.removeEventListener("mouseup", onMouseUp);
                cancelMouseDrag = null;
            }
            cancelMouseDrag = onMouseUp;
            document.body.addEventListener("mouseup", onMouseUp);
        }
    }

    canvas.addEventListener("mousedown", onMouseDown);

    function onTouchMove(e) {
        seekToDOMPixel(e.touches[0].pageX - getCanvasOffsetLeft());
    }

    function onTouchStart(e) {
        e.preventDefault();

        seekToDOMPixel(e.touches[0].pageX - getCanvasOffsetLeft());
        document.body.addEventListener("touchmove", onTouchMove);

        function onTouchEnd() {
            document.body.removeEventListener("touchmove", onTouchMove);
            document.body.removeEventListener("touchend", onTouchEnd);
            document.body.removeEventListener("touchcancel", onTouchEnd);
            cancelTouchDrag = null;
        }
        cancelTouchDrag = onTouchEnd;
        document.body.addEventListener("touchend", onTouchEnd);
        document.body.addEventListener("touchcancel", onTouchEnd);
    }

    canvas.addEventListener("touchstart", onTouchStart);

    this.destroy = function () {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("touchstart", onTouchStart);
        if (cancelMouseDrag) {
            cancelMouseDrag();
        }
        if (cancelTouchDrag) {
            cancelTouchDrag();
        }
    };

    this.resize = function (width, height) {
        const ratio = globalThis.devicePixelRatio ? globalThis.devicePixelRatio : 1;

        canvas.width = width * ratio;
        canvas.height = height * ratio;

        background.width = width * ratio;
        background.height = height * ratio;

        CURSOR_WIDTH = 2.5 * ratio;
        BAR_INSET = CURSOR_WIDTH;

        invalidateBackground();

        that.repaint();
    };

    this.setActivityRange = function (min, max) {
        activityMin = min;
        activityMax = max;

        invalidateBackground();
    };

    this.setTimeRange = function (newMin, newMax, newCurrent) {
        min = newMin;
        max = newMax;
        current = newCurrent;

        invalidateBackground();
    };

    this.setActivity = function (newActivityTimes, newActivityStrengths, newHasEvent) {
        activityTime = newActivityTimes;
        activityStrength = newActivityStrengths;
        hasEvent = newHasEvent;

        invalidateBackground();
    };

    this.setCurrentTime = function (newTime) {
        current = newTime;
    };

    this.setWindow = function (newTime) {
        currentWindow = newTime;
    };

    function rebuildBackground() {
        let x, activityIndex, activity, pixelTimeStep, time;

        backgroundContext.fillStyle = getBackgroundStyle();
        backgroundContext.fillRect(0, 0, canvas.width, canvas.height);

        if (max > min) {
            pixelTimeStep = (max - min) / (canvas.width - BAR_INSET * 2);

            if (activityTime.length) {
                //Draw events
                backgroundContext.strokeStyle = getEventBarStyle();
                backgroundContext.beginPath();

                time = min;
                activityIndex = 0;

                for (x = BAR_INSET; x < canvas.width - BAR_INSET; x++) {
                    //Advance to the right entry in the activity array for this time
                    while (activityIndex < activityTime.length && time >= activityTime[activityIndex]) {
                        activityIndex++;
                    }

                    activityIndex--;

                    if (activityIndex > 0) {
                        if (hasEvent[activityIndex]) {
                            backgroundContext.moveTo(x, canvas.height);
                            backgroundContext.lineTo(x, 0);
                        }
                    }

                    time += pixelTimeStep;
                }

                backgroundContext.stroke();

                //Draw activity bars
                backgroundContext.strokeStyle = getActivityBarStyle();
                backgroundContext.beginPath();

                time = min;
                activityIndex = 0;

                for (x = BAR_INSET; x < canvas.width - BAR_INSET; x++) {
                    //Advance to the right entry in the activity array for this time
                    while (activityIndex < activityTime.length && time >= activityTime[activityIndex]) {
                        activityIndex++;
                    }

                    activityIndex--;

                    if (activityIndex > 0) {
                        activity =
                            ((activityStrength[activityIndex] - activityMin) / (activityMax - activityMin)) *
                            canvas.height;
                        backgroundContext.moveTo(x, canvas.height);
                        backgroundContext.lineTo(x, canvas.height - activity);
                    }

                    time += pixelTimeStep;
                }

                backgroundContext.stroke();
            }

            // Paint in/out region
            if (inTime !== false || outTime !== false) {
                backgroundContext.fillStyle = getOutsideExportRangeStyle();

                if (inTime !== false) {
                    backgroundContext.fillRect(0, 0, (inTime - min) / pixelTimeStep + BAR_INSET, canvas.height);
                }

                if (outTime !== false) {
                    const barStartX = (outTime - min) / pixelTimeStep + BAR_INSET;

                    backgroundContext.fillRect(barStartX, 0, canvas.width - barStartX, canvas.height);
                }
            }

            backgroundValid = true;
        }
    }

    this.repaint = function () {
        if (canvas.width === 0 || canvas.height === 0) {
            return;
        }

        if (!backgroundValid) {
            dirtyRegion = false;
            rebuildBackground();
        }

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
        const pixelTimeStep = (max - min) / (canvas.width - BAR_INSET * 2);
        const cursorX = (current - min) / pixelTimeStep + BAR_INSET;
        let cursorWidth = 0;

        if (currentWindow !== 0) {
            cursorWidth = currentWindow / 2 / pixelTimeStep;
        }

        canvasContext.fillStyle = getCursorStyle();
        if (cursorWidth < CURSOR_WIDTH) {
            cursorWidth = CURSOR_WIDTH;
            canvasContext.fillRect(cursorX - CURSOR_WIDTH, 0, CURSOR_WIDTH * 2, canvas.height);
        } else {
            canvasContext.fillRect(cursorX - CURSOR_WIDTH, 0, CURSOR_WIDTH * 2, canvas.height);

            canvasContext.fillStyle = getCursorStyleWindow(); // paint window
            canvasContext.fillRect(cursorX - cursorWidth, 0, cursorWidth * 2, canvas.height);
        }

        dirtyRegion = {
            x: Math.max(Math.floor(cursorX - cursorWidth - 1), 0),
            y: 0,
            width: Math.ceil(cursorWidth * 2 + 2),
            height: canvas.height,
        };
    };

    this.setInTime = function (newInTime) {
        inTime = newInTime;
        invalidateBackground();
    };

    this.setOutTime = function (newOutTime) {
        outTime = newOutTime;
        invalidateBackground();
    };

    this.refreshTheme = function () {
        invalidateBackground();
        that.repaint();
    };

    background.width = canvas.width;
    background.height = canvas.height;
}
