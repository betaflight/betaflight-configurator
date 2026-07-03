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
            default:
                return false;
        }
        e.preventDefault();
        return true;
    }

    return function (e) {
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
