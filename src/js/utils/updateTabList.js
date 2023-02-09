import semver from "semver";
import { API_VERSION_1_42, API_VERSION_1_45 } from "../data_storage";
import FC from "../fc";

export function updateTabList(features) {
    const isExpertModeEnabled = $('input[name="expertModeCheckbox"]').is(':checked');

    $('#tabs ul.mode-connected li.tab_failsafe').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_adjustments').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_servos').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_sensors').toggle(isExpertModeEnabled);
    $('#tabs ul.mode-connected li.tab_logging').toggle(isExpertModeEnabled);

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45 || FC.CONFIG.buildKey.length !== 32)) {
        $('#tabs ul.mode-connected li.tab_gps').toggle(features.isEnabled('GPS'));
        $('#tabs ul.mode-connected li.tab_led_strip').toggle(features.isEnabled('LED_STRIP'));
        $('#tabs ul.mode-connected li.tab_servos').toggle(features.isEnabled('CHANNEL_FORWARDING') || features.isEnabled('SERVO_TILT'));
        $('#tabs ul.mode-connected li.tab_transponder').toggle(features.isEnabled('TRANSPONDER'));
        $('#tabs ul.mode-connected li.tab_osd').toggle(features.isEnabled('OSD'));
        $('#tabs ul.mode-connected li.tab_vtx').toggle(features.isEnabled('VTX') && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42));
    }
}
