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

import FileSystem from "../js/FileSystem";
import { loadHeaderLayout, saveHeaderLayout, type HeaderLayout } from "./header_layout";
import type { GraphPanelConfig } from "./stores/graph";
import type { WorkspaceList } from "./stores/workspace";

const WORKSPACE_EXPORT_VERSION = 2;

/** The pre-title format: one graph config per slot. */
interface LegacyWorkspaces {
    graphConfig: Array<GraphPanelConfig[] | null | undefined>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHeaderLayout(value: unknown): value is HeaderLayout | undefined {
    if (value === undefined) {
        return true;
    }
    if (!isPlainObject(value)) {
        return false;
    }
    return ["hiddenGroups", "hiddenFields", "paneOrder"].every(
        (key) => Object.hasOwn(value, key) && Array.isArray(value[key]),
    );
}

// Shallow, as it always was: a slot needs a graphConfig array, whose panels are trusted.
function isWorkspaceList(value: unknown): value is WorkspaceList {
    return (
        Array.isArray(value) &&
        value.every(
            (workspace: unknown) =>
                workspace === null || (isPlainObject(workspace) && Array.isArray(workspace.graphConfig)),
        )
    );
}

function reportInvalidWorkspace(error: unknown): void {
    console.error("Failed to load workspace file:", error);
    globalThis.alert("Invalid workspace file. No settings were changed.");
}

export function upgradeWorkspaceFormat(oldFormat: WorkspaceList | LegacyWorkspaces): WorkspaceList {
    if (!("graphConfig" in oldFormat) || !oldFormat.graphConfig) {
        return oldFormat as WorkspaceList;
    }

    const newFormat: WorkspaceList = [];

    oldFormat.graphConfig.forEach((element, id) => {
        if (element) {
            let title = "Unnamed";
            if (element.length > 0) {
                title = element[0].label;
            }

            newFormat[id] = {
                title: title,
                graphConfig: element,
            };
        } else {
            newFormat[id] = null;
        }
    });

    return newFormat;
}

export async function saveWorkspaces(workspaceGraphConfigs: unknown, file?: string): Promise<void> {
    if (!isWorkspaceList(workspaceGraphConfigs)) {
        return;
    }

    // Open the save dialog first to keep the export button's user gesture, then
    // write through the shared FileSystem wrapper. The blackbox-viewer subsystem
    // is English-only for now, so the description is a plain string.
    let handle;
    try {
        handle = await FileSystem.pickSaveFile(
            file || "workspaces.json",
            "Workspaces file",
            ".json",
            "blackbox-workspace-file",
        );
    } catch (error) {
        if ((error as { name?: unknown } | null)?.name === "AbortError") {
            return; // user cancelled the dialog
        }
        console.error("Failed to open save dialog for workspaces export:", error);
        return;
    }

    if (!handle) {
        return;
    }

    const data = JSON.stringify(
        {
            version: WORKSPACE_EXPORT_VERSION,
            workspaces: workspaceGraphConfigs,
            headerLayout: loadHeaderLayout(),
        },
        undefined,
        4,
    );
    try {
        await FileSystem.writeFile(handle, data);
    } catch (error) {
        console.error("Failed to write workspaces file:", error);
    }
}

export async function loadWorkspaces(
    file: Pick<File, "text">,
    workspaceStore: { workspaceGraphConfigs: WorkspaceList },
    onSwitchWorkspace: (workspaces: WorkspaceList, id: number) => void,
): Promise<void> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await file.text());
    } catch (error) {
        reportInvalidWorkspace(error);
        return;
    }
    const tmp = parsed;

    const isVersioned = isPlainObject(tmp) && (Object.hasOwn(tmp, "version") || Object.hasOwn(tmp, "workspaces"));
    const isLegacy = isPlainObject(tmp) && Array.isArray(tmp.graphConfig);
    if (isVersioned && (tmp.version !== WORKSPACE_EXPORT_VERSION || !isWorkspaceList(tmp.workspaces))) {
        reportInvalidWorkspace(new Error("Invalid workspace file structure"));
        return;
    }
    if (isVersioned && !isHeaderLayout(tmp.headerLayout)) {
        reportInvalidWorkspace(new Error("Invalid workspace header layout"));
        return;
    }
    if (!isVersioned && !isLegacy && !isWorkspaceList(tmp)) {
        reportInvalidWorkspace(new Error("Unsupported workspace file structure"));
        return;
    }
    if (
        isLegacy &&
        !(tmp.graphConfig as unknown[]).every((graphConfig) => graphConfig === null || Array.isArray(graphConfig))
    ) {
        reportInvalidWorkspace(new Error("Invalid original workspace file structure"));
        return;
    }

    // The checks above leave a versioned file, a legacy one, or a bare workspace list. A file
    // can claim to be both versioned and legacy; its workspace list then passes through the
    // upgrade unchanged, as it always has.
    let workspaces = tmp as WorkspaceList | LegacyWorkspaces;
    if (isVersioned) {
        if (tmp.headerLayout) {
            saveHeaderLayout(tmp.headerLayout);
        }
        workspaces = tmp.workspaces as WorkspaceList;
    }
    if (isLegacy) {
        globalThis.alert("Old Workspace format. Upgrading...");
        workspaces = upgradeWorkspaceFormat(workspaces);
    }
    workspaceStore.workspaceGraphConfigs = workspaces as WorkspaceList;
    onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, 1);
    globalThis.alert("Workspaces Loaded");
}
