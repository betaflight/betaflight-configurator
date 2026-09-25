import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import GUI from "../../src/js/gui";

import { useBoardSelection, type BoardSelectionParams } from "../../src/composables/useBoardSelection";

vi.mock("../../src/js/utils/connection", () => ({ ispConnected: () => true }));

function makeParams(): BoardSelectionParams {
    return {
        buildApi: {
            loadTargets: vi.fn().mockResolvedValue([]),
            loadTargetReleases: vi.fn().mockResolvedValue({ releases: [] }),
        },
        $t: (key: string) => key,
        updateTargetQualification: vi.fn(),
        getSupportUrlForTarget: vi.fn(),
        populateReleases: vi.fn(),
        enableLoadRemoteFileButton: vi.fn(),
        flashingMessage: vi.fn(),
        flashProgress: vi.fn(),
        FLASH_MESSAGE_TYPES: { NEUTRAL: "neutral", INVALID: "invalid" },
        getSelectedBuildType: vi.fn(),
        logHead: "[TEST]",
    };
}

describe("useBoardSelection", () => {
    let scope: EffectScope;
    let boardSelection: ReturnType<typeof useBoardSelection>;

    beforeEach(() => {
        vi.useFakeTimers();
        GUI.connect_lock = false;

        scope = effectScope();
        scope.run(() => {
            boardSelection = useBoardSelection(makeParams());
        });
    });

    afterEach(() => {
        scope.stop();
        vi.runAllTimers();
        GUI.connect_lock = false;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("clears the detect-board timeout on scope dispose, so detectingBoard stays stuck", async () => {
        // The GUI.connect_lock branch is the smallest surface that schedules the
        // 2000ms timeout without needing to entangle AutoDetect.verifyBoard.
        GUI.connect_lock = true;

        await boardSelection.handleDetectBoard();
        expect(boardSelection.state.detectingBoard).toBe(true);

        scope.stop();
        await vi.advanceTimersByTimeAsync(2100);

        // Dispose cleared the pending timeout before it could reset detectingBoard.
        expect(boardSelection.state.detectingBoard).toBe(true);
    });

    it("without dispose, the timeout still fires and resets detectingBoard (proves the test is not vacuous)", async () => {
        GUI.connect_lock = true;

        await boardSelection.handleDetectBoard();
        expect(boardSelection.state.detectingBoard).toBe(true);

        await vi.advanceTimersByTimeAsync(2100);

        expect(boardSelection.state.detectingBoard).toBe(false);
    });

    it("groups boards by support level, supported first, ungrouped targets as community", async () => {
        localStorage.clear();
        await boardSelection.populateTargetList([
            { target: "ZETA", group: "legacy" },
            { target: "BETA" },
            { target: "DELTA", group: "supported" },
            { target: "ALPHA" },
            { target: "GAMMA", group: "supported" },
        ]);

        expect(boardSelection.state.boardOptions.map((b) => [b.target, b.groupKey, b.group])).toEqual([
            ["DELTA", "supported", "firmwareFlasherOptionLabelVerifiedPartner"],
            ["GAMMA", "supported", "firmwareFlasherOptionLabelVerifiedPartner"],
            ["ALPHA", "unsupported", "firmwareFlasherOptionLabelVendorCommunity"],
            ["BETA", "unsupported", "firmwareFlasherOptionLabelVendorCommunity"],
            ["ZETA", "legacy", "firmwareFlasherOptionLabelLegacy"],
        ]);
    });
});
