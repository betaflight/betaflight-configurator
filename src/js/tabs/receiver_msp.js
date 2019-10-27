"use strict";

let css_dark = [
    '/css/dark-theme.css'
  ];


var
    CHANNEL_MIN_VALUE = 1000,
    CHANNEL_MID_VALUE = 1500,
    CHANNEL_MAX_VALUE = 2000,

    // What's the index of each channel in the MSP channel list?
    channelMSPIndexes = {
        Roll: 0,
        Pitch: 1,
        Throttle: 2,
        Yaw: 3,
        Aux1: 4,
        Aux2: 5,
        Aux3: 6,
        Aux4: 7,
    },

    // Set reasonable initial stick positions (Mode 2)
    stickValues = {
        Throttle: CHANNEL_MIN_VALUE,
        Pitch: CHANNEL_MID_VALUE,
        Roll: CHANNEL_MID_VALUE,
        Yaw: CHANNEL_MID_VALUE,
        Aux1: CHANNEL_MIN_VALUE,
        Aux2: CHANNEL_MIN_VALUE,
        Aux3: CHANNEL_MIN_VALUE,
        Aux4: CHANNEL_MIN_VALUE
    },

    // First the vertical axis, then the horizontal:
    gimbals = [
        ["Throttle", "Yaw"],
        ["Pitch", "Roll"],
    ],

    gimbalElems,
    sliderElems,

    enableTX = false;

// This is a hack to get the i18n var of the parent, but the localizePage not works
const i18n = opener.i18n;

let watchers = {
    darkTheme: (val) => {
        if (val) {
            applyDarkTheme();
        } else {
            applyNormalTheme();
        }
    }
};

$(document).ready(function () {
    $('[i18n]:not(.i18n-replaced)').each(function() {
        var element = $(this);

        element.html(i18n.getMessage(element.attr('i18n')));
        element.addClass('i18n-replaced');
    });

    windowWatcherUtil.bindWatchers(window, watchers);
});

function transmitChannels() {
    var
        channelValues = [0, 0, 0, 0, 0, 0, 0, 0];

    if (!enableTX) {
        return;
    }

    for (var stickName in stickValues) {
        channelValues[channelMSPIndexes[stickName]] = stickValues[stickName];
    }

    // Callback given to us by the window creator so we can have it send data over MSP for us:
    if (!window.setRawRx(channelValues)) {
        // MSP connection has gone away
        chrome.app.window.current().close();
    }
}

function stickPortionToChannelValue(portion) {
    portion = Math.min(Math.max(portion, 0.0), 1.0);

    return Math.round(portion * (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE) + CHANNEL_MIN_VALUE);
}

function channelValueToStickPortion(channel) {
    return (channel - CHANNEL_MIN_VALUE) / (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE);
}

function updateControlPositions() {
    for (var stickName in stickValues) {
        var
            stickValue = stickValues[stickName];

        // Look for the gimbal which corresponds to this stick name
        for (var gimbalIndex in gimbals) {
            var
                gimbal = gimbals[gimbalIndex],
                gimbalElem = gimbalElems.get(gimbalIndex),
                gimbalSize = $(gimbalElem).width(),
                stickElem = $(".control-stick", gimbalElem);

            if (gimbal[0] == stickName) {
                stickElem.css('top', (1.0 - channelValueToStickPortion(stickValue)) * gimbalSize + "px");
                break;
            } else if (gimbal[1] == stickName) {
                stickElem.css('left', channelValueToStickPortion(stickValue) * gimbalSize + "px");
                break;
            }
        }
    }
}

function handleGimbalMouseDrag(e) {
    var
        gimbal = $(gimbalElems.get(e.data.gimbalIndex)),
        gimbalOffset = gimbal.offset(),
        gimbalSize = gimbal.width();

    stickValues[gimbals[e.data.gimbalIndex][0]] = stickPortionToChannelValue(1.0 - (e.pageY - gimbalOffset.top) / gimbalSize);
    stickValues[gimbals[e.data.gimbalIndex][1]] = stickPortionToChannelValue((e.pageX - gimbalOffset.left) / gimbalSize);

    updateControlPositions();
}

function localizeAxisNames() {
    for (var gimbalIndex in gimbals) {
        var
            gimbal = gimbalElems.get(gimbalIndex);

        $(".gimbal-label-vert", gimbal).text(i18n.getMessage("controlAxis" + gimbals[gimbalIndex][0]));
        $(".gimbal-label-horz", gimbal).text(i18n.getMessage("controlAxis" + gimbals[gimbalIndex][1]));
    }

    for (var sliderIndex = 0; sliderIndex < 4; sliderIndex++) {
        $(".slider-label", sliderElems.get(sliderIndex)).text(i18n.getMessage("controlAxisAux" + (sliderIndex + 1)));
    }
}

function applyDarkTheme() {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', false));
};

function applyNormalTheme() {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', true));
};

$(document).ready(function() {
    $(".button-enable .btn").click(function() {
        var
            shrinkHeight = $(".warning").height();

        $(".warning").slideUp("short", function() {
            chrome.app.window.current().innerBounds.minHeight -= shrinkHeight;
            chrome.app.window.current().innerBounds.height -= shrinkHeight;
            chrome.app.window.current().innerBounds.maxHeight -= shrinkHeight;
        });

        enableTX = true;
    });

    gimbalElems = $(".control-gimbal");
    sliderElems = $(".control-slider");

    gimbalElems.each(function(gimbalIndex) {
        $(this).on('mousedown', {gimbalIndex: gimbalIndex}, function(e) {
            if (e.which == 1) { // Only move sticks on left mouse button
                handleGimbalMouseDrag(e);

                $(window).on('mousemove', {gimbalIndex: gimbalIndex}, handleGimbalMouseDrag);
            }
        });
    });

    $(".slider", sliderElems).each(function(sliderIndex) {
        var
            initialValue = stickValues["Aux" + (sliderIndex + 1)];

        $(this)
            .noUiSlider({
                start: initialValue,
                range: {
                    min: CHANNEL_MIN_VALUE,
                    max: CHANNEL_MAX_VALUE
                }
            }).on('slide change set', function(e, value) {
                value = Math.round(parseFloat(value));

                stickValues["Aux" + (sliderIndex + 1)] = value;

                $(".tooltip", this).text(value);
            });

        $(this).append('<div class="tooltip"></div>');

        $(".tooltip", this).text(initialValue);
    });

    /*
     * Mouseup handler needs to be bound to the window in order to receive mouseup if mouse leaves window.
     */
    $(window).mouseup(function(e) {
        $(this).off('mousemove', handleGimbalMouseDrag);
    });

    localizeAxisNames();

    updateControlPositions();

    setInterval(transmitChannels, 50);
});
