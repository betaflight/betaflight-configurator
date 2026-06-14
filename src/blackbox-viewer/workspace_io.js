import { triggerDownload } from "./tools.js";

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

export function saveWorkspaces(workspaceGraphConfigs, file) {
    if (!workspaceGraphConfigs) {
        return null;
    }
    if (!file) {
        file = "workspaces.json";
    }

    if (typeof workspaceGraphConfigs === "object") {
        const data = JSON.stringify(workspaceGraphConfigs, undefined, 4);
        triggerDownload(new Blob([data], { type: "text/json" }), file);
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
