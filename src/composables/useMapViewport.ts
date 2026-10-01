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

import { onScopeDispose, ref, type Ref } from "vue";

// The WebKit and MS spellings of the Fullscreen API, which lib.dom does not declare.
interface PrefixedFullscreenDocument extends Document {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
    msExitFullscreen?: () => void;
}

interface PrefixedFullscreenElement extends HTMLElement {
    webkitRequestFullscreen?: () => void;
    msRequestFullscreen?: () => void;
}

/** The part of an ol/Map this composable uses. */
export interface ResizableMap {
    updateSize: () => void;
}

export interface MapViewport {
    isFullscreen: Ref<boolean>;
    toggleFullscreen: () => void;
    /**
     * Start watching the container.  Safe to call more than once and before the map
     * exists — only the container is needed, and the map is resolved per callback.
     */
    observeContainer: () => void;
    /** Idempotent: callers with their own teardown path may also call this. */
    teardown: () => void;
}

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
 * @param containerRef Element to fullscreen and observe.
 * @param getMap Resolves the ol/Map; it may not exist yet.
 */
export function useMapViewport(
    containerRef: Ref<HTMLElement | null>,
    getMap: () => ResizableMap | null | undefined,
): MapViewport {
    const isFullscreen = ref(false);
    const doc = document as PrefixedFullscreenDocument;

    const updateSize = () => getMap()?.updateSize();

    const toggleFullscreen = () => {
        const container = containerRef.value as PrefixedFullscreenElement | null;
        if (!container) {
            return;
        }

        if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
        } else if (doc.exitFullscreen) {
            doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
            doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
            doc.msExitFullscreen();
        }
    };

    const handleFullscreenChange = () => {
        isFullscreen.value = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
        // The map can only be measured once the browser has finished switching modes.
        requestAnimationFrame(updateSize);
    };

    const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"];
    for (const event of FULLSCREEN_EVENTS) {
        document.addEventListener(event, handleFullscreenChange);
    }

    let resizeObserver: ResizeObserver | null = null;

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
