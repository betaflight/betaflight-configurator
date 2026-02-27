import { reactive, nextTick } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { ispConnected } from "../js/utils/connection.js";
import GUI from "../js/gui";
import AutoDetect from "../js/utils/AutoDetect.js";

/**
 * A composable for handling board and firmware version selection.
 * Manages board/target lists, firmware version options, and related UI interactions.
 *
 * @param {Object} params - Configuration object
 * @param {Object} params.buildApi - BuildApi instance for making API calls
 * @param {Function} params.$t - Translation function
 * @param {Function} params.updateTargetQualification - Callback to update target qualification UI
 * @param {Function} params.getSupportUrlForTarget - Function to get support URL for a target
 * @param {Function} params.populateReleases - Callback to populate release options
 * @param {Function} params.enableLoadRemoteFileButton - Callback to enable/disable load remote button
 * @param {Function} params.flashingMessage - Callback to display flashing messages
 * @param {Function} params.flashProgress - Callback to update flash progress
 * @param {Object} params.FLASH_MESSAGE_TYPES - Flash message types enum
 * @param {Function} params.getSelectedBuildType - Function to get current build type
 * @param {string} params.logHead - Log prefix for console messages
 */
export function useBoardSelection(params) {
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
        targets: null,
        boardOptions: [],
        selectedBoard: undefined,
        firmwareVersionOptions: [],
        selectedFirmwareVersion: undefined,
        cloudBuildOptions: [],
    });

    /**
     * Get grouped and sorted board options for multiselect dropdown
     */
    const getGroupedBoardOptions = () => {
        const grouped = {};
        const groupOrder = { supported: 0, unsupported: 1, legacy: 2 };

        state.boardOptions.forEach((board) => {
            const groupLabel = board.group || "Other";
            const groupKey = board.groupKey || "other";
            if (!grouped[groupKey]) {
                grouped[groupKey] = { label: groupLabel, boards: [] };
            }
            grouped[groupKey].boards.push(board);
        });

        // Sort groups by order and return as array
        return Object.entries(grouped)
            .sort(([a], [b]) => {
                const orderA = groupOrder[a] ?? 999;
                const orderB = groupOrder[b] ?? 999;
                return orderA - orderB;
            })
            .map(([_key, data]) => ({
                name: data.label,
                boards: data.boards.sort((a, b) => a.target.localeCompare(b.target)),
            }));
    };

    /**
     * Populate the target/board list from API response
     */
    const populateTargetList = async (targets) => {
        if (!targets || !ispConnected()) {
            updateTargetQualification(null);
            state.boardOptions = [];
            state.firmwareVersionOptions = [];
            return;
        }

        // Build board options with optgroups
        const groupOrder = {
            supported: 0,
            unsupported: 1,
            legacy: 2,
        };

        const groupLabels = {
            supported: $t("firmwareFlasherOptionLabelVerifiedPartner"),
            unsupported: $t("firmwareFlasherOptionLabelVendorCommunity"),
            legacy: $t("firmwareFlasherOptionLabelLegacy"),
        };

        const groupTargets = Object.groupBy(targets, (descriptor) =>
            descriptor.group ? descriptor.group : "unsupported",
        );

        const groupSorted = Object.keys(groupTargets).sort((a, b) => {
            const groupA = groupOrder[a] ?? 999;
            const groupB = groupOrder[b] ?? 999;
            return groupA - groupB;
        });

        // Create board options array
        const boardOptionsArray = [];
        groupSorted.forEach((groupKey) => {
            const groupItems = groupTargets[groupKey];
            const sortedTargets = [...groupItems].sort((a, b) => a.target.localeCompare(b.target));
            sortedTargets.forEach(function (descriptor) {
                boardOptionsArray.push({
                    ...descriptor,
                    target: descriptor.target,
                    label: descriptor.target,
                    groupKey: groupKey,
                    group: groupLabels[groupKey] || groupKey,
                });
            });
        });

        state.boardOptions = boardOptionsArray;
        state.targets = targets;

        const result = getConfig("selected_board");
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
        const currentlySelectedBoard = state.selectedBoard;
        const selectedBoardTarget =
            typeof currentlySelectedBoard === "string" ? currentlySelectedBoard : currentlySelectedBoard?.target;

        state.boardOptions = [];
        state.firmwareVersionOptions = [];

        if (GUI.connect_lock) {
            state.selectedBoard = undefined;
        } else {
            try {
                const targets = await buildApi.loadTargets();
                await populateTargetList(targets);

                if (currentlySelectedBoard && state.boardOptions.some((b) => b.target === selectedBoardTarget)) {
                    state.selectedBoard = currentlySelectedBoard;
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
        // Extract target string from board object
        const value = typeof state.selectedBoard === "string" ? state.selectedBoard : state.selectedBoard?.target;
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
    const handleDetectBoard = async (detectBoardButtonRef) => {
        const detectBoardElement = detectBoardButtonRef.value;
        if (!detectBoardElement?.classList.contains("disabled")) {
            detectBoardElement?.classList.add("disabled");

            if (GUI.connect_lock) {
                setTimeout(() => detectBoardElement?.classList.remove("disabled"), 2000);
                return;
            }

            // Pass a callback to AutoDetect that sets the selected board if found
            AutoDetect.verifyBoard(async (detectedBoardName) => {
                let found = state.boardOptions.find((b) => b.target === detectedBoardName);
                if (!found) {
                    // Try to find a match ignoring case and whitespace
                    found = state.boardOptions.find(
                        (b) => b.target.trim().toLowerCase() === String(detectedBoardName).trim().toLowerCase(),
                    );
                }
                if (found) {
                    state.selectedBoard = null;
                    await nextTick();
                    state.selectedBoard = found;
                    // Always sync from AutoDetect
                    state.cloudBuildOptions = AutoDetect.cloudBuildOptions || [];
                    await nextTick();
                    await onBoardChange();
                    return true;
                }
                return false;
            });

            setTimeout(() => detectBoardElement?.classList.remove("disabled"), 2000);
        }
    };

    /**
     * Reset board selection state
     */
    const resetBoardSelection = () => {
        state.selectedBoard = undefined;
        state.boardOptions = [];
        state.firmwareVersionOptions = [];
        state.cloudBuildOptions = [];
    };

    return {
        // State
        state,

        // Methods
        getGroupedBoardOptions,
        populateTargetList,
        onBuildTypeChange,
        onBoardChange,
        handleDetectBoard,
        resetBoardSelection,
    };
}
