import { onMounted, onUnmounted, watch } from "vue";

const RulerConfig = {
    meterThickness: 16, // px
    tickMinor: 4, // px
    tickMajor: 8, // px
    vertTickMajor: 12, // px
    labelPadding: 12, // px
    topLabelOffset: 4, // px
    sideLabelOffset: 12, // px
    sideLabelOffsetMajor: 16, // px
    bottomLabelOffset: 12, // px
    edgeGap: 12, // px
    minEdgePadding: 12, // px
    verticalLabelStep: 2,
    bumpTop: 3, // px
    bumpRight: 3, // px
    colorMinor: "#888888",
    colorMajor: "#cccccc",
    colorCenter: "#ffff00",
    font: "10px monospace",
};

function applyRulerMargins(containerRef, enabled) {
    const container = containerRef.value;
    if (!container) {
        return;
    }

    const preview = container.querySelector(".preview");
    if (!preview) {
        return;
    }

    if (enabled) {
        container.style.paddingTop = "26px";
        preview.style.marginRight = "30px";
        preview.style.marginLeft = "30px";
        return;
    }

    container.style.paddingTop = "";
    preview.style.marginRight = "";
    preview.style.marginLeft = "";
}

function colCenterX(i, containerRect, colsInRow) {
    const rect = colsInRow[i].getBoundingClientRect();
    return Math.round(rect.left - containerRect.left + rect.width / 2);
}

function rowCenterY(i, containerRect, rows) {
    const rect = rows[i].getBoundingClientRect();
    return Math.round(rect.top - containerRect.top + rect.height / 2);
}

function getContext(canvas, container) {
    if (!canvas || !container) {
        return null;
    }

    const cw = Math.max(1, Math.floor(container.clientWidth));
    const ch = Math.max(1, Math.floor(container.clientHeight));

    if (canvas.width !== cw) {
        canvas.width = cw;
    }
    if (canvas.height !== ch) {
        canvas.height = ch;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return null;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = RulerConfig.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const rows = container.querySelectorAll(".row");
    if (!rows.length) {
        return null;
    }

    const colsInRow = rows[0].querySelectorAll(".char");
    if (!colsInRow.length) {
        return null;
    }

    const preview = container.querySelector(".preview");
    if (!preview) {
        return null;
    }

    const containerRect = container.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();

    const left = Math.floor(previewRect.left - containerRect.left);
    const top = Math.floor(previewRect.top - containerRect.top);
    const right = Math.ceil(previewRect.right - containerRect.left);
    const bottom = Math.ceil(previewRect.bottom - containerRect.top);

    const charRect = colsInRow[0].getBoundingClientRect();
    const cellW = charRect.width;
    const cellH = charRect.height;
    const cols = colsInRow.length;
    const rowsCount = rows.length;
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rowsCount / 2);
    const signPad = Math.ceil(ctx.measureText("-").width);

    return {
        ctx,
        cw,
        ch,
        containerRect,
        previewRect,
        cols,
        rowsCount,
        cx,
        cy,
        cellW,
        cellH,
        left,
        top,
        right,
        bottom,
        rows,
        colsInRow,
        signPad,
    };
}

function getHorizontalAxisGeometry(axis, params, tick) {
    if (axis === "top") {
        const y0 = Math.max(0, params.top - RulerConfig.edgeGap);
        const y1 = Math.max(0, y0 - tick);
        const labelY = Math.max(RulerConfig.minEdgePadding, y1 - RulerConfig.topLabelOffset);
        return { y0, y1, labelY };
    }

    const y0 = Math.min(params.ch, params.bottom + 1);
    const y1 = Math.min(params.ch, params.bottom + tick);
    const maxLabelY = params.ch - 12;
    const labelY = Math.min(maxLabelY, y1 + RulerConfig.bottomLabelOffset);
    return { y0, y1, labelY };
}

function drawHorizontalTick(ctx, x, y0, y1, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y0 + 0.5);
    ctx.lineTo(x + 0.5, y1 + 0.5);
    ctx.stroke();
}

function drawHorizontalLabel(ctx, axis, offset, x, labelY, isDark) {
    ctx.fillStyle = isDark ? "#fff" : "#000";
    ctx.save();
    ctx.textBaseline = axis === "top" ? "bottom" : "top";
    ctx.fillText(offset.toString(), x, labelY);
    ctx.restore();
}

function drawHorizontalAxis(ctx, params, axis) {
    const centerIndex = Math.floor(params.cols / 2);
    const minOffset = -centerIndex;
    const maxOffset = centerIndex;
    const isDark = document.body.classList.contains("dark-theme");

    for (let i = 0; i < params.cols; i++) {
        const offset = i - centerIndex + (params.cols % 2 === 0 ? 1 : 0);
        const x = colCenterX(i, params.containerRect, params.colsInRow);
        const isCenter = offset === 0;
        const isMajor = offset % 5 === 0 || isCenter;
        const tick = isMajor ? RulerConfig.tickMajor : RulerConfig.tickMinor;
        const axisColor = isCenter
            ? RulerConfig.colorCenter
            : isMajor
                ? RulerConfig.colorMajor
                : RulerConfig.colorMinor;
        const { y0, y1, labelY } = getHorizontalAxisGeometry(axis, params, tick);

        drawHorizontalTick(ctx, x, y0, y1, axisColor);

        if (isMajor && offset >= minOffset && offset <= maxOffset) {
            drawHorizontalLabel(ctx, axis, offset, x, labelY, isDark);
        }
    }
}

function getVerticalAxisGeometry(axis, left, right, cw, tick) {
    if (axis === "left") {
        return {
            x0: left - 1,
            x1: Math.max(0, left - tick),
        };
    }

    return {
        x0: Math.min(cw - 1, right + 1),
        x1: Math.min(cw - 1, right + tick),
    };
}

function getVerticalLabelX(axis, x1, isMajor, extra, textWidth, cw) {
    const offset = isMajor ? RulerConfig.sideLabelOffsetMajor : RulerConfig.sideLabelOffset;
    if (axis === "left") {
        const desired = x1 - offset - extra;
        return Math.max(RulerConfig.minEdgePadding + textWidth, desired);
    }

    const desired = x1 + offset + extra;
    return Math.min(cw - RulerConfig.minEdgePadding - textWidth, desired);
}

function drawVerticalTick(ctx, x0, x1, y, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y + 0.5);
    ctx.lineTo(x1 + 0.5, y + 0.5);
    ctx.stroke();
}

function drawVerticalAxis(ctx, params, axis) {
    ctx.textAlign = axis === "left" ? "right" : "left";
    const isDark = document.body.classList.contains("dark-theme");

    for (let i = 0; i < params.rowsCount; i++) {
        const y = rowCenterY(i, params.containerRect, params.rows);
        const offset = i - params.cy + (params.rowsCount % 2 === 0 ? 1 : 0);
        const isCenter = i === params.cy;
        const isMajor =
            Math.abs(offset) % RulerConfig.verticalLabelStep === 0 || i === 0 || i === params.rowsCount - 1 || isCenter;
        const tick = isMajor ? RulerConfig.vertTickMajor : RulerConfig.tickMinor;
        const axisColor = isCenter
            ? RulerConfig.colorCenter
            : isMajor
                ? RulerConfig.colorMajor
                : RulerConfig.colorMinor;
        const { x0, x1 } = getVerticalAxisGeometry(axis, params.left, params.right, params.cw, tick);

        drawVerticalTick(ctx, x0, x1, y, axisColor);

        if (!isMajor) {
            continue;
        }

        ctx.fillStyle = isDark ? "#fff" : "#000";
        const text = offset.toString();
        const textWidth = ctx.measureText(text).width;
        const extra = text.startsWith("-") ? params.signPad : 0;
        const labelX = getVerticalLabelX(axis, x1, isMajor, extra, textWidth, params.cw);
        const yLabel = Math.max(RulerConfig.minEdgePadding, Math.min(params.ch - RulerConfig.minEdgePadding, y + 0.5));
        ctx.fillText(text, labelX, yLabel);
    }
}

function clearCanvas(canvas) {
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function useOsdRuler(canvasRef, containerRef, showRulers) {
    let resizeTimer = null;

    function drawRulers() {
        if (!showRulers.value) {
            applyRulerMargins(containerRef, false);
            return;
        }

        applyRulerMargins(containerRef, true);

        const params = getContext(canvasRef.value, containerRef.value);
        if (!params) {
            return;
        }

        drawHorizontalAxis(params.ctx, params, "top");
        drawHorizontalAxis(params.ctx, params, "bottom");
        drawVerticalAxis(params.ctx, params, "left");
        drawVerticalAxis(params.ctx, params, "right");
    }

    function onResize() {
        if (!showRulers.value) {
            return;
        }
        if (resizeTimer) {
            cancelAnimationFrame(resizeTimer);
        }
        resizeTimer = requestAnimationFrame(() => {
            drawRulers();
        });
    }

    watch(showRulers, (val) => {
        if (val) {
            requestAnimationFrame(drawRulers);
            return;
        }

        applyRulerMargins(containerRef, false);
        clearCanvas(canvasRef.value);
    });

    onMounted(() => {
        window.addEventListener("resize", onResize);
    });

    onUnmounted(() => {
        window.removeEventListener("resize", onResize);
        if (resizeTimer) {
            cancelAnimationFrame(resizeTimer);
        }
    });

    return {
        drawRulers,
    };
}
