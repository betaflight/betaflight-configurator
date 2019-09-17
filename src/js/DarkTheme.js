'use strict';

var css_dark = [
    './css/main-dark.css',
    './css/tabs-dark/landing-dark.css',
    './css/tabs-dark/setup-dark.css',
    './css/tabs-dark/help-dark.css',
    './css/tabs-dark/ports-dark.css',
    './css/tabs-dark/configuration-dark.css',
    './css/tabs-dark/pid_tuning-dark.css',
    './css/tabs-dark/receiver-dark.css',
    './css/tabs-dark/servos-dark.css',
    './css/tabs-dark/gps-dark.css',
    './css/tabs-dark/motors-dark.css',
    './css/tabs-dark/led_strip-dark.css',
    './css/tabs-dark/sensors-dark.css',
    './css/tabs-dark/cli-dark.css',
    './css/tabs-dark/logging-dark.css',
    './css/tabs-dark/onboard_logging-dark.css',
    './css/tabs-dark/firmware_flasher-dark.css',
    './css/tabs-dark/adjustments-dark.css',
    './css/tabs-dark/auxiliary-dark.css',
    './css/tabs-dark/failsafe-dark.css',
    './css/tabs-dark/osd-dark.css',
    './css/tabs-dark/power-dark.css',
    './css/tabs-dark/transponder-dark.css',
]

var DarkTheme = {
    configEnabled: undefined,
};
DarkTheme.isDarkThemeEnabled = function (val) {
    return val === 0 || val === 2 && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
DarkTheme.setConfig = function (result) {
    if (this.configEnabled != result) {
        this.configEnabled = result;

        if (this.isDarkThemeEnabled(this.configEnabled)) {
            this.applyDark();
        } else {
            this.applyNormal();
        }

        windowWatcherUtil.passValue(chrome.app.window.get("receiver_msp"), 'darkTheme', this.isDarkThemeEnabled(this.configEnabled));

    }
};

DarkTheme.applyDark = function () {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', false));
};

DarkTheme.applyNormal = function () {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', true));
};
