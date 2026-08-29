import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSystem = vi.hoisted(() => ({
    pickSaveFile: vi.fn(),
    writeFile: vi.fn(),
}));

vi.mock("../../src/js/FileSystem", () => ({ default: fileSystem }));

import { loadWorkspaces, saveWorkspaces } from "../../src/blackbox-viewer/workspace_io.js";

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
        expect(JSON.parse(serialized)).toEqual({
            version: 2,
            workspaces,
            headerLayout: {
                hiddenGroups: ["Rates"],
                hiddenFields: ["debug_mode"],
                paneOrder: ["Rates", "PID Settings"],
            },
        });
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
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
            loadWorkspaces({ text: vi.fn().mockResolvedValue("not json") }, workspaceStore, onSwitchWorkspace),
        ).resolves.toBeUndefined();

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("rejects malformed versioned wrappers before changing state", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const malformed = {
            version: 2,
            workspaces: {},
            headerLayout: { hiddenGroups: [], hiddenFields: [], paneOrder: [] },
        };

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify(malformed)) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("rejects a malformed versioned workspace slot before changing state", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const malformed = {
            version: 2,
            workspaces: [null, { title: "Bad", graphConfig: {} }],
            headerLayout: { hiddenGroups: ["PID Settings"], hiddenFields: [], paneOrder: [] },
        };

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify(malformed)) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("rejects unsupported workspace export versions", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});

        await loadWorkspaces(
            {
                text: vi
                    .fn()
                    .mockResolvedValue(JSON.stringify({ version: 3, workspaces: [null], headerLayout: undefined })),
            },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("rejects invalid header layout metadata before changing state", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const importedWorkspaces = [null, { title: "Imported", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await loadWorkspaces(
            {
                text: vi
                    .fn()
                    .mockResolvedValue(
                        JSON.stringify({ version: 2, workspaces: importedWorkspaces, headerLayout: "invalid" }),
                    ),
            },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("rejects partial header layout metadata without clearing the current layout", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const importedWorkspaces = [null, { title: "Imported", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        localStorage.setItem("bbv-hidden-fields", JSON.stringify(["debug_mode"]));
        localStorage.setItem("bbv-pane-order", JSON.stringify(["Rates", "Parameters"]));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await loadWorkspaces(
            {
                text: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        version: 2,
                        workspaces: importedWorkspaces,
                        headerLayout: { hiddenGroups: [] },
                    }),
                ),
            },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-fields"))).toEqual(["debug_mode"]);
        expect(JSON.parse(localStorage.getItem("bbv-pane-order"))).toEqual(["Rates", "Parameters"]);
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("rejects unsupported object payloads before changing state", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify({ title: "Not a workspace file" })) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("restores workspaces and header layout from a versioned bundle", async () => {
        const workspaces = [null, { title: "Freestyle", graphConfig: [{ label: "Motors" }] }];
        const file = {
            text: vi.fn().mockResolvedValue(
                JSON.stringify({
                    version: 2,
                    workspaces,
                    headerLayout: {
                        hiddenGroups: ["PID Settings"],
                        hiddenFields: ["motor_pwm_rate"],
                        paneOrder: ["Motor / ESC", "Parameters"],
                    },
                }),
            ),
        };
        const workspaceStore = {};
        const onSwitchWorkspace = vi.fn();

        await loadWorkspaces(file, workspaceStore, onSwitchWorkspace);

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["PID Settings"]);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-fields"))).toEqual(["motor_pwm_rate"]);
        expect(JSON.parse(localStorage.getItem("bbv-pane-order"))).toEqual(["Motor / ESC", "Parameters"]);
    });

    it("imports a versioned bundle without optional header layout metadata", async () => {
        const workspaces = [null, { title: "No metadata", graphConfig: [] }];
        const workspaceStore = {};
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));

        await loadWorkspaces(
            {
                text: vi.fn().mockResolvedValue(JSON.stringify({ version: 2, workspaces })),
            },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
    });

    it("drops invalid and duplicate header layout entries", async () => {
        const file = {
            text: vi.fn().mockResolvedValue(
                JSON.stringify({
                    version: 2,
                    workspaces: [],
                    headerLayout: {
                        hiddenGroups: ["Rates", 7, "Rates", null],
                        hiddenFields: ["debug_mode", {}, "debug_mode"],
                        paneOrder: ["Rates", "Rates", "Future Pane", false],
                    },
                }),
            ),
        };

        await loadWorkspaces(file, {}, vi.fn());

        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-fields"))).toEqual(["debug_mode"]);
        expect(JSON.parse(localStorage.getItem("bbv-pane-order"))).toEqual(["Rates", "Future Pane"]);
    });

    it("rejects a malformed raw workspace slot before changing state", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const malformed = [null, { title: "Bad", graphConfig: {} }];

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify(malformed)) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("still imports the current array format without replacing the header layout", async () => {
        const workspaces = [null, { title: "Legacy array", graphConfig: [] }];
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));
        const workspaceStore = {};
        const onSwitchWorkspace = vi.fn();

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify(workspaces)) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
    });

    it("rejects a malformed original graphConfig slot before changing state", async () => {
        const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];
        const workspaceStore = { workspaceGraphConfigs: existingWorkspaces };
        const onSwitchWorkspace = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});
        const malformed = { graphConfig: [null, {}] };

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify(malformed)) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
        expect(onSwitchWorkspace).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith("Invalid workspace file. No settings were changed.");
    });

    it("still upgrades the original graphConfig format", async () => {
        const workspaceStore = {};
        const onSwitchWorkspace = vi.fn();
        const originalFormat = { graphConfig: [null, [{ label: "Original workspace" }]] };

        await loadWorkspaces(
            { text: vi.fn().mockResolvedValue(JSON.stringify(originalFormat)) },
            workspaceStore,
            onSwitchWorkspace,
        );

        expect(workspaceStore.workspaceGraphConfigs).toEqual([
            null,
            { title: "Original workspace", graphConfig: [{ label: "Original workspace" }] },
        ]);
        expect(globalThis.alert).toHaveBeenCalledWith("Old Workspace format. Upgrading...");
    });
});
