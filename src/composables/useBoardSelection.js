import { reactive, nextTick, onScopeDispose } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { ispConnected } from "../js/utils/connection.js";
import GUI from "../js/gui";
import AutoDetect from "../js/utils/AutoDetect.js";

const NO_FILTER_VALUE = "__no_filter__";

/**
 * MCU variants that should appear as one filter option.
 *
 * @type {Array<{ label: string, value: string, members: string[] }>}
 */
const MCU_FILTER_GROUPS = [
    {
        label: "AT32F435",
        value: "AT32F435",
        members: ["AT32F435G", "AT32F435M"],
    },
    {
        label: "RP2350",
        value: "RP2350",
        members: ["RP2350A", "RP2350B"],
    },
];

const mcuFilterGroupByMember = new Map(
    MCU_FILTER_GROUPS.flatMap((group) => group.members.map((member) => [member, group])),
);

/**
 * Resolve a raw Build API MCU name to its displayed filter option.
 *
 * @param {string} mcu Raw MCU name from a target descriptor
 * @returns {{ label: string, value: string }}
 */
const getMcuFilterOption = (mcu) => {
    const group = mcuFilterGroupByMember.get(mcu);
    return group ? { label: group.label, value: group.value } : { label: mcu, value: mcu };
};

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
        manufacturerOptions: [],
        selectedManufacturer: undefined,
        selectedMcu: undefined,
        selectedBoard: undefined,
        firmwareVersionOptions: [],
        selectedFirmwareVersion: undefined,
        cloudBuildOptions: [],
        detectingBoard: false,
        /** Bound to USelectMenu search; used with ignore-filter to omit empty category headers */
        boardSelectSearchTerm: "",
    });

    let detectBoardTimeout = null;

    /**
     * Get manufacturers that have at least one target in the current build type.
     */
    const getManufacturerItems = () => [
        { label: $t("firmwareFlasherFilterAllManufacturers"), value: NO_FILTER_VALUE },
        ...state.manufacturerOptions,
    ];

    /**
     * Get all MCUs, narrowed to the selected manufacturer when one is active.
     */
    const getMcuItems = () => {
        const uniqueMcuItems = new Map();
        state.boardOptions
            .filter((board) => !state.selectedManufacturer || board.manufacturer === state.selectedManufacturer)
            .forEach((board) => {
                const option = getMcuFilterOption(board.mcu);
                uniqueMcuItems.set(option.value, option);
            });

        const sitlItem = uniqueMcuItems.get("SITL");
        uniqueMcuItems.delete("SITL");
        const hardwareMcuItems = [...uniqueMcuItems.values()].sort((a, b) => a.label.localeCompare(b.label));
        const specialMcuItems = [
            { label: $t("firmwareFlasherFilterAllMcus"), value: NO_FILTER_VALUE },
            ...(sitlItem ? [sitlItem] : []),
        ];

        return [
            ...specialMcuItems,
            ...(hardwareMcuItems.length > 0 ? [{ type: "separator" }] : []),
            ...hardwareMcuItems,
        ];
    };

    /**
     * Get board options formatted for Nuxt UI SelectMenu with labeled group separations.
     * Returns a flat array with `type: 'label'` and `type: 'separator'` entries between groups.
     * When `state.boardSelectSearchTerm` is set, only boards matching the search are included
     * and labels/separators appear only for groups that still have matches.
     */
    const getSelectMenuItems = () => {
        const grouped = {};
        const groupOrder = { supported: 0, unsupported: 1, legacy: 2 };
        const q = (state.boardSelectSearchTerm || "").trim().toLowerCase();

        state.boardOptions.forEach((board) => {
            if (state.selectedManufacturer && board.manufacturer !== state.selectedManufacturer) {
                return;
            }
            if (state.selectedMcu && getMcuFilterOption(board.mcu).value !== state.selectedMcu) {
                return;
            }
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
                const orderA = groupOrder[a] ?? 999;
                const orderB = groupOrder[b] ?? 999;
                return orderA - orderB;
            });

        const items = [];
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
    const populateTargetList = async (targets, manufacturers = []) => {
        if (!targets || !ispConnected()) {
            updateTargetQualification(null);
            state.boardOptions = [];
            state.manufacturerOptions = [];
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

        const manufacturerNames = new Map(manufacturers.map((manufacturer) => [manufacturer.id, manufacturer.name]));
        state.manufacturerOptions = [...new Set(boardOptionsArray.map((board) => board.manufacturer))]
            .map((manufacturerId) => {
                const manufacturerName = manufacturerNames.get(manufacturerId);
                return {
                    label: manufacturerName ? `${manufacturerName} (${manufacturerId})` : manufacturerId,
                    value: manufacturerId,
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        const result = getConfig("selected_board");
        const restoredBoard = state.boardOptions.find((board) => board.target === result.selected_board);
        if (restoredBoard) {
            state.selectedManufacturer = restoredBoard.manufacturer;
            state.selectedMcu = getMcuFilterOption(restoredBoard.mcu).value;
            state.selectedBoard = restoredBoard.target;
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
        state.manufacturerOptions = [];
        state.firmwareVersionOptions = [];

        if (GUI.connect_lock) {
            state.selectedBoard = undefined;
        } else {
            try {
                const targetRequest = buildApi.loadTargets();
                const manufacturerRequest = buildApi.loadManufacturers?.() ?? Promise.resolve([]);
                const [targetResult, manufacturerResult] = await Promise.allSettled([
                    targetRequest,
                    manufacturerRequest,
                ]);

                if (targetResult.status === "rejected") {
                    throw targetResult.reason;
                }

                if (manufacturerResult.status === "rejected") {
                    console.error(`${logHead} Failed to load manufacturers:`, manufacturerResult.reason);
                }

                await populateTargetList(
                    targetResult.value,
                    manufacturerResult.status === "fulfilled" && Array.isArray(manufacturerResult.value)
                        ? manufacturerResult.value
                        : [],
                );

                const selectedBoard = state.boardOptions.find((board) => board.target === selectedBoardTarget);
                if (selectedBoard) {
                    state.selectedManufacturer = selectedBoard.manufacturer;
                    state.selectedMcu = getMcuFilterOption(selectedBoard.mcu).value;
                    state.selectedBoard = selectedBoard.target;
                }
            } catch (error) {
                console.error(`${logHead} Failed to load targets:`, error);
            }
        }

        // Re-filter firmware versions based on new build type if a board is selected
        if (state.selectedBoard) {
            try {
                const targetReleases = await buildApi.loadTargetReleases(state.selectedBoard);
                await populateReleases({ target: state.selectedBoard, releases: targetReleases.releases });
            } catch (error) {
                console.error(`${logHead} Failed to load target releases on build type change:`, error);
            }
        }

        setConfig({ selected_build_type: build_type });
    };

    /**
     * Reset downstream choices when the manufacturer filter changes.
     */
    const onManufacturerChange = async () => {
        if (state.selectedManufacturer === NO_FILTER_VALUE) {
            state.selectedManufacturer = undefined;
        }
        if (!getMcuItems().some((mcu) => mcu.value === state.selectedMcu)) {
            state.selectedMcu = undefined;
        }
        state.selectedBoard = undefined;
        state.boardSelectSearchTerm = "";
        return await onBoardChange();
    };

    /**
     * Reset the board choice when the MCU filter changes.
     */
    const onMcuChange = async () => {
        if (state.selectedMcu === NO_FILTER_VALUE) {
            state.selectedMcu = undefined;
        }
        state.selectedBoard = undefined;
        state.boardSelectSearchTerm = "";
        return await onBoardChange();
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

        AutoDetect.verifyBoard(async (detectedBoardName) => {
            let found = state.boardOptions.find((b) => b.target === detectedBoardName);
            if (!found) {
                found = state.boardOptions.find(
                    (b) => b.target.trim().toLowerCase() === String(detectedBoardName).trim().toLowerCase(),
                );
            }
            if (found) {
                state.selectedBoard = null;
                await nextTick();
                state.selectedManufacturer = found.manufacturer;
                state.selectedMcu = getMcuFilterOption(found.mcu).value;
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
        state.manufacturerOptions = [];
        state.selectedManufacturer = undefined;
        state.selectedMcu = undefined;
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
        getManufacturerItems,
        getMcuItems,
        getSelectMenuItems,
        populateTargetList,
        onBuildTypeChange,
        onManufacturerChange,
        onMcuChange,
        onBoardChange,
        handleDetectBoard,
        resetBoardSelection,
    };
}
