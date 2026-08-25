import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    StreamTarget,
    CanvasSource,
    getFirstEncodableVideoCodec,
    QUALITY_MEDIUM,
} from "mediabunny";

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
