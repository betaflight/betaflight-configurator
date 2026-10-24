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

import { formatTime } from "./tools";
import { GRAPH_MIN_ZOOM, type GraphPanelConfig, type useGraphStore } from "./stores/graph";
import { isExportInProgress } from "./playback_controls";
import type { useLogStore } from "./stores/log";
import type { usePlaybackStore } from "./stores/playback";
import type { useWorkspaceStore, WorkspaceList } from "./stores/workspace";
import type { useAppStore } from "./stores/app";
import type { UserSettings } from "./user_settings_data";

/** The user settings a key toggles. */
type OverrideSetting = "graphSmoothOverride" | "graphExpoOverride" | "graphGridOverride";

/**
 * The element a key event came from. A keydown on the document targets an element, so the
 * JavaScript read these without checking; `type` is set on inputs only.
 */
type KeyTarget = HTMLElement & { type?: string };

/** The viewer's state and actions the keyboard shortcuts drive, from main.ts. */
export interface KeydownContext {
    /** Returns true if a graph is loaded. */
    hasGraph: () => boolean;
    graphStore: ReturnType<typeof useGraphStore>;
    logStore: ReturnType<typeof useLogStore>;
    playbackStore: ReturnType<typeof usePlaybackStore>;
    workspaceStore: ReturnType<typeof useWorkspaceStore>;
    appStore: ReturnType<typeof useAppStore>;
    logPlayPause: () => void;
    logJumpBack: (fast?: number | null, slow?: boolean) => void;
    logJumpForward: (fast?: number | null, slow?: boolean) => void;
    logJumpStart: () => void;
    logJumpEnd: () => void;
    logSmartSync: () => void;
    /** Zoom to a percentage, or back to the previous zoom for null. */
    setGraphZoom: (zoom: number | null) => void;
    setVideoInTime: (time: number | null) => void;
    setVideoOutTime: (time: number | null) => void;
    setMarker: (state: boolean) => void;
    setCurrentBlackboxTime: (time: number) => void;
    /** Show or hide the value table, or toggle it with no argument. */
    showValueTable: (state?: boolean) => void;
    /** Show or hide the config file, or toggle it with no argument. */
    showConfigFile: (state?: boolean) => void;
    newGraphConfig: (config: GraphPanelConfig[]) => void;
    toggleOverrideStatus: (setting: OverrideSetting & keyof UserSettings) => void;
    invalidateGraph: () => void;
    onSwitchWorkspace: (workspaces: WorkspaceList, id: number) => void;
    onSaveWorkspace: (id: number, title: string) => void;
    lastGraphConfig: () => GraphPanelConfig[] | null;
}

type LetterKeyHandler = (e: KeyboardEvent, shifted: boolean) => void;

/**
 * Create a keydown event handler for the document.
 */
export function createKeydownHandler(ctx: KeydownContext): (e: KeyboardEvent) => void {
    const {
        hasGraph,
        graphStore,
        logStore,
        playbackStore,
        workspaceStore,
        appStore,
        logPlayPause,
        logJumpBack,
        logJumpForward,
        logJumpStart,
        logJumpEnd,
        logSmartSync,
        setGraphZoom,
        setVideoInTime,
        setVideoOutTime,
        setMarker,
        setCurrentBlackboxTime,
        showValueTable,
        showConfigFile,
        newGraphConfig,
        toggleOverrideStatus,
        invalidateGraph,
        onSwitchWorkspace,
        onSaveWorkspace,
        lastGraphConfig,
    } = ctx;

    function handleWorkspaceKey(id: number, shiftKey: boolean) {
        const workspace = workspaceStore.workspaceGraphConfigs[id];
        if (!shiftKey) {
            if (workspace != null) {
                onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, id);
            }
        } else if (workspace) {
            onSaveWorkspace(id, workspace.title);
        } else {
            onSaveWorkspace(id, "Unnamed");
        }
    }

    function handleBookmarkSave(id: number) {
        if (id === 0) {
            workspaceStore.bookmarkTimes = [];
        } else if (workspaceStore.bookmarkTimes == null) {
            workspaceStore.bookmarkTimes = [];
            workspaceStore.bookmarkTimes[id] = logStore.currentBlackboxTime;
        } else if (workspaceStore.bookmarkTimes[id] == null) {
            workspaceStore.bookmarkTimes[id] = logStore.currentBlackboxTime;
        } else {
            workspaceStore.bookmarkTimes[id] = null;
        }
        invalidateGraph();
    }

    function handleDigitKey(e: KeyboardEvent) {
        const id = Number.parseInt(e.code.slice(5), 10);
        if (!e.altKey) {
            handleWorkspaceKey(id, e.shiftKey);
        } else if (e.shiftKey) {
            handleBookmarkSave(id);
        } else {
            const bookmark = workspaceStore.bookmarkTimes[id];
            if (bookmark != null) {
                setCurrentBlackboxTime(bookmark);
                invalidateGraph();
            }
        }
    }

    function handleKeyAnalyser(e: KeyboardEvent, shifted: boolean) {
        if (shifted) {
            graphStore.toggleAnalyserFullscreen();
        } else {
            graphStore.toggleAnalyser();
            e.preventDefault();
        }
    }

    function handleKeyVideoIn(e: KeyboardEvent, shifted: boolean) {
        if (!shifted) {
            setVideoInTime(
                playbackStore.videoExportInTime === logStore.currentBlackboxTime ? null : logStore.currentBlackboxTime,
            );
        }
        e.preventDefault();
    }

    function handleKeyVideoOut(e: KeyboardEvent, shifted: boolean) {
        if (!shifted) {
            setVideoOutTime(
                playbackStore.videoExportOutTime === logStore.currentBlackboxTime ? null : logStore.currentBlackboxTime,
            );
        }
        e.preventDefault();
    }

    function handleKeyMarker(e: KeyboardEvent) {
        if (e.altKey) {
            logSmartSync();
        } else {
            graphStore.markerTime = logStore.currentBlackboxTime;
            setMarker(!graphStore.hasMarker);
            appStore.statusMarkerOffset = graphStore.hasMarker ? `Marker Offset ${formatTime(0)}ms` : "";
            invalidateGraph();
        }
        e.preventDefault();
    }

    function handleKeyConfig(e: KeyboardEvent, shifted: boolean) {
        if (!shifted) {
            appStore.headerDialogOpen = false;
            showValueTable(false);
            showConfigFile();
            e.preventDefault();
        }
    }

    function handleKeyTable(e: KeyboardEvent, shifted: boolean) {
        if (!shifted) {
            appStore.headerDialogOpen = false;
            showValueTable();
            showConfigFile(false);
            invalidateGraph();
            e.preventDefault();
        }
    }

    function handleKeyZoom(e: KeyboardEvent) {
        try {
            if (e.ctrlKey) {
                const last = lastGraphConfig();
                if (last != null) {
                    newGraphConfig(last);
                }
            } else if (graphStore.graphZoom === GRAPH_MIN_ZOOM) {
                setGraphZoom(null);
            } else {
                setGraphZoom(GRAPH_MIN_ZOOM);
            }
        } catch {
            // Intentionally ignored — zoom toggle gracefully degrades when graph state is incomplete
        }
        e.preventDefault();
    }

    function handleKeySave(e: KeyboardEvent, shifted: boolean) {
        try {
            if (!shifted) {
                toggleOverrideStatus("graphSmoothOverride");
            } else if (e.shiftKey) {
                // A missing active workspace throws here, and the catch below drops the key.
                onSaveWorkspace(
                    workspaceStore.activeWorkspace,
                    workspaceStore.workspaceGraphConfigs[workspaceStore.activeWorkspace]!.title,
                );
            }
        } catch {
            // Intentionally ignored — smoothing/screenshot/save gracefully degrades when graph state is incomplete
        }
        e.preventDefault();
    }

    function handleKeyOverride(settingKey: OverrideSetting, e: KeyboardEvent, shifted: boolean) {
        try {
            if (!shifted) {
                toggleOverrideStatus(settingKey);
            }
        } catch {
            // Intentionally ignored — override gracefully degrades when graph state is incomplete
        }
        e.preventDefault();
    }

    // A Map, so a key such as "constructor" finds no handler, as it never had one.
    const letterKeyHandlers = new Map<string, LetterKeyHandler>([
        ["i", handleKeyVideoIn],
        ["o", handleKeyVideoOut],
        ["m", handleKeyMarker],
        ["c", handleKeyConfig],
        ["a", handleKeyAnalyser],
        [
            "h",
            (e, shifted) => {
                if (!shifted) {
                    if (!appStore.headerDialogOpen) {
                        showValueTable(false);
                        showConfigFile(false);
                    }
                    appStore.headerDialogOpen = !appStore.headerDialogOpen;
                    e.preventDefault();
                }
            },
        ],
        ["t", handleKeyTable],
        [
            "w",
            (e) => {
                if (e.shiftKey) {
                    workspaceStore.showDefaultMenu = true;
                }
            },
        ],
        [
            "f",
            (e, shifted) => {
                if (!shifted) {
                    graphStore.toggleFullscreen();
                    e.preventDefault();
                }
            },
        ],
        ["z", handleKeyZoom],
        ["s", handleKeySave],
        ["x", (e, shifted) => handleKeyOverride("graphExpoOverride", e, shifted)],
        ["g", (e, shifted) => handleKeyOverride("graphGridOverride", e, shifted)],
    ]);

    function handleLetterKey(e: KeyboardEvent, shifted: boolean) {
        // Use e.key.toLowerCase() instead of e.code to support non-QWERTY layouts.
        // e.code reports physical key position (e.g., "KeyM" is always the M key position),
        // but e.key reports the actual character produced based on the user's keyboard layout.
        // On AZERTY, the physical M key produces e.key === "m" but e.code === "Semicolon".
        const handler = letterKeyHandlers.get(e.key.toLowerCase());
        if (!handler) {
            return false;
        }
        handler(e, shifted);
        return true;
    }

    function handleNavigationKey(e: KeyboardEvent) {
        switch (e.code) {
            case "Space":
                logPlayPause();
                break;
            case "ArrowLeft":
                if (e.shiftKey) {
                    setGraphZoom(graphStore.graphZoom - 10 - (e.altKey ? 15 : 0));
                } else {
                    logJumpBack(null, e.altKey);
                }
                break;
            case "ArrowRight":
                if (e.shiftKey) {
                    setGraphZoom(graphStore.graphZoom + 10 + (e.altKey ? 15 : 0));
                } else {
                    logJumpForward(null, e.altKey);
                }
                break;
            case "PageUp":
                logJumpBack(0.25);
                break;
            case "PageDown":
                logJumpForward(0.25);
                break;
            case "Home":
                logJumpStart();
                break;
            case "End":
                logJumpEnd();
                break;
            case "Escape":
                // Leave fullscreen, unless Escape is already busy dismissing a dialog — that
                // traps focus inside itself, so the target tells us. Open popups never get
                // here; they are filtered out before dispatch.
                if (!graphStore.isFullscreen || (e.target as KeyTarget).closest?.("[role='dialog']")) {
                    return false;
                }
                graphStore.toggleFullscreen();
                break;
            default:
                return false;
        }
        e.preventDefault();
        return true;
    }

    // An open reka-ui dropdown menu or select owns the keyboard: it runs its own type-ahead
    // and arrow navigation, which every shortcut below would otherwise double up on. Only the
    // open popup is matched, never its trigger, so the shortcuts keep working while a closed
    // trigger holds focus — the same distinction createDropdownSpaceGuard draws below.
    const OPEN_POPUP = "[role='menu'],[role='listbox']";

    return function (e) {
        // Dormant behind other tabs (embedded): don't hijack keys the user means for the host.
        if (!appStore.viewerActive || isExportInProgress()) {
            return;
        }
        const target = e.target as KeyTarget;
        const shifted = e.altKey || e.shiftKey || e.ctrlKey || e.metaKey;
        if (e.key === "Enter" && target.type === "text" && !target.closest(".modal")) {
            target.blur();
        }
        if (hasGraph() && target.type !== "text" && !target.closest(".modal") && !target.closest?.(OPEN_POPUP)) {
            if (e.code.startsWith("Digit")) {
                try {
                    handleDigitKey(e);
                } catch {
                    // Intentionally ignored — workspace feature gracefully degrades when graph state is incomplete
                }
                e.preventDefault();
                return;
            }
            if (handleLetterKey(e, shifted)) {
                return;
            }
            handleNavigationKey(e);
        }
    };
}

/** What the Space guard needs from main.ts. */
export interface DropdownSpaceGuardContext {
    appStore: Pick<ReturnType<typeof useAppStore>, "viewerActive">;
    /** Returns true if a graph is loaded. */
    hasGraph: () => boolean;
    logPlayPause: () => void;
}

/**
 * Create a capture-phase Space guard for dropdown/select triggers.
 *
 * The dropdown and select controls in the viewer (Nuxt UI / reka-ui
 * `UDropdownMenu` and `USelect`) render a `<button>` trigger that reka returns
 * focus to when its popup closes. While that trigger is focused it handles Space
 * on its own keydown — toggling the popup — before the document-level handler's
 * play/pause shortcut ever sees the event, leaving the button "stuck" on Space
 * until focus moves elsewhere.
 *
 * Space is reserved for play/pause, so when such a trigger holds focus we
 * intercept Space in the capture phase (before it reaches the trigger), run
 * play/pause, and blur the trigger so it stops swallowing the shortcut. Only the
 * trigger element is matched (menu button via `aria-haspopup="menu"`, select
 * button via `role="combobox"`), so arrow-key navigation inside an open popup is
 * untouched.
 */
export function createDropdownSpaceGuard(ctx: DropdownSpaceGuardContext): (e: KeyboardEvent) => void {
    const { appStore, hasGraph, logPlayPause } = ctx;

    return function (e) {
        if (e.code !== "Space" || !appStore.viewerActive || isExportInProgress() || !hasGraph()) {
            return;
        }
        const target = e.target as KeyTarget | null;
        // Match a reka-ui dropdown-menu trigger (aria-haspopup="menu") or select
        // trigger (role="combobox") only — never the items inside an open popup.
        // Skip text-input comboboxes so typing a space there still works.
        const trigger = target?.closest?.<HTMLElement>("[aria-haspopup='menu'], [role='combobox']");
        if (!trigger || trigger.tagName === "INPUT" || target!.type === "text") {
            return;
        }
        // Stop the event from reaching the trigger's own keydown handler, drop
        // focus so future presses go to the shortcut, then play/pause.
        e.preventDefault();
        e.stopPropagation();
        trigger.blur();
        logPlayPause();
    };
}
