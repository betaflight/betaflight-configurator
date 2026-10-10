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
import { effectScope, type EffectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useConnectionStore } from "../../src/stores/connection";

import {
    requireTargetReleases,
    useBoardSelection,
    type BoardSelectionParams,
} from "../../src/composables/useBoardSelection";

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
        setActivePinia(createPinia());
        useConnectionStore().connectLock = false;

        scope = effectScope();
        scope.run(() => {
            boardSelection = useBoardSelection(makeParams());
        });
    });

    afterEach(() => {
        scope.stop();
        vi.runAllTimers();
        useConnectionStore().connectLock = false;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("clears the detect-board timeout on scope dispose, so detectingBoard stays stuck", async () => {
        // The connectLock branch is the smallest surface that schedules the
        // 2000ms timeout without needing to entangle AutoDetect.verifyBoard.
        useConnectionStore().connectLock = true;

        await boardSelection.handleDetectBoard();
        expect(boardSelection.state.detectingBoard).toBe(true);

        scope.stop();
        await vi.advanceTimersByTimeAsync(2100);

        // Dispose cleared the pending timeout before it could reset detectingBoard.
        expect(boardSelection.state.detectingBoard).toBe(true);
    });

    it("without dispose, the timeout still fires and resets detectingBoard (proves the test is not vacuous)", async () => {
        useConnectionStore().connectLock = true;

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

    it("treats group names like constructor and __proto__ as ordinary groups", async () => {
        localStorage.clear();
        await boardSelection.populateTargetList([
            { target: "BETA", group: "constructor" },
            { target: "ALPHA", group: "__proto__" },
            { target: "GAMMA", group: "supported" },
        ]);

        expect(boardSelection.state.boardOptions.map((b) => [b.target, b.groupKey, b.group])).toEqual([
            ["GAMMA", "supported", "firmwareFlasherOptionLabelVerifiedPartner"],
            ["BETA", "constructor", "constructor"],
            ["ALPHA", "__proto__", "__proto__"],
        ]);

        const labels = boardSelection
            .getSelectMenuItems()
            .flatMap((item) => (typeof item === "object" && item?.type === "label" ? [item.label] : []));
        expect(labels).toEqual(["firmwareFlasherOptionLabelVerifiedPartner", "constructor", "__proto__"]);
    });
});

describe("requireTargetReleases", () => {
    it("throws when the build server lists no releases, so the caller's catch logs it", async () => {
        const buildApi = { loadTargetReleases: vi.fn().mockResolvedValue(null) };

        await expect(requireTargetReleases(buildApi, "NOPE")).rejects.toThrow("NOPE");
    });

    it("passes a release list through", async () => {
        const list = { releases: [{ release: "4.5.0", label: "4.5.0", type: "Stable" }] };

        await expect(requireTargetReleases({ loadTargetReleases: vi.fn().mockResolvedValue(list) }, "X")).resolves.toBe(
            list,
        );
    });
});
