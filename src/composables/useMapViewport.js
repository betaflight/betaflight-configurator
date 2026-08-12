import { onScopeDispose, ref } from "vue";

/**
 * Viewport plumbing shared by the OpenLayers maps (GPS, Preflight, Flight Plan).
 *
 * Two concerns that every map tab needs and none of them should re-implement:
 *
 *  - Fullscreen toggling, including the WebKit and MS prefixed spellings, with the
 *    map resized once the browser has switched modes.
 *  - Keeping OpenLayers' cached viewport size in step with the container.  The maps
 *    live inside collapsible UiBoxes that hide their content with `v-show`, so a map
 *    can be laid out while it has no box at all; OpenLayers will not notice when the
 *    container becomes visible again and renders blank or clipped.  Observing the
 *    container covers that, plus window resizes and any other layout change.
 *
 * Document listeners are attached immediately and released when the owning
 * component's scope is disposed, so callers only need to wire up the returned state.
 *
 * @param {import("vue").Ref<HTMLElement|null>} containerRef Element to fullscreen and observe.
 * @param {() => object|null|undefined} getMap Resolves the ol/Map; it may not exist yet.
 */
export function useMapViewport(containerRef, getMap) {
    const isFullscreen = ref(false);

    const updateSize = () => getMap()?.updateSize();

    const toggleFullscreen = () => {
        const container = containerRef.value;
        if (!container) {
            return;
        }

        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    };

    const handleFullscreenChange = () => {
        isFullscreen.value = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement
        );
        // The map can only be measured once the browser has finished switching modes.
        requestAnimationFrame(updateSize);
    };

    const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"];
    for (const event of FULLSCREEN_EVENTS) {
        document.addEventListener(event, handleFullscreenChange);
    }

    let resizeObserver = null;

    /**
     * Start watching the container.  Safe to call more than once and before the map
     * exists — only the container is needed, and the map is resolved per callback.
     */
    const observeContainer = () => {
        if (resizeObserver || !containerRef.value) {
            return;
        }

        resizeObserver = new ResizeObserver((entries) => {
            const map = getMap();
            if (!map) {
                return;
            }
            for (const { contentRect } of entries) {
                if (contentRect.width > 0 && contentRect.height > 0) {
                    map.updateSize();
                    break;
                }
            }
        });

        resizeObserver.observe(containerRef.value);
    };

    /** Idempotent: callers with their own teardown path may also call this. */
    const teardown = () => {
        for (const event of FULLSCREEN_EVENTS) {
            document.removeEventListener(event, handleFullscreenChange);
        }
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    };

    onScopeDispose(teardown);

    return { isFullscreen, toggleFullscreen, observeContainer, teardown };
}
