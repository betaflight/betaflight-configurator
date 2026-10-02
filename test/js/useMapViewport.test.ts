import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref, type EffectScope, type Ref } from "vue";
import { useMapViewport, type MapViewport, type ResizableMap } from "../../src/composables/useMapViewport";

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: Element[] = [];
    disconnect = vi.fn();

    constructor(public callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
    }

    observe(element: Element) {
        this.observed.push(element);
    }

    fire(width: number, height: number) {
        const entry = { contentRect: { width, height } } as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
    }
}

// jsdom implements neither side of the Fullscreen API, so each test decides which spellings exist.
function setFullscreenElement(name: string, value: Element | null) {
    Object.defineProperty(document, name, { value, configurable: true });
}

describe("useMapViewport", () => {
    let scope: EffectScope;
    let container: Ref<HTMLElement | null>;
    let map: ResizableMap | null;
    let viewport: MapViewport;

    beforeEach(() => {
        FakeResizeObserver.instances = [];
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            cb(0);
            return 0;
        });

        container = ref(document.createElement("div"));
        map = { updateSize: vi.fn() };
        scope = effectScope();
        viewport = scope.run(() => useMapViewport(container, () => map)) as MapViewport;
    });

    afterEach(() => {
        scope.stop();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        for (const name of ["fullscreenElement", "webkitFullscreenElement", "msFullscreenElement"]) {
            Reflect.deleteProperty(document, name);
        }
        for (const name of ["exitFullscreen", "webkitExitFullscreen", "msExitFullscreen"]) {
            Reflect.deleteProperty(document, name);
        }
    });

    describe("toggleFullscreen", () => {
        it("requests fullscreen on the container when nothing is fullscreen", () => {
            const requestFullscreen = vi.fn().mockResolvedValue(undefined);
            Object.assign(container.value!, { requestFullscreen });

            viewport.toggleFullscreen();

            expect(requestFullscreen).toHaveBeenCalledOnce();
        });

        it("falls back to the WebKit spelling when the standard one is missing", () => {
            const webkitRequestFullscreen = vi.fn();
            Object.assign(container.value!, { requestFullscreen: undefined, webkitRequestFullscreen });

            viewport.toggleFullscreen();

            expect(webkitRequestFullscreen).toHaveBeenCalledOnce();
        });

        it("exits when an element is already fullscreen, even if only a prefixed property says so", () => {
            const requestFullscreen = vi.fn().mockResolvedValue(undefined);
            const exitFullscreen = vi.fn().mockResolvedValue(undefined);
            Object.assign(container.value!, { requestFullscreen });
            Object.assign(document, { exitFullscreen });
            setFullscreenElement("webkitFullscreenElement", container.value);

            viewport.toggleFullscreen();

            expect(exitFullscreen).toHaveBeenCalledOnce();
            expect(requestFullscreen).not.toHaveBeenCalled();
        });

        it("logs a refused request instead of leaving the rejection unhandled", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const refusal = new TypeError("Permissions check failed");
            Object.assign(container.value!, { requestFullscreen: vi.fn().mockRejectedValue(refusal) });

            viewport.toggleFullscreen();
            await Promise.resolve();
            await Promise.resolve();

            expect(warn).toHaveBeenCalledWith("Fullscreen toggle failed:", refusal);
        });

        it("does nothing without a container", () => {
            const exitFullscreen = vi.fn();
            Object.assign(document, { exitFullscreen });
            setFullscreenElement("fullscreenElement", document.body);
            container.value = null;

            expect(() => viewport.toggleFullscreen()).not.toThrow();
            expect(exitFullscreen).not.toHaveBeenCalled();
        });
    });

    describe("fullscreen change", () => {
        it.each(["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"])(
            "tracks the mode and resizes the map on %s",
            (eventName) => {
                setFullscreenElement("fullscreenElement", container.value);
                document.dispatchEvent(new Event(eventName));

                expect(viewport.isFullscreen.value).toBe(true);
                expect(map!.updateSize).toHaveBeenCalledOnce();

                setFullscreenElement("fullscreenElement", null);
                document.dispatchEvent(new Event(eventName));

                expect(viewport.isFullscreen.value).toBe(false);
            },
        );

        it("tolerates the map not existing yet", () => {
            map = null;

            expect(() => document.dispatchEvent(new Event("fullscreenchange"))).not.toThrow();
        });

        it("stops listening once the scope is disposed", () => {
            scope.stop();
            setFullscreenElement("fullscreenElement", document.body);

            document.dispatchEvent(new Event("fullscreenchange"));

            expect(viewport.isFullscreen.value).toBe(false);
            expect(map!.updateSize).not.toHaveBeenCalled();
        });
    });

    describe("observeContainer", () => {
        it("resizes the map when the container gains a box", () => {
            viewport.observeContainer();
            const [observer] = FakeResizeObserver.instances;

            expect(observer.observed).toEqual([container.value]);
            observer.fire(300, 200);
            expect(map!.updateSize).toHaveBeenCalledOnce();
        });

        it("ignores a collapsed container, as a v-show-hidden box reports zero size", () => {
            viewport.observeContainer();
            const [observer] = FakeResizeObserver.instances;

            observer.fire(0, 0);
            observer.fire(300, 0);

            expect(map!.updateSize).not.toHaveBeenCalled();
        });

        it("resolves the map per callback, so it can be observed before the map exists", () => {
            map = null;
            viewport.observeContainer();
            const [observer] = FakeResizeObserver.instances;
            observer.fire(300, 200);

            const lateMap = { updateSize: vi.fn() };
            map = lateMap;
            observer.fire(300, 200);

            expect(lateMap.updateSize).toHaveBeenCalledOnce();
        });

        it("creates one observer however often it is called", () => {
            viewport.observeContainer();
            viewport.observeContainer();

            expect(FakeResizeObserver.instances).toHaveLength(1);
        });

        it("waits for a container before observing", () => {
            container.value = null;
            viewport.observeContainer();
            expect(FakeResizeObserver.instances).toHaveLength(0);

            container.value = document.createElement("div");
            viewport.observeContainer();
            expect(FakeResizeObserver.instances).toHaveLength(1);
        });
    });

    describe("teardown", () => {
        it("disconnects the observer and can be called again, then by the scope", () => {
            viewport.observeContainer();
            const [observer] = FakeResizeObserver.instances;

            viewport.teardown();
            viewport.teardown();
            scope.stop();

            expect(observer.disconnect).toHaveBeenCalledOnce();
        });

        it("lets a later observeContainer start a fresh observer", () => {
            viewport.observeContainer();
            viewport.teardown();
            viewport.observeContainer();

            expect(FakeResizeObserver.instances).toHaveLength(2);
        });
    });
});
