import FileSystem from "../js/FileSystem";
import { loadHeaderLayout, saveHeaderLayout } from "./header_layout";

const WORKSPACE_EXPORT_VERSION = 2;

/** @param {unknown} value */
function isHeaderLayout(value) {
    if (value === undefined) {
        return true;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    return ["hiddenGroups", "hiddenFields", "paneOrder"].every(
        (key) => Object.hasOwn(value, key) && Array.isArray(value[key]),
    );
}

/** @param {unknown} value */
function isWorkspaceList(value) {
    return (
        Array.isArray(value) &&
        value.every(
            (workspace) =>
                workspace === null ||
                (typeof workspace === "object" && !Array.isArray(workspace) && Array.isArray(workspace.graphConfig)),
        )
    );
}

/** @param {unknown} error */
function reportInvalidWorkspace(error) {
    console.error("Failed to load workspace file:", error);
    globalThis.alert("Invalid workspace file. No settings were changed.");
}

export function upgradeWorkspaceFormat(oldFormat) {
    if (!oldFormat.graphConfig) {
        return oldFormat;
    }

    const newFormat = [];

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

export async function saveWorkspaces(workspaceGraphConfigs, file) {
    if (!isWorkspaceList(workspaceGraphConfigs)) {
        return;
    }

    // Open the save dialog first to keep the export button's user gesture, then
    // write through the shared FileSystem wrapper. The blackbox-viewer subsystem
    // is English-only for now, so the description is a plain string.
    let handle;
    try {
        handle = await FileSystem.pickSaveFile(file || "workspaces.json", "Workspaces file", ".json");
    } catch (error) {
        if (error?.name === "AbortError") {
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

/**
 * @param {{ text: () => Promise<string> }} file
 * @param {{ workspaceGraphConfigs: unknown }} workspaceStore
 * @param {(workspaces: unknown, id: number) => void} onSwitchWorkspace
 */
export async function loadWorkspaces(file, workspaceStore, onSwitchWorkspace) {
    let tmp;
    try {
        tmp = JSON.parse(await file.text());
    } catch (error) {
        reportInvalidWorkspace(error);
        return;
    }

    const isVersioned =
        tmp !== null &&
        typeof tmp === "object" &&
        !Array.isArray(tmp) &&
        (Object.hasOwn(tmp, "version") || Object.hasOwn(tmp, "workspaces"));
    const isLegacy = tmp !== null && typeof tmp === "object" && !Array.isArray(tmp) && Array.isArray(tmp.graphConfig);
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
    if (isLegacy && !tmp.graphConfig.every((graphConfig) => graphConfig === null || Array.isArray(graphConfig))) {
        reportInvalidWorkspace(new Error("Invalid original workspace file structure"));
        return;
    }

    if (isVersioned) {
        if (tmp.headerLayout) {
            saveHeaderLayout(tmp.headerLayout);
        }
        tmp = tmp.workspaces;
    }
    if (isLegacy) {
        globalThis.alert("Old Workspace format. Upgrading...");
        tmp = upgradeWorkspaceFormat(tmp);
    }
    workspaceStore.workspaceGraphConfigs = tmp;
    onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, 1);
    globalThis.alert("Workspaces Loaded");
}
