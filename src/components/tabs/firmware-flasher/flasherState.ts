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

import { inject, reactive, type InjectionKey } from "vue";
import type { useBoardSelection } from "@/composables/useBoardSelection";

/** A build option as the build API returns it, relabelled for Nuxt UI selects. */
export interface BuildOption {
    name: string;
    value: string;
    label: string;
    default?: boolean;
    group?: string;
    includesTelemetry?: boolean;
}

/** A protocol option; the API's empty-string "none" value becomes null for USelect. */
export interface ProtocolOption extends Omit<BuildOption, "value"> {
    value: string | null;
}

export interface CommitOption {
    label: string;
    value: string;
}

export interface TargetDetail {
    target: string;
    release: string;
    releaseType?: string;
    cloudBuild?: boolean;
    file?: string;
    [key: string]: unknown;
}

/**
 * The firmware flasher's UI state. FirmwareFlasherTab owns it and provides it to the
 * sub-tabs, which bind their controls straight into it; see FLASHER_STATE.
 */
export function createFlasherState() {
    return reactive({
        localFirmwareLoaded: false,
        selectedBuildType: 0,
        selectedRadioProtocol: undefined as string | undefined,
        selectedTelemetryProtocol: undefined as string | null | undefined,
        selectedOsdProtocol: undefined as string | null | undefined,
        selectedMotorProtocol: undefined as string | null | undefined,
        selectedOptions: [] as BuildOption[],
        /** Expert mode cloud build: custom compile defines as tags (split on space) */
        customDefinesTags: [] as string[],
        selectedCommit: undefined as CommitOption | undefined,
        cloudBuildOptions: null as string[] | null,
        isConfigLocal: false,
        filename: null as string | null,
        configFilename: null as string | null,
        /** `{}` until a config is loaded, then the config text. */
        config: {} as Record<string, never> | string,
        developmentFirmwareLoaded: false,
        preFlashingMessage: null as string | null,
        preFlashingMessageType: null as string | null,
        firmware_type: undefined as string | undefined,
        targetDetail: null as TargetDetail | null,
        targetQualification: null as boolean | null,
        // Select options
        buildTypeOptions: [] as { value: number; label: string }[],
        radioProtocolOptions: [] as BuildOption[],
        telemetryProtocolOptions: [] as ProtocolOption[],
        osdProtocolOptions: [] as ProtocolOption[],
        motorProtocolOptions: [] as ProtocolOption[],
        optionsListOptions: [] as BuildOption[],
        commitOptions: [] as CommitOption[],
        // UI State - Checkboxes
        expertMode: false,
        showDevelopmentReleases: false,
        noRebootSequence: false,
        flashOnConnect: false,
        eraseChip: false,
        flashManualBaud: false,
        coreBuildMode: false,
        // UI State - Button disabled flags
        flashButtonDisabled: true,
        loadRemoteButtonDisabled: true,
        loadFileButtonDisabled: false,
        dfuExitButtonDisabled: true,
        telemetryProtocolDisabled: false,
        // UI State - Visibility flags
        flashOnConnectWrapperVisible: false,
        manufacturerInfoVisible: false,
        cloudTargetInfoVisible: false,
        targetQualificationVisible: false,
        expertOptionsVisible: false,
        buildTypeRowVisible: false,
        commitSelectionVisible: false,
        // UI State - Text content
        targetQualificationText: "",
        targetSpanText: "",
        releaseNameText: "",
        releaseNameLink: "",
        releaseDateText: "",
        targetMCUText: "",
        configFilenameText: "",
        manufacturerSpanText: "",
        targetSupportUrl: "https://betaflight.com/docs/wiki/boards/archive/Missing",
        progressLabelText: "",
        progressLabelClass: "", // "valid", "invalid", "actionRequired"
        firmwareLoadedName: "",
        firmwareLoadedSize: "",
        firmwareLoadedIsLocal: false,
        /** 0–100; drives firmware flash UProgress (replaces native progress element). */
        flashProgressValue: 0,
        osdProtocolNeedsAttention: false, // True if OSD protocol is empty (shows red)
        // UI State - Input values
        flashManualBaudRate: 256000,
        // Dialog states
        dialogUnstableFirmwareAcknowledgementCheckbox: false,
        flashingInProgress: false,
        lastFlashResultText: "",
        lastFlashResultClass: "",
        // Restore-backup lifecycle (post-flash)
        restoreInProgress: false,
        restoreCompleted: false,
    });
}

export type FlasherState = ReturnType<typeof createFlasherState>;
export type BoardSelection = ReturnType<typeof useBoardSelection>;

// Provided rather than passed as props: the sub-tabs v-model into this state, and a child
// writing through a prop is what Vue's one-way data flow rules out.
export const FLASHER_STATE: InjectionKey<FlasherState> = Symbol("flasherState");
export const BOARD_SELECTION: InjectionKey<BoardSelection> = Symbol("boardSelection");

function injectRequired<T>(key: InjectionKey<T>): T {
    const value = inject(key);
    if (value === undefined) {
        throw new Error(`${String(key.description)} is not provided; mount this inside FirmwareFlasherTab`);
    }
    return value;
}

export const injectFlasherState = () => injectRequired(FLASHER_STATE);
export const injectBoardSelection = () => injectRequired(BOARD_SELECTION);
