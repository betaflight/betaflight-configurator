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

import { onMounted, onUnmounted, watch, type Ref } from "vue";

type HorizontalAxis = "top" | "bottom";
type VerticalAxis = "left" | "right";

/** The preview's grid as laid out on screen, measured relative to the ruler canvas' container. */
interface RulerLayout {
    ctx: CanvasRenderingContext2D;
    cw: number;
    ch: number;
    containerRect: DOMRect;
    previewRect: DOMRect;
    cols: number;
    rowsCount: number;
    cx: number;
    cy: number;
    cellW: number;
    cellH: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    rows: NodeListOf<Element>;
    colsInRow: NodeListOf<Element>;
    signPad: number;
}

export interface OsdRuler {
    drawRulers: () => void;
}

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

function applyRulerMargins(containerRef: Ref<HTMLElement | null>, enabled: boolean) {
    const container = containerRef.value;
    if (!container) {
        return;
    }

    const preview = container.querySelector<HTMLElement>(".tab-osd-preview");
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

function colCenterX(i: number, containerRect: DOMRect, colsInRow: NodeListOf<Element>): number {
    const rect = colsInRow[i].getBoundingClientRect();
    return Math.round(rect.left - containerRect.left + rect.width / 2);
}

function rowCenterY(i: number, containerRect: DOMRect, rows: NodeListOf<Element>): number {
    const rect = rows[i].getBoundingClientRect();
    return Math.round(rect.top - containerRect.top + rect.height / 2);
}

function getContext(canvas: HTMLCanvasElement | null, container: HTMLElement | null): RulerLayout | null {
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

    const rows = container.querySelectorAll(".tab-osd-row");
    if (!rows.length) {
        return null;
    }

    const colsInRow = rows[0].querySelectorAll(".tab-osd-char");
    if (!colsInRow.length) {
        return null;
    }

    const preview = container.querySelector(".tab-osd-preview");
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

function getHorizontalAxisGeometry(axis: HorizontalAxis, params: RulerLayout, tick: number) {
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

function getAxisColor(isCenter: boolean, isMajor: boolean): string {
    if (isCenter) {
        return RulerConfig.colorCenter;
    }

    if (isMajor) {
        return RulerConfig.colorMajor;
    }

    return RulerConfig.colorMinor;
}

function drawHorizontalTick(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y0 + 0.5);
    ctx.lineTo(x + 0.5, y1 + 0.5);
    ctx.stroke();
}

function drawHorizontalLabel(
    ctx: CanvasRenderingContext2D,
    axis: HorizontalAxis,
    offset: number,
    x: number,
    labelY: number,
    isDark: boolean,
) {
    ctx.fillStyle = isDark ? "#fff" : "#000";
    ctx.save();
    ctx.textBaseline = axis === "top" ? "bottom" : "top";
    ctx.fillText(offset.toString(), x, labelY);
    ctx.restore();
}

function drawHorizontalAxis(ctx: CanvasRenderingContext2D, params: RulerLayout, axis: HorizontalAxis) {
    const centerIndex = Math.floor(params.cols / 2);
    const minOffset = -centerIndex;
    const maxOffset = centerIndex;
    const isDark = document.documentElement.classList.contains("dark");

    for (let i = 0; i < params.cols; i++) {
        const offset = i - centerIndex + (params.cols % 2 === 0 ? 1 : 0);
        const x = colCenterX(i, params.containerRect, params.colsInRow);
        const isCenter = offset === 0;
        const isMajor = offset % 5 === 0 || isCenter;
        const tick = isMajor ? RulerConfig.tickMajor : RulerConfig.tickMinor;
        const axisColor = getAxisColor(isCenter, isMajor);

        const { y0, y1, labelY } = getHorizontalAxisGeometry(axis, params, tick);

        drawHorizontalTick(ctx, x, y0, y1, axisColor);

        if (isMajor && offset >= minOffset && offset <= maxOffset) {
            drawHorizontalLabel(ctx, axis, offset, x, labelY, isDark);
        }
    }
}

function getVerticalAxisGeometry(axis: VerticalAxis, left: number, right: number, cw: number, tick: number) {
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

function getVerticalLabelX(
    axis: VerticalAxis,
    x1: number,
    isMajor: boolean,
    extra: number,
    textWidth: number,
    cw: number,
): number {
    const offset = isMajor ? RulerConfig.sideLabelOffsetMajor : RulerConfig.sideLabelOffset;
    if (axis === "left") {
        const desired = x1 - offset - extra;
        return Math.max(RulerConfig.minEdgePadding + textWidth, desired);
    }

    const desired = x1 + offset + extra;
    return Math.min(cw - RulerConfig.minEdgePadding - textWidth, desired);
}

function drawVerticalTick(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y + 0.5);
    ctx.lineTo(x1 + 0.5, y + 0.5);
    ctx.stroke();
}

function drawVerticalLabel(
    ctx: CanvasRenderingContext2D,
    params: RulerLayout,
    axis: VerticalAxis,
    offset: number,
    x1: number,
    y: number,
    isDark: boolean,
) {
    ctx.fillStyle = isDark ? "#fff" : "#000";
    const text = offset.toString();
    const textWidth = ctx.measureText(text).width;
    const extra = text.startsWith("-") ? params.signPad : 0;
    const labelX = getVerticalLabelX(axis, x1, true, extra, textWidth, params.cw);
    const yLabel = Math.max(RulerConfig.minEdgePadding, Math.min(params.ch - RulerConfig.minEdgePadding, y + 0.5));
    ctx.fillText(text, labelX, yLabel);
}

function drawVerticalAxis(ctx: CanvasRenderingContext2D, params: RulerLayout, axis: VerticalAxis) {
    ctx.textAlign = axis === "left" ? "right" : "left";
    const isDark = document.documentElement.classList.contains("dark");

    for (let i = 0; i < params.rowsCount; i++) {
        const y = rowCenterY(i, params.containerRect, params.rows);
        const offset = i - params.cy + (params.rowsCount % 2 === 0 ? 1 : 0);
        const isCenter = offset === 0;
        const isMajor =
            Math.abs(offset) % RulerConfig.verticalLabelStep === 0 || i === 0 || i === params.rowsCount - 1 || isCenter;
        const tick = isMajor ? RulerConfig.vertTickMajor : RulerConfig.tickMinor;
        const axisColor = getAxisColor(isCenter, isMajor);

        const { x0, x1 } = getVerticalAxisGeometry(axis, params.left, params.right, params.cw, tick);

        drawVerticalTick(ctx, x0, x1, y, axisColor);

        if (isMajor) {
            drawVerticalLabel(ctx, params, axis, offset, x1, y, isDark);
        }
    }
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function useOsdRuler(
    canvasRef: Ref<HTMLCanvasElement | null>,
    containerRef: Ref<HTMLElement | null>,
    showRulers: Readonly<Ref<boolean>>,
): OsdRuler {
    let resizeTimer: number | null = null;

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
        if (showRulers.value) {
            requestAnimationFrame(drawRulers);
        }
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
