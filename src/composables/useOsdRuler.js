import { onMounted, onUnmounted, watch } from 'vue'

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

export function useOsdRuler(canvasRef, containerRef, showRulers) {
    let resizeTimer = null

    function getContext(canvas, container) {
        if (!canvas || !container) return null

        const cw = Math.max(1, Math.floor(container.clientWidth))
        const ch = Math.max(1, Math.floor(container.clientHeight))
        
        if (canvas.width !== cw) canvas.width = cw
        if (canvas.height !== ch) canvas.height = ch

        const ctx = canvas.getContext("2d")
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.font = RulerConfig.font
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        // Find rows and chars within the container
        const rows = container.querySelectorAll(".row")
        if (!rows.length) return null

        // We assume valid grid structure from useOsdPreview
        const colsInRow = rows[0].querySelectorAll(".char")
        if (!colsInRow.length) return null

        // The preview element is the inner div
        const preview = container.querySelector(".preview")
        if (!preview) return null

        const containerRect = container.getBoundingClientRect()
        const previewRect = preview.getBoundingClientRect()
        
        const left = Math.floor(previewRect.left - containerRect.left)
        const top = Math.floor(previewRect.top - containerRect.top)
        const right = Math.ceil(previewRect.right - containerRect.left)
        const bottom = Math.ceil(previewRect.bottom - containerRect.top)
        
        const charRect = colsInRow[0].getBoundingClientRect()
        const cellW = charRect.width
        const cellH = charRect.height
        const cols = colsInRow.length
        const rowsCount = rows.length
        
        const cx = Math.floor(cols / 2)
        const cy = Math.floor(rowsCount / 2)
        const signPad = Math.ceil(ctx.measureText("-").width)

        return {
            ctx, cw, ch,
            containerRect, previewRect,
            cols, rowsCount,
            cx, cy,
            cellW, cellH,
            left, top, right, bottom,
            rows, colsInRow,
            signPad
        }
    }

    function colCenterX(i, containerRect, colsInRow) {
        const rect = colsInRow[i].getBoundingClientRect()
        return Math.round(rect.left - containerRect.left + rect.width / 2)
    }

    function rowCenterY(i, containerRect, rows) {
        const rect = rows[i].getBoundingClientRect()
        return Math.round(rect.top - containerRect.top + rect.height / 2)
    }

    function drawHorizontalAxis(ctx, params, axis) {
         const { cols, containerRect, colsInRow } = params
         const config = RulerConfig
         let centerIndex = Math.floor(cols / 2)
         let minOffset = -centerIndex
         let maxOffset = centerIndex
         const isDark = document.body.classList.contains("dark-theme")

         for (let i = 0; i < cols; i++) {
             let offset = i - centerIndex + (cols % 2 === 0 ? 1 : 0)
             const x = colCenterX(i, containerRect, colsInRow)
             const isCenter = offset === 0
             const isMajor = offset % 5 === 0 || isCenter
             const majorColor = isMajor ? config.colorMajor : config.colorMinor
             const tick = isMajor ? config.tickMajor : config.tickMinor
             
             ctx.strokeStyle = isCenter ? config.colorCenter : majorColor
             ctx.lineWidth = 1
             ctx.beginPath()
             
             let y0, y1, labelY
             if (axis === "top") {
                 y0 = Math.max(0, params.top - config.edgeGap)
                 y1 = Math.max(0, y0 - tick)
                 labelY = Math.max(config.minEdgePadding, y1 - config.topLabelOffset)
             } else {
                 y0 = Math.min(params.ch, params.bottom + 1)
                 y1 = Math.min(params.ch, params.bottom + tick)
                 const maxLabelY = params.ch - 12
                 labelY = Math.min(maxLabelY, y1 + config.bottomLabelOffset)
             }
             
             ctx.moveTo(x + 0.5, y0 + 0.5)
             ctx.lineTo(x + 0.5, y1 + 0.5)
             ctx.stroke()
             
             if (isMajor && offset >= minOffset && offset <= maxOffset) {
                 ctx.fillStyle = isDark ? "#fff" : "#000"
                 ctx.save()
                 ctx.textBaseline = axis === "top" ? "bottom" : "top"
                 ctx.fillText(offset.toString(), x, labelY)
                 ctx.restore()
             }
         }
    }

    function drawVerticalAxis(ctx, params, axis) {
        const { rowsCount, cy, left, right, ch, cw, signPad, rows, containerRect } = params
        const config = RulerConfig
        ctx.textAlign = axis === "left" ? "right" : "left"
        const isDark = document.body.classList.contains("dark-theme")
        
        for (let i = 0; i < rowsCount; i++) {
            const y = rowCenterY(i, containerRect, rows)
            const offset = i - cy + (rowsCount % 2 === 0 ? 1 : 0)
            const isCenter = i === cy
            const isMajor = Math.abs(offset) % config.verticalLabelStep === 0 || i === 0 || i === rowsCount - 1 || isCenter
            const majorColor = isMajor ? config.colorMajor : config.colorMinor
            const tick = isMajor ? config.vertTickMajor : config.tickMinor
            
            ctx.strokeStyle = isCenter ? config.colorCenter : majorColor
            ctx.lineWidth = 1
            ctx.beginPath()
            
            let x0, x1, labelX
            if (axis === "left") {
                x0 = left - 1
                x1 = Math.max(0, left - tick)
            } else {
                x0 = Math.min(cw - 1, right + 1)
                x1 = Math.min(cw - 1, right + tick)
            }
            
            ctx.moveTo(x0 + 0.5, y + 0.5)
            ctx.lineTo(x1 + 0.5, y + 0.5)
            ctx.stroke()
            
            if (isMajor) {
                ctx.fillStyle = isDark ? "#fff" : "#000"
                const text = offset.toString()
                const textWidth = ctx.measureText(text).width
                const extra = text.startsWith("-") ? signPad : 0
                
                if (axis === "left") {
                    const desired = x1 - (isMajor ? config.sideLabelOffsetMajor : config.sideLabelOffset) - extra
                    labelX = Math.max(config.minEdgePadding + textWidth, desired)
                } else {
                    const desired = x1 + (isMajor ? config.sideLabelOffsetMajor : config.sideLabelOffset) + extra
                    labelX = Math.min(cw - config.minEdgePadding - textWidth, desired)
                }
                
                const yLabel = Math.max(config.minEdgePadding, Math.min(ch - config.minEdgePadding, y + 0.5))
                ctx.fillText(text, labelX, yLabel)
            }
        }
    }

    function drawRulers() {
        if (!showRulers.value) return
        
        const canvas = canvasRef.value
        const container = containerRef.value
        
        const params = getContext(canvas, container)
        if (!params) return
        
        drawHorizontalAxis(params.ctx, params, "top")
        drawHorizontalAxis(params.ctx, params, "bottom")
        drawVerticalAxis(params.ctx, params, "left")
        drawVerticalAxis(params.ctx, params, "right")
    }

    function onResize() {
        if (!showRulers.value) return
        if (resizeTimer) cancelAnimationFrame(resizeTimer)
        resizeTimer = requestAnimationFrame(() => {
            drawRulers()
        })
    }

    // Watchers
    watch(showRulers, (val) => {
        if (val) {
            requestAnimationFrame(drawRulers)
        } else {
            const canvas = canvasRef.value
            if (canvas) {
                const ctx = canvas.getContext("2d")
                ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
        }
    })

    onMounted(() => {
        window.addEventListener('resize', onResize)
    })

    onUnmounted(() => {
        window.removeEventListener('resize', onResize)
        if (resizeTimer) cancelAnimationFrame(resizeTimer)
    })

    return {
        drawRulers
    }
}
