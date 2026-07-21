<template>
    <BaseTab tab-name="firmware_flasher">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabFirmwareFlasher") }}</div>
            <WikiButton docUrl="firmware_flasher" />

            <UiBox title="Firmware target" type="neutral" class="mb-4">
                <div class="firmware-target-row">
                    <div>
                        <div class="font-semibold">Choose what you want to flash</div>
                        <div class="text-sm text-dimmed">
                            Betaflight/GIGFlight uses the normal FC flasher. ELRS/GIGLRS and AM32 use passthrough.
                        </div>
                    </div>
                    <USelect v-model="firmwareType" :items="firmwareTypeOptions" class="firmware-target-select" />
                </div>
            </UiBox>

            <template v-if="firmwareType === 'betaflight'">
                <!-- Sub-tab navigation -->
                <SubtabNav :items="subtabItems" v-model="activeFlasherStep" />

                <!-- Tab content -->
                <div class="flasher-tab-area">
                    <FlasherBoardBuildTab
                        v-if="activeFlasherStep === 'board-build'"
                        :state="state"
                        :board-selection="boardSelection"
                        :on-board-change="onBoardChange"
                        :on-detect-board="handleDetectBoard"
                        :on-firmware-version-change="onFirmwareVersionChange"
                    />
                    <FlasherFlashTab
                        v-if="activeFlasherStep === 'flash'"
                        :state="state"
                        :cloud-build="cloudBuild"
                        :on-save-firmware="saveFirmware"
                        :flash-ring-color="flashRingColor"
                        :on-no-reboot-change="handleNoRebootChange"
                        :on-erase-chip-change="handleEraseChipChange"
                        :on-flash-manual-baud-change="handleFlashManualBaudChange"
                        :on-flash-manual-baud-rate-change="handleFlashManualBaudRateChange"
                        :on-restore-backup="handleRestoreBackup"
                    />
                </div>
            </template>
            <FlasherElrsTab v-else-if="firmwareType === 'elrs'" ref="elrsFlasher" />
            <FlasherAm32Tab v-else-if="firmwareType === 'am32'" />
        </div>

        <div v-if="firmwareType === 'betaflight'" class="content_toolbar toolbar_fixed_bottom">
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="state.flashButtonDisabled || activeFlasherStep !== 'flash'"
                    :color="state.flashButtonDisabled || activeFlasherStep !== 'flash' ? 'neutral' : 'success'"
                    :loading="state.flashingInProgress"
                    @click="handleFlashFirmware"
                >
                    {{ $t("firmwareFlasherFlashFirmware") }}
                </UButton>
                <UDropdownMenu v-slot="{ open }" :items="flashActionMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton
                        :color="state.flashButtonDisabled || activeFlasherStep !== 'flash' ? 'neutral' : 'success'"
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherFlashFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton :disabled="state.loadRemoteButtonDisabled" @click="handleLoadRemoteFile">{{
                    $t("firmwareFlasherButtonLoadOnline")
                }}</UButton>
                <UDropdownMenu
                    v-slot="{ open }"
                    :items="loadFirmwareMenuItems"
                    :content="{ align: 'end', side: 'top' }"
                >
                    <UButton
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherLoadFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>
        </div>
        <div v-if="firmwareType === 'elrs'" class="content_toolbar toolbar_fixed_bottom">
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="!elrsCanFlash"
                    :color="elrsCanFlash ? 'success' : 'neutral'"
                    :loading="elrsBusy && elrsActiveOperation === 'flash'"
                    @click="handleElrsFlashFirmware"
                >
                    {{ $t("firmwareFlasherFlashFirmware") }}
                </UButton>
                <UDropdownMenu v-slot="{ open }" :items="elrsFlashActionMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton
                        :color="elrsCanFlash ? 'success' : 'neutral'"
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherFlashFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="!elrsCanLoadOnlineFirmware"
                    :loading="elrsBusy && elrsActiveOperation === 'load-online'"
                    @click="handleElrsLoadOnlineFirmware"
                >
                    {{ $t("firmwareFlasherButtonLoadOnline") }}
                </UButton>
            </UFieldGroup>
        </div>

        <UModal v-model:open="unstableFirmwareOpen" :title="$t('warningTitle')" :close="false" :dismissible="false">
            <template #body>
                <div v-html="$t('unstableFirmwareAcknowledgementDialog')"></div>
                <div class="flex items-center gap-2 mt-3">
                    <USwitch
                        v-model="state.dialogUnstableFirmwareAcknowledgementCheckbox"
                        :aria-label="$t('unstableFirmwareAcknowledgement')"
                    />
                    <span v-html="$t('unstableFirmwareAcknowledgement')"></span>
                </div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton :label="$t('cancel')" variant="outline" @click="handleUnstableFirmwareCancel" />
                    <UButton
                        :label="$t('unstableFirmwareAcknowledgementFlash')"
                        :disabled="!state.dialogUnstableFirmwareAcknowledgementCheckbox"
                        @click="handleUnstableFirmwareFlash"
                    />
                </div>
            </template>
        </UModal>

        <UModal v-model:open="verifyBoardOpen" :close="false" :dismissible="false">
            <template #body>
                <div v-html="verifyBoardContentHtml"></div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton
                        :label="$t('firmwareFlasherButtonAbort')"
                        variant="outline"
                        @click="handleVerifyBoardAbort"
                    />
                    <UButton :label="$t('firmwareFlasherButtonContinue')" @click="handleVerifyBoardContinue" />
                </div>
            </template>
        </UModal>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, reactive, ref, onMounted, onBeforeUnmount, inject, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
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
import DeviceHandler from "../../js/device_handler";
import { gui_log } from "../../js/gui_log";
import semver from "semver";
import FileSystem from "../../js/FileSystem";
import AutoBackup, { getLastBackupData, resetLastBackupData } from "../../js/utils/AutoBackup.js";
import AutoRestore from "../../js/utils/AutoRestore.js";
import { EventBus } from "../eventBus";
import STM32 from "../../js/protocols/webstm32";
import { ispConnected } from "../../js/utils/connection.js";
import { serial } from "../../js/serial.js";
import FlasherBoardBuildTab from "./firmware-flasher/FlasherBoardBuildTab.vue";
import FlasherFlashTab from "./firmware-flasher/FlasherFlashTab.vue";
import FlasherElrsTab from "./firmware-flasher/FlasherElrsTab.vue";
import FlasherAm32Tab from "./firmware-flasher/FlasherAm32Tab.vue";
import SubtabNav from "../elements/SubtabNav.vue";

// Module-scope ref so the active sub-tab persists across component remounts (tab switches).
const activeFlasherStep = ref("board-build");

export default defineComponent({
    name: "FirmwareFlasherTab",
    components: {
        BaseTab,
        WikiButton,
        UiBox,
        FlasherBoardBuildTab,
        FlasherFlashTab,
        FlasherElrsTab,
        FlasherAm32Tab,
        SubtabNav,
    },
    setup() {
        // Get $t from Vue i18n if available, otherwise use fallback
        const $t = inject("$t", (key, params) => i18n.getMessage(key, params));
        const dialog = useDialog();
        const firmwareType = ref(serial.connected ? "am32" : "betaflight");
        const elrsFlasher = ref(null);
        const firmwareTypeOptions = [
            { value: "betaflight", label: "Betaflight / GIGFlight" },
            { value: "elrs", label: "ELRS / GIGLRS" },
            { value: "am32", label: "AM32 ESC" },
        ];

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
            flashOnConnectWrapperVisible: false,
            manufacturerInfoVisible: false,
            cloudTargetInfoVisible: false,
            expertOptionsVisible: false,
            buildTypeRowVisible: false,
            commitSelectionVisible: false,
            // UI State - Text content
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

        // Verify board dialog refs
        const verifyBoardOpen = ref(false);
        const verifyBoardContentHtml = ref("");
        const verifyBoardOnAcceptCallback = ref(null);
        const verifyBoardOnAbortCallback = ref(null);

        // Unstable firmware dialog refs
        const unstableFirmwareOpen = ref(false);
        const unstableFirmwareAcknowledgementCallback = ref(null);

        let dfuMonitorInterval = null;

        const buildApi = new BuildApi();
        const logHead = "[FIRMWARE_FLASHER]";

        const FLASH_MESSAGE_TYPES = {
            NEUTRAL: "NEUTRAL",
            VALID: "VALID",
            INVALID: "INVALID",
            ACTION: "ACTION",
            ERASING: "ERASING",
            FLASHING: "FLASHING",
            VERIFYING: "VERIFYING",
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
        };

        const enableLoadFileButton = (enabled) => {
            state.loadFileButtonDisabled = !enabled;
        };

        const enableDfuExitButton = (enabled) => {
            state.dfuExitButtonDisabled = !enabled;
        };

        const updateDfuExitButtonState = () => {
            const selectedDevice = DeviceHandler.devicePicker?.selectedDevice || "";
            const hasDfuPortSelected = typeof selectedDevice === "string" && selectedDevice.startsWith("usb");
            enableDfuExitButton(DeviceHandler.dfuAvailable || hasDfuPortSelected);
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
                case FLASH_MESSAGE_TYPES.ERASING:
                    state.progressLabelClass = "erasing";
                    break;
                case FLASH_MESSAGE_TYPES.FLASHING:
                    state.progressLabelClass = "flashing";
                    break;
                case FLASH_MESSAGE_TYPES.VERIFYING:
                    state.progressLabelClass = "verifying";
                    break;
                case FLASH_MESSAGE_TYPES.NEUTRAL:
                default:
                    state.progressLabelClass = "";
                    break;
            }
            if (message !== null) {
                state.progressLabelText = message;
            }

            // Capture terminal flash results for persistence (VALID = success, INVALID = failure)
            // Must check flashProgressValue because flashProgress(100) clears flashingInProgress
            // before the final flashingMessage call arrives.
            if (
                (state.flashingInProgress || state.flashProgressValue > 0) &&
                (type === FLASH_MESSAGE_TYPES.VALID || type === FLASH_MESSAGE_TYPES.INVALID)
            ) {
                state.lastFlashResultText = state.progressLabelText;
                state.lastFlashResultClass = state.progressLabelClass;
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
            enableFlashButton(
                !!firmwareFlashing.getParsedHex() ||
                    !!firmwareFlashing.getUf2Binary() ||
                    !!firmwareFlashing.getEspBinary(),
            );
            updateDfuExitButtonState();
            enableLoadRemoteFileButton(true);
            enableLoadFileButton(true);

            if (firmwareFlashing.getParsedHex() || firmwareFlashing.getUf2Binary() || firmwareFlashing.getEspBinary()) {
                if (state.preFlashingMessage && state.preFlashingMessageType) {
                    flashingMessage(state.preFlashingMessage, state.preFlashingMessageType);
                }
            } else {
                flashingMessage($t("firmwareFlasherFirmwareNotLoaded"), FLASH_MESSAGE_TYPES.NEUTRAL);
            }
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

        const clearLoadedFirmwareInfo = () => {
            state.firmwareLoadedName = "";
            state.firmwareLoadedSize = "";
            state.firmwareLoadedIsLocal = false;
        };

        const clearBufferedFirmware = () => {
            clearBoardConfig();
            firmwareFlashing.clearFirmwareState();
            state.firmware_type = undefined;
            state.localFirmwareLoaded = false;
            state.filename = null;
            clearLoadedFirmwareInfo();
            // NOTE: Do not reset the backup here. After a serial flash the board
            // reboots and the device-removed event calls clearBufferedFirmware(),
            // which would wipe the backup needed by the post-flash restore button.
            // The backup is reset when a new flash begins (handleFlashFirmware).
        };

        const showLoadedFirmware = (filename, bytes) => {
            state.filename = filename;
            state.firmwareLoadedName = filename;
            state.lastFlashResultText = "";
            state.lastFlashResultClass = "";
            state.firmwareLoadedSize = $t("firmwareFlasherFirmwareSize", { bytes });
            state.firmwareLoadedIsLocal = state.localFirmwareLoaded;

            if (state.localFirmwareLoaded) {
                flashingMessage(
                    $t("firmwareFlasherFirmwareLocalLoaded", { filename, bytes }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            } else {
                flashingMessage(
                    $t("firmwareFlasherFirmwareOnlineLoaded", { filename, bytes }),
                    FLASH_MESSAGE_TYPES.NEUTRAL,
                );
            }
            enableFlashButton(true);
            activeFlasherStep.value = "flash";

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

            state.cloudTargetInfoVisible = !!summary.cloudBuild;
        };

        const loadFailed = () => {
            const message = $t("firmwareFlasherFailedToLoadOnlineFirmware");
            state.progressLabelText = message;
            state.progressLabelClass = "invalid";
            gui_log(message);
            enableLoadRemoteFileButton(true);
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

        const releaseToSemver = (release) => semver.valid(release) || semver.coerce(release)?.version;

        const sortReleases = (a, b) => {
            const aVersion = releaseToSemver(a.release);
            const bVersion = releaseToSemver(b.release);

            if (aVersion && bVersion) {
                return -semver.compareBuild(aVersion, bVersion);
            }

            if (aVersion) {
                return -1;
            }

            if (bVersion) {
                return 1;
            }

            return String(b.release).localeCompare(String(a.release), undefined, {
                numeric: true,
                sensitivity: "base",
            });
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
            state.flashManualBaudRate = result.flash_manual_baud_rate || 256000;

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

            if (!state.localFirmwareLoaded) {
                enableFlashButton(false);
                clearLoadedFirmwareInfo();
                flashingMessage($t("firmwareFlasherLoadFirmwareFile"), FLASH_MESSAGE_TYPES.NEUTRAL);
                if (firmwareFlashing.getParsedHex() && firmwareFlashing.getParsedHex().bytes_total) {
                    // Changing the board triggers a version change, so we need only dump it here.
                    firmwareFlashing.clearFirmwareState();
                }
            }

            const target = boardSelection.state.selectedBoard;

            const loadTargetDetail = async (detail) => {
                if (!detail) {
                    enableLoadRemoteFileButton(false);
                    return;
                }

                state.targetDetail = detail;

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
                    enableLoadRemoteFileButton(Boolean(targetDetail.file));
                }
            } catch (error) {
                console.error("Failed to load target:", error);
                loadFailed();
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

            EventBus.$on("device-handler:auto-select-usb-device", detectedUsbDevice);
            EventBus.$on("device-handler:device-removed", onDeviceRemoved);

            // Store references for proper cleanup in onBeforeUnmount
            eventListenerRefs = { detectedUsbDevice, onDeviceRemoved };
        };

        onMounted(async () => {
            if (GUI.active_tab !== "firmware_flasher") {
                GUI.active_tab = "firmware_flasher";
            }

            // Reset state on tab initialization
            activeFlasherStep.value = "board-build";
            boardSelection.resetBoardSelection();
            cloudBuild.resetCloudBuildState();
            firmwareFlashing.clearFirmwareState();
            state.cloudBuildOptions = null;
            state.localFirmwareLoaded = false;
            state.isConfigLocal = false;
            state.customDefinesTags = [];
            state.lastFlashResultText = "";
            state.lastFlashResultClass = "";

            // Setup UI handlers and event bus listeners
            await setupUIHandlers();
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

            EventBus.$off("device-handler:auto-select-usb-device", eventListenerRefs.detectedUsbDevice);
            EventBus.$off("device-handler:device-removed", eventListenerRefs.onDeviceRemoved);
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
                        const device = await DeviceHandler.dfuProtocol.requestPermission();
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
                    if (DeviceHandler.portAvailable) {
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
            unstableFirmwareAcknowledgementCallback.value = acknowledgementCallback;
            unstableFirmwareOpen.value = true;
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

        const loadReleaseFirmware = async (targetDetail) => {
            const firmware = await buildApi.loadTargetFirmware(targetDetail.file);
            if (!firmware) {
                loadFailed();
                return;
            }

            await processFile(firmware, targetDetail.filename || targetDetail.file);
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
        };

        const handleDetectBoard = async () => {
            await boardSelection.handleDetectBoard();
        };

        const onFirmwareVersionChange = async () => {
            await selectFirmware(boardSelection.state.selectedFirmwareVersion);
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

        // DFU permission request — moved here from the global ConnectButton dropdown
        const showDfuButton = DeviceHandler.showUsbOption;
        const handleRequestDfuPermission = () => DeviceHandler.requestDevicePermission("usb");

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
            if (firmwareType.value !== "betaflight" || state.flashButtonDisabled || activeFlasherStep.value !== "flash") {
                return;
            }

            // Reset any previous backup cache before starting a new flash
            resetLastBackupData();

            state.progressLabelText = "";
            state.lastFlashResultText = "";
            state.lastFlashResultClass = "";
            state.restoreInProgress = false;
            state.restoreCompleted = false;
            state.flashingInProgress = true;
            GUI.flashingInProgress = true;
            activeFlasherStep.value = "flash";
            await nextTick();

            const options = {
                connectLock: GUI.connect_lock,
                firmwareType: state.firmware_type,
                filename: state.filename,
                flashOnConnect: state.flashOnConnect,
                portAvailable: DeviceHandler.portAvailable,
                dfuAvailable: DeviceHandler.dfuAvailable,
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

            enableFlashButton(false);
            enableLoadRemoteFileButton(false);

            state.localFirmwareLoaded = false;
            clearLoadedFirmwareInfo();
            const buildType = state.selectedBuildType;
            state.developmentFirmwareLoaded = buildType > 1;

            if (!boardSelection.state.selectedFirmwareVersion || boardSelection.state.selectedFirmwareVersion === "0") {
                gui_log($t("firmwareFlasherNoFirmwareSelected"));
                enableLoadRemoteFileButton(true);
                return;
            }

            if (state.targetDetail) {
                activeFlasherStep.value = "flash";
                await nextTick();
                flashingMessage($t("firmwareFlasherButtonDownloading"), FLASH_MESSAGE_TYPES.NEUTRAL);
                showReleaseNotes(state.targetDetail);
                await loadReleaseFirmware(state.targetDetail);
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
                const file = await FileSystem.pickOpenFile($t("fileSystemPickerFirmwareFiles"), [
                    ".hex",
                    ".uf2",
                    ".bin",
                ]);

                if (!file) {
                    enableLoadRemoteFileButton(true);
                    enableLoadFileButton(true);
                    return;
                }

                const extension = getExtension(file.name);

                if (extension === "uf2" || extension === "bin") {
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

        const handleUnstableFirmwareFlash = async () => {
            if (!state.dialogUnstableFirmwareAcknowledgementCheckbox) {
                return;
            }

            unstableFirmwareOpen.value = false;

            const acknowledgementCallback = unstableFirmwareAcknowledgementCallback.value;
            state.dialogUnstableFirmwareAcknowledgementCheckbox = false;
            unstableFirmwareAcknowledgementCallback.value = null;

            if (acknowledgementCallback) {
                acknowledgementCallback();
            }

            await startFlashing().catch((error) => {
                console.error("Flash error:", error);
            });
        };

        const handleUnstableFirmwareCancel = () => {
            state.dialogUnstableFirmwareAcknowledgementCheckbox = false;
            unstableFirmwareAcknowledgementCallback.value = null;
            unstableFirmwareOpen.value = false;
        };

        const handleVerifyBoardAbort = () => {
            verifyBoardOpen.value = false;
            const onAbort = verifyBoardOnAbortCallback.value;
            verifyBoardOnAcceptCallback.value = null;
            verifyBoardOnAbortCallback.value = null;
            if (onAbort) {
                onAbort();
            }
        };

        const handleVerifyBoardContinue = () => {
            verifyBoardOpen.value = false;
            const onAccept = verifyBoardOnAcceptCallback.value;
            verifyBoardOnAcceptCallback.value = null;
            verifyBoardOnAbortCallback.value = null;
            if (onAccept) {
                onAccept();
            }
        };

        // Handle restore backup functionality
        const handleRestoreBackup = async () => {
            // Check if there's a backup available
            const backupData = getLastBackupData();
            if (!backupData) {
                dialog.openInfo(
                    $t("warningTitle"),
                    $t("firmwareFlasherNoBackupAvailable"),
                    () => {}, // Empty callback to satisfy onConfirm requirement
                );
                return;
            }

            // Check if firmware version supports MSP CLI (4.5.4+)
            // Note: We check the API version directly in AutoRestore.execute() for more accuracy
            // This check is for user experience to show an info dialog before the operation
            // But we still let the operation proceed since it will be verified in AutoRestore

            // Confirmation dialog
            dialog.openYesNo(
                $t("firmwareFlasherRestoreBackupTitle"),
                $t("firmwareFlasherRestoreBackupConfirm"),
                async () => {
                    // Parse backup content into CLI lines
                    const fileLines = backupData.split(/\r?\n/).map((line) => line.trim());

                    // Prepend "defaults nosave" if not present
                    const hasDefaultsNoSave = fileLines.some((line) => line.trim().toLowerCase() === "defaults nosave");
                    const cliLines = hasDefaultsNoSave ? fileLines : ["defaults nosave", ...fileLines];

                    // Set connect lock to prevent tab switching interference
                    GUI.connect_lock = true;
                    state.restoreInProgress = true;

                    // Open wait dialog
                    dialog.openWait($t("firmwareFlasherRestoreBackupTitle"), null);

                    // Execute restore
                    AutoRestore.execute(cliLines, (result) => {
                        dialog.close();
                        GUI.connect_lock = false;
                        state.restoreInProgress = false;

                        if (result.success) {
                            // Hide the restore button — restore already applied and saved.
                            state.restoreCompleted = true;
                            if (result.skipped > 0) {
                                gui_log($t("firmwareFlasherRestoreBackupSuccessSkipped", { count: result.skipped }));
                            } else {
                                gui_log($t("firmwareFlasherRestoreBackupSuccess"));
                            }
                        } else {
                            const errorMsg = result.errors || "Unknown error";
                            gui_log($t("firmwareFlasherRestoreBackupFailed", { 1: errorMsg }));
                            dialog.openInfo(
                                $t("warningTitle"),
                                $t("firmwareFlasherRestoreBackupFailed", { 1: errorMsg }),
                                () => {}, // onConfirm — openInfo's 3rd arg must be a callback, not options
                            );
                        }
                    });
                },
                () => {
                    // No-op for "No" click
                },
            );
        };

        const showDialogVerifyBoard = (selected, verified, onAccept, onAbort) => {
            verifyBoardContentHtml.value = $t("firmwareFlasherVerifyBoard", {
                selected_board: selected,
                verified_board: verified,
            });

            if (!verifyBoardOpen.value) {
                verifyBoardOnAcceptCallback.value = onAccept;
                verifyBoardOnAbortCallback.value = onAbort;
                verifyBoardOpen.value = true;
            }
        };

        const loadFirmwareMenuItems = computed(() => [
            [
                {
                    label: $t("firmwareFlasherButtonLoadOnline"),
                    icon: "i-lucide-cloud-download",
                    disabled: state.loadRemoteButtonDisabled,
                    onSelect: handleLoadRemoteFile,
                },
                {
                    label: $t("firmwareFlasherButtonLoadLocal"),
                    icon: "i-lucide-hard-drive-download",
                    disabled: state.loadFileButtonDisabled,
                    onSelect: handleLoadFile,
                },
            ],
        ]);

        const flashActionMenuItems = computed(() => {
            const group = [
                {
                    label: $t("firmwareFlasherFlashFirmware"),
                    icon: "i-lucide-zap",
                    disabled: state.flashButtonDisabled || activeFlasherStep.value !== "flash",
                    onSelect: handleFlashFirmware,
                },
                {
                    label: $t("firmwareFlasherExitDfu"),
                    icon: "i-lucide-usb",
                    disabled: state.dfuExitButtonDisabled,
                    onSelect: handleExitDfu,
                },
            ];
            if (showDfuButton) {
                group.push({
                    label: $t("firmwareFlasherFindDfuDevice"),
                    icon: "i-lucide-cpu",
                    onSelect: handleRequestDfuPermission,
                });
            }
            return [group];
        });

        const getElrsExposedValue = (key, fallback = false) => {
            const value = elrsFlasher.value?.[key];
            return value?.value ?? value ?? fallback;
        };

        const elrsCanFlash = computed(() => Boolean(getElrsExposedValue("canFlash")));
        const elrsCanLoadOnlineFirmware = computed(() => Boolean(getElrsExposedValue("canLoadOnlineFirmware")));
        const elrsBusy = computed(() => Boolean(getElrsExposedValue("busy")));
        const elrsActiveOperation = computed(() => String(getElrsExposedValue("activeOperation", "")));
        const elrsPassthroughActive = computed(() => Boolean(getElrsExposedValue("passthroughActive")));

        const handleElrsFlashFirmware = () => {
            elrsFlasher.value?.flashReceiver?.();
        };

        const handleElrsLoadOnlineFirmware = () => {
            elrsFlasher.value?.loadOnlineFirmware?.();
        };

        const handleElrsStopPassthrough = () => {
            elrsFlasher.value?.stopPassthrough?.();
        };

        const elrsFlashActionMenuItems = computed(() => [
            [
                {
                    label: $t("firmwareFlasherFlashFirmware"),
                    icon: "i-lucide-zap",
                    disabled: !elrsCanFlash.value,
                    onSelect: handleElrsFlashFirmware,
                },
                {
                    label: "Close passthrough",
                    icon: "i-lucide-unplug",
                    disabled: !elrsPassthroughActive.value || elrsBusy.value,
                    onSelect: handleElrsStopPassthrough,
                },
            ],
        ]);

        const flashRingColor = computed(() => {
            switch (state.progressLabelClass) {
                case "invalid":
                case "erasing":
                    return "error";
                case "flashing":
                    return "warning";
                case "valid":
                case "verifying":
                    return "success";
                default:
                    return "primary";
            }
        });

        const subtabItems = computed(() => [
            { label: $t("firmwareFlasherSubTabBoardBuild"), value: "board-build", icon: "i-lucide-cpu" },
            { label: $t("firmwareFlasherSubTabFlash"), value: "flash", icon: "i-lucide-zap" },
        ]);

        // Return all public methods and state
        return {
            state,
            firmwareType,
            elrsFlasher,
            firmwareTypeOptions,
            flashRingColor,
            activeFlasherStep,
            subtabItems,
            flashActionMenuItems,
            loadFirmwareMenuItems,
            elrsCanFlash,
            elrsCanLoadOnlineFirmware,
            elrsBusy,
            elrsActiveOperation,
            elrsFlashActionMenuItems,
            cloudBuild,
            boardSelection,
            FLASH_MESSAGE_TYPES,
            // Template refs
            verifyBoardOpen,
            verifyBoardContentHtml,
            unstableFirmwareOpen,
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
            cleanup,
            onBuildTypeChange,
            onBoardChange,
            onFirmwareVersionChange,
            handleNoRebootChange,
            handleEraseChipChange,
            handleFlashManualBaudChange,
            handleFlashManualBaudRateChange,
            handleExitDfu,
            handleFlashFirmware,
            handleLoadRemoteFile,
            handleLoadFile,
            handleElrsFlashFirmware,
            handleElrsLoadOnlineFirmware,
            handleDetectBoard,
            handleRequestDfuPermission,
            showDfuButton,
            handleUnstableFirmwareFlash,
            handleUnstableFirmwareCancel,
            handleVerifyBoardAbort,
            handleVerifyBoardContinue,
            handleRestoreBackup,
            saveFirmware,
        };
    },
});
</script>

<style scoped lang="less">
.tab-firmware_flasher {
    min-height: 100%;

    .flasher-tab-area {
        min-height: 200px;
    }

    .content_wrapper .flashing-wait {
        min-height: 150px;
        height: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
    }
    .flash-status-message {
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        font-size: 0.85rem;
    }
    .flash-status-error {
        background-color: var(--error-500);
        color: #fff;
    }
    .grid-box-spacer {
        height: 1rem;
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
    .flashing-wait p {
        text-align: center;
        padding: 0 1rem;
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
        width: fit-content;
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
    width: fit-content;
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
    z-index: 99999 !important;
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
