import { formatTime } from "./tools.js";
import { GRAPH_MIN_ZOOM } from "./stores/graph.js";

/**
 * Create a keydown event handler for the document.
 *
 * @param {Object} ctx - Context object with dependencies from main.js
 * @param {Function} ctx.hasGraph - Returns true if a graph is loaded
 * @param {Object} ctx.graphStore - Graph Pinia store
 * @param {Object} ctx.logStore - Log Pinia store
 * @param {Object} ctx.playbackStore - Playback Pinia store
 * @param {Object} ctx.workspaceStore - Workspace Pinia store
 * @param {Object} ctx.appStore - App Pinia store
 * @param {Function} ctx.logPlayPause - Toggle play/pause
 * @param {Function} ctx.logJumpBack - Jump backward
 * @param {Function} ctx.logJumpForward - Jump forward
 * @param {Function} ctx.logJumpStart - Jump to log start
 * @param {Function} ctx.logJumpEnd - Jump to log end
 * @param {Function} ctx.logSmartSync - Smart video sync
 * @param {Function} ctx.setGraphZoom - Set graph zoom level
 * @param {Function} ctx.setVideoInTime - Set video export in-point
 * @param {Function} ctx.setVideoOutTime - Set video export out-point
 * @param {Function} ctx.setMarker - Set marker state
 * @param {Function} ctx.setCurrentBlackboxTime - Set current time
 * @param {Function} ctx.showValueTable - Toggle value table overlay
 * @param {Function} ctx.showConfigFile - Toggle config file overlay
 * @param {Function} ctx.newGraphConfig - Apply new graph configuration
 * @param {Function} ctx.toggleOverrideStatus - Toggle a user setting override
 * @param {Function} ctx.invalidateGraph - Queue graph re-render
 * @param {Function} ctx.onSwitchWorkspace - Switch to workspace
 * @param {Function} ctx.onSaveWorkspace - Save workspace
 * @returns {Function} keydown event handler
 */
export function createKeydownHandler(ctx) {
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

    function handleWorkspaceKey(id, shiftKey) {
        if (!shiftKey) {
            if (workspaceStore.workspaceGraphConfigs[id] != null) {
                onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, id);
            }
        } else if (workspaceStore.workspaceGraphConfigs[id]) {
            onSaveWorkspace(id, workspaceStore.workspaceGraphConfigs[id].title);
        } else {
            onSaveWorkspace(id, "Unnamed");
        }
    }

    function handleBookmarkSave(id) {
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

    function handleDigitKey(e) {
        const id = Number.parseInt(e.code.slice(5), 10);
        if (!e.altKey) {
            handleWorkspaceKey(id, e.shiftKey);
        } else if (e.shiftKey) {
            handleBookmarkSave(id);
        } else if (workspaceStore.bookmarkTimes[id] != null) {
            setCurrentBlackboxTime(workspaceStore.bookmarkTimes[id]);
            invalidateGraph();
        }
    }

    function handleAnalyserKey(shifted) {
        if (shifted) {
            graphStore.toggleAnalyserFullscreen();
        } else {
            graphStore.toggleAnalyser();
        }
    }

    function handleKeyVideoIn(e, shifted) {
        if (!shifted) {
            setVideoInTime(
                playbackStore.videoExportInTime === logStore.currentBlackboxTime ? null : logStore.currentBlackboxTime,
            );
        }
        e.preventDefault();
    }

    function handleKeyVideoOut(e, shifted) {
        if (!shifted) {
            setVideoOutTime(
                playbackStore.videoExportOutTime === logStore.currentBlackboxTime ? null : logStore.currentBlackboxTime,
            );
        }
        e.preventDefault();
    }

    function handleKeyMarker(e) {
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

    function handleKeyConfig(e, shifted) {
        if (!shifted) {
            appStore.headerDialogOpen = false;
            showValueTable(false);
            showConfigFile();
            e.preventDefault();
        }
    }

    function handleKeyTable(e, shifted) {
        if (!shifted) {
            appStore.headerDialogOpen = false;
            showValueTable();
            showConfigFile(false);
            invalidateGraph();
            e.preventDefault();
        }
    }

    function handleKeyZoom(e) {
        try {
            if (e.ctrlKey) {
                if (lastGraphConfig() != null) {
                    newGraphConfig(lastGraphConfig());
                }
            } else if (graphStore.graphZoom === GRAPH_MIN_ZOOM) {
                setGraphZoom(null, true);
            } else {
                setGraphZoom(GRAPH_MIN_ZOOM, true);
            }
        } catch {
            // Intentionally ignored — zoom toggle gracefully degrades when graph state is incomplete
        }
        e.preventDefault();
    }

    function handleKeySave(e, shifted) {
        try {
            if (!shifted) {
                toggleOverrideStatus("graphSmoothOverride");
            } else if (e.shiftKey) {
                onSaveWorkspace(
                    workspaceStore.activeWorkspace,
                    workspaceStore.workspaceGraphConfigs[workspaceStore.activeWorkspace].title,
                );
            }
        } catch {
            // Intentionally ignored — smoothing/screenshot/save gracefully degrades when graph state is incomplete
        }
        e.preventDefault();
    }

    function handleKeyOverride(settingKey, e, shifted) {
        try {
            if (!shifted) {
                toggleOverrideStatus(settingKey);
            }
        } catch {
            // Intentionally ignored — override gracefully degrades when graph state is incomplete
        }
        e.preventDefault();
    }

    const letterKeyHandlers = {
        KeyI: handleKeyVideoIn,
        KeyO: handleKeyVideoOut,
        KeyM: handleKeyMarker,
        KeyC: handleKeyConfig,
        KeyA(e, shifted) {
            handleAnalyserKey(shifted);
            if (!shifted) {
                e.preventDefault();
            }
        },
        KeyH(e, shifted) {
            if (!shifted) {
                if (!appStore.headerDialogOpen) {
                    showValueTable(false);
                    showConfigFile(false);
                }
                appStore.headerDialogOpen = !appStore.headerDialogOpen;
                e.preventDefault();
            }
        },
        KeyT: handleKeyTable,
        KeyW(e) {
            if (e.shiftKey) {
                workspaceStore.showDefaultMenu = true;
            }
        },
        KeyF(e, shifted) {
            if (!shifted) {
                graphStore.toggleFullscreen();
                e.preventDefault();
            }
        },
        KeyZ: handleKeyZoom,
        KeyS: handleKeySave,
        KeyX(e, shifted) {
            handleKeyOverride("graphExpoOverride", e, shifted);
        },
        KeyG(e, shifted) {
            handleKeyOverride("graphGridOverride", e, shifted);
        },
    };

    function handleLetterKey(e, shifted) {
        const handler = letterKeyHandlers[e.code];
        if (!handler) {
            return false;
        }
        handler(e, shifted);
        return true;
    }

    function handleNavigationKey(e) {
        switch (e.code) {
            case "Space":
                logPlayPause();
                break;
            case "ArrowLeft":
                if (e.shiftKey) {
                    setGraphZoom(graphStore.graphZoom - 10 - (e.altKey ? 15 : 0), true);
                } else {
                    logJumpBack(null, e.altKey);
                }
                break;
            case "ArrowRight":
                if (e.shiftKey) {
                    setGraphZoom(graphStore.graphZoom + 10 + (e.altKey ? 15 : 0), true);
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
                // Leave fullscreen, unless Escape is already busy dismissing a dialog, dropdown
                // menu or select — those trap focus inside themselves, so the target tells us.
                if (!graphStore.isFullscreen || e.target.closest?.("[role='dialog'],[role='menu'],[role='listbox']")) {
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

    return function (e) {
        // Dormant behind other tabs (embedded): don't hijack keys the user means for the host.
        if (!appStore.viewerActive) {
            return;
        }
        const shifted = e.altKey || e.shiftKey || e.ctrlKey || e.metaKey;
        if (e.key === "Enter" && e.target.type === "text" && !e.target.closest(".modal")) {
            e.target.blur();
        }
        if (hasGraph() && e.target.type !== "text" && !e.target.closest(".modal")) {
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
 *
 * @param {Object} ctx - Context object
 * @param {Object} ctx.appStore - App Pinia store
 * @param {Function} ctx.hasGraph - Returns true if a graph is loaded
 * @param {Function} ctx.logPlayPause - Toggle play/pause
 * @returns {Function} capture-phase keydown handler
 */
export function createDropdownSpaceGuard(ctx) {
    const { appStore, hasGraph, logPlayPause } = ctx;

    return function (e) {
        if (e.code !== "Space" || !appStore.viewerActive || !hasGraph()) {
            return;
        }
        // Match a reka-ui dropdown-menu trigger (aria-haspopup="menu") or select
        // trigger (role="combobox") only — never the items inside an open popup.
        // Skip text-input comboboxes so typing a space there still works.
        const trigger = e.target?.closest?.("[aria-haspopup='menu'], [role='combobox']");
        if (!trigger || trigger.tagName === "INPUT" || e.target.type === "text") {
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
