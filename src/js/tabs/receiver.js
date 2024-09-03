import { i18n } from "../localization";
import GUI, { TABS } from '../gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import { tracking } from "../Analytics";
import { bit_check } from "../bit";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import Model from "../model";
import RateCurve from "../RateCurve";
import MSPCodes from "../msp/MSPCodes";
import windowWatcherUtil from "../utils/window_watchers";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../data_storage";
import DarkTheme from "../DarkTheme";
import { gui_log } from "../gui_log";
import { degToRad } from "../utils/common";
import semver from 'semver';
import { updateTabList } from "../utils/updateTabList";
import * as THREE from 'three';
import * as d3 from "d3";
import $ from 'jquery';
import CryptoES from 'crypto-es';

const receiver = {
    rateChartHeight: 117,
    analyticsChanges: {},
    needReboot: false,
    elrsBindingPhraseEnabled: false,
};

receiver.initialize = function (callback) {
    const tab = this;

    GUI.active_tab = 'receiver';

    function lookupElrsBindingPhrase(uidString) {
        const bindingPhraseMap = getConfig('binding_phrase_map').binding_phrase_map || {};

        return bindingPhraseMap[uidString] ?? 0;
    }

    function saveElrsBindingPhrase(uidString, bindingPhrase) {
        const bindingPhraseMap = getConfig('binding_phrase_map').binding_phrase_map ?? {};

        bindingPhraseMap[uidString] = bindingPhrase;
        setConfig({'binding_phrase_map': bindingPhraseMap});
      }

    function elrsBindingPhraseToBytes(text) {
        let uidBytes = [0,0,0,0,0,0];

        if (text) {
            const bindingPhraseFull = `-DMY_BINDING_PHRASE="${text}"`;
            const hash = CryptoES.MD5(bindingPhraseFull).toString();
            // Buffer.from is not available in the browser
            const bytes = hash.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
            const view = new DataView(new ArrayBuffer(6));
            for (let i = 0; i < 6; i++) {
                view.setUint8(i, bytes[i]);
            }
            uidBytes = Array.from(new Uint8Array(view.buffer));
        }

        return uidBytes;
    }

    function get_rc_data() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, get_rssi_config);
    }

    function get_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, get_rc_tuning);
    }

    function get_rc_tuning() {
        MSP.send_message(MSPCodes.MSP_RC_TUNING, false, false, get_rc_map);
    }

    function get_rc_map() {
        MSP.send_message(MSPCodes.MSP_RX_MAP, false, false, load_rc_configs);
    }

    function load_rc_configs() {
        MSP.send_message(MSPCodes.MSP_RC_DEADBAND, false, false, load_rx_config);
    }

    function load_rx_config() {
        MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, load_mixer_config);
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/receiver.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, get_rc_data);

    function process_html() {
        self.analyticsChanges = {};

        const featuresElement = $('.tab-receiver .features');

        FC.FEATURE_CONFIG.features.generateElements(featuresElement);

        // translate to user-selected language
        i18n.localizePage();

        $('.deadband input[name="yaw_deadband"]').val(FC.RC_DEADBAND_CONFIG.yaw_deadband);
        $('.deadband input[name="deadband"]').val(FC.RC_DEADBAND_CONFIG.deadband);
        $('.deadband input[name="3ddeadbandthrottle"]').val(FC.RC_DEADBAND_CONFIG.deadband3d_throttle);

        $('.sticks input[name="stick_min"]').val(FC.RX_CONFIG.stick_min);
        $('.sticks input[name="stick_center"]').val(FC.RX_CONFIG.stick_center);
        $('.sticks input[name="stick_max"]').val(FC.RX_CONFIG.stick_max);

        // generate bars
        const bar_names = [
            i18n.getMessage('controlAxisRoll'),
            i18n.getMessage('controlAxisPitch'),
            i18n.getMessage('controlAxisYaw'),
            i18n.getMessage('controlAxisThrottle'),
        ];

        const barContainer = $('.tab-receiver .bars');
        let auxIndex = 1;

        const numBars = (FC.RC.active_channels > 0) ? FC.RC.active_channels : 8;

        for (let i = 0; i < numBars; i++) {
            let name;
            if (i < bar_names.length) {
                name = bar_names[i];
            } else {
                name = i18n.getMessage(`controlAxisAux${auxIndex++}`);
            }

            barContainer.append(`\
                <ul>\
                    <li class="name">${name}</li>\
                    <li class="meter">\
                        <div class="meter-bar">\
                            <div class="label"></div>\
                            <div class="fill${FC.RC.active_channels === 0 ? 'disabled' : ''}">\
                                <div class="label"></div>\
                            </div>\
                        </div>\
                    </li>\
                </ul>\
            `);
        }

        // we could probably use min and max throttle for the range, will see
        const meterScale = {
            'min': 800,
            'max': 2200,
        };

        const meterFillArray = [];
        $('.meter .fill', barContainer).each(function () {
            meterFillArray.push($(this));
        });

        const meterLabelArray = [];
        $('.meter', barContainer).each(function () {
            meterLabelArray.push($('.label' , this));
        });

        // correct inner label margin on window resize (i don't know how we could do this in css)
        tab.resize = function () {
            const containerWidth = $('.meter:first', barContainer).width(),
                labelWidth = $('.meter .label:first', barContainer).width(),
                margin = (containerWidth / 2) - (labelWidth / 2);

            for (let i = 0; i < meterLabelArray.length; i++) {
                meterLabelArray[i].css('margin-left', margin);
            }
        };

        $(window).on('resize', tab.resize).resize(); // trigger so labels get correctly aligned on creation

        // handle rcmap & rssi aux channel
        let rcMapLetters = ['A', 'E', 'R', 'T', '1', '2', '3', '4'];

        let strBuffer = [];
        for (let i = 0; i < FC.RC_MAP.length; i++) {
            strBuffer[FC.RC_MAP[i]] = rcMapLetters[i];
        }

        // reconstruct
        const str = strBuffer.join('');

        // set current value
        $('input[name="rcmap"]').val(str);

        // validation / filter
        const lastValid = str;

        $('input[name="rcmap"]').on('input', function () {
            let val = $(this).val();

            // limit length to max 8
            if (val.length > 8) {
                val = val.substr(0, 8);
                $(this).val(val);
            }
        });

        $('input[name="rcmap"]').focusout(function () {
            const val = $(this).val();
            strBuffer = val.split('');
            const duplicityBuffer = [];

            if (val.length !== 8) {
                $(this).val(lastValid);
                return false;
            }

            // check if characters inside are all valid, also check for duplicity
            for (let i = 0; i < val.length; i++) {
                if (rcMapLetters.indexOf(strBuffer[i]) < 0) {
                    $(this).val(lastValid);
                    return false;
                }

                if (duplicityBuffer.indexOf(strBuffer[i]) < 0) {
                    duplicityBuffer.push(strBuffer[i]);
                } else {
                    $(this).val(lastValid);
                    return false;
                }
            }
        });

        // handle helper
        $('select[name="rcmap_helper"]').val(0); // go out of bounds
        $('select[name="rcmap_helper"]').change(function () {
            $('input[name="rcmap"]').val($(this).val());
        });

        // rssi
        const rssi_channel_e = $('select[name="rssi_channel"]');
        rssi_channel_e.append(`<option value="0">${i18n.getMessage("receiverRssiChannelDisabledOption")}</option>`);
        //1-4 reserved for Roll Pitch Yaw & Throttle, starting at 5
        for (let i = 5; i < FC.RC.active_channels + 1; i++) {
            const messageKey = `controlAxisAux${i-4}`;
            rssi_channel_e.append(`<option value="${i}">${i18n.getMessage(messageKey)}</option>`);
        }

        $('select[name="rssi_channel"]').val(FC.RSSI_CONFIG.channel);

        const supportedRxTypes = FC.getSupportedSerialRxTypes();
        const serialRxSelectElement = $('select.serialRX');
        let allRxTypesEnabled = true;
        FC.getSerialRxTypes().forEach((serialRxType, index) => {
            const enabled = supportedRxTypes.includes(serialRxType);
            if (!enabled) allRxTypesEnabled = false;
            const disable = enabled ? "" : "disabled";
            serialRxSelectElement.append(`<option value="${index}" ${disable} >${serialRxType}</option>`);
        });

        const warnRxProtocolNotInBuildOptions = function () {
          const serialRxValue = parseInt($('select.serialRX').val());
          const serialRxType = FC.getSerialRxTypes()[serialRxValue];
          const supported = supportedRxTypes.includes(serialRxType);
          $('.someRXTypesDisabled').toggle(supported && (! allRxTypesEnabled));
          $('.serialRXNotSupported').toggle(! supported);
        };

        serialRxSelectElement.change(function () {
            const serialRxValue = parseInt($(this).val());

            let newValue;
            if (serialRxValue !== FC.RX_CONFIG.serialrx_provider) {
                newValue = $(this).find('option:selected').text();
                updateSaveButton(true);
            }
            tab.analyticsChanges['SerialRx'] = newValue;

            FC.RX_CONFIG.serialrx_provider = serialRxValue;

            warnRxProtocolNotInBuildOptions();
        });

        // select current serial RX type
        serialRxSelectElement.val(FC.RX_CONFIG.serialrx_provider);

        warnRxProtocolNotInBuildOptions();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            serialRxSelectElement.sortSelect("NONE").select2();
        } else {
            serialRxSelectElement.sortSelect().select2();
        }

        $(document).on('select2:open', 'select.serialRX', () => {
            const allFound = document.querySelectorAll('.select2-container--open .select2-search__field');
            $(this).one('mouseup keyup',()=>{
                setTimeout(()=>{
                    allFound[allFound.length - 1].focus();
                },0);
            });
        });

        const spiRxTypes = [
            'NRF24_V202_250K',
            'NRF24_V202_1M',
            'NRF24_SYMA_X',
            'NRF24_SYMA_X5C',
            'NRF24_CX10',
            'CX10A',
            'NRF24_H8_3D',
            'NRF24_INAV',
            'FRSKY_D',
            'FRSKY_X',
            'A7105_FLYSKY',
            'A7105_FLYSKY_2A',
            'NRF24_KN',
            'SFHSS',
            'SPEKTRUM',
            'FRSKY_X_LBT',
            'REDPINE',
            'FRSKY_X_V2',
            'FRSKY_X_LBT_V2',
            'EXPRESSLRS',
        ];

        const spiRxElement = $('select.spiRx');
        for (let i = 0; i < spiRxTypes.length; i++) {
            spiRxElement.append(`<option value="${i}">${spiRxTypes[i]}</option>`);
        }

        spiRxElement.change(function () {
            const value = parseInt($(this).val());

            let newValue = undefined;
            if (value !== FC.RX_CONFIG.rxSpiProtocol) {
                newValue = $(this).find('option:selected').text();
                updateSaveButton(true);
            }
            tab.analyticsChanges['SPIRXProtocol'] = newValue;

            FC.RX_CONFIG.rxSpiProtocol = value;
        });

        // select current serial RX type
        spiRxElement.val(FC.RX_CONFIG.rxSpiProtocol);

        // Convert to select2 and order alphabetic
        spiRxElement.sortSelect().select2();

        $(document).on('select2:open', 'select.spiRx', () => {
            const allFound = document.querySelectorAll('.select2-container--open .select2-search__field');
            $(this).one('mouseup keyup',()=>{
                setTimeout(()=>{
                    allFound[allFound.length - 1].focus();
                },0);
            });
        });

        if (FC.FEATURE_CONFIG.features.isEnabled('RX_SPI') && FC.RX_CONFIG.rxSpiProtocol == 19 && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            tab.elrsBindingPhraseEnabled = true;

            const elrsUid = $('span.elrsUid');
            const elrsUidString = FC.RX_CONFIG.elrsUid.join(',');

            elrsUid.text(elrsUidString);

            const elrsBindingPhrase = $('input.elrsBindingPhrase');

            const bindingPhraseString = lookupElrsBindingPhrase(elrsUidString);
            if (bindingPhraseString) {
                elrsBindingPhrase.val(bindingPhraseString);
            }
            elrsBindingPhrase.on('keyup', function() {
                const bindingPhrase = elrsBindingPhrase.val();
                if (bindingPhrase) {
                    elrsUid.text(elrsBindingPhraseToBytes(bindingPhrase));
                } else {
                    elrsUid.text("0.0.0.0.0.0");
                }
                updateSaveButton(true);
            });
        } else {
            tab.elrsBindingPhraseEnabled = false;
        }

        if (tab.elrsBindingPhraseEnabled && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            $('input[name="elrsModelId-number"]').val(FC.RX_CONFIG.elrsModelId);
        } else {
            $('input[name="elrsModelId-number"]').parent().hide();
        }


        // UI Hooks

        function updateSaveButton(reboot=false) {
            if (reboot) {
                tab.needReboot = true;
            }
            if (tab.needReboot) {
                $('.update_btn').hide();
                $('.save_btn').show();
            } else {
                $('.update_btn').show();
                $('.save_btn').hide();
            }
        }

        $('input.feature', featuresElement).change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

            if (element.attr('name') === "RSSI_ADC" || element.attr('name') === "TELEMETRY") {
                updateSaveButton(true);
            }
        });

        function checkShowSerialRxBox() {
            $('div.serialRXBox').toggle(FC.FEATURE_CONFIG.features.isEnabled('RX_SERIAL'));
        }

        function checkShowSpiRxBox() {
            $('div.spiRxBox').toggle(FC.FEATURE_CONFIG.features.isEnabled('RX_SPI'));
        }

        function checkShowElrsBindingPhrase() {
            $('#elrsContainer').toggle(tab.elrsBindingPhraseEnabled);
            $('input.elrsUid').toggle(tab.elrsBindingPhraseEnabled);
        }

        // Sort the element, if need to group, do it by lexical sort, ie. by naming of (the translated) selection text
        $('#rxModeSelect').sortSelect(i18n.getMessage("featureNone"));

        $(featuresElement).filter('select').change(function () {
            const element = $(this);
            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);
            if (element.attr('name') === 'rxMode') {
                checkShowSerialRxBox();
                checkShowSpiRxBox();
                checkShowElrsBindingPhrase();
                updateSaveButton(true);
            }
        });

        checkShowSerialRxBox();
        checkShowSpiRxBox();
        checkShowElrsBindingPhrase();
        updateSaveButton();

        $('a.refresh').click(function () {
            tab.refresh(function () {
                gui_log(i18n.getMessage('receiverDataRefreshed'));
            });
        });

        function saveConfiguration(boot=false) {

            FC.RX_CONFIG.stick_max = parseInt($('.sticks input[name="stick_max"]').val());
            FC.RX_CONFIG.stick_center = parseInt($('.sticks input[name="stick_center"]').val());
            FC.RX_CONFIG.stick_min = parseInt($('.sticks input[name="stick_min"]').val());
            FC.RC_DEADBAND_CONFIG.yaw_deadband = parseInt($('.deadband input[name="yaw_deadband"]').val());
            FC.RC_DEADBAND_CONFIG.deadband = parseInt($('.deadband input[name="deadband"]').val());
            FC.RC_DEADBAND_CONFIG.deadband3d_throttle = ($('.deadband input[name="3ddeadbandthrottle"]').val());

            // catch rc map
            rcMapLetters = ['A', 'E', 'R', 'T', '1', '2', '3', '4'];
            strBuffer = $('input[name="rcmap"]').val().split('');

            for (let i = 0; i < FC.RC_MAP.length; i++) {
                FC.RC_MAP[i] = strBuffer.indexOf(rcMapLetters[i]);
            }

            // catch rssi aux
            FC.RSSI_CONFIG.channel = parseInt($('select[name="rssi_channel"]').val());

            FC.RX_CONFIG.rcSmoothingSetpointCutoff = parseInt($('input[name="rcSmoothingSetpointHz-number"]').val());
            FC.RX_CONFIG.rcSmoothingFeedforwardCutoff = parseInt($('input[name="rcSmoothingFeedforwardCutoff-number"]').val());

            FC.RX_CONFIG.rcSmoothingAutoFactor = parseInt($('input[name="rcSmoothingAutoFactor-number"]').val());

            if (tab.elrsBindingPhraseEnabled) {
                const elrsUidChars = $('span.elrsUid')[0].innerText.split(',').map(uidChar => parseInt(uidChar, 10));
                if (elrsUidChars.length === 6) {
                    FC.RX_CONFIG.elrsUid = elrsUidChars;

                    const elrsUid =  $('span.elrsUid')[0].innerText;
                    const elrsBindingPhrase = $('input.elrsBindingPhrase').val();
                    saveElrsBindingPhrase(elrsUid, elrsBindingPhrase);
                } else {
                    FC.RX_CONFIG.elrsUid = [0, 0, 0, 0, 0, 0];
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    FC.RX_CONFIG.elrsModelId = parseInt($('input[name="elrsModelId-number"]').val());
                }
            }

            function save_rssi_config() {
                MSP.send_message(MSPCodes.MSP_SET_RSSI_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RSSI_CONFIG), false, save_rc_configs);
            }

            function save_rc_configs() {
                MSP.send_message(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND), false, save_rx_config);
            }

            function save_rx_config() {
                const nextCallback = (boot) ? save_feature_config : save_to_eeprom;
                MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, nextCallback);
            }

            function save_feature_config() {
                MSP.send_message(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG), false, save_to_eeprom);
            }

            function save_to_eeprom() {
                mspHelper.writeConfiguration(boot);
            }

            tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, tab.analyticsChanges, 'receiver');
            tab.analyticsChanges = {};

            MSP.send_message(MSPCodes.MSP_SET_RX_MAP, mspHelper.crunch(MSPCodes.MSP_SET_RX_MAP), false, save_rssi_config);
        }

        $('a.update').click(function () {
            saveConfiguration(false);
        });

        $('a.save').click(function () {
            saveConfiguration(true);
            tab.needReboot = false;
        });

        $("a.sticks").on("click", function() {
            const windowWidth = 370;
            const windowHeight = 550;

            const rxFunction = function(channels) {
                if (CONFIGURATOR.connectionValid && GUI.active_tab !== 'cli') {
                    mspHelper.setRawRx(channels);
                    return true;
                } else {
                    return false;
                }
            };

            const createdWindow = open("/receiver_msp/receiver_msp.html", "receiver_msp", `location=no,width=${windowWidth},height=${windowHeight + (window.screen.height - window.screen.availHeight)}`);
            createdWindow.setRawRx = rxFunction;

            DarkTheme.isDarkThemeEnabled(function(isEnabled) {
                windowWatcherUtil.passValue(createdWindow, 'darkTheme', isEnabled);
            });
        });

        let showBindButton = false;
        showBindButton = bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_RX_BIND);

        $("a.bind").click(function() {
            MSP.send_message(MSPCodes.MSP2_BETAFLIGHT_BIND);

            gui_log(i18n.getMessage('receiverButtonBindMessage'));
        });

        $(".bind_btn").toggle(showBindButton);

        // RC Smoothing
        const smoothingOnOff = FC.RX_CONFIG.rcSmoothingMode;

        $('.tab-receiver .rcSmoothing').show();

        const rc_smoothing_protocol_e = $('select[name="rcSmoothing-select"]');
        rc_smoothing_protocol_e.change(function () {
            FC.RX_CONFIG.rcSmoothingMode = parseFloat($(this).val());
            updateInterpolationView();
        });
        rc_smoothing_protocol_e.val(smoothingOnOff);

        const rcSmoothingNumberElement = $('input[name="rcSmoothingSetpointHz-number"]');
        const rcSmoothingFeedforwardNumberElement = $('input[name="rcSmoothingFeedforwardCutoff-number"]');
        rcSmoothingNumberElement.val(FC.RX_CONFIG.rcSmoothingSetpointCutoff);
        rcSmoothingFeedforwardNumberElement.val(FC.RX_CONFIG.rcSmoothingFeedforwardCutoff);
        $('.tab-receiver .rcSmoothing-setpoint-cutoff').show();
        $('select[name="rcSmoothing-setpoint-manual-select"]').val("1");
        if (FC.RX_CONFIG.rcSmoothingSetpointCutoff === 0) {
            $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
            $('select[name="rcSmoothing-setpoint-manual-select"]').val("0");
        }
        $('select[name="rcSmoothing-setpoint-manual-select"]').change(function () {
            if ($(this).val() === "0") {
                rcSmoothingNumberElement.val(0);
                $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
            }
            if ($(this).val() === "1") {
                rcSmoothingNumberElement.val(FC.RX_CONFIG.rcSmoothingSetpointCutoff);
                $('.tab-receiver .rcSmoothing-setpoint-cutoff').show();
            }
        }).change();

        $('.tab-receiver .rcSmoothing-feedforward-cutoff').show();
        $('select[name="rcSmoothing-feedforward-select"]').val("1");
        if (FC.RX_CONFIG.rcSmoothingFeedforwardCutoff === 0) {
            $('select[name="rcSmoothing-feedforward-select"]').val("0");
            $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
        }
        $('select[name="rcSmoothing-feedforward-select"]').change(function () {
            if ($(this).val() === "0") {
                $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
                rcSmoothingFeedforwardNumberElement.val(0);
            }
            if ($(this).val() === "1") {
                $('.tab-receiver .rcSmoothing-feedforward-cutoff').show();
                rcSmoothingFeedforwardNumberElement.val(FC.RX_CONFIG.rcSmoothingFeedforwardCutoff);
            }
        }).change();

        $('select[name="rcSmoothing-setpoint-manual-select"], select[name="rcSmoothing-feedforward-select"]').change(function() {
            if ($('select[name="rcSmoothing-setpoint-manual-select"]').val() === "0" || $('select[name="rcSmoothing-feedforward-select"]').val() === "0") {
                $('.tab-receiver .rcSmoothing-auto-factor').show();
            } else {
                $('.tab-receiver .rcSmoothing-auto-factor').hide();
            }
        });
        $('select[name="rcSmoothing-setpoint-manual-select"]').change();

        const rcSmoothingAutoFactor = $('input[name="rcSmoothingAutoFactor-number"]');
        rcSmoothingAutoFactor.val(FC.RX_CONFIG.rcSmoothingAutoFactor);

        $('.receiverRcSmoothingAutoFactorHelp').attr('title', i18n.getMessage("receiverRcSmoothingAutoFactorHelp2"));

        updateInterpolationView();

        // Only show the MSP control sticks if the MSP Rx feature is enabled
        $(".sticks_btn").toggle(FC.FEATURE_CONFIG.features.isEnabled('RX_MSP'));

        const labelsChannelData = {
            ch1: [],
            ch2: [],
            ch3: [],
            ch4: [],
        };

        $(`.plot_control .ch1, .plot_control .ch2, .plot_control .ch3, .plot_control .ch4`).each(function (){
            const element = $(this);
            if (element.hasClass('ch1')){
                labelsChannelData.ch1.push(element);
            } else if (element.hasClass('ch2')){
                labelsChannelData.ch2.push(element);
            } else if (element.hasClass('ch3')){
                labelsChannelData.ch3.push(element);
            } else if (element.hasClass('ch4')){
                labelsChannelData.ch4.push(element);
            }
        });

        let plotUpdateRate;
        const rxRefreshRate = $('select[name="rx_refresh_rate"]');

        $('a.reset_rate').click(function () {
            plotUpdateRate = 50;
            rxRefreshRate.val(plotUpdateRate).change();
        });

        rxRefreshRate.change(function () {
            plotUpdateRate = parseInt($(this).val(), 10);

            // save update rate
            setConfig({'rx_refresh_rate': plotUpdateRate});

            function get_rc_refresh_data() {
                MSP.send_message(MSPCodes.MSP_RC, false, false, update_ui);
            }

            // setup plot
            const rxPlotData = new Array(FC.RC.active_channels);
            for (let i = 0; i < rxPlotData.length; i++) {
                rxPlotData[i] = [];
            }

            let samples = 0;
            const svg = d3.select("svg");
            const RX_plot_e = $('#RX_plot');
            const margin = {top: 20, right: 0, bottom: 10, left: 40};
            let width, height, widthScale, heightScale;

            function update_receiver_plot_size() {
                width = RX_plot_e.width() - margin.left - margin.right;
                height = RX_plot_e.height() - margin.top - margin.bottom;

                widthScale.range([0, width]);
                heightScale.range([height, 0]);
            }

            function update_ui() {
                if (FC.RC.active_channels > 0) {
                    // update bars with latest data
                    for (let i = 0; i < FC.RC.active_channels; i++) {
                        meterFillArray[i].css(
                            "width",
                            `${(
                                ((FC.RC.channels[i] - meterScale.min) /
                                    (meterScale.max - meterScale.min)) *
                                100
                            ).clamp(0, 100)}%`,
                        );
                        meterLabelArray[i].text(FC.RC.channels[i]);
                    }

                    labelsChannelData.ch1[0].text(FC.RC.channels[0]);
                    labelsChannelData.ch2[0].text(FC.RC.channels[1]);
                    labelsChannelData.ch3[0].text(FC.RC.channels[2]);
                    labelsChannelData.ch4[0].text(FC.RC.channels[3]);

                    // push latest data to the main array
                    for (let i = 0; i < FC.RC.active_channels; i++) {
                        rxPlotData[i].push([samples, FC.RC.channels[i]]);
                    }

                    // Remove old data from array
                    while (rxPlotData[0].length > 300) {
                        for (let i = 0; i < rxPlotData.length; i++) {
                            rxPlotData[i].shift();
                        }
                    }
                }

                // update required parts of the plot
                widthScale = d3.scaleLinear().domain([samples - 299, samples]);

                heightScale = d3.scaleLinear().domain([800, 2200]);

                update_receiver_plot_size();

                const xGrid = d3
                    .axisBottom()
                    .scale(widthScale)
                    .tickSize(-height)
                    .tickFormat("");

                const yGrid = d3
                    .axisLeft()
                    .scale(heightScale)
                    .tickSize(-width)
                    .tickFormat("");

                const xAxis = d3
                    .axisBottom()
                    .scale(widthScale)
                    .tickFormat(function (d) {
                        return d;
                    });

                const yAxis = d3
                    .axisLeft()
                    .scale(heightScale)
                    .tickFormat(function (d) {
                        return d;
                    });

                const line = d3
                    .line()
                    .x(function (d) {
                        return widthScale(d[0]);
                    })
                    .y(function (d) {
                        return heightScale(d[1]);
                    });

                svg.select(".x.grid").call(xGrid);
                svg.select(".y.grid").call(yGrid);
                svg.select(".x.axis").call(xAxis);
                svg.select(".y.axis").call(yAxis);

                const data = svg.select("g.data");
                const lines = data
                    .selectAll("path")
                    .data(rxPlotData, function (d, i) {
                        return i;
                    });
                lines.enter().append("path").attr("class", "line");
                lines.attr("d", line);

                samples++;
            }

            // timer initialization
            GUI.interval_remove('receiver_pull');

            // enable RC data pulling
            GUI.interval_add('receiver_pull', get_rc_refresh_data, plotUpdateRate, true);
        });

        const result = getConfig('rx_refresh_rate');
        if (result.rxRefreshRate) {
            rxRefreshRate.val(result.rxRefreshRate).change();
        } else {
            rxRefreshRate.change(); // start with default value
        }

        // Setup model for preview
        tab.initModelPreview();
        tab.renderModel();

        // TODO: Combine two polls together
        GUI.interval_add('receiver_pull_for_model_preview', tab.getReceiverData, 33, false);

        GUI.content_ready(callback);
    }
};

receiver.getReceiverData = function () {
    MSP.send_message(MSPCodes.MSP_RC, false, false);
};

receiver.initModelPreview = function () {
    this.keepRendering = true;
    this.model = new Model($('.model_preview'), $('.model_preview canvas'));

    this.rateCurve = new RateCurve(false);
    this.currentRates = this.rateCurve.getCurrentRates();

    $(window).on('resize', $.bind(this.model.resize, this.model));
};

receiver.renderModel = function () {
    if (!this.keepRendering) {
        return;
    }
    requestAnimationFrame(this.renderModel.bind(this));

    if (!this.clock) { this.clock = new THREE.Clock(); }

    if (FC.RC.channels[0] && FC.RC.channels[1] && FC.RC.channels[2]) {
        const delta = this.clock.getDelta();

        const roll = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(FC.RC.channels[0], this.currentRates.roll_rate, this.currentRates.rc_rate, this.currentRates.rc_expo,
            this.currentRates.superexpo, this.currentRates.deadband, this.currentRates.roll_rate_limit);
        const pitch = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(FC.RC.channels[1], this.currentRates.pitch_rate, this.currentRates.rc_rate_pitch,
            this.currentRates.rc_pitch_expo, this.currentRates.superexpo, this.currentRates.deadband, this.currentRates.pitch_rate_limit);
        const yaw = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(FC.RC.channels[2], this.currentRates.yaw_rate, this.currentRates.rc_rate_yaw,
            this.currentRates.rc_yaw_expo, this.currentRates.superexpo, this.currentRates.yawDeadband, this.currentRates.yaw_rate_limit);

        this.model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));
    }
};

receiver.cleanup = function (callback) {
    this.keepRendering = false;

    $(window).off('resize', this.resize);
    if (this.model) {
        $(window).off('resize', $.proxy(this.model.resize, this.model));
        this.model.dispose();
    }

    if (callback) callback();
};

receiver.refresh = function (callback) {
    const self = this;

    GUI.tab_switch_cleanup(function () {
        self.initialize();

        if (callback) {
            callback();
        }
    });
};

function updateInterpolationView() {
    const smoothingOnOff = FC.RX_CONFIG.rcSmoothingMode;

    $('.tab-receiver .rcSmoothing-feedforward-cutoff').show();
    $('.tab-receiver .rcSmoothing-setpoint-cutoff').show();
    $('.tab-receiver .rcSmoothing-feedforward-manual').show();
    $('.tab-receiver .rcSmoothing-setpoint-manual').show();

    if (FC.RX_CONFIG.rcSmoothingFeedforwardCutoff === 0 || FC.RX_CONFIG.rcSmoothingSetpointCutoff === 0) {
        $('.tab-receiver .rcSmoothing-auto-factor').show();
    }

    $('.tab-receiver .rcSmoothingOff').text(i18n.getMessage('off'));
    $('.tab-receiver .rcSmoothingOn').text(i18n.getMessage('on'));

    if (smoothingOnOff === 0) {
        $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
        $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
        $('.tab-receiver .rcSmoothing-feedforward-manual').hide();
        $('.tab-receiver .rcSmoothing-setpoint-manual').hide();
        $('.tab-receiver .rcSmoothing-auto-factor').hide();
    }

    if (FC.RX_CONFIG.rcSmoothingFeedforwardCutoff === 0) {
        $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
    }

    if (FC.RX_CONFIG.rcSmoothingSetpointCutoff === 0) {
        $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
    }
}

TABS.receiver = receiver;
export {
    receiver,
};
