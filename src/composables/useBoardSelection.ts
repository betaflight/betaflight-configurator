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

import { reactive, nextTick, onScopeDispose } from "vue";
import type { SelectMenuItem } from "@nuxt/ui";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { ispConnected } from "../js/utils/connection";
import GUI from "../js/gui";
import AutoDetect from "../js/utils/AutoDetect.js";

/** A board as the build API's `/api/targets` lists it. */
export interface TargetDescriptor {
    target: string;
    group?: string;
    [key: string]: unknown;
}

/** A target descriptor relabelled for the board USelectMenu. */
export interface BoardOption extends TargetDescriptor {
    label: string;
    groupKey: string;
    group: string;
}

/** A release as the build API's `/api/targets/<target>` lists it. */
export interface FirmwareRelease {
    release: string;
    label: string;
    type: string;
}

/**
 * A release as the version USelect lists it. `type` ("Stable", "Unstable", ...) is dropped:
 * Nuxt UI reads an item's `type` as its kind, "label" / "separator" / "item".
 */
export type FirmwareVersionOption = Omit<FirmwareRelease, "type">;

/**
 * A table value for `key` only if the table itself defines it: group names come from the build
 * API, and a group called "constructor" must not read Object.prototype.constructor.
 */
function ownValue<T>(table: Record<string, T>, key: string): T | undefined {
    return Object.hasOwn(table, key) ? table[key] : undefined;
}

export interface BoardSelectionBuildApi {
    loadTargets(): Promise<TargetDescriptor[] | null | undefined>;
    loadTargetReleases(target: string): Promise<{ releases: FirmwareRelease[] }>;
}

export interface BoardSelectionParams {
    buildApi: BoardSelectionBuildApi;
    $t: (key: string, params?: Record<string, unknown>) => string;
    updateTargetQualification: (targetName: string | null | undefined) => void;
    getSupportUrlForTarget: (targetName: string | null | undefined) => string;
    populateReleases: (target: { target: string; releases: FirmwareRelease[] }) => Promise<void>;
    enableLoadRemoteFileButton: (enabled: boolean) => void;
    flashingMessage: (message: string, type: string) => void;
    flashProgress: (value: number) => void;
    FLASH_MESSAGE_TYPES: Record<string, string>;
    getSelectedBuildType: () => number;
    logHead: string;
}

/**
 * A composable for handling board and firmware version selection.
 * Manages board/target lists, firmware version options, and related UI interactions.
 */
export function useBoardSelection(params: BoardSelectionParams) {
    const {
        buildApi,
        $t,
        updateTargetQualification,
        getSupportUrlForTarget,
        populateReleases,
        enableLoadRemoteFileButton,
        flashingMessage,
        flashProgress,
        FLASH_MESSAGE_TYPES,
        getSelectedBuildType,
        logHead,
    } = params;

    // Reactive state for board selection
    const state = reactive({
        targets: null as TargetDescriptor[] | null,
        boardOptions: [] as BoardOption[],
        selectedBoard: undefined as string | null | undefined,
        firmwareVersionOptions: [] as FirmwareVersionOption[],
        selectedFirmwareVersion: undefined as string | undefined,
        cloudBuildOptions: [] as string[],
        detectingBoard: false,
        /** Bound to USelectMenu search; used with ignore-filter to omit empty category headers */
        boardSelectSearchTerm: "",
    });

    let detectBoardTimeout: ReturnType<typeof setTimeout> | null = null;

    /**
     * Get board options formatted for Nuxt UI SelectMenu with labeled group separations.
     * Returns a flat array with `type: 'label'` and `type: 'separator'` entries between groups.
     * When `state.boardSelectSearchTerm` is set, only boards matching the search are included
     * and labels/separators appear only for groups that still have matches.
     */
    const getSelectMenuItems = () => {
        // Prototype-free, so any group name is an own key.
        const grouped: Record<string, { label: string; boards: BoardOption[] }> = Object.create(null);
        const groupOrder: Record<string, number | undefined> = { supported: 0, unsupported: 1, legacy: 2 };
        const q = (state.boardSelectSearchTerm || "").trim().toLowerCase();

        state.boardOptions.forEach((board) => {
            if (q && !board.target.toLowerCase().includes(q)) {
                return;
            }
            const groupLabel = board.group || "Other";
            const groupKey = board.groupKey || "other";
            if (!grouped[groupKey]) {
                grouped[groupKey] = { label: groupLabel, boards: [] };
            }
            grouped[groupKey].boards.push(board);
        });

        const sortedGroups = Object.entries(grouped)
            .filter(([_key, data]) => data.boards.length > 0)
            .sort(([a], [b]) => {
                const orderA = ownValue(groupOrder, a) ?? 999;
                const orderB = ownValue(groupOrder, b) ?? 999;
                return orderA - orderB;
            });

        const items: SelectMenuItem[] = [];
        sortedGroups.forEach(([_key, data], index) => {
            if (index > 0) {
                items.push({ type: "separator" });
            }
            items.push({ type: "label", label: data.label });

            const sortedBoards = [...data.boards].sort((a, b) => a.target.localeCompare(b.target));
            sortedBoards.forEach((board) => {
                items.push({
                    label: board.target,
                    value: board.target,
                });
            });
        });

        return items;
    };

    /**
     * Populate the target/board list from API response
     */
    const populateTargetList = async (targets: TargetDescriptor[] | null | undefined) => {
        if (!targets || !ispConnected()) {
            updateTargetQualification(null);
            state.boardOptions = [];
            state.firmwareVersionOptions = [];
            return;
        }

        // Build board options with optgroups
        const groupOrder: Record<string, number | undefined> = {
            supported: 0,
            unsupported: 1,
            legacy: 2,
        };

        const groupLabels: Record<string, string | undefined> = {
            supported: $t("firmwareFlasherOptionLabelVerifiedPartner"),
            unsupported: $t("firmwareFlasherOptionLabelVendorCommunity"),
            legacy: $t("firmwareFlasherOptionLabelLegacy"),
        };

        // Object.groupBy is ES2024, past the ES2022 target the build and tsconfig are pinned to.
        // Prototype-free like its result, so any group name is an own key.
        const groupTargets: Record<string, TargetDescriptor[]> = Object.create(null);
        for (const descriptor of targets) {
            const groupKey = descriptor.group ? descriptor.group : "unsupported";
            groupTargets[groupKey] ??= [];
            groupTargets[groupKey].push(descriptor);
        }

        const groupSorted = Object.keys(groupTargets).sort((a, b) => {
            const groupA = ownValue(groupOrder, a) ?? 999;
            const groupB = ownValue(groupOrder, b) ?? 999;
            return groupA - groupB;
        });

        // Create board options array
        const boardOptionsArray: BoardOption[] = [];
        groupSorted.forEach((groupKey) => {
            const groupItems = groupTargets[groupKey];
            const sortedTargets = [...groupItems].sort((a, b) => a.target.localeCompare(b.target));
            sortedTargets.forEach(function (descriptor) {
                boardOptionsArray.push({
                    ...descriptor,
                    target: descriptor.target,
                    label: descriptor.target,
                    groupKey: groupKey,
                    group: ownValue(groupLabels, groupKey) || groupKey,
                });
            });
        });

        state.boardOptions = boardOptionsArray;
        state.targets = targets;

        const result = getConfig<string | undefined>("selected_board");
        if (result.selected_board && state.boardOptions.some((b) => b.target === result.selected_board)) {
            state.selectedBoard = result.selected_board;
        }
    };

    /**
     * Handle build type change event
     */
    const onBuildTypeChange = async () => {
        const build_type = getSelectedBuildType();

        enableLoadRemoteFileButton(false);
        const selectedBoardTarget = state.selectedBoard;

        state.boardOptions = [];
        state.firmwareVersionOptions = [];

        if (GUI.connect_lock) {
            state.selectedBoard = undefined;
        } else {
            try {
                const targets = await buildApi.loadTargets();
                await populateTargetList(targets);

                if (selectedBoardTarget && state.boardOptions.some((b) => b.target === selectedBoardTarget)) {
                    state.selectedBoard = selectedBoardTarget;
                }
            } catch (error) {
                console.error(`${logHead} Failed to load targets:`, error);
            }
        }

        // Re-filter firmware versions based on new build type if a board is selected
        if (selectedBoardTarget) {
            try {
                const targetReleases = await buildApi.loadTargetReleases(selectedBoardTarget);
                await populateReleases({ target: selectedBoardTarget, releases: targetReleases.releases });
            } catch (error) {
                console.error(`${logHead} Failed to load target releases on build type change:`, error);
            }
        }

        setConfig({ selected_build_type: build_type });
    };

    /**
     * Handle board selection change event
     */
    const onBoardChange = async () => {
        const value = state.selectedBoard;
        const targetSupportUrl = getSupportUrlForTarget(value);
        enableLoadRemoteFileButton(false);

        updateTargetQualification(value);

        if (!value || value === "0") {
            state.firmwareVersionOptions = [];
            state.selectedFirmwareVersion = undefined;
            return { targetSupportUrl };
        }

        flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);
        flashProgress(0);

        try {
            const targetReleases = await buildApi.loadTargetReleases(value);
            await populateReleases({ target: value, releases: targetReleases.releases });
        } catch (error) {
            console.error(`${logHead} Failed to load target releases:`, error);
        }

        return { targetSupportUrl };
    };

    /**
     * Handle detect board button click
     */
    const handleDetectBoard = async () => {
        if (state.detectingBoard) {
            return;
        }

        state.detectingBoard = true;

        if (detectBoardTimeout !== null) {
            clearTimeout(detectBoardTimeout);
            detectBoardTimeout = null;
        }

        if (GUI.connect_lock) {
            detectBoardTimeout = setTimeout(() => {
                detectBoardTimeout = null;
                state.detectingBoard = false;
            }, 2000);
            return;
        }

        AutoDetect.verifyBoard(async (detectedBoardName: string) => {
            let found = state.boardOptions.find((b) => b.target === detectedBoardName);
            if (!found) {
                found = state.boardOptions.find(
                    (b) => b.target.trim().toLowerCase() === String(detectedBoardName).trim().toLowerCase(),
                );
            }
            if (found) {
                state.selectedBoard = null;
                await nextTick();
                state.selectedBoard = found.target;
                state.cloudBuildOptions = AutoDetect.cloudBuildOptions || [];
                await nextTick();
                await onBoardChange();
                return true;
            }
            return false;
        });

        detectBoardTimeout = setTimeout(() => {
            detectBoardTimeout = null;
            state.detectingBoard = false;
        }, 2000);
    };

    /**
     * Reset board selection state
     */
    const resetBoardSelection = () => {
        state.selectedBoard = undefined;
        state.boardOptions = [];
        state.firmwareVersionOptions = [];
        state.cloudBuildOptions = [];
        state.boardSelectSearchTerm = "";
    };

    onScopeDispose(() => {
        if (detectBoardTimeout !== null) {
            clearTimeout(detectBoardTimeout);
            detectBoardTimeout = null;
        }
    });

    return {
        // State
        state,

        // Methods
        getSelectMenuItems,
        populateTargetList,
        onBuildTypeChange,
        onBoardChange,
        handleDetectBoard,
        resetBoardSelection,
    };
}
