import FileSystem from "../js/FileSystem";

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
    if (!workspaceGraphConfigs || typeof workspaceGraphConfigs !== "object") {
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

    const data = JSON.stringify(workspaceGraphConfigs, undefined, 4);
    try {
        await FileSystem.writeFile(handle, data);
    } catch (error) {
        console.error("Failed to write workspaces file:", error);
    }
}

export function loadWorkspaces(file, workspaceStore, onSwitchWorkspace) {
    file.text().then((data) => {
        let tmp = JSON.parse(data);
        if (tmp.graphConfig) {
            globalThis.alert("Old Workspace format. Upgrading...");
            tmp = upgradeWorkspaceFormat(tmp);
        }
        workspaceStore.workspaceGraphConfigs = tmp;
        onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, 1);
        globalThis.alert("Workspaces Loaded");
    });
}
