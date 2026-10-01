import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type App, type Ref } from "vue";
import { useOsdRuler, type OsdRuler } from "../../src/composables/useOsdRuler";

const CELL_W = 12;
const CELL_H = 18;
const PREVIEW_LEFT = 30;
const PREVIEW_TOP = 26;
const CENTER_COLOR = "#ffff00";

interface DrawnLabel {
    text: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    fillStyle: string;
}

/** Records what the ruler draws; jsdom has no canvas implementation of its own. */
class FakeContext {
    font = "";
    textAlign: CanvasTextAlign = "start";
    textBaseline: CanvasTextBaseline = "alphabetic";
    fillStyle = "";
    strokeStyle = "";
    lineWidth = 1;
    labels: DrawnLabel[] = [];
    strokes: string[] = [];
    clears = 0;
    private saved: Array<Pick<FakeContext, "textAlign" | "textBaseline">> = [];

    clearRect() {
        this.clears++;
    }
    measureText(text: string) {
        return { width: text.length * 6 };
    }
    fillText(text: string) {
        const { textAlign, textBaseline, fillStyle } = this;
        this.labels.push({ text, textAlign, textBaseline, fillStyle });
    }
    beginPath() {}
    moveTo() {}
    lineTo() {}
    stroke() {
        this.strokes.push(this.strokeStyle);
    }
    save() {
        this.saved.push({ textAlign: this.textAlign, textBaseline: this.textBaseline });
    }
    restore() {
        Object.assign(this, this.saved.pop());
    }

    /** The label texts drawn with the given alignment, in drawing order. */
    labelsWith(filter: Partial<Pick<DrawnLabel, "textAlign" | "textBaseline">>): string[] {
        return this.labels
            .filter((label) => Object.entries(filter).every(([key, value]) => label[key as keyof DrawnLabel] === value))
            .map((label) => label.text);
    }

    reset() {
        this.labels = [];
        this.strokes = [];
        this.clears = 0;
    }
}

function rectAt(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

/** The OSD preview's DOM, with the layout jsdom cannot compute pinned per element. */
function buildPreview(cols: number, rows: number) {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: PREVIEW_LEFT * 2 + cols * CELL_W });
    Object.defineProperty(container, "clientHeight", { value: PREVIEW_TOP * 2 + rows * CELL_H });
    container.getBoundingClientRect = () => rectAt(0, 0, container.clientWidth, container.clientHeight);

    const preview = document.createElement("div");
    preview.className = "tab-osd-preview";
    preview.getBoundingClientRect = () => rectAt(PREVIEW_LEFT, PREVIEW_TOP, cols * CELL_W, rows * CELL_H);
    container.appendChild(preview);

    for (let r = 0; r < rows; r++) {
        const row = document.createElement("div");
        row.className = "tab-osd-row";
        row.getBoundingClientRect = () => rectAt(PREVIEW_LEFT, PREVIEW_TOP + r * CELL_H, cols * CELL_W, CELL_H);
        for (let c = 0; c < cols; c++) {
            const char = document.createElement("div");
            char.className = "tab-osd-char";
            char.getBoundingClientRect = () =>
                rectAt(PREVIEW_LEFT + c * CELL_W, PREVIEW_TOP + r * CELL_H, CELL_W, CELL_H);
            row.appendChild(char);
        }
        preview.appendChild(row);
    }

    return { container, preview };
}

describe("useOsdRuler", () => {
    let app: App | null;
    let ctx: FakeContext;
    let frames: FrameRequestCallback[];
    let canvasRef: Ref<HTMLCanvasElement | null>;
    let containerRef: Ref<HTMLElement | null>;
    let showRulers: Ref<boolean>;
    let ruler: OsdRuler;

    function flushFrames() {
        const pending = frames;
        frames = [];
        pending.forEach((frame) => frame(0));
    }

    function mount(preview: { container: HTMLElement } | null, initiallyShown: boolean) {
        canvasRef = ref(document.createElement("canvas"));
        containerRef = ref(preview?.container ?? null);
        showRulers = ref(initiallyShown);
        app = createApp({
            setup() {
                ruler = useOsdRuler(canvasRef, containerRef, showRulers);
                return () => null;
            },
        });
        app.mount(document.createElement("div"));
        flushFrames();
    }

    beforeEach(() => {
        app = null;
        ctx = new FakeContext();
        frames = [];
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
            () => ctx as unknown as CanvasRenderingContext2D,
        );
        vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });

    afterEach(() => {
        app?.unmount();
        document.documentElement.classList.remove("dark");
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe("labels", () => {
        it("numbers columns from the centre, every fifth, on both horizontal rulers", () => {
            mount(buildPreview(30, 16), true);

            // An even width has no middle column: the one right of centre is 0.
            const expected = ["-10", "-5", "0", "5", "10", "15"];
            expect(ctx.labelsWith({ textBaseline: "bottom" })).toEqual(expected);
            expect(ctx.labelsWith({ textBaseline: "top" })).toEqual(expected);
        });

        it("keeps every label inside the grid for an odd width", () => {
            mount(buildPreview(11, 3), true);

            expect(ctx.labelsWith({ textBaseline: "bottom" })).toEqual(["-5", "0", "5"]);
        });

        it("numbers rows every second, plus the first and last, on both vertical rulers", () => {
            mount(buildPreview(30, 16), true);

            const expected = ["-7", "-6", "-4", "-2", "0", "2", "4", "6", "8"];
            expect(ctx.labelsWith({ textAlign: "right", textBaseline: "middle" })).toEqual(expected);
            expect(ctx.labelsWith({ textAlign: "left", textBaseline: "middle" })).toEqual(expected);
        });

        it("marks only the centre tick of each ruler in the centre colour", () => {
            mount(buildPreview(30, 16), true);

            expect(ctx.strokes.filter((color) => color === CENTER_COLOR)).toHaveLength(4);
            expect(ctx.strokes).toHaveLength(30 * 2 + 16 * 2);
        });

        it("draws labels light on the dark theme and dark otherwise", () => {
            mount(buildPreview(11, 3), true);
            expect(new Set(ctx.labels.map((label) => label.fillStyle))).toEqual(new Set(["#000"]));

            document.documentElement.classList.add("dark");
            ctx.reset();
            ruler.drawRulers();

            expect(new Set(ctx.labels.map((label) => label.fillStyle))).toEqual(new Set(["#fff"]));
        });
    });

    describe("canvas", () => {
        it("sizes the canvas to the container", () => {
            mount(buildPreview(30, 16), true);

            expect(canvasRef.value!.width).toBe(PREVIEW_LEFT * 2 + 30 * CELL_W);
            expect(canvasRef.value!.height).toBe(PREVIEW_TOP * 2 + 16 * CELL_H);
        });

        it("draws nothing, and does not throw, before the grid has rendered", () => {
            const empty = document.createElement("div");
            empty.appendChild(Object.assign(document.createElement("div"), { className: "tab-osd-preview" }));

            expect(() => mount({ container: empty }, true)).not.toThrow();
            expect(ctx.labels).toEqual([]);
        });

        it("does nothing without a container", () => {
            expect(() => mount(null, true)).not.toThrow();
            expect(ctx.labels).toEqual([]);
        });
    });

    describe("toggling", () => {
        it("leaves the preview untouched while rulers are off", () => {
            const { container, preview } = buildPreview(11, 3);
            mount({ container }, false);

            expect(ctx.labels).toEqual([]);
            expect(container.style.paddingTop).toBe("");
            expect(preview.style.marginLeft).toBe("");
        });

        it("makes room for the rulers when they are on", () => {
            const { container, preview } = buildPreview(11, 3);
            mount({ container }, true);

            expect(container.style.paddingTop).toBe("26px");
            expect(preview.style.marginLeft).toBe("30px");
            expect(preview.style.marginRight).toBe("30px");
        });

        it("draws on the next frame after being switched on", async () => {
            mount(buildPreview(11, 3), false);

            showRulers.value = true;
            await nextTick();
            expect(ctx.labels).toEqual([]);

            flushFrames();
            expect(ctx.labels.length).toBeGreaterThan(0);
        });

        it("clears the canvas and the margins when switched off", async () => {
            const { container, preview } = buildPreview(11, 3);
            mount({ container }, true);
            ctx.reset();

            showRulers.value = false;
            await nextTick();

            expect(ctx.clears).toBe(1);
            expect(container.style.paddingTop).toBe("");
            expect(preview.style.marginRight).toBe("");
        });
    });

    describe("resize", () => {
        it("redraws on the next frame while rulers are on", () => {
            mount(buildPreview(11, 3), true);
            ctx.reset();

            window.dispatchEvent(new Event("resize"));
            flushFrames();

            expect(ctx.labels.length).toBeGreaterThan(0);
        });

        it("coalesces a burst of resizes into one pending frame", () => {
            mount(buildPreview(11, 3), true);

            window.dispatchEvent(new Event("resize"));
            window.dispatchEvent(new Event("resize"));

            expect(cancelAnimationFrame).toHaveBeenCalledOnce();
        });

        it("ignores resizes while rulers are off", () => {
            mount(buildPreview(11, 3), false);

            window.dispatchEvent(new Event("resize"));

            expect(frames).toHaveLength(0);
        });

        it("stops listening once unmounted", () => {
            mount(buildPreview(11, 3), true);
            app!.unmount();
            app = null;

            window.dispatchEvent(new Event("resize"));

            expect(frames).toHaveLength(0);
        });
    });
});
