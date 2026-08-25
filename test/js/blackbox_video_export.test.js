import { afterEach, describe, expect, it, vi } from "vitest";

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
            getFirstEncodableVideoCodec: codecSpy,
            QUALITY_MEDIUM: "medium",
        }));
        const fresh = await import("../../src/blackbox-viewer/video_export");
        await fresh.probeVideoExport({ width: 1920, height: 1080 });
        await fresh.probeVideoExport({ width: 1920, height: 1080 });
        expect(codecSpy).toHaveBeenCalledTimes(1);
    });
});

describe("createFileSystemTarget", () => {
    afterEach(() => {
        vi.resetModules();
        delete window.FileSystem;
    });

    async function loadWithFakeTarget() {
        vi.doMock("mediabunny", () => ({
            // Mimics the real StreamTarget contract: write() feeds the
            // WritableStream the module handed us.
            StreamTarget: class FakeStreamTarget {
                constructor(writable) {
                    this._writer = writable.getWriter();
                    this.write = vi.fn(async (chunk) => {
                        await this._writer.write(chunk);
                    });
                }
            },
        }));
        return import("../../src/blackbox-viewer/video_export");
    }

    it("hands every muxer chunk to FileSystem as a Blob, in order", async () => {
        const fresh = await loadWithFakeTarget();
        window.FileSystem = { writeChunck: vi.fn() };
        const target = fresh.createFileSystemTarget({});

        await target.write({ type: "write", data: new Uint8Array([1, 2]), position: 0 });
        await target.write({ type: "write", data: new Uint8Array([3, 4, 5]), position: 2 });

        const calls = window.FileSystem.writeChunck.mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0][1]).toBeInstanceOf(Blob);
        expect(await calls[0][1].arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
        expect(await calls[1][1].arrayBuffer()).toEqual(new Uint8Array([3, 4, 5]).buffer);
        expect(target.bytesWritten()).toBe(5);
    });

    it("throws on a non-sequential position instead of corrupting downstream", async () => {
        const fresh = await loadWithFakeTarget();
        window.FileSystem = { writeChunck: vi.fn() };
        const target = fresh.createFileSystemTarget({});

        await target.write({ type: "write", data: new Uint8Array(4), position: 0 });
        await expect(target.write({ type: "write", data: new Uint8Array(4), position: 8 })).rejects.toThrow(
            /append-only/,
        );
        expect(window.FileSystem.writeChunck).toHaveBeenCalledTimes(1);
    });
});

describe("suggestedName", () => {
    it("replaces the log extension with the export container's", () => {
        expect(mod.suggestedName("FOO.BBL", "mp4")).toBe("FOO.mp4");
        expect(mod.suggestedName("no-ext", "webm")).toBe("no-ext.webm");
        expect(mod.suggestedName("", "mp4")).toBe("blackbox.mp4");
    });
});
