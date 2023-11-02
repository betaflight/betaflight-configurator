import { i18n } from "../localization";
import GUI, { TABS } from '../gui';
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import semver from 'semver';
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import $ from 'jquery';
import { API_VERSION_1_46 } from '../data_storage';

const led_strip = {
        wireMode: false,
        directions: ['n', 'e', 's', 'w', 'u', 'd'],
    };

led_strip.initialize = function (callback, scrollPosition) {
    let selectedColorIndex = null;
    let selectedModeColor = null;
    const functionTag = '.function-';

    TABS.led_strip.functions = ['i', 'w', 'f', 'a', 't', 'r', 'c', 'g', 's', 'b', 'l', 'o', 'y'];
    TABS.led_strip.baseFuncs = ['c', 'f', 'a', 'l', 's', 'g', 'r'];
    TABS.led_strip.overlays =  ['t', 'y', 'o', 'b', 'v', 'i', 'w'];

    if (semver.lt(FC.CONFIG.apiVersion,API_VERSION_1_46)) {
        TABS.led_strip.overlays = TABS.led_strip.overlays.filter(x => x !== 'y');
    }

    TABS.led_strip.wireMode = false;

    if (GUI.active_tab != 'led_strip') {
        GUI.active_tab = 'led_strip';
    }

    function load_led_config() {
        MSP.send_message(MSPCodes.MSP_LED_STRIP_CONFIG, false, false, load_led_colors);
    }

    function load_led_colors() {
        MSP.send_message(MSPCodes.MSP_LED_COLORS, false, false, load_led_mode_colors);
    }

    function load_led_mode_colors() {
        MSP.send_message(MSPCodes.MSP_LED_STRIP_MODECOLOR, false, false,  semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46) ? load_led_config_values : load_html);
    }

    function load_led_config_values() {
        MSP.send_message(MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/led_strip.html", process_html);
    }

    load_led_config();

    function buildUsedWireNumbers() {
        const usedWireNumbers = [];
        $('.mainGrid .gPoint .wire').each(function () {
            const wireNumber = parseInt($(this).html());
            if (wireNumber >= 0) {
                usedWireNumbers.push(wireNumber);
            }
        });
        usedWireNumbers.sort(function(a,b){return a - b;});
        return usedWireNumbers;
    }

    function process_html() {

        i18n.localizePage();

        // Build Grid
        const theHTML = [];
        let theHTMLlength = 0;
        for (let i = 0; i < 256; i++) {
            theHTML[theHTMLlength++] = ('<div class="gPoint"><div class="indicators"><span class="north"></span><span class="south"></span><span class="west"></span><span class="east"></span><span class="up">U</span><span class="down">D</span></div><span class="wire"></span><span class="overlay-t"> </span><span class="overlay-y"> </span><span class="overlay-o"> </span><span class="overlay-b"> </span><span class="overlay-v"> </span><span class="overlay-i"> </span><span class="overlay-w"> </span><span class="overlay-color"> </span></div>');
        }
        $('.mainGrid').html(theHTML.join(''));

        $('.tempOutput').on('click', function() {
            $(this).trigger('select');
        });

        // Aux channel drop-down
        $('.auxSelect').show();
        $('.labelSelect').hide();

        const AuxMode = 7;
        const AuxDir = 0;

        $('.auxSelect').val(getModeColor(AuxMode, AuxDir));

        $('.auxSelect').on('change', function() {
            setModeColor(AuxMode, AuxDir, $('.auxSelect').val());
        });

        $('.vtxOverlay').show();

        // Clear button
        $('.funcClear').on('click', function() {
            $('.gPoint').each(function() {
                if ($(this).is('.ui-selected')) {
                    removeFunctionsAndDirections(this);
                    $(this).find('.wire').html('');
                }
            });

            $('.controls button').removeClass('btnOn');
            updateBulkCmd();
        });

        // Clear All button
        $('.funcClearAll').on('click', function() {
            $('.gPoint').each(function() {
                removeFunctionsAndDirections(this);
            });
            $('.gPoint .wire').html('');

            updateBulkCmd();

            $('.controls button').removeClass('btnOn');
        });

        function removeFunctionsAndDirections(element) {
            const classesToRemove = [];

            TABS.led_strip.baseFuncs.forEach(function(letter) {
                classesToRemove.push(`function-${letter}`);
            });
            TABS.led_strip.overlays.forEach(function(letter) {
                classesToRemove.push(`function-${letter}`);
            });
            TABS.led_strip.directions.forEach(function(letter) {
                classesToRemove.push(`dir-${letter}`);
            });
            $(element).removeClass(classesToRemove.join(' '));
        }

        // Directional Buttons
        $('.directions').on('click', 'button', function() {
            const that = this;
            if ($('.ui-selected').length > 0) {
                TABS.led_strip.directions.forEach(function(letter) {
                    if ($(that).is(`.dir-${letter}`)) {
                        if ($(that).is('.btnOn')) {
                            $(that).removeClass('btnOn');
                            $('.ui-selected').removeClass(`dir-${letter}`);
                        } else {
                            $(that).addClass('btnOn');
                            $('.ui-selected').addClass(`dir-${letter}`);
                        }
                    }
                });

                clearModeColorSelection();
                updateBulkCmd();
            }
        });

        // Mode Color Buttons
        $('.mode_colors').on('click', 'button', function() {
            const that = this;
            FC.LED_MODE_COLORS.forEach(function(mc) {
                if ($(that).is(`.mode_color-${mc.mode}-${mc.direction}`)) {
                    if ($(that).is('.btnOn')) {
                        $(that).removeClass('btnOn');
                        $('.ui-selected').removeClass(`mode_color-${mc.mode}-${mc.direction}`);
                        selectedModeColor = null;
                    } else {
                        $(that).addClass('btnOn');
                        selectedModeColor = { mode: mc.mode, direction: mc.direction };

                        // select the color button
                        for (let colorIndex = 0; colorIndex < 16; colorIndex++) {
                            const className = `.color-${colorIndex}`;
                            if (colorIndex == getModeColor(mc.mode, mc.direction)) {
                                $(className).addClass('btnOn');
                                selectedColorIndex = colorIndex;
                                setColorSliders(colorIndex);

                            } else {
                                $(className).removeClass('btnOn');
                            }
                        }
                    }
                }
            });

            $('.mode_colors').each(function() {
                $(this).children().each(function() {
                    if (! $(this).is($(that))) {
                        if ($(this).is('.btnOn')) {
                            $(this).removeClass('btnOn');
                        }
                    }
                });
            });

            updateBulkCmd();
        });

        // Color sliders
        const ip = $('div.colorDefineSliders input');
        ip.eq(0).on("input change", function() { updateColors($(this).val(), 0); });
        ip.eq(1).on("input change", function() { updateColors($(this).val(), 1); });
        ip.eq(2).on("input change", function() { updateColors($(this).val(), 2); });
        for (let i = 0; i < 3; i++) {
            updateColors(ip.eq(i).val(), i);
        }

        const colorDefineSliders = $('.colorDefineSliders');

        // Color Buttons
        $('.colors').on('click', 'button', function(e) {
            const that = this;
            const colorButtons = $(this).parent().find('button');

            for (let colorIndex = 0; colorIndex < 16; colorIndex++) {
                colorButtons.removeClass('btnOn');
                if (selectedModeColor == undefined)
                    $('.ui-selected').removeClass(`color-${colorIndex}`);

                if ($(that).is(`.color-${colorIndex}`)) {
                    selectedColorIndex = colorIndex;
                    if (selectedModeColor == undefined)
                        $('.ui-selected').addClass(`color-${colorIndex}`);
                }
            }

            setColorSliders(selectedColorIndex);

            $(this).addClass('btnOn');

            if (selectedModeColor) {
                setModeColor(selectedModeColor.mode, selectedModeColor.direction, selectedColorIndex);
            }

            drawColorBoxesInColorLedPoints();

            // refresh color buttons
            $('.colors').children().each(function() { setBackgroundColor($(this)); });
            $('.overlay-color').each(function() { setBackgroundColor($(this)); });

            $('.mode_colors').each(function() { setModeBackgroundColor($(this)); });
            $('.special_colors').each(function() { setModeBackgroundColor($(this)); });

            updateBulkCmd();
        });

        $('.colors').on('dblclick', 'button', function() {
            const position = $(this).position();
            const colorDefineSlidersWidth = colorDefineSliders.width();
            const width = $(this).width();
            const calc = $(this).offset().left + colorDefineSlidersWidth / 2 + width + 14;
            if (calc > $(window).width()) {
                colorDefineSliders.css('left', 'auto');
                colorDefineSliders.css('right', 0);
            } else {
                colorDefineSliders.css('left', position.left - colorDefineSlidersWidth / 2 + width);
                colorDefineSliders.css('right', 'auto');
            }
            colorDefineSliders.css('top', position.top + 26);
            colorDefineSliders.show();
        });

        $('.colors').children().on({
            mouseleave: function () {
                if (!colorDefineSliders.is(":hover")) {
                    colorDefineSliders.hide();
                }
            },
        });

        $('.funcWire').on('click', function() {
            $(this).toggleClass('btnOn');
            TABS.led_strip.wireMode = $(this).hasClass('btnOn');
            $('.mainGrid').toggleClass('gridWire');
        });

        $('.funcWireClearSelect').on('click', function() {
            $('.ui-selected').each(function() {
                const thisWire = $(this).find('.wire');
                if (thisWire.html() !== '') {
                    thisWire.html('');
                }
                updateBulkCmd();
            });
        });

        $('.funcWireClear').on('click', function() {
            $('.gPoint .wire').html('');
            updateBulkCmd();
        });

        $('.mainGrid').selectable({
            filter: ' > div',
            stop: function() {
                const functionsInSelection = [];
                const directionsInSelection = [];

                clearModeColorSelection();

                let that;
                $('.ui-selected').each(function() {

                    const usedWireNumbers = buildUsedWireNumbers();

                    let nextWireNumber = 0;
                    for (; nextWireNumber < usedWireNumbers.length; nextWireNumber++) {
                        if (usedWireNumbers[nextWireNumber] != nextWireNumber) {
                            break;
                        }
                    }

                    if (TABS.led_strip.wireMode) {
                        if ($(this).find('.wire').html() == '' && nextWireNumber < FC.LED_STRIP.length) {
                            $(this).find('.wire').html(nextWireNumber);
                        }
                    }

                    if ($(this).find('.wire').text() != '') {

                        that = this;

                        // Get function & overlays or current cell
                        TABS.led_strip.directions.forEach(function(letter) {
                            const className = `.dir-${letter}`;
                            if ($(that).is(className)) {
                                directionsInSelection.push(className);
                            }
                        });

                        TABS.led_strip.baseFuncs.forEach(function(letter) {
                            const className = `.function-${letter}`;
                            if ($(that).is(className)) {
                                functionsInSelection.push(className);
                            }
                        });

                        TABS.led_strip.overlays.forEach(function(letter) {
                            const className = `.function-${letter}`;
                            if ($(that).is(className)) {
                                functionsInSelection.push(className);
                            }
                        });
                    }
                });

                const uiSelectedLast = that;
                $('select.functionSelect').val("");

                TABS.led_strip.baseFuncs.forEach(function(letter) {
                    const className = `function-${letter}`;
                    if ($('select.functionSelect').is(`.${className}`)) {
                        $('select.functionSelect').removeClass(className);
                    }
                });

                selectedColorIndex = 0;

                if (uiSelectedLast) {

                    // set active color
                    for (let colorIndex = 0; colorIndex < 16; colorIndex++) {
                        const className = `.color-${colorIndex}`;
                        if ($(uiSelectedLast).is(className)) {
                            $(className).addClass('btnOn');
                            selectedColorIndex = colorIndex;

                        } else {
                            $(className).removeClass('btnOn');
                        }
                    }

                    // set checkbox values
                    TABS.led_strip.overlays.forEach(function(letter) {
                        const feature_o = $('.checkbox').find(`input.function-${letter}`);

                        const newVal = ($(uiSelectedLast).is(functionTag + letter));

                        if (feature_o.is(':checked') !== newVal) {
                            feature_o.prop('checked', newVal);
                            feature_o.trigger('change');

                            $('.rainbowSlidersDiv').toggle($('.checkbox.rainbowOverlay').find('input').is(':checked')); //rainbow slider visibility
                        }
                    });

                    // Update active function in combobox
                    TABS.led_strip.baseFuncs.forEach(function(letter) {
                        if ($(uiSelectedLast).is(functionTag + letter)) {
                            $('select.functionSelect').val(`function-${letter}`);
                            $('select.functionSelect').addClass(`function-${letter}`);
                        }
                    });
                }
                updateBulkCmd();

                setColorSliders(selectedColorIndex);

                setOptionalGroupsVisibility();

                $('.directions button').removeClass('btnOn');
                directionsInSelection.forEach(function(direction_e) {
                    $(direction_e).addClass('btnOn');
                });
            },
        });

        // Sort the element, if need to group, do it by lexical sort, ie. by naming of (the translated) selection text
        $('#ledStripFunctionSelect').sortSelect(i18n.getMessage("ledStripFunctionNoneOption"));

        // UI: select LED function from drop-down
        $('.functionSelect').on('change', function() {
            clearModeColorSelection();
            applyFunctionToSelectedLeds();
            drawColorBoxesInColorLedPoints();
            setOptionalGroupsVisibility();
            updateBulkCmd();
        });

        // Sort the element, if need to group, do it by lexical sort, ie. by naming of (the translated) selection text
        $('#ledStripModeColorsModeSelect').sortSelect(i18n.getMessage("ledStripModeColorsModeOrientation"));

        // UI: select mode from drop-down
        $('.modeSelect').on('change', function() {

            const that = this;

            const mode = Number($(that).val());
            $('.mode_colors').find('button').each(function() {
                for (let i = 0; i < 6; i++) {
                    for (let j = 0; j < 6; j++) {
                        if ($(this).hasClass(`mode_color-${i}-${j}`)) {
                            $(this).removeClass(`mode_color-${i}-${j}`);
                            $(this).addClass(`mode_color-${mode}-${j}`);
                        }
                    }
                }
            });

            $('.mode_colors').each(function() { setModeBackgroundColor($(this)); });
        });

        function toggleSwitch(that, letter) {
            if ($(that).is(':checked')) {
                $('.ui-selected').find('.wire').each(function() {
                    if ($(this).text() != "") {

                        const p = $(this).parent();

                        TABS.led_strip.functions.forEach(function(f) {
                            if (p.is(functionTag + f)) {

                                switch (letter) {
                                case 't':
                                case 'y':
                                case 'o':
                                case 's':
                                    if (areModifiersActive(`function-${f}`))
                                        p.addClass(`function-${letter}`);
                                    break;
                                case 'b':
                                case 'i':
                                    if (areOverlaysActive(`function-${f}`))
                                        p.addClass(`function-${letter}`);
                                    break;
                                case 'w':
                                    if (areOverlaysActive(`function-${f}`))
                                        if (isWarningActive(`function-${f}`))
                                            p.addClass(`function-${letter}`);
                                    break;
                                case 'v':
                                    if (areOverlaysActive(`function-${f}`))
                                        if (isVtxActive(`function-${f}`))
                                            p.addClass(`function-${letter}`);
                                    break;
                                }
                            }
                        });
                    }
                });
            } else {
                $('.ui-selected').removeClass(`function-${letter}`);
            }
            return $(that).is(':checked');
        }

        // UI: check-box toggle
        $('.checkbox').on('change', function(e) {
            if (e.originalEvent) {
                // user-triggered event
                const that = $(this).find('input');

                //disable Blink always or Larson scanner, both functions are not working properly at the same time
                if (that.is('.function-o')) {
                    const blink = $('.checkbox .function-b');
                    if (blink.is(':checked')) {
                        blink.prop('checked', false);
                        blink.trigger('change');
                        toggleSwitch(blink, 'b');
                    }
                } else if (that.is('.function-b')) {
                    const larson = $('.checkbox .function-o');
                    if ($('.checkbox .function-o').is(':checked')) {
                        larson.prop('checked', false);
                        larson.trigger('change');
                        toggleSwitch(larson, 'o');
                    }
                }

                //Change Rainbow slider visibility
                if (that.is('.function-y')) {
                    $('.rainbowSlidersDiv').toggle(that.is(':checked'));
                }

                if ($('.ui-selected').length > 0) {
                    TABS.led_strip.overlays.forEach(function(letter) {
                        if ($(that).is(functionTag + letter)) {
                             toggleSwitch(that, letter);
                        }
                    });

                    clearModeColorSelection();
                    updateBulkCmd();
                    setOptionalGroupsVisibility();
                }
            } else {
                // code-triggered event
            }
        });

        $('.mainGrid').disableSelection();

        $('.gPoint').each(function(){
            const gridNumber = ($(this).index() + 1);
            const row = Math.ceil(gridNumber / 16) - 1;
            let col = gridNumber / 16 % 1 * 16 - 1;
            if (col < 0) {
                col = 15;
            }

            const ledResult = findLed(col, row);
            if (!ledResult) {
                return;
            }

            const ledIndex = ledResult.index;
            const led = ledResult.led;

            if (led.functions[0] == 'c' && led.functions.length == 1 && led.directions.length == 0 && led.color == 0 && led.x == 0 && led.y == 0) {
                return;
            }

            $(this).find('.wire').html(ledIndex);

            for (let modeIndex = 0; modeIndex < led.functions.length; modeIndex++) {
                $(this).addClass(`function-${led.functions[modeIndex]}`);
            }

            for (let directionIndex = 0; directionIndex < led.directions.length; directionIndex++) {
                $(this).addClass(`dir-${led.directions[directionIndex]}`);
            }

            $(this).addClass(`color-${led.color}`);
        });

        //default slider values
        $('div.brightnessSlider input').first().prop('value', FC.LED_CONFIG_VALUES.brightness);
        $('div.brightnessSlider label').first().text($('div.brightnessSlider input').first().val());
        $('div.rainbowDeltaSlider input').first().prop('value', FC.LED_CONFIG_VALUES.rainbow_delta);
        $('div.rainbowDeltaSlider label').first().text($('div.rainbowDeltaSlider input').first().val());
        $('div.rainbowFreqSlider input').first().prop('value', FC.LED_CONFIG_VALUES.rainbow_freq);
        $('div.rainbowFreqSlider label').first().text($('div.rainbowFreqSlider input').first().val());

        //Brightness slider
        let bufferingBrightness = [],
        buffer_delay_brightness = false;

        $('div.brightnessSlider input').on('input', function () {
            const val = $(this).val();
            bufferingBrightness.push(val);

            if (!buffer_delay_brightness) {
                buffer_delay_brightness = setTimeout(function () {
                    FC.LED_CONFIG_VALUES.brightness = bufferingBrightness.pop();
                    mspHelper.sendLedStripConfigValues();

                    bufferingBrightness = [];
                    buffer_delay_brightness = false;
                }, 10);
            }

            $('div.brightnessSlider label').first().text(val);
        });

        //Rainbow Delta slider
        let bufferingRainbowDelta = [],
        buffer_delay_rainbow_delta = false;

        $('div.rainbowDeltaSlider input').on('input', function () {
            const val = $(this).val();
            bufferingRainbowDelta.push(val);

            if (!buffer_delay_rainbow_delta) {
                buffer_delay_rainbow_delta = setTimeout(function () {
                    FC.LED_CONFIG_VALUES.rainbow_delta = bufferingRainbowDelta.pop();
                    mspHelper.sendLedStripConfigValues();

                    bufferingRainbowDelta = [];
                    buffer_delay_rainbow_delta = false;
                }, 10);
            }

            $('div.rainbowDeltaSlider label').first().text(val);
        });

        //Rainbow Frequency slider
        let bufferingRainbowFreq = [],
        buffer_delay_rainbow_freq = false;

        $('div.rainbowFreqSlider input').on('input', function () {
            const val = $(this).val();
            bufferingRainbowFreq.push(val);

            if (!buffer_delay_rainbow_freq) {
                buffer_delay_rainbow_freq = setTimeout(function () {
                    FC.LED_CONFIG_VALUES.rainbow_freq = bufferingRainbowFreq.pop();
                    mspHelper.sendLedStripConfigValues();

                    bufferingRainbowFreq = [];
                    buffer_delay_rainbow_freq = false;
                }, 10);
            }

            $('div.rainbowFreqSlider label').first().text(val);
        });


        $('a.save').on('click', function () {
            const saveButton = $('a.save');
            const oldText = saveButton.text();
            saveButton.html(i18n.getMessage('buttonSaving')).addClass('disabled');

            mspHelper.sendLedStripConfig(send_led_strip_colors);

            function send_led_strip_colors() {
                mspHelper.sendLedStripColors(send_led_strip_mode_colors);
            }

            function send_led_strip_mode_colors() {
                mspHelper.sendLedStripModeColors(save_to_eeprom);
            }

            function save_to_eeprom() {
                mspHelper.writeConfiguration(false, save_completed);
            }

            function save_completed() {
                const buttonDelay = 1500;

                 // Allow firmware to make relevant changes before initialization
                setTimeout(() => {
                    saveButton.html(i18n.getMessage('buttonSaved'));

                    setTimeout(() => {
                        saveButton.html(oldText).removeClass('disabled');
                    }, buttonDelay);
                }, buttonDelay);
            }
        });

        colorDefineSliders.hide();

        applyFunctionToSelectedLeds();
        drawColorBoxesInColorLedPoints();
        setOptionalGroupsVisibility();

        updateBulkCmd();

        if ($(window).width() < 575) {
            const gridZoom = $('.tab_title').width() / 496;
            $('.mainGrid, .gridSections').css('zoom', gridZoom);
        }

        GUI.content_ready(callback);
    }

    function findLed(x, y) {
        for (let ledIndex = 0; ledIndex < FC.LED_STRIP.length; ledIndex++) {
            const led = FC.LED_STRIP[ledIndex];
            if (led.x == x && led.y == y) {
                return { index: ledIndex, led: led };
            }
        }
        return undefined;
    }

    function updateBulkCmd() {
        const ledStripLength = FC.LED_STRIP.length;

        FC.LED_STRIP = [];

        $('.gPoint').each(function(){
            if ($(this).is('[class*="function"]')) {
                const gridNumber = ($(this).index() + 1);
                const row = Math.ceil(gridNumber / 16) - 1;
                let col = gridNumber/16 % 1 * 16 - 1;
                if (col < 0) {col = 15;}

                const wireNumber = $(this).find('.wire').html();
                let functions = '';
                let directions = '';
                let colorIndex = 0;
                const that = this;

                const match = $(this).attr("class").match(/(^|\s)color-([0-9]+)(\s|$)/);
                if (match) {
                    colorIndex = match[2];
                }

                TABS.led_strip.baseFuncs.forEach(function(letter){
                    if ($(that).is(functionTag + letter)) {
                        functions += letter;
                    }
                });
                TABS.led_strip.overlays.forEach(function(letter){
                    if ($(that).is(functionTag + letter)) {
                        functions += letter;
                    }
                });

                TABS.led_strip.directions.forEach(function(letter){
                    if ($(that).is(`.dir-${letter}`)) {
                        directions += letter;
                    }
                });

                if (wireNumber != '') {
                    const led = {
                        x: col,
                        y: row,
                        directions: directions,
                        functions: functions,
                        color: colorIndex,
                    };

                    FC.LED_STRIP[wireNumber] = led;
                }
            }
        });

        const defaultLed = {
            x: 0,
            y: 0,
            directions: '',
            functions: '',
        };

        for (let i = 0; i < ledStripLength; i++) {
            if (FC.LED_STRIP[i]) {
                continue;
            }
            FC.LED_STRIP[i] = defaultLed;
        }

        const usedWireNumbers = buildUsedWireNumbers();

        const remaining = FC.LED_STRIP.length - usedWireNumbers.length;

        $('.wires-remaining div').html(remaining);
    }

    // refresh mode color buttons
    function setModeBackgroundColor(element) {
        element.find('[class*="mode_color"]').each(function() {
            let m = 0;
            let d = 0;

            const match = $(this).attr("class").match(/(^|\s)mode_color-([0-9]+)-([0-9]+)(\s|$)/);
            if (match) {
                m = Number(match[2]);
                d = Number(match[3]);
                $(this).css('background-color', HsvToColor(FC.LED_COLORS[getModeColor(m, d)]));
            }
        });
    }

    function setBackgroundColor(element) {
        if (element.is('[class*="color"]')) {
            let colorIndex = 0;

            const match = element.attr("class").match(/(^|\s)color-([0-9]+)(\s|$)/);
            if (match) {
                colorIndex = match[2];
                element.css('background-color', HsvToColor(FC.LED_COLORS[colorIndex]));
            }
        }
    }

    function areModifiersActive(activeFunction) {
        switch (activeFunction) {
            case "function-c":
            case "function-a":
            case "function-f":
                return true;
            default:
                break;
        }
        return false;
    }

    function areOverlaysActive(activeFunction) {
        switch (activeFunction) {
            case "":
            case "function-c":
            case "function-a":
            case "function-f":
            case "function-s":
            case "function-l":
            case "function-r":
            case "function-y":
            case "function-o":
            case "function-b":
            case "function-g":
                return true;
            default:
                break;
        }
        return false;
    }

    function isRainbowActive(activeFunction) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            switch (activeFunction) {
                case "function-c":
                case "function-a":
                case "function-f":
                    return true;
                default:
                    break;
            }
        }
        return false;
    }

    function isWarningActive(activeFunction) {
        switch (activeFunction) {
            case "function-l":
            case "function-s":
            case "function-g":
                return false;
            case "function-r":
            case "function-b":
            default:
                return true;
        }
    }

    function isVtxActive(activeFunction) {
        switch (activeFunction) {
            case "function-v":
            case "function-c":
            case "function-a":
            case "function-f":
                return true;
            default:
                return false;
        }
    }

    function setOptionalGroupsVisibility() {

        const activeFunction = $('select.functionSelect').val();
        $('select.functionSelect').addClass(activeFunction);

        // set color modifiers (check-boxes) visibility
        $('.overlays').toggle(areOverlaysActive(activeFunction));

        $('.modifiers').toggle(areModifiersActive(activeFunction));

        $('.rainbowOverlay').toggle(isRainbowActive(activeFunction));

        $('.warningOverlay').toggle(isWarningActive(activeFunction));

        $('.vtxOverlay').toggle(isVtxActive(activeFunction));

        $('.brightnessSliderDiv').toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46));

        // set mode colors visibility
        if (activeFunction === "function-f") {
            $('.mode_colors').show();
        }
        else {
            $('.mode_colors').hide();
        }

        // set special colors visibility
        $('.special_colors').show();
        $('.mode_color-6-0').hide();
        $('.mode_color-6-1').hide();
        $('.mode_color-6-2').hide();
        $('.mode_color-6-3').hide();
        $('.mode_color-6-4').hide();
        $('.mode_color-6-5').hide();
        $('.mode_color-6-6').hide();
        $('.mode_color-6-7').hide();

        switch (activeFunction) {
            case "":           // none
            case "function-f": // Modes & Orientation
            case "function-l": // Battery
                // $('.mode_color-6-3').show(); // background
                $('.special_colors').hide();
                break;
            case "function-g": // GPS
                $('.mode_color-6-5').show(); // no sats
                $('.mode_color-6-6').show(); // no lock
                $('.mode_color-6-7').show(); // locked
                // $('.mode_color-6-3').show(); // background
                break;
            case "function-b": // Blink
                $('.mode_color-6-4').show(); // blink background
                break;
            case "function-a": // Arm state
                $('.mode_color-6-0').show(); // disarmed
                $('.mode_color-6-1').show(); // armed
                break;

            case "function-r": // Ring
            default:
                $('.special_colors').hide();
            break;
        }
    }

    function applyFunctionToSelectedLeds() {
        const activeFunction = $('select.functionSelect').val();
        TABS.led_strip.baseFuncs.forEach(function(letter) {

            if (activeFunction == `function-${letter}`) {
                $('select.functionSelect').addClass(`function-${letter}`);

                $('.ui-selected').find('.wire').each(function() {
                    if ($(this).text() != "")
                        $(this).parent().addClass(`function-${letter}`);
                });

                unselectOverlays(letter);

            } else {
                $('select.functionSelect').removeClass(`function-${letter}`);
                $('.ui-selected').removeClass(`function-${letter}`);
            }

            if (activeFunction == '') {
                unselectOverlays(activeFunction);
            }

        });
    }

    function unselectOverlays(letter) {
        // MSP 1.20
        if (letter == 'r' || letter == '') {
            unselectOverlay(letter, 'y');
            unselectOverlay(letter, 'o');
            unselectOverlay(letter, 'b');
            unselectOverlay(letter, 't');
        }
        if (letter == 'l' || letter == 'g' || letter == 's') {
            unselectOverlay(letter, 'w');
            unselectOverlay(letter, 'v');
            unselectOverlay(letter, 't');
            unselectOverlay(letter, 'y');
            unselectOverlay(letter, 'o');
            unselectOverlay(letter, 'b');
        }
    }

    function unselectOverlay(func, overlay) {
        $(`input.function-${overlay}`).prop('checked', false);
        $(`input.function-${overlay}`).trigger('change');
        $('.ui-selected').each(function() {
            if (func === '' || $(this).is(functionTag + func)) {
                $(this).removeClass(`function-${overlay}`);
            }
        });
    }

    function updateColors(value, hsvIndex) {
        let change = false;

        value = Number(value);

        const className = `.color-${selectedColorIndex}`;
        if ($(className).hasClass('btnOn')) {
            switch (hsvIndex) {
                case 0:
                    if (FC.LED_COLORS[selectedColorIndex].h != value) {
                        FC.LED_COLORS[selectedColorIndex].h = value;
                        $('.colorDefineSliderValue.Hvalue').text(FC.LED_COLORS[selectedColorIndex].h);
                        change = true;
                    }
                    break;
                case 1:
                    if (FC.LED_COLORS[selectedColorIndex].s != value) {
                        FC.LED_COLORS[selectedColorIndex].s = value;
                        $('.colorDefineSliderValue.Svalue').text(FC.LED_COLORS[selectedColorIndex].s);
                        change = true;
                    }
                    break;
                case 2:
                    if (FC.LED_COLORS[selectedColorIndex].v != value) {
                        FC.LED_COLORS[selectedColorIndex].v = value;
                        $('.colorDefineSliderValue.Vvalue').text(FC.LED_COLORS[selectedColorIndex].v);
                        change = true;
                    }
                    break;
            }
        }

        // refresh color buttons
        $('.colors').children().each(function() { setBackgroundColor($(this)); });
        $('.overlay-color').each(function() { setBackgroundColor($(this)); });

        $('.mode_colors').each(function() { setModeBackgroundColor($(this)); });
        $('.special_colors').each(function() { setModeBackgroundColor($(this)); });

        if (change)
            updateBulkCmd();
    }

    function drawColorBoxesInColorLedPoints() {
        $('.gPoint').each(function() {
            if ($(this).is('.function-c') || $(this).is('.function-r') || $(this).is('.function-b')) {
                $(this).find('.overlay-color').show();

                for (let colorIndex = 0; colorIndex < 16; colorIndex++) {
                    const className = `color-${colorIndex}`;
                    if ($(this).is(`.${className}`)) {
                        $(this).find('.overlay-color').addClass(className);
                        $(this).find('.overlay-color').css('background-color', HsvToColor(FC.LED_COLORS[colorIndex]));
                    } else {
                        if ($(this).find('.overlay-color').is(`.${className}`))
                            $(this).find('.overlay-color').removeClass(className);
                    }
                }
            } else {
                $(this).find('.overlay-color').hide();
            }
        });
    }

    function setColorSliders(colorIndex) {

        const sliders = $('div.colorDefineSliders input');
        let change = false;

        if (!FC.LED_COLORS[colorIndex])
            return;

        if (FC.LED_COLORS[colorIndex].h != Number(sliders.eq(0).val())) {
            sliders.eq(0).val(FC.LED_COLORS[colorIndex].h);
            $('.colorDefineSliderValue.Hvalue').text(FC.LED_COLORS[colorIndex].h);
            change = true;
        }

        if (FC.LED_COLORS[colorIndex].s != Number(sliders.eq(1).val())) {
            sliders.eq(1).val(FC.LED_COLORS[colorIndex].s);
            $('.colorDefineSliderValue.Svalue').text(FC.LED_COLORS[colorIndex].s);
            change = true;
        }

        if (FC.LED_COLORS[colorIndex].v != Number(sliders.eq(2).val())) {
            sliders.eq(2).val(FC.LED_COLORS[colorIndex].v);
            $('.colorDefineSliderValue.Vvalue').text(FC.LED_COLORS[colorIndex].v);
            change = true;
        }

        // only fire events when all values are set
        if (change)
            sliders.trigger('input');
    }

    function HsvToColor(input) {
        if (input == undefined)
            return "";

        let HSV = { h:Number(input.h), s:Number(input.s), v:Number(input.v) };

        if (HSV.s == 0 && HSV.v == 0)
            return "";

        HSV = { h:HSV.h, s:1 - HSV.s / 255, v:HSV.v / 255 };

        const HSL = { h:0, s:0, v:0};
        HSL.h = HSV.h;
        HSL.l = (2 - HSV.s) * HSV.v / 2;
        HSL.s = HSL.l && HSL.l < 1 ? HSV.s * HSV.v / (HSL.l < 0.5 ? HSL.l * 2 : 2 - HSL.l * 2) : HSL.s;

        return `hsl(${HSL.h},${HSL.s * 100}%,${HSL.l * 100}%)`;
    }

    function getModeColor(mode, dir) {
        for (const mc of FC.LED_MODE_COLORS) {
            if (mc.mode === mode && mc.direction === dir) {
                return mc.color;
            }
        }
        return 3; //index of Throttle, use as default
    }

    function setModeColor(mode, dir, color) {
        for (const mc of FC.LED_MODE_COLORS) {
            if (mc.mode === mode && mc.direction === dir) {
                mc.color = color;
                return 1;
            }
        }
        return 0;
    }

    function clearModeColorSelection() {
        selectedModeColor = null;
        $('.mode_colors').each(function() {
            $(this).children().each(function() {
                if ($(this).is('.btnOn')) {
                    $(this).removeClass('btnOn');
                }
            });
        });
    }
};

led_strip.cleanup = function (callback) {
    if (callback) callback();
};

TABS.led_strip = led_strip;
export {
    led_strip,
};
