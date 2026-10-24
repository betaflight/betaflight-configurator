import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mixedLog } from "./syntheticLog";
import ctzsnoozeWorkspace from "../../src/blackbox-viewer/ws_ctzsnooze.json";
import supaflyWorkspace from "../../src/blackbox-viewer/ws_supafly.json";

// The renderers need a real canvas and WebGL, and playback a running animation loop; the
// viewer's wiring is what this covers, so they are fakes that record what main.ts asks of them.
const graphs: { args: unknown[]; calls: string[] }[] = [];
vi.mock("../../src/blackbox-viewer/vendor", () => ({}));
vi.mock("../../src/blackbox-viewer/grapher", () => ({
    FlightLogGrapher: vi.fn(function (this: Record<string, unknown>, ...args: unknown[]) {
        const record = { args, calls: [] as string[] };
        graphs.push(record);
        for (const name of [
            "destroy",
            "setAnalyser",
            "refreshTheme",
            "refreshOptions",
            "refreshGraphConfig",
            "setDrawSticks",
            "refreshLogo",
            "initializeCraftModel",
        ]) {
            this[name] = () => record.calls.push(name);
        }
        this.getAnalyser = () => ({ importSpectrumFromCSV: vi.fn(), removeImportedSpectrums: vi.fn() });
    }),
}));
vi.mock("../../src/blackbox-viewer/graph_map", () => ({
    MapGrapher: vi.fn(function (this: Record<string, unknown>) {
        this.destroy = vi.fn();
    }),
}));
vi.mock("../../src/blackbox-viewer/seekbar", () => ({
    SeekBar: vi.fn(function (this: Record<string, unknown>) {
        this.destroy = vi.fn();
        this.refreshTheme = vi.fn();
    }),
}));
vi.mock("../../src/blackbox-viewer/playback_controls", () => ({
    invalidateGraph: vi.fn(),
    updateCanvasSize: vi.fn(),
    setGraphState: vi.fn(),
    setCurrentBlackboxTime: vi.fn(),
    setPlaybackRate: vi.fn(),
    setGraphZoom: vi.fn(),
    showConfigFile: vi.fn(),
    showValueTable: vi.fn(),
    logJumpBack: vi.fn(),
    logJumpForward: vi.fn(),
    logJumpStart: vi.fn(),
    logJumpEnd: vi.fn(),
    logPlayPause: vi.fn(),
    setMarker: vi.fn(),
    logSyncHere: vi.fn(),
    logSyncBack: vi.fn(),
    logSyncForward: vi.fn(),
    logSmartSync: vi.fn(),
    videoLoaded: vi.fn(),
    isExportInProgress: () => false,
}));
vi.mock("../../src/blackbox-viewer/video_handler", () => ({
    syncLogToVideo: vi.fn(),
    setVideoOffset: vi.fn(),
    setVideoTime: vi.fn(),
    setVideoInTime: vi.fn(),
    setVideoOutTime: vi.fn(),
    loadVideo: vi.fn(),
    reportVideoError: vi.fn(),
}));
vi.mock("../../src/blackbox-viewer/log_lifecycle", () => ({
    renderLogFileInfo: vi.fn(),
    renderSelectedLogInfo: vi.fn(),
    setSeekBarMode: vi.fn(),
}));
vi.mock("../../src/blackbox-viewer/export_utils", () => ({
    exportCsv: vi.fn(),
    exportGpx: vi.fn(),
    exportSpectrumToCsv: vi.fn(),
}));
vi.mock("../../src/blackbox-viewer/video_export", () => ({ cancelActiveVideoExport: vi.fn() }));

const { pinia } = await import("../../src/js/pinia_instance");
const { useLogStore } = await import("../../src/blackbox-viewer/stores/log");
const { useGraphStore } = await import("../../src/blackbox-viewer/stores/graph");
const { useWorkspaceStore } = await import("../../src/blackbox-viewer/stores/workspace");
const { useAppStore } = await import("../../src/blackbox-viewer/stores/app");
const playback = await import("../../src/blackbox-viewer/playback_controls");
const lifecycle = await import("../../src/blackbox-viewer/log_lifecycle");
const { cancelActiveVideoExport } = await import("../../src/blackbox-viewer/video_export");
const { bootstrapViewer } = await import("../../src/blackbox-viewer/main");

function mountTemplate() {
    document.body.innerHTML = `
        <div id="log-graph"></div>
        <div id="mouseNotification"></div>
        <video id="logVideo"></video>
        <canvas id="graphCanvas"></canvas>
        <canvas id="analyserCanvas"></canvas>
        <canvas id="stickCanvas"></canvas>
        <canvas id="craftCanvas"></canvas>
        <canvas id="seekbarCanvas"></canvas>`;
}

const LOG_BYTES = new Uint8Array(mixedLog(8).bytes);

describe("bootstrapViewer", () => {
    let teardown: (() => void) | null = null;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        graphs.length = 0;
        localStorage.clear();
        mountTemplate();
        vi.stubGlobal("alert", vi.fn());
        teardown = bootstrapViewer();
    });

    afterEach(() => {
        teardown?.();
        teardown = null;
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("starts on the welcome page with the default workspaces", () => {
        expect(useLogStore(pinia).hasLog).toBe(false);
        expect(useGraphStore(pinia).graph).toBeNull();
        const workspaces = useWorkspaceStore(pinia).workspaceGraphConfigs;
        expect(workspaces[1]?.title).toBe(ctzsnoozeWorkspace[1].title);
        expect(useWorkspaceStore(pinia).activeWorkspace).toBe(1);
    });

    it("opens a log from a buffer and draws it with the workspace's graphs", () => {
        useAppStore(pinia).loadLogBuffer!(LOG_BYTES);

        expect(useLogStore(pinia).hasLog).toBe(true);
        expect(lifecycle.renderLogFileInfo).toHaveBeenCalledWith({ name: "BLACKBOX_LOG.BBL" });
        expect(graphs).toHaveLength(1);
        expect(useGraphStore(pinia).graph).not.toBeNull();
        expect(useGraphStore(pinia).graphConfig?.length).toBeGreaterThan(0);
        expect(useLogStore(pinia).currentBlackboxTime).toBe(useLogStore(pinia).flightLog!.getMinTime());
        expect(playback.setGraphZoom).toHaveBeenCalledWith(100);
    });

    it("reports a buffer that holds no log, and draws nothing", () => {
        useAppStore(pinia).loadLogBuffer!(new Uint8Array([1, 2, 3]), "junk.bbl");

        expect(alert).toHaveBeenCalled();
        expect(graphs).toHaveLength(0);
    });

    it("reports a log file too short to hold a log", async () => {
        vi.useRealTimers();
        useAppStore(pinia).loadFiles!([new File([new Uint8Array(40)], "tiny.bbl")]);

        await vi.waitFor(() => expect(alert).toHaveBeenCalled());
        expect(graphs).toHaveLength(0);
    });

    it("reads a short CLI dump as a configuration file, not a log", async () => {
        vi.useRealTimers();
        useAppStore(pinia).loadFiles!([new File(["# diff\nset a = 1\n"], "cli.txt")]);

        await vi.waitFor(() => expect(useGraphStore(pinia).hasConfig).toBe(true));
        expect(alert).not.toHaveBeenCalled();
    });

    it("splits a graph into one graph per field", () => {
        useAppStore(pinia).loadLogBuffer!(LOG_BYTES);
        const graphStore = useGraphStore(pinia);
        const before = graphStore.graphConfig!;
        const first = before[0];

        graphStore.expandGraphConfig!(0);

        expect(graphStore.graphConfig).toHaveLength(first.fields.length);
        expect(graphStore.graphConfig!.map((graph) => graph.label)).toEqual(first.fields.map((field) => field.name));
        expect(graphStore.lastGraphConfig).toBe(before);
    });

    it("zooms a pen with shift and the wheel, and redraws", () => {
        useAppStore(pinia).loadLogBuffer!(LOG_BYTES);
        const graphStore = useGraphStore(pinia);
        const field = graphStore.activeGraphConfig!.getGraphs()[0].fields[0];
        const before = { ...field.curve!.MinMax };

        // LegendPanel sends 0 or 1 for a scroll up: both zoom the pen out.
        graphStore.fieldWheel!(0, 0, 0, true, false, false);

        const after = graphStore.activeGraphConfig!.getGraphs()[0].fields[0].curve!.MinMax!;
        expect(after.max! - after.min!).toBeCloseTo((before.max! - before.min!) * 1.05);
        expect(graphs[0].calls).toContain("refreshGraphConfig");
    });

    it("plays and pauses with Space", () => {
        useAppStore(pinia).loadLogBuffer!(LOG_BYTES);
        document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
        expect(playback.logPlayPause).toHaveBeenCalledOnce();
    });

    it("steps through the log with the wheel over the graph", () => {
        useAppStore(pinia).loadLogBuffer!(LOG_BYTES);
        const canvas = document.getElementById("graphCanvas")!;
        canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true }));
        expect(playback.logJumpForward).toHaveBeenCalledWith(0.1);
        canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, shiftKey: true, bubbles: true }));
        expect(playback.setGraphZoom).toHaveBeenLastCalledWith(90);

        vi.mocked(playback.logJumpForward).mockClear();
        document.getElementById("log-graph")!.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true }));
        expect(playback.logJumpForward).not.toHaveBeenCalled();
    });

    it("applies a built-in workspace", () => {
        useWorkspaceStore(pinia).applyDefaultWorkspace!(2);
        expect(useWorkspaceStore(pinia).workspaceGraphConfigs[1]?.title).toBe(supaflyWorkspace[1].title);
        expect(JSON.parse(localStorage.getItem("workspaceGraphConfigs")!)[1].title).toBe(supaflyWorkspace[1].title);
    });

    it("undoes everything it set up on teardown", () => {
        useAppStore(pinia).loadLogBuffer!(LOG_BYTES);
        const removed = vi.spyOn(document, "removeEventListener");
        const removedFromWindow = vi.spyOn(window, "removeEventListener");
        teardown!();
        teardown = null;

        expect(cancelActiveVideoExport).toHaveBeenCalled();
        expect(graphs[0].calls).toContain("destroy");
        expect(useGraphStore(pinia).graph).toBeNull();
        expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(["keydown", "keydown", "wheel"]);
        expect(removedFromWindow.mock.calls.map(([type]) => type)).toContain("resize");
    });
});
