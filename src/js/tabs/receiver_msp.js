import '../jqueryPlugins';
import windowWatcherUtil from "../utils/window_watchers";
import $ from 'jquery';

// This is a hack to get the i18n var of the parent, but the i18n.localizePage not works
// It seems than when node opens a new window, the module "context" is different, so the i18n var is not initialized
const i18n = opener.i18n;

const css_dark = [
    '/css/dark-theme.css',
];

const CHANNEL_MIN_VALUE = 1000;
const CHANNEL_MID_VALUE = 1500;
const CHANNEL_MAX_VALUE = 2000;

    // What's the index of each channel in the MSP channel list?
const channelMSPIndexes = {
    Roll: 0,
    Pitch: 1,
    Throttle: 2,
    Yaw: 3,
    Aux1: 4,
    Aux2: 5,
    Aux3: 6,
    Aux4: 7,
};

    // Set reasonable initial stick positions (Mode 2)
const stickValues = {
    Throttle: CHANNEL_MIN_VALUE,
    Pitch: CHANNEL_MID_VALUE,
    Roll: CHANNEL_MID_VALUE,
    Yaw: CHANNEL_MID_VALUE,
    Aux1: CHANNEL_MIN_VALUE,
    Aux2: CHANNEL_MIN_VALUE,
    Aux3: CHANNEL_MIN_VALUE,
    Aux4: CHANNEL_MIN_VALUE,
};

    // First the vertical axis, then the horizontal:
const gimbals = [
    ["Throttle", "Yaw"],
    ["Pitch", "Roll"],
];

let gimbalElems;
let sliderElems;
let enableTX = false;

const watchers = {
    darkTheme: (val) => {
        if (val) {
            applyDarkTheme();
        } else {
            applyNormalTheme();
        }
    },
};

function transmitChannels() {
    const channelValues = [0, 0, 0, 0, 0, 0, 0, 0];

    if (!enableTX) {
        return;
    }

    for (const stickName in stickValues) {
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
    for (const stickName in stickValues) {
        const stickValue = stickValues[stickName];

        // Look for the gimbal which corresponds to this stick name
        for (const gimbalIndex in gimbals) {
            const gimbal = gimbals[gimbalIndex],
                gimbalElem = gimbalElems.get(gimbalIndex),
                gimbalSize = $(gimbalElem).width(),
                stickElem = $(".control-stick", gimbalElem);

            if (gimbal[0] === stickName) {
                stickElem.css('top', `${(1.0 - channelValueToStickPortion(stickValue)) * gimbalSize}px`);
                break;
            } else if (gimbal[1] === stickName) {
                stickElem.css('left', `${channelValueToStickPortion(stickValue) * gimbalSize}px`);
                break;
            }
        }
    }
}

function handleGimbalMouseDrag(e) {
    const gimbal = $(gimbalElems.get(e.data.gimbalIndex)),
        gimbalOffset = gimbal.offset(),
        gimbalSize = gimbal.width();

    stickValues[gimbals[e.data.gimbalIndex][0]] = stickPortionToChannelValue(1.0 - (e.pageY - gimbalOffset.top) / gimbalSize);
    stickValues[gimbals[e.data.gimbalIndex][1]] = stickPortionToChannelValue((e.pageX - gimbalOffset.left) / gimbalSize);

    updateControlPositions();
}

function localizePage() {
    $('[i18n]:not(.i18n-replaced)').each(function() {
        const element = $(this);

        element.html(i18n.getMessage(element.attr('i18n')));
        element.addClass('i18n-replaced');
    });
}

function localizeAxisNames() {
    for (const gimbalIndex in gimbals) {
        const gimbal = gimbalElems.get(gimbalIndex);

        $(".gimbal-label-vert", gimbal).text(i18n.getMessage(`controlAxis${gimbals[gimbalIndex][0]}`));
        $(".gimbal-label-horz", gimbal).text(i18n.getMessage(`controlAxis${gimbals[gimbalIndex][1]}`));
    }

    for (let sliderIndex = 0; sliderIndex < 4; sliderIndex++) {
        $(".slider-label", sliderElems.get(sliderIndex)).text(i18n.getMessage(`controlAxisAux${sliderIndex + 1}`));
    }
}

function applyDarkTheme() {
    css_dark.forEach((el) => $(`link[href="${el}"]`).prop('disabled', false));
}

function applyNormalTheme() {
    css_dark.forEach((el) => $(`link[href="${el}"]`).prop('disabled', true));
}

$(".button-enable .btn").on("click", function() {
    const shrinkHeight = $(".warning").height();

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
        if (e.button === 0) { // Only move sticks on left mouse button
            handleGimbalMouseDrag(e);

            $(window).on('mousemove', {gimbalIndex: gimbalIndex}, handleGimbalMouseDrag);
        }
    });
});

$(".slider", sliderElems).each(function(sliderIndex) {
    const initialValue = stickValues[`Aux${sliderIndex + 1}`];

    $(this)
        .noUiSlider({
            start: initialValue,
            range: {
                min: CHANNEL_MIN_VALUE,
                max: CHANNEL_MAX_VALUE,
            },
        }).on('slide change set', function(e, value) {
            value = Math.round(parseFloat(value));

            stickValues[`Aux${(sliderIndex + 1)}`] = value;

            $(".tooltip", this).text(value);
        });

    $(this).append('<div class="tooltip"></div>');

    $(".tooltip", this).text(initialValue);
});

/*
 * Mouseup handler needs to be bound to the window in order to receive mouseup if mouse leaves window.
 */
$(window).on("mouseup", function(e) {
    $(this).off('mousemove', handleGimbalMouseDrag);
});

windowWatcherUtil.bindWatchers(window, watchers);

localizePage();
localizeAxisNames();

updateControlPositions();

setInterval(transmitChannels, 50);
