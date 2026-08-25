import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    StreamTarget,
    CanvasSource,
    getFirstEncodableVideoCodec,
    QUALITY_MEDIUM,
} from "mediabunny";

import { setExportInProgress } from "./playback_controls.js";

// Offscreen video export for the blackbox viewer (design: #5396).
//
// This module owns the capability probe, the frame maths, and the
// append-only FileSystem sink. The render loop that drives them lives in
// runVideoExport(); the dialog only reads stores and calls in here.

const MICROSECONDS_PER_SECOND = 1e6;

// Probe order per design doc 1/5 §4: H.264 first (hardware on every
// WebCodecs implementation that has one), then the free containers.
const CODEC_PROBE_ORDER = ["avc", "vp9", "vp8", "av1"];

const CODEC_CONTAINERS = {
    avc: { container: "mp4", extension: "mp4", description: "MP4 video" },
    hevc: { container: "mp4", extension: "mp4", description: "MP4 video" },
    vp9: { container: "webm", extension: "webm", description: "WebM video" },
    vp8: { container: "webm", extension: "webm", description: "WebM video" },
    av1: { container: "webm", extension: "webm", description: "WebM video" },
};

// Measured constant used by estimateOutputBytes; see the calibration note
// in runVideoExport() — recalibrate after a real export if needed.
const ESTIMATED_BITS_PER_PIXEL_PER_FRAME = 0.12;

const probeCache = new Map();

/**
 * Check whether this environment can encode + save an export.
 *
 * Returns both halves of the capability question: can we encode (WebCodecs
 * with a supported codec) and how will saving behave ("stream" = direct to
 * disk via showSaveFilePicker, "buffered" = whole file held in memory).
 * Results are cached per canvas size because codec negotiation is not free.
 */
export async function probeVideoExport({ width, height } = {}) {
    const cacheKey = `${width || 0}x${height || 0}`;
    if (probeCache.has(cacheKey)) {
        return probeCache.get(cacheKey);
    }

    let result;
    if (typeof globalThis.VideoEncoder !== "function") {
        result = {
            canEncode: false,
            reason: "This browser cannot encode video (WebCodecs unavailable)",
        };
    } else {
        const codec = await getFirstEncodableVideoCodec(
            CODEC_PROBE_ORDER,
            width && height ? { width, height, quality: QUALITY_MEDIUM } : { quality: QUALITY_MEDIUM },
        );
        if (!codec) {
            result = {
                canEncode: false,
                reason: "No supported video codec found — on Linux, install the GStreamer H.264 or VP9 plugins",
            };
        } else {
            const { container, extension, description } = CODEC_CONTAINERS[codec];
            result = {
                canEncode: true,
                codec,
                container,
                extension,
                description,
                saveMode: typeof globalThis.showSaveFilePicker === "function" ? "stream" : "buffered",
            };
        }
    }

    probeCache.set(cacheKey, result);
    return result;
}

/**
 * Frames in the marked range at the chosen framerate. Falsy in/out bounds
 * fall back to the log's own extent so a marker-less range exports whole.
 */
export function estimateFrameCount({ inTime, outTime, frameRate, getMinTime, getMaxTime }) {
    const start = inTime ?? (typeof getMinTime === "function" ? getMinTime() : 0);
    const end = outTime ?? (typeof getMaxTime === "function" ? getMaxTime() : 0);
    const durationMicros = Math.max(0, end - start);
    return Math.round(durationMicros / (MICROSECONDS_PER_SECOND / frameRate));
}

/** Rough output size so buffered-save users can decide before rendering. */
export function estimateOutputBytes({ frameCount, width, height, codec }) {
    if (!frameCount || frameCount <= 0 || !width || !height) {
        return 0;
    }
    // VP8/VP9 have no hardware path in most desktop stacks; their output is
    // measurably larger than H.264 at QUALITY_MEDIUM.
    const codecFactor = codec === "vp8" || codec === "vp9" ? 1.6 : 1;
    return Math.ceil((frameCount * width * height * ESTIMATED_BITS_PER_PIXEL_PER_FRAME * codecFactor) / 8);
}

/**
 * Build the mediabunny output wired to FileSystem's append-only contract.
 *
 * Every chunk is handed to FileSystem.writeChunck as a Blob; a non-sequential
 * position would silently corrupt the file downstream, so it throws here where
 * the cause is visible instead of in the muxer where it is not.
 */
export function createFileSystemTarget(file) {
    let bytesWritten = 0;
    let nextPosition = 0;

    const writable = new WritableStream({
        async write(chunk) {
            const data = chunk instanceof Blob ? chunk : new Blob([chunk.data ?? chunk]);
            await window.FileSystem.writeChunck(file._downloadWritable ?? file.writable, data);
            bytesWritten += data.size;
        },
    });

    const target = new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 });
    // Wrap so byte accounting stays exact even when mediabunny batches writes.
    const originalWrite = target.write.bind(target);
    target.write = async (chunk) => {
        if (chunk.type === "write") {
            if (chunk.position !== nextPosition) {
                throw new Error(
                    `Non-sequential write at offset ${chunk.position} (expected ${nextPosition}); ` +
                        "the export sink is append-only",
                );
            }
            nextPosition += chunk.data.byteLength;
        }
        await originalWrite(chunk);
    };
    target.bytesWritten = () => bytesWritten;
    return target;
}

/** Create the mediabunny Output for the probed codec. */
export function createOutputForCodec(codec) {
    const { container } = CODEC_CONTAINERS[codec];
    const format =
        container === "mp4"
            ? new Mp4OutputFormat({ fastStart: "fragmented" })
            : new WebMOutputFormat({ appendOnly: true });
    return new Output({ target: null, format });
}

/** Build the CanvasSource for the offscreen export canvas. */
export function createCanvasSource(canvas, codec, frameRate) {
    return new CanvasSource(canvas, {
        codec,
        quality: QUALITY_MEDIUM,
        keyFrameInterval: 2,
        // Any size change reaching the encoder means the live grapher escaped
        // its borrow window; fail loudly rather than letterbox silently.
        sizeChangeBehavior: "deny",
        bitrate: undefined,
        frameRate,
    });
}

/** Replace the log's extension with the export container's. */
export function suggestedName(logName, extension) {
    const base =
        typeof logName === "string" && logName.includes(".")
            ? logName.slice(0, logName.lastIndexOf("."))
            : String(logName || "blackbox");
    return `${base}.${extension}`;
}

/**
 * Run the export: borrow the live grapher offscreen, render every frame in
 * the marked range into the encoder, and stream the result to FileSystem.
 *
 * The grapher is borrowed by resizing its backing store to the export
 * resolution (CSS layout keeps the on-screen size), so updateCanvasSize()
 * and animationLoop() must be suppressed by the caller for the duration
 * via setExportInProgress(); both are restored in the finally block here.
 *
 * Options bag (all required unless noted):
 *   - canvas:        offscreen export canvas (width/height set to target)
 *   - graph:         live FlightLogGrapher instance to borrow
 *   - log:           flight log object (has getMinTime/getMaxTime)
 *   - renderFrame:   callback rendering `timeMicros` onto the canvas
 *   - inTime/outTime marker bounds in microseconds (falsy = whole log)
 *   - frameRate, width, height
 *   - file:          FileSystem file descriptor from pickSaveFile
 *   - onProgress:    optional ({ frame, totalFrames, bytesWritten, etaSecs })
 *
 * Returns { frames, bytes }. Cancels cleanly if options.shouldCancel()
 * turns true between frames; the partial file stays on disk and is
 * reported to the user by the dialog.
 */
export async function runVideoExport(options) {
    const { canvas, graph, renderFrame, inTime, outTime, frameRate, width, height, file, onProgress, shouldCancel } =
        options;

    const probe = await probeVideoExport({ width, height });
    if (!probe.canEncode) {
        throw new Error(probe.reason);
    }

    const totalFrames = estimateFrameCount({
        inTime,
        outTime,
        frameRate,
        getMinTime: () => options.log.getMinTime(),
        getMaxTime: () => options.log.getMaxTime(),
    });

    // Borrow window opens: block resize/re-render interference for real.
    setExportInProgress(true);

    let output;
    try {
        canvas.width = width;
        canvas.height = height;

        const target = createFileSystemTarget(file);
        output = new Output({
            target,
            format:
                probe.container === "mp4"
                    ? new Mp4OutputFormat({ fastStart: "fragmented" })
                    : new WebMOutputFormat({ appendOnly: true }),
        });
        const source = createCanvasSource(canvas, probe.codec, frameRate);
        output.addVideoTrack(source, { frameRate });
        await output.start();

        const startMicros = inTime ?? (typeof options.log.getMinTime === "function" ? options.log.getMinTime() : 0);
        const frameDurationMicros = MICROSECONDS_PER_SECOND / frameRate;

        let lastFrameAt = Date.now();
        let smoothedFps = 0;

        for (let frame = 0; frame < totalFrames; frame += 1) {
            if (shouldCancel?.()) {
                await output.cancel();
                return { frames: frame, bytes: target.bytesWritten(), cancelled: true };
            }

            renderFrame(startMicros + frame * frameDurationMicros);
            await source.add(frame / frameRate, 1 / frameRate);

            const now = Date.now();
            const instantFps = 1000 / Math.max(1, now - lastFrameAt);
            smoothedFps = smoothedFps ? smoothedFps * 0.9 + instantFps * 0.1 : instantFps;
            lastFrameAt = now;

            onProgress?.({
                frame: frame + 1,
                totalFrames,
                bytesWritten: target.bytesWritten(),
                etaSecs: (totalFrames - frame - 1) / Math.max(1, smoothedFps),
            });
        }

        await output.finalize();
        return { frames: totalFrames, bytes: target.bytesWritten() };
    } catch (error) {
        // Never finalize a broken muxer; cancel leaves the partial file which
        // the dialog reports as unplayable-but-deletable.
        if (output) {
            try {
                await output.cancel();
            } catch {
                // already torn down; nothing further to do
            }
        }
        throw error;
    } finally {
        // Restore the borrowed grapher on every path.
        try {
            graph.updateCanvasSize();
        } catch {
            // graph may already be gone after tab teardown
        }
        canvas.width = width;
        canvas.height = height;
        setExportInProgress(false);
    }
}
