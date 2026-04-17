<template>
    <BaseTab tab-name="firmware_flasher">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabFirmwareFlasher") }}</div>
            <WikiButton docUrl="firmware_flasher" />
            <SponsorTile ref="sponsorTile" sponsor-type="flash" />
            <div v-if="state.flashingInProgress" class="data-loading flashing-wait">
                <p>{{ state.progressLabelText }} {{ $t("firmwareFlasherPleaseWait") }}</p>
            </div>
            <div class="grid-box-spacer"></div>
            <div class="grid-box col2">
                <UiBox
                    :title="$t('firmwareFlasherBoardSelectionHead') || $t('firmwareFlasherTargetSelectionHead')"
                    type="neutral"
                >
                    <UiBox
                        highlight
                        v-if="state.targetQualificationVisible"
                        :type="state.targetQualification ? 'success' : 'warning'"
                    >
                        {{ state.targetQualificationText }}
                    </UiBox>
                    <SettingRow :label="$t('expertMode')" :help="$t('expertModeDescription')" full-width>
                        <USwitch v-model="state.expertMode" @change="handleExpertModeChange" />
                    </SettingRow>
                    <SettingRow
                        :label="$t('firmwareFlasherShowDevelopmentReleases')"
                        :help="$t('firmwareFlasherShowDevelopmentReleasesDescription')"
                        full-width
                    >
                        <USwitch
                            v-model="state.showDevelopmentReleases"
                            @change="handleShowDevelopmentReleasesChange"
                        />
                    </SettingRow>
                    <SettingRow
                        :help="$t('firmwareFlasherOnlineSelectBuildType')"
                        full-width
                        v-if="state.buildTypeRowVisible"
                    >
                        <USelect
                            v-model="state.selectedBuildType"
                            :items="state.buildTypeOptions"
                            class="min-w-80"
                            @update:model-value="onBuildTypeChange"
                        />
                    </SettingRow>
                    <SettingRow :help="$t('firmwareFlasherOnlineSelectBoardHint')" full-width>
                        <div class="flex items-center gap-2">
                            <UFieldGroup class="min-w-80">
                                <USelectMenu
                                    v-model="boardSelection.state.selectedBoard"
                                    v-model:search-term="boardSelection.state.boardSelectSearchTerm"
                                    :items="boardSelection.getSelectMenuItems()"
                                    value-key="value"
                                    placeholder="Search for a board..."
                                    ignore-filter
                                    class="w-full"
                                    :virtualize="{
                                        estimateSize: 28,
                                    }"
                                    @update:model-value="onBoardChange"
                                />
                                <UButton
                                    :label="$t('firmwareFlasherDetectBoardButton')"
                                    color="primary"
                                    :disabled="boardSelection.state.detectingBoard"
                                    :title="$t('firmwareFlasherOnlineSelectBoardDescription')"
                                    icon="i-lucide-search"
                                    :loading="boardSelection.state.detectingBoard"
                                    @click="handleDetectBoard"
                                />
                            </UFieldGroup>
                        </div>
                    </SettingRow>
                    <SettingRow :help="$t('firmwareFlasherOnlineSelectFirmwareVersionDescription')" full-width>
                        <USelect
                            v-model="boardSelection.state.selectedFirmwareVersion"
                            value-key="release"
                            :items="boardSelection.state.firmwareVersionOptions"
                            class="min-w-80"
                            :disabled="
                                !boardSelection.state.firmwareVersionOptions ||
                                boardSelection.state.firmwareVersionOptions.length === 0
                            "
                            @update:model-value="onFirmwareVersionChange"
                            :placeholder="$t('firmwareFlasherOptionLabelSelectFirmwareVersion')"
                        />
                    </SettingRow>
                    <SettingRow
                        :label="$t('firmwareFlasherNoReboot')"
                        :help="$t('firmwareFlasherNoRebootDescription')"
                        full-width
                        v-if="state.expertOptionsVisible"
                    >
                        <USwitch v-model="state.noRebootSequence" @change="handleNoRebootChange" />
                    </SettingRow>
                    <SettingRow
                        :label="$t('firmwareFlasherFlashOnConnect')"
                        :help="$t('firmwareFlasherFlashOnConnectDescription')"
                        full-width
                        v-if="state.flashOnConnectWrapperVisible"
                    >
                        <USwitch v-model="state.flashOnConnect" />
                    </SettingRow>
                    <SettingRow
                        :label="$t('firmwareFlasherFullChipErase')"
                        :help="$t('firmwareFlasherFullChipEraseDescription')"
                        full-width
                        v-if="state.expertOptionsVisible"
                    >
                        <USwitch v-model="state.eraseChip" @change="handleEraseChipChange" />
                    </SettingRow>
                    <SettingRow
                        :label="$t('firmwareFlasherManualBaud')"
                        :help="$t('firmwareFlasherManualBaudDescription')"
                        full-width
                        v-if="state.expertOptionsVisible"
                    >
                        <USwitch v-model="state.flashManualBaud" @change="handleFlashManualBaudChange" />
                        <USelect
                            v-model="state.flashManualBaudRate"
                            :items="[
                                { value: 921600, label: '921600' },
                                { value: 460800, label: '460800' },
                                { value: 256000, label: '256000' },
                                { value: 230400, label: '230400' },
                                { value: 115200, label: '115200' },
                                { value: 57600, label: '57600' },
                            ]"
                            class="min-w-24"
                        />
                    </SettingRow>
                </UiBox>

                <UiBox
                    :title="$t('firmwareFlasherBuildConfigurationHead')"
                    v-if="state.buildConfigVisible"
                    class="build_configuration col-span-1"
                    type="neutral"
                >
                    <template v-slot:title>
                        <SettingRow :label="$t('coreBuild')" :help="$t('coreBuildModeDescription')">
                            <USwitch v-model="state.coreBuildMode"
                        /></SettingRow>
                    </template>
                    <div class="grid-box col1">
                        <div v-show="!state.coreBuildMode" class="spacer">
                            <div class="grid-box col2">
                                <SettingColumn
                                    :label="$t('firmwareFlasherBuildRadioProtocols')"
                                    :help="$t('firmwareFlasherRadioProtocolDescription')"
                                >
                                    <USelect
                                        v-model="state.selectedRadioProtocol"
                                        :items="state.radioProtocolOptions"
                                        @update:model-value="onRadioProtocolChange"
                                        placeholder="Select protocol"
                                    />
                                </SettingColumn>
                                <SettingColumn
                                    :label="$t('firmwareFlasherBuildTelemetryProtocols')"
                                    :help="$t('firmwareFlasherTelemetryProtocolDescription')"
                                >
                                    <USelect
                                        v-model="state.selectedTelemetryProtocol"
                                        :items="state.telemetryProtocolOptions"
                                        @update:model-value="onTelemetryProtocolChange"
                                        placeholder="Select protocol"
                                        :disabled="state.telemetryProtocolDisabled"
                                    />
                                </SettingColumn>
                            </div>
                        </div>
                        <div v-show="!state.coreBuildMode" class="spacer">
                            <div class="grid-box col2">
                                <SettingColumn
                                    :label="$t('firmwareFlasherBuildOsdProtocols')"
                                    :help="$t('firmwareFlasherOsdProtocolDescription')"
                                >
                                    <USelect
                                        v-model="state.selectedOsdProtocol"
                                        :items="state.osdProtocolOptions"
                                        placeholder="Select protocol"
                                        @update:model-value="onOsdProtocolChange"
                                        class="w-full"
                                        :color="state.osdProtocolNeedsAttention ? 'error' : 'default'"
                                    />
                                </SettingColumn>
                                <SettingColumn
                                    :label="$t('firmwareFlasherBuildMotorProtocols')"
                                    :help="$t('firmwareFlasherMotorProtocolDescription')"
                                >
                                    <USelect
                                        v-model="state.selectedMotorProtocol"
                                        :items="state.motorProtocolOptions"
                                        placeholder="Select protocol"
                                        @update:model-value="onMotorProtocolChange"
                                        class="w-full"
                                    />
                                </SettingColumn>
                            </div>
                        </div>
                        <div v-show="!state.coreBuildMode" class="spacer">
                            <div class="grid-box col1">
                                <SettingColumn
                                    :label="$t('firmwareFlasherBuildOptions')"
                                    :help="$t('firmwareFlasherOptionsDescription')"
                                >
                                    <USelectMenu
                                        id="optionsInfo"
                                        v-model="state.selectedOptions"
                                        multiple
                                        by="value"
                                        :items="state.optionsListOptions"
                                        placeholder="Select options"
                                        :search-input="{
                                            placeholder: $t('search'),
                                            icon: 'i-lucide-search',
                                        }"
                                        class="w-full"
                                        :ui="{ content: 'max-h-96', base: 'pl-1.5' }"
                                        @update:model-value="onOptionsChange"
                                    >
                                        <template #default>
                                            <div class="flex gap-2 items-center min-h-6 flex-wrap">
                                                <UBadge
                                                    v-for="option in state.selectedOptions"
                                                    :key="option.value"
                                                    color="neutral"
                                                    variant="subtle"
                                                    class="flex gap-2 items-center whitespace-nowrap"
                                                >
                                                    {{ option.label }}
                                                    <UButton
                                                        type="button"
                                                        variant="soft"
                                                        color="neutral"
                                                        size="xs"
                                                        icon="i-lucide-x"
                                                        class="p-0"
                                                        @click.stop="removeSelectedBuildOption(option)"
                                                    />
                                                </UBadge>
                                            </div>
                                        </template>
                                    </USelectMenu>
                                </SettingColumn>
                            </div>
                        </div>
                        <div v-show="!state.coreBuildMode" class="expertOptions spacer">
                            <div class="grid-box col1">
                                <SettingColumn
                                    :label="$t('firmwareFlasherBuildCustomDefines')"
                                    :help="$t('firmwareFlasherCustomDefinesDescription')"
                                >
                                    <div id="customDefinesInfo">
                                        <UInputTags
                                            v-model="state.customDefinesTags"
                                            name="customDefines"
                                            delimiter=" "
                                            add-on-paste
                                            class="w-full"
                                            :ui="{
                                                base: 'pl-1.5',
                                                input: 'appearance-none min-h-6',
                                                item: 'py-1 px-2 gap-2',
                                                itemDelete: 'p-0 rounded-full text-default',
                                                itemDeleteIcon: 'size-4',
                                            }"
                                        />
                                    </div>
                                </SettingColumn>
                                <SettingColumn
                                    v-show="state.commitSelectionVisible"
                                    :label="$t('firmwareFlasherBranch')"
                                    :help="$t('firmwareFlasherBranchDescription')"
                                >
                                    <USelectMenu
                                        id="branchInfo"
                                        v-model="state.selectedCommit"
                                        by="value"
                                        :items="state.commitOptions"
                                        create-item
                                        placeholder="Select branch or enter PR # / commit hash"
                                        :search-input="{
                                            placeholder: $t('search'),
                                            icon: 'i-lucide-search',
                                        }"
                                        class="w-full"
                                        :ui="{ content: 'max-h-96' }"
                                        @update:model-value="onCommitChange"
                                        @create="onCommitCreate"
                                    />
                                </SettingColumn>
                            </div>
                        </div>
                    </div>
                </UiBox>

                <UiBox
                    :title="$t('firmwareFlasherReleaseSummaryHead')"
                    v-if="state.releaseInfoVisible"
                    class="release_info col-span-1"
                >
                    <div class="release_info_grid">
                        <!-- Target Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherReleaseTarget") }}</strong>
                            <span ref="targetSpan" class="target">{{ state.targetSpanText }}</span>
                            <div class="board_support">
                                <a id="targetSupportInfoUrl" :href="state.targetSupportUrl" target="_blank">{{
                                    $t("betaflightSupportButton")
                                }}</a>
                                <div class="helpicon cf_tip_wide" :title="$t('firmwareFlasherTargetWikiUrlInfo')"></div>
                            </div>
                        </div>

                        <!-- Manufacturer Row (conditional) -->
                        <div v-if="state.manufacturerInfoVisible" ref="manufacturerInfoDiv" class="info_row">
                            <strong>{{ $t("firmwareFlasherReleaseManufacturer") }}</strong>
                            <span ref="manufacturerSpan" id="manufacturer">{{ state.manufacturerSpanText }}</span>
                            <div></div>
                        </div>

                        <!-- Version Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherReleaseVersion") }}</strong>
                            <a
                                ref="releaseNameLink"
                                :title="$t('firmwareFlasherReleaseVersionUrl')"
                                class="name"
                                :href="state.releaseNameLink"
                                target="_blank"
                                >{{ state.releaseNameText }}</a
                            >
                            <div></div>
                        </div>

                        <!-- MCU Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherReleaseMCU") }}</strong>
                            <span ref="targetMCUSpan" id="targetMCU">{{ state.targetMCUText }}</span>
                            <div></div>
                        </div>

                        <!-- Date Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherReleaseDate") }}</strong>
                            <span ref="releaseDateSpan" class="date">{{ state.releaseDateText }}</span>
                            <div></div>
                        </div>

                        <!-- Configuration File Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherConfigurationFile") }}</strong>
                            <span ref="configFilenameSpan" class="configFilename">{{ state.configFilenameText }}</span>
                            <div></div>
                        </div>

                        <!-- Cloud Details Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherCloudBuildDetails") }}</strong>
                            <a
                                ref="cloudTargetLogLink"
                                :title="$t('firmwareFlasherCloudBuildLogUrl')"
                                id="cloudTargetLog"
                                :href="cloudBuild.state.cloudTargetLogUrl"
                                target="_blank"
                                >{{ cloudBuild.state.cloudTargetLogText }}</a
                            >
                            <div></div>
                        </div>

                        <!-- Cloud Status Row -->
                        <div class="info_row">
                            <strong>{{ $t("firmwareFlasherCloudBuildStatus") }}</strong>
                            <div class="status_wrapper">
                                <progress
                                    :ref="cloudBuild.buildProgressBar"
                                    class="buildProgress"
                                    value="0"
                                    min="0"
                                    max="100"
                                ></progress>
                                <span ref="cloudTargetStatusSpan" id="cloudTargetStatus">
                                    {{ cloudBuild.state.cloudTargetStatusText }}</span
                                >
                            </div>
                            <div class="btn default_btn">
                                <a
                                    ref="cloudBuildCancelButton"
                                    :class="[
                                        'cloud_build_cancel',
                                        { disabled: cloudBuild.state.cancelBuildButtonDisabled },
                                    ]"
                                    href="#"
                                    @click.prevent="cloudBuild.handleCancelBuild"
                                    >{{ $t("cancel") }}</a
                                >
                            </div>
                        </div>
                    </div>
                </UiBox>
            </div>
            <div class="grid-box-spacer"></div>
            <div class="grid-box col2">
                <UiBox :title="$t('warningTitle')" type="error" highlight class="note-text-format">
                    <p v-html="$t('firmwareFlasherWarningText')"></p>
                    <br />
                    <p v-html="$t('firmwareFlasherTargetWarning')"></p>
                </UiBox>
                <UiBox :title="$t('firmwareFlasherRecoveryHead')" highlight class="note-text-format">
                    <p v-html="$t('firmwareFlasherRecoveryText')"></p>
                </UiBox>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom flex items-center gap-2">
            <div class="flex flex-1 relative items-center">
                <UProgress
                    v-model="state.flashProgressValue"
                    :max="100"
                    :color="
                        state.progressLabelClass === 'valid'
                            ? 'success'
                            : state.progressLabelClass === 'invalid'
                              ? 'error'
                              : 'primary'
                    "
                    :ui="{
                        base: 'border border-default h-7 rounded-md',
                    }"
                />
                <span
                    ref="progressLabel"
                    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-xs text-default w-fit h-fit whitespace-nowrap"
                    v-html="state.progressLabelText"
                    @click="handleProgressLabelClick"
                ></span>
            </div>
            <UButton :disabled="state.dfuExitButtonDisabled" @click="handleExitDfu" variant="soft">
                {{ $t("firmwareFlasherExitDfu") }}
            </UButton>
            <UButton :disabled="state.flashButtonDisabled" @click="handleFlashFirmware">
                {{ $t("firmwareFlasherFlashFirmware") }}
            </UButton>
            <UButton :disabled="state.loadRemoteButtonDisabled" @click="handleLoadRemoteFile">
                {{ $t("firmwareFlasherButtonLoadOnline") }}
            </UButton>
            <UButton :disabled="state.loadFileButtonDisabled" @click="handleLoadFile" variant="soft">
                {{ $t("firmwareFlasherButtonLoadLocal") }}
            </UButton>
        </div>

        <dialog
            ref="unstableFirmwareDialog"
            id="dialogUnstableFirmwareAcknowledgement"
            @close="handleUnstableFirmwareDialogClose"
        >
            <h3>{{ $t("warningTitle") }}</h3>
            <div class="content">
                <div v-html="$t('unstableFirmwareAcknowledgementDialog')"></div>
                <div>
                    <label class="vue-switch-label">
                        <input
                            v-model="state.dialogUnstableFirmwareAcknowledgementCheckbox"
                            name="dialogUnstableFirmwareAcknowledgement-acknowledge"
                            class="vue-switch-input"
                            type="checkbox"
                            :aria-label="$t('unstableFirmwareAcknowledgement')"
                        />
                        <span class="vue-switch-slider" aria-hidden="true"></span>
                        <span class="vue-switch-text" v-html="$t('unstableFirmwareAcknowledgement')"></span>
                    </label>
                </div>
            </div>
            <div class="dialog_toolbar">
                <div class="btn">
                    <a
                        :class="['regular-button', { disabled: !state.dialogUnstableFirmwareAcknowledgementCheckbox }]"
                        href="#"
                        id="dialogUnstableFirmwareAcknowledgement-flashbtn"
                        @click.prevent="handleUnstableFirmwareFlash"
                        >{{ $t("unstableFirmwareAcknowledgementFlash") }}</a
                    >
                </div>
                <div class="btn">
                    <a
                        href="#"
                        id="dialogUnstableFirmwareAcknowledgement-cancelbtn"
                        class="regular-button"
                        @click.prevent="handleUnstableFirmwareCancel"
                        >{{ $t("cancel") }}</a
                    >
                </div>
            </div>
        </dialog>

        <dialog ref="verifyBoardDialog" id="dialog-verify-board" @close="handleVerifyBoardDialogClose">
            <div id="dialog-verify-board-content-wrapper">
                <div ref="verifyBoardContent" id="dialog-verify-board-content"></div>
                <div class="btn dialog-buttons">
                    <a
                        href="#"
                        id="dialog-verify-board-abort-confirmbtn"
                        class="regular-button"
                        @click.prevent="handleVerifyBoardAbort"
                        >{{ $t("firmwareFlasherButtonAbort") }}</a
                    >
                    <a
                        href="#"
                        id="dialog-verify-board-continue-confirmbtn"
                        class="regular-button"
                        @click.prevent="handleVerifyBoardContinue"
                        >{{ $t("firmwareFlasherButtonContinue") }}</a
                    >
                </div>
            </div>
        </dialog>
    </BaseTab>
</template>

<script>
import { defineComponent, reactive, ref, onMounted, onBeforeUnmount, inject, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import Multiselect from "vue-multiselect";
import "vue-multiselect/dist/vue-multiselect.css";
import { i18n } from "../../js/localization";
import { useDialog } from "@/composables/useDialog";
import GUI, { TABS } from "../../js/gui";
import { useCloudBuild } from "../../composables/useCloudBuild.js";
import { useBoardSelection } from "../../composables/useBoardSelection.js";
import { useFirmwareFlashing, cleanUnifiedConfigFile } from "../../composables/useFirmwareFlashing.js";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { get as getStorage, set as setStorage } from "../../js/SessionStorage";
import BuildApi from "../../js/BuildApi";
import { tracking } from "../../js/Analytics";
import PortHandler from "../../js/port_handler";
import { gui_log } from "../../js/gui_log";
import semver from "semver";
import FileSystem from "../../js/FileSystem";
import AutoBackup from "../../js/utils/AutoBackup.js";
import { EventBus } from "../eventBus";
import STM32 from "../../js/protocols/webstm32";
import { ispConnected } from "../../js/utils/connection.js";
import FC from "../../js/fc";
import SponsorTile from "../sponsor/SponsorTile.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";
import SettingColumn from "../elements/SettingColumn.vue";

export default defineComponent({
    name: "FirmwareFlasherTab",
    components: {
        BaseTab,
        WikiButton,
        Multiselect,
        SponsorTile,
        UiBox,
        SettingRow,
        SettingColumn,
    },
    setup() {
        // Get $t from Vue i18n if available, otherwise use fallback
        const $t = inject("$t", (key, params) => i18n.getMessage(key, params));
        const dialog = useDialog();

        // Reactive state
        const state = reactive({
            localFirmwareLoaded: false,
            selectedBuildType: 0,
            selectedRadioProtocol: undefined,
            selectedTelemetryProtocol: undefined,
            selectedOsdProtocol: undefined,
            selectedMotorProtocol: undefined,
            selectedOptions: [],
            /** Expert mode cloud build: custom compile defines as tags (split on space) */
            customDefinesTags: [],
            selectedCommit: undefined,
            cloudBuildOptions: null,
            isConfigLocal: false,
            filename: null,
            configFilename: null,
            config: {},
            developmentFirmwareLoaded: false,
            preFlashingMessage: null,
            preFlashingMessageType: null,
            firmware_type: undefined,
            targetDetail: null,
            targetQualification: null,
            // Select options
            buildTypeOptions: [],
            radioProtocolOptions: [],
            telemetryProtocolOptions: [],
            osdProtocolOptions: [],
            motorProtocolOptions: [],
            optionsListOptions: [],
            commitOptions: [],
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
            releaseInfoVisible: false,
            buildConfigVisible: false,
            flashOnConnectWrapperVisible: false,
            manufacturerInfoVisible: false,
            cloudTargetInfoVisible: false,
            targetQualificationVisible: false,
            expertOptionsVisible: false,
            buildTypeRowVisible: false,
            commitSelectionVisible: false,
            // UI State - Text content
            targetQualificationText: "",
            // targetQualificationClass: "", // "gui_note" or "gui_warning"
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
            /** 0–100; drives firmware flash UProgress (replaces native progress element). */
            flashProgressValue: 0,
            osdProtocolNeedsAttention: false, // True if OSD protocol is empty (shows red)
            // UI State - Input values
            flashManualBaudRate: "256000",
            // Dialog states
            dialogUnstableFirmwareAcknowledgementCheckbox: false,
            flashingInProgress: false,
        });

        // Template refs for all interactive elements
        // Checkboxes
        const corebuildModeCheckbox = ref(null);

        // Buttons
        const exitDfuButton = ref(null);
        const flashFirmwareButton = ref(null);
        const loadRemoteFileButton = ref(null);
        const loadFileButton = ref(null);
        const cloudBuildCancelButton = ref(null);

        // Progress elements
        const progressLabel = ref(null);

        // Release info elements
        const releaseInfoContainer = ref(null);
        const targetSpan = ref(null);
        const manufacturerInfoDiv = ref(null);
        const manufacturerSpan = ref(null);
        const releaseNameLink = ref(null);
        const targetMCUSpan = ref(null);
        const releaseDateSpan = ref(null);
        const configFilenameSpan = ref(null);

        // Cloud build info elements
        const cloudTargetInfoDiv = ref(null);
        const cloudTargetLogLink = ref(null);
        const cloudTargetStatusSpan = ref(null);

        // Sponsor component ref
        const sponsorTile = ref(null);

        // Verify board dialog refs
        const verifyBoardDialog = ref(null);
        const verifyBoardContent = ref(null);
        const verifyBoardOnAcceptCallback = ref(null);
        const verifyBoardOnAbortCallback = ref(null);

        // Unstable firmware dialog refs
        const unstableFirmwareDialog = ref(null);
        const unstableFirmwareAcknowledgementCallback = ref(null);

        let dfuMonitorInterval = null;

        const buildApi = new BuildApi();
        const logHead = "[FIRMWARE_FLASHER]";

        const FLASH_MESSAGE_TYPES = {
            NEUTRAL: "NEUTRAL",
            VALID: "VALID",
            INVALID: "INVALID",
            ACTION: "ACTION",
        };

        // Helper functions
        const getExtension = (key) => {
            if (!key) {
                return undefined;
            }
            const lower = key.toLowerCase();
            return lower.split("?")[0].split("#")[0].split(".").pop();
        };

        // Flashing state control - update reactive state instead of DOM
        const enableFlashButton = (enabled) => {
            state.flashButtonDisabled = !enabled;
        };

        const enableLoadRemoteFileButton = (enabled) => {
            state.loadRemoteButtonDisabled = !enabled;
            // Resume sponsor when load buttons are re-enabled
            if (enabled) {
                sponsorTile.value?.resume();
            }
        };

        const enableLoadFileButton = (enabled) => {
            state.loadFileButtonDisabled = !enabled;
            // Resume sponsor when load buttons are re-enabled
            if (enabled) {
                sponsorTile.value?.resume();
            }
        };

        const enableDfuExitButton = (enabled) => {
            state.dfuExitButtonDisabled = !enabled;
        };

        const updateDfuExitButtonState = () => {
            const selectedPort = PortHandler.portPicker?.selectedPort || "";
            const hasDfuPortSelected = typeof selectedPort === "string" && selectedPort.startsWith("usb");
            enableDfuExitButton(PortHandler.dfuAvailable || hasDfuPortSelected);
        };

        const flashingMessage = (message, type) => {
            switch (type) {
                case FLASH_MESSAGE_TYPES.VALID:
                    state.progressLabelClass = "valid";
                    break;
                case FLASH_MESSAGE_TYPES.INVALID:
                    state.progressLabelClass = "invalid";
                    break;
                case FLASH_MESSAGE_TYPES.ACTION:
                    state.progressLabelClass = "actionRequired";
                    break;
                case FLASH_MESSAGE_TYPES.NEUTRAL:
                default:
                    state.progressLabelClass = "";
                    break;
            }
            if (message !== null) {
                state.progressLabelText = message;
            }
            return TABS.firmware_flasher;
        };

        const flashProgress = (value) => {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return TABS.firmware_flasher;
            }
            state.flashProgressValue = Math.max(0, Math.min(100, n));
            if (n >= 100) {
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
            }
            return TABS.firmware_flasher;
        };

        const resetFlashingState = () => {
            state.flashProgressValue = 0;
            state.flashingInProgress = false;
            GUI.flashingInProgress = false;
            enableFlashButton(!!firmwareFlashing.getParsedHex() || !!firmwareFlashing.getUf2Binary());
            updateDfuExitButtonState();
            enableLoadRemoteFileButton(true);
            enableLoadFileButton(true);

            if (firmwareFlashing.getParsedHex() || firmwareFlashing.getUf2Binary()) {
                if (state.preFlashingMessage && state.preFlashingMessageType) {
                    flashingMessage(state.preFlashingMessage, state.preFlashingMessageType);
                }
            } else {
                flashingMessage($t("firmwareFlasherFirmwareNotLoaded"), FLASH_MESSAGE_TYPES.NEUTRAL);
            }

            sponsorTile.value?.resume();
        };

        const preservePreFlashingState = () => {
            state.preFlashingMessage = state.progressLabelText;

            if (state.progressLabelClass === "valid") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.VALID;
            } else if (state.progressLabelClass === "invalid") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.INVALID;
            } else if (state.progressLabelClass === "actionRequired") {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.ACTION;
            } else {
                state.preFlashingMessageType = FLASH_MESSAGE_TYPES.NEUTRAL;
            }
        };

        const clearBoardConfig = () => {
            state.config = {};
            state.isConfigLocal = false;
            state.configFilename = null;
        };

        const setBoardConfig = (config, filename) => {
            state.config = config.join("\n");
            const hasFilename = filename !== undefined;
            state.isConfigLocal = hasFilename;
            state.configFilename = hasFilename ? filename : null;
        };

        const clearBufferedFirmware = () => {
            clearBoardConfig();
            firmwareFlashing.clearFirmwareState();
            state.firmware_type = undefined;
            state.localFirmwareLoaded = false;
            state.filename = null;
        };

        const showLoadedFirmware = (filename, bytes) => {
            state.filename = filename;

            if (state.localFirmwareLoaded) {
                flashingMessage(
                    $t("firmwareFlasherFirmwareLocalLoaded", {
                        filename: filename,
                        bytes: bytes,
                    }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            } else {
                flashingMessage(
                    `<a class="save_firmware" href="#" title="${$t("firmwareFlasherTooltipSaveFirmware")}">${$t(
                        "firmwareFlasherFirmwareOnlineLoaded",
                        { filename: filename, bytes: bytes },
                    )}</a>`,
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            }
            enableFlashButton(true);

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "FirmwareLoaded", {
                firmwareSize: bytes,
                firmwareName: filename,
                firmwareSource: state.localFirmwareLoaded ? "file" : "http",
                selectedTarget: state.targetDetail?.target,
                selectedRelease: state.targetDetail?.release,
            });
        };

        const cleanUnifiedConfigFileWrapper = (input) => {
            return cleanUnifiedConfigFile(input, {
                flashingMessage,
                gui_log,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
            });
        };

        const validateBuildKey = () => {
            return cloudBuild.state.cloudBuildKey?.length === 32 && ispConnected();
        };

        const findTargetDescriptor = (targetName) => {
            return boardSelection.state.targets?.find((descriptor) => descriptor.target === targetName);
        };

        const getSupportUrlForTarget = (targetName) => {
            const baseBoardUrl = "https://betaflight.com/docs/wiki/boards/current";
            const fallbackUrl = "https://betaflight.com/docs/wiki/boards/archive/Missing";

            if (!targetName || targetName === "0") {
                return fallbackUrl;
            }

            return `${baseBoardUrl}/${encodeURIComponent(targetName)}`;
        };

        const updateTargetQualification = (targetName) => {
            if (!targetName || targetName === "0") {
                state.targetQualificationVisible = false;
                return;
            }

            const targetDescriptor = findTargetDescriptor(targetName) ?? state.targetDetail;
            const descriptorGroup = targetDescriptor?.group;
            const isQualified = descriptorGroup === "supported" || targetDescriptor?.partnerApproved === true;

            if (isQualified) {
                state.targetQualificationText = $t("firmwareFlasherOptionLabelVerifiedPartner");
                state.targetQualification = true;
            } else {
                state.targetQualificationText = $t("firmwareFlasherOptionLabelNotQualified");
                state.targetQualification = false;
            }

            state.targetQualificationVisible = true;
        };

        const showReleaseNotes = (summary) => {
            if (!summary) {
                console.warn(`${logHead} showReleaseNotes called with null/undefined summary`);
                return;
            }

            if (summary.manufacturer) {
                state.manufacturerSpanText = summary.manufacturer;
                state.manufacturerInfoVisible = true;
            } else {
                state.manufacturerInfoVisible = false;
            }

            state.targetSpanText = summary.target || "";
            state.releaseNameText = summary.release || "";
            state.releaseNameLink = summary.releaseUrl || "#";
            state.releaseDateText = summary.date || "";
            state.targetMCUText = summary.mcu || "";
            state.configFilenameText = state.isConfigLocal ? state.configFilename : "[default]";

            if (summary.cloudBuild) {
                state.cloudTargetInfoVisible = true;
                cloudBuild.state.cloudTargetLogText = "";
                cloudBuild.state.cloudTargetLogUrl = "";
                cloudBuild.state.cloudTargetStatusText = "pending";
            } else {
                state.cloudTargetInfoVisible = false;
            }

            // Note: Don't set releaseInfoVisible or buildConfigVisible here
            // These will be set when user clicks Load Firmware Online button
        };

        const loadFailed = () => {
            if (progressLabel.value) {
                progressLabel.value.setAttribute("i18n", "firmwareFlasherFailedToLoadOnlineFirmware");
                progressLabel.value.classList.remove("i18n-replaced");
            }
            enableLoadRemoteFileButton(true);
            if (loadRemoteFileButton.value) {
                loadRemoteFileButton.value.textContent = $t("firmwareFlasherButtonLoadOnline");
            }
            i18n.localizePage();
        };

        const normalizeSelectValue = (value) => (value === "" ? null : value);

        const buildOptionsList = (optionKey, options) => {
            // Updated for Vue-based selects - just update state
            if (optionKey === "radioProtocols") {
                state.radioProtocolOptions = options.map((option) => ({
                    value: option.value,
                    label: option.name,
                    includesTelemetry: option.includesTelemetry,
                }));
            } else if (optionKey === "telemetryProtocols") {
                state.telemetryProtocolOptions = options.map((option) => ({
                    ...option,
                    value: normalizeSelectValue(option.value),
                    label: option.name,
                }));
            } else if (optionKey === "osdProtocols") {
                state.osdProtocolOptions = options.map((option) => ({
                    ...option,
                    value: normalizeSelectValue(option.value),
                    label: option.name,
                }));
            } else if (optionKey === "options") {
                state.optionsListOptions = options.map((option) => ({
                    ...option,
                    label: option.name,
                }));
            } else if (optionKey === "motorProtocols") {
                state.motorProtocolOptions = options.map((option) => ({
                    ...option,
                    value: normalizeSelectValue(option.value),
                    label: option.name,
                }));
            }
        };

        const toggleTelemetryProtocolInfo = () => {
            const radioOption = state.radioProtocolOptions.find(
                (option) => option.value === state.selectedRadioProtocol,
            );
            const hasTelemetryEnabledByDefault = radioOption?.includesTelemetry === true;

            state.telemetryProtocolDisabled = hasTelemetryEnabledByDefault;

            if (hasTelemetryEnabledByDefault) {
                // Check if "Automatically Included" option already exists
                let autoIncludedOption = state.telemetryProtocolOptions.find((option) => option.value === "-1");

                if (!autoIncludedOption) {
                    // Add the "Automatically Included" option at the beginning
                    autoIncludedOption = {
                        value: "-1",
                        name: $t("firmwareFlasherOptionLabelTelemetryProtocolIncluded"),
                        label: $t("firmwareFlasherOptionLabelTelemetryProtocolIncluded"),
                    };
                    state.telemetryProtocolOptions.unshift(autoIncludedOption);
                } else {
                    // Update the existing option text
                    autoIncludedOption.name = $t("firmwareFlasherOptionLabelTelemetryProtocolIncluded");
                    autoIncludedOption.label = autoIncludedOption.name;
                }

                state.selectedTelemetryProtocol = autoIncludedOption.value;
            } else {
                // Remove the "Automatically Included" option if it exists
                const autoIncludedIndex = state.telemetryProtocolOptions.findIndex((option) => option.value === "-1");
                if (autoIncludedIndex !== -1) {
                    state.telemetryProtocolOptions.splice(autoIncludedIndex, 1);

                    // If the current selection was "Automatically Included", select the default option
                    if (state.selectedTelemetryProtocol === "-1") {
                        const defaultTelemetryProtocol = state.telemetryProtocolOptions.find(
                            (option) => option.default === true,
                        );
                        state.selectedTelemetryProtocol =
                            defaultTelemetryProtocol?.value || state.telemetryProtocolOptions[0]?.value;
                    }
                }
            }
        };

        const updateOsdProtocolColor = () => {
            const v = state.selectedOsdProtocol;
            state.osdProtocolNeedsAttention = v === "" || v === undefined || v === null;
        };

        const preselectRadioProtocolFromStorage = () => {
            const storedRadioProtocol = getConfig("ffRadioProtocol").ffRadioProtocol;
            if (storedRadioProtocol) {
                const valueExistsInSelect = state.radioProtocolOptions.some(
                    (option) => option.value === storedRadioProtocol,
                );
                if (valueExistsInSelect) {
                    state.selectedRadioProtocol = storedRadioProtocol;
                }
            }
        };

        const buildOptions = (data) => {
            if (!data) {
                return;
            }

            // extract osd protocols from general options and add to osdProtocols
            state.cloudBuildOptions = FC.CONFIG.buildOptions || [];

            // Mark all options as default if they're in cloudBuildOptions
            data.radioProtocols = data.radioProtocols.map((option) => {
                option.default = option.default || state.cloudBuildOptions?.includes(option.value);
                return option;
            });

            data.telemetryProtocols = data.telemetryProtocols.map((option) => {
                option.default = option.default || state.cloudBuildOptions?.includes(option.value);
                return option;
            });

            data.motorProtocols = data.motorProtocols.map((option) => {
                option.default = option.default || state.cloudBuildOptions?.includes(option.value);
                return option;
            });

            data.generalOptions = data.generalOptions.map((option) => {
                // If using autodetect (cloudBuildOptions set), only mark as default if present in cloudBuildOptions
                option.default =
                    state.cloudBuildOptions.length > 0
                        ? state.cloudBuildOptions.includes(option.value)
                        : option.default || false;
                return option;
            });

            data.osdProtocols = data.generalOptions
                .filter((option) => option.group === "OSD")
                .map((option) => {
                    option.name = option.groupedName;
                    option.default = state.cloudBuildOptions?.includes(option.value);
                    return option;
                });

            // add None option to osdProtocols as first option
            data.osdProtocols.unshift({ name: "None", value: "" });

            // remove osdProtocols from generalOptions
            data.generalOptions = data.generalOptions.filter((option) => !option.group);

            buildOptionsList("radioProtocols", data.radioProtocols);
            buildOptionsList("telemetryProtocols", data.telemetryProtocols);
            buildOptionsList("osdProtocols", data.osdProtocols);
            buildOptionsList("options", data.generalOptions);
            buildOptionsList("motorProtocols", data.motorProtocols);

            // Preselect options where default === true (same item references as optionsListOptions for USelectMenu)
            state.selectedOptions = state.optionsListOptions.filter((option) => option.default === true);

            // Preselect radio protocol with default === true (USelect model is option value, not the full object)
            const defaultRadioProtocol = data.radioProtocols.find((option) => option.default === true);
            if (defaultRadioProtocol) {
                state.selectedRadioProtocol = defaultRadioProtocol.value;
            }

            // Preselect telemetry protocol with default === true
            const defaultTelemetryProtocol = data.telemetryProtocols.find((option) => option.default === true);
            if (defaultTelemetryProtocol) {
                state.selectedTelemetryProtocol = normalizeSelectValue(defaultTelemetryProtocol.value);
            }

            // Preselect OSD protocol with default === true
            const defaultOsdProtocol = data.osdProtocols.find((option) => option.default === true);
            if (defaultOsdProtocol) {
                state.selectedOsdProtocol = normalizeSelectValue(defaultOsdProtocol.value);
            }

            // Preselect motor protocol with default === true (USelect model is option value)
            const defaultMotorProtocol = data.motorProtocols.find((option) => option.default === true);
            if (defaultMotorProtocol) {
                state.selectedMotorProtocol = normalizeSelectValue(defaultMotorProtocol.value);
            }

            // Initialize OSD protocol color state
            updateOsdProtocolColor();

            if (!validateBuildKey()) {
                preselectRadioProtocolFromStorage();
            }

            toggleTelemetryProtocolInfo();
        };

        // Build types configuration
        const buildTypes = [
            {
                tag: "firmwareFlasherOptionLabelBuildTypeRelease",
            },
            {
                tag: "firmwareFlasherOptionLabelBuildTypeReleaseCandidate",
            },
            {
                tag: "firmwareFlasherOptionLabelBuildTypeDevelopment",
            },
        ];

        let buildTypesToShow = reactive([]);

        const buildBuildTypeOptionsList = () => {
            // Update state with build type options
            state.buildTypeOptions = buildTypesToShow.map(({ tag, title }, index) => ({
                value: index,
                label: tag ? $t(tag) : title,
            }));
        };

        const sortReleases = (a, b) => {
            return -semver.compareBuild(a.release, b.release);
        };

        // Initialize UI setup on mount
        const setupUIHandlers = async () => {
            // Setup expert mode toggle
            const expertMode = getConfig("expertMode").expertMode;
            state.expertMode = expertMode;

            // Initialize build types based on expert mode
            if (state.expertMode) {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes);
            } else {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes.slice(0, 2));
            }
            buildBuildTypeOptionsList();

            // Setup erase chip setting
            let result = getConfig("erase_chip");
            state.eraseChip = result.erase_chip;

            // Setup development releases
            result = getConfig("show_development_releases");
            state.showDevelopmentReleases = result.show_development_releases;
            state.buildTypeRowVisible = state.showDevelopmentReleases;

            // Setup no reboot setting
            result = getConfig("no_reboot_sequence");
            state.noRebootSequence = result.no_reboot_sequence;
            state.flashOnConnectWrapperVisible = state.noRebootSequence;

            // Setup manual baud rate
            result = getConfig("flash_manual_baud");
            state.flashManualBaud = result.flash_manual_baud;

            result = getConfig("flash_manual_baud_rate");
            state.flashManualBaudRate = String(result.flash_manual_baud_rate || 256000);

            // Setup expert options visibility
            state.expertOptionsVisible = state.expertMode;

            // Restore selected build type and trigger initial load
            const selectedBuildType = getConfig("selected_build_type").selected_build_type || 0;
            state.selectedBuildType = selectedBuildType;

            flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);

            updateDfuExitButtonState();

            await onBuildTypeChange();

            if (boardSelection.state.selectedBoard && boardSelection.state.selectedBoard !== "0") {
                await onBoardChange();
            }
        };

        const selectFirmware = async (release) => {
            // Extract release string from object if needed
            const releaseStr = typeof release === "string" ? release : release?.release;
            // Hide release info when changing firmware (will show when Load Online clicked)
            state.releaseInfoVisible = false;

            if (!state.localFirmwareLoaded) {
                enableFlashButton(false);
                flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);
                if (firmwareFlashing.getParsedHex() && firmwareFlashing.getParsedHex().bytes_total) {
                    // Changing the board triggers a version change, so we need only dump it here.
                    firmwareFlashing.clearFirmwareState();
                }
            }

            const target = boardSelection.state.selectedBoard;

            const loadCommitsForUnstableRelease = async (detail) => {
                const commits = await buildApi.loadCommits(detail.release);
                if (commits) {
                    state.commitOptions = commits.map((commit) => ({
                        label: commit.message.split("\n")[0],
                        value: commit.sha,
                    }));
                }
                state.commitSelectionVisible = true;
            };

            const handleCloudBuildConfiguration = async (detail) => {
                state.buildConfigVisible = true;

                const expertMode = state.expertMode;
                if (expertMode && detail.releaseType === "Unstable") {
                    await loadCommitsForUnstableRelease(detail);
                } else {
                    state.commitSelectionVisible = false;
                }

                state.expertOptionsVisible = expertMode;
                // Need to reset core build mode
                if (corebuildModeCheckbox.value) {
                    corebuildModeCheckbox.value.dispatchEvent(new Event("change", { bubbles: true }));
                }
            };

            const loadTargetDetail = async (detail) => {
                if (!detail) {
                    enableLoadRemoteFileButton(false);
                    return;
                }

                state.targetDetail = detail;

                if (detail.cloudBuild === true) {
                    await handleCloudBuildConfiguration(detail);
                }

                if (detail.configuration && !state.isConfigLocal) {
                    setBoardConfig(detail.configuration);
                }

                enableLoadRemoteFileButton(true);
                enableLoadFileButton(true);
            };

            try {
                let targetDetail = await buildApi.loadTarget(target, releaseStr);
                await loadTargetDetail(targetDetail);

                // Show release notes after loading target detail
                if (targetDetail) {
                    showReleaseNotes(targetDetail);
                }
            } catch (error) {
                console.error("Failed to load target:", error);
                loadFailed();
                updateTargetQualification(null);
                return;
            }

            try {
                if (validateBuildKey()) {
                    let options = await buildApi.loadOptionsByBuildKey(releaseStr, cloudBuild.state.cloudBuildKey);
                    if (options) {
                        buildOptions(options);
                        return;
                    }
                }
                let options = await buildApi.loadOptions(releaseStr);
                buildOptions(options);
            } catch (error) {
                console.error("Failed to load build options:", error);
                return;
            }
        };

        const populateReleases = async (target) => {
            const releases = target.releases;
            if (releases && releases.length > 0) {
                const build_type = state.selectedBuildType || 0;

                const filteredReleases = releases
                    .sort(sortReleases)
                    .filter((r) => {
                        return (
                            (r.type === "Unstable" && build_type > 1) ||
                            (r.type === "ReleaseCandidate" && build_type > 0) ||
                            r.type === "Stable"
                        );
                    })
                    .map((release) => ({
                        ...release,
                        label: `${release.release} [${release.label}]`,
                    }));

                boardSelection.state.firmwareVersionOptions = filteredReleases;

                // Assume flashing latest, so default to it.
                if (filteredReleases.length > 0) {
                    boardSelection.state.selectedFirmwareVersion = filteredReleases[0].release;
                    await selectFirmware(boardSelection.state.selectedFirmwareVersion);
                }
            } else {
                boardSelection.state.firmwareVersionOptions = [];
                boardSelection.state.selectedFirmwareVersion = "";
            }
        };

        const saveFirmware = async () => {
            const fileType = state.firmware_type;
            try {
                const file = await FileSystem.pickSaveFile(
                    state.filename,
                    $t("fileSystemPickerFiles", { typeof: fileType.toUpperCase() }),
                    `.${fileType.toLowerCase()}`,
                );
                if (!file) {
                    return false;
                }

                await FileSystem.writeFile(
                    file,
                    fileType === "UF2" ? firmwareFlashing.getUf2Binary() : firmwareFlashing.getIntelHex(),
                );
                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        };

        let eventListenerRefs = null;

        const setupEventBusListeners = () => {
            const { detectedUsbDevice, onDeviceRemoved } = firmwareFlashing.setupFlashingEventListeners({
                getFlashOnConnect: () => state.flashOnConnect,
                onBoardChange,
                clearBufferedFirmware,
                updateDfuExitButtonState,
                initiateFlashing,
                startFlashing,
                logHead,
            });

            EventBus.$on("port-handler:auto-select-usb-device", detectedUsbDevice);
            EventBus.$on("port-handler:device-removed", onDeviceRemoved);

            // Store references for proper cleanup in onBeforeUnmount
            eventListenerRefs = { detectedUsbDevice, onDeviceRemoved };
        };

        onMounted(async () => {
            if (GUI.active_tab !== "firmware_flasher") {
                GUI.active_tab = "firmware_flasher";
            }

            // Reset state on tab initialization
            boardSelection.resetBoardSelection();
            cloudBuild.resetCloudBuildState();
            firmwareFlashing.clearFirmwareState();
            state.cloudBuildOptions = null;
            state.localFirmwareLoaded = false;
            state.isConfigLocal = false;
            state.customDefinesTags = [];

            // Setup UI handlers and event bus listeners
            await setupUIHandlers();
            setupFlashButton();
            setupLoadRemoteFileButton();
            setupEventBusListeners();

            // Register this module for backward compatibility
            TABS.firmware_flasher = {
                targets: boardSelection.state.targets,
                validateBuildKey,
                resetFlashingState,
                preservePreFlashingState,
                flashingMessage,
                flashProgress,
                cleanup,
                FLASH_MESSAGE_TYPES,
                requestDfuPermission,
                get parsed_hex() {
                    return firmwareFlashing.getParsedHex();
                },
                get hex() {
                    return firmwareFlashing.getIntelHex();
                },
                get uf2_binary() {
                    return firmwareFlashing.getUf2Binary();
                },
            };

            GUI.content_ready(function () {});

            // Localize content
            i18n.localizePage();
        });

        const teardownEventBusListeners = () => {
            if (!eventListenerRefs) {
                return;
            }

            EventBus.$off("port-handler:auto-select-usb-device", eventListenerRefs.detectedUsbDevice);
            EventBus.$off("port-handler:device-removed", eventListenerRefs.onDeviceRemoved);
            eventListenerRefs = null;
        };

        onBeforeUnmount(() => {
            teardownEventBusListeners();

            if (dfuMonitorInterval) {
                clearInterval(dfuMonitorInterval);
                dfuMonitorInterval = null;
            }

            // Cleanup cloud build polling
            cloudBuild.cleanup();
        });

        const cleanup = (callback) => {
            teardownEventBusListeners();

            if (callback) {
                callback();
            }
        };

        /**
         * Show a dialog prompting the user to grant USB permission for DFU.
         * Called by STM32 protocol when the browser blocks requestDevice()
         * due to missing user gesture. The dialog button provides that gesture.
         */
        const requestDfuPermission = () => {
            const onCancel = () => {
                STM32.handleError();
                enableDfuExitButton(true);
            };

            dialog.openYesNo(
                $t("stm32UsbDfuNotFound"),
                $t("stm32DfuPermissionRequired"),
                async () => {
                    try {
                        const device = await PortHandler.dfuProtocol.requestPermission();
                        if (!device) {
                            onCancel();
                        }
                        // handleNewDevice → addedDevice → detectedUsbDevice → startFlashing
                    } catch (e) {
                        console.error(`${logHead} DFU permission request failed:`, e);
                        onCancel();
                    }
                },
                onCancel,
                {
                    yesText: $t("portsSelectPermissionDFU"),
                    noText: $t("dialogClose"),
                },
            );
        };

        // Flashing methods
        const startFlashing = async () => {
            const selectedBoardTarget = boardSelection.state.selectedBoard;

            // Pause sponsor during flashing
            sponsorTile.value?.pause();

            await firmwareFlashing.startFlashing({
                config: state.config,
                clearBoardConfig,
                // Flash HEX options
                eraseChip: state.eraseChip,
                noRebootSequence: state.noRebootSequence,
                flashManualBaud: state.flashManualBaud,
                flashManualBaudRate: state.flashManualBaudRate,
                filename: state.filename,
                resetFlashingState,
                // Board verification options
                selectedBoard: selectedBoardTarget,
                localFirmwareLoaded: state.localFirmwareLoaded,
                showDialogVerifyBoard,
                // UI callbacks
                flashingMessage,
                flashProgress,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                setFlashOnConnect: (value) => {
                    state.flashOnConnect = value;
                },
                logHead,
            });
        };

        const startBackup = async (callback) => {
            GUI.connect_lock = true;

            const aborted = function (message) {
                GUI.connect_lock = false;
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
                enableFlashButton(true);
                enableLoadRemoteFileButton(true);
                enableLoadFileButton(true);
                flashingMessage($t(message), FLASH_MESSAGE_TYPES.INVALID);
            };

            const callBackWhenPortAvailable = function () {
                const startTime = Date.now();
                const interval = setInterval(() => {
                    if (PortHandler.portAvailable) {
                        clearInterval(interval);
                        callback();
                    } else if (Date.now() - startTime > 5000) {
                        clearInterval(interval);
                        aborted("portsSelectNone");
                    }
                }, 100);
            };

            AutoBackup.execute((result) => {
                GUI.connect_lock = false;
                if (result) {
                    callBackWhenPortAvailable();
                } else {
                    aborted("firmwareFlasherCanceledBackup");
                }
            });
        };

        const checkShowAcknowledgementDialog = async () => {
            const DAY_MS = 86400 * 1000;
            const storageTag = "lastDevelopmentWarningTimestamp";

            function setAcknowledgementTimestamp() {
                const storageObj = {};
                storageObj[storageTag] = Date.now();
                setStorage(storageObj);
            }

            const result = getStorage(storageTag);
            if (!result[storageTag] || Date.now() - result[storageTag] > DAY_MS) {
                await showAcknowledgementDialog(setAcknowledgementTimestamp);
            } else {
                await startFlashing();
            }
        };

        const showAcknowledgementDialog = async (acknowledgementCallback) => {
            await nextTick();

            if (!unstableFirmwareDialog.value) {
                console.error("Dialog element not found");
                return;
            }

            unstableFirmwareAcknowledgementCallback.value = acknowledgementCallback;
            unstableFirmwareDialog.value.showModal();
        };

        const handleUnstableFirmwareDialogClose = () => {
            state.dialogUnstableFirmwareAcknowledgementCheckbox = false;
            unstableFirmwareAcknowledgementCallback.value = null;
        };

        const initiateFlashing = async () => {
            const isUnstableFirmware =
                state.developmentFirmwareLoaded || state.targetDetail?.releaseType === "Unstable";

            if (isUnstableFirmware) {
                await checkShowAcknowledgementDialog();
            } else {
                await startFlashing();
            }
        };

        // Setup flash firmware button
        const setupFlashButton = () => {};

        // Remote build and firmware loading
        const enforceOSDSelection = async () => {
            // Skip OSD selection enforcement in core build mode
            if (state.coreBuildMode) {
                return true;
            }

            const selectedRelease = boardSelection.state.selectedFirmwareVersion || "";
            const selectedFirmware = boardSelection.state.firmwareVersionOptions?.find(
                (option) => option.release === selectedRelease,
            );
            const versionText = selectedFirmware?.release ?? selectedRelease;

            // Skip OSD selection enforcement for firmware versions 4.3.x
            if (typeof versionText === "string" && versionText.startsWith("4.3.")) {
                return true;
            }

            const osd = state.selectedOsdProtocol;
            if (osd === "" || osd === undefined || osd === null) {
                return dialog.showYesNo(
                    $t("firmwareFlasherOSDProtocolNotSelected"),
                    $t("firmwareFlasherOSDProtocolNotSelectedDescription"),
                    {
                        yesText: $t("firmwareFlasherOSDProtocolNotSelectedContinue"),
                        noText: $t("firmwareFlasherOSDProtocolSelect"),
                    },
                );
            } else {
                return true;
            }
        };

        const setupLoadRemoteFileButton = () => {};

        const requestCloudBuild = async (targetDetail) => {
            const additionalParams = {
                coreBuildMode: state.coreBuildMode,
                selectedRadioProtocol: state.selectedRadioProtocol,
                selectedTelemetryProtocol: state.selectedTelemetryProtocol,
                selectedOptions: state.selectedOptions,
                selectedOsdProtocol: state.selectedOsdProtocol,
                selectedMotorProtocol: state.selectedMotorProtocol,
                expertMode: state.expertMode,
                selectedCommit: state.selectedCommit?.value,
                customDefinesTags: state.customDefinesTags,
                isConfigLocal: state.isConfigLocal,
            };

            const response = await cloudBuild.requestCloudBuild(targetDetail, additionalParams);
            if (response) {
                state.targetDetail.file = response.file;
            }
        };

        const processFile = async (data, key) => {
            const ext = getExtension(key);
            const result = await firmwareFlashing.processFirmware(data, ext, {
                enableFlashButton,
                enableLoadRemoteFileButton,
                showLoadedFirmware,
                key,
            });

            if (result) {
                state.firmware_type = result.firmwareType;
            }

            enableLoadRemoteFileButton(true);
        };

        // Initialize firmware flashing composable
        const firmwareFlashing = useFirmwareFlashing({
            flashingMessage,
            flashProgress,
            FLASH_MESSAGE_TYPES,
            $t,
            logHead,
        });

        // Initialize cloud build composable
        const cloudBuild = useCloudBuild({
            buildApi,
            $t,
            setBoardConfig,
            processFile,
            flashingMessage,
            enableLoadRemoteFileButton,
            FLASH_MESSAGE_TYPES,
        });

        // Initialize board selection composable
        const boardSelection = useBoardSelection({
            buildApi,
            $t,
            updateTargetQualification,
            getSupportUrlForTarget,
            populateReleases,
            enableLoadRemoteFileButton,
            flashingMessage,
            flashProgress,
            FLASH_MESSAGE_TYPES,
            getSelectedBuildType: () => Number.parseInt(state.selectedBuildType, 10),
            logHead,
        });

        // Wrapper functions to handle state updates from composable
        const onBuildTypeChange = async () => {
            await boardSelection.onBuildTypeChange();
        };

        const onBoardChange = async () => {
            const result = await boardSelection.onBoardChange();
            if (result) {
                state.targetSupportUrl = result.targetSupportUrl;
            }
            state.releaseInfoVisible = false;
        };

        const handleDetectBoard = async () => {
            await boardSelection.handleDetectBoard();
        };

        const onFirmwareVersionChange = async () => {
            await selectFirmware(boardSelection.state.selectedFirmwareVersion);
        };

        const onRadioProtocolChange = (value) => {
            state.selectedRadioProtocol = value;
            toggleTelemetryProtocolInfo();
            if (state.cloudBuildOptions) {
                setConfig({ ffRadioProtocol: value });
            }
        };

        const onTelemetryProtocolChange = (value) => {
            state.selectedTelemetryProtocol = value;
        };

        const onOsdProtocolChange = (value) => {
            state.selectedOsdProtocol = value;
            updateOsdProtocolColor();
        };

        const onMotorProtocolChange = (value) => {
            state.selectedMotorProtocol = value;
        };

        const onOptionsChange = (value) => {
            state.selectedOptions = Array.isArray(value) ? value : [];
        };

        const removeSelectedBuildOption = (option) => {
            const key = option?.value;
            state.selectedOptions = state.selectedOptions.filter((o) => o.value !== key);
        };

        const onCommitChange = (value) => {
            state.selectedCommit = value;
        };

        /** USelectMenu @create: add PR #, commit SHA, or branch string not in the loaded list */
        const onCommitCreate = (...args) => {
            const raw =
                args.find((a) => typeof a === "string") ??
                (typeof args[args.length - 1] === "string" ? args[args.length - 1] : "");
            const formattedValue = String(raw ?? "").trim();
            if (!formattedValue) {
                return;
            }

            const prMatch = formattedValue.match(/^#?(\d+)$/);
            let newOption;
            if (prMatch) {
                newOption = {
                    label: `PR #${prMatch[1]}`,
                    value: `pull/${prMatch[1]}/head`,
                };
            } else {
                newOption = {
                    label: formattedValue,
                    value: formattedValue,
                };
            }

            if (!state.commitOptions.some((o) => o.value === newOption.value)) {
                state.commitOptions.push(newOption);
            }
            state.selectedCommit = newOption;
        };

        // UI State change handlers
        const handleExpertModeChange = () => {
            setConfig({ expertMode: state.expertMode });
            state.expertOptionsVisible = state.expertMode;

            // Update build types based on expert mode
            if (state.expertMode) {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes);
            } else {
                buildTypesToShow.splice(0, buildTypesToShow.length, ...buildTypes.slice(0, 2));
            }
            buildBuildTypeOptionsList();
            state.selectedBuildType = 0;
        };

        const handleShowDevelopmentReleasesChange = async () => {
            setConfig({ show_development_releases: state.showDevelopmentReleases });
            state.buildTypeRowVisible = state.showDevelopmentReleases;

            // When hiding release candidates/development builds, force Release list and default to first option
            if (!state.buildTypeRowVisible && state.selectedBuildType > 0) {
                state.selectedBuildType = 0;
                setConfig({ selected_build_type: 0 });

                const boardTarget = boardSelection.state.selectedBoard;

                if (boardTarget) {
                    try {
                        const targetReleases = await buildApi.loadTargetReleases(boardTarget);
                        await populateReleases({ target: boardTarget, releases: targetReleases.releases });
                    } catch (error) {
                        console.error(
                            `${logHead} Failed to load target releases when hiding development releases:`,
                            error,
                        );
                    }
                } else {
                    boardSelection.state.firmwareVersionOptions = [];
                    boardSelection.state.selectedFirmwareVersion = "";
                }
            }
        };

        const handleNoRebootChange = () => {
            setConfig({ no_reboot_sequence: state.noRebootSequence });
            state.flashOnConnectWrapperVisible = state.noRebootSequence;
            if (!state.noRebootSequence) {
                state.flashOnConnect = false;
            }
        };

        const handleEraseChipChange = () => {
            setConfig({ erase_chip: state.eraseChip });
        };

        const handleFlashManualBaudChange = () => {
            setConfig({ flash_manual_baud: state.flashManualBaud });
        };

        const handleFlashManualBaudRateChange = () => {
            const baud = Number.parseInt(state.flashManualBaudRate);
            setConfig({ flash_manual_baud_rate: baud });
        };

        // Click event handlers for buttons
        const handleExitDfu = async () => {
            await firmwareFlashing.exitDfu({
                parsedHex: firmwareFlashing.getParsedHex(),
                dfuExitButtonDisabled: state.dfuExitButtonDisabled,
                connectLock: GUI.connect_lock,
                flashingMessage,
                flashProgress,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                logHead,
            });
        };

        const handleFlashFirmware = async () => {
            if (state.flashButtonDisabled) {
                return;
            }

            state.progressLabelText = "";
            state.flashingInProgress = true;
            GUI.flashingInProgress = true;
            await nextTick();

            const options = {
                connectLock: GUI.connect_lock,
                firmwareType: state.firmware_type,
                filename: state.filename,
                flashOnConnect: state.flashOnConnect,
                portAvailable: PortHandler.portAvailable,
                dfuAvailable: PortHandler.dfuAvailable,
                preservePreFlashingState,
                enableFlashButton,
                enableDfuExitButton,
                enableLoadRemoteFileButton,
                enableLoadFileButton,
                flashingMessage,
                flashProgress,
                saveFirmware,
                startFlashing,
                startBackup,
                initiateFlashing,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                t: $t,
                progressCallback: () => {
                    /* callback reserved for future use */
                },
            };

            try {
                await firmwareFlashing.runFlashWorkflow(options);
            } catch (error) {
                state.flashingInProgress = false;
                GUI.flashingInProgress = false;
                throw error;
            }
        };

        const handleLoadRemoteFile = async () => {
            if (state.loadRemoteButtonDisabled || !boardSelection.state.selectedBoard) {
                return;
            }

            const shouldContinue = await enforceOSDSelection();
            if (!shouldContinue) {
                return;
            }

            enableFlashButton(false);
            enableLoadRemoteFileButton(false);

            state.localFirmwareLoaded = false;
            const buildType = state.selectedBuildType;
            state.developmentFirmwareLoaded = buildType > 1;

            if (!boardSelection.state.selectedFirmwareVersion || boardSelection.state.selectedFirmwareVersion === "0") {
                gui_log($t("firmwareFlasherNoFirmwareSelected"));
                enableLoadRemoteFileButton(true);
                return;
            }

            if (state.targetDetail) {
                flashingMessage($t("firmwareFlasherButtonDownloading"), FLASH_MESSAGE_TYPES.NEUTRAL);
                showReleaseNotes(state.targetDetail);
                // Show release info section when Load Firmware Online button is clicked
                state.releaseInfoVisible = true;
                await requestCloudBuild(state.targetDetail);
            } else {
                flashingMessage($t("firmwareFlasherFailedToLoadOnlineFirmware"), FLASH_MESSAGE_TYPES.NEUTRAL);
                i18n.localizePage();
                enableLoadRemoteFileButton(true);
            }
        };

        const processFirmwareFile = async (file, extension, data) => {
            state.localFirmwareLoaded = true;
            const result = await firmwareFlashing.processFirmware(data, extension, {
                flashingMessage,
                enableFlashButton,
                enableLoadRemoteFileButton: () => {}, // Don't enable remote button for local files
                showLoadedFirmware,
                t: $t,
                flashMessageTypes: FLASH_MESSAGE_TYPES,
                key: file.name,
                logHead,
                isLocalFile: true,
            });
            if (result) {
                state.firmware_type = result.firmwareType;
            }
            enableLoadFileButton(true);
        };

        const processConfigFile = (file, data) => {
            clearBufferedFirmware();
            const config = cleanUnifiedConfigFileWrapper(data);
            if (config === null) {
                return;
            }

            setBoardConfig(config, file.name);

            if (state.isConfigLocal && !firmwareFlashing.getParsedHex()) {
                flashingMessage($t("firmwareFlasherLoadedConfig"), FLASH_MESSAGE_TYPES.NEUTRAL);
                return;
            }

            const shouldEnableFlash =
                (state.isConfigLocal && firmwareFlashing.getParsedHex() && !state.localFirmwareLoaded) ||
                state.localFirmwareLoaded;
            if (shouldEnableFlash) {
                enableFlashButton(true);
                flashingMessage(
                    $t("firmwareFlasherFirmwareLocalLoaded", {
                        filename: file.name,
                        bytes: firmwareFlashing.getParsedHex()?.bytes_total || 0,
                    }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            }
        };

        const handleLoadFile = async () => {
            if (state.loadFileButtonDisabled) {
                return;
            }

            enableFlashButton(false);
            enableLoadRemoteFileButton(false);
            enableLoadFileButton(false);
            state.developmentFirmwareLoaded = false;

            try {
                const file = await FileSystem.pickOpenFile($t("fileSystemPickerFirmwareFiles"), [".hex", ".uf2"]);

                if (!file) {
                    enableLoadRemoteFileButton(true);
                    enableLoadFileButton(true);
                    return;
                }

                const extension = getExtension(file.name);

                if (extension === "uf2") {
                    const data = await FileSystem.readFileAsBlob(file);
                    await processFirmwareFile(file, extension, data);
                } else if (extension === "hex") {
                    const data = await FileSystem.readFile(file);
                    await processFirmwareFile(file, extension, data);
                } else {
                    const data = await FileSystem.readFile(file);
                    processConfigFile(file, data);
                }
            } catch (error) {
                console.error("Error reading file:", error);
                enableLoadRemoteFileButton(true);
                enableLoadFileButton(true);
            }
        };

        const handleUnstableFirmwareFlash = () => {
            if (!state.dialogUnstableFirmwareAcknowledgementCheckbox) {
                return;
            }

            if (unstableFirmwareDialog.value) {
                unstableFirmwareDialog.value.close();
            }

            if (unstableFirmwareAcknowledgementCallback.value) {
                unstableFirmwareAcknowledgementCallback.value();
            }

            startFlashing();
        };

        const handleUnstableFirmwareCancel = () => {
            state.dialogUnstableFirmwareAcknowledgementCheckbox = false;
            if (unstableFirmwareDialog.value) {
                unstableFirmwareDialog.value.close();
            }
        };

        const handleVerifyBoardAbort = () => {
            if (verifyBoardDialog.value) {
                verifyBoardDialog.value.close();
            }

            if (verifyBoardOnAbortCallback.value) {
                verifyBoardOnAbortCallback.value();
            }
        };

        const handleVerifyBoardContinue = () => {
            if (verifyBoardDialog.value) {
                verifyBoardDialog.value.close();
            }

            if (verifyBoardOnAcceptCallback.value) {
                verifyBoardOnAcceptCallback.value();
            }
        };

        const handleVerifyBoardDialogClose = () => {
            verifyBoardOnAcceptCallback.value = null;
            verifyBoardOnAbortCallback.value = null;
        };

        const showDialogVerifyBoard = (selected, verified, onAccept, onAbort) => {
            if (verifyBoardContent.value) {
                verifyBoardContent.value.innerHTML = $t("firmwareFlasherVerifyBoard", {
                    selected_board: selected,
                    verified_board: verified,
                });
            }

            if (verifyBoardDialog.value && !verifyBoardDialog.value.hasAttribute("open")) {
                verifyBoardOnAcceptCallback.value = onAccept;
                verifyBoardOnAbortCallback.value = onAbort;
                verifyBoardDialog.value.showModal();
            }
        };

        const handleProgressLabelClick = (event) => {
            if (event.target?.classList.contains("save_firmware")) {
                saveFirmware();
            }
        };

        // Return all public methods and state
        return {
            state,
            cloudBuild,
            boardSelection,
            FLASH_MESSAGE_TYPES,
            // Template refs
            sponsorTile,
            exitDfuButton,
            flashFirmwareButton,
            loadRemoteFileButton,
            loadFileButton,
            cloudBuildCancelButton,
            progressLabel,
            releaseInfoContainer,
            targetSpan,
            manufacturerInfoDiv,
            manufacturerSpan,
            releaseNameLink,
            targetMCUSpan,
            releaseDateSpan,
            configFilenameSpan,
            cloudTargetInfoDiv,
            cloudTargetLogLink,
            cloudTargetStatusSpan,
            verifyBoardDialog,
            verifyBoardContent,
            unstableFirmwareDialog,
            // Functions
            enableFlashButton,
            enableLoadRemoteFileButton,
            enableLoadFileButton,
            enableDfuExitButton,
            flashingMessage,
            flashProgress,
            resetFlashingState,
            validateBuildKey,
            startFlashing,
            setupFlashButton,
            setupLoadRemoteFileButton,
            cleanup,
            onBuildTypeChange,
            onBoardChange,
            onFirmwareVersionChange,
            onRadioProtocolChange,
            onTelemetryProtocolChange,
            onOsdProtocolChange,
            onMotorProtocolChange,
            onOptionsChange,
            removeSelectedBuildOption,
            onCommitChange,
            onCommitCreate,
            handleExpertModeChange,
            handleShowDevelopmentReleasesChange,
            handleNoRebootChange,
            handleEraseChipChange,
            handleFlashManualBaudChange,
            handleFlashManualBaudRateChange,
            handleExitDfu,
            handleFlashFirmware,
            handleLoadRemoteFile,
            handleLoadFile,
            handleDetectBoard,
            handleUnstableFirmwareFlash,
            handleUnstableFirmwareCancel,
            handleUnstableFirmwareDialogClose,
            handleVerifyBoardAbort,
            handleVerifyBoardContinue,
            handleVerifyBoardDialogClose,
            handleProgressLabelClick,
        };
    },
});
</script>

<style scoped lang="less">
.tab-firmware_flasher {
    min-height: 100%;

    .content_wrapper .data-loading {
        min-height: 150px;
        height: 50%;
        p {
            text-align: center;
            margin-top: 100px;
            padding-top: 1rem;
        }
    }
    .grid-box-spacer {
        height: 1rem;
    }
    .build-options-wrapper {
        .helpicon {
            margin-top: 8px;
        }

        // Multiselect styling to match native selects
        :deep(.multiselect) {
            width: calc(100% - 2rem) !important;
            min-height: 28px;
            font-size: 12px;
            font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
            position: relative;
            z-index: 1001;

            .multiselect__tags {
                min-height: 28px;
                padding: 4px 40px 4px 4px;
                background: var(--surface-100);
                border: 1px solid var(--border);
                border-radius: 3px;
                font-size: 12px;
                z-index: 1001;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
            }

            .multiselect__single {
                font-size: 12px;
                margin-bottom: 4px;
                padding: 0 0 0 2px;
                background: transparent;
                color: var(--text);
            }

            .multiselect__input {
                font-size: 12px;
                padding: 0 0 0 2px;
                background: transparent;
                color: var(--text);
            }

            .multiselect__placeholder {
                font-size: 12px;
                color: var(--subtitle);
                margin-bottom: 4px;
                padding-left: 2px;
            }

            .multiselect__select {
                height: 28px;
                width: 35px;
                z-index: 1002;

                &:before {
                    border-color: var(--text) transparent transparent;
                    top: 60%;
                }
            }

            .multiselect__content-wrapper {
                background: var(--surface-100);
                border: 1px solid var(--border);
                border-radius: 3px;
                max-height: 200px;
                z-index: 9999;
                position: absolute;
            }

            .multiselect__content {
                background: var(--surface-100);
                z-index: 9999;
            }

            .multiselect__option {
                font-size: 12px;
                padding: 6px 8px;
                min-height: 28px;
                color: var(--text);
                z-index: 1003;

                &--highlight {
                    background: var(--primary-500);
                    color: var(--surface-50);
                }

                &--selected {
                    background: var(--surface-400);
                    color: var(--text);
                    font-weight: normal;

                    &.multiselect__option--highlight {
                        background: var(--surface-600);
                        color: var(--surface-50);
                    }
                }
            }

            .multiselect__tag {
                background: var(--surface-500);
                color: var(--surface-50);
                font-size: 11px;
                padding: 3px 20px 3px 6px;
                border-radius: 3px;
                z-index: 1002;
                display: inline-flex;
                align-items: center;
                gap: 4px;

                .multiselect__tag-icon {
                    &:after {
                        color: var(--surface-50);
                    }

                    &:hover {
                        background: var(--surface-600);
                    }
                }
            }

            &.multiselect--disabled {
                opacity: 0.6;

                .multiselect__tags {
                    background: var(--surface-200);
                }
            }
        }
    }
    .buildProgress {
        border-radius: 4px;
        appearance: none;
        -webkit-appearance: none;
        overflow: hidden;
        &::-webkit-progress-bar {
            background-color: var(--surface-500);
        }
        &::-webkit-progress-value {
            background-color: var(--primary-500);
            border-radius: 0 4px 4px 0;
        }
    }
    ul {
        li {
            list-style: initial;
            list-style-type: circle;
            margin-left: 30px;
        }
    }
    .options {
        position: relative;
        line-height: 18px;
        text-align: left;
        label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            input {
                margin-right: 0;
            }
            .helpicon {
                float: none;
                margin-left: 3px;
                margin-top: 0;
                display: inline-block;
                align-self: center;
            }
        }
        #flash_manual_baud_rate {
            margin-left: 0.5rem;
        }
    }
    /* Generic Vue-native switch styling (Switchery-like) */
    .vue-switch-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }
    .vue-switch-input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
    }
    .vue-switch-slider {
        position: relative;
        width: 30px; /* Switchery small width */
        height: 14px; /* Switchery small height */
        background: var(--switcherysecond);
        border-radius: 20px;
        transition: background-color 200ms ease;
        box-sizing: content-box;
        background-clip: content-box;
    }
    .vue-switch-slider::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 14px;
        height: 14px;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        transition: transform 200ms ease;
    }
    .vue-switch-input:checked + .vue-switch-slider {
        background: var(--primary-500);
    }
    .vue-switch-input:checked + .vue-switch-slider::before {
        transform: translateX(16px);
    }
    .vue-switch-text {
        font-size: 12px;
        line-height: 14px;
    }
    .board-selection-grid {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 0.5rem;
        align-items: start;
    }

    .board-selection-grid .grid-row {
        display: contents;
    }

    .board-selection-grid .grid-row.select-row {
        display: contents;
    }

    .board-selection-grid .grid-row:not(.select-row) {
        display: grid;
        grid-column: 1 / -1;
    }

    .board-selection-grid .build-select,
    .board-selection-grid .board-select,
    .board-selection-grid .firmware-version {
        grid-column: 1;
    }

    .board-selection-grid .help-icon-cell {
        grid-column: 2;
        text-align: center;
        padding-left: 0.5rem;
        padding-right: 0.5rem;
        width: 30px;
    }

    .board-selection-grid .action-button-cell {
        grid-column: 3;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        align-self: center;
    }
    .select-wrapper-simple {
        &.no-board-selected {
            pointer-events: none;
            opacity: 0.5;
        }
    }
    .select-wrapper {
        width: calc(100% - 2rem) !important;
        max-width: 30rem !important;
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 0.5rem;
        box-sizing: border-box;
        &.no-board-selected {
            pointer-events: none;
            opacity: 0.5;
        }
    }
    .detect-board {
        position: relative;
        top: auto;
        height: auto;
        right: auto;
        z-index: auto;
        pointer-events: all;
        display: flex;
        .fa-search::before {
            font-size: 11px;
        }
        span {
            padding: 0 0.5rem;
            background-color: var(--primary-500);
            cursor: pointer;
            color: var(--surface-50);
            font-size: 10px;
            border-radius: 999px;
            transition:
                color 200ms,
                background-color 200ms;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        &.disabled {
            pointer-events: none;
            cursor: default;
            span {
                background-color: var(--surface-500);
                color: var(--text);
                cursor: default;
            }
        }
    }

    .select-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        .select-wrapper {
            width: 100% !important;
            max-width: none !important;
        }
        strong {
            font-size: 12px;
        }
    }
    /* Keep help icons inline with multiselects inside Build Configuration */
    .build_configuration .select-group {
        display: grid;
        grid-template-columns: 1fr auto;
        row-gap: 0.25rem;
        align-items: center;
    }
    .build_configuration .select-group > strong {
        grid-column: 1 / -1;
    }
    .build_configuration .select-group .select-wrapper {
        grid-column: 1;
        /* allow help icon to sit alongside; avoid forcing full-width */
        max-width: none !important;
        width: 100% !important;
    }
    .build_configuration .select-group .helpicon {
        grid-column: 2;
        margin-top: 0; /* keep vertically centered */
    }
    .build_configuration {
        .gui_box_titlebar {
            display: flex;
            flex-direction: row-reverse;
            gap: 1rem;
            flex-wrap: nowrap;
            align-items: center;
        }
        .build_configuration_toggle_wrapper {
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            gap: 0.5rem;
        }
        .spacer_box_title {
            white-space: nowrap;
        }
        #customDefinesInfo {
            width: 100%;
        }
        /* Vue-native switch styling to mimic Switchery */
        #build_configuration_toggle_label.vue-switch-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
        }
        #build_configuration_toggle_label .vue-switch-input {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
        }
        #build_configuration_toggle_label .vue-switch-slider {
            position: relative;
            width: 30px; /* Matches Switchery small width */
            height: 14px; /* Matches Switchery small height */
            background: var(--switcherysecond);
            border-radius: 20px;
            transition: background-color 200ms ease;
            box-sizing: content-box;
            background-clip: content-box;
        }
        #build_configuration_toggle_label .vue-switch-slider::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 14px;
            height: 14px;
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
            transition: transform 200ms ease;
        }
        #build_configuration_toggle_label .vue-switch-input:checked + .vue-switch-slider {
            background: var(--primary-500);
        }
        #build_configuration_toggle_label .vue-switch-input:checked + .vue-switch-slider::before {
            transform: translateX(16px);
        }
        #build_configuration_toggle_label .vue-switch-text {
            font-size: 12px; /* Align with base form font size */
            line-height: 14px;
        }
    }

    /* Style multiselect tags for "Other options" selector */
    #optionsInfo :deep(.multiselect__tags) {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 4px !important;
    }

    #optionsInfo :deep(.multiselect__tag) {
        background: var(--surface-500) !important;
        color: var(--text) !important;
        font-size: 11px;
        padding: 3px 20px 3px 6px;
        border-radius: 3px;
        display: inline-flex !important;
        align-items: center !important;
    }

    #optionsInfo :deep(.multiselect__tag-icon) {
        &:after {
            color: var(--text) !important;
        }
        &:hover {
            background: var(--surface-600) !important;
        }
    }

    .default_btn {
        width: fit-content;
        padding-top: 0.25rem;
        padding-right: 0.25rem;
        a {
            padding: 0.15rem 0.5rem;
        }
    }

    /* Three-column grid layout for release info */
    .release_info_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
    }

    .release_info_grid .info_row {
        display: contents;
    }

    .release_info_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .release_info_grid span,
    .release_info_grid a {
        text-align: left;
    }

    .release_info_grid .board_support {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        justify-self: start;
    }

    .release_info_grid .board_support a#targetSupportInfoUrl {
        padding: 0 0.5rem;
        background-color: var(--primary-500);
        cursor: pointer;
        color: var(--surface-50);
        font-size: 10px;
        border-radius: 999px;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        height: auto;
        line-height: 1.4;
        text-decoration: none;

        &:hover {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }

        &:active {
            background-color: var(--primary-500);
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }
    }

    .release_info_grid .board_support .helpicon {
        margin-top: 0;
        float: none;
        display: inline-block;
        align-self: center;
    }

    /* Waiting overlay shown during flashing */
    .flashing-wait {
        text-align: center;
        padding: 2rem 1rem;
        font-size: 14px;
    }

    /* Cloud build info grid */
    .cloud_build_grid {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem 2rem;
        align-items: center;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border);
    }

    .cloud_build_grid .info_row {
        display: contents;
    }

    .cloud_build_grid strong {
        text-align: right;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .cloud_build_grid a {
        text-align: left;
    }

    .cloud_build_grid .status_wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    #cloudTargetStatus {
        padding-left: 0.5rem;
    }

    .release_info_grid .btn {
        justify-self: start;
    }

    .release_info_grid .btn a.cloud_build_cancel {
        padding: 0 0.5rem;
        background-color: var(--primary-500);
        cursor: pointer;
        color: var(--surface-50);
        font-size: 10px;
        border-radius: 999px;
        transition: all 200ms;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        height: auto;
        line-height: 1.4;
        text-decoration: none;

        &:hover:not(.disabled) {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }

        &:active:not(.disabled) {
            background-color: var(--primary-500);
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }

        &.disabled {
            pointer-events: none;
            cursor: default;
            background-color: var(--surface-500);
            color: var(--text);
        }
    }

    @media all and (max-width: 1455px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr 1fr;
            }
        }
    }
    @media all and (max-width: 991px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr;
            }
        }
    }
    & + .content_toolbar {
        width: calc(100% - 18rem) !important;
    }
    @media all and (max-width: 575px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr;
            }
        }
        .detect-board {
            span {
                height: 18px;
                padding: 0 1rem !important;
                & > div {
                    display: none;
                }
            }
        }
    }
}

:deep(.toolbar_fixed_bottom.content_toolbar) {
    width: calc(100% - 18rem) !important;
}

:deep(.content_toolbar) {
    width: fit-content;
    background-color: var(--surface-300);
    box-shadow: rgba(0, 0, 0, 0.1) 0 -0.5rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0.75rem 1rem;
    border-top-left-radius: 1.5rem;
    &::before {
        width: 1.5rem;
        aspect-ratio: 1;
        content: "";
        mask: url(../images/corner.svg);
        background-color: var(--surface-300);
        position: absolute;
        left: -1.5rem;
        bottom: 0;
    }
    .info {
        flex: 100;
        position: relative;
        .progress {
            width: 100%;
            height: 30px;
            border-radius: 0.25rem;
            overflow: hidden;
            &::-webkit-progress-bar {
                background-color: var(--surface-400);
            }
        }
        .progressLabel {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            text-align: center;
            font-size: 0.75rem;
            line-height: 1.75rem;
            &.valid {
                background-color: var(--success-600);
                border-radius: 5px;
            }
            &.invalid {
                background-color: var(--error-500);
                border-radius: 5px;
            }
            &.actionRequired {
                background-color: var(--warning-500);
                border-radius: 5px;
            }
        }
    }
    .btn {
        a {
            margin-top: 0;
            margin-bottom: 0;
            background-color: var(--primary-500);
            border-radius: 3px;
            border: 1px solid var(--primary-600);
            color: #000;
            float: right;
            font-weight: bold;
            font-size: 12px;
            display: block;
            cursor: pointer;
            transition: all ease 0.2s;
            padding: 0 0.5rem;
            line-height: 28px;
            user-select: none;
            white-space: nowrap;
            &:hover {
                background-color: var(--primary-400);
                transition: all ease 0.2s;
            }
            &:active {
                background-color: var(--primary-500);
                transition: all ease 0s;
                box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
            }
            .helpicon {
                margin-left: 5px;
            }
        }
        a.disabled {
            cursor: default;
            color: var(--surface-900);
            background-color: var(--surface-500);
            border: 1px solid var(--surface-500);
            pointer-events: none;
            opacity: 1;
        }
    }
}

.btn {
    a {
        margin-top: 0;
        margin-bottom: 0;
        background-color: var(--primary-500);
        border-radius: 3px;
        border: 1px solid var(--primary-600);
        color: #000;
        float: right;
        font-weight: bold;
        font-size: 12px;
        display: block;
        cursor: pointer;
        transition: all ease 0.2s;
        padding: 0 0.5rem;
        line-height: 28px;
        user-select: none;
        white-space: nowrap;
        &:hover {
            background-color: var(--primary-400);
            transition: all ease 0.2s;
        }
        &:active {
            background-color: var(--primary-500);
            transition: all ease 0s;
            box-shadow: inset 0 1px 5px rgba(0, 0, 0, 0.35);
        }
        &.disabled {
            background-color: var(--surface-500);
            border: 1px solid var(--surface-400);
            color: var(--surface-900);
            cursor: default;
        }
    }
}

.osd-needs-attention {
    :deep(.multiselect__single),
    :deep(.multiselect__placeholder) {
        color: red !important;
    }
}

/* Container management */
.select-wrapper.fixed-width {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 240px;
    max-width: 440px;
    position: relative;
    z-index: 1002; /* Lower than board select, but active state will be above expert options */
}

:deep(.standard-select) {
    min-height: 28px;
    font-size: 12px;
    flex: 1;
    z-index: 1001 !important;
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
    position: relative;
}

/* Multi Selects */
:deep(.standard-select .multiselect__tags) {
    min-height: 28px;
    padding: 0 30px 0 8px;
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    background: var(--surface-200);
    display: flex;
    align-items: center;
}

:deep(.standard-select .multiselect__single),
:deep(.standard-select .multiselect__input),
:deep(.standard-select .multiselect__placeholder) {
    color: var(--text) !important;
    background: transparent !important;
    line-height: 26px;
    margin-bottom: 0;
}

/* FIX: Hide search text when selection is present */
:deep(.standard-select:not(.multiselect--active) .multiselect__input) {
    opacity: 0 !important;
    position: absolute !important;
}

/* Dropdown list styling */
:deep(.standard-select .multiselect__content-wrapper) {
    position: absolute;
    display: block;
    background: var(--surface-400);
    border: 1px solid var(--surface-600);
    border-top: none;
    z-index: 99999 !important; /* Extremely high to clear all elements including switchery (1000) */
    max-height: 250px;
    overflow-y: auto;
    width: 100%;
    left: 0;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);
}

:deep(.standard-select .multiselect__option) {
    font-size: 12px !important;
    color: var(--text) !important;
    padding: 8px 12px;
    min-height: 30px;
}

:deep(.standard-select .multiselect__option--highlight) {
    background: var(--surface-300) !important; /* Darker blue for better contrast */
    color: var(--text) !important;
}

/* 1. Reset the internal input to remove borders/outlines */
:deep(.standard-select .multiselect__input) {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--text) !important;
    font-size: 12px !important;
}

/* 2. Target the placeholder text specifically */
:deep(.standard-select .multiselect__placeholder) {
    color: var(--text) !important;
    font-size: 12px !important;
    margin-bottom: 0;
    padding-top: 0;
    line-height: 26px; /* Vertical centering */
    border: none !important;
}

/* 3. Target the native placeholder inside the search input */
:deep(.standard-select .multiselect__input::placeholder) {
    color: var(--text) !important;
    font-size: 12px !important;
    border: none !important;
}

/* 4. Ensure the selected single value matches page font size */
:deep(.standard-select .multiselect__single) {
    font-size: 12px !important;
    line-height: 26px;
    padding: 0 0 0 2px;
    margin-bottom: 0;
}

/* Firmware version dropdown should appear above expert options but below board select when both open */
.select-wrapper.fixed-width :deep(.standard-select.multiselect--active) {
    z-index: 1005 !important; /* Below board select active (100000) but above everything else */
}

.select-wrapper.fixed-width :deep(.standard-select .multiselect__content-wrapper) {
    z-index: 1001 !important;
}

.select-wrapper {
    /* When multiselect is open, enable positioning and high z-index */
    :deep(.standard-select.multiselect--active) {
        position: relative;
        z-index: 10000 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
        z-index: 10001 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content) {
        z-index: 10001 !important;
    }
}

.select-wrapper-simple {
    /* When multiselect is open, enable positioning and high z-index */
    :deep(.standard-select.multiselect--active) {
        position: relative;
        z-index: 10000 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
        z-index: 10001 !important;
    }

    :deep(.standard-select.multiselect--active .multiselect__content) {
        z-index: 10001 !important;
    }
}

/* When multiselect is open, increase z-index to be above everything */
:deep(.standard-select.multiselect--active) {
    position: relative;
    z-index: 10000 !important;
}

:deep(.standard-select.multiselect--active .multiselect__content-wrapper) {
    z-index: 10001 !important;
}

:deep(.standard-select.multiselect--active .multiselect__content) {
    z-index: 10001 !important;
}

:deep(.standard-select .multiselect__option--selected) {
    background: var(--surface-300) !important;
    color: var(--text) !important;
    font-weight: normal;
}

:deep(.standard-select .multiselect__option--selected.multiselect__option--highlight) {
    background: var(--surface-500) !important;
    color: var(--surface-50) !important;
}

/* Group headers (Legacy, Supported, etc.) */
:deep(.standard-select .multiselect__option--group) {
    background: var(--surface-600) !important;
    color: var(--text) !important;
    font-size: 10px !important;
    font-weight: bold;
}

/* List styling for recovery and warning text - using :deep to pierce scoped styles */
:deep(.note-text-format ul) {
    list-style: none !important;
    margin-left: 0.5rem !important;
    margin-top: 0.5rem !important;
    margin-bottom: 0.5rem !important;
    padding-left: 0 !important;
}

:deep(.note-text-format li) {
    margin-bottom: 0.25rem !important;
    margin-left: 0 !important;
    padding-left: 1.5em !important; /* space for dash */
    text-indent: -1.5em !important; /* hanging indent so wrapped lines align after dash */
    position: relative;
}

:deep(.note-text-format li::before) {
    content: "– " !important;
    margin-right: 0.5rem !important;
    color: var(--text) !important;
}

/* Unstable firmware dialog content styling */
#dialogUnstableFirmwareAcknowledgement {
    .content {
        margin-bottom: 1rem;

        ul {
            margin: 0.5rem 0;
            padding-left: 1.5rem;
            list-style-type: disc;
        }

        li {
            margin: 0.25rem 0;
            line-height: 1.5;
        }

        strong {
            font-weight: bold;
            color: var(--warning);
        }
    }
}

/* Unstable firmware dialog list styling */
#dialogUnstableFirmwareAcknowledgement {
    :deep(ul) {
        margin-left: 1.5rem;
        margin-top: 0.5rem;
        margin-bottom: 0.5rem;
    }

    :deep(li) {
        list-style: disc;
        margin-bottom: 0.25rem;
        margin-left: 0.5rem;
    }
}
</style>
