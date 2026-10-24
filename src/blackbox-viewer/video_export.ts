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

import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    StreamTarget,
    CanvasSource,
    getFirstEncodableVideoCodec,
    QUALITY_MEDIUM,
    type StreamTargetChunk,
    type VideoCodec,
} from "mediabunny";

import FileSystem, { type FileWriter, type PickedFile } from "@/js/FileSystem";
import { isAndroid, isTauriDesktop } from "@/js/utils/checkCompatibility";
import { ThemeColors } from "./theme_colors";
import { getGraphState, invalidateGraph, setExportInProgress, setGraphState } from "./playback_controls";
import { GRAPH_STATE_PAUSED } from "./stores/playback";
import type { UserSettings } from "./user_settings_data";

const MICROSECONDS_PER_SECOND = 1e6;
const CODEC_PROBE_ORDER: VideoCodec[] = ["avc", "vp9", "vp8", "av1"];

interface VideoContainer {
    container: "mp4" | "webm";
    extension: string;
    description: string;
}

const CODEC_CONTAINERS: Partial<Record<VideoCodec, VideoContainer>> = {
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

export interface VideoExportProgress {
    frame: number;
    totalFrames: number;
    bytesWritten: number;
    etaSecs: number;
}

export interface VideoExportResult {
    frames: number;
    bytes: number;
    cancelled: boolean;
}

/** What probeVideoExport() reports for one resolution. */
export type VideoExportProbe =
    | { canEncode: false; reason: string }
    | (VideoContainer & {
          canEncode: true;
          codec: VideoCodec;
          saveMode: "stream" | "buffered";
          androidBridge: boolean;
      });

/** The part of FileSystem the export streams through. */
export interface VideoExportFileSystem {
    openFile(file: PickedFile): Promise<FileWriter>;
    writeChunck(writable: FileWriter, data: Blob): Promise<void>;
    closeFile(writable: FileWriter): Promise<void>;
}

export type VideoExportTarget = StreamTarget & {
    exportWritable: WritableStream<StreamTargetChunk>;
    bytesWritten: () => number;
    closeFile: () => Promise<void>;
};

interface VideoExportCanvases {
    canvas: HTMLCanvasElement;
    stickCanvas?: HTMLCanvasElement;
    craftCanvas?: HTMLCanvasElement;
    analyserCanvas?: HTMLCanvasElement;
}

/** Where the analyser sits on the graph canvas. */
interface AnalyserPosition {
    left?: number;
    top?: number;
}

/** The overlays the export draws, each shown when its size is a positive percentage. */
type OverlaySettings = Partial<Record<"sticks" | "craft" | "analyser", { size?: string | number }>>;

export interface VideoExportOptions {
    /** Private encoder canvas. */
    canvas: HTMLCanvasElement;
    canvasRefs: VideoExportCanvases;
    graph: {
        render: (time: number) => void;
        resize: (width: number, height: number) => void;
        setDrawInOutRegion?: (enabled: boolean) => void;
    };
    log: { getMinTime: () => number; getMaxTime: () => number };
    /** Picked FileSystem descriptor. */
    file: PickedFile;
    fileSystem?: VideoExportFileSystem;
    frameRate: number;
    width: number;
    height: number;
    inTime?: number | false | null;
    outTime?: number | false | null;
    userSettings?: OverlaySettings | Pick<UserSettings, "sticks" | "craft" | "analyser">;
    includeSticks?: boolean;
    includeCraft?: boolean;
    includeAnalyser?: boolean;
    getAnalyserLayout?: () => AnalyserPosition;
    restoreCanvasSize?: () => void;
    invalidateGraph?: () => void;
    shouldCancel?: () => boolean;
    onPhase?: (phase: "preparing" | "rendering") => void;
    onProgress?: (progress: VideoExportProgress) => void;
}

interface ExportState {
    cancelled: boolean;
}

/** What the export borrowed from the live viewer, to give back when it ends. */
interface ViewerState {
    borrowed: boolean;
    graphState: number;
}

const probeCache = new Map<string, Promise<VideoExportProbe>>();
let activeExport: ExportState | null = null;

function saveMode(): "stream" | "buffered" {
    return typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function" ||
        isAndroid() ||
        isTauriDesktop()
        ? "stream"
        : "buffered";
}

function normalizeBound(value: number | false | null | undefined, fallback: () => number): number {
    return value === false || value == null ? fallback() : value;
}

interface RangeSource {
    inTime?: number | false | null;
    outTime?: number | false | null;
    getMinTime?: () => number;
    getMaxTime?: () => number;
}

function exportRange({ inTime, outTime, getMinTime, getMaxTime }: RangeSource): { start: number; end: number } {
    return {
        start: normalizeBound(inTime, typeof getMinTime === "function" ? getMinTime : () => 0),
        end: normalizeBound(outTime, typeof getMaxTime === "function" ? getMaxTime : () => 0),
    };
}

function sizeEnabled(settings: { size?: string | number } | undefined): boolean {
    return Number.parseInt(String(settings?.size), 10) > 0;
}

function canvasPosition(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function evictFailedProbe(cacheKey: string, pending: Promise<VideoExportProbe>): void {
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
export async function probeVideoExport({
    width,
    height,
}: { width?: number; height?: number } = {}): Promise<VideoExportProbe> {
    const cacheKey = `${width || 0}x${height || 0}`;
    const cached = probeCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const pending = (async (): Promise<VideoExportProbe> => {
        if (typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !== "function") {
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
                reason: `Video codec detection failed: ${(error as Error | null)?.message ?? String(error)}`,
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
export function estimateFrameCount({
    inTime,
    outTime,
    frameRate,
    getMinTime,
    getMaxTime,
}: RangeSource & { frameRate: number }): number {
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
        return 0;
    }
    const { start, end } = exportRange({ inTime, outTime, getMinTime, getMaxTime });
    const durationMicros = Math.max(0, end - start);
    return Math.round(durationMicros / (MICROSECONDS_PER_SECOND / frameRate));
}

/** Rough output size shown before a buffered export starts. */
export function estimateOutputBytes({
    frameCount,
    width,
    height,
    codec,
}: {
    frameCount: number;
    width: number;
    height: number;
    codec?: string;
}): number {
    if (!frameCount || frameCount <= 0 || !width || !height) {
        return 0;
    }
    const codecFactor = codec === "vp8" || codec === "vp9" ? 1.6 : 1;
    return Math.ceil((frameCount * width * height * ESTIMATED_BITS_PER_PIXEL_PER_FRAME * codecFactor) / 8);
}

/** Chunk size tuned to avoid the Android hex-bridge allocation spike documented in #5396. */
export function videoExportChunkSize(android = isAndroid()): number {
    return android ? ANDROID_CHUNK_SIZE : DEFAULT_CHUNK_SIZE;
}

interface TargetOptions {
    fileSystem?: VideoExportFileSystem;
    chunkSize?: number;
}

/**
 * Adapt an already-open FileSystem writable to mediabunny's positioned stream contract.
 * The selected container is append-only, so any non-sequential write is a hard error.
 */
export function createFileSystemTarget(writableToken: FileWriter, options: TargetOptions = {}): VideoExportTarget {
    const fileSystem = options.fileSystem ?? FileSystem;
    const chunkSize = options.chunkSize ?? videoExportChunkSize();
    let bytesWritten = 0;
    let nextPosition = 0;
    let closePromise: Promise<void> | null = null;

    const closeFile = () => {
        closePromise ??= Promise.resolve(fileSystem.closeFile(writableToken));
        return closePromise;
    };

    const writable = new WritableStream<StreamTargetChunk>({
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

    const target = new StreamTarget(writable, { chunked: true, chunkSize }) as VideoExportTarget;
    target.exportWritable = writable;
    target.bytesWritten = () => bytesWritten;
    target.closeFile = closeFile;
    return target;
}

/** Open a picked descriptor before adapting its production writable token. */
export async function openFileSystemTarget(file: PickedFile, options: TargetOptions = {}): Promise<VideoExportTarget> {
    const fileSystem = options.fileSystem ?? FileSystem;
    const writableToken = await fileSystem.openFile(file);
    return createFileSystemTarget(writableToken, { ...options, fileSystem });
}

/** Create a mediabunny source that rejects unexpected canvas size changes. */
export function createCanvasSource(canvas: HTMLCanvasElement, codec: VideoCodec): CanvasSource {
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
}: Pick<
    VideoExportOptions,
    "canvas" | "canvasRefs" | "userSettings" | "includeSticks" | "includeCraft" | "includeAnalyser"
> & {
    analyserLayout?: AnalyserPosition;
}): void {
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("A 2D canvas is required to export video");
    }

    context.fillStyle = ThemeColors.getGraphBackground();
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(canvasRefs.canvas, 0, 0);

    // Each overlay's canvas is mounted whenever the overlay is enabled, as the JavaScript assumed.
    if (includeSticks && sizeEnabled(userSettings?.sticks)) {
        const stickCanvas = canvasRefs.stickCanvas!;
        context.drawImage(stickCanvas, canvasPosition(stickCanvas.style.left), canvasPosition(stickCanvas.style.top));
    }
    if (includeCraft && sizeEnabled(userSettings?.craft)) {
        const craftCanvas = canvasRefs.craftCanvas!;
        context.drawImage(craftCanvas, canvasPosition(craftCanvas.style.left), canvasPosition(craftCanvas.style.top));
    }
    if (includeAnalyser && sizeEnabled(userSettings?.analyser)) {
        context.drawImage(canvasRefs.analyserCanvas!, analyserLayout?.left ?? 0, analyserLayout?.top ?? 0);
    }
}

/** Replace a log extension with the selected video container extension. */
export function suggestedName(logName: string | null | undefined, extension: string): string {
    const base =
        typeof logName === "string" && logName.includes(".")
            ? logName.slice(0, logName.lastIndexOf("."))
            : String(logName || "blackbox");
    return `${base}.${extension}`;
}

/** Ask the active loop to stop at its next frame boundary. Safe to call repeatedly. */
export function cancelActiveVideoExport(): void {
    if (activeExport) {
        activeExport.cancelled = true;
    }
}

function validateVideoExportOptions(options: VideoExportOptions): void {
    if (activeExport) {
        throw new Error("A video export is already running");
    }
    if (!options.graph || !options.canvasRefs?.canvas || !options.file || !options.log) {
        throw new Error("The blackbox viewer is not ready to export video");
    }
}

async function buildVideoExportPlan(
    options: VideoExportOptions,
): Promise<{ probe: Extract<VideoExportProbe, { canEncode: true }>; start: number; totalFrames: number }> {
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

async function borrowExportGrapher(
    options: VideoExportOptions,
    start: number,
    viewerState: ViewerState,
): Promise<void> {
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

function createVideoOutput({
    options,
    target,
    probe,
}: {
    options: VideoExportOptions;
    target: VideoExportTarget;
    probe: Extract<VideoExportProbe, { canEncode: true }>;
}): { output: Output; source: CanvasSource } {
    const format =
        probe.container === "mp4"
            ? new Mp4OutputFormat({ fastStart: "fragmented" })
            : new WebMOutputFormat({ appendOnly: true });
    const output = new Output({ target, format });
    const source = createCanvasSource(options.canvas, probe.codec);
    output.addVideoTrack(source, { frameRate: options.frameRate });
    return { output, source };
}

async function startVideoOutput(options: VideoExportOptions, output: Output): Promise<void> {
    await output.start();
    options.onPhase?.("rendering");
}

function reportVideoExportProgress({
    options,
    target,
    frame,
    totalFrames,
    smoothedFrameMs,
}: {
    options: VideoExportOptions;
    target: VideoExportTarget;
    frame: number;
    totalFrames: number;
    smoothedFrameMs: number;
}): void {
    options.onProgress?.({
        frame: frame + 1,
        totalFrames,
        bytesWritten: target.bytesWritten(),
        etaSecs: ((totalFrames - frame - 1) * smoothedFrameMs) / 1000,
    });
}

async function renderVideoFrames({
    options,
    output,
    source,
    target,
    exportState,
    start,
    totalFrames,
}: {
    options: VideoExportOptions;
    output: Output;
    source: CanvasSource;
    target: VideoExportTarget;
    exportState: ExportState;
    start: number;
    totalFrames: number;
}): Promise<VideoExportResult> {
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

async function cancelFailedVideoOutput(output: Output | null): Promise<void> {
    if (!output || output.state === "canceled" || output.state === "finalized") {
        return;
    }
    try {
        await output.cancel();
    } catch {
        // The original error remains the useful failure to report.
    }
}

async function closeAndRestoreVideoExport({
    options,
    target,
    exportState,
    viewerState,
    failed,
}: {
    options: VideoExportOptions;
    target: VideoExportTarget | null;
    exportState: ExportState;
    viewerState: ViewerState;
    failed: boolean;
}): Promise<void> {
    try {
        await target?.closeFile();
    } catch (error) {
        if (!failed) {
            throw error;
        }
        // Preserve the original encoder or render failure.
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
export async function runVideoExport(options: VideoExportOptions): Promise<VideoExportResult> {
    validateVideoExportOptions(options);
    const exportState: ExportState = { cancelled: false };
    activeExport = exportState;

    let target: VideoExportTarget | null = null;
    let output: Output | null = null;
    let failed = false;
    const viewerState: ViewerState = { borrowed: false, graphState: GRAPH_STATE_PAUSED };
    try {
        const { probe, start, totalFrames } = await buildVideoExportPlan(options);
        const fileSystem = options.fileSystem ?? FileSystem;
        target = await openFileSystemTarget(options.file, { fileSystem });

        await borrowExportGrapher(options, start, viewerState);
        const started = createVideoOutput({ options, target, probe });
        output = started.output;
        await startVideoOutput(options, output);
        return await renderVideoFrames({
            options,
            output,
            source: started.source,
            target,
            exportState,
            start,
            totalFrames,
        });
    } catch (error) {
        failed = true;
        await cancelFailedVideoOutput(output);
        throw error;
    } finally {
        await closeAndRestoreVideoExport({ options, target, exportState, viewerState, failed });
    }
}
