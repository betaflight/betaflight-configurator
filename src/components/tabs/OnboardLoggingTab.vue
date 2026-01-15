<template>
    <BaseTab tab-name="onboard_logging">
        <div
            class="tab-onboard_logging"
            :class="{
                'serial-supported': true,
                'dataflash-supported': dataflashSupported,
                'dataflash-present': dataflashPresent,
                'sdcard-supported': sdcardSupported,
                'blackbox-config-supported': blackboxConfigSupported,
                'blackbox-supported': blackboxSupport === 'yes',
                'blackbox-unsupported': blackboxSupport === 'no',
                'msc-supported': mscSupported,
                'msc-not-ready': !mscReady,
                'sdcard-error': sdcardState === MSP.SDCARD_STATE_FATAL,
                'sdcard-initializing':
                    sdcardState === MSP.SDCARD_STATE_CARD_INIT || sdcardState === MSP.SDCARD_STATE_FS_INIT,
                'sdcard-ready': sdcardState === MSP.SDCARD_STATE_READY,
            }"
        >
            <div class="content_wrapper">
                <div class="tab_title">{{ $t("tabOnboardLogging") }}</div>
                <WikiButton docUrl="logging" />

                <div class="require-blackbox-unsupported note">
                    <p>{{ $t("blackboxNotSupported") }}</p>
                </div>

                <div class="grid-box col1">
                    <div class="require-blackbox-supported grid-box col1">
                        <div class="gui_box grey require-blackbox-config-supported">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("blackboxConfiguration") }}</div>
                            </div>
                            <div class="spacer_box">
                                <div class="line blackboxDevice">
                                    <select v-model.number="blackboxDevice" name="blackbox_device">
                                        <option :value="0">{{ $t("blackboxLoggingNone") }}</option>
                                        <option v-if="dataflashSupported" :value="1">
                                            {{ $t("blackboxLoggingFlash") }}
                                        </option>
                                        <option v-if="sdcardSupported" :value="2">
                                            {{ $t("blackboxLoggingSdCard") }}
                                        </option>
                                        <option :value="3">{{ $t("blackboxLoggingSerial") }}</option>
                                        <option v-if="virtualGyro" :value="4">
                                            {{ $t("blackboxLoggingVirtual") }}
                                        </option>
                                    </select>
                                    <span>{{ $t("onboardLoggingBlackbox") }}</span>
                                </div>
                                <div v-show="blackboxDevice !== 0" class="line blackboxRate">
                                    <select v-model.number="blackboxRate" name="blackbox_rate">
                                        <option v-for="rate in loggingRates" :key="rate.value" :value="rate.value">
                                            {{ rate.label }}
                                        </option>
                                    </select>
                                    <span>{{ $t("onboardLoggingRateOfLogging") }}</span>
                                </div>
                                <div class="line blackboxDebugMode">
                                    <select v-model.number="debugMode" name="blackboxDebugMode">
                                        <option v-for="(mode, index) in debugModes" :key="index" :value="index">
                                            {{ mode }}
                                        </option>
                                    </select>
                                    <span class="blackboxDebugModeText">{{ $t("onboardLoggingDebugMode") }}</span>
                                </div>
                                <div v-if="showDebugFields" class="gui_box grey">
                                    <div class="gui_box_titlebar">
                                        <div class="spacer_box_title">{{ $t("onboardLoggingDebugFields") }}</div>
                                    </div>
                                    <div class="blackboxDebugFieldsTable">
                                        <div v-for="(field, index) in debugFields" :key="index" class="debug-field-row">
                                            <input
                                                :id="`blackboxDebugField${index}`"
                                                :checked="debugFieldsEnabled[index]"
                                                type="checkbox"
                                                class="toggle"
                                                @change="updateDebugField(index, $event)"
                                            />
                                            <label :for="`blackboxDebugField${index}`">{{ field }}</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="line">
                                    <a href="#" class="save-settings regular-button" @click.prevent="saveSettings">{{
                                        $t("blackboxButtonSave")
                                    }}</a>
                                </div>
                            </div>
                        </div>

                        <div class="gui_box grey">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("onboardLoggingSerialLogger") }}</div>
                            </div>
                            <div class="spacer_box">
                                <p>{{ $t("serialLoggingSupportedNote") }}</p>
                            </div>
                        </div>

                        <div class="gui_box grey require-dataflash-supported">
                            <div class="gui_box_titlebar">
                                <div class="spacer_box_title">{{ $t("onboardLoggingFlashLogger") }}</div>
                            </div>
                            <div class="spacer_box">
                                <div class="require-dataflash-supported">
                                    <p>{{ $t("dataflashNote") }}</p>

                                    <dialog ref="eraseDialog" class="dataflash-confirm-erase">
                                        <h3>{{ $t("dataflashConfirmEraseTitle") }}</h3>
                                        <div class="dataflash-confirm-erase-note">
                                            {{ $t("dataflashConfirmEraseNote") }}
                                        </div>
                                        <div class="dataflash-erase-progress">
                                            <div class="data-loading">
                                                <p>{{ $t("onboardLoggingEraseInProgress") }}</p>
                                            </div>
                                        </div>
                                        <div class="buttons">
                                            <a
                                                href="#"
                                                class="erase-flash-confirm regular-button"
                                                @click.prevent="flashErase"
                                            >
                                                {{ $t("dataflashButtonEraseConfirm") }}
                                            </a>
                                            <a
                                                href="#"
                                                class="erase-flash-cancel regular-button"
                                                @click.prevent="flashEraseCancel"
                                            >
                                                {{ $t("dataflashButtonEraseCancel") }}
                                            </a>
                                        </div>
                                    </dialog>

                                    <dialog ref="savingDialog" class="dataflash-saving">
                                        <h3>{{ $t("dataflashSavingTitle") }}</h3>
                                        <div class="dataflash-saving-before">
                                            <div>{{ $t("dataflashSavingNote") }}</div>
                                            <progress :value="saveProgress" min="0" max="100"></progress>
                                            <div class="buttons">
                                                <a
                                                    href="#"
                                                    class="save-flash-cancel regular-button"
                                                    @click.prevent="flashSaveCancel"
                                                >
                                                    {{ $t("dataflashButtonSaveCancel") }}
                                                </a>
                                            </div>
                                        </div>
                                        <div class="dataflash-saving-after">
                                            <div>{{ $t("dataflashSavingNoteAfter") }}</div>
                                            <div class="buttons">
                                                <a
                                                    href="#"
                                                    class="save-flash-dismiss regular-button"
                                                    @click.prevent="dismissSavingDialog"
                                                >
                                                    {{ $t("dataflashButtonSaveDismiss") }}
                                                </a>
                                            </div>
                                        </div>
                                    </dialog>

                                    <ul class="dataflash-contents">
                                        <li
                                            class="dataflash-used"
                                            :style="{
                                                width: dataflashUsedPercent + '%',
                                                display: dataflashUsedSize > 0 ? 'block' : 'none',
                                            }"
                                        >
                                            <div>
                                                {{ $t("dataflashUsedSpace") }} {{ formatBytes(dataflashUsedSize) }}
                                            </div>
                                        </li>
                                        <li
                                            class="dataflash-free"
                                            :style="{
                                                width: dataflashFreePercent + '%',
                                                display: dataflashFreeSize > 0 ? 'block' : 'none',
                                            }"
                                        >
                                            <div>
                                                {{ $t("dataflashFreeSpace") }} {{ formatBytes(dataflashFreeSize) }}
                                            </div>
                                        </li>
                                    </ul>

                                    <div class="dataflash-buttons">
                                        <a
                                            class="regular-button erase-flash"
                                            :class="{ disabled: dataflashUsedSize === 0 }"
                                            href="#"
                                            @click.prevent="askToEraseFlash"
                                        >
                                            {{ $t("dataflashButtonErase") }}
                                        </a>
                                        <a
                                            class="regular-button require-msc-not-supported save-flash-erase"
                                            :class="{ disabled: dataflashUsedSize === 0 }"
                                            href="#"
                                            @click.prevent="flashSaveBegin(true)"
                                        >
                                            {{ $t("dataflashButtonSaveAndErase") }}
                                        </a>
                                        <a
                                            class="regular-button require-msc-not-supported save-flash"
                                            :class="{ disabled: dataflashUsedSize === 0 }"
                                            href="#"
                                            @click.prevent="flashSaveBegin(false)"
                                        >
                                            {{ $t("dataflashButtonSaveFile") }}
                                        </a>
                                        <a
                                            v-if="isExpertMode"
                                            class="regular-button require-msc-supported save-flash-erase"
                                            :class="{ disabled: dataflashUsedSize === 0 }"
                                            href="#"
                                            @click.prevent="flashSaveBegin(true)"
                                        >
                                            {{ $t("dataflashButtonSaveAndErase") }}
                                        </a>
                                        <a
                                            v-if="isExpertMode"
                                            class="regular-button require-msc-supported save-flash"
                                            :class="{ disabled: dataflashUsedSize === 0 }"
                                            href="#"
                                            @click.prevent="flashSaveBegin(false)"
                                        >
                                            <span>{{ $t("dataflashButtonSaveFile") }}</span>
                                            <span
                                                class="helpicon cf_tip"
                                                :title="$t('dataflashSaveFileDepreciationHint')"
                                            ></span>
                                        </a>
                                        <p v-html="$t('dataflashSavetoFileNote')"></p>
                                    </div>
                                </div>

                                <p class="require-dataflash-not-present">{{ $t("dataflashNotPresentNote") }}</p>
                                <p
                                    class="require-dataflash-unsupported"
                                    v-html="$t('dataflashFirmwareUpgradeRequired')"
                                ></p>
                            </div>
                        </div>

                        <div class="require-sdcard-supported">
                            <div class="gui_box grey">
                                <div class="gui_box_titlebar">
                                    <div class="spacer_box_title">{{ $t("onboardLoggingOnboardSDCard") }}</div>
                                </div>
                                <div class="spacer_box">
                                    <div class="sdcard">
                                        <div class="sdcard-icon"></div>
                                        <div class="sdcard-status">{{ sdcardStatusText }}</div>
                                    </div>
                                    <p>{{ $t("sdcardNote") }}</p>

                                    <div class="require-sdcard-ready">
                                        <ul class="sdcard-contents">
                                            <li
                                                class="sdcard-other"
                                                :style="{
                                                    width: sdcardUsedPercent + '%',
                                                    display: sdcardUsedKB > 0 ? 'block' : 'none',
                                                }"
                                            >
                                                <div>
                                                    {{ $t("dataflashUnavSpace") }} {{ formatKilobytes(sdcardUsedKB) }}
                                                </div>
                                            </li>
                                            <li
                                                class="sdcard-free"
                                                :style="{
                                                    width: sdcardFreePercent + '%',
                                                    display: sdcardFreeKB > 0 ? 'block' : 'none',
                                                }"
                                            >
                                                <div>
                                                    {{ $t("dataflashLogsSpace") }} {{ formatKilobytes(sdcardFreeKB) }}
                                                </div>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="gui_box grey require-msc-supported">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">{{ $t("onboardLoggingMsc") }}</div>
                        </div>
                        <div class="spacer_box">
                            <div class="require-msc-supported">
                                <div>
                                    <a
                                        class="require-msc-ready regular-button onboardLoggingRebootMsc"
                                        :class="{ disabled: !mscReady }"
                                        href="#"
                                        @click.prevent="rebootToMsc"
                                    >
                                        {{ $t("onboardLoggingRebootMscText") }}
                                    </a>
                                </div>
                            </div>
                            <p v-html="$t('onboardLoggingMscNote')"></p>
                            <p class="require-msc-not-ready">{{ $t("onboardLoggingMscNotReady") }}</p>
                        </div>
                    </div>
                </div>
                <div class="clear-both"></div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_47 } from "../../js/data_storage";
import { i18n } from "../../js/localization";
import semver from "semver";
import { gui_log } from "../../js/gui_log";
import { generateFilename } from "../../js/utils/generate_filename";
import DEBUG from "../../js/debug";
import FileSystem from "../../js/FileSystem";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import NotificationManager from "../../js/utils/notifications";
import { get as getConfig } from "../../js/ConfigStorage";
import { sensorTypes } from "../../js/sensor_types";

const BLOCK_SIZE = 4096;

// Helper function for GCD calculation
function gcd(a, b) {
    // Convert to integers and get absolute values
    a = Math.abs(Math.floor(a));
    b = Math.abs(Math.floor(b));

    // Handle edge cases
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return 1;
    }
    if (a === 0) {
        return b || 1;
    }
    if (b === 0) {
        return a || 1;
    }

    // Euclidean algorithm
    return gcd(b, a % b);
}

function formatKilobytes(kilobytes) {
    if (kilobytes < 1024) {
        return `${Math.round(kilobytes)}kB`;
    }
    const megabytes = kilobytes / 1024;
    if (megabytes < 900) {
        return `${megabytes.toFixed(1)}MB`;
    }
    const gigabytes = megabytes / 1024;
    return `${gigabytes.toFixed(1)}GB`;
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    return formatKilobytes(bytes / 1024);
}

export default defineComponent({
    name: "OnboardLoggingTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const fcStore = useFlightControllerStore();

        // Refs
        const eraseDialog = ref(null);
        const savingDialog = ref(null);

        // State
        const blackboxDevice = ref(0);
        const blackboxRate = ref(0);
        const debugMode = ref(0);
        // Initialize all debug fields as enabled by default (empty array causes issues)
        const debugFieldsEnabled = ref(DEBUG.enableFields ? DEBUG.enableFields.map(() => true) : []);
        const saveProgress = ref(0);
        const saveCancelled = ref(false);
        const eraseCancelled = ref(false);
        const blockSize = ref(BLOCK_SIZE);
        const writeError = ref(false);

        let sdcardTimer = null;

        // Computed
        const dataflashSupported = computed(() => fcStore.dataflash?.supported);
        const dataflashPresent = computed(() => (fcStore.dataflash?.totalSize || 0) > 0);
        const sdcardSupported = computed(() => fcStore.sdcard?.supported);
        const blackboxConfigSupported = computed(() => fcStore.blackbox?.supported);
        const isExpertMode = computed(() => isExpertModeEnabled());

        const virtualGyro = computed(() => {
            return (
                fcStore.config?.apiVersion &&
                semver.gte(fcStore.config.apiVersion, API_VERSION_1_47) &&
                fcStore.sensorConfig?.gyro_hardware_active == sensorTypes().gyro.elements.indexOf("VIRTUAL")
            );
        });

        const blackboxSupport = computed(() => {
            if (
                fcStore.blackbox?.supported ||
                fcStore.dataflash?.supported ||
                fcStore.features?.features?.isEnabled("BLACKBOX")
            ) {
                return "yes";
            }
            return "no";
        });

        const loggingRates = computed(() => {
            const rates = [];

            // Validate data is available before processing
            if (!fcStore.config?.sampleRateHz || !fcStore.pidAdvancedConfig?.pid_process_denom) {
                return rates;
            }

            const pidRate = fcStore.config.sampleRateHz / fcStore.pidAdvancedConfig.pid_process_denom;
            const sampleRateNum = 5;

            for (let i = 0; i < sampleRateNum; i++) {
                let loggingFrequency = Math.round(pidRate / Math.pow(2, i));
                let loggingFrequencyUnit = "Hz";
                if (gcd(loggingFrequency, 1000) === 1000) {
                    loggingFrequency /= 1000;
                    loggingFrequencyUnit = "kHz";
                }
                rates.push({
                    value: i,
                    label: `1/${Math.pow(2, i)} (${loggingFrequency}${loggingFrequencyUnit})`,
                });
            }
            return rates;
        });

        const debugModes = computed(() => {
            const modes = [];
            const debugModeCount = fcStore.pidAdvancedConfig?.debugModeCount || 0;
            for (let i = 0; i < debugModeCount; i++) {
                if (i < DEBUG.modes.length) {
                    modes.push(DEBUG.modes[i]);
                } else {
                    modes.push(i18n.getMessage("onboardLoggingDebugModeUnknown"));
                }
            }
            return modes;
        });

        const showDebugFields = computed(() => {
            return fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_45);
        });

        const debugFields = computed(() => DEBUG.enableFields || []);

        const dataflashUsedSize = computed(() => fcStore.dataflash?.usedSize || 0);
        const dataflashTotalSize = computed(() => fcStore.dataflash?.totalSize || 0);
        const dataflashFreeSize = computed(() => dataflashTotalSize.value - dataflashUsedSize.value);
        const dataflashUsedPercent = computed(() => {
            if (dataflashTotalSize.value === 0) {
                return 0;
            }
            return (dataflashUsedSize.value / dataflashTotalSize.value) * 100;
        });
        const dataflashFreePercent = computed(() => {
            if (dataflashTotalSize.value === 0) {
                return 0;
            }
            return (dataflashFreeSize.value / dataflashTotalSize.value) * 100;
        });

        const sdcardTotalKB = computed(() => fcStore.sdcard?.totalSizeKB || 0);
        const sdcardFreeKB = computed(() => fcStore.sdcard?.freeSizeKB || 0);
        const sdcardUsedKB = computed(() => sdcardTotalKB.value - sdcardFreeKB.value);
        const sdcardUsedPercent = computed(() => {
            if (sdcardTotalKB.value === 0) {
                return 0;
            }
            return (sdcardUsedKB.value / sdcardTotalKB.value) * 100;
        });
        const sdcardFreePercent = computed(() => {
            if (sdcardTotalKB.value === 0) {
                return 0;
            }
            return (sdcardFreeKB.value / sdcardTotalKB.value) * 100;
        });

        const sdcardState = computed(() => fcStore.sdcard?.state);

        const sdcardStatusText = computed(() => {
            switch (sdcardState.value) {
                case MSP.SDCARD_STATE_NOT_PRESENT:
                    return i18n.getMessage("sdcardStatusNoCard");
                case MSP.SDCARD_STATE_FATAL:
                    return i18n.getMessage("sdcardStatusReboot");
                case MSP.SDCARD_STATE_READY:
                    return i18n.getMessage("sdcardStatusReady");
                case MSP.SDCARD_STATE_CARD_INIT:
                    return i18n.getMessage("sdcardStatusStarting");
                case MSP.SDCARD_STATE_FS_INIT:
                    return i18n.getMessage("sdcardStatusFileSystem");
                default:
                    return i18n.getMessage("sdcardStatusUnknown", [sdcardState.value]);
            }
        });

        const mscReady = computed(() => {
            return dataflashPresent.value || sdcardState.value === MSP.SDCARD_STATE_READY;
        });

        const mscSupported = computed(() => {
            return (
                (sdcardSupported.value && blackboxDevice.value == 2) ||
                (dataflashSupported.value && blackboxDevice.value == 1)
            );
        });

        function updateDebugField(index, event) {
            // Use splice to ensure Vue 3 reactivity
            debugFieldsEnabled.value.splice(index, 1, event.target.checked);
        }

        async function saveSettings() {
            if (!fcStore.blackbox?.supported) {
                return;
            }

            fcStore.blackbox.blackboxSampleRate = blackboxRate.value;
            fcStore.blackbox.blackboxPDenom = blackboxRate.value;
            fcStore.blackbox.blackboxDevice = blackboxDevice.value;

            // Update disabled mask from checkboxes
            let mask = 0;
            debugFieldsEnabled.value.forEach((enabled, index) => {
                if (!enabled) {
                    mask |= 1 << index;
                }
            });
            fcStore.blackbox.blackboxDisabledMask = mask;

            await MSP.promise(MSPCodes.MSP_SET_BLACKBOX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BLACKBOX_CONFIG));

            fcStore.pidAdvancedConfig.debugMode = debugMode.value;
            await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));

            mspHelper.writeConfiguration(true);
        }

        function askToEraseFlash() {
            if (dataflashUsedSize.value === 0) {
                return;
            }
            eraseCancelled.value = false;
            eraseDialog.value?.showModal();
        }

        function flashErase() {
            MSP.send_message(MSPCodes.MSP_DATAFLASH_ERASE, false, false, pollForEraseCompletion);
        }

        function flashEraseCancel() {
            eraseCancelled.value = true;
            eraseDialog.value?.close();
        }

        function pollForEraseCompletion() {
            flashUpdateSummary(() => {
                if (CONFIGURATOR.connectionValid && !eraseCancelled.value) {
                    if (fcStore.dataflash?.ready) {
                        eraseDialog.value?.close();
                        if (getConfig("showNotifications").showNotifications) {
                            NotificationManager.showNotification("Betaflight App", {
                                body: i18n.getMessage("flashEraseDoneNotification"),
                                icon: "/images/pwa/favicon.ico",
                            });
                        }
                    } else {
                        setTimeout(pollForEraseCompletion, 500);
                    }
                }
            });
        }

        function flashUpdateSummary(onDone) {
            MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, () => {
                if (onDone) {
                    onDone();
                }
            });
        }

        function showSavingDialog() {
            saveProgress.value = 0;
            saveCancelled.value = false;
            savingDialog.value?.showModal();
            nextTick(() => {
                savingDialog.value?.classList.remove("done");
            });
        }

        function dismissSavingDialog() {
            savingDialog.value?.close();
        }

        function markSavingDialogDone(startTime, totalBytes, totalBytesCompressed) {
            const totalTime = (Date.now() - startTime) / 1000;
            console.log(
                `Received ${totalBytes} bytes in ${totalTime.toFixed(2)}s (${(totalBytes / totalTime / 1024).toFixed(
                    2,
                )}kB / s) with block size ${blockSize.value}.`,
            );
            if (!Number.isNaN(totalBytesCompressed)) {
                console.log(
                    "Compressed into",
                    totalBytesCompressed,
                    "bytes with mean compression factor of",
                    totalBytes / totalBytesCompressed,
                );
            }

            nextTick(() => {
                savingDialog.value?.classList.add("done");
            });

            if (getConfig("showNotifications").showNotifications) {
                NotificationManager.showNotification("Betaflight App", {
                    body: i18n.getMessage("flashDownloadDoneNotification"),
                    icon: "/images/pwa/favicon.ico",
                });
            }
        }

        function flashSaveCancel() {
            saveCancelled.value = true;
        }

        function conditionallyEraseFlash(maxBytes, nextAddress) {
            if (Number.isFinite(maxBytes) && nextAddress >= maxBytes) {
                eraseCancelled.value = false;
                nextTick(() => {
                    eraseDialog.value?.classList.add("erasing");
                });
                eraseDialog.value?.showModal();
                MSP.send_message(MSPCodes.MSP_DATAFLASH_ERASE, false, false, pollForEraseCompletion);
            } else {
                gui_log(
                    i18n.getMessage("dataflashSaveIncompleteWarning") ||
                        "Downloaded size did not match expected size - not erasing flash.",
                );
            }
        }

        async function flashSaveBegin(alsoErase = false) {
            if (!GUI.connected_to || dataflashUsedSize.value === 0) {
                return;
            }

            blockSize.value = BLOCK_SIZE;

            // Refresh the occupied size
            flashUpdateSummary(async () => {
                const maxBytes = fcStore.dataflash?.usedSize || 0;
                let openedFile;

                try {
                    const prefix = "BLACKBOX_LOG";
                    const suffix = "BBL";
                    const filename = generateFilename(prefix, suffix);

                    const fileWriter = await FileSystem.pickSaveFile(
                        filename,
                        i18n.getMessage("fileSystemPickerFiles", { typeof: suffix }),
                        `.${suffix}`,
                    );

                    let nextAddress = 0;
                    let totalBytesCompressed = 0;

                    showSavingDialog();

                    function onChunkRead(chunkAddress, chunkDataView, bytesCompressed) {
                        if (chunkDataView !== null) {
                            if (chunkDataView.byteLength > 0) {
                                nextAddress += chunkDataView.byteLength;
                                if (Number.isNaN(bytesCompressed) || Number.isNaN(totalBytesCompressed)) {
                                    totalBytesCompressed = null;
                                } else {
                                    totalBytesCompressed += bytesCompressed;
                                }

                                saveProgress.value = (nextAddress / maxBytes) * 100;

                                const blob = new Blob([chunkDataView]);
                                FileSystem.writeChunck(openedFile, blob).then(() => {
                                    if (saveCancelled.value || nextAddress >= maxBytes) {
                                        if (saveCancelled.value) {
                                            dismissSavingDialog();
                                        } else {
                                            markSavingDialogDone(startTime, nextAddress, totalBytesCompressed);
                                        }
                                        FileSystem.closeFile(openedFile);
                                        if (!saveCancelled.value && alsoErase) {
                                            conditionallyEraseFlash(maxBytes, nextAddress);
                                        }
                                        return;
                                    }

                                    if (writeError.value) {
                                        dismissSavingDialog();
                                        FileSystem.closeFile(openedFile);
                                    } else {
                                        mspHelper.dataflashRead(nextAddress, blockSize.value, onChunkRead);
                                    }
                                });
                            } else {
                                // Zero-byte block = end of file
                                markSavingDialogDone(startTime, nextAddress, totalBytesCompressed);
                                FileSystem.closeFile(openedFile);
                                if (!saveCancelled.value && alsoErase) {
                                    conditionallyEraseFlash(maxBytes, nextAddress);
                                }
                            }
                        } else {
                            // Error - retry
                            mspHelper.dataflashRead(nextAddress, blockSize.value, onChunkRead);
                        }
                    }

                    const startTime = Date.now();
                    openedFile = await FileSystem.openFile(fileWriter);
                    mspHelper.dataflashRead(nextAddress, blockSize.value, onChunkRead);
                } catch (error) {
                    console.error("Error saving blackbox file:", error);
                    gui_log(i18n.getMessage("dataflashFileWriteFailed"));
                    gui_log(
                        `<strong><span class="message-negative">${i18n.getMessage("error", {
                            errorMessage: error,
                        })}</span></strong>`,
                    );
                }
            });
        }

        function rebootToMsc() {
            if (!mscReady.value) {
                return;
            }

            const buffer = [];
            if (GUI.operating_system === "Linux") {
                buffer.push(mspHelper.REBOOT_TYPES.MSC_UTC);
            } else {
                buffer.push(mspHelper.REBOOT_TYPES.MSC);
            }
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
        }

        function updateHtml() {
            if (sdcardSupported.value && !sdcardTimer) {
                sdcardTimer = setTimeout(() => {
                    sdcardTimer = null;
                    if (CONFIGURATOR.connectionValid) {
                        MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, updateHtml);
                    }
                }, 2000);
            }

            // Track logging status
            let loggingStatus;
            if (dataflashPresent.value && sdcardState.value === MSP.SDCARD_STATE_NOT_PRESENT) {
                loggingStatus = "Dataflash";
            } else {
                switch (sdcardState.value) {
                    case MSP.SDCARD_STATE_NOT_PRESENT:
                        loggingStatus = "SdCard: NotPresent";
                        break;
                    case MSP.SDCARD_STATE_FATAL:
                        loggingStatus = "SdCard: Error";
                        break;
                    case MSP.SDCARD_STATE_READY:
                        loggingStatus = "SdCard: Ready";
                        break;
                    case MSP.SDCARD_STATE_CARD_INIT:
                        loggingStatus = "SdCard: Init";
                        break;
                    case MSP.SDCARD_STATE_FS_INIT:
                        loggingStatus = "SdCard: FsInit";
                        break;
                    default:
                        loggingStatus = "SdCard: Unknown";
                }
            }

            if (typeof tracking !== "undefined") {
                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, "DataLogging", {
                    logSize: fcStore.dataflash?.usedSize || 0,
                    logStatus: loggingStatus,
                });
            }
        }

        async function loadData() {
            try {
                await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
                await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY);
                await MSP.promise(MSPCodes.MSP_SDCARD_SUMMARY);
                await MSP.promise(MSPCodes.MSP_BLACKBOX_CONFIG);
                await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);

                if (fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(
                        MSPCodes.MSP2_GET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME),
                    );
                } else {
                    await MSP.promise(MSPCodes.MSP_NAME);
                }

                // Update debug definitions
                DEBUG.update();

                // Populate UI state
                blackboxDevice.value = fcStore.blackbox?.blackboxDevice || 0;
                blackboxRate.value = fcStore.blackbox?.blackboxSampleRate || 0;
                debugMode.value = fcStore.pidAdvancedConfig?.debugMode || 0;

                // Initialize debug fields checkboxes
                if (showDebugFields.value) {
                    const disabledMask = fcStore.blackbox?.blackboxDisabledMask || 0;
                    debugFieldsEnabled.value = DEBUG.enableFields.map((_, index) => {
                        return (disabledMask & (1 << index)) === 0;
                    });

                    // Destroy existing Switchery instances and recreate with loaded state
                    nextTick(() => {
                        debugFieldsEnabled.value.forEach((_, index) => {
                            const checkbox = document.getElementById(`blackboxDebugField${index}`);
                            if (checkbox) {
                                // Remove existing Switchery element
                                const switcheryElement = checkbox.nextElementSibling;
                                if (switcheryElement && switcheryElement.classList.contains("switchery")) {
                                    switcheryElement.remove();
                                }
                                // Add the toggle class back so GUI.switchery() will reinitialize
                                if (!checkbox.classList.contains("toggle")) {
                                    checkbox.classList.add("toggle");
                                }
                            }
                        });
                        // Reinitialize Switchery with correct state
                        GUI.switchery();
                    });
                }

                updateHtml();
            } catch (error) {
                console.error("Failed to load onboard logging data", error);
            } finally {
                GUI.content_ready();
            }
        }

        onMounted(() => {
            loadData();
        });

        onUnmounted(() => {
            if (sdcardTimer) {
                clearTimeout(sdcardTimer);
                sdcardTimer = null;
            }
        });

        return {
            MSP,
            eraseDialog,
            savingDialog,
            blackboxDevice,
            blackboxRate,
            debugMode,
            debugFieldsEnabled,
            saveProgress,
            dataflashSupported,
            dataflashPresent,
            sdcardSupported,
            blackboxConfigSupported,
            isExpertMode,
            virtualGyro,
            blackboxSupport,
            loggingRates,
            debugModes,
            showDebugFields,
            debugFields,
            dataflashUsedSize,
            dataflashUsedPercent,
            dataflashFreeSize,
            dataflashFreePercent,
            sdcardUsedKB,
            sdcardUsedPercent,
            sdcardFreeKB,
            sdcardFreePercent,
            sdcardStatusText,
            sdcardState,
            mscReady,
            mscSupported,
            formatBytes,
            formatKilobytes,
            updateDebugField,
            saveSettings,
            askToEraseFlash,
            flashErase,
            flashEraseCancel,
            flashSaveBegin,
            flashSaveCancel,
            dismissSavingDialog,
            rebootToMsc,
        };
    },
});
</script>

<style scoped src="@/css/tabs/onboard_logging.less"></style>
