import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import GUI from "../../src/js/gui";

import { useBoardSelection } from "../../src/composables/useBoardSelection";

function makeParams() {
    return {
        buildApi: {
            loadTargets: vi.fn().mockResolvedValue([]),
            loadManufacturers: vi.fn().mockResolvedValue([]),
            loadTargetReleases: vi.fn().mockResolvedValue({ releases: [] }),
        },
        $t: (key) => key,
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
    let scope;
    let boardSelection;
    let params;

    beforeEach(() => {
        vi.useFakeTimers();
        GUI.connect_lock = false;

        params = makeParams();
        scope = effectScope();
        scope.run(() => {
            boardSelection = useBoardSelection(params);
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

    it("keeps targets available when the optional manufacturer response is null", async () => {
        params.buildApi.loadTargets.mockResolvedValue([
            { target: "ALPHA_F405", manufacturer: "ALPH", mcu: "STM32F405", group: "supported" },
        ]);
        params.buildApi.loadManufacturers.mockResolvedValue(null);

        await boardSelection.onBuildTypeChange();

        expect(boardSelection.state.boardOptions).toEqual([
            expect.objectContaining({ target: "ALPHA_F405", manufacturer: "ALPH", mcu: "STM32F405" }),
        ]);
        expect(boardSelection.getManufacturerItems()).toContainEqual({ label: "ALPH", value: "ALPH" });
    });

    it("filters targets incrementally as manufacturer and MCU are selected", async () => {
        await boardSelection.populateTargetList(
            [
                { target: "ALPHA_F405", manufacturer: "ALPH", mcu: "STM32F405", group: "supported" },
                { target: "ALPHA_H743", manufacturer: "ALPH", mcu: "STM32H743", group: "unsupported" },
                { target: "BETA_F405", manufacturer: "BETA", mcu: "STM32F405", group: "legacy" },
            ],
            [
                { id: "ALPH", name: "Alpha Aircraft" },
                { id: "BETA", name: "Beta Boards" },
            ],
        );

        expect(boardSelection.getManufacturerItems()).toEqual([
            { label: "firmwareFlasherFilterAllManufacturers", value: "__no_filter__" },
            { label: "Alpha Aircraft (ALPH)", value: "ALPH" },
            { label: "Beta Boards (BETA)", value: "BETA" },
        ]);
        expect(boardSelection.getMcuItems()).toEqual([
            { label: "firmwareFlasherFilterAllMcus", value: "__no_filter__" },
            { type: "separator" },
            { label: "STM32F405", value: "STM32F405" },
            { label: "STM32H743", value: "STM32H743" },
        ]);
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_F405", "ALPHA_H743", "BETA_F405"]);

        boardSelection.state.selectedMcu = "STM32F405";
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_F405", "BETA_F405"]);

        boardSelection.state.selectedMcu = undefined;
        boardSelection.state.selectedManufacturer = "ALPH";
        expect(boardSelection.getMcuItems()).toEqual([
            { label: "firmwareFlasherFilterAllMcus", value: "__no_filter__" },
            { type: "separator" },
            { label: "STM32F405", value: "STM32F405" },
            { label: "STM32H743", value: "STM32H743" },
        ]);
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_F405", "ALPHA_H743"]);

        boardSelection.state.selectedMcu = "STM32F405";
        const visibleTargets = boardSelection
            .getSelectMenuItems()
            .filter((item) => item.value)
            .map((item) => item.value);
        expect(visibleTargets).toEqual(["ALPHA_F405"]);
    });

    it("keeps an MCU-first selection when a compatible manufacturer is selected", async () => {
        await boardSelection.populateTargetList([
            { target: "ALPHA_F405", manufacturer: "ALPH", mcu: "STM32F405", group: "supported" },
            { target: "BETA_H743", manufacturer: "BETA", mcu: "STM32H743", group: "supported" },
        ]);
        boardSelection.state.selectedMcu = "STM32F405";
        boardSelection.state.selectedManufacturer = "ALPH";

        await boardSelection.onManufacturerChange();

        expect(boardSelection.state.selectedMcu).toBe("STM32F405");
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_F405"]);
    });

    it("combines interchangeable MCU variants under one extensible filter option", async () => {
        await boardSelection.populateTargetList([
            { target: "ALPHA_AT_G", manufacturer: "ALPH", mcu: "AT32F435G", group: "supported" },
            { target: "BETA_AT_M", manufacturer: "BETA", mcu: "AT32F435M", group: "supported" },
            { target: "BETA_F405", manufacturer: "BETA", mcu: "STM32F405", group: "supported" },
            { target: "SITL", manufacturer: "BTFL", mcu: "SITL", group: "supported" },
        ]);

        expect(boardSelection.getMcuItems()).toEqual([
            { label: "firmwareFlasherFilterAllMcus", value: "__no_filter__" },
            { label: "SITL", value: "SITL" },
            { type: "separator" },
            { label: "AT32F435", value: "AT32F435" },
            { label: "STM32F405", value: "STM32F405" },
        ]);

        boardSelection.state.selectedMcu = "AT32F435";
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_AT_G", "BETA_AT_M"]);
    });

    it("resets either filter through its All option while preserving the other filter", async () => {
        await boardSelection.populateTargetList([
            { target: "ALPHA_F405", manufacturer: "ALPH", mcu: "STM32F405", group: "supported" },
            { target: "ALPHA_H743", manufacturer: "ALPH", mcu: "STM32H743", group: "supported" },
            { target: "BETA_F405", manufacturer: "BETA", mcu: "STM32F405", group: "supported" },
        ]);
        boardSelection.state.selectedManufacturer = "ALPH";
        boardSelection.state.selectedMcu = "STM32F405";

        boardSelection.state.selectedManufacturer = boardSelection.getManufacturerItems()[0].value;
        await boardSelection.onManufacturerChange();

        expect(boardSelection.state.selectedManufacturer).toBeUndefined();
        expect(boardSelection.state.selectedMcu).toBe("STM32F405");
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_F405", "BETA_F405"]);

        boardSelection.state.selectedMcu = boardSelection.getMcuItems()[0].value;
        await boardSelection.onMcuChange();

        expect(boardSelection.state.selectedMcu).toBeUndefined();
        expect(
            boardSelection
                .getSelectMenuItems()
                .filter((item) => item.value)
                .map((item) => item.value),
        ).toEqual(["ALPHA_F405", "ALPHA_H743", "BETA_F405"]);
    });

    it("clears stale downstream choices when an upstream filter changes", async () => {
        await boardSelection.populateTargetList([
            { target: "ALPHA_F405", manufacturer: "ALPH", mcu: "STM32F405", group: "supported" },
            { target: "BETA_H743", manufacturer: "BETA", mcu: "STM32H743", group: "supported" },
        ]);
        boardSelection.state.selectedManufacturer = "ALPH";
        boardSelection.state.selectedMcu = "STM32F405";
        boardSelection.state.selectedBoard = "ALPHA_F405";
        boardSelection.state.firmwareVersionOptions = [{ release: "4.6.0" }];
        boardSelection.state.boardSelectSearchTerm = "alpha";

        boardSelection.state.selectedManufacturer = "BETA";
        await boardSelection.onManufacturerChange();

        expect(boardSelection.state.selectedMcu).toBeUndefined();
        expect(boardSelection.state.selectedBoard).toBeUndefined();
        expect(boardSelection.state.firmwareVersionOptions).toEqual([]);
        expect(boardSelection.state.boardSelectSearchTerm).toBe("");
        expect(params.updateTargetQualification).toHaveBeenLastCalledWith(undefined);
        expect(params.buildApi.loadTargetReleases).not.toHaveBeenCalled();
    });
});
