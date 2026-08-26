import { afterEach, describe, expect, it, vi } from "vitest";
import { GRAPH_STATE_PAUSED, GRAPH_STATE_PLAY } from "../../src/blackbox-viewer/stores/playback.js";

const mod = await import("../../src/blackbox-viewer/video_export");

describe("estimateFrameCount", () => {
    it("rounds the marker range at the chosen framerate", () => {
        // 1e6 micros / 30 fps = 33_333.3 micros per frame
        expect(mod.estimateFrameCount({ inTime: 0, outTime: 1e6, frameRate: 30 })).toBe(30);
        expect(mod.estimateFrameCount({ inTime: 0, outTime: 500000, frameRate: 60 })).toBe(30);
    });

    it("falls back to the log extent when a bound is unset", () => {
        expect(
            mod.estimateFrameCount({
                inTime: null,
                outTime: undefined,
                frameRate: 30,
                getMinTime: () => 100000,
                getMaxTime: () => 3100000,
            }),
        ).toBe(90);
    });

    it("treats false like an unset bound", () => {
        expect(
            mod.estimateFrameCount({
                inTime: false,
                outTime: 2e6,
                frameRate: 50,
                getMinTime: () => 0,
            }),
        ).toBe(100);
    });

    it("clamps inverted ranges to zero", () => {
        expect(mod.estimateFrameCount({ inTime: 5e6, outTime: 1e6, frameRate: 30 })).toBe(0);
    });
});

describe("estimateOutputBytes", () => {
    it("returns zero for empty ranges", () => {
        expect(mod.estimateOutputBytes({ frameCount: 0, width: 1280, height: 720 })).toBe(0);
        expect(mod.estimateOutputBytes({ frameCount: 10, width: 0, height: 0 })).toBe(0);
    });

    it("scales with frames and pixels", () => {
        const small = mod.estimateOutputBytes({ frameCount: 30, width: 640, height: 360, codec: "avc" });
        const big = mod.estimateOutputBytes({ frameCount: 300, width: 1920, height: 1080, codec: "avc" });
        expect(big).toBeGreaterThan(small * 20);
    });

    it("charges a factor for software-codec containers", () => {
        const avc = mod.estimateOutputBytes({ frameCount: 100, width: 1280, height: 720, codec: "avc" });
        const vp9 = mod.estimateOutputBytes({ frameCount: 100, width: 1280, height: 720, codec: "vp9" });
        expect(vp9).toBeGreaterThan(avc);
    });
});

describe("probeVideoExport", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function loadWithCodec(codec) {
        vi.stubGlobal(
            "VideoEncoder",
            class VideoEncoder {
                static isConfigSupported() {
                    return Promise.resolve({ supported: true });
                }
            },
        );
        vi.doMock("mediabunny", () => ({
            Output: class {},
            Mp4OutputFormat: class {},
            WebMOutputFormat: class {},
            StreamTarget: class {},
            CanvasSource: class {},
            getFirstEncodableVideoCodec: vi.fn().mockResolvedValue(codec),
            QUALITY_MEDIUM: "medium",
        }));
        return import("../../src/blackbox-viewer/video_export");
    }

    it("reports WebCodecs absence with its reason", async () => {
        const fresh = await import("../../src/blackbox-viewer/video_export");
        const result = await fresh.probeVideoExport({ width: 1280, height: 720 });
        expect(result.canEncode).toBe(false);
        expect(result.reason).toMatch(/WebCodecs/i);
    });

    it("threads a supported codec through to container + extension + saveMode", async () => {
        vi.stubGlobal("showSaveFilePicker", () => {});
        const fresh = await loadWithCodec("avc");
        const result = await fresh.probeVideoExport({ width: 1280, height: 720 });
        expect(result).toMatchObject({
            canEncode: true,
            codec: "avc",
            container: "mp4",
            extension: "mp4",
            description: "MP4 video",
            saveMode: "stream",
        });
    });

    it("reports buffered save mode without showSaveFilePicker", async () => {
        const fresh = await loadWithCodec("vp9");
        const result = await fresh.probeVideoExport({ width: 1280, height: 720 });
        expect(result.saveMode).toBe("buffered");
        expect(result.extension).toBe("webm");
    });

    it("caches per canvas size", async () => {
        const codecSpy = vi.fn().mockResolvedValue("avc");
        vi.stubGlobal("showSaveFilePicker", () => {});
        vi.stubGlobal(
            "VideoEncoder",
            class VideoEncoder {
                static isConfigSupported() {
                    return Promise.resolve({ supported: true });
                }
            },
        );
        vi.doMock("mediabunny", () => ({
            Output: class {},
            Mp4OutputFormat: class {},
            WebMOutputFormat: class {},
            StreamTarget: class {},
            CanvasSource: class {},
            getFirstEncodableVideoCodec: codecSpy,
            QUALITY_MEDIUM: "medium",
        }));
        const fresh = await import("../../src/blackbox-viewer/video_export");
        await fresh.probeVideoExport({ width: 1920, height: 1080 });
        await fresh.probeVideoExport({ width: 1920, height: 1080 });
        expect(codecSpy).toHaveBeenCalledTimes(1);
    });

    it("retries a failed probe instead of disabling the resolution for the session", async () => {
        const codecSpy = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("avc");
        vi.stubGlobal(
            "VideoEncoder",
            class VideoEncoder {
                static isConfigSupported() {
                    return Promise.resolve({ supported: true });
                }
            },
        );
        vi.doMock("mediabunny", () => ({
            Output: class {},
            Mp4OutputFormat: class {},
            WebMOutputFormat: class {},
            StreamTarget: class {},
            CanvasSource: class {},
            getFirstEncodableVideoCodec: codecSpy,
            QUALITY_MEDIUM: "medium",
        }));
        const fresh = await import("../../src/blackbox-viewer/video_export");

        expect((await fresh.probeVideoExport({ width: 1280, height: 720 })).canEncode).toBe(false);
        expect((await fresh.probeVideoExport({ width: 1280, height: 720 })).canEncode).toBe(true);
        expect(codecSpy).toHaveBeenCalledTimes(2);
    });
});

describe("createFileSystemTarget", () => {
    it("hands every muxer chunk to the opened writable as a Blob and closes once", async () => {
        const writableToken = { id: "production-writable" };
        const fileSystem = { writeChunck: vi.fn(), closeFile: vi.fn() };
        const target = mod.createFileSystemTarget(writableToken, { fileSystem, chunkSize: 1024 });
        const writer = target.exportWritable.getWriter();

        await writer.write({ type: "write", data: new Uint8Array([1, 2]), position: 0 });
        await writer.write({ type: "write", data: new Uint8Array([3, 4, 5]), position: 2 });
        await writer.close();
        await target.closeFile();

        const calls = fileSystem.writeChunck.mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toBe(writableToken);
        expect(calls[0][1]).toBeInstanceOf(Blob);
        expect(await calls[0][1].arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
        expect(await calls[1][1].arrayBuffer()).toEqual(new Uint8Array([3, 4, 5]).buffer);
        expect(target.bytesWritten()).toBe(5);
        expect(fileSystem.closeFile).toHaveBeenCalledOnce();
        expect(fileSystem.closeFile).toHaveBeenCalledWith(writableToken);
    });

    it("throws on a non-sequential position instead of corrupting downstream", async () => {
        const fileSystem = { writeChunck: vi.fn(), closeFile: vi.fn() };
        const target = mod.createFileSystemTarget({}, { fileSystem, chunkSize: 1024 });
        const writer = target.exportWritable.getWriter();

        await writer.write({ type: "write", data: new Uint8Array(4), position: 0 });
        await expect(writer.write({ type: "write", data: new Uint8Array(4), position: 8 })).rejects.toThrow(
            /append-only/,
        );
        expect(fileSystem.writeChunck).toHaveBeenCalledTimes(1);
    });

    it("uses small Android bridge chunks", () => {
        expect(mod.videoExportChunkSize(true)).toBe(256 * 1024);
        expect(mod.videoExportChunkSize(false)).toBe(4 * 1024 * 1024);
    });

    it("uses the production pick → open → write → close lifecycle", async () => {
        const descriptor = { name: "flight.mp4", _fileHandle: {} };
        const writableToken = { id: "opened-token" };
        const fileSystem = {
            openFile: vi.fn().mockResolvedValue(writableToken),
            writeChunck: vi.fn(),
            closeFile: vi.fn(),
        };
        const target = await mod.openFileSystemTarget(descriptor, { fileSystem, chunkSize: 1024 });
        const writer = target.exportWritable.getWriter();

        await writer.write({ type: "write", data: new Uint8Array([9]), position: 0 });
        await writer.close();

        expect(fileSystem.openFile).toHaveBeenCalledWith(descriptor);
        expect(fileSystem.writeChunck).toHaveBeenCalledWith(writableToken, expect.any(Blob));
        expect(fileSystem.closeFile).toHaveBeenCalledWith(writableToken);
    });
});

describe("compositeVideoFrame", () => {
    it("draws the graph and enabled overlays at their export-scale positions", () => {
        const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
        const graphCanvas = {};
        const stickCanvas = { style: { left: "12.5px", top: "24px" } };
        const craftCanvas = { style: { left: "30px", top: "40px" } };
        const analyserCanvas = {};
        const canvas = { width: 1280, height: 720, getContext: () => context };

        mod.compositeVideoFrame({
            canvas,
            canvasRefs: { canvas: graphCanvas, stickCanvas, craftCanvas, analyserCanvas },
            userSettings: { sticks: { size: "30%" }, craft: { size: "40%" }, analyser: { size: "35%" } },
            includeSticks: true,
            includeCraft: true,
            includeAnalyser: true,
            analyserLayout: { left: 50, top: 60 },
        });

        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1280, 720);
        expect(context.drawImage.mock.calls).toEqual([
            [graphCanvas, 0, 0],
            [stickCanvas, 12.5, 24],
            [craftCanvas, 30, 40],
            [analyserCanvas, 50, 60],
        ]);
    });
});

describe("runVideoExport lifecycle", () => {
    afterEach(() => {
        vi.doUnmock("mediabunny");
        vi.doUnmock("../../src/blackbox-viewer/playback_controls.js");
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function loadRuntime({ codec, graphState = GRAPH_STATE_PLAY }) {
        vi.resetModules();
        const controls = {
            getGraphState: vi.fn(() => graphState),
            invalidateGraph: vi.fn(),
            setExportInProgress: vi.fn(),
            setGraphState: vi.fn(),
        };

        class FakeOutput {
            constructor() {
                this.state = "pending";
            }

            addVideoTrack() {}

            async start() {
                this.state = "started";
            }

            async finalize() {
                this.state = "finalized";
            }

            async cancel() {
                this.state = "canceled";
            }
        }

        vi.stubGlobal("VideoEncoder", class VideoEncoder {});
        vi.doMock("mediabunny", () => ({
            Output: FakeOutput,
            Mp4OutputFormat: class {},
            WebMOutputFormat: class {},
            StreamTarget: class {},
            CanvasSource: class {
                async add() {}
            },
            getFirstEncodableVideoCodec: vi.fn(() => codec),
            QUALITY_MEDIUM: "medium",
        }));
        vi.doMock("../../src/blackbox-viewer/playback_controls.js", () => controls);

        return { fresh: await import("../../src/blackbox-viewer/video_export"), controls };
    }

    function runtimeOptions(overrides = {}) {
        const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
        const graphCanvas = {};
        return {
            canvas: { width: 0, height: 0, getContext: () => context },
            canvasRefs: { canvas: graphCanvas },
            graph: { render: vi.fn(), resize: vi.fn(), setDrawInOutRegion: vi.fn() },
            log: { getMinTime: () => 0, getMaxTime: () => 1e6 },
            file: { name: "flight.mp4" },
            fileSystem: {
                openFile: vi.fn().mockResolvedValue({ id: "writable" }),
                writeChunck: vi.fn(),
                closeFile: vi.fn(),
            },
            frameRate: 30,
            width: 1280,
            height: 720,
            ...overrides,
        };
    }

    it("reserves the grapher before codec planning and releases it after planning fails", async () => {
        let resolveCodec;
        const codec = new Promise((resolve) => {
            resolveCodec = resolve;
        });
        const { fresh } = await loadRuntime({ codec });
        const options = runtimeOptions();

        const first = fresh.runVideoExport(options);
        await expect(fresh.runVideoExport(options)).rejects.toThrow(/already running/);

        resolveCodec(null);
        await expect(first).rejects.toThrow(/No supported video codec/);
        await expect(fresh.runVideoExport(options)).rejects.toThrow(/No supported video codec/);
    });

    it("restores playback state after returning the grapher", async () => {
        const { fresh, controls } = await loadRuntime({ codec: Promise.resolve("avc") });
        const restoreCanvasSize = vi.fn();
        const invalidateGraph = vi.fn();
        const options = runtimeOptions({ restoreCanvasSize, invalidateGraph });

        const result = await fresh.runVideoExport(options);

        expect(result).toMatchObject({ frames: 30, cancelled: false });
        expect(controls.getGraphState).toHaveBeenCalledOnce();
        expect(controls.setGraphState.mock.calls).toEqual([[GRAPH_STATE_PAUSED], [GRAPH_STATE_PLAY]]);
        expect(controls.setExportInProgress.mock.calls).toEqual([[true], [false]]);
        expect(restoreCanvasSize).toHaveBeenCalledOnce();
        expect(invalidateGraph).toHaveBeenCalledOnce();
        expect(options.fileSystem.closeFile).toHaveBeenCalledOnce();
    });

    it("does not let a close failure hide the original export error", async () => {
        const { fresh } = await loadRuntime({ codec: Promise.resolve("avc") });
        const renderError = new Error("frame render failed");
        const options = runtimeOptions({
            graph: {
                render: vi.fn(() => {
                    throw renderError;
                }),
                resize: vi.fn(),
                setDrawInOutRegion: vi.fn(),
            },
        });
        options.fileSystem.closeFile.mockRejectedValue(new Error("file close failed"));

        await expect(fresh.runVideoExport(options)).rejects.toBe(renderError);
    });
});

describe("suggestedName", () => {
    it("replaces the log extension with the export container's", () => {
        expect(mod.suggestedName("FOO.BBL", "mp4")).toBe("FOO.mp4");
        expect(mod.suggestedName("no-ext", "webm")).toBe("no-ext.webm");
        expect(mod.suggestedName("", "mp4")).toBe("blackbox.mp4");
    });
});
