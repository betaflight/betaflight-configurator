import { i18n } from "../localization";
import GUI, { TABS } from '../gui';
import { tracking } from "../Analytics";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import CONFIGURATOR, { API_VERSION_1_45 } from "../data_storage";
import { gui_log } from "../gui_log";
import { generateFilename } from "../utils/generate_filename";
import semver from 'semver';
import { showErrorDialog } from "../utils/showErrorDialog";
import $ from 'jquery';
import DEBUG from "../debug";
import FileSystem from "../FileSystem";
import { isExpertModeEnabled } from "../utils/isExportModeEnabled";
import NotificationManager from "../../js/utils/notifications";
import { get as getConfig } from '../ConfigStorage';

let sdcardTimer;

const onboard_logging = {
    blockSize: 128,
    writeError: false,

    BLOCK_SIZE: 4096,
};

onboard_logging.initialize = function (callback) {
    const self = this;
    let saveCancelled, eraseCancelled;

    if (GUI.active_tab !== 'onboard_logging') {
        GUI.active_tab = 'onboard_logging';
    }

    if (CONFIGURATOR.connectionValid) {

        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, function() {
            MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, function() {
                MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, function() {
                    MSP.send_message(MSPCodes.MSP_BLACKBOX_CONFIG, false, false, function() {
                        MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, function() {
                            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                                MSP.send_message(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME), false, load_html);
                            } else {
                                MSP.send_message(MSPCodes.MSP_NAME, false, false, load_html);
                            }
                        });
                    });
                });
            });
        });
    }

    function gcd(a, b) {
        if (b === 0)
            return a;

        return gcd(b, a % b);
    }

    function load_html() {
        $('#content').load("./tabs/onboard_logging.html", function() {
            // translate to user-selected language
            i18n.localizePage();

            const dataflashPresent = FC.DATAFLASH.totalSize > 0;
            let blackboxSupport;

            /*
             * Pre-1.11.0 firmware supported DATAFLASH API (on targets with SPI flash) but not the BLACKBOX config API.
             *
             * The best we can do on those targets is check the BLACKBOX feature bit to identify support for Blackbox instead.
             */
            if ((FC.BLACKBOX.supported || FC.DATAFLASH.supported) || FC.FEATURE_CONFIG.features.isEnabled('BLACKBOX')) {
                blackboxSupport = 'yes';
            } else {
                blackboxSupport = 'no';
            }

            $(".tab-onboard_logging")
                .addClass("serial-supported")
                .toggleClass("dataflash-supported", FC.DATAFLASH.supported)
                .toggleClass("dataflash-present", dataflashPresent)
                .toggleClass("sdcard-supported", FC.SDCARD.supported)
                .toggleClass("blackbox-config-supported", FC.BLACKBOX.supported)

                .toggleClass("blackbox-supported", blackboxSupport === 'yes')
                .toggleClass("blackbox-maybe-supported", blackboxSupport === 'maybe')
                .toggleClass("blackbox-unsupported", blackboxSupport === 'no');

            if (dataflashPresent) {
                // UI hooks
                $('.tab-onboard_logging a.erase-flash').click(ask_to_erase_flash);

                $('.tab-onboard_logging a.erase-flash-confirm').click(flash_erase);
                $('.tab-onboard_logging a.erase-flash-cancel').click(flash_erase_cancel);

                $('.tab-onboard_logging a.save-flash').click(flash_save_begin);
                $('.tab-onboard_logging a.save-flash-cancel').click(flash_save_cancel);
                $('.tab-onboard_logging a.save-flash-dismiss').click(dismiss_saving_dialog);
            }

            const deviceSelect = $(".blackboxDevice select");
            const loggingRatesSelect = $(".blackboxRate select");
            const debugModeSelect = $(".blackboxDebugMode select");
            const debugFieldsSelect = $(".blackboxDebugFields select");

            if (FC.BLACKBOX.supported) {
                $(".tab-onboard_logging a.save-settings").on('click', async function() {
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                        let fieldsMask = 0;

                        $(".blackboxDebugFields select option:not(:selected)").each(function() {
                            fieldsMask |= (1 << $(this).val());
                        });

                        FC.BLACKBOX.blackboxDisabledMask = fieldsMask;
                    }
                    FC.BLACKBOX.blackboxSampleRate = parseInt(loggingRatesSelect.val(), 10);
                    FC.BLACKBOX.blackboxPDenom = parseInt(loggingRatesSelect.val(), 10);
                    FC.BLACKBOX.blackboxDevice = parseInt(deviceSelect.val(), 10);

                    await MSP.promise(MSPCodes.MSP_SET_BLACKBOX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BLACKBOX_CONFIG));

                    FC.PID_ADVANCED_CONFIG.debugMode = parseInt(debugModeSelect.val());

                    await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));

                    mspHelper.writeConfiguration(true);
                });
            }

            populateLoggingRates(loggingRatesSelect);
            populateDevices(deviceSelect);
            populateDebugModes(debugModeSelect);
            populateDebugFields(debugFieldsSelect);

            deviceSelect.change(function() {
                if ($(this).val() === "0") {
                    $("div.blackboxRate").hide();
                } else {
                    $("div.blackboxRate").show();
                }
            }).change();

            if ((FC.SDCARD.supported && deviceSelect.val() == 2) || (FC.DATAFLASH.supported && deviceSelect.val() == 1)) {

                $(".tab-onboard_logging")
                    .toggleClass("msc-supported", true);

                $('a.onboardLoggingRebootMsc').click(function () {
                        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'RebootMsc');

                    const buffer = [];
                    if (GUI.operating_system === "Linux") {
                        // Reboot into MSC using UTC time offset instead of user timezone
                        // Linux seems to expect that the FAT file system timestamps are UTC based
                        buffer.push(mspHelper.REBOOT_TYPES.MSC_UTC);
                    } else {
                        buffer.push(mspHelper.REBOOT_TYPES.MSC);
                    }
                    MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
                });
            }

            update_html();

            GUI.content_ready(callback);
        });
    }

    function populateDevices(deviceSelect) {
        deviceSelect.empty();

        deviceSelect.append(`<option value="0">${i18n.getMessage('blackboxLoggingNone')}</option>`);
        if (FC.DATAFLASH.supported) {
            deviceSelect.append(`<option value="1">${i18n.getMessage('blackboxLoggingFlash')}</option>`);
        }
        if (FC.SDCARD.supported) {
            deviceSelect.append(`<option value="2">${i18n.getMessage('blackboxLoggingSdCard')}</option>`);
        }
        deviceSelect.append(`<option value="3">${i18n.getMessage('blackboxLoggingSerial')}</option>`);

        deviceSelect.val(FC.BLACKBOX.blackboxDevice);
    }

    function populateLoggingRates(loggingRatesSelect) {

        // Offer a reasonable choice of logging rates (if people want weird steps they can use CLI)
        const pidRate = FC.CONFIG.sampleRateHz / FC.PID_ADVANCED_CONFIG.pid_process_denom;
        const sampleRateNum = 5;

        for (let i = 0; i < sampleRateNum; i++) {
            let loggingFrequency = Math.round(pidRate / (2 ** i));
            let loggingFrequencyUnit = "Hz";
            if (gcd(loggingFrequency, 1000) === 1000) {
                loggingFrequency /= 1000;
                loggingFrequencyUnit = "kHz";
            }
            loggingRatesSelect.append(`<option value="${i}">1/${2**i} (${loggingFrequency}${loggingFrequencyUnit})</option>`);
        }
        loggingRatesSelect.val(FC.BLACKBOX.blackboxSampleRate);
    }

    function populateDebugModes(debugModeSelect) {
        $('.blackboxDebugMode').show();

        for (let i = 0; i < FC.PID_ADVANCED_CONFIG.debugModeCount; i++) {
            if (i < DEBUG.modes.length) {
                debugModeSelect.append(new Option(DEBUG.modes[i], i));
            } else {
                debugModeSelect.append(new Option(i18n.getMessage('onboardLoggingDebugModeUnknown'), i));
            }
        }

        debugModeSelect
        .val(FC.PID_ADVANCED_CONFIG.debugMode)
        .select2()
        .sortSelect("NONE");
    }

    function populateDebugFields(debugFieldsSelect) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            $('.blackboxDebugFields').show();

            let fieldsMask = FC.BLACKBOX.blackboxDisabledMask;

            for (let i = 0; i < DEBUG.enableFields.length; i++) {
                const enabled = (fieldsMask & (1 << i)) === 0;
                debugFieldsSelect.append(new Option(DEBUG.enableFields[i], i, false, enabled));
            }

            debugFieldsSelect.sortSelect().multipleSelect();

        } else {
            $('.blackboxDebugFields').hide();
        }
    }

    function formatFilesizeKilobytes(kilobytes) {
        if (kilobytes < 1024) {
            return `${Math.round(kilobytes)}kB`;
        }

        const megabytes = kilobytes / 1024;
        let gigabytes;

        if (megabytes < 900) {
            return `${megabytes.toFixed(1)}MB`;
        } else {
            gigabytes = megabytes / 1024;

            return `${gigabytes.toFixed(1)}GB`;
        }
    }

    function formatFilesizeBytes(bytes) {
        if (bytes < 1024) {
            return `${bytes}B`;
        }
        return formatFilesizeKilobytes(bytes / 1024);
    }

    function update_bar_width(bar, value, total, label, valuesAreKilobytes) {
        if (value > 0) {
            bar.css({
                width: `${value / total * 100}%`,
                display: 'block',
            });

            $("div", bar).text((label ? `${label} ` : "") + (valuesAreKilobytes ? formatFilesizeKilobytes(value) : formatFilesizeBytes(value)));
        } else {
            bar.css({
                display: 'none',
            });
        }
    }

    $('input[name="expertModeCheckbox"]').on('change', () => $('a.regular-button.require-msc-supported.save-flash').toggle(isExpertModeEnabled()));

    function update_html() {
        const dataflashPresent = FC.DATAFLASH.totalSize > 0;

        update_bar_width($(".tab-onboard_logging .dataflash-used"), FC.DATAFLASH.usedSize, FC.DATAFLASH.totalSize, i18n.getMessage('dataflashUsedSpace'), false);
        update_bar_width($(".tab-onboard_logging .dataflash-free"), FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize, FC.DATAFLASH.totalSize, i18n.getMessage('dataflashFreeSpace'), false);

        update_bar_width($(".tab-onboard_logging .sdcard-other"), FC.SDCARD.totalSizeKB - FC.SDCARD.freeSizeKB, FC.SDCARD.totalSizeKB, i18n.getMessage('dataflashUnavSpace'), true);
        update_bar_width($(".tab-onboard_logging .sdcard-free"), FC.SDCARD.freeSizeKB, FC.SDCARD.totalSizeKB, i18n.getMessage('dataflashLogsSpace'), true);

        $("a.regular-button erase-flash, a.regular-button.require-msc-supported.save-flash").toggleClass("disabled", FC.DATAFLASH.usedSize === 0);

        $(".tab-onboard_logging")
            .toggleClass("sdcard-error", FC.SDCARD.state === MSP.SDCARD_STATE_FATAL)
            .toggleClass("sdcard-initializing", FC.SDCARD.state === MSP.SDCARD_STATE_CARD_INIT || FC.SDCARD.state === MSP.SDCARD_STATE_FS_INIT)
            .toggleClass("sdcard-ready", FC.SDCARD.state === MSP.SDCARD_STATE_READY);

        const mscIsReady = dataflashPresent || (FC.SDCARD.state === MSP.SDCARD_STATE_READY);
        $(".tab-onboard_logging")
            .toggleClass("msc-not-ready", !mscIsReady);

        if (!mscIsReady) {
            $('a.onboardLoggingRebootMsc').addClass('disabled');
        } else {
            $('a.onboardLoggingRebootMsc').removeClass('disabled');
        }

        let loggingStatus;
        switch (FC.SDCARD.state) {
            case MSP.SDCARD_STATE_NOT_PRESENT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusNoCard'));
                loggingStatus = 'SdCard: NotPresent';
            break;
            case MSP.SDCARD_STATE_FATAL:
                $(".sdcard-status").html(i18n.getMessage('sdcardStatusReboot'));
                loggingStatus = 'SdCard: Error';
            break;
            case MSP.SDCARD_STATE_READY:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusReady'));
                loggingStatus = 'SdCard: Ready';
            break;
            case MSP.SDCARD_STATE_CARD_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusStarting'));
                loggingStatus = 'SdCard: Init';
            break;
            case MSP.SDCARD_STATE_FS_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusFileSystem'));
                loggingStatus = 'SdCard: FsInit';
            break;
            default:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusUnknown',[FC.SDCARD.state]));
        }

        if (dataflashPresent && FC.SDCARD.state === MSP.SDCARD_STATE_NOT_PRESENT) {
            loggingStatus = 'Dataflash';
        }

        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'DataLogging', {
            logSize: FC.DATAFLASH.usedSize,
            logStatus: loggingStatus,
        });

        if (FC.SDCARD.supported && !sdcardTimer) {
            // Poll for changes in SD card status
            sdcardTimer = setTimeout(function() {
                sdcardTimer = false;
                if (CONFIGURATOR.connectionValid) {
                    MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, function() {
                        update_html();
                    });
                }
            }, 2000);
        }
    }

    // IO related methods
    function flash_save_cancel() {
        saveCancelled = true;
    }

    function show_saving_dialog() {
        $(".dataflash-saving progress").attr("value", 0);
        saveCancelled = false;
        $(".dataflash-saving").removeClass("done");

        $(".dataflash-saving")[0].showModal();
    }

    function dismiss_saving_dialog() {
        $(".dataflash-saving")[0].close();
    }

    function mark_saving_dialog_done(startTime, totalBytes, totalBytesCompressed) {
        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'SaveDataflash');

        const totalTime = (new Date().getTime() - startTime) / 1000;
        console.log(`Received ${totalBytes} bytes in ${totalTime.toFixed(2)}s (${
             (totalBytes / totalTime / 1024).toFixed(2)}kB / s) with block size ${self.blockSize}.`);
        if (!isNaN(totalBytesCompressed)) {
            console.log('Compressed into', totalBytesCompressed, 'bytes with mean compression factor of', totalBytes / totalBytesCompressed);
        }

        $(".dataflash-saving").addClass("done");

        if (getConfig('showNotifications').showNotifications) {
            NotificationManager.showNotification("Betaflight Configurator", {body: i18n.getMessage('flashDownloadDoneNotification'), icon: "/images/pwa/favicon.ico"});
        }
    }

    function flash_update_summary(onDone) {
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, function() {
            update_html();

            if (onDone) {
                onDone();
            }
        });
    }

    function flash_save_begin() {
        if (GUI.connected_to) {

            self.blockSize = self.BLOCK_SIZE;

            // Begin by refreshing the occupied size in case it changed while the tab was open
            flash_update_summary(function() {
                const maxBytes = FC.DATAFLASH.usedSize;

                let openedFile;
                prepare_file(function(fileWriter) {
                    let nextAddress = 0;
                    let totalBytesCompressed = 0;

                    show_saving_dialog();

                    function onChunkRead(chunkAddress, chunkDataView, bytesCompressed) {
                        if (chunkDataView !== null) {
                            // Did we receive any data?
                            if (chunkDataView.byteLength > 0) {
                                nextAddress += chunkDataView.byteLength;
                                if (isNaN(bytesCompressed) || isNaN(totalBytesCompressed)) {
                                    totalBytesCompressed = null;
                                } else {
                                    totalBytesCompressed += bytesCompressed;
                                }

                                $(".dataflash-saving progress").attr("value", nextAddress / maxBytes * 100);

                                const blob = new Blob([chunkDataView]);
                                FileSystem.writeChunck(openedFile, blob)
                                .then(() => {
                                    if (saveCancelled || nextAddress >= maxBytes) {
                                        if (saveCancelled) {
                                            dismiss_saving_dialog();
                                        } else {
                                            mark_saving_dialog_done(startTime, nextAddress, totalBytesCompressed);
                                        }
                                        FileSystem.closeFile(openedFile);
                                    } else {
                                        if (!self.writeError) {
                                            mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                                        } else {
                                            dismiss_saving_dialog();
                                            FileSystem.closeFile(openedFile);
                                        }
                                    }
                                });

                            } else {
                                // A zero-byte block indicates end-of-file, so we're done
                                mark_saving_dialog_done(startTime, nextAddress, totalBytesCompressed);
                                FileSystem.closeFile(openedFile);
                            }
                        } else {
                            // There was an error with the received block (address didn't match the one we asked for), retry
                            mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                        }
                    }

                    const startTime = new Date().getTime();
                    // Fetch the initial block
                    FileSystem.openFile(fileWriter).
                    then((file) => {
                        openedFile = file;
                        mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                    });
                });
            });
        }
    }

    function prepare_file(onComplete) {

        const prefix = 'BLACKBOX_LOG';
        const suffix = 'BBL';

        const filename = generateFilename(prefix, suffix);

        FileSystem.pickSaveFile(filename, i18n.getMessage('fileSystemPickerFiles', { typeof: suffix }), `.${suffix}`)
        .then((file) => {
            console.log("File picked:", file);
            onComplete(file);
        })
        .then(() => {
            console.log("FINISHED");
        })
        .catch((error) => {
            console.error("Error saving blackbox file:", error);
            gui_log(i18n.getMessage('dataflashFileWriteFailed'));
            gui_log(`<strong><span class="message-negative">${i18n.getMessage('error', { errorMessage: error })}</span class="message-negative></strong>`);
        });
    }

    function ask_to_erase_flash() {
        eraseCancelled = false;
        $(".dataflash-confirm-erase").removeClass('erasing');

        $(".dataflash-confirm-erase")[0].showModal();
    }

    function poll_for_erase_completion() {
        flash_update_summary(function() {
            if (CONFIGURATOR.connectionValid && !eraseCancelled) {
                if (FC.DATAFLASH.ready) {
                    $(".dataflash-confirm-erase")[0].close();
                    if (getConfig('showNotifications').showNotifications) {
                        NotificationManager.showNotification("Betaflight Configurator", {body: i18n.getMessage('flashEraseDoneNotification'), icon: "/images/pwa/favicon.ico"});
                    }
                } else {
                    setTimeout(poll_for_erase_completion, 500);
                }
            }
        });
    }

    function flash_erase() {
        $(".dataflash-confirm-erase").addClass('erasing');

        MSP.send_message(MSPCodes.MSP_DATAFLASH_ERASE, false, false, poll_for_erase_completion);
    }

    function flash_erase_cancel() {
        eraseCancelled = true;
        $(".dataflash-confirm-erase")[0].close();
    }
};

onboard_logging.cleanup = function (callback) {
    if (sdcardTimer) {
        clearTimeout(sdcardTimer);
        sdcardTimer = false;
    }

    if (callback) {
        callback();
    }
};

onboard_logging.mscRebootFailedCallback = function () {
    $(".tab-onboard_logging")
        .toggleClass("msc-supported", false);

    showErrorDialog(i18n.getMessage('operationNotSupported'));
};

TABS.onboard_logging = onboard_logging;
export {
    onboard_logging,
};
