import $ from 'jquery';

export function updateTabList(features) {
    const isExpertModeEnabled = $('input[name="expertModeCheckbox"]').is(':checked');

    $('#tabs ul.mode-connected li.tab_failsafe').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_adjustments').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_sensors').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_logging').toggle(isExpertModeEnabled);

    $('#tabs ul.mode-connected li.tab_servos').toggle(features.isEnabled('CHANNEL_FORWARDING') || features.isEnabled('SERVO_TILT'));
    $('#tabs ul.mode-connected li.tab_gps').toggle(features.isEnabled('GPS'));
    $('#tabs ul.mode-connected li.tab_led_strip').toggle(features.isEnabled('LED_STRIP'));
    $('#tabs ul.mode-connected li.tab_transponder').toggle(features.isEnabled('TRANSPONDER'));
    $('#tabs ul.mode-connected li.tab_osd').toggle(features.isEnabled('OSD'));
}
