import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { SeekBar } from "../../src/blackbox-viewer/seekbar";

interface FakeCanvas {
    width: number;
    height: number;
    calls: string[];
    listeners: Record<string, (event: unknown) => void>;
}

/** A canvas that records its 2D calls; the bar draws to one and keeps its background in another. */
function fakeCanvas(width: number, height: number): FakeCanvas & HTMLCanvasElement {
    const canvas = { width, height, calls: [] as string[], listeners: {} as FakeCanvas["listeners"] };
    const ctx = new Proxy(
        {},
        {
            get:
                (_target, prop) =>
                (...args: unknown[]) =>
                    canvas.calls.push(`${String(prop)}(${args.join(",")})`),
            set: () => true,
        },
    );
    return Object.assign(canvas, {
        getContext: () => ctx,
        getBoundingClientRect: () => ({ left: 0, right: canvas.width }),
        addEventListener: (type: string, listener: (event: unknown) => void) => {
            canvas.listeners[type] = listener;
        },
        removeEventListener: (type: string) => {
            delete canvas.listeners[type];
        },
    }) as unknown as FakeCanvas & HTMLCanvasElement;
}

describe("SeekBar", () => {
    let background: FakeCanvas & HTMLCanvasElement;

    beforeEach(() => {
        setActivePinia(createPinia());
        const create = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag === "canvas") {
                background = fakeCanvas(0, 0);
                return background;
            }
            return create(tag);
        }) as typeof document.createElement);
        vi.stubGlobal("devicePixelRatio", 1);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function mounted() {
        const canvas = fakeCanvas(0, 0);
        const bar = new SeekBar(canvas);
        bar.resize(105, 50);
        bar.setTimeRange(1000, 2000, 1000);
        return { canvas, bar };
    }

    it("seeks to the time under the pointer, clamped to the log", () => {
        const { canvas, bar } = mounted();
        const seeks: number[] = [];
        bar.onSeek = (time) => seeks.push(time);
        const press = (pageX: number) => canvas.listeners.mousedown({ button: 0, pageX, preventDefault() {} });

        // 105 px with a 2.5 px inset each side leaves 99 px for the 1000 µs.
        press(2.5);
        press(52);
        press(-50);
        press(500);
        expect(seeks).toEqual([1000, 1500, 1000, 2000]);
    });

    it("ignores any button but the main one", () => {
        const { canvas, bar } = mounted();
        const onSeek = vi.fn();
        bar.onSeek = onSeek;
        canvas.listeners.mousedown({ button: 2, pageX: 50, preventDefault() {} });
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("follows a drag until the button is released, then stops", () => {
        const { canvas, bar } = mounted();
        const onSeek = vi.fn();
        bar.onSeek = onSeek;
        canvas.listeners.mousedown({ button: 0, pageX: 10, preventDefault() {} });
        document.body.dispatchEvent(new MouseEvent("mousemove", { button: 0 }));
        expect(onSeek).toHaveBeenCalledTimes(2);
        document.body.dispatchEvent(new MouseEvent("mouseup"));
        document.body.dispatchEvent(new MouseEvent("mousemove", { button: 0 }));
        expect(onSeek).toHaveBeenCalledTimes(2);
    });

    it("dims the log outside the marked in and out times", () => {
        const { bar } = mounted();
        bar.setInTime(1250);
        bar.setOutTime(1750);
        background.calls.length = 0;
        bar.repaint();
        // The background, then the part before the in time and the part after the out time: painting
        // spreads the 1000 µs over the 100 px between the insets.
        const fills = background.calls.filter((call) => call.startsWith("fillRect"));
        expect(fills).toEqual(["fillRect(0,0,105,50)", "fillRect(0,0,27.5,50)", "fillRect(77.5,0,27.5,50)"]);
    });

    it("paints nothing while it has no size", () => {
        const canvas = fakeCanvas(0, 0);
        const bar = new SeekBar(canvas);
        bar.repaint();
        expect(canvas.calls).toEqual([]);
    });

    it("lets go of the canvas and an unfinished drag on destroy", () => {
        const { canvas, bar } = mounted();
        const onSeek = vi.fn();
        bar.onSeek = onSeek;
        canvas.listeners.mousedown({ button: 0, pageX: 10, preventDefault() {} });
        bar.destroy();
        document.body.dispatchEvent(new MouseEvent("mousemove", { button: 0 }));
        expect(onSeek).toHaveBeenCalledOnce();
        expect(canvas.listeners).toEqual({});
    });
});
