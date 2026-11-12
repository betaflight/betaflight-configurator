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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSystem = vi.hoisted(() => ({
    pickSaveFile: vi.fn(),
    writeFile: vi.fn(),
}));

vi.mock("../../src/js/FileSystem", () => ({ default: fileSystem }));

import { loadWorkspaces, saveWorkspaces, upgradeWorkspaceFormat } from "../../src/blackbox-viewer/workspace_io";
import type { WorkspaceList } from "../../src/blackbox-viewer/stores/workspace";

const INVALID_WORKSPACE_MESSAGE = "Invalid workspace file. No settings were changed.";
const HEADER_LAYOUT_STORAGE_KEYS = {
    hiddenGroups: "bbv-hidden-groups",
    hiddenFields: "bbv-hidden-fields",
    paneOrder: "bbv-pane-order",
};

type StoredLayout = Partial<Record<keyof typeof HEADER_LAYOUT_STORAGE_KEYS, string[]>>;

function stored(key: string): unknown {
    return JSON.parse(localStorage.getItem(key) ?? "null");
}

function emptyStore() {
    return { workspaceGraphConfigs: [] as WorkspaceList };
}

function textFile(contents: string) {
    return { text: vi.fn().mockResolvedValue(contents) };
}

function createExistingWorkspaceState() {
    const existingWorkspaces: WorkspaceList = [null, { title: "Existing", graphConfig: [] }];

    return {
        existingWorkspaces,
        workspaceStore: { workspaceGraphConfigs: existingWorkspaces },
        onSwitchWorkspace: vi.fn(),
    };
}

async function expectRejectedImport(
    payload: unknown,
    storedLayout: StoredLayout = { hiddenGroups: ["Rates"] },
    raw = false,
) {
    const { existingWorkspaces, workspaceStore, onSwitchWorkspace } = createExistingWorkspaceState();

    for (const [property, value] of Object.entries(storedLayout)) {
        localStorage.setItem(HEADER_LAYOUT_STORAGE_KEYS[property as keyof StoredLayout], JSON.stringify(value));
    }

    vi.spyOn(console, "error").mockImplementation(() => {});
    const contents = raw ? String(payload) : JSON.stringify(payload);

    await expect(loadWorkspaces(textFile(contents), workspaceStore, onSwitchWorkspace)).resolves.toBeUndefined();

    expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
    expect(onSwitchWorkspace).not.toHaveBeenCalled();
    for (const [property, value] of Object.entries(storedLayout)) {
        expect(stored(HEADER_LAYOUT_STORAGE_KEYS[property as keyof StoredLayout])).toEqual(value);
    }
    expect(globalThis.alert).toHaveBeenCalledWith(INVALID_WORKSPACE_MESSAGE);
}

async function importWorkspacePayload(payload: unknown) {
    const workspaceStore = emptyStore();
    const onSwitchWorkspace = vi.fn();

    await loadWorkspaces(textFile(JSON.stringify(payload)), workspaceStore, onSwitchWorkspace);

    return { workspaceStore, onSwitchWorkspace };
}

describe("Blackbox workspace export", () => {
    beforeEach(() => {
        localStorage.clear();
        fileSystem.pickSaveFile.mockReset().mockResolvedValue({ name: "workspaces.json" });
        fileSystem.writeFile.mockReset().mockResolvedValue(undefined);
    });

    it("includes the current header visibility and pane order", async () => {
        const workspaces = [null, { title: "Race", graphConfig: [{ label: "Gyro" }] }];
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        localStorage.setItem("bbv-hidden-fields", JSON.stringify(["debug_mode"]));
        localStorage.setItem("bbv-pane-order", JSON.stringify(["Rates", "PID Settings"]));

        await saveWorkspaces(workspaces);

        const [, serialized] = fileSystem.writeFile.mock.calls[0];
        expect(JSON.parse(serialized as string)).toEqual({
            version: 2,
            workspaces,
            headerLayout: {
                hiddenGroups: ["Rates"],
                hiddenFields: ["debug_mode"],
                paneOrder: ["Rates", "PID Settings"],
            },
        });
    });

    it("stops quietly when the dialog is cancelled or fails to open", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        fileSystem.pickSaveFile.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "AbortError" }));
        await saveWorkspaces([null]);
        expect(consoleError).not.toHaveBeenCalled();

        fileSystem.pickSaveFile.mockRejectedValueOnce(new Error("denied"));
        await saveWorkspaces([null]);
        expect(consoleError).toHaveBeenCalledOnce();

        fileSystem.pickSaveFile.mockResolvedValueOnce(null);
        await saveWorkspaces([null]);

        expect(fileSystem.writeFile).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it("offers the given file name", async () => {
        await saveWorkspaces([null], "mine.json");

        expect(fileSystem.pickSaveFile).toHaveBeenCalledWith(
            "mine.json",
            "Workspaces file",
            ".json",
            "blackbox-workspace-file",
        );
    });

    it("ignores non-array workspace input", async () => {
        await saveWorkspaces({ graphConfig: [] });

        expect(fileSystem.pickSaveFile).not.toHaveBeenCalled();
        expect(fileSystem.writeFile).not.toHaveBeenCalled();
    });

    it("ignores malformed workspace list input", async () => {
        await saveWorkspaces([null, { title: "Bad", graphConfig: {} }]);

        expect(fileSystem.pickSaveFile).not.toHaveBeenCalled();
        expect(fileSystem.writeFile).not.toHaveBeenCalled();
    });
});

describe("Blackbox workspace import", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.spyOn(globalThis, "alert").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("handles invalid JSON without changing workspace or header state", async () => {
        await expectRejectedImport("not json", undefined, true);
    });

    it.each([
        [
            "malformed versioned wrappers",
            {
                version: 2,
                workspaces: {},
                headerLayout: { hiddenGroups: [], hiddenFields: [], paneOrder: [] },
            },
        ],
        [
            "malformed versioned workspace slots",
            {
                version: 2,
                workspaces: [null, { title: "Bad", graphConfig: {} }],
                headerLayout: { hiddenGroups: ["PID Settings"], hiddenFields: [], paneOrder: [] },
            },
        ],
        ["unsupported workspace export versions", { version: 3, workspaces: [null] }],
        [
            "invalid header layout metadata",
            {
                version: 2,
                workspaces: [null, { title: "Imported", graphConfig: [] }],
                headerLayout: "invalid",
            },
        ],
        ["unsupported object payloads", { title: "Not a workspace file" }],
        ["malformed raw workspace slots", [null, { title: "Bad", graphConfig: {} }]],
        ["malformed original graphConfig slots", { graphConfig: [null, {}] }],
    ])("rejects %s before changing state", async (_description: string, payload: unknown) => {
        await expectRejectedImport(payload);
    });

    it("rejects partial header layout metadata without clearing the current layout", async () => {
        const importedWorkspaces = [null, { title: "Imported", graphConfig: [] }];
        await expectRejectedImport(
            {
                version: 2,
                workspaces: importedWorkspaces,
                headerLayout: { hiddenGroups: [] },
            },
            {
                hiddenGroups: ["Rates"],
                hiddenFields: ["debug_mode"],
                paneOrder: ["Rates", "Parameters"],
            },
        );
    });

    it("restores workspaces and header layout from a versioned bundle", async () => {
        const workspaces = [null, { title: "Freestyle", graphConfig: [{ label: "Motors" }] }];
        const file = textFile(
            JSON.stringify({
                version: 2,
                workspaces,
                headerLayout: {
                    hiddenGroups: ["PID Settings"],
                    hiddenFields: ["motor_pwm_rate"],
                    paneOrder: ["Motor / ESC", "Parameters"],
                },
            }),
        );
        const workspaceStore = emptyStore();
        const onSwitchWorkspace = vi.fn();

        await loadWorkspaces(file, workspaceStore, onSwitchWorkspace);

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(stored("bbv-hidden-groups")).toEqual(["PID Settings"]);
        expect(stored("bbv-hidden-fields")).toEqual(["motor_pwm_rate"]);
        expect(stored("bbv-pane-order")).toEqual(["Motor / ESC", "Parameters"]);
    });

    it("imports a versioned bundle without optional header layout metadata", async () => {
        const workspaces = [null, { title: "No metadata", graphConfig: [] }];
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));

        const { workspaceStore, onSwitchWorkspace } = await importWorkspacePayload({ version: 2, workspaces });

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(stored("bbv-hidden-groups")).toEqual(["Rates"]);
    });

    it("drops invalid and duplicate header layout entries", async () => {
        const file = textFile(
            JSON.stringify({
                version: 2,
                workspaces: [],
                headerLayout: {
                    hiddenGroups: ["Rates", 7, "Rates", null],
                    hiddenFields: ["debug_mode", {}, "debug_mode"],
                    paneOrder: ["Rates", "Rates", "Future Pane", false],
                },
            }),
        );

        await loadWorkspaces(file, emptyStore(), vi.fn());

        expect(stored("bbv-hidden-groups")).toEqual(["Rates"]);
        expect(stored("bbv-hidden-fields")).toEqual(["debug_mode"]);
        expect(stored("bbv-pane-order")).toEqual(["Rates", "Future Pane"]);
    });

    it("still imports the current array format without replacing the header layout", async () => {
        const workspaces = [null, { title: "Legacy array", graphConfig: [] }];
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));

        const { workspaceStore, onSwitchWorkspace } = await importWorkspacePayload(workspaces);

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(stored("bbv-hidden-groups")).toEqual(["Rates"]);
    });

    it("still upgrades the original graphConfig format", async () => {
        const workspaceStore = emptyStore();
        const onSwitchWorkspace = vi.fn();
        const originalFormat = { graphConfig: [null, [{ label: "Original workspace" }]] };

        await loadWorkspaces(textFile(JSON.stringify(originalFormat)), workspaceStore, onSwitchWorkspace);

        expect(workspaceStore.workspaceGraphConfigs).toEqual([
            null,
            { title: "Original workspace", graphConfig: [{ label: "Original workspace" }] },
        ]);
        expect(globalThis.alert).toHaveBeenCalledWith("Old Workspace format. Upgrading...");
    });
});

describe("upgradeWorkspaceFormat", () => {
    it("passes a workspace list through", () => {
        const workspaces: WorkspaceList = [null, { title: "Race", graphConfig: [] }];

        expect(upgradeWorkspaceFormat(workspaces)).toBe(workspaces);
    });

    it("titles each slot after its first panel, keeping empty and missing slots", () => {
        const gyro = { label: "Gyro", fields: [] };
        const graphConfig: Array<(typeof gyro)[] | null> = [null, [gyro], []];
        graphConfig[4] = [gyro]; // slot 3 is a hole

        const upgraded = upgradeWorkspaceFormat({ graphConfig });

        expect(upgraded).toEqual([
            null,
            { title: "Gyro", graphConfig: [gyro] },
            { title: "Unnamed", graphConfig: [] },
            undefined,
            { title: "Gyro", graphConfig: [gyro] },
        ]);
        expect(3 in upgraded).toBe(false);
    });
});

describe("Blackbox workspace import of a file claiming both formats", () => {
    it("keeps the versioned list, which the upgrade leaves as is", async () => {
        const alert = vi.spyOn(globalThis, "alert").mockImplementation(() => {});
        const workspaces = [null, { title: "Both", graphConfig: [] }];

        const { workspaceStore } = await importWorkspacePayload({ version: 2, workspaces, graphConfig: [] });

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(alert).toHaveBeenCalledWith("Old Workspace format. Upgrading...");
        alert.mockRestore();
    });
});
