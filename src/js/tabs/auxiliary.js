'use strict';

TABS.auxiliary = {};

TABS.auxiliary.initialize = function (callback) {
    GUI.active_tab_ref = this;
    GUI.active_tab = 'auxiliary';
    var prevChannelsValues = null;

    function get_mode_ranges() {
        MSP.send_message(MSPCodes.MSP_MODE_RANGES, false, false, 
            semver.gte(CONFIG.apiVersion, "1.41.0") ? get_mode_ranges_extra : get_box_ids);
    }

    function get_mode_ranges_extra() {
        MSP.send_message(MSPCodes.MSP_MODE_RANGES_EXTRA, false, false, get_box_ids);
    }

    function get_box_ids() {
        MSP.send_message(MSPCodes.MSP_BOXIDS, false, false, get_rssi_config);
    }

    function get_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, get_rc_data);
    }

    function get_rc_data() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, get_serial_config);
    }

    function get_serial_config() {
        MSP.send_message(MSPCodes.MSP_CF_SERIAL_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/auxiliary.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false, get_mode_ranges);

    function createMode(modeIndex, modeId) {
        var modeTemplate = $('#tab-auxiliary-templates .mode');
        var newMode = modeTemplate.clone();
        
        var modeName = AUX_CONFIG[modeIndex];        
        // Adjust the name of the box if a peripheral is selected
        modeName = adjustBoxNameIfPeripheralWithModeID(modeId, modeName);

        $(newMode).attr('id', 'mode-' + modeIndex);
        $(newMode).find('.name').text(modeName);
        
        $(newMode).data('index', modeIndex);
        $(newMode).data('id', modeId);
        
        $(newMode).find('.name').data('modeElement', newMode);
        $(newMode).find('a.addRange').data('modeElement', newMode);
        $(newMode).find('a.addLink').data('modeElement', newMode);

        // hide link button for ARM
        if (modeId == 0 || semver.lt(CONFIG.apiVersion, "1.41.0")) {
            $(newMode).find('.addLink').hide();
        }

        return newMode; 
    }

    function configureLogicList(template) {
        var logicList = $(template).find('.logic');
        var logicOptionTemplate = $(logicList).find('option');
        logicOptionTemplate.remove();

        //add logic option(s)
        var logicOption = logicOptionTemplate.clone();
        logicOption.text(i18n.getMessage('auxiliaryModeLogicOR'));
        logicOption.val(0);
        logicList.append(logicOption);
        
        if(semver.gte(CONFIG.apiVersion, "1.41.0")){
            var logicOption = logicOptionTemplate.clone();
            logicOption.text(i18n.getMessage('auxiliaryModeLogicAND'));
            logicOption.val(1);
            logicList.append(logicOption);
        }
        logicOptionTemplate.val(0);
    }
    
    function configureRangeTemplate(auxChannelCount) {
        var rangeTemplate = $('#tab-auxiliary-templates .range');
        
        var channelList = $(rangeTemplate).find('.channel');
        var channelOptionTemplate = $(channelList).find('option');
        channelOptionTemplate.remove();

        //add value to autodetect channel
        var channelOption = channelOptionTemplate.clone();
        channelOption.text(i18n.getMessage('auxiliaryAutoChannelSelect'));
        channelOption.val(-1);
        channelList.append(channelOption);

        for (var channelIndex = 0; channelIndex < auxChannelCount; channelIndex++) {
            var channelOption = channelOptionTemplate.clone();
            channelOption.text('AUX ' + (channelIndex + 1));
            channelOption.val(channelIndex);
            channelList.append(channelOption);
        }

        channelOptionTemplate.val(-1);
        
        configureLogicList(rangeTemplate);
    }
    
    function configureLinkTemplate() {
        var linkTemplate = $('#tab-auxiliary-templates .link');
        
        var linkList = $(linkTemplate).find('.linkedTo');
        var linkOptionTemplate = $(linkList).find('option');
        linkOptionTemplate.remove();
        
        // set up a blank option in place of ARM
        var linkOption = linkOptionTemplate.clone();
        linkOption.text("");
        linkOption.val(0);
        linkList.append(linkOption);

        for (var index = 1; index < AUX_CONFIG.length; index++) {
            var linkOption = linkOptionTemplate.clone();
            linkOption.text(AUX_CONFIG[index]);
            linkOption.val(AUX_CONFIG_IDS[index]);  // set value to mode id
            linkList.append(linkOption);
        }

        linkOptionTemplate.val(0);
        
        configureLogicList(linkTemplate);
    }
    
    function addRangeToMode(modeElement, auxChannelIndex, modeLogic, range) {
        var modeIndex = $(modeElement).data('index');
        var modeRanges = $(modeElement).find('.ranges');

        var channel_range = {
                'min': [  900 ],
                'max': [ 2100 ]
            };
        
        var rangeValues = [1300, 1700]; // matches MultiWii default values for the old checkbox MID range.
        if (range != undefined) {
            rangeValues = [range.start, range.end];
        }

        var rangeIndex = modeRanges.children().length;
        
        var rangeElement = $('#tab-auxiliary-templates .range').clone();
        rangeElement.attr('id', 'mode-' + modeIndex + '-range-' + rangeIndex);
        modeRanges.append(rangeElement);

        if (rangeIndex == 0) {
            $(rangeElement).find('.logic').hide();
        } else if (rangeIndex == 1) {
            modeRanges.children().eq(0).find('.logic').show();
        }
        
        $(rangeElement).find('.channel-slider').noUiSlider({
            start: rangeValues,
            behaviour: 'snap-drag',
            margin: 50,
            step: 25,
            connect: true,
            range: channel_range,
            format: wNumb({
                decimals: 0,
            })
        });

        var elementName =  '#mode-' + modeIndex + '-range-' + rangeIndex;
        $(elementName + ' .channel-slider').Link('lower').to($(elementName + ' .lowerLimitValue'));
        $(elementName + ' .channel-slider').Link('upper').to($(elementName + ' .upperLimitValue'));

        $(rangeElement).find(".pips-channel-range").noUiSlider_pips({
            mode: 'values',
            values: [900, 1000, 1200, 1400, 1500, 1600, 1800, 2000, 2100],
            density: 4,
            stepped: true
        });
        
        $(rangeElement).find('.deleteRange').data('rangeElement', rangeElement);
        $(rangeElement).find('.deleteRange').data('modeElement', modeElement);

        $(rangeElement).find('a.deleteRange').click(function () {
            var modeElement = $(this).data('modeElement');
            var rangeElement = $(this).data('rangeElement');

            rangeElement.remove();
    
            var siblings = $(modeElement).find('.ranges').children();
    
            if (siblings.length == 1) {
                siblings.eq(0).find('.logic').hide();
            }
        });

        $(rangeElement).find('.channel').val(auxChannelIndex);
        $(rangeElement).find('.logic').val(modeLogic);
    }

    function addLinkedToMode(modeElement, modeLogic, linkedTo) {
        var modeId = $(modeElement).data('id');
        var modeIndex = $(modeElement).data('index');
        var modeRanges = $(modeElement).find('.ranges');

        var linkIndex = modeRanges.children().length;

        var linkElement = $('#tab-auxiliary-templates .link').clone();
        linkElement.attr('id', 'mode-' + modeIndex + '-link-' + linkIndex);
        modeRanges.append(linkElement);

        if (linkIndex == 0) {
            $(linkElement).find('.logic').hide();
        } else if (linkIndex == 1) {
            modeRanges.children().eq(0).find('.logic').show();
        }

        // disable the option associated with this mode
        var linkSelect = $(linkElement).find('.linkedTo');
        $(linkSelect).find('option[value="' + modeId + '"]').prop('disabled',true);

        $(linkElement).find('.deleteLink').data('linkElement', linkElement);
        $(linkElement).find('.deleteLink').data('modeElement', modeElement);

        $(linkElement).find('a.deleteLink').click(function () {
            var modeElement = $(this).data('modeElement');
            var linkElement = $(this).data('linkElement');

            linkElement.remove();
    
            var siblings = $(modeElement).find('.ranges').children();
    
            if (siblings.length == 1) {
                siblings.eq(0).find('.logic').hide();
            }
        });

        $(linkElement).find('.linkedTo').val(linkedTo);
        $(linkElement).find('.logic').val(modeLogic);
    }

    function process_html() {
        var auxChannelCount = RC.active_channels - 4;

        configureRangeTemplate(auxChannelCount);
        configureLinkTemplate();

        var modeTableBodyElement = $('.tab-auxiliary .modes tbody') 
        for (var modeIndex = 0; modeIndex < AUX_CONFIG.length; modeIndex++) {
            
            var modeId = AUX_CONFIG_IDS[modeIndex];
            var newMode = createMode(modeIndex, modeId);
            modeTableBodyElement.append(newMode);
            
            // generate ranges from the supplied AUX names and MODE_RANGES[_EXTRA] data
            // skip linked modes for now
            for (var modeRangeIndex = 0; modeRangeIndex < MODE_RANGES.length; modeRangeIndex++) {
                var modeRange = MODE_RANGES[modeRangeIndex];

                var modeRangeExtra = {
                    id: modeRange.id,
                    modeLogic: 0,
                    linkedTo: 0
                };
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    modeRangeExtra = MODE_RANGES_EXTRA[modeRangeIndex];
                }
                
                if (modeRange.id != modeId || modeRangeExtra.id != modeId) {
                    continue;
                }

                if (modeId == 0 || modeRangeExtra.linkedTo == 0) {
                    var range = modeRange.range;
                    if (!(range.start < range.end)) {
                        continue; // invalid!
                    }

                    addRangeToMode(newMode, modeRange.auxChannelIndex, modeRangeExtra.modeLogic, range)

                } else {
                    addLinkedToMode(newMode, modeRangeExtra.modeLogic, modeRangeExtra.linkedTo);
                }
            }
        }
        
        $('a.addRange').click(function () {
            var modeElement = $(this).data('modeElement');
            // auto select AUTO option; default to 'OR' logic
            addRangeToMode(modeElement, -1, 0);
        });
        
        $('a.addLink').click(function () {
            var modeElement = $(this).data('modeElement');
            // default to 'OR' logic and no link selected
            addLinkedToMode(modeElement, 0, 0);
        });
                
        // translate to user-selected language
        i18n.localizePage();

        // UI Hooks
        $('a.save').click(function () {

            // update internal data structures based on current UI elements
            
            // we must send this many back to the FC - overwrite all of the old ones to be sure.
            var requiredModesRangeCount = MODE_RANGES.length;
            
            MODE_RANGES = [];
            MODE_RANGES_EXTRA = [];
            
            $('.tab-auxiliary .modes .mode').each(function () {
                var modeElement = $(this);
                var modeId = modeElement.data('id');
                
                $(modeElement).find('.range').each(function() {
                    var rangeValues = $(this).find('.channel-slider').val();
                    var modeRange = {
                        id: modeId,
                        auxChannelIndex: parseInt($(this).find('.channel').val()),
                        range: {
                            start: rangeValues[0],
                            end: rangeValues[1]
                        }
                    };
                    MODE_RANGES.push(modeRange);

                    var modeRangeExtra = {
                        id: modeId,
                        modeLogic: parseInt($(this).find('.logic').val()),
                        linkedTo: 0
                    };
                    MODE_RANGES_EXTRA.push(modeRangeExtra);
                });

                $(modeElement).find('.link').each(function() {
                    var linkedToSelection = parseInt($(this).find('.linkedTo').val());

                    if (linkedToSelection == 0) {
                        $(this).remove();
                    } else {
                        var modeRange = {
                            id: modeId,
                            auxChannelIndex: 0,
                            range: {
                                start: 900,
                                end: 900
                            }
                        };
                        MODE_RANGES.push(modeRange);

                        var modeRangeExtra = {
                            id: modeId,
                            modeLogic: parseInt($(this).find('.logic').val()),
                            linkedTo: linkedToSelection
                        };
                        MODE_RANGES_EXTRA.push(modeRangeExtra);
                    }
                });
            });
            
            for (var modeRangeIndex = MODE_RANGES.length; modeRangeIndex < requiredModesRangeCount; modeRangeIndex++) {
                var defaultModeRange = {
                    id: 0,
                    auxChannelIndex: 0,
                    range: {
                        start: 900,
                        end: 900
                    }
                };
                MODE_RANGES.push(defaultModeRange);

                var defaultModeRangeExtra = {
                    id: 0,
                    modeLogic: 0,
                    linkedTo: 0
                };
                MODE_RANGES_EXTRA.push(defaultModeRangeExtra);
            }

            //
            // send data to FC
            //
            mspHelper.sendModeRanges(save_to_eeprom);

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(i18n.getMessage('auxiliaryEepromSaved'));
                });
            }
        });

       
        function box_highlight(auxChannelIndex, channelPosition) {
            if (channelPosition < 900) {
                channelPosition = 900;
            } else if (channelPosition > 2100) {
                channelPosition = 2100;
            }
        }
        
        function update_marker(auxChannelIndex, channelPosition) {
            var percentage = (channelPosition - 900) / (2100-900) * 100;
            
            $('.modes .ranges .range').each( function () {
                var auxChannelCandidateIndex = $(this).find('.channel').val();
                if (auxChannelCandidateIndex != auxChannelIndex) {
                    return;
                }
                
                $(this).find('.marker').css('left', percentage + '%');
            });
        }

        // data pulling functions used inside interval timer
        function get_rc_data() {
            MSP.send_message(MSPCodes.MSP_RC, false, false, update_ui);
        }

        function update_ui() {
            let hasUsedMode = false;
            for (let i = 0; i < AUX_CONFIG.length; i++) {
                let modeElement = $('#mode-' + i);
                if (modeElement.find(' .range').length == 0 && modeElement.find(' .link').length == 0) {
                    // if the mode is unused, skip it
                    modeElement.removeClass('off').removeClass('on').removeClass('disabled');
                    continue;
                }
                
                if (bit_check(CONFIG.mode, i)) {
                    $('.mode .name').eq(i).data('modeElement').addClass('on').removeClass('off').removeClass('disabled');

                    // ARM mode is a special case
                    if (i == 0) {
                        $('.mode .name').eq(i).html(AUX_CONFIG[i]);
                    }
                } else {

                    //ARM mode is a special case
                    if (i == 0) {
                        var armSwitchActive = false;
                        
                        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                            if (CONFIG.armingDisableCount > 0) {
                                // check the highest bit of the armingDisableFlags. This will be the ARMING_DISABLED_ARMSWITCH flag.
                                var armSwitchMask = 1 << (CONFIG.armingDisableCount - 1);
                                if ((CONFIG.armingDisableFlags & armSwitchMask) > 0) {
                                    armSwitchActive = true;
                                }
                            }
                        }

                        // If the ARMING_DISABLED_ARMSWITCH flag is set then that means that arming is disabled
                        // and the arm switch is in a valid arming range. Highlight the mode in red to indicate
                        // that arming is disabled.
                        if (armSwitchActive) {
                            $('.mode .name').eq(i).data('modeElement').removeClass('on').removeClass('off').addClass('disabled');
                            $('.mode .name').eq(i).html(AUX_CONFIG[i] + '<br>' + i18n.getMessage('auxiliaryDisabled'));
                        } else {
                            $('.mode .name').eq(i).data('modeElement').removeClass('on').removeClass('disabled').addClass('off');
                            $('.mode .name').eq(i).html(AUX_CONFIG[i]);
                        }
                    } else {
                        $('.mode .name').eq(i).data('modeElement').removeClass('on').removeClass('disabled').addClass('off');
                    }
                }
                hasUsedMode = true;
            }

            let hideUnused = hideUnusedModes && hasUsedMode;
            for (let i = 0; i < AUX_CONFIG.length; i++) {
                let modeElement = $('#mode-' + i);
                if (modeElement.find(' .range').length == 0 && modeElement.find(' .link').length == 0) {
                    modeElement.toggle(!hideUnused);
                }
            }    

            auto_select_channel(RC.channels, RSSI_CONFIG.channel);

            var auxChannelCount = RC.active_channels - 4;

            for (var i = 0; i < (auxChannelCount); i++) {
                box_highlight(i, RC.channels[i + 4]);
                update_marker(i, RC.channels[i + 4]);
            }
        }

        /**
         * Autodetect channel based on maximum deference with previous value
         * minimum value to autodetect is 100
         * @param RC_channels
         * @param RC_channels
         */
        function auto_select_channel(RC_channels, RSSI_channel) {
            var auto_option = $('.tab-auxiliary select.channel option[value="-1"]:selected');
            if (auto_option.length === 0) {
                prevChannelsValues = null;
                return;
            }

            var fillPrevChannelsValues = function () {
                prevChannelsValues = RC_channels.slice(0); //clone array
            }

            if (!prevChannelsValues || RC_channels.length === 0) return fillPrevChannelsValues();

            var diff_array = RC_channels.map(function(currentValue, index) {
                return Math.abs(prevChannelsValues[index] - currentValue);
            });

            var largest = diff_array.reduce(function(x,y){
                return (x > y) ? x : y;
            }, 0);

            //minimum change to autoselect is 100
            if (largest < 100) return fillPrevChannelsValues();

            var indexOfMaxValue = diff_array.indexOf(largest);
            if (indexOfMaxValue >= 4 && indexOfMaxValue != RSSI_channel - 1){ //set channel
                auto_option.parent().val(indexOfMaxValue - 4);
            }

            return fillPrevChannelsValues();
        }

        let hideUnusedModes = false;
        ConfigStorage.get('hideUnusedModes', function (result) {
            $("input#switch-toggle-unused")
                .change(function() {
                    hideUnusedModes = $(this).prop("checked");
                    ConfigStorage.set({ hideUnusedModes: hideUnusedModes });
                    update_ui();
                })
                .prop("checked", !!result.hideUnusedModes)
                .change();
        });    
    
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

TABS.auxiliary.cleanup = function (callback) {
    if (callback) callback();
};
