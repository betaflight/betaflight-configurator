import { describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { defineComponent, reactive, type ComponentPublicInstance } from "vue";
import USwitch from "@nuxt/ui/components/Switch.vue";
import USelectMenu from "@nuxt/ui/components/SelectMenu.vue";
import FlasherFlashTab from "../../src/components/tabs/firmware-flasher/FlasherFlashTab.vue";
import FlasherBoardBuildTab from "../../src/components/tabs/firmware-flasher/FlasherBoardBuildTab.vue";
import {
    BOARD_SELECTION,
    FLASHER_STATE,
    createFlasherState,
    injectFlasherState,
    type BoardSelection,
    type FlasherState,
} from "../../src/components/tabs/firmware-flasher/flasherState";

vi.mock("../../src/js/utils/AutoBackup", () => ({ getLastBackupData: () => null }));

const noop = () => {};
const global = { mocks: { $t: (key: string) => key }, renderStubDefaultSlot: true };

function fakeBoardSelection(): BoardSelection {
    return {
        state: reactive({
            targets: null,
            boardOptions: [],
            selectedBoard: undefined,
            firmwareVersionOptions: [],
            selectedFirmwareVersion: undefined,
            cloudBuildOptions: [],
            detectingBoard: false,
            boardSelectSearchTerm: "",
        }),
        getSelectMenuItems: () => [{ label: "SPEEDYBEEF405MINI", value: "SPEEDYBEEF405MINI" }],
        populateTargetList: vi.fn(),
        onBuildTypeChange: vi.fn(),
        onBoardChange: vi.fn(),
        handleDetectBoard: vi.fn(),
        resetBoardSelection: vi.fn(),
    } as unknown as BoardSelection;
}

function mountFlashTab(state: FlasherState, boardSelection: BoardSelection, firmwareAcceptsConfig = false) {
    return shallowMount(FlasherFlashTab, {
        props: {
            cloudBuild: { state: {} } as never,
            onSaveFirmware: noop,
            flashRingColor: "primary",
            onNoRebootChange: noop,
            onEraseChipChange: noop,
            onFlashManualBaudChange: noop,
            onFlashManualBaudRateChange: noop,
            onRestoreBackup: noop,
            firmwareAcceptsConfig,
        },
        global: {
            ...global,
            provide: { [FLASHER_STATE as symbol]: state, [BOARD_SELECTION as symbol]: boardSelection },
        },
    });
}

/** The configuration row's value, or null when the row is hidden. */
function configRowText(wrapper: ReturnType<typeof mountFlashTab>): string | null {
    const span = wrapper.find(".configFilename");
    return span.exists() ? span.text() : null;
}

function selectRelease(boardSelection: BoardSelection, unifiedConfig?: boolean): void {
    boardSelection.state.firmwareVersionOptions = [{ release: "4.5.0", label: "4.5.0", unifiedConfig }];
    boardSelection.state.selectedFirmwareVersion = "4.5.0";
}

describe("firmware flasher sub-tabs", () => {
    it("refuses to run outside FirmwareFlasherTab", () => {
        const Orphan = defineComponent({
            setup() {
                injectFlasherState();
                return () => null;
            },
        });
        vi.spyOn(console, "warn").mockImplementation(noop);
        expect(() => shallowMount(Orphan)).toThrow(/flasherState is not provided/);
    });

    it("FlasherFlashTab writes its switches into the provided state", async () => {
        const state = createFlasherState();
        state.expertOptionsVisible = true;
        const wrapper = mountFlashTab(state, fakeBoardSelection());

        const [noReboot, eraseChip] = wrapper.findAllComponents<ComponentPublicInstance>(USwitch);
        await noReboot.vm.$emit("update:modelValue", true);
        await eraseChip.vm.$emit("update:modelValue", true);

        expect(state.noRebootSequence).toBe(true);
        expect(state.eraseChip).toBe(true);
    });

    it.each([
        [true, "[default]"],
        [false, null],
        [undefined, null],
    ])("shows the configuration row for a release with unifiedConfig %s as %s", (unifiedConfig, expected) => {
        const boardSelection = fakeBoardSelection();
        selectRelease(boardSelection, unifiedConfig);

        expect(configRowText(mountFlashTab(createFlasherState(), boardSelection))).toBe(expected);
    });

    it("shows a loaded local config by name, whatever the release", () => {
        const state = createFlasherState();
        state.isConfigLocal = true;
        state.configFilename = "MYBOARD.config";
        const boardSelection = fakeBoardSelection();
        selectRelease(boardSelection, false);

        expect(configRowText(mountFlashTab(state, boardSelection))).toBe("MYBOARD.config");
    });

    it.each([
        [true, "set x = 1", "[default]"],
        [false, "set x = 1", null],
        [true, {}, null],
    ])(
        "for local firmware that accepts a config (%s) with board config %j, shows %s",
        (firmwareAcceptsConfig, config, expected) => {
            const state = createFlasherState();
            state.localFirmwareLoaded = true;
            state.config = config as typeof state.config;
            const boardSelection = fakeBoardSelection();
            selectRelease(boardSelection, true);

            expect(configRowText(mountFlashTab(state, boardSelection, firmwareAcceptsConfig))).toBe(expected);
        },
    );

    it("FlasherBoardBuildTab writes into both the flasher state and the board selection", async () => {
        const state = createFlasherState();
        const boardSelection = fakeBoardSelection();
        const onBoardChange = vi.fn();
        const wrapper = shallowMount(FlasherBoardBuildTab, {
            props: {
                onBuildTypeChange: noop,
                onBoardChange,
                onDetectBoard: noop,
                onFirmwareVersionChange: noop,
                onExpertModeChange: noop,
                onShowDevelopmentReleasesChange: noop,
                onRadioProtocolChange: noop,
                onTelemetryProtocolChange: noop,
                onOsdProtocolChange: noop,
                onMotorProtocolChange: noop,
                onOptionsChange: noop,
                removeSelectedBuildOption: noop,
                onCommitChange: noop,
                onCommitCreate: noop,
            },
            global: {
                ...global,
                provide: { [FLASHER_STATE as symbol]: state, [BOARD_SELECTION as symbol]: boardSelection },
            },
        });

        const [expertMode] = wrapper.findAllComponents<ComponentPublicInstance>(USwitch);
        await expertMode.vm.$emit("update:modelValue", true);
        const [board] = wrapper.findAllComponents<ComponentPublicInstance>(USelectMenu);
        await board.vm.$emit("update:modelValue", "SPEEDYBEEF405MINI");

        expect(state.expertMode).toBe(true);
        expect(boardSelection.state.selectedBoard).toBe("SPEEDYBEEF405MINI");
        expect(onBoardChange).toHaveBeenCalledOnce();
    });
});
