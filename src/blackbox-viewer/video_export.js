import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    StreamTarget,
    CanvasSource,
    getFirstEncodableVideoCodec,
    QUALITY_MEDIUM,
} from "mediabunny";

import FileSystem from "@/js/FileSystem.js";
import { isAndroid, isTauriDesktop } from "@/js/utils/checkCompatibility.js";
import { ThemeColors } from "./theme_colors.js";
import { getGraphState, invalidateGraph, setExportInProgress, setGraphState } from "./playback_controls.js";
import { GRAPH_STATE_PAUSED } from "./stores/playback.js";

const MICROSECONDS_PER_SECOND = 1e6;
const CODEC_PROBE_ORDER = ["avc", "vp9", "vp8", "av1"];
const CODEC_CONTAINERS = {
    avc: { container: "mp4", extension: "mp4", description: "MP4 video" },
    hevc: { container: "mp4", extension: "mp4", description: "MP4 video" },
    vp9: { container: "webm", extension: "webm", description: "WebM video" },
    vp8: { container: "webm", extension: "webm", description: "WebM video" },
    av1: { container: "webm", extension: "webm", description: "WebM video" },
};
const ESTIMATED_BITS_PER_PIXEL_PER_FRAME = 0.12;
const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
const ANDROID_CHUNK_SIZE = 256 * 1024;
const YIELD_BUDGET_MS = 12;
const HIDDEN_YIELD_BUDGET_MS = 250;

const probeCache = new Map();
let activeExport = null;

function saveMode() {
    return typeof globalThis.showSaveFilePicker === "function" || isAndroid() || isTauriDesktop()
        ? "stream"
        : "buffered";
}

function normalizeBound(value, fallback) {
    return value === false || value == null ? fallback() : value;
}

function exportRange({ inTime, outTime, getMinTime, getMaxTime }) {
    return {
        start: normalizeBound(inTime, typeof getMinTime === "function" ? getMinTime : () => 0),
        end: normalizeBound(outTime, typeof getMaxTime === "function" ? getMaxTime : () => 0),
    };
}

function sizeEnabled(settings) {
    return Number.parseInt(settings?.size, 10) > 0;
}

function canvasPosition(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function evictFailedProbe(cacheKey, pending) {
    pending.then(
        (result) => {
            if (!result?.canEncode && probeCache.get(cacheKey) === pending) {
                probeCache.delete(cacheKey);
            }
        },
        () => {
            if (probeCache.get(cacheKey) === pending) {
                probeCache.delete(cacheKey);
            }
        },
    );
}

/** Check encoder and save capabilities, cached per output resolution. */
export async function probeVideoExport({ width, height } = {}) {
    const cacheKey = `${width || 0}x${height || 0}`;
    if (probeCache.has(cacheKey)) {
        return probeCache.get(cacheKey);
    }

    const pending = (async () => {
        if (typeof globalThis.VideoEncoder !== "function") {
            return {
                canEncode: false,
                reason: "This browser cannot encode video (WebCodecs unavailable)",
            };
        }

        let codec;
        try {
            codec = await getFirstEncodableVideoCodec(
                CODEC_PROBE_ORDER,
                width && height ? { width, height, quality: QUALITY_MEDIUM } : { quality: QUALITY_MEDIUM },
            );
        } catch (error) {
            return {
                canEncode: false,
                reason: `Video codec detection failed: ${error?.message ?? String(error)}`,
            };
        }
        if (!codec) {
            return {
                canEncode: false,
                reason: "No supported video codec found — on Linux, install the GStreamer H.264 or VP9 plugins",
            };
        }

        const format = CODEC_CONTAINERS[codec];
        if (!format) {
            return { canEncode: false, reason: `Unsupported video codec returned by the encoder: ${codec}` };
        }

        return {
            canEncode: true,
            codec,
            ...format,
            saveMode: saveMode(),
            androidBridge: isAndroid(),
        };
    })();

    probeCache.set(cacheKey, pending);
    evictFailedProbe(cacheKey, pending);
    return pending;
}

/** Frames in the marked range at the selected framerate. */
export function estimateFrameCount({ inTime, outTime, frameRate, getMinTime, getMaxTime }) {
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
        return 0;
    }
    const { start, end } = exportRange({ inTime, outTime, getMinTime, getMaxTime });
    const durationMicros = Math.max(0, end - start);
    return Math.round(durationMicros / (MICROSECONDS_PER_SECOND / frameRate));
}

/** Rough output size shown before a buffered export starts. */
export function estimateOutputBytes({ frameCount, width, height, codec }) {
    if (!frameCount || frameCount <= 0 || !width || !height) {
        return 0;
    }
    const codecFactor = codec === "vp8" || codec === "vp9" ? 1.6 : 1;
    return Math.ceil((frameCount * width * height * ESTIMATED_BITS_PER_PIXEL_PER_FRAME * codecFactor) / 8);
}

/** Chunk size tuned to avoid the Android hex-bridge allocation spike documented in #5396. */
export function videoExportChunkSize(android = isAndroid()) {
    return android ? ANDROID_CHUNK_SIZE : DEFAULT_CHUNK_SIZE;
}

/**
 * Adapt an already-open FileSystem writable to mediabunny's positioned stream contract.
 * The selected container is append-only, so any non-sequential write is a hard error.
 */
export function createFileSystemTarget(writableToken, options = {}) {
    const fileSystem = options.fileSystem ?? FileSystem;
    const chunkSize = options.chunkSize ?? videoExportChunkSize();
    let bytesWritten = 0;
    let nextPosition = 0;
    let closePromise = null;

    const closeFile = () => {
        closePromise ??= Promise.resolve(fileSystem.closeFile(writableToken));
        return closePromise;
    };

    const writable = new WritableStream({
        async write(chunk) {
            if (chunk?.type !== "write" || !(chunk.data instanceof Uint8Array)) {
                throw new TypeError("Video export received an invalid muxer write");
            }
            if (chunk.position !== nextPosition) {
                throw new Error(
                    `Non-sequential write at offset ${chunk.position} (expected ${nextPosition}); ` +
                        "the export sink is append-only",
                );
            }

            const data = new Blob([chunk.data]);
            await fileSystem.writeChunck(writableToken, data);
            nextPosition += chunk.data.byteLength;
            bytesWritten += data.size;
        },
        close: closeFile,
        abort: closeFile,
    });

    const target = new StreamTarget(writable, { chunked: true, chunkSize });
    target.exportWritable = writable;
    target.bytesWritten = () => bytesWritten;
    target.closeFile = closeFile;
    return target;
}

/** Open a picked descriptor before adapting its production writable token. */
export async function openFileSystemTarget(file, options = {}) {
    const fileSystem = options.fileSystem ?? FileSystem;
    const writableToken = await fileSystem.openFile(file);
    return createFileSystemTarget(writableToken, { ...options, fileSystem });
}

/** Create a mediabunny source that rejects unexpected canvas size changes. */
export function createCanvasSource(canvas, codec) {
    return new CanvasSource(canvas, {
        codec,
        quality: QUALITY_MEDIUM,
        keyFrameInterval: 2,
        sizeChangeBehavior: "deny",
    });
}

/** Composite the live grapher canvases into the private encoder canvas. */
export function compositeVideoFrame({
    canvas,
    canvasRefs,
    userSettings,
    includeSticks,
    includeCraft,
    includeAnalyser,
    analyserLayout,
}) {
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("A 2D canvas is required to export video");
    }

    context.fillStyle = ThemeColors.getGraphBackground();
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(canvasRefs.canvas, 0, 0);

    if (includeSticks && sizeEnabled(userSettings?.sticks)) {
        context.drawImage(
            canvasRefs.stickCanvas,
            canvasPosition(canvasRefs.stickCanvas.style.left),
            canvasPosition(canvasRefs.stickCanvas.style.top),
        );
    }
    if (includeCraft && sizeEnabled(userSettings?.craft)) {
        context.drawImage(
            canvasRefs.craftCanvas,
            canvasPosition(canvasRefs.craftCanvas.style.left),
            canvasPosition(canvasRefs.craftCanvas.style.top),
        );
    }
    if (includeAnalyser && sizeEnabled(userSettings?.analyser)) {
        context.drawImage(canvasRefs.analyserCanvas, analyserLayout?.left ?? 0, analyserLayout?.top ?? 0);
    }
}

/** Replace a log extension with the selected video container extension. */
export function suggestedName(logName, extension) {
    const base =
        typeof logName === "string" && logName.includes(".")
            ? logName.slice(0, logName.lastIndexOf("."))
            : String(logName || "blackbox");
    return `${base}.${extension}`;
}

/** Ask the active loop to stop at its next frame boundary. Safe to call repeatedly. */
export function cancelActiveVideoExport() {
    if (activeExport) {
        activeExport.cancelled = true;
    }
}

function validateVideoExportOptions(options) {
    if (activeExport) {
        throw new Error("A video export is already running");
    }
    if (!options.graph || !options.canvasRefs?.canvas || !options.file || !options.log) {
        throw new Error("The blackbox viewer is not ready to export video");
    }
}

async function buildVideoExportPlan(options) {
    const probe = await probeVideoExport({ width: options.width, height: options.height });
    if (!probe.canEncode) {
        throw new Error(probe.reason);
    }

    const { start, end } = exportRange({
        inTime: options.inTime,
        outTime: options.outTime,
        getMinTime: () => options.log.getMinTime(),
        getMaxTime: () => options.log.getMaxTime(),
    });
    const totalFrames = estimateFrameCount({ inTime: start, outTime: end, frameRate: options.frameRate });
    if (totalFrames <= 0) {
        throw new Error("The selected video range contains no frames");
    }

    return { probe, start, totalFrames };
}

async function borrowExportGrapher(options, start, viewerState) {
    viewerState.graphState = getGraphState();
    viewerState.borrowed = true;
    setExportInProgress(true);
    setGraphState(GRAPH_STATE_PAUSED);

    options.canvas.width = options.width;
    options.canvas.height = options.height;
    options.graph.setDrawInOutRegion?.(false);
    options.graph.resize(options.width, options.height);

    if (options.includeAnalyser) {
        options.onPhase?.("preparing");
        options.graph.render(start);
        await yieldToBrowser();
    }
}

function createVideoOutput({ options, target, probe }) {
    const format =
        probe.container === "mp4"
            ? new Mp4OutputFormat({ fastStart: "fragmented" })
            : new WebMOutputFormat({ appendOnly: true });
    const output = new Output({ target, format });
    const source = createCanvasSource(options.canvas, probe.codec);
    output.addVideoTrack(source, { frameRate: options.frameRate });
    return { output, source };
}

async function startVideoOutput(options, output) {
    await output.start();
    options.onPhase?.("rendering");
}

function reportVideoExportProgress({ options, target, frame, totalFrames, smoothedFrameMs }) {
    options.onProgress?.({
        frame: frame + 1,
        totalFrames,
        bytesWritten: target.bytesWritten(),
        etaSecs: ((totalFrames - frame - 1) * smoothedFrameMs) / 1000,
    });
}

async function renderVideoFrames({ options, output, source, target, exportState, start, totalFrames }) {
    const frameDurationMicros = MICROSECONDS_PER_SECOND / options.frameRate;
    let lastFrameAt = performance.now();
    let lastYieldAt = lastFrameAt;
    let smoothedFrameMs = 0;

    for (let frame = 0; frame < totalFrames; frame += 1) {
        if (exportState.cancelled || options.shouldCancel?.()) {
            await output.cancel();
            return { frames: frame, bytes: target.bytesWritten(), cancelled: true };
        }

        options.graph.render(start + frame * frameDurationMicros);
        compositeVideoFrame({
            canvas: options.canvas,
            canvasRefs: options.canvasRefs,
            userSettings: options.userSettings,
            includeSticks: options.includeSticks,
            includeCraft: options.includeCraft,
            includeAnalyser: options.includeAnalyser,
            analyserLayout: options.getAnalyserLayout?.(),
        });
        await source.add(frame / options.frameRate, 1 / options.frameRate);

        const now = performance.now();
        const frameMs = Math.max(0.1, now - lastFrameAt);
        smoothedFrameMs = smoothedFrameMs ? smoothedFrameMs * 0.8 + frameMs * 0.2 : frameMs;
        lastFrameAt = now;
        reportVideoExportProgress({ options, target, frame, totalFrames, smoothedFrameMs });

        const budget = typeof document !== "undefined" && document.hidden ? HIDDEN_YIELD_BUDGET_MS : YIELD_BUDGET_MS;
        if (now - lastYieldAt >= budget) {
            await yieldToBrowser();
            lastYieldAt = performance.now();
        }
    }

    await output.finalize();
    return { frames: totalFrames, bytes: target.bytesWritten(), cancelled: false };
}

async function cancelFailedVideoOutput(output) {
    if (!output || output.state === "canceled" || output.state === "finalized") {
        return;
    }
    try {
        await output.cancel();
    } catch {
        // The original error remains the useful failure to report.
    }
}

async function closeAndRestoreVideoExport({ options, target, exportState, viewerState }) {
    try {
        await target?.closeFile();
    } finally {
        if (viewerState.borrowed) {
            setExportInProgress(false);
            try {
                options.graph.setDrawInOutRegion?.(true);
                options.restoreCanvasSize?.();
                setGraphState(viewerState.graphState);
                (options.invalidateGraph ?? invalidateGraph)?.();
            } catch {
                // The tab may already have torn down its graph and canvases.
            }
        }
        if (activeExport === exportState) {
            activeExport = null;
        }
    }
}

/**
 * Borrow the live grapher, render the selected range, and stream the encoded file.
 * The writable and viewer state are restored on success, cancellation, and failure.
 */
export async function runVideoExport(options) {
    validateVideoExportOptions(options);
    const exportState = { cancelled: false };
    activeExport = exportState;

    let target = null;
    let output = null;
    const viewerState = { borrowed: false, graphState: GRAPH_STATE_PAUSED };
    try {
        const { probe, start, totalFrames } = await buildVideoExportPlan(options);
        const fileSystem = options.fileSystem ?? FileSystem;
        target = await openFileSystemTarget(options.file, { fileSystem });

        await borrowExportGrapher(options, start, viewerState);
        const started = createVideoOutput({ options, target, probe });
        output = started.output;
        await startVideoOutput(options, output);
        return await renderVideoFrames({ options, output, source: started.source, target, exportState, start, totalFrames });
    } catch (error) {
        await cancelFailedVideoOutput(output);
        throw error;
    } finally {
        await closeAndRestoreVideoExport({ options, target, exportState, viewerState });
    }
}
