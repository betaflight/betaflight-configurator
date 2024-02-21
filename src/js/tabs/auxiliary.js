import { i18n, getCurrentLocaleISO } from "../localization";
import GUI from '../../js/gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import { bit_check } from '../bit';
import { mspHelper } from '../msp/MSPHelper';
import FC from '../fc';
import MSP from '../msp';
import MSPCodes from '../msp/MSPCodes';
import adjustBoxNameIfPeripheralWithModeID from '../peripherals';
import { getTextWidth } from '../utils/common';
import $ from 'jquery';
import inflection from "inflection";

const auxiliary = {};

// BF build Options mapped to buildKey.
const buildMap = [
    { buildKey: 'cam',       buildOption: ['USE_CAMERA_CONTROL']},
    { buildKey: 'div',       buildOption: ['USE_ARCO_TRAINER', 'USE_DASHBOARD', 'USE_PINIO']},
    { buildKey: 'dshot',     buildOption: ['USE_DSHOT']},
    { buildKey: 'gps_mag',   buildOption: ['USE_GPS', 'USE_GPS_PLUS_CODES', 'USE_MAG']},
    { buildKey: 'led_strip', buildOption: ['USE_LED_STRIP', 'USE_LED_STRIP_64']},
    { buildKey: 'osd',       buildOption: ['USE_OSD', 'USE_OSD_SD', 'USE_OSD_HD', 'USE_FRSKYOSD']},
    { buildKey: 'serial',    buildOption: ['USE_SERIALRX', 'USE_SERIALRX_FPORT']},
    { buildKey: 'servos',    buildOption: ['USE_SERVOS']},
    { buildKey: 'telemetry', buildOption: ['USE_TELEMETRY', 'USE_TELEMETRY_SMARTPORT']},
    { buildKey: 'vtx',       buildOption: ['USE_VTX']},
];

const flightControl = ['ARM', 'ANGLE', 'HORIZON', 'ANTI GRAVITY', 'HEADFREE', 'HEADADJ', 'FAILSAFE', 'AIR MODE', 'FPV ANGLE MIX', 'ACRO TRAINER', 'LAUNCH CONTROL'];

// Categories to be mapped with buildMap. Category 'all' are virtuel and always included
const categoryTable = [
    { name: 'BEEP',           buildKey: ['all'],       modes: ['BEEPERON', 'BEEPER', 'BEEPER MUTE', 'GPS BEEP SATELLITE COUNT']},
    { name: 'BLACKBOX',       buildKey: ['all'],       modes: ['BLACKBOX', 'BLACKBOX ERASE']},
    { name: 'CAM',            buildKey: ['cam'],       modes: ['CAMERA CONTROL 1', 'CAMERA CONTROL 2', 'CAMERA CONTROL 3']},
    { name: 'DSHOT / 3D',     buildKey: ['dshot'],     modes: ['3D', '3D DISABLE / SWITCH', 'FLIP OVER AFTER CRASH']},
    { name: 'FLIGHT CONTROL', buildKey: ['all'],       modes: flightControl},
    { name: 'GPS / MAG',      buildKey: ['gps_mag'],   modes: ['GPS BEEP SATELLITE COUNT', 'GPS RESCUE', 'MAG']},
    { name: 'LED',            buildKey: ['led_strip'], modes: ['LEDLOW']},
    { name: 'OSD',            buildKey: ['osd'],       modes: ['OSD DISABLE']},
    { name: 'OTHER',          buildKey: ['all'],       modes: ['CALIB', 'MSP OVERRIDE', 'LAP TIMER RESET', 'PASSTHRU', 'PARALYZE', 'PID AUDIO', 'PREARM', 'READY']},
    { name: 'SERVO',          buildKey: ['servos'],    modes: ['SERVO1', 'SERVO2', 'SERVO3']},
    { name: 'TELEMETRY',      buildKey: ['telemetry'], modes: ['TELEMETRY']},
    { name: 'USER',           buildKey: ['all'],       modes: ['USER1', 'USER2', 'USER3', 'USER4']},
    { name: 'VTX',            buildKey: ['vtx'],       modes: ['STICK COMMANDS DISABLE', 'VTX CONTROL DISABLE', 'VTX PIT MODE']},
];

let hideUnusedModes = false;
let modeList = [];

function inBuildMap(map, name) {
    if (name == 'all') {
        return true;
    }
    for (let value of map) {
        if (name.includes(value.buildKey)) {
            for (let option of value.buildOption) {
                if (FC.CONFIG.buildOptions.includes(option)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isSelectedMode(mList, modeName) {
    for (let i = 0; i < mList.length; i++) {        //    for (let value of mList) don't break on first hit
        if (mList[i].includes(modeName)) {
            return true;
        }
    }
    return false;
}

function resolveCategoryName(category, choise) {
    let mList = [];
    for (let value of choise) {
        for (let elm of category) {
            if (value.includes(elm.name)) {
                mList.push(elm.modes);
            }
        }
    }
    return mList;
}

function updateSearchResults() {
    let categorySelect = $('select.auxiliary_category_select');

    const categoryNameList = categorySelect.multipleSelect("getSelects", "text");
    setConfig({ auxiliaryCategoryNameList: categoryNameList });         // save as users choise
    modeList = resolveCategoryName(categoryTable, categoryNameList);
    updateModes();                                                      // update UI
}

function getCategoryNames(table, buildKey) {
    // return names for buildKey category
    let categoryChoise = [];
    for (let value of table) {
        if (value.name == buildKey) {
            categoryChoise.push(value.name);
        }
    }
    return categoryChoise;
}

function generateDefaultList(categoryTable) {
    let list = [];
    for (const item of categoryTable) {
        list.push(item.name);
    }
    return list;
}

function createCategorySelect(table, map) {
    let categorySelect = $('select.auxiliary_category_select');
    const allCat = generateDefaultList(categoryTable);

    const categoryNameObj = getConfig('auxiliaryCategoryNameList', allCat); // read user pre selected categories, if empty default to complete list
    let categoryNameList = categoryNameObj.auxiliaryCategoryNameList;
    if (categoryNameList.length == 0) {
        categoryNameList = getCategoryNames(table, 'all');                  // empty choise -> select names from 'all' category
        setConfig({ auxiliaryCategoryNameList: categoryNameList });
    }

    for (let value of table) {
        if (inBuildMap(map, value.buildKey) || FC.CONFIG.buildOptions.length == 0) {
            // selected build option or local build
            if (categoryNameList.includes(value.name)) {
                categorySelect.append(`<option value="${value.name}" selected="selected">${value.name}</option>`);
            }
            else {
                categorySelect.append(`<option value="${value.name}">${value.name}</option>`);
            }
        }
    }

    const modeWidth = 125;
    const heightUnit = categoryTable.length;

    categorySelect.sortSelect().multipleSelect({
        width: modeWidth + 50,
        dropWidth: modeWidth + 63,
        minimumCountSelected: 2,                    // number before we use xx of yy
        maxHeight: heightUnit * 30,                 // in px
        maxHeightUnit: heightUnit,                  // show all categories
        locale: getCurrentLocaleISO(),
        filter: false,
        showClear: true,
        ellipsis: true,
        openOnHover: true,                          // open when muse over
        placeholder: i18n.getMessage("dropDownFilterDisabled"),
        onClear: () => { updateSearchResults(); },
        onClick: () => { updateSearchResults(); },
        onFilter: () => { updateSearchResults(); },
        onCheckAll: () => { updateSearchResults(); },
        onUncheckAll: () => { updateSearchResults(); },
        formatSelectAll() { return i18n.getMessage("dropDownSelectAll"); },
        formatAllSelected() { return i18n.getMessage("dropDownAll"); },
    });
}
function updateModes() {
    let hasUsedMode = false;

    for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
        let modeElement = $(`#mode-${i}`);

        if (modeElement.find(' .range').length == 0 && modeElement.find(' .link').length == 0) {
            // if the mode is unused, skip it
            modeElement.removeClass('off').removeClass('on').removeClass('disabled');
            continue;
        }

        if (bit_check(FC.CONFIG.mode, i)) {
            $('.mode .name').eq(i).data('modeElement').addClass('on').removeClass('off').removeClass('disabled');

            // ARM mode is a special case
            if (i == 0) {
                $('.mode .name').eq(i).html(FC.AUX_CONFIG[i]);
            }
        } else {

            // ARM mode is a special case
            if (i == 0) {
                let armSwitchActive = false;

                if (FC.CONFIG.armingDisableCount > 0) {
                    // check the highest bit of the armingDisableFlags. This will be the ARMING_DISABLED_ARMSWITCH flag.
                    const armSwitchMask = 1 << (FC.CONFIG.armingDisableCount - 1);
                    if ((FC.CONFIG.armingDisableFlags & armSwitchMask) > 0) {
                        armSwitchActive = true;
                    }
                }

                // If the ARMING_DISABLED_ARMSWITCH flag is set then that means that arming is disabled
                // and the arm switch is in a valid arming range. Highlight the mode in red to indicate
                // that arming is disabled.
                if (armSwitchActive) {
                    $('.mode .name').eq(i).data('modeElement').removeClass('on').removeClass('off').addClass('disabled');
                    $('.mode .name').eq(i).html(`${FC.AUX_CONFIG[i]}<br>${i18n.getMessage('auxiliaryDisabled')}`);
                } else {
                    $('.mode .name').eq(i).data('modeElement').removeClass('on').removeClass('disabled').addClass('off');
                    $('.mode .name').eq(i).html(FC.AUX_CONFIG[i]);
                }
            } else {
                $('.mode .name').eq(i).data('modeElement').removeClass('on').removeClass('disabled').addClass('off');
            }
        }
        hasUsedMode = true;
    }

    let hideUnused = hideUnusedModes && hasUsedMode;

    for (let i = 1; i < FC.AUX_CONFIG.length; i++) {    // ARM has index 0
        let modeElement = $(`#mode-${i}`);

        if ( ! isSelectedMode(modeList, FC.AUX_CONFIG[i])) {
            modeElement.toggle( false);
        }
        else {
            modeElement.toggle( true);
            if ( modeElement.find(' .range').length == 0 && modeElement.find(' .link').length == 0) {
                modeElement.toggle(!hideUnused);        // unused mode
            }
        }
    }
}

auxiliary.initialize = function (callback) {
    GUI.active_tab = 'auxiliary';
    let prevChannelsValues = null;
    let hasDirtyUnusedModes = true;

    function get_mode_ranges() {
        MSP.send_message(MSPCodes.MSP_MODE_RANGES, false, false, get_mode_ranges_extra);
    }

    function get_mode_ranges_extra() {
        MSP.send_message(MSPCodes.MSP_MODE_RANGES_EXTRA, false, false, get_box_ids);
    }

    function get_box_ids() {
        MSP.send_message(MSPCodes.MSP_BOXIDS, false, false, get_rssi_config);
    }

    function get_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, getRcData);
    }

    function getRcData() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, get_serial_config);
    }

    function get_serial_config() {
        mspHelper.loadSerialConfig(load_html);
    }

    function load_html() {
        $('#content').load("./tabs/auxiliary.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false, get_mode_ranges);

    function createMode(modeIndex, modeId) {
        const modeTemplate = $('#tab-auxiliary-templates .mode');
        const newMode = modeTemplate.clone();

        let modeName = FC.AUX_CONFIG[modeIndex];
        // Adjust the name of the box if a peripheral is selected
        const modeNameAjusted = adjustBoxNameIfPeripheralWithModeID(modeId, modeName);
        // Camlize modeName
        const modeNameCamel = inflection.camelize(modeName.replace(/\s+/g, ''));

        $(newMode).attr('id', `mode-${modeIndex}`);
        $(newMode).find('.name').text(modeNameAjusted);

        // add help to mode
        $(newMode).find('.helpicon').attr('i18n_title', `auxiliaryHelpMode_${modeNameCamel}`);

        $(newMode).data('index', modeIndex);
        $(newMode).data('id', modeId);

        $(newMode).find('.name').data('modeElement', newMode);
        $(newMode).find('a.addRange').data('modeElement', newMode);
        $(newMode).find('a.addLink').data('modeElement', newMode);

        // hide link button for ARM
        if (modeId == 0) {
            $(newMode).find('.addLink').hide();
        }

        return newMode;
    }

    function configureLogicList(template) {
        const logicList = $(template).find('.logic');
        const logicOptionTemplate = $(logicList).find('option');
        logicOptionTemplate.remove();

        //add logic option(s)
        let logicOption = logicOptionTemplate.clone();
        logicOption.text(i18n.getMessage('auxiliaryModeLogicOR'));
        logicOption.val(0);
        logicList.append(logicOption);

        logicOption = logicOptionTemplate.clone();
        logicOption.text(i18n.getMessage('auxiliaryModeLogicAND'));
        logicOption.val(1);
        logicList.append(logicOption);

        logicOptionTemplate.val(0);
    }

    function configureRangeTemplate(auxChannelCount) {
        const rangeTemplate = $('#tab-auxiliary-templates .range');

        const channelList = $(rangeTemplate).find('.channel');
        const channelOptionTemplate = $(channelList).find('option');
        channelOptionTemplate.remove();

        //add value to autodetect channel
        let channelOption = channelOptionTemplate.clone();
        channelOption.text(i18n.getMessage('auxiliaryAutoChannelSelect'));
        channelOption.val(-1);
        channelList.append(channelOption);

        for (let channelIndex = 0; channelIndex < auxChannelCount; channelIndex++) {
            channelOption = channelOptionTemplate.clone();
            channelOption.text(`AUX ${channelIndex + 1}`);
            channelOption.val(channelIndex);
            channelList.append(channelOption);
        }

        channelOptionTemplate.val(-1);

        configureLogicList(rangeTemplate);
    }

    function configureLinkTemplate() {
        const linkTemplate = $('#tab-auxiliary-templates .link');

        const linkList = $(linkTemplate).find('.linkedTo');
        const linkOptionTemplate = $(linkList).find('option');
        linkOptionTemplate.remove();

        // set up a blank option in place of ARM
        let linkOption = linkOptionTemplate.clone();
        linkOption.text("");
        linkOption.val(0);
        linkList.append(linkOption);

        for (let index = 1; index < FC.AUX_CONFIG.length; index++) {
            linkOption = linkOptionTemplate.clone();
            linkOption.text(FC.AUX_CONFIG[index]);
            linkOption.val(FC.AUX_CONFIG_IDS[index]);  // set value to mode id
            linkList.append(linkOption);
        }

        // sort linkedTo options, empty option on top
        linkList.sortSelect();

        linkOptionTemplate.val(0);

        configureLogicList(linkTemplate);
    }

    function addRangeToMode(modeElement, auxChannelIndex, modeLogic, range) {
        const modeIndex = $(modeElement).data('index');
        const modeRanges = $(modeElement).find('.ranges');

        const channel_range = {
                'min': [  900 ],
                'max': [ 2100 ],
            };

        let rangeValues = [1300, 1700]; // matches MultiWii default values for the old checkbox MID range.
        if (range !== undefined) {
            rangeValues = [range.start, range.end];
        }

        const rangeIndex = modeRanges.children().length;

        let rangeElement = $('#tab-auxiliary-templates .range').clone();
        rangeElement.attr('id', `mode-${modeIndex}-range-${rangeIndex}`);
        modeRanges.append(rangeElement);

        if (rangeIndex == 0) {
            $(rangeElement).find('.logic').hide();
        } else if (rangeIndex == 1) {
            modeRanges.children().eq(0).find('.logic').show();
        }

        $(rangeElement).find('.channel-slider').noUiSlider({
            start: rangeValues,
            behaviour: 'snap-drag',
            margin: 25,
            step: 25,
            connect: true,
            range: channel_range,
            format: wNumb({
                decimals: 0,
            }),
        });

        const elementName =  `#mode-${modeIndex}-range-${rangeIndex}`;
        $(`${elementName} .channel-slider`).Link('lower').to($(`${elementName} .lowerLimitValue`));
        $(`${elementName} .channel-slider`).Link('upper').to($(`${elementName} .upperLimitValue`));

        let sliderValues = [900, 1000, 1200, 1400, 1500, 1600, 1800, 2000, 2100];
        if ($(window).width() < 575) {
            sliderValues = [1000, 1200, 1400, 1600, 1800, 2000];
        }
        $(rangeElement).find(".pips-channel-range").noUiSlider_pips({
            mode: 'values',
            values: sliderValues,
            density: 4,
            stepped: true,
        });

        $(rangeElement).find('.deleteRange').data('rangeElement', rangeElement);
        $(rangeElement).find('.deleteRange').data('modeElement', modeElement);

        $(rangeElement).find('a.deleteRange').click(function () {
            modeElement = $(this).data('modeElement');
            rangeElement = $(this).data('rangeElement');

            rangeElement.remove();

            const siblings = $(modeElement).find('.ranges').children();

            if (siblings.length == 1) {
                siblings.eq(0).find('.logic').hide();
            }
        });

        $(rangeElement).find('.channel').val(auxChannelIndex);
        $(rangeElement).find('.logic').val(modeLogic);
    }

    function addLinkedToMode(modeElement, modeLogic, linkedTo) {
        const modeId = $(modeElement).data('id');
        const modeIndex = $(modeElement).data('index');
        const modeRanges = $(modeElement).find('.ranges');

        const linkIndex = modeRanges.children().length;

        let linkElement = $('#tab-auxiliary-templates .link').clone();
        linkElement.attr('id', `mode-${modeIndex}-link-${linkIndex}`);
        modeRanges.append(linkElement);

        if (linkIndex == 0) {
            $(linkElement).find('.logic').hide();
        } else if (linkIndex == 1) {
            modeRanges.children().eq(0).find('.logic').show();
        }

        // disable the option associated with this mode
        const linkSelect = $(linkElement).find('.linkedTo');
        $(linkSelect).find(`option[value="${modeId}"]`).prop('disabled',true);

        $(linkElement).find('.deleteLink').data('linkElement', linkElement);
        $(linkElement).find('.deleteLink').data('modeElement', modeElement);

        $(linkElement).find('a.deleteLink').click(function () {
            modeElement = $(this).data('modeElement');
            linkElement = $(this).data('linkElement');

            linkElement.remove();

            const siblings = $(modeElement).find('.ranges').children();

            if (siblings.length == 1) {
                siblings.eq(0).find('.logic').hide();
            }
        });

        $(linkElement).find('.linkedTo').val(linkedTo);
        $(linkElement).find('.logic').val(modeLogic);
    }

    function process_html() {
        let auxChannelCount = FC.RC.active_channels - 4;

        configureRangeTemplate(auxChannelCount);
        configureLinkTemplate();

        const modeTableBodyElement = $('.tab-auxiliary .modes');
        for (let modeIndex = 0; modeIndex < FC.AUX_CONFIG.length; modeIndex++) {
            const modeId = FC.AUX_CONFIG_IDS[modeIndex];
            const newMode = createMode(modeIndex, modeId);

            modeTableBodyElement.append(newMode);

            // generate ranges from the supplied AUX names and MODE_RANGES[_EXTRA] data
            // skip linked modes for now
            for (let modeRangeIndex = 0; modeRangeIndex < FC.MODE_RANGES.length; modeRangeIndex++) {
                const modeRange = FC.MODE_RANGES[modeRangeIndex];
                const modeRangeExtra = FC.MODE_RANGES_EXTRA[modeRangeIndex];

                if (modeRange.id != modeId || modeRangeExtra.id != modeId) {
                    continue;
                }

                if (modeId == 0 || modeRangeExtra.linkedTo == 0) {
                    const range = modeRange.range;
                    if (range.start >= range.end) {
                        continue; // invalid!
                    }
                    addRangeToMode(newMode, modeRange.auxChannelIndex, modeRangeExtra.modeLogic, range);
                } else {
                    addLinkedToMode(newMode, modeRangeExtra.modeLogic, modeRangeExtra.linkedTo);
                }
            }
        }

        // translate to user-selected language
        i18n.localizePage();

        const length = Math.max(...(FC.AUX_CONFIG.map(el => el.length)));
        $('.tab-auxiliary .mode .info').css('min-width', `${Math.round(length * getTextWidth('A'))}px`);

        $('a.addRange').click(function () {
            const modeElement = $(this).data('modeElement');
            // auto select AUTO option; default to 'OR' logic
            addRangeToMode(modeElement, -1, 0);
        });

        $('a.addLink').click(function () {
            const modeElement = $(this).data('modeElement');
            // default to 'OR' logic and no link selected
            addLinkedToMode(modeElement, 0, 0);
        });

        // create category multiple select
        createCategorySelect(categoryTable, buildMap);

        // UI Hooks
        $('a.save').click(function () {

            // update internal data structures based on current UI elements

            // we must send this many back to the FC - overwrite all of the old ones to be sure.
            const requiredModesRangeCount = FC.MODE_RANGES.length;

            FC.MODE_RANGES = [];
            FC.MODE_RANGES_EXTRA = [];

            $('.tab-auxiliary .modes .mode').each(function () {
                const modeElement = $(this);
                const modeId = modeElement.data('id');

                $(modeElement).find('.range').each(function() {
                    const rangeValues = $(this).find('.channel-slider').val();
                    const modeRange = {
                        id: modeId,
                        auxChannelIndex: parseInt($(this).find('.channel').val()),
                        range: {
                            start: rangeValues[0],
                            end: rangeValues[1],
                        },
                    };
                    FC.MODE_RANGES.push(modeRange);

                    const modeRangeExtra = {
                        id: modeId,
                        modeLogic: parseInt($(this).find('.logic').val()),
                        linkedTo: 0,
                    };
                    FC.MODE_RANGES_EXTRA.push(modeRangeExtra);
                });

                $(modeElement).find('.link').each(function() {
                    const linkedToSelection = parseInt($(this).find('.linkedTo').val());

                    if (linkedToSelection == 0) {
                        $(this).remove();
                    } else {
                        const modeRange = {
                            id: modeId,
                            auxChannelIndex: 0,
                            range: {
                                start: 900,
                                end: 900,
                            },
                        };
                        FC.MODE_RANGES.push(modeRange);

                        const modeRangeExtra = {
                            id: modeId,
                            modeLogic: parseInt($(this).find('.logic').val()),
                            linkedTo: linkedToSelection,
                        };
                        FC.MODE_RANGES_EXTRA.push(modeRangeExtra);
                    }
                });
            });

            for (let modeRangeIndex = FC.MODE_RANGES.length; modeRangeIndex < requiredModesRangeCount; modeRangeIndex++) {
                const defaultModeRange = {
                    id: 0,
                    auxChannelIndex: 0,
                    range: {
                        start: 900,
                        end: 900,
                    },
                };
                FC.MODE_RANGES.push(defaultModeRange);

                const defaultModeRangeExtra = {
                    id: 0,
                    modeLogic: 0,
                    linkedTo: 0,
                };
                FC.MODE_RANGES_EXTRA.push(defaultModeRangeExtra);
            }

            //
            // send data to FC
            //
            mspHelper.sendModeRanges(save_to_eeprom);

            function save_to_eeprom() {
                mspHelper.writeConfiguration(false);
            }
        });

        function limit_channel(channelPosition) {
            if (channelPosition < 900) {
                channelPosition = 900;
            } else if (channelPosition > 2100) {
                channelPosition = 2100;
            }
            return channelPosition;
        }

        function update_marker(auxChannelIndex, channelPosition) {
            const percentage = (channelPosition - 900) / (2100-900) * 100;

            $('.modes .ranges .range').each( function () {
                const auxChannelCandidateIndex = parseInt($(this).find('.channel').val());
                if (auxChannelCandidateIndex !== auxChannelIndex) {
                    return;
                }

                $(this).find('.marker').css('left', `${percentage}%`);
            });
        }

        // data pulling functions used inside interval timer
        function get_rc_data() {
            MSP.send_message(MSPCodes.MSP_RC, false, false, update_ui);
        }

        function update_ui() {
            updateSearchResults();      // setup categoryList and show selected Modes

            auto_select_channel(FC.RC.channels, FC.RC.active_channels, FC.RSSI_CONFIG.channel);

            auxChannelCount = FC.RC.active_channels - 4;

            for (let i = 0; i < (auxChannelCount); i++) {
                update_marker(i, limit_channel(FC.RC.channels[i + 4]));
            }
        }

        /**
         * Autodetect channel based on maximum deference with previous value
         * minimum value to autodetect is 100
         * @param RC_channels
         * @param RC_channels
         */
        function auto_select_channel(RC_channels, activeChannels, RSSI_channel) {
            const auto_option = $('.tab-auxiliary select.channel option[value="-1"]:selected');
            if (auto_option.length === 0) {
                prevChannelsValues = null;
                return;
            }

            const fillPrevChannelsValues = function () {
                prevChannelsValues = RC_channels.slice(0); //clone array
            };

            if (!prevChannelsValues || RC_channels.length === 0) return fillPrevChannelsValues();

            let diff_array = RC_channels.map(function(currentValue, index) {
                return Math.abs(prevChannelsValues[index] - currentValue);
            });

            diff_array = diff_array.slice(0, activeChannels);

            const largest = diff_array.reduce(function(x,y){
                return (x > y) ? x : y;
            }, 0);

            //minimum change to autoselect is 100
            if (largest < 100) return fillPrevChannelsValues();

            const indexOfMaxValue = diff_array.indexOf(largest);
            if (indexOfMaxValue >= 4 && indexOfMaxValue != RSSI_channel - 1) {
                auto_option.parent().val(indexOfMaxValue - 4); //set channel
            }

            return fillPrevChannelsValues();
        }

        // get or save hide unused modes
        const configUnusedModes = getConfig('hideUnusedModes');
        $("input#switch-toggle-unused").change(function() {
                                               hideUnusedModes = $(this).prop("checked");
                                               setConfig({ hideUnusedModes: hideUnusedModes });
                                               update_ui();})
            .prop("checked", !!configUnusedModes.hideUnusedModes)
            .change();

        // update ui instantly on first load
        update_ui();

        // enable data pulling
        GUI.interval_add('aux_data_pull', get_rc_data, 50);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function () {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

auxiliary.cleanup = function (callback) {
    if (callback) callback();
};

export {
    auxiliary,
};
