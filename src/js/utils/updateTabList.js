import $ from "jquery";
import FC from "../fc";

export function updateTabList(features) {
    const isExpertModeEnabled = $('input[name="expertModeCheckbox"]').is(":checked");

    $("#tabs ul.mode-connected li.tab_failsafe").toggle(isExpertModeEnabled);
    $("#tabs ul.mode-connected li.tab_adjustments").toggle(isExpertModeEnabled);
    $("#tabs ul.mode-connected li.tab_sensors").toggle(isExpertModeEnabled);
    $("#tabs ul.mode-connected li.tab_logging").toggle(isExpertModeEnabled);
    $("#tabs ul.mode-connected li.tab_servos").toggle(
        ["USE_SERVOS", "USE_WING"].some((option) => FC.CONFIG?.buildOptions?.includes(option)),
    );

    $("#tabs ul.mode-connected li.tab_gps").toggle(FC.CONFIG?.buildOptions?.includes("USE_GPS"));
    $("#tabs ul.mode-connected li.tab_led_strip").toggle(features.isEnabled("LED_STRIP"));
    $("#tabs ul.mode-connected li.tab_transponder").toggle(features.isEnabled("TRANSPONDER"));
    $("#tabs ul.mode-connected li.tab_osd").toggle(features.isEnabled("OSD"));
}
