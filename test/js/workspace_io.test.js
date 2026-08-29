import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSystem = vi.hoisted(() => ({
    pickSaveFile: vi.fn(),
    writeFile: vi.fn(),
}));

vi.mock("../../src/js/FileSystem", () => ({ default: fileSystem }));

import { loadWorkspaces, saveWorkspaces } from "../../src/blackbox-viewer/workspace_io.js";

const INVALID_WORKSPACE_MESSAGE = "Invalid workspace file. No settings were changed.";
const HEADER_LAYOUT_STORAGE_KEYS = {
    hiddenGroups: "bbv-hidden-groups",
    hiddenFields: "bbv-hidden-fields",
    paneOrder: "bbv-pane-order",
};

function createExistingWorkspaceState() {
    const existingWorkspaces = [null, { title: "Existing", graphConfig: [] }];

    return {
        existingWorkspaces,
        workspaceStore: { workspaceGraphConfigs: existingWorkspaces },
        onSwitchWorkspace: vi.fn(),
    };
}

async function expectRejectedImport(payload, storedLayout = { hiddenGroups: ["Rates"] }, raw = false) {
    const { existingWorkspaces, workspaceStore, onSwitchWorkspace } = createExistingWorkspaceState();

    for (const [property, value] of Object.entries(storedLayout)) {
        localStorage.setItem(HEADER_LAYOUT_STORAGE_KEYS[property], JSON.stringify(value));
    }

    vi.spyOn(console, "error").mockImplementation(() => {});
    const contents = raw ? payload : JSON.stringify(payload);

    await expect(
        loadWorkspaces({ text: vi.fn().mockResolvedValue(contents) }, workspaceStore, onSwitchWorkspace),
    ).resolves.toBeUndefined();

    expect(workspaceStore.workspaceGraphConfigs).toBe(existingWorkspaces);
    expect(onSwitchWorkspace).not.toHaveBeenCalled();
    for (const [property, value] of Object.entries(storedLayout)) {
        expect(JSON.parse(localStorage.getItem(HEADER_LAYOUT_STORAGE_KEYS[property]))).toEqual(value);
    }
    expect(globalThis.alert).toHaveBeenCalledWith(INVALID_WORKSPACE_MESSAGE);
}

async function importWorkspacePayload(payload) {
    const workspaceStore = {};
    const onSwitchWorkspace = vi.fn();

    await loadWorkspaces(
        { text: vi.fn().mockResolvedValue(JSON.stringify(payload)) },
        workspaceStore,
        onSwitchWorkspace,
    );

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
    ])("rejects %s before changing state", async (_description, payload) => {
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
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));

        const { workspaceStore, onSwitchWorkspace } = await importWorkspacePayload({ version: 2, workspaces });

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

    it("still imports the current array format without replacing the header layout", async () => {
        const workspaces = [null, { title: "Legacy array", graphConfig: [] }];
        localStorage.setItem("bbv-hidden-groups", JSON.stringify(["Rates"]));

        const { workspaceStore, onSwitchWorkspace } = await importWorkspacePayload(workspaces);

        expect(workspaceStore.workspaceGraphConfigs).toEqual(workspaces);
        expect(onSwitchWorkspace).toHaveBeenCalledWith(workspaces, 1);
        expect(JSON.parse(localStorage.getItem("bbv-hidden-groups"))).toEqual(["Rates"]);
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
